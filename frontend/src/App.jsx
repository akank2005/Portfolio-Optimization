import React from "react";
import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import PortfolioInputProvider, {
  TickerSearchColumn,
  DateRangeColumn,
} from "./components/TickerInput";
import FrontierChart from "./components/FrontierChart";
import WeightsChart from "./components/WeightsChart";
import StatsTable from "./components/StatsTable";
import PriceHistoryViewer from "./components/PriceHistoryViewer";
import CorrelationHeatmap from "./components/CorrelationHeatmap";
import Backtester from "./components/Backtester";
import RebalancingCalculator from "./components/RebalancingCalculator";
import StrategySelector from "./components/StrategySelector";

const API_BASE_URL = "http://localhost:8000";

function getTodayISODate() {
  return new Date().toISOString().split("T")[0];
}

function App() {
  const [results, setResults] = useState(null);
  const [correlationData, setCorrelationData] = useState(null);
  const [lastTickers, setLastTickers] = useState([]);
  const [lastQuery, setLastQuery] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState("max_sharpe");
  const [maxVolatility, setMaxVolatility] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarInput, setSidebarInput] = useState({
    tickers: [],
    start: "2020-01-01",
    end: getTodayISODate(),
  });

  const sidebarCanOptimize = useMemo(() => {
    const { tickers, start, end } = sidebarInput;
    return tickers.length >= 2 && Boolean(start && end && start <= end);
  }, [sidebarInput]);

  const handleInputStateChange = useCallback((payload) => {
    setSidebarInput(payload);
  }, []);

  const runOptimization = useCallback(async (tickers, start, end, strategy, maxVol, riskFreeRatePercent, constraints) => {
    setLoading(true);
    setError("");

    try {
      const payload = { tickers, start, end, strategy, risk_free_rate: riskFreeRatePercent / 100 };
      if (strategy === "max_return") {
        payload.max_volatility = Number(maxVol) / 100;
      }
      if (constraints && constraints.length > 0) {
        payload.constraints = constraints.map((c) => ({
          ticker: c.ticker,
          min: c.min,
          max: c.max,
        }));
      }
      const [optimizeResponse, correlationResponse] = await Promise.all([
        axios.post(`${API_BASE_URL}/optimize`, payload),
        axios.post(`${API_BASE_URL}/correlations`, payload),
      ]);
      setResults(optimizeResponse.data);
      setCorrelationData(correlationResponse.data);
      setLastTickers(tickers);
      setLastQuery({ start, end });
    } catch (err) {
      const apiMessage = err?.response?.data?.detail;
      const fallbackMessage =
        "Unable to optimize portfolio right now. Check your input values and make sure the backend is running.";
      setResults(null);
      setCorrelationData(null);
      setError(typeof apiMessage === "string" ? apiMessage : fallbackMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOptimizeClick = useCallback(async () => {
    const { tickers, start, end, riskFreeRatePercent, constraints } = sidebarInput;
    if (tickers.length < 2 || !start || !end || start > end || loading) {
      return;
    }
    await runOptimization(tickers, start, end, selectedStrategy, maxVolatility, riskFreeRatePercent, constraints);
  }, [sidebarInput, loading, runOptimization, selectedStrategy, maxVolatility]);

  const handleStrategyChange = useCallback(
    (strategy, sliderValue) => {
      setSelectedStrategy(strategy);
      if (typeof sliderValue === "number") {
        setMaxVolatility(sliderValue);
      }

      if (results && lastQuery && lastTickers.length > 0) {
        const volatilityToUse = typeof sliderValue === "number" ? sliderValue : maxVolatility;
        const { riskFreeRatePercent, constraints } = sidebarInput;
        runOptimization(lastTickers, lastQuery.start, lastQuery.end, strategy, volatilityToUse, riskFreeRatePercent, constraints);
      }
    },
    [results, lastQuery, lastTickers, maxVolatility, runOptimization, sidebarInput]
  );

  return (
    <div className="min-h-screen bg-[#0f1117] font-['Inter',system-ui,sans-serif] text-[#e2e8f0]">
      <header className="border-b border-slate-800 bg-[#111827]">
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-[13px] uppercase tracking-[0.2em] text-slate-400">Portfolio Lab</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-100">Portfolio Optimizer Dashboard</h1>
        </div>
      </header>

      <PortfolioInputProvider loading={loading} onInputStateChange={handleInputStateChange}>
        <div className="border-b border-slate-800 bg-[#161b2e]">
          <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-0 lg:[grid-template-columns:1fr_1fr_1fr]">
              <div className="flex flex-col gap-3 border-slate-800 lg:border-r lg:pr-8">
                <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Tickers</p>
                <TickerSearchColumn />
              </div>
              <div className="flex flex-col gap-3 border-slate-800 lg:border-r lg:px-8">
                <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Date range</p>
                <DateRangeColumn />
              </div>
              <div className="flex flex-col gap-3 lg:pl-8">
                <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Strategy</p>
                <StrategySelector
                  selectedStrategy={selectedStrategy}
                  onStrategyChange={handleStrategyChange}
                  loading={loading}
                  compact
                  hideOuterLabel
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-800 pt-5">
              <p className="text-center text-xs leading-relaxed text-slate-500">
                Portfolios are optimized using historical return data from Yahoo Finance.
              </p>
              <button
                type="button"
                onClick={handleOptimizeClick}
                disabled={!sidebarCanOptimize || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {loading ? (
                  <>
                    <span
                      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      aria-hidden
                    />
                    Optimizing...
                  </>
                ) : (
                  "Optimize"
                )}
              </button>
            </div>
          </div>
        </div>
      </PortfolioInputProvider>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <section className="flex items-center gap-3 rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-blue-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400/40 border-t-blue-300" />
            <span className="text-sm font-medium">Optimizing portfolio...</span>
          </section>
        )}

        {error && (
          <section className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-rose-300">
            <p className="text-sm font-medium">{error}</p>
          </section>
        )}

        {results && !loading && (
          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="xl:col-span-2">
              <FrontierChart data={results} simulation={results.simulation} />
            </div>
            <WeightsChart optimal={results.optimal} tickers={results.tickers} />
            <StatsTable optimal={results.optimal} tickers={results.tickers} />
            {correlationData ? (
              <CorrelationHeatmap data={correlationData} />
            ) : (
              <div />
            )}
            <PriceHistoryViewer
              tickers={results.tickers}
              defaultStart={lastQuery?.start ?? "2020-01-01"}
              defaultEnd={lastQuery?.end}
            />
            <div className="xl:col-span-2">
              <Backtester
                tickers={results.tickers}
                weights={results.optimal?.weights ?? []}
                start={lastQuery?.start ?? "2020-01-01"}
                end={lastQuery?.end ?? new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="xl:col-span-2">
              <RebalancingCalculator
                tickers={results.tickers}
                weights={results.optimal?.weights ?? []}
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
