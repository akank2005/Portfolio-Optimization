import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";

function toPercent(value) {
  return Number.isFinite(value) ? value * 100 : null;
}

function FrontierChart({ data, simulation, strategy = "max_sharpe" }) {
  const chartRef = useRef(null);
  const plotlyRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const [plotlyError, setPlotlyError] = useState("");
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);

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

  const zoomChart = (factor) => {
    if (!chartRef.current || !plotlyRef.current || !chartRef.current._fullLayout) {
      return;
    }

    const xaxis = chartRef.current._fullLayout.xaxis;
    const yaxis = chartRef.current._fullLayout.yaxis;
    if (!xaxis || !yaxis || !Array.isArray(xaxis.range) || !Array.isArray(yaxis.range)) {
      return;
    }

    const xCenter = (xaxis.range[0] + xaxis.range[1]) / 2;
    const yCenter = (yaxis.range[0] + yaxis.range[1]) / 2;
    const xHalf = (xaxis.range[1] - xaxis.range[0]) * factor * 0.5;
    const yHalf = (yaxis.range[1] - yaxis.range[0]) * factor * 0.5;

    plotlyRef.current.relayout(chartRef.current, {
      "xaxis.range": [xCenter - xHalf, xCenter + xHalf],
      "yaxis.range": [yCenter - yHalf, yCenter + yHalf],
    });
  };

  const resetZoom = () => {
    if (!chartRef.current || !plotlyRef.current) {
      return;
    }
    plotlyRef.current.relayout(chartRef.current, {
      "xaxis.autorange": true,
      "yaxis.autorange": true,
    });
  };

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
        plotlyRef.current = Plotly;
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
        mode: "lines+markers",
        name: "Efficient Frontier",
        x: sortedFrontier.map((point) => toPercent(point.volatility)),
        y: sortedFrontier.map((point) => toPercent(point.return)),
        line: { color: "#3b82f6", width: 3 },
        marker: {
          size: 12,
          color: "#3b82f6",
          opacity: 0,
          line: { width: 0 },
        },
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
        clickmode: "event+select",
        dragmode: "zoom",
        xaxis: {
          title: "Volatility (%)",
          gridcolor: "rgba(255,255,255,0.1)",
          zerolinecolor: "rgba(255,255,255,0.12)",
          fixedrange: false,
        },
        yaxis: {
          title: "Expected Return (%)",
          gridcolor: "rgba(255,255,255,0.1)",
          zerolinecolor: "rgba(255,255,255,0.12)",
          fixedrange: false,
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
        displayModeBar: true,
        modeBarButtonsToAdd: ["zoom2d", "zoomIn2d", "zoomOut2d", "resetScale2d"],
        scrollZoom: true,
      };

      const traces = [];
      if (simulationTrace) {
        traces.push(simulationTrace);
      }
      traces.push(frontierTrace, assetTrace, optimalTrace);

      const selectedTrace = selectedPortfolio ? {
        type: "scatter",
        mode: "markers",
        name: "Selected Portfolio",
        x: [toPercent(selectedPortfolio.volatility)],
        y: [toPercent(selectedPortfolio.return)],
        marker: {
          color: selectedPortfolio.type === 'frontier' ? '#3b82f6' : selectedPortfolio.sharpe > 0 ? '#1d4ed8' : '#facc15',
          size: 14,
          symbol: 'circle',
          line: { color: 'white', width: 3 },
        },
        hovertemplate:
          selectedPortfolio.type === 'frontier'
            ? "Selected Frontier<br>Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<extra></extra>"
            : "Selected Simulation<br>Volatility: %{x:.2f}%<br>Return: %{y:.2f}%<br>Sharpe: " +
              (Number.isFinite(selectedPortfolio.sharpe) ? selectedPortfolio.sharpe.toFixed(2) : 'N/A') +
              "<extra></extra>",
      } : null;

      if (selectedTrace) {
        traces.push(selectedTrace);
      }

      await Plotly.react(chartRef.current, traces, layout, config);

      const handleClick = (eventData) => {
        if (eventData.points && eventData.points.length > 0) {
          const point = eventData.points[0];

          if (point.data?.name === 'Efficient Frontier') {
            let minDist = Infinity;
            let nearest = null;
            frontier.forEach((p) => {
              const dist = Math.sqrt((p.volatility - point.x / 100) ** 2 + (p.return - point.y / 100) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearest = p;
              }
            });
            if (nearest) {
              setSelectedPortfolio({
                type: 'frontier',
                return: nearest.return,
                volatility: nearest.volatility,
                sharpe: nearest.sharpe,
                weights: nearest.weights,
              });
            }
          } else if (point.data?.name === 'Simulated Portfolios') {
            const sharpeValue = point.marker?.color ?? point.data?.marker?.color ?? null;
            setSelectedPortfolio({
              type: 'simulation',
              return: point.y / 100,
              volatility: point.x / 100,
              sharpe: Number.isFinite(sharpeValue) ? sharpeValue : null,
            });
          } else {
            setSelectedPortfolio(null);
          }
        }
      };

      if (chartRef.current && typeof chartRef.current.off === 'function' && clickHandlerRef.current) {
        chartRef.current.off('plotly_click', clickHandlerRef.current);
      }
      if (chartRef.current && typeof chartRef.current.on === 'function') {
        chartRef.current.on('plotly_click', handleClick);
        clickHandlerRef.current = handleClick;
      }

      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderChart();

    return () => {
      isMounted = false;
      if (chartRef.current && typeof chartRef.current.off === 'function' && clickHandlerRef.current) {
        chartRef.current.off('plotly_click', clickHandlerRef.current);
      }
    };
  }, [frontier, optimal, tickers, assetPoints, simulationData, optimalMarker, selectedPortfolio]);

  if (!frontier.length || !optimal) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        Run an optimization to view the efficient frontier chart.
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-slate-800 bg-[#161b2e] p-4 shadow-sm">
      <p className="mb-2 text-[13px] uppercase tracking-[0.18em] text-slate-400">Frontier Analysis</p>
      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}
      <div ref={chartRef} className="h-[440px] w-full" />
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-2 text-xs text-slate-200 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={() => zoomChart(0.75)}
          className="rounded bg-slate-800 px-2 py-1 transition hover:bg-slate-700"
        >
          Zoom In
        </button>
        <button
          type="button"
          onClick={() => zoomChart(1.25)}
          className="rounded bg-slate-800 px-2 py-1 transition hover:bg-slate-700"
        >
          Zoom Out
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="rounded bg-slate-800 px-2 py-1 transition hover:bg-slate-700"
        >
          Reset
        </button>
      </div>
      <div className="absolute top-4 right-4 bg-[#1e2433] rounded-lg p-4 text-white text-sm max-w-xs transition-all duration-300">
        {selectedPortfolio ? (
          <>
            <div className="font-semibold mb-2">Selected Portfolio</div>
            <div className="space-y-1 mb-3">
              <div>
                Return: {Number.isFinite(selectedPortfolio?.return) ? `${toPercent(selectedPortfolio.return).toFixed(2)}%` : "N/A"}
              </div>
              <div>
                Volatility: {Number.isFinite(selectedPortfolio?.volatility) ? `${toPercent(selectedPortfolio.volatility).toFixed(2)}%` : "N/A"}
              </div>
              <div>
                Sharpe: {Number.isFinite(selectedPortfolio?.sharpe) ? selectedPortfolio.sharpe.toFixed(2) : "N/A"}
              </div>
            </div>
            {selectedPortfolio.type === 'frontier' && selectedPortfolio.weights && (
              <div>
                <div className="font-semibold mb-1">Weights:</div>
                {selectedPortfolio.weights.map((weight, idx) => {
                  if (weight === 0) return null;
                  const ticker = tickers[idx] || `Asset ${idx + 1}`;
                  const percent = (weight * 100).toFixed(1);
                  const barWidth = Math.max(weight * 100, 1);
                  return (
                    <div key={idx} className="flex items-center space-x-2 text-xs">
                      <span className="w-12">{ticker}</span>
                      <div className="flex-1 bg-gray-600 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${barWidth}%` }}></div>
                      </div>
                      <span className="w-10 text-right">{percent}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedPortfolio.type === 'simulation' && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
                Weights unavailable for simulated portfolios.
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-gray-400">← Click any point to explore</div>
        )}
      </div>
      {(!assetPoints || assetPoints.length === 0) && tickers.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Asset dots require per-asset return/volatility data (optional <code>data.assets</code> field).
        </p>
      )}
    </div>
  );
}

export default FrontierChart;
