/**
 * Desktop-focused UI behaviors extracted from app-ui.js
 * Keeps chart/ticker concerns isolated from core inventory rendering.
 */
window.App = window.App || {};

App.UI = App.UI || {};

App.UI.renderDesktopChartPanel = () => {
  const container = document.getElementById("desktop-chart-container");
  const wrapper = document.querySelector("#desktop-chart-container .chart-wrapper");
  const sub = document.getElementById("chart-last-updated");
  if (!container || !wrapper || !sub) return;

  const isBulkOil = App.UI.isBulkOilCategory();
  let emptyState = document.getElementById("chart-empty-state");
  if (!emptyState) {
    emptyState = document.createElement("div");
    emptyState.id = "chart-empty-state";
    emptyState.className = "chart-empty-state hidden";
    emptyState.textContent = "Chart is available in Bulk Oil category only.";
    container.appendChild(emptyState);
  }

  if (isBulkOil) {
    wrapper.classList.remove("hidden");
    emptyState.classList.add("hidden");
    App.UI.renderDesktopChart();
    return;
  }

  if (App.State.chartInstance) {
    App.State.chartInstance.destroy();
    App.State.chartInstance = null;
  }
  App.State._lastChartRenderKey = "";
  wrapper.classList.add("hidden");
  emptyState.classList.remove("hidden");
  sub.innerText = "Detailed Monitoring Dashboard - Switch to Bulk Oil to view chart";
};

App.UI.renderDesktopChart = () => {
  if (!App.UI.isDesktop()) return;
  const ctx = document.getElementById("inventoryChart")?.getContext("2d");
  const chartWrapper = document.querySelector("#desktop-chart-container .chart-wrapper");
  if (!ctx || !window.Chart) return;

  const data = [];
  const labels = [];

  App.State.commonOils.forEach((oil) => {
    let total = 0;
    Object.keys(App.State.inventory).forEach((key) => {
      if (key.endsWith("-" + oil)) {
        total += App.Utils.safeEvaluate(App.State.inventory[key]);
      }
    });
    labels.push(oil);
    data.push(total);
  });

  const denseMode = labels.length > 8;
  if (chartWrapper) {
    chartWrapper.style.height = denseMode
      ? `${Math.min(620, Math.max(300, labels.length * 42))}px`
      : "220px";
  }

  const renderKey = JSON.stringify({
    labels,
    data,
    updated: App.State.lastInventoryUpdate || 0,
    oils: App.State.commonOils || [],
  });
  if (App.State._lastChartRenderKey === renderKey) return;
  App.State._lastChartRenderKey = renderKey;

  const sub = document.getElementById("chart-last-updated");
  if (sub) {
    if (App.State.lastInventoryUpdate) {
      const updatedAt = new Date(App.State.lastInventoryUpdate);
      const timeStr = updatedAt.toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      sub.innerText = `Detailed Monitoring Dashboard - Last Updated: ${timeStr}${denseMode ? " (Dense mode)" : ""}`;
    } else {
      sub.innerText = "Detailed Monitoring Dashboard - Last Updated: Waiting for data...";
    }
  }

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const gridColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)";
  const fontColor = isDark ? "#EEE" : "#333";

  const bgColors = data.map((val) => {
    if (val < 100) return "rgba(255, 69, 58, 0.85)";
    if (val >= 100 && val < 500) return "rgba(255, 214, 10, 0.85)";
    if (val >= 1000) return "rgba(40, 167, 69, 0.85)";
    return "rgba(10, 83, 190, 0.85)";
  });

  const borderColors = data.map((val) => {
    if (val < 100) return "#FF453A";
    if (val >= 100 && val < 500) return "#FFD60A";
    if (val >= 1000) return "#28A745";
    return "#0A53BE";
  });

  if (App.State.chartInstance) App.State.chartInstance.destroy();

  App.State.chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Inventory Level",
          data,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: borderColors,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: "easeOutElastic",
        delay: (context) => context.dataIndex * 100,
      },
      plugins: {
        legend: { display: false },
          datalabels: {
          anchor: denseMode ? "end" : "end",
          align: denseMode ? "right" : "top",
          color: fontColor,
          font: {
            weight: "bold",
            family: "Outfit",
          },
          offset: 4,
        },
        tooltip: {
          backgroundColor: isDark ? "#333" : "#FFF",
          titleColor: fontColor,
          bodyColor: fontColor,
          borderColor: gridColor,
          borderWidth: 1,
        },
      },
      scales: {
        y: denseMode
          ? {
              ticks: { color: fontColor, font: { size: 12 } },
              grid: { display: false },
            }
          : {
              beginAtZero: true,
              grace: "15%",
              ticks: { color: fontColor },
              grid: { color: gridColor },
            },
        x: denseMode
          ? {
              beginAtZero: true,
              grace: "8%",
              ticks: { color: fontColor },
              grid: { color: gridColor },
            }
          : {
              ticks: { color: fontColor },
              grid: { display: false },
            },
      },
      indexAxis: denseMode ? "y" : "x",
    },
  });
};

App.UI.renderLiveTicker = () => {
  const container = document.getElementById("live-ticker-container");
  const textEl = document.getElementById("live-ticker-text");
  if (!container || !textEl) return;

  if (document.visibilityState === "hidden") {
    textEl.style.animationPlayState = "paused";
    return;
  }

  const now = Date.now();
  const messages = (App.State.liveMessages || []).filter((m) => {
    const ts = typeof m === "object" ? (m.ts || 0) : 0;
    return now - ts <= 24 * 60 * 60 * 1000;
  });

  if (messages.length === 0) {
    container.classList.add("hidden");
    App.State._lastTickerRenderKey = "";
    return;
  }

  container.classList.remove("hidden");

  const items = messages.map((m) => {
    if (typeof m === "string") return m;
    const time = new Date(m.ts).toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `[${time}] ${m.text}`;
  });

  const gap = " ".repeat(40);
  const displayStr = items.join(gap);
  const duration = Math.max(12, displayStr.length * 0.12 + 8);
  const renderKey = `${displayStr}::${duration}`;
  if (App.State._lastTickerRenderKey === renderKey) {
    textEl.style.animationPlayState = "running";
    return;
  }
  App.State._lastTickerRenderKey = renderKey;

  textEl.style.animation = "none";
  textEl.innerText = displayStr;
  void textEl.offsetWidth;
  textEl.style.animation = `tickerScrollClassicFinal ${duration}s linear infinite`;
  textEl.style.animationPlayState = "running";

  container.onclick = () => window.showLiveHistory();
};
