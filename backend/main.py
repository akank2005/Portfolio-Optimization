from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
import yfinance as yf

from backtest import run_backtest
from data import compute_correlation, compute_returns, compute_stats, fetch_price_history, fetch_prices
from optimizer import (
    generate_frontier,
    max_return_for_risk,
    max_sharpe,
    min_variance,
    monte_carlo_simulation,
    risk_parity,
    compute_sortino,
)


app = FastAPI(title="Portfolio Optimizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class OptimizeRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1)
    start: str
    end: str
    strategy: str | None = None
    max_volatility: float | None = None
    risk_free_rate: float = Field(default=0.04)
    constraints: list[dict] | None = None


class BacktestRequest(BaseModel):
    tickers: list[str] = Field(..., min_length=1)
    weights: list[float] = Field(..., min_length=1)
    start: str
    end: str
    risk_free_rate: float = Field(default=0.04)


def normalize_ticker(ticker: str) -> str:
    # Yahoo symbols often use "-" where users type "." (e.g., BRK.B -> BRK-B).
    return ticker.strip().upper().replace(".", "-")


@app.get("/search-tickers")
def search_tickers(q: str) -> dict[str, list[dict[str, str]]]:
    query = q.strip()
    if not query:
        return {"results": []}

    try:
        search = yf.Search(query=query, max_results=50, news_count=0)
        quotes = getattr(search, "quotes", []) or []
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to search Yahoo Finance tickers right now.") from exc

    query_upper = normalize_ticker(query)
    seen: set[str] = set()
    starts_with: list[dict[str, str]] = []
    others: list[dict[str, str]] = []

    for quote in quotes:
        symbol_raw = quote.get("symbol")
        if not symbol_raw:
            continue

        symbol = normalize_ticker(str(symbol_raw))
        if symbol in seen:
            continue
        seen.add(symbol)

        name = str(quote.get("shortname") or quote.get("longname") or symbol)
        payload = {"symbol": symbol, "name": name}

        if symbol.startswith(query_upper):
            starts_with.append(payload)
            continue

        if query_upper in symbol or query_upper in name.upper():
            others.append(payload)

    return {"results": starts_with + others}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/prices")
def get_prices(
    ticker: str | None = None,
    start: str | None = None,
    end: str | None = None,
    tickers: str | None = None,
) -> dict:
    # Batch latest prices mode: /prices?tickers=AAPL,MSFT,GOOG
    if tickers is not None:
        parsed = [normalize_ticker(item) for item in tickers.split(",") if item and item.strip()]
        parsed = list(dict.fromkeys(parsed))
        if not parsed:
            raise HTTPException(status_code=400, detail="No valid tickers were provided.")

        try:
            downloaded = yf.download(
                parsed,
                period="5d",
                auto_adjust=False,
                progress=False,
            )
        except Exception as exc:  # pragma: no cover - defensive API boundary
            raise HTTPException(status_code=500, detail="Unable to fetch latest prices right now.") from exc

        if downloaded.empty:
            raise HTTPException(status_code=400, detail="No price data returned for the requested tickers.")

        if isinstance(downloaded.columns, type(getattr(downloaded, "columns", None))) and hasattr(
            downloaded.columns, "levels"
        ):
            if "Adj Close" not in downloaded.columns.get_level_values(0):
                raise HTTPException(status_code=400, detail="Adjusted closing prices are unavailable.")
            prices = downloaded["Adj Close"].copy()
        else:
            if "Adj Close" not in downloaded.columns:
                raise HTTPException(status_code=400, detail="Adjusted closing prices are unavailable.")
            prices = downloaded[["Adj Close"]].copy()
            prices.columns = [parsed[0]]

        latest: dict[str, float | None] = {}
        for symbol in parsed:
            if symbol not in prices.columns:
                latest[symbol] = None
                continue
            series = prices[symbol].dropna()
            latest[symbol] = float(series.iloc[-1]) if not series.empty else None

        return latest

    # Single ticker history mode: /prices?ticker=AAPL&start=...&end=...
    if ticker is None or start is None or end is None:
        raise HTTPException(
            status_code=400,
            detail="Provide either tickers for latest prices, or ticker + start + end for price history.",
        )

    normalized = normalize_ticker(ticker)
    try:
        history = fetch_price_history(normalized, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail="Unable to fetch price history right now.") from exc

    points = [
        {"date": idx.strftime("%Y-%m-%d"), "price": float(value)}
        for idx, value in history[normalized].items()
    ]
    return {
        "ticker": normalized,
        "start": start,
        "end": end,
        "prices": points,
    }


@app.post("/optimize")
def optimize(payload: OptimizeRequest) -> dict:
    tickers = [normalize_ticker(ticker) for ticker in payload.tickers if ticker and ticker.strip()]
    if not tickers:
        raise HTTPException(status_code=400, detail="Invalid tickers: provide at least one non-empty ticker.")

    # Deduplicate while preserving order.
    deduped_tickers = list(dict.fromkeys(tickers))
    strategy = (payload.strategy or "max_sharpe").strip().lower()
    risk_free_rate = payload.risk_free_rate
    constraints = payload.constraints or []
    # Match constraints to deduped_tickers
    constraints_matched = [
        next((c for c in constraints if c.get('ticker') == t), {'min': None, 'max': None})
        for t in deduped_tickers
    ]

    try:
        prices = fetch_prices(deduped_tickers, payload.start, payload.end)
        returns = compute_returns(prices)
        mu, sigma = compute_stats(returns)
        frontier = generate_frontier(mu, sigma, constraints=constraints_matched)
        if strategy == "max_sharpe":
            optimal = max_sharpe(frontier, risk_free_rate)
        elif strategy == "min_variance":
            optimal = min_variance(mu, sigma, risk_free_rate, constraints=constraints_matched)
        elif strategy == "risk_parity":
            optimal = risk_parity(mu, sigma, risk_free_rate, constraints=constraints_matched)
        elif strategy == "max_return":
            if payload.max_volatility is None:
                raise ValueError("max_volatility is required when strategy='max_return'.")
            optimal = max_return_for_risk(mu, sigma, payload.max_volatility, risk_free_rate, constraints=constraints_matched)
        else:
            raise ValueError(
                "Invalid strategy. Use one of: max_sharpe, min_variance, risk_parity, max_return."
            )
        simulation = monte_carlo_simulation(mu, sigma, risk_free_rate=risk_free_rate)
    except ValueError as exc:
        # User/data issues (invalid tickers, insufficient history, etc.).
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail="Optimization failed due to an internal error.") from exc

    frontier_response = [
        {
            "return": float(point["return"]),
            "volatility": float(point["volatility"]),
            "weights": [float(w) for w in point["weights"]],
        }
        for point in frontier
    ]

    # Reconstruct daily portfolio returns using optimal weights
    portfolio_daily_returns = returns.values @ optimal["weights"]
    # Convert numpy array to pandas Series for compute_sortino
    import pandas as pd
    portfolio_daily_returns_series = pd.Series(portfolio_daily_returns, index=returns.index)
    sortino = compute_sortino(portfolio_daily_returns_series, risk_free_rate)

    optimal_response = {
        "return": float(optimal["return"]),
        "volatility": float(optimal["volatility"]),
        "sharpe": float(optimal["sharpe"]),
        "sortino": sortino,
        "weights": [float(w) for w in optimal["weights"]],
    }

    return {
        "frontier": frontier_response,
        "optimal": optimal_response,
        "tickers": list(prices.columns),
        "simulation": simulation,
    }


@app.post("/correlations")
def correlations(payload: OptimizeRequest) -> dict:
    tickers = [normalize_ticker(ticker) for ticker in payload.tickers if ticker and ticker.strip()]
    if not tickers:
        raise HTTPException(status_code=400, detail="Invalid tickers: provide at least one non-empty ticker.")

    deduped_tickers = list(dict.fromkeys(tickers))

    try:
        prices = fetch_prices(deduped_tickers, payload.start, payload.end)
        returns = compute_returns(prices)
        correlation = compute_correlation(returns)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail="Correlation computation failed due to an internal error.") from exc

    return correlation


@app.post("/backtest")
def backtest(payload: BacktestRequest) -> dict:
    tickers = [normalize_ticker(ticker) for ticker in payload.tickers if ticker and ticker.strip()]
    if not tickers:
        raise HTTPException(status_code=400, detail="Invalid tickers: provide at least one non-empty ticker.")
    if len(payload.weights) != len(tickers):
        raise HTTPException(status_code=400, detail="weights must match the number of tickers.")

    deduped_tickers = list(dict.fromkeys(tickers))
    if len(deduped_tickers) != len(payload.weights):
        raise HTTPException(
            status_code=400,
            detail="Duplicate tickers are not allowed when weights are provided per ticker.",
        )

    try:
        result = run_backtest(deduped_tickers, payload.weights, payload.start, payload.end, payload.risk_free_rate)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive API boundary
        raise HTTPException(status_code=500, detail="Backtest failed due to an internal error.") from exc

    return result


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
