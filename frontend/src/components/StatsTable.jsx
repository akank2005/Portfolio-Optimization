import React from "react";
import { useMemo } from "react";

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatSharpe(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return value.toFixed(2);
}

function isMinimalOrZeroWeight(weight) {
  const w = Number(weight);
  if (!Number.isFinite(w)) {
    return true;
  }
  return w <= 0 || w < 0.01;
}

function StatsTable({ optimal, tickers = [] }) {
  const { rows, excludedTickerNames } = useMemo(() => {
    const weights = Array.isArray(optimal?.weights) ? optimal.weights : [];
    const built = weights.map((weight, idx) => ({
      ticker: tickers[idx] ?? `Asset ${idx + 1}`,
      weight: Number(weight),
    }));
    const excluded = built.filter((row) => isMinimalOrZeroWeight(row.weight)).map((row) => row.ticker);
    return { rows: built, excludedTickerNames: excluded };
  }, [optimal, tickers]);

  if (!optimal) {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#111827] p-6 text-center text-sm text-slate-400">
        Run an optimization to view portfolio statistics.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#161b2e] p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Portfolio Statistics</p>
          <p className="mt-1 text-sm text-slate-400">Annualized metrics for the selected strategy</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-900/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Expected Annual Return</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-400">{formatPercent(optimal.return)}</p>
        </div>

        <div className="rounded-xl border border-blue-900/40 bg-blue-900/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Annual Volatility</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-blue-400">{formatPercent(optimal.volatility)}</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-[#111827] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sharpe Ratio</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-100">{formatSharpe(Number(optimal.sharpe))}</p>
        </div>
      </div>

      {excludedTickerNames.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm leading-relaxed text-slate-300">
          <p>
            Some assets were assigned 0% weight. This is mathematically correct — the optimizer found that these assets
            did not improve the portfolio&apos;s risk-return tradeoff given your other selections.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            <span className="font-medium text-slate-400">Excluded: </span>
            <span className="font-medium text-slate-200">{excludedTickerNames.join(", ")}</span>
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-[#111827]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ticker
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                Allocation
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-[#161b2e]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-sm text-slate-400">
                  No weight data available.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => {
              const dimmed = isMinimalOrZeroWeight(row.weight);
              const zebra = idx % 2 === 0 ? "bg-[#161b2e]" : "bg-[#111827]/60";
              const rowMuted = dimmed ? `${zebra} opacity-80` : zebra;
              const barWidthPct = dimmed
                ? `${Math.min(100, Math.max(0, row.weight * 100))}%`
                : `${Math.max(row.weight * 100, 2)}%`;
              return (
                <tr key={`${row.ticker}-${idx}`} className={rowMuted}>
                  <td
                    className={`px-4 py-3 text-sm font-medium ${dimmed ? "text-slate-500" : "text-slate-100"}`}
                  >
                    {row.ticker}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold ${dimmed ? "text-slate-500" : "text-slate-100"}`}
                  >
                    <div className="ml-auto max-w-[220px]">
                      <div className="mb-1 h-2 overflow-hidden rounded-full bg-slate-700/80">
                        <div
                          className={`h-full rounded-full ${dimmed ? "bg-slate-600" : "bg-blue-500"}`}
                          style={{ width: barWidthPct }}
                        />
                      </div>
                      <span className="tabular-nums">{formatPercent(row.weight)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default StatsTable;
