from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper().replace(".", "-")


def run_backtest(tickers, weights, start, end, risk_free_rate=0.04):
    """
    Run a fixed-weight (no rebalancing) backtest versus SPY.

    Returns:
        dict with keys:
            - dates
            - portfolio_cumulative
            - spy_cumulative
            - drawdown
            - total_return
            - spy_total_return
            - max_drawdown
    """
    cleaned_tickers = [_normalize_ticker(ticker) for ticker in tickers if ticker and str(ticker).strip()]
    cleaned_tickers = list(dict.fromkeys(cleaned_tickers))
    if not cleaned_tickers:
        raise ValueError("At least one valid ticker is required.")

    weights = np.asarray(weights, dtype=float).reshape(-1)
    if weights.size != len(cleaned_tickers):
        raise ValueError("weights length must match number of tickers.")
    if np.any(weights < 0):
        raise ValueError("weights must be non-negative.")

    weight_sum = float(np.sum(weights))
    if weight_sum <= 0:
        raise ValueError("weights must sum to a positive value.")
    weights = weights / weight_sum

    request_tickers = cleaned_tickers + ["SPY"]
    downloaded = yf.download(
        request_tickers,
        start=start,
        end=end,
        auto_adjust=False,
        progress=False,
    )
    if downloaded.empty:
        raise ValueError("No price data returned for requested period.")

    if isinstance(downloaded.columns, pd.MultiIndex):
        if "Adj Close" not in downloaded.columns.get_level_values(0):
            raise ValueError("Adjusted close prices are unavailable for the requested symbols.")
        prices = downloaded["Adj Close"].copy()
    else:
        if "Adj Close" not in downloaded.columns:
            raise ValueError("Adjusted close prices are unavailable for the requested symbols.")
        prices = downloaded[["Adj Close"]].copy()
        prices.columns = [request_tickers[0]]

    prices = prices.dropna(axis=1, how="all").dropna(axis=0, how="any")
    if prices.empty:
        raise ValueError("Insufficient adjusted close data after cleaning.")
    if "SPY" not in prices.columns:
        raise ValueError("SPY data is required for benchmark comparison.")
    if any(ticker not in prices.columns for ticker in cleaned_tickers):
        raise ValueError("One or more selected tickers are missing price data.")

    asset_prices = prices[cleaned_tickers]
    spy_prices = prices["SPY"]

    asset_returns = asset_prices.pct_change().dropna()
    spy_returns = spy_prices.pct_change().dropna()

    common_index = asset_returns.index.intersection(spy_returns.index)
    if common_index.empty:
        raise ValueError("No overlapping return history between portfolio assets and SPY.")

    asset_returns = asset_returns.loc[common_index]
    spy_returns = spy_returns.loc[common_index]

    # Optimized portfolio
    portfolio_daily = asset_returns.to_numpy(dtype=float) @ weights
    portfolio_daily = pd.Series(portfolio_daily, index=common_index)

    portfolio_cumulative = (1.0 + portfolio_daily).cumprod() - 1.0
    spy_cumulative = (1.0 + spy_returns).cumprod() - 1.0

    rolling_max = portfolio_cumulative.cummax()
    drawdown = (portfolio_cumulative - rolling_max) / (1.0 + rolling_max)

    # Equal-weight portfolio
    n_assets = len(cleaned_tickers)
    equal_weights = np.full(n_assets, 1.0 / n_assets)
    equal_portfolio_daily = asset_returns.to_numpy(dtype=float) @ equal_weights
    equal_portfolio_daily = pd.Series(equal_portfolio_daily, index=common_index)

    equal_portfolio_cumulative = (1.0 + equal_portfolio_daily).cumprod() - 1.0
    equal_rolling_max = equal_portfolio_cumulative.cummax()
    equal_drawdown = (equal_portfolio_cumulative - equal_rolling_max) / (1.0 + equal_rolling_max)

    return {
        "dates": [idx.strftime("%Y-%m-%d") for idx in common_index],
        "portfolio_cumulative": (portfolio_cumulative * 100.0).tolist(),
        "spy_cumulative": (spy_cumulative * 100.0).tolist(),
        "equal_cumulative": (equal_portfolio_cumulative * 100.0).tolist(),
        "drawdown": (drawdown * 100.0).tolist(),
        "total_return": float(portfolio_cumulative.iloc[-1] * 100.0),
        "spy_total_return": float(spy_cumulative.iloc[-1] * 100.0),
        "equal_total_return": float(equal_portfolio_cumulative.iloc[-1] * 100.0),
        "max_drawdown": float(drawdown.min() * 100.0),
        "equal_max_drawdown": float(equal_drawdown.min() * 100.0),
    }
