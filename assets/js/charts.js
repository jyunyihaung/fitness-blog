function getThemeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartOptions() {
  const borderColor = getThemeColor("--color-border");
  const textColor = getThemeColor("--color-muted");

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
        labels: {
          color: textColor,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
        },
        grid: {
          color: borderColor,
        },
      },
    },
  };
}

function getChartConstructor() {
  return window.Chart;
}

function showChartMessage(canvas, message) {
  const frame = canvas.closest(".chart-frame");

  if (!frame) {
    return;
  }

  frame.replaceChildren();
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state compact";
  emptyState.textContent = message;
  frame.append(emptyState);
}

function hasChartData(chartData) {
  return Boolean(
    chartData &&
      Array.isArray(chartData.labels) &&
      chartData.labels.length > 0 &&
      Array.isArray(chartData.datasets) &&
      chartData.datasets.length > 0
  );
}

function cloneChartData(chartData) {
  const accentColor = getThemeColor("--color-accent");

  return {
    labels: [...chartData.labels],
    datasets: chartData.datasets.map((dataset) => ({
      ...dataset,
      data: [...dataset.data],
      backgroundColor: dataset.backgroundColor ?? accentColor,
      borderColor: dataset.borderColor ?? accentColor,
      borderWidth: dataset.borderWidth ?? 1,
    })),
  };
}

function renderChart(canvas, chartData) {
  const Chart = getChartConstructor();

  if (!Chart) {
    showChartMessage(canvas, "Chart.js is unavailable.");
    return null;
  }

  if (!hasChartData(chartData)) {
    showChartMessage(canvas, "No chart data available.");
    return null;
  }

  return new Chart(canvas, {
    type: canvas.dataset.chartType || "bar",
    data: cloneChartData(chartData),
    options: getChartOptions(),
  });
}

export function renderCharts(statistics) {
  const charts = statistics?.charts ?? {};

  return Array.from(document.querySelectorAll("[data-chart-key]"))
    .map((canvas) => {
      const chartKey = canvas.dataset.chartKey;
      return renderChart(canvas, charts[chartKey]);
    })
    .filter(Boolean);
}
