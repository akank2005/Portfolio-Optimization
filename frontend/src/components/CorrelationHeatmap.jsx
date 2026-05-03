import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

function CorrelationHeatmap({ data }) {
  const chartRef = useRef(null);
  const [plotlyError, setPlotlyError] = useState("");

  const tickers = useMemo(() => data?.tickers ?? [], [data]);
  const matrix = useMemo(() => data?.matrix ?? [], [data]);

  useEffect(() => {
    let isMounted = true;

    async function renderHeatmap() {
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

      if (!tickers.length || !matrix.length) {
        Plotly.purge(chartRef.current);
        return;
      }

      const trace = {
        type: "heatmap",
        x: tickers,
        y: tickers,
        z: matrix,
        zmin: -1,
        zmax: 1,
        colorscale: [
          [0, "#7f1d1d"],
          [0.5, "#ffffff"],
          [1, "#14532d"],
        ],
        text: matrix.map((row) => row.map((value) => Number(value).toFixed(2))),
        texttemplate: "%{text}",
        textfont: { color: "#e2e8f0", size: 12 },
        hovertemplate: "X: %{x}<br>Y: %{y}<br>Corr: %{z:.2f}<extra></extra>",
        showscale: true,
        colorbar: { title: "Correlation" },
      };

      const layout = {
        title: {
          text: "Asset Correlation Matrix",
          font: { size: 18, color: "#e2e8f0" },
        },
        xaxis: {
          title: "",
          side: "bottom",
          tickangle: -25,
        },
        yaxis: {
          title: "",
          autorange: "reversed",
        },
        margin: { l: 70, r: 20, t: 60, b: 70 },
        paper_bgcolor: "#161b2e",
        plot_bgcolor: "#161b2e",
        font: { color: "#e2e8f0" },
        hoverlabel: { bgcolor: "#111827", bordercolor: "#334155", font: { color: "#e2e8f0" } },
      };

      await Plotly.newPlot(chartRef.current, [trace], layout, {
        responsive: true,
        displayModeBar: false,
      });

      if (isMounted) {
        setPlotlyError("");
      }
    }

    renderHeatmap();
    return () => {
      isMounted = false;
    };
  }, [tickers, matrix]);

  if (!tickers.length || !matrix.length) {
    return (
      <div className="rounded-xl border border-slate-700 bg-[#111827] p-6 text-center text-sm text-slate-400">
        Run correlation analysis to view the heatmap.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-[#161b2e] p-5 shadow-sm">
      <p className="mb-2 text-[13px] uppercase tracking-[0.18em] text-slate-400">Diversification</p>
      {plotlyError && <p className="mb-3 text-sm text-rose-600">{plotlyError}</p>}
      <div ref={chartRef} className="h-[420px] w-full" />
      <p className="mt-3 text-sm text-slate-400">Values closer to 0 indicate better diversification</p>
    </section>
  );
}

export default CorrelationHeatmap;
