import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

function getTodayISODate() {
  return new Date().toISOString().split("T")[0];
}

function normalizeTicker(ticker) {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

const PortfolioInputContext = createContext(null);

function usePortfolioInput() {
  const ctx = useContext(PortfolioInputContext);
  if (!ctx) {
    throw new Error("Portfolio input components must be used within PortfolioInputProvider");
  }
  return ctx;
}

export function PortfolioInputProvider({ loading = false, onInputStateChange, children }) {
  const [tickerInput, setTickerInput] = useState("");
  const [tickers, setTickers] = useState([]);
  const [start, setStart] = useState("2020-01-01");
  const [end, setEnd] = useState(getTodayISODate());
  const [riskFreeRate, setRiskFreeRate] = useState("4.5");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [rawConstraints, setRawConstraints] = useState({});

  const parseConstraintValue = useCallback((value) => {
    const trimmed = String(value).trim();
    if (trimmed === "") {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return Math.min(100, Math.max(0, parsed));
  }, []);

  const constraintsFromInput = useMemo(
    () =>
      tickers.map((t) => {
        const raw = rawConstraints[t.ticker] || { min: "", max: "" };
        const min = parseConstraintValue(raw.min);
        const max = parseConstraintValue(raw.max);
        return {
          ticker: t.ticker,
          min: min === null ? null : min / 100,
          max: max === null ? null : max / 100,
        };
      }),
    [tickers, rawConstraints, parseConstraintValue]
  );

  useEffect(() => {
    const rf = Number(riskFreeRate);
    onInputStateChange?.({
      tickers: tickers.map((t) => t.ticker),
      start,
      end,
      riskFreeRatePercent: Number.isFinite(rf) ? rf : 0,
      constraints: constraintsFromInput,
    });
  }, [constraintsFromInput, end, onInputStateChange, riskFreeRate, start, tickers]);

  const validateConstraints = useCallback(() => {
    for (let i = 0; i < constraintsFromInput.length; i++) {
      const { ticker, min, max } = constraintsFromInput[i];
      if (min !== null && max !== null && min > max) {
        return `${ticker}: Min must be ≤ Max`;
      }
    }
    const sumMins = constraintsFromInput.reduce((sum, c) => sum + (c.min || 0), 0);
    if (sumMins >= 1) {
      return "Sum of all minimums must be < 100%";
    }
    return "";
  }, [constraintsFromInput]);

  const addTicker = useCallback(() => {
    const normalized = normalizeTicker(tickerInput);
    if (!normalized) {
      return;
    }

    if (tickers.some(t => t.ticker === normalized)) {
      setError(`Ticker "${normalized}" is already in the list.`);
      setTickerInput("");
      return;
    }

    setTickers((prev) => [...prev, { ticker: normalized, min: null, max: null }]);
    setRawConstraints((prev) => ({
      ...prev,
      [normalized]: { min: "", max: "" },
    }));
    setTickerInput("");
    setError("");
  }, [tickerInput, tickers]);

  const removeTicker = useCallback((tickerToRemove) => {
    setTickers((prev) => prev.filter((t) => t.ticker !== tickerToRemove));
    setRawConstraints((prev) => {
      const next = { ...prev };
      delete next[tickerToRemove];
      return next;
    });
    setError("");
  }, []);

  const addTickerFromValue = useCallback(
    (rawValue) => {
      const normalized = normalizeTicker(rawValue);
      if (!normalized) {
        return;
      }

      if (tickers.some(t => t.ticker === normalized)) {
        setError(`Ticker "${normalized}" is already in the list.`);
        return;
      }

      setTickers((prev) => [...prev, { ticker: normalized, min: null, max: null }]);
      setRawConstraints((prev) => ({
        ...prev,
        [normalized]: { min: "", max: "" },
      }));
      setTickerInput("");
      setSuggestions([]);
      setShowSuggestions(false);
      setError("");
    },
    [tickers]
  );

  const handleTickerKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          addTickerFromValue(suggestions[0].symbol);
        } else {
          addTicker();
        }
      }
    },
    [showSuggestions, suggestions, addTickerFromValue, addTicker]
  );

  useEffect(() => {
    const query = tickerInput.trim();
    if (!query) {
      setSuggestions([]);
      return undefined;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/search-tickers`, {
          params: { q: query },
        });
        const results = Array.isArray(response?.data?.results) ? response.data.results : [];
        setSuggestions(results.slice(0, 12));
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [tickerInput]);

  const value = useMemo(
    () => ({
      loading,
      tickerInput,
      setTickerInput,
      tickers,
      start,
      setStart,
      end,
      setEnd,
      riskFreeRate,
      setRiskFreeRate,
      error,
      setError,
      suggestions,
      showSuggestions,
      setShowSuggestions,
      addTicker,
      removeTicker,
      addTickerFromValue,
      handleTickerKeyDown,
      rawConstraints,
      setRawConstraints,
      validateConstraints,
    }),
    [
      loading,
      tickerInput,
      tickers,
      start,
      end,
      riskFreeRate,
      error,
      suggestions,
      showSuggestions,
      addTicker,
      removeTicker,
      addTickerFromValue,
      handleTickerKeyDown,
      rawConstraints,
      setRawConstraints,
      validateConstraints,
    ]
  );

  return <PortfolioInputContext.Provider value={value}>{children}</PortfolioInputContext.Provider>;
}

export function TickerSearchColumn() {
  const {
    loading,
    tickerInput,
    setTickerInput,
    tickers,
    suggestions,
    showSuggestions,
    setShowSuggestions,
    addTicker,
    removeTicker,
    addTickerFromValue,
    handleTickerKeyDown,
    rawConstraints,
    setRawConstraints,
    error,
    validateConstraints,
  } = usePortfolioInput();

  const showTickerPlaceholder = tickers.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          type="text"
          value={tickerInput}
          onChange={(event) => {
            setTickerInput(event.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleTickerKeyDown}
          placeholder="e.g. AAPL or Apple"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition placeholder:text-slate-500 focus:border-blue-500"
          disabled={loading}
        />
        <button
          type="button"
          onClick={addTicker}
          disabled={loading}
          className="shrink-0 rounded-xl border border-slate-700 bg-[#1f2937] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-xl border border-slate-700 bg-[#111827] shadow-sm">
          {suggestions.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => addTickerFromValue(item.symbol)}
              className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800"
            >
              <span className="font-semibold text-slate-100">{item.symbol}</span>
              <span className="truncate text-slate-400">{item.name}</span>
            </button>
          ))}
        </div>
      )}
      {showTickerPlaceholder ? (
        <div className="rounded-xl border border-dashed border-slate-600 bg-[#111827]/40 px-3 py-6 text-center text-xs text-slate-500">
          Add at least 2 tickers to get started
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            {tickers.map((ticker) => (
              <div key={ticker.ticker} className="border-b border-slate-700/50 py-3 last:border-0">
                <div className="flex items-center gap-4">
                  {/* Ticker name */}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-100">{ticker.ticker}</span>
                  </div>

                  {/* Min % input */}
                  <div className="flex flex-col">
                    <label className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Min %</label>
                    <input
                      type="text"
                      value={rawConstraints[ticker.ticker]?.min ?? ""}
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        setRawConstraints((prev) => ({
                          ...prev,
                          [ticker.ticker]: {
                            ...(prev[ticker.ticker] || {}),
                            min: rawValue,
                          },
                        }));
                      }}
                      placeholder="0"
                      disabled={loading}
                      className="w-[80px] rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>

                  {/* Max % input */}
                  <div className="flex flex-col">
                    <label className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Max %</label>
                    <input
                      type="text"
                      value={rawConstraints[ticker.ticker]?.max ?? ""}
                      onChange={(e) => {
                        const rawValue = e.target.value;
                        setRawConstraints((prev) => ({
                          ...prev,
                          [ticker.ticker]: {
                            ...(prev[ticker.ticker] || {}),
                            max: rawValue,
                          },
                        }));
                      }}
                      className="w-[80px] rounded-lg border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                    />
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeTicker(ticker.ticker)}
                    disabled={loading}
                    className="ml-2 rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Remove ${ticker.ticker}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {validateConstraints() && (
            <p className="text-xs text-rose-400">{validateConstraints()}</p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

export function DateRangeColumn() {
  const { loading, start, setStart, end, setEnd, riskFreeRate, setRiskFreeRate } = usePortfolioInput();

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">Start</span>
        <input
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          max={end || undefined}
          className="w-full rounded-xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500"
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">End</span>
        <input
          type="date"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          min={start || undefined}
          max={getTodayISODate()}
          className="w-full rounded-xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500"
          disabled={loading}
        />
      </div>
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">RISK-FREE RATE</span>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={riskFreeRate}
          onChange={(event) => setRiskFreeRate(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500"
          disabled={loading}
        />
        <p className="text-xs text-slate-500">Current 3-month T-bill rate (~4-5%)</p>
      </div>
    </div>
  );
}

export default PortfolioInputProvider;
