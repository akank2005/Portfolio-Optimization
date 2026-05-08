from __future__ import annotations

import numpy as np
from scipy.optimize import minimize


def generate_frontier(mu, sigma, n_points=200, constraints=None):
    """
    Generate a long-only efficient frontier by sweeping target returns.

    Args:
        mu: Annualized mean return vector, shape (n_assets,).
        sigma: Annualized covariance matrix, shape (n_assets, n_assets).
        n_points: Number of target returns to evaluate.
        constraints: List of dicts with 'min' and 'max' for each asset, or None.

    Returns:
        list[dict]: Each dict has keys: return, volatility, weights.
    """
    mu = np.asarray(mu, dtype=float).reshape(-1)
    sigma = np.asarray(sigma, dtype=float)

    if mu.size == 0:
        raise ValueError("mu must contain at least one asset.")
    if sigma.ndim != 2 or sigma.shape[0] != sigma.shape[1]:
        raise ValueError("sigma must be a square matrix.")
    if sigma.shape[0] != mu.size:
        raise ValueError("mu and sigma dimensions are inconsistent.")
    if n_points < 2:
        raise ValueError("n_points must be at least 2.")

    n_assets = mu.size
    bounds = []
    for i in range(n_assets):
        if constraints and i < len(constraints):
            c = constraints[i]
            min_w = c.get('min') if c.get('min') is not None else 0.0
            max_w = c.get('max') if c.get('max') is not None else 1.0
        else:
            min_w, max_w = 0.0, 1.0
        bounds.append((min_w, max_w))
    x0 = np.full(n_assets, 1.0 / n_assets)
    # Clip x0 to bounds
    x0 = np.clip(x0, [b[0] for b in bounds], [b[1] for b in bounds])
    x0 = x0 / np.sum(x0) if np.sum(x0) > 0 else x0

    def portfolio_variance(weights):
        return float(weights.T @ sigma @ weights)

    frontier = []
    target_returns = np.linspace(np.min(mu), np.max(mu), n_points)

    for target_return in target_returns:
        constraints = [
            {"type": "eq", "fun": lambda w, tr=target_return: float(w @ mu - tr)},
            {"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},
        ]

        result = minimize(
            portfolio_variance,
            x0=x0,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"ftol": 1e-12, "maxiter": 1000},
        )

        if not result.success:
            continue

        weights = np.asarray(result.x, dtype=float)
        # Numerical cleanup to keep output stable.
        weights = np.clip(weights, [b[0] for b in bounds], [b[1] for b in bounds])
        weights_sum = np.sum(weights)
        if weights_sum <= 0:
            continue
        weights = weights / weights_sum
        x0 = weights

        port_return = float(weights @ mu)
        port_variance = float(weights.T @ sigma @ weights)
        port_volatility = float(np.sqrt(max(port_variance, 0.0)))

        frontier.append(
            {
                "return": port_return,
                "volatility": port_volatility,
                "weights": weights,
            }
        )

    if not frontier:
        raise ValueError("Unable to generate frontier: optimization failed for all target returns.")

    frontier.sort(key=lambda point: point["volatility"])

    # Remove numerical zig-zag artifacts:
    # 1) collapse near-duplicate vol points by keeping the higher return
    # 2) keep only non-dominated points (monotone non-decreasing return vs volatility)
    vol_tol = 1e-8
    deduped: list[dict] = []
    for point in frontier:
        if not deduped:
            deduped.append(point)
            continue
        if abs(point["volatility"] - deduped[-1]["volatility"]) <= vol_tol:
            if point["return"] > deduped[-1]["return"]:
                deduped[-1] = point
        else:
            deduped.append(point)

    efficient: list[dict] = []
    best_return_so_far = -np.inf
    return_tol = 1e-10
    for point in deduped:
        if point["return"] >= best_return_so_far - return_tol:
            efficient.append(point)
            if point["return"] > best_return_so_far:
                best_return_so_far = point["return"]

    if not efficient:
        raise ValueError("Unable to generate efficient frontier after post-processing.")

    return efficient


def max_sharpe(frontier, risk_free_rate=0.04):
    """
    Find the frontier portfolio with the highest Sharpe ratio.

    Args:
        frontier: Output list from generate_frontier.
        risk_free_rate: Annual risk-free rate used in Sharpe ratio.

    Returns:
        dict: Keys: return, volatility, sharpe, weights.
    """
    if not frontier:
        raise ValueError("frontier must contain at least one portfolio.")

    best_portfolio = None
    best_sharpe = -np.inf

    for point in frontier:
        port_return = float(point["return"])
        port_vol = float(point["volatility"])
        if port_vol <= 0.0:
            continue

        sharpe = (port_return - risk_free_rate) / port_vol
        if sharpe > best_sharpe:
            best_sharpe = sharpe
            best_portfolio = point

    if best_portfolio is None:
        raise ValueError("Unable to compute Sharpe ratio: all frontier volatilities are non-positive.")

    return {
        "return": float(best_portfolio["return"]),
        "volatility": float(best_portfolio["volatility"]),
        "sharpe": float(best_sharpe),
        "weights": np.asarray(best_portfolio["weights"], dtype=float),
    }


def monte_carlo_simulation(mu, sigma, n_simulations=3000, risk_free_rate=0.04):
    """
    Run Monte Carlo simulation of random long-only portfolios.

    Args:
        mu: Annualized mean return vector, shape (n_assets,).
        sigma: Annualized covariance matrix, shape (n_assets, n_assets).
        n_simulations: Number of random portfolios to generate.
        risk_free_rate: Annual risk-free rate used in Sharpe ratio.

    Returns:
        dict: Keys:
            - returns: list of annualized portfolio returns in percent
            - volatilities: list of annualized portfolio volatilities in percent
            - sharpes: list of Sharpe ratios
    """
    mu = np.asarray(mu, dtype=float).reshape(-1)
    sigma = np.asarray(sigma, dtype=float)

    if mu.size == 0:
        raise ValueError("mu must contain at least one asset.")
    if sigma.ndim != 2 or sigma.shape[0] != sigma.shape[1]:
        raise ValueError("sigma must be a square matrix.")
    if sigma.shape[0] != mu.size:
        raise ValueError("mu and sigma dimensions are inconsistent.")
    if int(n_simulations) <= 0:
        raise ValueError("n_simulations must be a positive integer.")

    n_assets = mu.size
    n_simulations = int(n_simulations)

    # Dirichlet(alpha=1) gives uniformly distributed weights on simplex.
    weights = np.random.dirichlet(np.ones(n_assets), size=n_simulations)

    portfolio_returns = weights @ mu
    portfolio_variances = np.einsum("ij,jk,ik->i", weights, sigma, weights)
    portfolio_volatilities = np.sqrt(np.maximum(portfolio_variances, 0.0))

    with np.errstate(divide="ignore", invalid="ignore"):
        sharpes = (portfolio_returns - risk_free_rate) / portfolio_volatilities
        sharpes = np.where(np.isfinite(sharpes), sharpes, np.nan)

    return {
        "returns": (portfolio_returns * 100.0).tolist(),
        "volatilities": (portfolio_volatilities * 100.0).tolist(),
        "sharpes": sharpes.tolist(),
    }


def min_variance(mu, sigma, risk_free_rate=0.04, constraints=None):
    mu = np.asarray(mu, dtype=float).reshape(-1)
    sigma = np.asarray(sigma, dtype=float)

    if mu.size == 0:
        raise ValueError("mu must contain at least one asset.")
    if sigma.ndim != 2 or sigma.shape[0] != sigma.shape[1]:
        raise ValueError("sigma must be a square matrix.")
    if sigma.shape[0] != mu.size:
        raise ValueError("mu and sigma dimensions are inconsistent.")

    n_assets = mu.size
    bounds = []
    for i in range(n_assets):
        if constraints and i < len(constraints):
            c = constraints[i]
            min_w = c.get('min') if c.get('min') is not None else 0.0
            max_w = c.get('max') if c.get('max') is not None else 1.0
        else:
            min_w, max_w = 0.0, 1.0
        bounds.append((min_w, max_w))
    x0 = np.full(n_assets, 1.0 / n_assets)
    x0 = np.clip(x0, [b[0] for b in bounds], [b[1] for b in bounds])
    x0 = x0 / np.sum(x0) if np.sum(x0) > 0 else x0

    def objective(weights):
        return float(weights.T @ sigma @ weights)

    constraints_scipy = [{"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)}]

    result = minimize(
        objective,
        x0=x0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints_scipy,
        options={"ftol": 1e-12, "maxiter": 1000},
    )
    if not result.success:
        raise ValueError("Failed to solve minimum variance portfolio.")

    weights = np.asarray(result.x, dtype=float)
    weights = np.clip(weights, [b[0] for b in bounds], [b[1] for b in bounds])
    weights = weights / np.sum(weights)

    port_return = float(weights @ mu)
    port_vol = float(np.sqrt(max(weights.T @ sigma @ weights, 0.0)))
    sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else np.nan

    return {
        "return": port_return,
        "volatility": port_vol,
        "sharpe": float(sharpe),
        "weights": weights,
    }


def max_return_for_risk(mu, sigma, max_volatility, risk_free_rate=0.04, constraints=None):
    mu = np.asarray(mu, dtype=float).reshape(-1)
    sigma = np.asarray(sigma, dtype=float)

    if mu.size == 0:
        raise ValueError("mu must contain at least one asset.")
    if sigma.ndim != 2 or sigma.shape[0] != sigma.shape[1]:
        raise ValueError("sigma must be a square matrix.")
    if sigma.shape[0] != mu.size:
        raise ValueError("mu and sigma dimensions are inconsistent.")
    if max_volatility <= 0:
        raise ValueError("max_volatility must be positive.")

    max_vol = float(max_volatility) / 100.0
    if max_vol <= 0:
        raise ValueError("max_volatility must be greater than 0%.")

    min_var_port = min_variance(mu, sigma, risk_free_rate, constraints)
    if max_vol < float(min_var_port["volatility"]) - 1e-12:
        min_var_port["constraint_infeasible"] = True
        return min_var_port

    n_assets = mu.size
    bounds = []
    for i in range(n_assets):
        if constraints and i < len(constraints):
            c = constraints[i]
            min_w = c.get('min') if c.get('min') is not None else 0.0
            max_w = c.get('max') if c.get('max') is not None else 1.0
        else:
            min_w, max_w = 0.0, 1.0
        bounds.append((min_w, max_w))
    x0 = np.asarray(min_var_port["weights"], dtype=float)
    x0 = np.clip(x0, [b[0] for b in bounds], [b[1] for b in bounds])
    x0 = x0 / np.sum(x0) if np.sum(x0) > 0 else x0

    def objective(weights):
        return -float(weights @ mu)

    def volatility_constraint(weights):
        variance = float(weights.T @ sigma @ weights)
        return float(max_vol - np.sqrt(max(variance, 0.0)))

    constraints = [
        {"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},
        {"type": "ineq", "fun": volatility_constraint},
    ]

    result = minimize(
        objective,
        x0=x0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"ftol": 1e-12, "maxiter": 1000},
    )
    if not result.success:
        min_var_port["constraint_infeasible"] = True
        return min_var_port

    weights = np.asarray(result.x, dtype=float)
    weights = np.clip(weights, [b[0] for b in bounds], [b[1] for b in bounds])
    weights = weights / np.sum(weights)

    port_return = float(weights @ mu)
    port_vol = float(np.sqrt(max(weights.T @ sigma @ weights, 0.0)))
    if port_vol > max_vol + 1e-8:
        min_var_port["constraint_infeasible"] = True
        return min_var_port

    sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else np.nan

    return {
        "return": port_return,
        "volatility": port_vol,
        "sharpe": float(sharpe),
        "weights": weights,
        "constraint_infeasible": False,
    }


def risk_parity(mu, sigma, risk_free_rate=0.04, constraints=None):
    mu = np.asarray(mu, dtype=float).reshape(-1)
    sigma = np.asarray(sigma, dtype=float)

    if mu.size == 0:
        raise ValueError("mu must contain at least one asset.")
    if sigma.ndim != 2 or sigma.shape[0] != sigma.shape[1]:
        raise ValueError("sigma must be a square matrix.")
    if sigma.shape[0] != mu.size:
        raise ValueError("mu and sigma dimensions are inconsistent.")

    n_assets = mu.size
    bounds = []
    for i in range(n_assets):
        if constraints and i < len(constraints):
            c = constraints[i]
            min_w = c.get('min') if c.get('min') is not None else 0.0
            max_w = c.get('max') if c.get('max') is not None else 1.0
        else:
            min_w, max_w = 0.0, 1.0
        bounds.append((min_w, max_w))
    x0 = np.full(n_assets, 1.0 / n_assets)
    x0 = np.clip(x0, [b[0] for b in bounds], [b[1] for b in bounds])
    x0 = x0 / np.sum(x0) if np.sum(x0) > 0 else x0

    def objective(weights):
        variance = float(weights.T @ sigma @ weights)
        if variance <= 0:
            return 1e6
        mrc = (sigma @ weights) * weights / variance
        target = np.full(n_assets, 1.0 / n_assets)
        return float(np.sum((mrc - target) ** 2))

    constraints = [{"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)}]

    result = minimize(
        objective,
        x0=x0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"ftol": 1e-12, "maxiter": 1000},
    )
    if not result.success:
        raise ValueError("Failed to solve risk parity portfolio.")

    weights = np.asarray(result.x, dtype=float)
    weights = np.clip(weights, [b[0] for b in bounds], [b[1] for b in bounds])
    weights = weights / np.sum(weights)

    port_return = float(weights @ mu)
    port_vol = float(np.sqrt(max(weights.T @ sigma @ weights, 0.0)))
    sharpe = (port_return - risk_free_rate) / port_vol if port_vol > 0 else np.nan

    return {
        "return": port_return,
        "volatility": port_vol,
        "sharpe": float(sharpe),
        "weights": weights,
    }


def compute_sortino(returns, risk_free_rate=0.04):
    """
    Compute Sortino ratio from daily portfolio returns.
    
    Args:
        returns: Pandas Series of daily portfolio returns (as decimals, e.g., 0.01 for 1%).
        risk_free_rate: Annual risk-free rate used in Sortino calculation.
    
    Returns:
        float: Sortino ratio rounded to 2 decimal places, or None if calculation fails.
    """
    import pandas as pd
    
    # Ensure returns is a pandas Series
    if not isinstance(returns, pd.Series):
        returns = pd.Series(returns)
    
    # Remove NaN values
    returns = returns.dropna()
    
    if len(returns) == 0:
        return None
    
    daily_riskfree = risk_free_rate / 252
    excess_returns = returns - daily_riskfree
    downside_returns = excess_returns[excess_returns < 0]
    
    if len(downside_returns) == 0:
        # No downside returns; use a small value to avoid division by zero
        downside_std = 1e-10
    else:
        downside_std = np.sqrt(252) * downside_returns.std()
    
    if downside_std == 0 or np.isnan(downside_std) or downside_std <= 1e-10:
        return None
    
    annualized_return = returns.mean() * 252
    sortino = (annualized_return - risk_free_rate) / downside_std
    
    return round(float(sortino), 2)
