"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchDossier, Dossier, formatCurrency, statusBg, statusColor } from "@/lib/api";
import { DossierHeader } from "@/components/dossier-header";
import { IssueCard } from "@/components/issue-card";
import { ChatPanel } from "@/components/chat-panel";

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);

  // Email modal state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ status: string; message?: string } | null>(null);

  useEffect(() => {
    fetchDossier(projectId)
      .then(setDossier)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  async function sendReport() {
    if (!emailTo.trim()) return;
    setEmailSending(true);
    setEmailResult(null);

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, to: emailTo.trim() }),
      });
      const data = await res.json();
      if (data.status === "sent") {
        setEmailResult({ status: "sent", message: `Report sent to ${data.to}` });
      } else {
        setEmailResult({ status: "failed", message: data.error || "Send failed" });
      }
    } catch {
      setEmailResult({ status: "failed", message: "Network error" });
    } finally {
      setEmailSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!dossier) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Dossier not found for {projectId}</p>
        <Link href="/" className="text-blue-400 hover:underline mt-4 inline-block">
          Back to Portfolio
        </Link>
      </div>
    );
  }

  const sortedTriggers = [...dossier.triggers].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "HIGH" ? -1 : 1;
    return a.type.localeCompare(b.type);
  });

  return (
    <div>
      <Link href="/" className="text-sm text-gray-400 hover:text-white mb-4 inline-block">
        &larr; Back to Portfolio
      </Link>

      {/* Project header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">{dossier.name}</h2>
          <div className="text-sm text-gray-400 mt-1">
            {formatCurrency(dossier.contract_value)} &middot; {dossier.gc_name} &middot;{" "}
            {dossier.start_date} — {dossier.end_date}
          </div>
        </div>
        <div className="flex items-start gap-3">
          {/* Send Report button */}
          <button
            onClick={() => { setEmailOpen(true); setEmailResult(null); }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Send Report
          </button>

          <div className="text-right">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusBg(dossier.status)} text-white`}>
              {dossier.status}
            </span>
            <div className={`text-2xl font-bold mt-1 ${statusColor(dossier.status)}`}>
              {dossier.health_score}/100
            </div>
          </div>
        </div>
      </div>

      {/* Email modal */}
      {emailOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-1">Send Margin Report</h3>
            <p className="text-sm text-gray-400 mb-4">
              Email a detailed margin alert for {dossier.name} with financial summary, top issues, and recovery actions.
            </p>

            <label className="text-sm text-gray-400 block mb-1">Recipient email</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReport()}
              placeholder="pm@company.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-blue-500"
            />

            {emailResult && (
              <div className={`text-sm mb-4 p-3 rounded-lg ${
                emailResult.status === "sent"
                  ? "bg-green-500/10 text-green-400 border border-green-500/30"
                  : "bg-red-500/10 text-red-400 border border-red-500/30"
              }`}>
                {emailResult.message}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEmailOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendReport}
                disabled={emailSending || !emailTo.trim()}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {emailSending ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Sending...
                  </>
                ) : (
                  "Send via Gmail"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Financial summary */}
      <DossierHeader financials={dossier.financials} contractValue={dossier.contract_value} />

      {/* Trigger summary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">
          Issues Detected ({dossier.trigger_summary.total})
        </h3>
        <div className="flex gap-3 text-sm mb-4">
          {Object.entries(dossier.trigger_summary.by_type).map(([type, count]) => (
            <span key={type} className="px-3 py-1 bg-gray-800 rounded-full text-gray-300">
              {type.replace(/_/g, " ")}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* Issue cards */}
      <div className="space-y-4">
        {sortedTriggers.map((trigger) => (
          <IssueCard key={trigger.trigger_id} trigger={trigger} />
        ))}
      </div>

      <ChatPanel projectId={projectId} />
    </div>
  );
}
