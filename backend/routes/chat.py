"""Chat endpoint — streaming SSE chat with tool-calling via Google Gemini."""

import json
import os

import google.generativeai as genai
from google.generativeai.types import FunctionDeclaration, Tool

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.db.connection import get_db
from backend.tools.field_notes import get_field_notes
from backend.tools.labor_detail import get_labor_detail
from backend.tools.co_detail import get_co_detail
from backend.tools.rfi_detail import get_rfi_detail
from backend.tools.what_if_margin import what_if_margin
from backend.tools.send_email import send_email

router = APIRouter()

# gemini-2.0-flash shut down on 2026-06-01. Google's replacement for that id is gemini-3.6-flash.
MODEL = "gemini-3.6-flash"

# Gemini function declarations (equivalent to OpenAI tool definitions)
GEMINI_TOOLS = [
    Tool(function_declarations=[
        FunctionDeclaration(
            name="get_field_notes",
            description="Search field notes for a project. Can filter by date range and keyword.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "date_from": {"type": "string", "description": "Start date YYYY-MM-DD"},
                    "date_to": {"type": "string", "description": "End date YYYY-MM-DD"},
                    "keyword": {"type": "string", "description": "Keyword to search in note content"},
                },
                "required": ["project_id"],
            },
        ),
        FunctionDeclaration(
            name="get_labor_detail",
            description="Get labor hours and costs for a project, broken down by SOV line and role.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "sov_line_id": {"type": "string", "description": "Optional SOV line ID to filter"},
                },
                "required": ["project_id"],
            },
        ),
        FunctionDeclaration(
            name="get_co_detail",
            description="Get change order details for a project, optionally filtered by CO number.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "co_number": {"type": "string", "description": "Optional CO number to filter"},
                },
                "required": ["project_id"],
            },
        ),
        FunctionDeclaration(
            name="get_rfi_detail",
            description="Get RFI details for a project, optionally filtered by RFI number.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "rfi_number": {"type": "string", "description": "Optional RFI number to filter"},
                },
                "required": ["project_id"],
            },
        ),
        FunctionDeclaration(
            name="what_if_margin",
            description="Run a what-if margin scenario: co_rejected, co_approved, or labor_recovery.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "scenario": {
                        "type": "string",
                        "enum": ["co_rejected", "co_approved", "labor_recovery"],
                        "description": "Scenario to run",
                    },
                    "co_number": {"type": "string", "description": "CO number (required for co_rejected/co_approved)"},
                },
                "required": ["project_id", "scenario"],
            },
        ),
        FunctionDeclaration(
            name="send_email",
            description="Send a margin alert email for a project. Composes and stores the email.",
            parameters={
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "Project ID"},
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Email body (markdown)"},
                },
                "required": ["project_id", "to", "subject", "body"],
            },
        ),
    ])
]

TOOL_DISPATCH = {
    "get_field_notes": get_field_notes,
    "get_labor_detail": get_labor_detail,
    "get_co_detail": get_co_detail,
    "get_rfi_detail": get_rfi_detail,
    "what_if_margin": what_if_margin,
    "send_email": send_email,
}


def _load_dossier_context(project_id: str) -> str:
    """Load the pre-computed dossier JSON as context for the chat."""
    db = get_db()
    row = db.execute(
        "SELECT dossier_json FROM dossiers WHERE project_id = ?",
        [project_id],
    ).fetchone()
    if not row:
        return f"No dossier found for project {project_id}."
    dossier = json.loads(row["dossier_json"])
    for t in dossier.get("triggers", []):
        t.pop("evidence", None)
        if "reasoning" in t:
            t["reasoning"] = {
                "root_cause": t["reasoning"].get("root_cause", ""),
                "confidence": t["reasoning"].get("confidence", ""),
            }
    return json.dumps(dossier, indent=2)


def _build_system_prompt(project_id: str | None) -> str:
    """Build system prompt with optional project context."""
    base = (
        "You are the HVAC Margin Rescue Agent, an expert construction financial analyst. "
        "You help project managers identify and recover margin erosion on commercial HVAC projects.\n\n"
        "Guidelines:\n"
        "- Be direct, concise, and data-driven\n"
        "- Reference specific numbers, dates, and SOV lines\n"
        "- When discussing costs, always use dollar amounts\n"
        "- Suggest concrete recovery actions with estimated dollar impact\n"
        "- Use the available tools to look up live project data when needed\n"
    )

    if project_id and project_id != "PORTFOLIO":
        context = _load_dossier_context(project_id)
        base += f"\nCurrent project dossier (pre-analyzed):\n{context}\n"

    if project_id == "PORTFOLIO" or not project_id:
        db = get_db()
        row = db.execute(
            "SELECT dossier_json FROM dossiers WHERE project_id = 'PORTFOLIO'"
        ).fetchone()
        if row:
            base += f"\nPortfolio summary:\n{row['dossier_json']}\n"

    return base


def _messages_to_gemini(messages: list) -> list:
    """Convert OpenAI-style messages to Gemini contents format."""
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})
    return contents


@router.post("/api/chat")
async def chat(request: Request):
    """Streaming chat endpoint using Google Gemini. Expects JSON: {project_id, messages}."""
    body = await request.json()
    project_id = body.get("project_id")
    messages = body.get("messages", [])

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return {"error": "GOOGLE_API_KEY not set", "reply": _fallback_reply(messages)}

    genai.configure(api_key=api_key)
    system_prompt = _build_system_prompt(project_id)

    model = genai.GenerativeModel(
        model_name=MODEL,
        tools=GEMINI_TOOLS,
        system_instruction=system_prompt,
    )

    contents = _messages_to_gemini(messages)

    async def event_stream():
        current_contents = list(contents)
        max_iterations = 5

        for _ in range(max_iterations):
            response = model.generate_content(current_contents)
            candidate = response.candidates[0]
            parts = candidate.content.parts

            # Check for function calls
            function_calls = [p for p in parts if hasattr(p, "function_call") and p.function_call.name]
            text_parts = [p for p in parts if hasattr(p, "text") and p.text]

            # Stream any text content
            for part in text_parts:
                yield f"data: {json.dumps({'type': 'text', 'content': part.text})}\n\n"

            if not function_calls:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # Append model response to conversation
            current_contents.append({"role": "model", "parts": [p._pb for p in parts]})

            # Execute tool calls and collect results
            function_responses = []
            for part in function_calls:
                fn_name = part.function_call.name
                fn_args = dict(part.function_call.args)

                yield f"data: {json.dumps({'type': 'tool_call', 'name': fn_name, 'input': fn_args})}\n\n"

                fn = TOOL_DISPATCH.get(fn_name)
                if fn:
                    try:
                        result = fn(**fn_args)
                    except Exception as e:
                        result = {"error": str(e)}
                else:
                    result = {"error": f"Unknown tool: {fn_name}"}

                result_str = json.dumps(result)
                if len(result_str) > 8000:
                    result_str = result_str[:8000] + '..."}'

                function_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fn_name,
                            response={"result": result_str},
                        )
                    )
                )

            current_contents.append({"role": "user", "parts": function_responses})

        yield f"data: {json.dumps({'type': 'text', 'content': 'Reached maximum tool call iterations.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _fallback_reply(messages: list) -> str:
    last_msg = messages[-1]["content"] if messages else ""
    return (
        f"I received your question: \"{last_msg[:100]}...\"\n\n"
        "However, GOOGLE_API_KEY is not configured. "
        "Set it in your environment to enable AI chat."
    )
