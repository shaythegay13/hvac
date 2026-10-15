"use client";

import { useState } from "react";
import { Trigger, formatCurrency } from "@/lib/api";
import { ReasoningPanel } from "./reasoning-panel";

interface IssueCardProps {
  trigger: Trigger;
}

export function IssueCard({ trigger }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);

  const severityColors: Record<string, string> = {
    HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
    MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    LOW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  const typeLabels: Record<string, string> = {
    LABOR_OVERRUN: "Labor Overrun",
    ORPHAN_RFI: "Orphan RFI",
    PENDING_CO: "Pending CO",
    MATERIAL_VARIANCE: "Material Variance",
    BILLING_LAG: "Billing Lag",
    OT_SPIKE: "OT Spike",
  };

  const metricsDisplay = () => {
    const m = trigger.metrics;
    switch (trigger.type) {
      case "LABOR_OVERRUN":
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>Burn: {m.burn_ratio}x</span>
            <span>+{m.overrun_pct?.toFixed(0)}% over</span>
            <span className="text-red-400">{formatCurrency(m.overrun_cost || 0)} overrun</span>
          </div>
        );
      case "ORPHAN_RFI":
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>RFI: {m.rfi_number}</span>
            <span>{m.days_open}d open</span>
            <span>Priority: {m.priority}</span>
          </div>
        );
      case "PENDING_CO":
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>{m.co_count} COs pending</span>
            <span className="text-yellow-400">{formatCurrency(m.pending_total || 0)}</span>
            <span>{m.pending_pct?.toFixed(1)}% of contract</span>
          </div>
        );
      default:
        return (
          <div className="text-sm text-gray-400">
            Value: {trigger.value}
          </div>
        );
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header (always visible) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-semibold border ${severityColors[trigger.severity] || severityColors.LOW}`}
              >
                {trigger.severity}
              </span>
              <span className="text-xs text-gray-500">
                {typeLabels[trigger.type] || trigger.type}
              </span>
              <span className="text-xs text-gray-600">{trigger.date}</span>
            </div>
            <div className="font-medium mb-2">{trigger.headline}</div>
            {metricsDisplay()}
          </div>
          <div className="text-gray-500 text-xl mt-1">{expanded ? "−" : "+"}</div>
        </div>
      </button>

      {/* Expanded reasoning panel */}
      {expanded && <ReasoningPanel trigger={trigger} />}
    </div>
  );
}
