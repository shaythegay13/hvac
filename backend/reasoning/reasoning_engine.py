"""Reasoning engine — calls Claude Haiku via Anthropic SDK to analyze triggers."""

import json
import os
import re

from backend.reasoning.prompt import build_reasoning_prompt

# Default fallback reasoning when API is unavailable
FALLBACK_REASONING = {
    "root_cause": "Unable to generate AI reasoning — API key not configured.",
    "contributing_factors": ["Automated analysis unavailable"],
    "recovery_actions": ["Review trigger metrics manually"],
    "recoverable_amount": 0,
    "confidence": "LOW",
    "scoring": {
        "financial_impact": 0,
        "recoverability_pct": 0,
        "schedule_risk_days": 0,
    },
}


def _parse_json_response(text):
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Try to find JSON in code blocks first
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))

    # Try to parse the whole response as JSON
    text = text.strip()
    if text.startswith("{"):
        return json.loads(text)

    raise ValueError(f"Could not parse JSON from response: {text[:200]}")


def _build_fallback_from_metrics(trigger):
    """Build reasonable fallback reasoning from trigger metrics alone.

    Accepts both SQLite row dicts (with metrics_json string) and
    JSONL record dicts (with metrics dict already parsed).
    """
    # Support both formats: pre-parsed dict or raw JSON string
    if isinstance(trigger.get("metrics"), dict):
        metrics = trigger["metrics"]
    elif trigger.get("metrics_json"):
        metrics = json.loads(trigger["metrics_json"])
    else:
        metrics = {}
    trigger_type = trigger["type"]

    if trigger_type == "LABOR_OVERRUN":
        overrun_cost = metrics.get("overrun_cost", 0)
        burn_ratio = metrics.get("burn_ratio", 0)
        overrun_pct = metrics.get("overrun_pct", 0)
        recoverable = round(overrun_cost * 0.3)

        return {
            "root_cause": f"Labor hours exceeded estimates by {overrun_pct:.0f}% (burn ratio {burn_ratio}x). "
                          f"Actual hours: {metrics.get('actual_hours', 0):.0f} vs estimated: {metrics.get('estimated_hours', 0):.0f}. "
                          f"This represents ${overrun_cost:,.0f} in cost overrun on this SOV line.",
            "contributing_factors": [
                f"Labor burn ratio of {burn_ratio}x indicates sustained overrun",
                f"Estimated hours of {metrics.get('estimated_hours', 0):.0f} were insufficient for scope",
                "Potential causes: low productivity, scope changes, coordination delays, or rework",
            ],
            "recovery_actions": [
                f"Review field notes for root cause of {overrun_pct:.0f}% overrun",
                "Check for unsubmitted change orders covering additional scope",
                f"Evaluate back-charge opportunity for idle time or delays (~${recoverable:,.0f})",
            ],
            "recoverable_amount": recoverable,
            "confidence": "MEDIUM",
            "scoring": {
                "financial_impact": round(overrun_cost),
                "recoverability_pct": 30,
                "schedule_risk_days": max(3, int(overrun_pct / 10)),
            },
        }

    elif trigger_type == "ORPHAN_RFI":
        days_open = metrics.get("days_open", 0)
        return {
            "root_cause": f"RFI {metrics.get('rfi_number', 'N/A')} flagged cost impact but no change order "
                          f"has been filed after {days_open} days. Subject: {metrics.get('subject', 'N/A')}.",
            "contributing_factors": [
                f"RFI open for {days_open} days without corresponding CO",
                f"Priority: {metrics.get('priority', 'N/A')} — may indicate significant scope impact",
                "Potential revenue leakage if work is being performed without billing authorization",
            ],
            "recovery_actions": [
                f"File change order for RFI {metrics.get('rfi_number', 'N/A')} immediately",
                "Document all work performed related to this RFI",
                "Estimate cost impact and submit to GC for approval",
            ],
            "recoverable_amount": 25000,
            "confidence": "MEDIUM",
            "scoring": {
                "financial_impact": 25000,
                "recoverability_pct": 60,
                "schedule_risk_days": min(days_open, 14),
            },
        }

    elif trigger_type == "PENDING_CO":
        pending_total = metrics.get("pending_total", 0)
        return {
            "root_cause": f"${pending_total:,.0f} in pending change orders ({metrics.get('pending_pct', 0):.1f}% of contract). "
                          f"{metrics.get('co_count', 0)} COs awaiting approval.",
            "contributing_factors": [
                f"Largest pending CO: {metrics.get('largest_co', 'N/A')} at ${metrics.get('largest_amount', 0):,.0f}",
                "Delayed CO approvals create cash flow risk",
                "Work may be proceeding without confirmed payment",
            ],
            "recovery_actions": [
                f"Escalate {metrics.get('largest_co', 'N/A')} for immediate GC review",
                "Compile supporting documentation for all pending COs",
                "Consider halting additional scope work until COs are resolved",
            ],
            "recoverable_amount": round(pending_total * 0.7),
            "confidence": "MEDIUM",
            "scoring": {
                "financial_impact": round(pending_total),
                "recoverability_pct": 70,
                "schedule_risk_days": 7,
            },
        }

    elif trigger_type == "MATERIAL_VARIANCE":
        variance_pct = metrics.get("variance_pct", 0)
        overrun_amount = metrics.get("overrun_amount", 0)
        return {
            "root_cause": f"Material costs exceeded estimate by {variance_pct:.0f}% (${overrun_amount:,.0f} overrun).",
            "contributing_factors": [
                f"Actual: ${metrics.get('actual', 0):,.0f} vs estimated: ${metrics.get('estimated', 0):,.0f}",
                "Potential causes: price escalation, change orders, waste, or theft",
                "Market conditions may have shifted since bid",
            ],
            "recovery_actions": [
                "Review purchase orders against bid estimates",
                "Check for CO-covered material changes",
                f"Negotiate supplier credits for any defective materials (~${round(overrun_amount * 0.2):,.0f})",
            ],
            "recoverable_amount": round(overrun_amount * 0.2),
            "confidence": "MEDIUM",
            "scoring": {
                "financial_impact": round(overrun_amount),
                "recoverability_pct": 20,
                "schedule_risk_days": 3,
            },
        }

    return FALLBACK_REASONING


def reason_about_trigger(trigger, evidence, project_context, use_api=True):
    """
    Generate reasoning for a single trigger.

    Args:
        trigger: row from triggers table
        evidence: dict from evidence_puller
        project_context: dict with project info
        use_api: if True, try Anthropic SDK; if False, use metrics-based fallback

    Returns:
        dict with root_cause, contributing_factors, recovery_actions, etc.
    """
    if not use_api:
        return _build_fallback_from_metrics(trigger)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("    [WARN] No ANTHROPIC_API_KEY — using metrics-based fallback reasoning")
        return _build_fallback_from_metrics(trigger)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        prompt = build_reasoning_prompt(trigger, evidence, project_context)

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text
        reasoning = _parse_json_response(text)

        # Validate required fields
        required = ["root_cause", "contributing_factors", "recovery_actions",
                     "recoverable_amount", "confidence"]
        for field in required:
            if field not in reasoning:
                reasoning[field] = FALLBACK_REASONING[field]

        if "scoring" not in reasoning:
            reasoning["scoring"] = _build_fallback_from_metrics(trigger).get("scoring", {})

        return reasoning

    except Exception as e:
        print(f"    [WARN] API call failed for {trigger['trigger_id']}: {e}")
        return _build_fallback_from_metrics(trigger)
