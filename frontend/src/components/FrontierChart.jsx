import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";

function toPercent(value) {
  return Number.isFinite(value) ? value * 100 : null;
}

function FrontierChart({ data, simulation, strategy = "max_sharpe" }) {
  const chartRef = useRef(null);
  const [plotlyError, setPlotlyError] = useState("");

  const frontier = useMemo(() => data?.frontier ?? [], [data]);
  const optimal = useMemo(() => data?.optimal ?? null, [data]);
  const tickers = useMemo(() => data?.tickers ?? [], [data]);
  const assetPoints = useMemo(() => data?.assets ?? [], [data]);
  const simulationData = useMemo(() => simulation ?? data?.simulation ?? null, [simulation, data]);

  const optimalMarker = useMemo(() => {
    const baseMarker = (() => {
      switch (strategy) {
        case "min_variance":
          return {
            name: "Min Variance",
            color: "#3b82f6",
            symbol: "diamond",
            hoverLabel: "Min Variance",
          };
        case "risk_parity":
          return {
            name: "Risk Parity",
            color: "#10b981",
            symbol: "circle",
            hoverLabel: "Risk Parity",
          };
        case "max_return":
          return {
            name: "Max Return",
            color: "#f97316",
            symbol: "triangle-up",
            hoverLabel: "Max Return",
          };
        case "max_sharpe":
        default:
          return {
            name: "Max Sharpe",
            color: "#f59e0b",
            symbol: "star",
            hoverLabel: "Max Sharpe",
          };
      }
    })();

    if (strategy === "max_return" && optimal?.constraint_infeasible) {
      return {
        name: "Constraint Infeasible — showing Min Variance instead",
        color: "#ef4444",
        symbol: "x",
        hoverLabel: "Constraint Infeasible — showing Min Variance instead",
      };
    }

    return baseMarker;
  }, [strategy, optimal]);

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

      if (!frontier.length || !optimal) {
        Plotly.purge(chartRef.current);
        return;
      }

      const sortedFrontier = [...frontier].sort((a, b) => a.volatility - b.volatility);

      const frontierTrace = {
        type: "scatter",
        mode: "lines",
        name: "Efficient Frontier",
        x: sortedFrontier.map((point) => toPercent(point.volatility)),
        y: sortedFrontier.map((point) => toPercent(point.return)),
        line: { color: "#3b82f6", width: 3 },
        hovertemplate: "Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<extra></extra>",
      };

      const optimalTrace = {
        type: "scatter",
        mode: "markers",
        name: optimalMarker.name,
        x: [toPercent(optimal.volatility)],
        y: [toPercent(optimal.return)],
        marker: {
          color: optimalMarker.color,
          size: 16,
          symbol: optimalMarker.symbol,
          line: { color: "#92400e", width: 1.5 },
        },
        hovertemplate:
          `${optimalMarker.hoverLabel}<br>Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<br>Sharpe: ` +
          `${Number.isFinite(optimal.sharpe) ? optimal.sharpe.toFixed(2) : "N/A"}` +
          "<extra></extra>",
      };

      const simulationTrace =
        simulationData &&
        Array.isArray(simulationData.volatilities) &&
        Array.isArray(simulationData.returns) &&
        Array.isArray(simulationData.sharpes)
          ? {
              type: "scatter",
              mode: "markers",
              name: "Simulated Portfolios",
              x: simulationData.volatilities,
              y: simulationData.returns,
              marker: {
                size: 4,
                opacity: 0.4,
                color: simulationData.sharpes,
                colorscale: [
                  [0, "#facc15"],
                  [1, "#1d4ed8"],
                ],
                colorbar: { title: "Sharpe" },
              },
              hovertemplate:
                "Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<br>Sharpe: %{marker.color:.2f}<extra></extra>",
            }
          : null;

      const assetTrace =
        Array.isArray(assetPoints) && assetPoints.length > 0
          ? {
              type: "scatter",
              mode: "markers+text",
              name: "Assets",
              x: assetPoints.map((asset) => toPercent(asset.volatility)),
              y: assetPoints.map((asset) => toPercent(asset.return)),
              text: assetPoints.map((asset, idx) => asset.ticker ?? tickers[idx] ?? `Asset ${idx + 1}`),
              textposition: "top center",
              marker: {
                color: "#14b8a6",
                size: 9,
                symbol: "circle",
              },
              hovertemplate:
                "%{text}<br>Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<extra></extra>",
            }
          : {
              type: "scatter",
              mode: "markers+text",
              name: "Assets",
              x: [],
              y: [],
              text: tickers,
              marker: { color: "#14b8a6", size: 9, symbol: "circle" },
            };

      const layout = {
        title: {
          text: "Efficient Frontier and Optimal Portfolio",
          font: { size: 18, color: "#e2e8f0" },
        },
        xaxis: {
          title: "Volatility (%)",
          gridcolor: "rgba(255,255,255,0.1)",
          zerolinecolor: "rgba(255,255,255,0.12)",
        },
        yaxis: {
          title: "Expected Return (%)",
          gridcolor: "rgba(255,255,255,0.1)",
          zerolinecolor: "rgba(255,255,255,0.12)",
        },
        legend: {
          orientation: "h",
          y: 1.12,
          x: 0,
        },
        margin: { l: 60, r: 20, t: 70, b: 60 },
        paper_bgcolor: "#161b2e",
        plot_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
        hoverlabel: { bgcolor: "#111827", bordercolor: "#334155", font: { color: "#e2e8f0" } },
        hovermode: "closest",
      };

      const config = {
        responsive: true,
        displayModeBar: false,
      };

      const traces = [];
      if (simulationTrace) {
        traces.push(simulationTrace);
      }
      traces.push(frontierTrace, assetTrace, optimalTrace);
      await Plotly.newPlot(chartRef.current, traces, layout, config);
      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [frontier, optimal, tickers, assetPoints, simulationData, optimalMarker]);

  if (!frontier.length || !optimal) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Run an optimization to view the efficient frontier chart.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-[#161b2e] p-4 shadow-sm">
      <p className="mb-2 text-[13px] uppercase tracking-[0.18em] text-slate-400">Frontier Analysis</p>
      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}
      <div ref={chartRef} className="h-[440px] w-full" />
      {(!assetPoints || assetPoints.length === 0) && tickers.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Asset dots require per-asset return/volatility data (optional <code>data.assets</code> field).
        </p>
      )}
    </div>
  );
}

export default FrontierChart;
