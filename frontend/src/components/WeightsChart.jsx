import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";

function isMinimalOrZeroWeight(weight) {
  const w = Number(weight);
  if (!Number.isFinite(w)) {
    return true;
  }
  return w <= 0 || w < 0.01;
}

function WeightsChart({ optimal, tickers = [] }) {
  const chartRef = useRef(null);
  const [plotlyError, setPlotlyError] = useState("");

  const excludedTickerNames = useMemo(() => {
    const weights = Array.isArray(optimal?.weights) ? optimal.weights : [];
    if (!weights.length) {
      return [];
    }
    return weights
      .map((w, idx) => ({
        weight: Number(w),
        ticker: tickers[idx] ?? `Asset ${idx + 1}`,
      }))
      .filter((row) => isMinimalOrZeroWeight(row.weight))
      .map((row) => row.ticker);
  }, [optimal, tickers]);

  const pieData = useMemo(() => {
    const weights = Array.isArray(optimal?.weights) ? optimal.weights : [];
    if (!weights.length || !tickers.length) {
      return { labels: [], values: [] };
    }

    const filtered = weights
      .map((weight, idx) => ({
        label: tickers[idx] ?? `Asset ${idx + 1}`,
        value: Number(weight),
      }))
      .filter((item) => Number.isFinite(item.value) && item.value > 0.01);

    return {
      labels: filtered.map((item) => item.label),
      values: filtered.map((item) => item.value),
    };
  }, [optimal, tickers]);

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      if (!chartRef.current) {
        return;
      }

      let Plotly;
      try {
        const plotlyModule = await import("plotly.js-dist");
        Plotly = plotlyModule.default;
      } catch (error) {
        if (isMounted) {
          setPlotlyError("Unable to load chart library. Please refresh the page.");
        }
        return;
      }

      if (!pieData.values.length) {
        Plotly.purge(chartRef.current);
        return;
      }

      const trace = {
        type: "pie",
        labels: pieData.labels,
        values: pieData.values,
        textinfo: "label+percent",
        hovertemplate: "%{label}: %{percent} (%{value:.2%})<extra></extra>",
        sort: false,
        automargin: true,
      };

      const layout = {
        title: {
          text: "Optimal Portfolio Allocation",
          font: { size: 18, color: "#e2e8f0" },
        },
        margin: { l: 20, r: 20, t: 60, b: 20 },
        paper_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
        showlegend: false,
      };

      const config = {
        responsive: true,
        displayModeBar: false,
      };

      await Plotly.newPlot(chartRef.current, [trace], layout, config);
      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [pieData]);

  const zeroWeightBanner =
    excludedTickerNames.length > 0 ? (
      <div className="mb-3 rounded-xl border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-sm leading-relaxed text-slate-300">
        <p>
          Some assets were assigned 0% weight. This is mathematically correct — the optimizer found that these assets
          did not improve the portfolio&apos;s risk-return tradeoff given your other selections.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          <span className="font-medium text-slate-400">Excluded: </span>
          <span className="font-medium text-slate-200">{excludedTickerNames.join(", ")}</span>
        </p>
      </div>
    ) : null;

  if (!pieData.values.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#161b2e] p-4 shadow-sm">
        <p className="mb-2 text-[13px] uppercase tracking-[0.18em] text-slate-400">Allocation</p>
        {zeroWeightBanner}
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-6 text-center text-sm text-slate-400">
          No allocation data above 1% to display yet.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#161b2e] p-4 shadow-sm">
      <p className="mb-2 text-[13px] uppercase tracking-[0.18em] text-slate-400">Allocation</p>
      {zeroWeightBanner}
      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}
      <div ref={chartRef} className="h-[420px] w-full" />
    </div>
  );
}

export default WeightsChart;
