import React from "react";
import { useMemo, useState } from "react";

const STRATEGIES = [
  {
    id: "max_sharpe",
    label: "Max Sharpe Ratio",
    short: "Best return per unit of risk",
    tooltip:
      "Chooses the portfolio on the efficient frontier with the highest Sharpe ratio (excess return per unit of volatility), given your historical estimates.",
  },
  {
    id: "min_variance",
    label: "Min Variance",
    short: "Lowest possible portfolio volatility",
    tooltip:
      "Finds the fully invested, long-only portfolio that minimizes total variance—useful when stability matters more than maximizing raw return.",
  },
  {
    id: "risk_parity",
    label: "Risk Parity",
    short: "Equal risk contribution from each asset",
    tooltip:
      "Allocates weights so each asset contributes similarly to portfolio risk (risk budgeting), rather than equal dollar weights.",
  },
  {
    id: "max_return",
    label: "Max Return",
    short: "Highest return within a volatility limit",
    tooltip:
      "Maximizes expected return subject to your maximum volatility cap and long-only, fully-invested constraints.",
  },
];

function StrategySelector({
  selectedStrategy = "max_sharpe",
  onStrategyChange,
  loading = false,
  compact = false,
  hideOuterLabel = false,
}) {
  const [maxVolatility, setMaxVolatility] = useState(20);

  const normalizedStrategy = useMemo(
    () => (selectedStrategy || "max_sharpe").toLowerCase(),
    [selectedStrategy]
  );

  const handleSelect = (strategyId) => {
    if (loading) {
      return;
    }

    if (strategyId === "max_return") {
      onStrategyChange("max_return", maxVolatility);
      return;
    }
    onStrategyChange(strategyId);
  };

  const handleVolatilityChange = (event) => {
    const sliderValue = Number(event.target.value);
    setMaxVolatility(sliderValue);
    onStrategyChange("max_return", sliderValue);
  };

  const gap = compact ? "gap-1.5" : "gap-2";
  const cardPad = compact ? "px-2.5 py-2" : "px-3 py-3";
  const titleCls = compact ? "text-xs font-bold text-slate-100" : "text-sm font-bold text-slate-100";
  const shortCls = compact ? "mt-0.5 text-[10px] leading-snug text-slate-500" : "mt-1 text-xs text-slate-500";
  const sliderBox = compact ? "mt-1.5 rounded-lg border border-slate-700 bg-[#0f1117] p-2" : "mt-2 rounded-xl border border-slate-700 bg-[#0f1117] p-3";

  return (
    <section className={compact ? "space-y-2" : "space-y-3"}>
      {!hideOuterLabel && (
        <>
          <label className="block text-[13px] font-medium uppercase tracking-[0.14em] text-slate-400">
            <span className="text-slate-500">03</span>
            <span className="mx-2 text-slate-600">—</span>
            STRATEGY
          </label>
          <p className="text-xs text-slate-500">Pick how the optimizer selects your optimal portfolio weights.</p>
        </>
      )}

      <div className={`flex flex-col ${gap}`}>
        {STRATEGIES.map((strategy) => {
          const isActive = normalizedStrategy === strategy.id;
          return (
            <div key={strategy.id}>
              <button
                type="button"
                onClick={() => handleSelect(strategy.id)}
                disabled={loading}
                title={strategy.tooltip}
                className={`w-full rounded-xl border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${cardPad} ${
                  isActive
                    ? "border-blue-500 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                    : "border-slate-700 bg-[#111827] hover:border-slate-600 hover:bg-[#111827]/90"
                }`}
              >
                <p className={titleCls}>{strategy.label}</p>
                <p className={shortCls}>{strategy.short}</p>
              </button>

              {strategy.id === "max_return" && isActive && (
                <div className={sliderBox}>
                  <label className={`mb-1.5 block font-medium text-slate-400 ${compact ? "text-[10px]" : "text-xs"}`}>
                    Max volatility cap:{" "}
                    <span className="font-semibold text-slate-100 tabular-nums">{maxVolatility}%</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    step="1"
                    value={maxVolatility}
                    onChange={handleVolatilityChange}
                    disabled={loading}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-blue-500 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default StrategySelector;
