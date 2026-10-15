import { streamText, tool } from "ai";

export const maxDuration = 30;
import { google } from "@ai-sdk/google";
import { z } from "zod";
import dossiers from "@/data/dossiers.json";
import fieldNotesData from "@/data/field_notes.json";
import changeOrdersData from "@/data/change_orders.json";
import rfisData from "@/data/rfis.json";
import laborLogsData from "@/data/labor_logs.json";

type FieldNote = {
  project_id: string;
  note_id: string;
  date: string;
  author: string;
  note_type: string;
  content: string;
};

type ChangeOrder = {
  project_id: string;
  co_number: string;
  date_submitted: string;
  reason_category: string;
  description: string;
  amount: number;
  status: string;
  related_rfi: string;
  affected_sov_lines: string;
  labor_hours_impact: number;
  schedule_impact_days: number;
  submitted_by: string;
  approved_by: string;
};

type Rfi = {
  project_id: string;
  rfi_number: string;
  date_submitted: string;
  subject: string;
  submitted_by: string;
  assigned_to: string;
  priority: string;
  status: string;
  date_required: string;
  date_responded: string;
  response_summary: string;
  cost_impact: boolean | string;
  schedule_impact: boolean | string;
};

type LaborLog = {
  project_id: string;
  log_id: string;
  date: string;
  role: string;
  sov_line_id: string;
  hours_st: number;
  hours_ot: number;
  hourly_rate: number;
  burden_multiplier: number;
};

type DossierProject = {
  project_id: string;
  name: string;
  contract_value: number;
  status: string;
  health_score: number;
  financials: {
    estimated_cost: number;
    actual_cost: number;
    actual_labor_cost: number;
    actual_material_cost: number;
    approved_cos: number;
    pending_cos: number;
    adjusted_contract: number;
    bid_margin_pct: number;
    realized_margin_pct: number;
  };
  triggers: unknown[];
};

const fieldNotes = fieldNotesData as FieldNote[];
const changeOrders = changeOrdersData as ChangeOrder[];
const rfis = rfisData as Rfi[];
const laborLogs = laborLogsData as LaborLog[];
const dossiersMap = dossiers as Record<string, DossierProject>;

function buildSystemPrompt(projectId: string | null): string {
  let base =
    "You are the HVAC Margin Rescue Agent, an expert construction financial analyst. " +
    "You help project managers identify and recover margin erosion on commercial HVAC projects.\n\n" +
    "Guidelines:\n" +
    "- Be direct, concise, and data-driven\n" +
    "- Reference specific numbers, dates, and SOV lines\n" +
    "- When discussing costs, always use dollar amounts\n" +
    "- Suggest concrete recovery actions with estimated dollar impact\n" +
    "- Use the available tools to look up live project data when needed\n";

  if (projectId && projectId !== "PORTFOLIO") {
    const project = dossiersMap[projectId];
    if (project) {
      const trimmed = {
        ...project,
        triggers: project.triggers?.map((t: unknown) => {
          const trigger = t as Record<string, unknown>;
          const { evidence: _evidence, ...rest } = trigger;
          if (rest.reasoning) {
            const r = rest.reasoning as Record<string, unknown>;
            rest.reasoning = { root_cause: r.root_cause, confidence: r.confidence };
          }
          return rest;
        }),
      };
      base += `\nCurrent project dossier (pre-analyzed):\n${JSON.stringify(trimmed, null, 2)}\n`;
    }
  }

  if (!projectId || projectId === "PORTFOLIO") {
    const portfolioSummary = Object.values(dossiersMap).map((p) => ({
      project_id: p.project_id,
      name: p.name,
      status: p.status,
      health_score: p.health_score,
      contract_value: p.contract_value,
      realized_margin_pct: p.financials?.realized_margin_pct,
    }));
    base += `\nPortfolio summary:\n${JSON.stringify(portfolioSummary, null, 2)}\n`;
  }

  return base;
}

// gemini-2.0-flash shut down on 2026-06-01. Google's replacement for that id is gemini-3.6-flash.
const CHAT_MODEL = "gemini-3.6-flash";

export async function POST(req: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response(
      "The assistant needs GOOGLE_GENERATIVE_AI_API_KEY. Add it to frontend/.env.local. See frontend/.env.example.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const { project_id, messages } = await req.json();

  const result = streamText({
    model: google(CHAT_MODEL),
    system: buildSystemPrompt(project_id ?? null),
    messages,
    maxSteps: 5,
    tools: {
      get_field_notes: tool({
        description:
          "Search field notes for a project. Can filter by date range and keyword.",
        parameters: z.object({
          project_id: z.string().describe("Project ID"),
          date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
          date_to: z.string().optional().describe("End date YYYY-MM-DD"),
          keyword: z.string().optional().describe("Keyword to search in note content"),
        }),
        execute: async ({ project_id, date_from, date_to, keyword }) => {
          let notes = fieldNotes.filter((n) => n.project_id === project_id);
          if (date_from) notes = notes.filter((n) => n.date >= date_from);
          if (date_to) notes = notes.filter((n) => n.date <= date_to);
          if (keyword) {
            const kw = keyword.toLowerCase();
            notes = notes.filter((n) => n.content?.toLowerCase().includes(kw));
          }
          return notes
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 50)
            .map(({ note_id, date, author, content, note_type }) => ({
              note_id,
              date,
              author,
              content,
              note_type,
            }));
        },
      }),

      get_labor_detail: tool({
        description:
          "Get labor hours and costs for a project, broken down by SOV line and role.",
        parameters: z.object({
          project_id: z.string().describe("Project ID"),
          sov_line_id: z.string().optional().describe("Optional SOV line ID to filter"),
        }),
        execute: async ({ project_id, sov_line_id }) => {
          let logs = laborLogs.filter((l) => l.project_id === project_id);
          if (sov_line_id) logs = logs.filter((l) => l.sov_line_id === sov_line_id);

          const cost = (l: LaborLog) =>
            (l.hours_st + l.hours_ot * 1.5) * l.hourly_rate * l.burden_multiplier;

          const totals = logs.reduce(
            (acc, l) => ({
              hours_st: acc.hours_st + l.hours_st,
              hours_ot: acc.hours_ot + l.hours_ot,
              total_cost: acc.total_cost + cost(l),
            }),
            { hours_st: 0, hours_ot: 0, total_cost: 0 }
          );

          // Group by SOV line
          const byLine: Record<string, { hours_st: number; hours_ot: number; total_cost: number; roles: Record<string, { hours_st: number; hours_ot: number; total_cost: number }> }> = {};
          for (const l of logs) {
            if (!byLine[l.sov_line_id]) {
              byLine[l.sov_line_id] = { hours_st: 0, hours_ot: 0, total_cost: 0, roles: {} };
            }
            byLine[l.sov_line_id].hours_st += l.hours_st;
            byLine[l.sov_line_id].hours_ot += l.hours_ot;
            byLine[l.sov_line_id].total_cost += cost(l);
            if (!byLine[l.sov_line_id].roles[l.role]) {
              byLine[l.sov_line_id].roles[l.role] = { hours_st: 0, hours_ot: 0, total_cost: 0 };
            }
            byLine[l.sov_line_id].roles[l.role].hours_st += l.hours_st;
            byLine[l.sov_line_id].roles[l.role].hours_ot += l.hours_ot;
            byLine[l.sov_line_id].roles[l.role].total_cost += cost(l);
          }

          return {
            project_id,
            hours_st: totals.hours_st,
            hours_ot: totals.hours_ot,
            total_cost: Math.round(totals.total_cost * 100) / 100,
            by_sov_line: Object.entries(byLine).map(([id, data]) => ({
              sov_line_id: id,
              hours_st: data.hours_st,
              hours_ot: data.hours_ot,
              total_cost: Math.round(data.total_cost * 100) / 100,
              roles: Object.entries(data.roles).map(([role, rd]) => ({
                role,
                hours_st: rd.hours_st,
                hours_ot: rd.hours_ot,
                total_cost: Math.round(rd.total_cost * 100) / 100,
              })),
            })),
          };
        },
      }),

      get_co_detail: tool({
        description:
          "Get change order details for a project, optionally filtered by CO number.",
        parameters: z.object({
          project_id: z.string().describe("Project ID"),
          co_number: z.string().optional().describe("Optional CO number to filter"),
        }),
        execute: async ({ project_id, co_number }) => {
          let cos = changeOrders.filter((c) => c.project_id === project_id);
          if (co_number) cos = cos.filter((c) => c.co_number === co_number);
          return cos.sort((a, b) => b.date_submitted.localeCompare(a.date_submitted));
        },
      }),

      get_rfi_detail: tool({
        description:
          "Get RFI details for a project, optionally filtered by RFI number.",
        parameters: z.object({
          project_id: z.string().describe("Project ID"),
          rfi_number: z.string().optional().describe("Optional RFI number to filter"),
        }),
        execute: async ({ project_id, rfi_number }) => {
          let result = rfis.filter((r) => r.project_id === project_id);
          if (rfi_number) result = result.filter((r) => r.rfi_number === rfi_number);
          return result.sort((a, b) =>
            b.date_submitted.localeCompare(a.date_submitted)
          );
        },
      }),

      what_if_margin: tool({
        description:
          "Run a what-if margin scenario: co_rejected, co_approved, or labor_recovery.",
        parameters: z.object({
          project_id: z.string().describe("Project ID"),
          scenario: z
            .enum(["co_rejected", "co_approved", "labor_recovery"])
            .describe("Scenario to run"),
          co_number: z
            .string()
            .optional()
            .describe("CO number (required for co_rejected/co_approved)"),
        }),
        execute: async ({ project_id, scenario, co_number }) => {
          const project = dossiersMap[project_id];
          if (!project) return { error: `Project ${project_id} not found` };

          const fin = project.financials;
          const contractValue = project.contract_value;
          const adjustedCv = fin.adjusted_contract;
          const totalActualCost = fin.actual_cost;
          const actualLaborCost = fin.actual_labor_cost;
          const actualMaterialCost = fin.actual_material_cost;
          const approvedCoTotal = fin.approved_cos;
          const pendingCoTotal = fin.pending_cos;
          const bidMarginPct = fin.bid_margin_pct;
          const realizedMarginPct = fin.realized_margin_pct;

          const before = {
            contract_value: contractValue,
            adjusted_contract_value: adjustedCv,
            total_actual_cost: totalActualCost,
            actual_labor_cost: actualLaborCost,
            actual_material_cost: actualMaterialCost,
            approved_co_total: approvedCoTotal,
            pending_co_total: pendingCoTotal,
            bid_margin_pct: bidMarginPct,
            realized_margin_pct: realizedMarginPct,
          };

          let afterCv = adjustedCv;
          let afterActualCost = totalActualCost;
          let afterLaborCost = actualLaborCost;
          let afterApprovedCo = approvedCoTotal;
          let afterPendingCo = pendingCoTotal;

          if (scenario === "co_rejected" || scenario === "co_approved") {
            if (!co_number) return { error: `Scenario '${scenario}' requires co_number` };
            const co = changeOrders.find(
              (c) => c.project_id === project_id && c.co_number === co_number
            );
            if (!co) return { error: `CO ${co_number} not found for ${project_id}` };

            if (scenario === "co_rejected") {
              afterCv -= co.amount;
              afterApprovedCo -= co.amount;
            } else {
              afterCv += co.amount;
              afterApprovedCo += co.amount;
              afterPendingCo -= co.amount;
            }
          } else if (scenario === "labor_recovery") {
            const savings = actualLaborCost * 0.1;
            afterLaborCost -= savings;
            afterActualCost -= savings;
          }

          const marginPct = (rev: number, cost: number) =>
            rev === 0 ? 0 : Math.round(((rev - cost) / rev) * 10000) / 100;

          const after = {
            contract_value: contractValue,
            adjusted_contract_value: Math.round(afterCv * 100) / 100,
            total_actual_cost: Math.round(afterActualCost * 100) / 100,
            actual_labor_cost: Math.round(afterLaborCost * 100) / 100,
            actual_material_cost: actualMaterialCost,
            approved_co_total: Math.round(afterApprovedCo * 100) / 100,
            pending_co_total: Math.round(afterPendingCo * 100) / 100,
            bid_margin_pct: bidMarginPct,
            realized_margin_pct: marginPct(afterCv, afterActualCost),
          };

          const delta = Object.fromEntries(
            Object.keys(before).map((k) => [
              k,
              Math.round(((after[k as keyof typeof after] as number) - (before[k as keyof typeof before] as number)) * 100) / 100,
            ])
          );

          return { project_id, scenario, co_number: co_number ?? null, before, after, delta };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
