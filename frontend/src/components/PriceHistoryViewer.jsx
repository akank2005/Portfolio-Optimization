import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

function getTodayISODate() {
  return new Date().toISOString().split("T")[0];
}

function formatISODate(date) {
  return date.toISOString().split("T")[0];
}

function PriceHistoryViewer({ tickers = [], defaultStart = "2020-01-01", defaultEnd }) {
  const chartRef = useRef(null);
  const [selectedTicker, setSelectedTicker] = useState(tickers[0] ?? "");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd || getTodayISODate());
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plotlyError, setPlotlyError] = useState("");
  const [activeRange, setActiveRange] = useState("");

  useEffect(() => {
    if (!tickers.length) {
      setSelectedTicker("");
      return;
    }
    if (!selectedTicker || !tickers.includes(selectedTicker)) {
      setSelectedTicker(tickers[0]);
    }
  }, [tickers, selectedTicker]);

  const canFetch = useMemo(
    () => Boolean(selectedTicker) && Boolean(start) && Boolean(end) && start <= end && !loading,
    [selectedTicker, start, end, loading]
  );

  const fetchPrices = async (override = {}) => {
    const tickerToUse = override.ticker ?? selectedTicker;
    const startToUse = override.start ?? start;
    const endToUse = override.end ?? end;

    if (!tickerToUse) {
      setError("Select a ticker first.");
      return;
    }
    if (!startToUse || !endToUse || startToUse > endToUse) {
      setError("Choose a valid date range.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.get(`${API_BASE_URL}/prices`, {
        params: {
          ticker: tickerToUse,
          start: startToUse,
          end: endToUse,
        },
      });
      const fetched = Array.isArray(response?.data?.prices) ? response.data.prices : [];
      setPrices(fetched);
    } catch (err) {
      const apiMessage = err?.response?.data?.detail;
      const fallback = "Unable to load price history for the selected ticker.";
      setPrices([]);
      setError(typeof apiMessage === "string" ? apiMessage : fallback);
    } finally {
      setLoading(false);
    }
  };

  const applyPresetRange = (preset) => {
    const today = new Date();
    const endDate = formatISODate(today);
    const startDate = new Date(today);

    switch (preset) {
      case "1D":
        startDate.setDate(today.getDate() - 1);
        break;
      case "5D":
        startDate.setDate(today.getDate() - 5);
        break;
      case "1M":
        startDate.setMonth(today.getMonth() - 1);
        break;
      case "6M":
        startDate.setMonth(today.getMonth() - 6);
        break;
      case "YTD":
        startDate.setMonth(0, 1);
        break;
      case "1Y":
        startDate.setFullYear(today.getFullYear() - 1);
        break;
      case "5Y":
        startDate.setFullYear(today.getFullYear() - 5);
        break;
      default:
        return;
    }

    setStart(formatISODate(startDate));
    setEnd(endDate);
    setActiveRange(preset);
    fetchPrices({
      ticker: selectedTicker,
      start: formatISODate(startDate),
      end: endDate,
    });
  };

  useEffect(() => {
    if (selectedTicker && start && end && start <= end) {
      fetchPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicker]);

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
      } catch {
        if (isMounted) {
          setPlotlyError("Unable to load chart library. Please refresh the page.");
        }
        return;
      }

      if (!prices.length) {
        Plotly.purge(chartRef.current);
        return;
      }

      const trace = {
        type: "scatter",
        mode: "lines",
        x: prices.map((point) => point.date),
        y: prices.map((point) => point.price),
        line: { color: "#3b82f6", width: 2 },
        name: selectedTicker,
        hovertemplate: "Date: %{x}<br>Price: $%{y:.2f}<extra></extra>",
      };

      const layout = {
        title: {
          text: `${selectedTicker} Historical Prices`,
          font: { size: 18, color: "#e2e8f0" },
        },
        xaxis: { title: "Date", gridcolor: "rgba(255,255,255,0.1)" },
        yaxis: { title: "Adjusted Close (USD)", gridcolor: "rgba(255,255,255,0.1)" },
        margin: { l: 60, r: 20, t: 60, b: 60 },
        paper_bgcolor: "#161b2e",
        plot_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
        hoverlabel: { bgcolor: "#111827", bordercolor: "#334155", font: { color: "#e2e8f0" } },
      };

      await Plotly.newPlot(chartRef.current, [trace], { ...layout }, { responsive: true, displayModeBar: false });
      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [prices, selectedTicker]);

  return (
    <section className="rounded-xl border border-slate-800 bg-[#161b2e] p-5 shadow-sm">
      <div className="mb-4">
        <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Price Explorer</p>
        <p className="text-sm text-slate-400">Click a stock and load its price history for your chosen date range.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tickers.map((ticker) => (
          <button
            key={ticker}
            type="button"
            onClick={() => setSelectedTicker(ticker)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              selectedTicker === ticker
                ? "bg-blue-500 text-white"
                : "bg-[#111827] text-slate-300 hover:bg-slate-700"
            }`}
          >
            {ticker}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPresetRange(preset)}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
              activeRange === preset
                ? "bg-blue-500 text-white"
                : "border border-slate-700 bg-[#111827] text-slate-300 hover:bg-slate-700"
            }`}
          >
            {preset}
          </button>
        ))}
        <input
          type="date"
          value={start}
          onChange={(event) => {
            setStart(event.target.value);
            setActiveRange("");
          }}
          max={end || undefined}
          className="rounded-md border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100"
        />
        <input
          type="date"
          value={end}
          onChange={(event) => {
            setEnd(event.target.value);
            setActiveRange("");
          }}
          min={start || undefined}
          max={getTodayISODate()}
          className="rounded-md border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={fetchPrices}
          disabled={!canFetch}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {loading ? "Loading..." : "View Prices"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}

      {!prices.length && !loading ? (
        <div className="rounded-lg border border-slate-700 bg-[#111827] p-6 text-center text-sm text-slate-400">
          Select a ticker and click "View Prices" to load historical data.
        </div>
      ) : (
        <div ref={chartRef} className="h-[360px] w-full" />
      )}
    </section>
  );
}

export default PriceHistoryViewer;
