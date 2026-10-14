"use client";

import { useEffect, useState } from "react";
import { fetchContracts, fetchPortfolio, Contract, Portfolio } from "@/lib/api";
import { PortfolioGrid } from "@/components/portfolio-grid";
import { ChatPanel } from "@/components/chat-panel";

const SESSION_KEY = "hvac-home-state";

export default function Home() {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The home page unmounts when a project opens. Restore the last portfolio
  // so Back to Portfolio does not drop the analysis.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { contracts?: Contract[]; portfolio?: Portfolio | null };
        if (Array.isArray(saved.contracts) && saved.contracts.length > 0) {
          setContracts(saved.contracts);
          setLoaded(true);
          if (saved.portfolio) setPortfolio(saved.portfolio);
        }
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !loaded || !contracts) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ contracts, portfolio }));
  }, [ready, loaded, contracts, portfolio]);

  async function loadContracts() {
    setError(null);
    try {
      const data = await fetchContracts();
      setContracts(data);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the portfolio");
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const data = await fetchPortfolio();
      setPortfolio(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the analysis");
    } finally {
      setAnalyzing(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <h2 className="text-2xl font-bold">HVAC Portfolio Monitor</h2>
        <p className="text-gray-400 text-center max-w-md">
          Load your portfolio of 5 commercial HVAC construction projects totaling $100.9M
          to begin real-time financial health analysis.
        </p>
        <button
          onClick={loadContracts}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Load Portfolio
        </button>
        {error && (
          <p className="text-sm text-red-400" role="alert">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Portfolio header stats */}
      {portfolio && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-sm text-gray-400">Portfolio Health</div>
            <div className="text-2xl font-bold">{portfolio.portfolio_health}/100</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-sm text-gray-400">At Risk</div>
            <div className="text-2xl font-bold text-red-500">{portfolio.at_risk_count}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-sm text-gray-400">Watch</div>
            <div className="text-2xl font-bold text-yellow-500">{portfolio.watch_count}</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="text-sm text-gray-400">Healthy</div>
            <div className="text-2xl font-bold text-green-500">{portfolio.healthy_count}</div>
          </div>
        </div>
      )}

      <PortfolioGrid contracts={contracts!} portfolio={portfolio} />

      {/* Analysis button */}
      {!portfolio && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-gray-400 rounded-lg font-medium text-lg transition-colors"
          >
            {analyzing ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Analyzing Portfolio...
              </span>
            ) : (
              "Run Real-Time Analysis"
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-red-400" role="alert">{error}</p>
      )}

      {portfolio && <ChatPanel />}
    </div>
  );
}
