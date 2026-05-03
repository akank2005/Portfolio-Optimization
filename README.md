# Portfolio Optimizer

A full-stack Markowitz mean-variance portfolio optimizer with:
- **Backend**: FastAPI + NumPy/Pandas/SciPy + yfinance
- **Frontend**: React (Vite) + Tailwind CSS + Plotly

The app fetches historical prices, computes annualized return/covariance estimates, builds an efficient frontier under long-only constraints, and highlights the max-Sharpe portfolio.

---

## Features

- Fetch adjusted close prices for selected tickers
- Compute daily log returns and annualized statistics
- Generate long-only efficient frontier using SLSQP optimization
- Identify maximum Sharpe-ratio portfolio
- Visualize:
  - efficient frontier
  - optimal allocation pie chart
  - portfolio stats table

---

## Project Structure

```text
Portfolio Optimizer/
├─ backend/
│  ├─ data.py
│  ├─ optimizer.py
│  └─ main.py
├─ frontend/
│  ├─ package.json
│  └─ src/
│     ├─ App.jsx
│     └─ components/
│        ├─ TickerInput.jsx
│        ├─ FrontierChart.jsx
│        ├─ WeightsChart.jsx
│        └─ StatsTable.jsx
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

### `GET /health`

Returns:

```json
{ "status": "ok" }
```

### `POST /optimize`

Request body:

```json
{
  "tickers": ["AAPL", "MSFT", "GOOG"],
  "start": "2020-01-01",
  "end": "2024-01-01"
}
```

Response shape:

```json
{
  "frontier": [
    { "return": 0.12, "volatility": 0.18, "weights": [0.4, 0.35, 0.25] }
  ],
  "optimal": {
    "return": 0.15,
    "volatility": 0.20,
    "sharpe": 1.1,
    "weights": [0.4, 0.35, 0.25]
  },
  "tickers": ["AAPL", "MSFT", "GOOG"]
}
```

---

## Notes

- Optimization uses **long-only** constraints (`w >= 0`) and fully invested portfolios (`sum(w)=1`).
- Annualization assumes **252 trading days**.
- Backend includes validation for:
  - invalid/missing tickers
  - missing price data
  - insufficient history (less than 30 trading days)

---

## Troubleshooting

- **CORS errors**: ensure backend is running on `http://localhost:8000` and frontend on `http://localhost:5173`.
- **No data returned**: verify ticker symbols and date range.
- **Optimization failure**: try a longer date range and at least 2 valid tickers.

