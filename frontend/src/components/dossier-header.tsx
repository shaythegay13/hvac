"use client";

import { formatCurrency } from "@/lib/api";

interface DossierHeaderProps {
  financials: {
    estimated_cost: number;
    actual_cost: number;
    bid_margin_pct: number;
    realized_margin_pct: number;
    margin_erosion_pct: number;
    approved_cos: number;
    pending_cos: number;
    rejected_cos: number;
    adjusted_contract: number;
    cumulative_billed: number;
    earned_value: number;
    billing_lag: number;
    billing_lag_pct: number;
  };
  contractValue: number;
}

export function DossierHeader({ financials, contractValue }: DossierHeaderProps) {
  const erosionAmount = contractValue * (financials.margin_erosion_pct / 100);
  const isEroding = financials.margin_erosion_pct > 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Financial Summary
      </h3>

      {/* Margin flow */}
      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Bid Margin</div>
          <div className="text-xl font-bold">{financials.bid_margin_pct.toFixed(1)}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Realized</div>
          <div className={`text-xl font-bold ${isEroding ? "text-red-400" : "text-green-400"}`}>
            {financials.realized_margin_pct.toFixed(1)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Erosion</div>
          <div className={`text-xl font-bold ${isEroding ? "text-red-400" : "text-green-400"}`}>
            {isEroding ? "+" : ""}{financials.margin_erosion_pct.toFixed(1)}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">At Stake</div>
          <div className={`text-xl font-bold ${isEroding ? "text-red-400" : "text-green-400"}`}>
            {isEroding ? formatCurrency(erosionAmount) : "—"}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-gray-500">Est. Cost</div>
          <div className="font-medium">{formatCurrency(financials.estimated_cost)}</div>
        </div>
        <div>
          <div className="text-gray-500">Actual Cost</div>
          <div className="font-medium">{formatCurrency(financials.actual_cost)}</div>
        </div>
        <div>
          <div className="text-gray-500">Adjusted Contract</div>
          <div className="font-medium">{formatCurrency(financials.adjusted_contract)}</div>
        </div>
        <div>
          <div className="text-gray-500">Approved COs</div>
          <div className="font-medium text-green-400">{formatCurrency(financials.approved_cos)}</div>
        </div>
        <div>
          <div className="text-gray-500">Cumulative Billed</div>
          <div className="font-medium">{formatCurrency(financials.cumulative_billed)}</div>
        </div>
        <div>
          <div className="text-gray-500">Billing Lag</div>
          <div className={`font-medium ${Math.abs(financials.billing_lag_pct) > 3 ? "text-red-400" : "text-gray-300"}`}>
            {formatCurrency(financials.billing_lag)} ({financials.billing_lag_pct.toFixed(1)}%)
          </div>
        </div>
      </div>
    </div>
  );
}
