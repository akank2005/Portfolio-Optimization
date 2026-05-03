import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return `${value.toFixed(2)}%`;
}

function Backtester({ tickers = [], weights = [], start, end, riskFreeRate = 0.04 }) {
  const comparisonChartRef = useRef(null);
  const drawdownChartRef = useRef(null);

  const [backtest, setBacktest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plotlyError, setPlotlyError] = useState("");

  const hasValidInputs = useMemo(
    () => tickers.length > 0 && weights.length === tickers.length && Boolean(start) && Boolean(end),
    [tickers, weights, start, end]
  );

  useEffect(() => {
    if (!hasValidInputs) {
      setBacktest(null);
      return;
    }

    let isMounted = true;

    async function fetchBacktest() {
      setLoading(true);
      setError("");
      try {
        const response = await axios.post(`${API_BASE_URL}/backtest`, {
          tickers,
          weights,
          start,
          end,
          risk_free_rate: riskFreeRate,
        });
        if (isMounted) {
          setBacktest(response.data);
        }
      } catch (err) {
        const apiMessage = err?.response?.data?.detail;
        if (isMounted) {
          setBacktest(null);
          setError(typeof apiMessage === "string" ? apiMessage : "Unable to run backtest right now.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchBacktest();
    return () => {
      isMounted = false;
    };
  }, [hasValidInputs, tickers, weights, start, end, riskFreeRate]);

  useEffect(() => {
    if (!backtest) {
      return;
    }

    let isMounted = true;

    async function renderCharts() {
      if (!comparisonChartRef.current || !drawdownChartRef.current) {
        return;
      }

      let Plotly;
      try {
        const plotlyModule = await import("plotly.js-dist");
        Plotly = plotlyModule.default;
      } catch {
        if (isMounted) {
          setPlotlyError("Unable to load chart library. Please refresh the page.");
        }
        return;
      }

      const dates = backtest?.dates ?? [];
      const portfolio = backtest?.portfolio_cumulative ?? [];
      const spy = backtest?.spy_cumulative ?? [];
      const equalWeight = backtest?.equal_cumulative ?? [];
      const drawdown = backtest?.drawdown ?? [];

      const perfTraces = [
        {
          type: "scatter",
          mode: "lines",
          name: "Optimal Portfolio",
          x: dates,
          y: portfolio,
          line: { color: "#3b82f6", width: 2.5 },
          hovertemplate: "Date: %{x}<br>Portfolio: %{y:.2f}%<extra></extra>",
        },
        {
          type: "scatter",
          mode: "lines",
          name: "Equal Weight",
          x: dates,
          y: equalWeight,
          line: { color: "#f97316", width: 2, dash: "dash" },
          hovertemplate: "Date: %{x}<br>Equal Weight: %{y:.2f}%<extra></extra>",
        },
        {
          type: "scatter",
          mode: "lines",
          name: "S&P 500",
          x: dates,
          y: spy,
          line: { color: "#94a3b8", width: 2, dash: "dash" },
          hovertemplate: "Date: %{x}<br>S&P 500: %{y:.2f}%<extra></extra>",
        },
      ];

      const perfLayout = {
        title: { text: "Portfolio vs S&P 500", font: { size: 18, color: "#e2e8f0" } },
        xaxis: { title: "Date", gridcolor: "rgba(255,255,255,0.1)" },
        yaxis: { title: "Cumulative Return (%)", gridcolor: "rgba(255,255,255,0.1)" },
        margin: { l: 60, r: 20, t: 60, b: 60 },
        paper_bgcolor: "#161b2e",
        plot_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
      };

      const drawdownTrace = [
        {
          type: "scatter",
          mode: "lines",
          name: "Drawdown",
          x: dates,
          y: drawdown,
          fill: "tozeroy",
          line: { color: "#dc2626", width: 1.5 },
          fillcolor: "rgba(220, 38, 38, 0.25)",
          hovertemplate: "Date: %{x}<br>Drawdown: %{y:.2f}%<extra></extra>",
        },
      ];

      const drawdownLayout = {
        title: { text: "Portfolio Drawdown", font: { size: 18, color: "#e2e8f0" } },
        xaxis: { title: "Date", gridcolor: "rgba(255,255,255,0.1)" },
        yaxis: { title: "Drawdown (%)", gridcolor: "rgba(255,255,255,0.1)" },
        margin: { l: 60, r: 20, t: 60, b: 60 },
        paper_bgcolor: "#161b2e",
        plot_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
      };

      await Plotly.newPlot(comparisonChartRef.current, perfTraces, perfLayout, {
        responsive: true,
        displayModeBar: false,
      });
      await Plotly.newPlot(drawdownChartRef.current, drawdownTrace, drawdownLayout, {
        responsive: true,
        displayModeBar: false,
      });

      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderCharts();
    return () => {
      isMounted = false;
    };
  }, [backtest]);

  if (!hasValidInputs) {
    return (
      <section className="rounded-xl border border-slate-700 bg-[#111827] p-6 text-center text-sm text-slate-400">
        Run optimization first to load backtest inputs.
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-[#161b2e] p-6 shadow-sm">
        <div className="flex items-center gap-3 text-blue-700">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
          <p className="text-sm font-medium">Running backtest...</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-6 text-sm text-rose-300">
        {error}
      </section>
    );
  }

  if (!backtest) {
    return null;
  }

  const portfolioBeatsSpy = backtest.total_return > backtest.spy_total_return;
  const portfolioBeatsEqualWeight = backtest.total_return > backtest.equal_total_return;
  const equalWeightBeatsSpy = backtest.equal_total_return > backtest.spy_total_return;
  const equalWeightBeatsPortfolio = backtest.equal_total_return > backtest.total_return;

  let insightMessage = "";
  if (portfolioBeatsEqualWeight && portfolioBeatsSpy) {
    insightMessage = "The optimized portfolio outperformed both benchmarks over this period.";
  } else if (equalWeightBeatsPortfolio) {
    insightMessage =
      "Equal weighting outperformed the optimizer — this may indicate the assets are highly correlated or the time period is too short.";
  } else if (!portfolioBeatsSpy) {
    insightMessage =
      "The S&P 500 outperformed both portfolios — consider adding more diversified assets.";
  }

  let equalWeightReturnColor = "text-slate-100";
  if (equalWeightBeatsPortfolio && equalWeightBeatsSpy) {
    equalWeightReturnColor = "text-emerald-400";
  } else if (equalWeightBeatsSpy) {
    equalWeightReturnColor = "text-emerald-400";
  } else if (portfolioBeatsEqualWeight) {
    equalWeightReturnColor = "text-rose-400";
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#161b2e] p-5 shadow-sm">
      <p className="mb-3 text-[13px] uppercase tracking-[0.18em] text-slate-400">Backtest</p>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Portfolio Total Return</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${portfolioBeatsSpy ? "text-emerald-400" : "text-rose-400"}`}>
            {formatPercent(backtest.total_return)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Equal Weight Total Return</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${equalWeightReturnColor}`}>
            {formatPercent(backtest.equal_total_return)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">S&P 500 Total Return</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-100">{formatPercent(backtest.spy_total_return)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Max Drawdown</p>
          <div className="mt-2 space-y-1">
            <p className="text-lg font-bold tabular-nums text-rose-400">{formatPercent(backtest.max_drawdown)}</p>
            <p className="text-xs text-slate-500">Portfolio</p>
            <p className="text-xs font-semibold tabular-nums text-orange-400">{formatPercent(backtest.equal_max_drawdown)}</p>
            <p className="text-xs text-slate-500">Equal Weight</p>
          </div>
        </div>
      </div>

      {insightMessage && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-3">
          <p className="text-sm text-slate-300">{insightMessage}</p>
        </div>
      )}

      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}

      <div ref={comparisonChartRef} className="mb-6 h-[360px] w-full" />
      <div ref={drawdownChartRef} className="h-[300px] w-full" />
    </section>
  );
}

export default Backtester;
