# Portfolio Optimizer

A full-stack Markowitz mean-variance portfolio optimizer with advanced portfolio analysis and backtesting.

**Tech Stack:**
- **Backend**: FastAPI + NumPy/Pandas/SciPy + yfinance
- **Frontend**: React (Vite) + Tailwind CSS + Plotly.js

The app fetches historical prices, computes annualized return/covariance estimates, builds an efficient frontier under long-only constraints with optional per-asset weight constraints, and provides comprehensive portfolio comparison and risk metrics.

---

## Features

### Portfolio Optimization
- Multiple optimization strategies: Max Sharpe, Min Variance, Risk Parity, Max Return for Risk
- Dynamic risk-free rate input (0–10%)
- **Per-asset weight constraints**: set min/max allocation % for each ticker
- Long-only, fully-invested portfolios
- Efficient frontier visualization
- Monte Carlo simulation of random portfolios

### Risk & Return Metrics
- Annualized return, volatility, and Sharpe ratio
- **Sortino ratio** (penalizes downside volatility only)
- Max drawdown analysis

### Backtesting & Benchmarking
- Fixed-weight backtest against S&P 500
- **Three-way portfolio comparison**:
  - Optimized portfolio (your strategy)
  - Equal-weight benchmark (naive allocation)
  - S&P 500 (market index)
- Cumulative returns chart with dual y-axes
- Max drawdown comparison
- Contextual performance insights

### Additional Analysis
- Asset correlation heatmap
- Historical price chart with zoom/pan
- Rebalancing calculator
- Portfolio allocation pie chart with exclusion warnings

---

## Project Structure

```text
Portfolio Optimizer/
├─ backend/
│  ├─ main.py          # FastAPI endpoints
│  ├─ optimizer.py     # Portfolio optimization algorithms
│  ├─ data.py          # Price data & statistics
│  ├─ backtest.py      # Backtesting engine
│  └─ requirements.txt
├─ frontend/
│  ├─ package.json
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  ├─ index.css
│  │  └─ components/
│  │     ├─ TickerInput.jsx
│  │     ├─ StrategySelector.jsx
│  │     ├─ FrontierChart.jsx
│  │     ├─ WeightsChart.jsx
│  │     ├─ StatsTable.jsx
│  │     ├─ Backtester.jsx
│  │     ├─ CorrelationHeatmap.jsx
│  │     ├─ PriceHistoryViewer.jsx
│  │     ├─ RebalancingCalculator.jsx
│  │     └─ DiversificationChart.jsx
│  ├─ tailwind.config.js
│  ├─ postcss.config.js
│  └─ vite.config.js
└─ README.md
```

---

## Backend Setup (FastAPI)

### 1) Create and activate environment

On Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2) Install dependencies

```powershell
pip install -r requirements.txt
```

Or manually:

```powershell
pip install fastapi uvicorn numpy pandas scipy yfinance pydantic
```

### 3) Run backend server

```powershell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at `http://localhost:8000`.

---

## Frontend Setup (React + Vite)

### 1) Install dependencies

```powershell
cd frontend
npm install
```

### 2) Run dev server

```powershell
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

## API Endpoints

### `POST /optimize`

**Request:**

```json
{
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "start": "2020-01-01",
  "end": "2024-01-01",
  "strategy": "max_sharpe",
  "risk_free_rate": 0.04,
  "constraints": [
    { "ticker": "AAPL", "min": 0.1, "max": 0.5 },
    { "ticker": "MSFT", "min": 0.0, "max": 1.0 },
    { "ticker": "GOOG", "min": 0.0, "max": 0.6 }
  ],
  "max_volatility": 0.25
}
```

**Response:**

```json
{
  "frontier": [
    { "return": 0.12, "volatility": 0.18, "weights": [0.4, 0.35, 0.25] }
  ],
  "optimal": {
    "return": 0.15,
    "volatility": 0.20,
    "sharpe": 1.25,
    "sortino": 1.87,
    "weights": [0.4, 0.35, 0.25]
  },
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "simulation": {
    "returns": [...],
    "volatilities": [...],
    "sharpes": [...]
  }
}
```

### `POST /backtest`

**Request:**

```json
{
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "weights": [0.4, 0.35, 0.25],
  "start": "2020-01-01",
  "end": "2024-01-01",
  "risk_free_rate": 0.04
}
```

**Response:**

```json
{
  "dates": ["2020-01-01", "2020-01-02", ...],
  "portfolio_cumulative": [0.0, 0.5, 1.2, ...],
  "equal_cumulative": [0.0, 0.3, 0.9, ...],
  "spy_cumulative": [0.0, 0.4, 0.8, ...],
  "drawdown": [0.0, -0.05, -0.02, ...],
  "total_return": 45.3,
  "equal_total_return": 38.2,
  "spy_total_return": 42.1,
  "max_drawdown": -18.5,
  "equal_max_drawdown": -20.3
}
```

### `POST /correlations`

**Request:**

```json
{
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "start": "2020-01-01",
  "end": "2024-01-01"
}
```

**Response:**

```json
{
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "correlation": [[1.0, 0.65, 0.72], [0.65, 1.0, 0.58], [0.72, 0.58, 1.0]]
}
```

---

## Configuration

### Optimization Strategies

- **max_sharpe**: Maximum risk-adjusted return
- **min_variance**: Minimum portfolio volatility
- **risk_parity**: Equal risk contribution per asset
- **max_return**: Highest return for target volatility (requires `max_volatility` param)

### Weight Constraints

Per-asset constraints are passed as:

```javascript
{
  "ticker": "AAPL",
  "min": 0.1,    // Minimum 10% allocation
  "max": 0.5     // Maximum 50% allocation
}
```

Constraints must satisfy: `sum(mins) < 100%` and `min <= max` for each asset.

### Risk-Free Rate

Configurable 0–10% in the UI. Used for:
- Sharpe ratio calculation: `(portfolio_return - rf) / volatility`
- Sortino ratio calculation: `(portfolio_return - rf) / downside_volatility`
- Backtesting metrics

---

## Technical Notes

- **Annualization**: 252 trading days per year
- **Optimization**: SLSQP method via SciPy with long-only constraints
- **Returns**: Daily log returns computed from adjusted close prices
- **Correlation**: Pearson correlation of daily returns
- **Downside Volatility**: std dev of negative excess returns
- **Drawdown**: Running max-to-current decline

---

## Troubleshooting

- **CORS errors**: Ensure backend (`localhost:8000`) and frontend (`localhost:5173`) are running
- **"No data returned"**: Verify ticker symbols and date range validity
- **Optimization failure**: Use at least 2 valid tickers and 30+ days of history
- **Sortino ratio shows N/A**: Portfolio had only positive returns (no downside); this is rare
- **Constraint validation error**: Check that `sum(mins) < 100%` and all `min <= max`

---

## License

Educational project. Not for production use.

