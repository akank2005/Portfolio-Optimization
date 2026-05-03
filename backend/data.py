from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf


MIN_HISTORY_DAYS = 30
TRADING_DAYS_PER_YEAR = 252


def _normalize_ticker(ticker: str) -> str:
    return ticker.strip().upper().replace(".", "-")


def fetch_prices(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """
    Download adjusted closing prices for the given tickers.

    Raises:
        ValueError: If no valid tickers are provided, all tickers are missing,
                    or available price history is insufficient.
    """
    # Keep user order while deduplicating.
    cleaned_tickers = list(dict.fromkeys(_normalize_ticker(ticker) for ticker in tickers if ticker and ticker.strip()))
    if not cleaned_tickers:
        raise ValueError("No valid tickers provided.")

    downloaded = yf.download(
        cleaned_tickers,
        start=start,
        end=end,
        auto_adjust=False,
        progress=False,
    )

    if downloaded.empty:
        raise ValueError("No price data returned for the requested date range.")

    # yfinance can return either a simple Index (single ticker) or MultiIndex columns.
    if isinstance(downloaded.columns, pd.MultiIndex):
        if "Adj Close" not in downloaded.columns.get_level_values(0):
            raise ValueError("Adjusted closing prices are not available for the requested tickers.")
        prices = downloaded["Adj Close"].copy()
    else:
        # Single ticker request may return OHLCV columns directly.
        if "Adj Close" in downloaded.columns:
            prices = downloaded[["Adj Close"]].copy()
            prices.columns = cleaned_tickers[:1]
        else:
            raise ValueError("Adjusted closing prices are not available for the requested ticker.")

    prices = prices.dropna(axis=1, how="all")
    if prices.empty:
        raise ValueError("All requested tickers are missing adjusted closing prices.")

    prices = prices.dropna(axis=0, how="any")
    if len(prices) < MIN_HISTORY_DAYS:
        raise ValueError(
            f"Insufficient data after cleaning: need at least {MIN_HISTORY_DAYS} trading days, got {len(prices)}."
        )

    return prices


def compute_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """
    Compute daily log returns from a price DataFrame.

    Raises:
        ValueError: If prices are empty or if return series is too short.
    """
    if prices is None or prices.empty:
        raise ValueError("Prices DataFrame is empty.")

    log_returns = np.log(prices / prices.shift(1)).dropna(how="any")
    if log_returns.empty:
        raise ValueError("Unable to compute returns: insufficient price observations.")
    if len(log_returns) < MIN_HISTORY_DAYS - 1:
        raise ValueError(
            f"Insufficient return history: need at least {MIN_HISTORY_DAYS - 1} observations, got {len(log_returns)}."
        )
    return log_returns


def compute_stats(returns: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute annualized mean return vector and covariance matrix.

    Returns:
        tuple[np.ndarray, np.ndarray]: (mu, sigma)
            - mu: shape (n_assets,)
            - sigma: shape (n_assets, n_assets)

    Raises:
        ValueError: If returns are empty or too short.
    """
    if returns is None or returns.empty:
        raise ValueError("Returns DataFrame is empty.")
    if len(returns) < MIN_HISTORY_DAYS - 1:
        raise ValueError(
            f"Insufficient return history: need at least {MIN_HISTORY_DAYS - 1} observations, got {len(returns)}."
        )

    mu = (returns.mean() * TRADING_DAYS_PER_YEAR).to_numpy(dtype=float)
    sigma = (returns.cov() * TRADING_DAYS_PER_YEAR).to_numpy(dtype=float)
    return mu, sigma


def compute_correlation(returns: pd.DataFrame) -> dict[str, list]:
    """
    Compute a rounded correlation matrix from daily log returns.

    Returns:
        dict[str, list]:
            - tickers: list of ticker names
            - matrix: 2D list of correlation values rounded to 2 decimals

    Raises:
        ValueError: If returns are empty.
    """
    if returns is None or returns.empty:
        raise ValueError("Returns DataFrame is empty.")

    corr = returns.corr().round(2)
    return {
        "tickers": list(corr.columns),
        "matrix": corr.to_numpy(dtype=float).tolist(),
    }


def fetch_price_history(ticker: str, start: str, end: str) -> pd.DataFrame:
    """
    Download adjusted close history for a single ticker.

    Raises:
        ValueError: If ticker is invalid or no data is returned.
    """
    normalized = _normalize_ticker(ticker)
    if not normalized:
        raise ValueError("Ticker is required.")

    downloaded = yf.download(
        normalized,
        start=start,
        end=end,
        auto_adjust=False,
        progress=False,
    )

    if downloaded.empty:
        raise ValueError("No price history returned for the requested ticker and date range.")

    if "Adj Close" not in downloaded.columns:
        raise ValueError("Adjusted closing prices are not available for the requested ticker.")

    history = downloaded[["Adj Close"]].copy().dropna()
    if history.empty:
        raise ValueError("No valid adjusted close prices were found for the requested ticker.")

    history.columns = [normalized]
    return history
