const $ = (id) => document.getElementById(id);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatINR(n) {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const x = Math.abs(n);
  // Indian numbering format
  return (
    sign +
    "₹" +
    x.toLocaleString("en-IN", {
      maximumFractionDigits: 0,
    })
  );
}

// SIP FV: P * [((1+r)^n - 1)/r] * (1+r)
function sipFutureValue(monthly, annualRate, years) {
  const n = Math.round(years * 12);
  const r = annualRate / 100 / 12;
  if (n <= 0 || monthly <= 0) return 0;
  if (r === 0) return monthly * n;
  const fv = monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  return fv;
}

function inflationAdjust(value, inflationRate, years) {
  const i = inflationRate / 100;
  if (years <= 0) return value;
  return value / Math.pow(1 + i, years);
}

function buildSeries(monthly, annualRate, years) {
  const n = Math.max(1, Math.round(years * 12));
  const r = annualRate / 100 / 12;

  let invested = 0;
  let value = 0;

  const pts = [];
  for (let m = 1; m <= n; m++) {
    invested += monthly;
    // previous value compounds, then add this month's SIP
    value = value * (1 + r) + monthly;
    if (m % 12 === 0 || m === n) {
      pts.push({
        year: Math.ceil(m / 12),
        invested,
        value,
      });
    }
  }
  return pts;
}

function renderChart(svg, series, showInvested) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const W = 720, H = 260;
  const padL = 46, padR = 18, padT = 18, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxY = Math.max(
    1,
    ...series.map((p) => Math.max(p.value, showInvested ? p.invested : 0))
  );

  const x = (i) => padL + (innerW * i) / (series.length - 1 || 1);
  const y = (val) => padT + innerH - (innerH * val) / maxY;

  // grid lines
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grid.setAttribute("opacity", "0.9");

  for (let i = 0; i <= 4; i++) {
    const gy = padT + (innerH * i) / 4;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", W - padR);
    line.setAttribute("y1", gy);
    line.setAttribute("y2", gy);
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-opacity", "0.10");
    svg.appendChild(line);
  }

  // axes labels (min + max)
  const labelMax = document.createElementNS("http://www.w3.org/2000/svg", "text");
  labelMax.setAttribute("x", padL);
  labelMax.setAttribute("y", padT + 12);
  labelMax.setAttribute("fill", "currentColor");
  labelMax.setAttribute("fill-opacity", "0.6");
  labelMax.setAttribute("font-size", "12");
  labelMax.textContent = formatINR(maxY);
  svg.appendChild(labelMax);

  const labelMin = document.createElementNS("http://www.w3.org/2000/svg", "text");
  labelMin.setAttribute("x", padL);
  labelMin.setAttribute("y", padT + innerH + 20);
  labelMin.setAttribute("fill", "currentColor");
  labelMin.setAttribute("fill-opacity", "0.6");
  labelMin.setAttribute("font-size", "12");
  labelMin.textContent = "₹0";
  svg.appendChild(labelMin);

  // helper for path
  function pathFor(key) {
    let d = "";
    series.forEach((p, i) => {
      const px = x(i);
      const py = y(p[key]);
      d += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
    });
    return d;
  }

  // future value line
  const pathA = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathA.setAttribute("d", pathFor("value"));
  pathA.setAttribute("fill", "none");
  pathA.setAttribute("stroke", "currentColor");
  pathA.setAttribute("stroke-opacity", "0.95");
  pathA.setAttribute("stroke-width", "3");
  pathA.setAttribute("stroke-linecap", "round");
  svg.appendChild(pathA);

  // invested line (optional)
  if (showInvested) {
    const pathB = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathB.setAttribute("d", pathFor("invested"));
    pathB.setAttribute("fill", "none");
    pathB.setAttribute("stroke", "currentColor");
    pathB.setAttribute("stroke-opacity", "0.55");
    pathB.setAttribute("stroke-width", "2");
    pathB.setAttribute("stroke-dasharray", "6 6");
    pathB.setAttribute("stroke-linecap", "round");
    svg.appendChild(pathB);
  }

  // dots
  series.forEach((p, i) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x(i));
    dot.setAttribute("cy", y(p.value));
    dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", "currentColor");
    dot.setAttribute("fill-opacity", "0.95");
    svg.appendChild(dot);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("finlite-theme", theme);
  const icon = $("#themeBtn")?.querySelector(".icon");
  if (icon) icon.textContent = theme === "light" ? "☀" : "☾";
}

function getTheme() {
  const saved = localStorage.getItem("finlite-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function recalc() {
  const monthly = clamp(Number($("#sip").value || 0), 0, 1e9);
  const years = clamp(Number($("#years").value || 0), 0, 80);
  const rate = clamp(Number($("#rate").value || 0), 0, 100);
  const inflation = clamp(Number($("#inflation").value || 0), 0, 50);

  const useInflation = $("#useInflation").checked;
  const showInvested = $("#showInvested").checked;

  const fv = sipFutureValue(monthly, rate, years);
  const invested = monthly * Math.round(years * 12);
  const gain = fv - invested;

  const realFV = inflationAdjust(fv, inflation, years);

  $("#fv").textContent = formatINR(useInflation ? realFV : fv);
  $("#invested").textContent = formatINR(invested);
  $("#gain").textContent = formatINR(gain);

  $("#fvHint").textContent = useInflation
    ? `Real value (today’s ₹), assuming ${inflation.toFixed(1)}% inflation`
    : `Nominal value at ${rate.toFixed(1)}% expected return`;

  // hero stats
  $("#statFV").textContent = formatINR(useInflation ? realFV : fv);
  $("#statInvested").textContent = formatINR(invested);
  $("#statGain").textContent = formatINR(gain);

  const series = buildSeries(monthly, rate, years);
  $("#chartMeta").textContent = `${series.length} points • ${years} years • ${rate.toFixed(1)}% p.a.`;

  renderChart($("#chart"), series, showInvested);
}

function wire() {
  applyTheme(getTheme());

  $("#themeBtn").addEventListener("click", () => {
    const now = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(now === "dark" ? "light" : "dark");
  });

  $("#calcBtn").addEventListener("click", recalc);

  ["sip","years","rate","inflation","useInflation","showInvested"].forEach((id) => {
    const el = $(id);
    el.addEventListener("input", recalc);
    el.addEventListener("change", recalc);
  });

  recalc();
}

document.addEventListener("DOMContentLoaded", wire);
