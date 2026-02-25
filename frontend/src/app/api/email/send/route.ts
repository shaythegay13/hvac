import { google } from "googleapis";
import dossiers from "@/data/dossiers.json";

type DossierProject = {
  project_id: string;
  name: string;
  contract_value: number;
  status: string;
  health_score: number;
  financials: {
    bid_margin_pct: number;
    realized_margin_pct: number;
    margin_erosion_pct: number;
    estimated_cost: number;
    actual_cost: number;
    approved_cos: number;
    billing_lag: number;
    billing_lag_pct: number;
  };
  triggers: Array<{
    headline: string;
    severity: string;
    reasoning: {
      root_cause: string;
      recovery_actions: string[];
      recoverable_amount: number;
    };
  }>;
  trigger_summary: { total: number };
};

const dossiersMap = dossiers as Record<string, DossierProject>;

function buildEmailHtml(project: DossierProject): { subject: string; html: string; text: string } {
  const statusColors: Record<string, string> = {
    RED: "#ef4444",
    YELLOW: "#eab308",
    GREEN: "#22c55e",
  };
  const headerColor = statusColors[project.status] ?? "#6b7280";
  const fin = project.financials;
  const subject = `[${project.status}] Margin Alert: ${project.name} — Health ${project.health_score}/100`;

  const highTriggers = (project.triggers ?? [])
    .filter((t) => t.severity === "HIGH")
    .slice(0, 5);

  const totalRecoverable = (project.triggers ?? []).reduce(
    (sum, t) => sum + (t.reasoning?.recoverable_amount ?? 0),
    0
  );

  const triggersHtml = highTriggers
    .map((t) => {
      const actions = (t.reasoning?.recovery_actions ?? [])
        .slice(0, 3)
        .map((a) => `<li>${a}</li>`)
        .join("");
      const recoverable = t.reasoning?.recoverable_amount ?? 0;
      return `
        <div style="border-left:3px solid ${headerColor};padding-left:12px;margin-bottom:16px">
          <strong>${t.headline}</strong>
          <p style="margin:4px 0;font-size:14px">${(t.reasoning?.root_cause ?? "").slice(0, 300)}</p>
          ${actions ? `<ul style="margin:4px 0;font-size:13px;padding-left:20px">${actions}</ul>` : ""}
          ${recoverable > 0 ? `<p style="font-size:12px;color:#6b7280;margin:4px 0"><em>Estimated recoverable: $${recoverable.toLocaleString()}</em></p>` : ""}
        </div>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:${headerColor};padding:20px 24px;color:#fff">
      <h1 style="margin:0;font-size:20px">${subject}</h1>
      <p style="margin:4px 0 0;font-size:14px;opacity:0.9">Generated ${new Date().toLocaleString()}</p>
    </div>
    <div style="padding:24px">
      <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Financial Summary</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Contract Value</td><td style="text-align:right;font-weight:500">$${project.contract_value.toLocaleString()}</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Bid Margin</td><td style="text-align:right;font-weight:500">${fin.bid_margin_pct.toFixed(1)}%</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Realized Margin</td><td style="text-align:right;font-weight:500">${fin.realized_margin_pct.toFixed(1)}%</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Margin Erosion</td><td style="text-align:right;font-weight:500;color:${headerColor}">${fin.margin_erosion_pct.toFixed(1)}%</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Estimated Cost</td><td style="text-align:right;font-weight:500">$${fin.estimated_cost.toLocaleString()}</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Actual Cost</td><td style="text-align:right;font-weight:500">$${fin.actual_cost.toLocaleString()}</td></tr>
        <tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 0;color:#6b7280">Approved COs</td><td style="text-align:right;font-weight:500">$${fin.approved_cos.toLocaleString()}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Billing Lag</td><td style="text-align:right;font-weight:500">$${fin.billing_lag.toLocaleString()} (${fin.billing_lag_pct.toFixed(1)}%)</td></tr>
      </table>
      <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:8px">Issues Detected (${project.trigger_summary?.total ?? 0} total)</h2>
      ${triggersHtml}
      ${totalRecoverable > 0 ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px;margin-top:16px"><strong>Total Estimated Recoverable: $${totalRecoverable.toLocaleString()}</strong></div>` : ""}
    </div>
  </div>
</body>
</html>`;

  const text = `${subject}\n\nFinancial Summary\nContract Value: $${project.contract_value.toLocaleString()}\nBid Margin: ${fin.bid_margin_pct.toFixed(1)}%\nRealized Margin: ${fin.realized_margin_pct.toFixed(1)}%\nMargin Erosion: ${fin.margin_erosion_pct.toFixed(1)}%\n\nTotal Recoverable: $${totalRecoverable.toLocaleString()}`;

  return { subject, html, text };
}

async function sendViaGmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<string> {
  const credsEnv = process.env.GMAIL_CREDENTIALS;
  const tokenEnv = process.env.GMAIL_OAUTH_TOKEN;

  if (!credsEnv || !tokenEnv) {
    throw new Error(
      "GMAIL_CREDENTIALS and GMAIL_OAUTH_TOKEN environment variables must be set. " +
        "See frontend/.env.example for instructions."
    );
  }

  const credentials = JSON.parse(credsEnv);
  const token = JSON.parse(tokenEnv);

  // Support both 'installed' and 'web' credential formats
  const cred = credentials.installed ?? credentials.web;
  const oauth2Client = new google.auth.OAuth2(
    cred.client_id,
    cred.client_secret,
    cred.redirect_uris?.[0]
  );
  oauth2Client.setCredentials(token);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const fromEmail = process.env.GMAIL_FROM_EMAIL ?? "me";
  const fromName = "HVAC Margin Rescue Agent";

  // Build RFC 2822 message
  const messageParts = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="boundary"',
    "",
    "--boundary",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
    "",
    "--boundary",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    "--boundary--",
  ].join("\r\n");

  const raw = Buffer.from(messageParts)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return sent.data.id ?? "unknown";
}

export async function POST(req: Request) {
  const { project_id, to } = await req.json();

  if (!project_id || !to) {
    return Response.json({ error: "project_id and to are required" }, { status: 400 });
  }

  const project = dossiersMap[project_id];
  if (!project) {
    return Response.json({ error: `No dossier found for ${project_id}` }, { status: 404 });
  }

  const { subject, html, text } = buildEmailHtml(project);

  try {
    const messageId = await sendViaGmail(to, subject, html, text);
    return Response.json({ status: "sent", message_id: messageId, to, subject });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ status: "failed", error: message, to, subject });
  }
}
