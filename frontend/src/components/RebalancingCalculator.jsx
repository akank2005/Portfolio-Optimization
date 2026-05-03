import React from "react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

const MIN_WEIGHT_FOR_MIN = 0.01;
const MAX_MIN_INVESTMENT = 1_000_000;
const MAX_SHARES_SANE = 1_000_000;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10_000_000;

function formatDollar(value) {
  if (!Number.isFinite(value)) {
    return "$0.00";
  }
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShares(value, fractional) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) > MAX_SHARES_SANE) {
    return null;
  }
  if (fractional) {
    const s = value.toFixed(4);
    return s.replace(/\.?0+$/, "") || "0";
  }
  return String(Math.max(0, Math.floor(value)));
}

function RebalancingCalculator({ tickers = [], weights = [] }) {
  const [totalAmountInput, setTotalAmountInput] = useState("");
  const [allowFractional, setAllowFractional] = useState(false);
  const [currentPrices, setCurrentPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parsedAmount = totalAmountInput.trim() === "" ? NaN : Number(totalAmountInput);
  const amountFinite = Number.isFinite(parsedAmount);

  const hasValidInputs = tickers.length > 0 && tickers.length === weights.length;

  const hasAllocatedForMinimum = useMemo(() => {
    if (!hasValidInputs) {
      return false;
    }
    return weights.some((w) => Number(w) > MIN_WEIGHT_FOR_MIN);
  }, [hasValidInputs, weights]);

  const totalAmount = parsedAmount;

  const zeroOrNegativeWarning =
    totalAmountInput.trim() !== "" && amountFinite && totalAmount <= 0;

  const rangeWarning =
    amountFinite &&
    totalAmount > 0 &&
    (totalAmount < MIN_AMOUNT || totalAmount > MAX_AMOUNT);

  const hasValidAmount = amountFinite && totalAmount >= MIN_AMOUNT && totalAmount <= MAX_AMOUNT;

  useEffect(() => {
    if (!hasValidInputs) {
      setCurrentPrices({});
      setError("");
      return;
    }

    let isMounted = true;
    const tickersParam = tickers.join(",");

    async function fetchCurrentPrices() {
      setLoading(true);
      setError("");
      try {
        const response = await axios.get(`${API_BASE_URL}/prices`, {
          params: { tickers: tickersParam },
        });

        const payload = response?.data ?? {};
        const parsed =
          payload.current_prices && typeof payload.current_prices === "object"
            ? payload.current_prices
            : payload.prices && typeof payload.prices === "object"
            ? payload.prices
            : payload;

        if (isMounted) {
          setCurrentPrices(parsed || {});
        }
      } catch (err) {
        const apiMessage = err?.response?.data?.detail;
        if (isMounted) {
          setCurrentPrices({});
          setError(typeof apiMessage === "string" ? apiMessage : "Unable to fetch current prices.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchCurrentPrices();
    return () => {
      isMounted = false;
    };
  }, [hasValidInputs, tickers]);

  const excludedByOptimizerCount = useMemo(() => {
    if (!hasValidInputs) {
      return 0;
    }
    return weights.reduce((n, w) => (Number(w) <= 0 ? n + 1 : n), 0);
  }, [hasValidInputs, weights]);

  const { minimumInvestment, minReady, minCapError } = useMemo(() => {
    if (!hasValidInputs || !hasAllocatedForMinimum) {
      return { minimumInvestment: 0, minReady: false, minCapError: false };
    }
    let maxMin = 0;
    let allPriced = true;
    let anyIncluded = false;
    for (let i = 0; i < tickers.length; i += 1) {
      const weight = Number(weights[i]);
      if (weight <= MIN_WEIGHT_FOR_MIN) {
        continue;
      }
      anyIncluded = true;
      const price = Number(currentPrices[tickers[i]]);
      if (!Number.isFinite(price) || price <= 0) {
        allPriced = false;
        continue;
      }
      const minForAsset = price / weight;
      if (minForAsset > maxMin) {
        maxMin = minForAsset;
      }
    }
    if (!anyIncluded) {
      return { minimumInvestment: 0, minReady: false, minCapError: false };
    }
    const capError = allPriced && maxMin > MAX_MIN_INVESTMENT;
    return {
      minimumInvestment: maxMin,
      minReady: allPriced && maxMin > 0 && !capError,
      minCapError: capError,
    };
  }, [hasValidInputs, hasAllocatedForMinimum, tickers, weights, currentPrices]);

  const belowMinimum =
    hasValidAmount &&
    minReady &&
    Number.isFinite(minimumInvestment) &&
    totalAmount < minimumInvestment;

  const inputHasIssue = zeroOrNegativeWarning || rangeWarning || belowMinimum;

  const rows = useMemo(() => {
    if (!hasValidInputs || !hasValidAmount) {
      return [];
    }

    return tickers
      .map((ticker, idx) => {
        const weight = Number(weights[idx]);
        const price = Number(currentPrices[ticker]);
        const dollarAllocation = totalAmount * weight;
        let sharesToBuy = 0;
        let actualDollarsUsed = 0;

        if (Number.isFinite(price) && price > 0 && weight > 0) {
          const rawShares = dollarAllocation / price;
          if (allowFractional) {
            sharesToBuy = rawShares;
            actualDollarsUsed = dollarAllocation;
          } else {
            sharesToBuy = Math.floor(rawShares);
            actualDollarsUsed = sharesToBuy * price;
          }
        }

        return {
          ticker,
          weight,
          currentPrice: price,
          dollarAllocation,
          sharesToBuy,
          actualDollarsUsed,
        };
      })
      .filter((row) => row.weight > 0);
  }, [tickers, weights, currentPrices, hasValidInputs, hasValidAmount, totalAmount, allowFractional]);

  const totalUsed = rows.reduce((sum, row) => sum + row.actualDollarsUsed, 0);
  const leftoverCash = hasValidAmount ? totalAmount - totalUsed : 0;

  const leftoverSuggestion = useMemo(() => {
    if (!hasValidAmount || rows.length === 0 || leftoverCash <= 0.005) {
      return null;
    }
    let best = null;
    for (const row of rows) {
      const price = row.currentPrice;
      if (!Number.isFinite(price) || price <= 0) {
        continue;
      }
      const extraShares = leftoverCash / price;
      if (!best || extraShares > best.extraShares) {
        best = { ticker: row.ticker, extraShares, price };
      }
    }
    if (!best || best.extraShares < 1e-6) {
      return null;
    }
    return {
      text: `You have ${formatDollar(leftoverCash)} left — enough for ${best.extraShares.toFixed(2)} shares of ${best.ticker}`,
    };
  }, [hasValidAmount, rows, leftoverCash]);

  return (
    <section className="rounded-xl border border-slate-800 bg-[#161b2e] p-5 shadow-sm">
      <p className="text-[13px] uppercase tracking-[0.18em] text-slate-400">Rebalancing</p>
      <p className="mt-1 text-sm text-slate-400">
        Size trades from target weights and live prices. Toggle fractional shares to match your broker.
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-300">Total Investment Amount</label>
        <input
          type="number"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          step="0.01"
          value={totalAmountInput}
          onChange={(event) => setTotalAmountInput(event.target.value)}
          placeholder={`${MIN_AMOUNT.toLocaleString()} – ${MAX_AMOUNT.toLocaleString("en-US")}`}
          className={`w-full rounded-xl border bg-[#111827] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500 ${
            inputHasIssue ? "border-rose-500 ring-1 ring-rose-500/40" : "border-slate-700"
          }`}
        />
        {zeroOrNegativeWarning && (
          <p className="mt-2 text-sm text-rose-400">Enter a positive investment amount (minimum $1).</p>
        )}
        {rangeWarning && !zeroOrNegativeWarning && (
          <p className="mt-2 text-sm text-rose-400">
            Investment must be between {formatDollar(MIN_AMOUNT)} and {formatDollar(MAX_AMOUNT)}.
          </p>
        )}
        {belowMinimum && !zeroOrNegativeWarning && !rangeWarning && (
          <p className="mt-2 text-sm text-rose-400">
            {allowFractional ? (
              <>
                Below the whole-share minimum for fully proportional sizing (one full share of each line at these
                weights). With fractional shares enabled you can often still execute close to these weights with a
                smaller notional.
              </>
            ) : (
              <>
                This amount is below the minimum needed to buy at least one whole share of every allocated asset at
                target weights and current prices. Increase your investment, or turn on fractional shares if your broker
                supports them.
              </>
            )}
          </p>
        )}
      </div>

      {hasValidInputs && !hasAllocatedForMinimum && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-[#111827] px-4 py-3">
          <p className="text-sm font-medium text-slate-400">No assets allocated</p>
          <p className="mt-1 text-xs text-slate-500">No position has weight greater than 1%.</p>
        </div>
      )}

      {hasValidInputs && hasAllocatedForMinimum && minCapError && (
        <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3">
          <p className="text-sm text-rose-400">
            Could not calculate minimum investment. Check that all tickers are valid stocks.
          </p>
        </div>
      )}

      {hasValidInputs && hasAllocatedForMinimum && !minCapError && minReady && (
        <div className="mt-4 rounded-xl border border-blue-900/40 bg-blue-950/20 px-4 py-3">
          <p className="text-base font-semibold text-slate-100">
            Minimum investment to buy all assets: {formatDollar(minimumInvestment)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            At least one full share of each position above 1% weight (max of price ÷ weight across those holdings).
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-700 bg-[#111827] px-4 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={allowFractional}
            onChange={(event) => setAllowFractional(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-600 bg-[#0f172a] text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-300">
            <span className="font-medium text-slate-100">Allow fractional shares</span>
            <span className="block text-xs text-slate-500">Fractional shares supported by most modern brokers</span>
          </span>
        </label>
      </div>

      {loading && <p className="mt-3 text-sm text-blue-300">Fetching current prices...</p>}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {hasValidAmount && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-[#111827]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-400">Ticker</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-400">Weight</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-400">Current Price</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-400">$ Allocated</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-400">Shares to Buy</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-400">$ Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#161b2e]">
              {rows.map((row, idx) => {
                const shareStr = formatShares(row.sharesToBuy, allowFractional);
                const shareInvalid =
                  Number.isFinite(row.sharesToBuy) && Math.abs(row.sharesToBuy) > MAX_SHARES_SANE;
                return (
                  <tr key={row.ticker} className={idx % 2 === 0 ? "bg-[#161b2e]" : "bg-[#111827]/60"}>
                    <td className="px-3 py-2 text-sm font-medium text-slate-100">{row.ticker}</td>
                    <td className="px-3 py-2 text-right text-sm text-slate-300 tabular-nums">
                      {(row.weight * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-300 tabular-nums">
                      {formatDollar(row.currentPrice)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-slate-300 tabular-nums">
                      {formatDollar(row.dollarAllocation)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {shareInvalid ? (
                        <span className="text-rose-400">Could not calculate shares — check ticker data.</span>
                      ) : (
                        <span className="text-slate-300">{shareStr ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold text-slate-100 tabular-nums">
                      {formatDollar(row.actualDollarsUsed)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#0f172a]">
                <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Total Used
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold text-slate-100 tabular-nums">
                  {formatDollar(totalUsed)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {hasValidInputs && excludedByOptimizerCount > 0 && (
        <p
          className={`text-xs text-slate-500 ${hasValidAmount && rows.length > 0 ? "mt-3" : "mt-4"}`}
        >
          {excludedByOptimizerCount} {excludedByOptimizerCount === 1 ? "asset was" : "assets were"} excluded by the
          optimizer and require no investment
        </p>
      )}

      {hasValidAmount && rows.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg bg-[#111827] p-3">
          <p className="text-right text-sm text-slate-400">
            Leftover Cash:{" "}
            <span className="font-semibold text-slate-100 tabular-nums">{formatDollar(leftoverCash)}</span>
          </p>
          {leftoverSuggestion && (
            <p className="text-sm leading-snug text-blue-300/90">{leftoverSuggestion.text}</p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-600">
        Fractional trading varies by symbol and broker (e.g. Fidelity, Schwab, and Robinhood typically support fractions on
        many US equities and ETFs; check each ticker in your broker&apos;s policy).
      </p>
    </section>
  );
}

export default RebalancingCalculator;
