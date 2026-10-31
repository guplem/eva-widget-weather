// The weather widget. It talks to its host only through fetch to relative paths, and to the one
// host of its manifest, Open-Meteo. Inside Eva, eva/location.json answers with the person's last
// location. On GitHub Pages, the browser's location or the mock one stands in for it.
// See the contract: https://github.com/guplem/eva/blob/main/docs/widgets.md
//
// weather.js reads the forecast. This file finds the location, asks for the forecast, and draws.
import { clock, days, degrees, forecastUrl, nextHours, now, pointOf, sky, staleAge } from "./weather.js";

const sizes = ["small", "medium", "large", "full"];
const locationTimeoutMs = 8000;
const requestTimeoutMs = 15_000;
const refreshMs = 30 * 60_000;
const retryMs = 5 * 60_000;
const staleMs = 15 * 60_000;
const svgSpace = "http://www.w3.org/2000/svg";
const noForecast = "The forecast did not load. The widget tries again in a few minutes.";
const noLocationHere = "Eva could not give the location. The widget tries again in a few minutes.";

const root = document.querySelector(".widget");
const part = (role) => root.querySelector(`[data-role="${role}"]`);
const weekdayFormat = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });

let unit = "celsius";
let loadedAt = 0;
/** The number of the newest load: an older load that ends later draws nothing. */
let loadNumber = 0;
let retryTimer = 0;

/**
 * The answer at an address: `{ status, body }`, with the JSON body when the answer is ok. Status 0
 * when no answer came, such as when the network is down or the request took too long.
 */
async function request(address) {
  try {
    const response = await fetch(address, { cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs) });
    return { status: response.status, body: response.ok ? await response.json() : undefined };
  } catch {
    return { status: 0, body: undefined };
  }
}

/**
 * The browser's location, or null when the visitor does not allow it. The widget also stops
 * waiting by itself, because the browser's timeout does not run while it asks the visitor.
 */
function browserLocation() {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), locationTimeoutMs);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { timeout: locationTimeoutMs, maximumAge: 600000 },
    );
  });
}

/**
 * Eva's location first, then the browser's, then the mock one, as the contract says. Only a
 * missing path, as on GitHub Pages, moves on to the browser. Inside Eva, the path always answers,
 * so a failed answer there is an error, never a reason to show the mock location.
 */
async function findLocation() {
  const eva = await request("eva/location.json");
  if (eva.status === 200) return { source: "eva", point: pointOf(eva.body) };
  if (eva.status !== 404) return { source: "eva", point: null, failed: true };
  const point = await browserLocation();
  if (point !== null) return { source: "browser", point };
  return { source: "example", point: pointOf((await request("example/location.json")).body) };
}

// --- Drawing ------------------------------------------------------------------------------------

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svg(tag, attributes) {
  const node = document.createElementNS(svgSpace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

const cloudPath = "M7 19h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.7A3.2 3.2 0 0 0 7 19z";
const sunRays = [0, 45, 90, 135, 180, 225, 270, 315];

/** A weather icon, drawn here: clear, partly, cloud, fog, rain, snow or storm. */
function icon(kind, isDay = true) {
  const picture = svg("svg", { viewBox: "0 0 24 24", class: `icon icon-${kind}`, "aria-hidden": "true" });
  const sun = (x, y, radius) => {
    const group = svg("g", { class: "icon-sun" });
    group.append(svg("circle", { cx: x, cy: y, r: radius }));
    for (const angle of sunRays) {
      const rad = (angle * Math.PI) / 180;
      const near = radius + 1.6;
      const far = radius + 3.4;
      group.append(
        svg("line", {
          x1: x + near * Math.cos(rad),
          y1: y + near * Math.sin(rad),
          x2: x + far * Math.cos(rad),
          y2: y + far * Math.sin(rad),
        }),
      );
    }
    return group;
  };
  const moon = (x, y) =>
    svg("path", {
      class: "icon-moon",
      d: `M${String(x + 3)} ${String(y - 5.5)}a6 6 0 1 0 3.2 9.6A5 5 0 0 1 ${String(x + 3)} ${String(y - 5.5)}z`,
    });
  const cloud = (shift = 0) =>
    svg("path", { class: "icon-cloud", d: cloudPath, transform: `translate(0 ${String(shift)})` });
  if (kind === "clear") picture.append(isDay ? sun(12, 12, 4.5) : moon(10, 12));
  else if (kind === "partly") picture.append(isDay ? sun(8.5, 8, 3) : moon(7, 8), cloud(1.5));
  else if (kind === "cloud") picture.append(cloud());
  else if (kind === "fog") {
    for (const y of [8, 12, 16]) picture.append(svg("line", { class: "icon-fog", x1: 4, y1: y, x2: 20, y2: y }));
  } else {
    picture.append(cloud(-3));
    for (const x of [8.5, 12.5, 16.5]) {
      if (kind === "snow") picture.append(svg("circle", { class: "icon-snow", cx: x - 0.5, cy: 19.5, r: 1.1 }));
      else if (kind === "rain")
        picture.append(svg("line", { class: "icon-rain", x1: x, y1: 18, x2: x - 1.5, y2: 21.5 }));
    }
    if (kind === "storm") picture.append(svg("path", { class: "icon-bolt", d: "M13 15l-3 4h3l-2 4 5-5.5h-3l2-2.5z" }));
  }
  return picture;
}

function show(state) {
  root.dataset.state = state;
}

/** "Today" for the date of the weather now, else the short weekday. */
function dayName(date, today) {
  return date === today ? "Today" : weekdayFormat.format(new Date(`${date}T00:00Z`));
}

function rainText(chance) {
  return typeof chance === "number" && chance > 0 ? `${String(chance)}%` : "";
}

function drawNow(current, today) {
  const { text, icon: kind } = sky(current.code);
  part("now-icon").replaceChildren(icon(kind, current.isDay));
  part("now-temperature").textContent = degrees(current.temperature);
  part("now-sky").textContent = text;
  const range = [];
  if (typeof current.feelsLike === "number") range.push(`Feels like ${degrees(current.feelsLike)}`);
  if (today !== undefined) range.push(`High ${degrees(today.high)}`, `Low ${degrees(today.low)}`);
  part("now-range").textContent = range.join(" · ");

  const speed = unit === "fahrenheit" ? "mph" : "km/h";
  const details = [
    ["Wind", typeof current.wind === "number" ? `${String(Math.round(current.wind))} ${speed}` : "–"],
    ["Humidity", typeof current.humidity === "number" ? `${String(current.humidity)}%` : "–"],
    ["Sunrise", clock(today?.sunrise) || "–"],
    ["Sunset", clock(today?.sunset) || "–"],
  ];
  part("details").replaceChildren(
    ...details.map(([name, value]) => {
      const item = element("div", "detail");
      item.append(element("dt", "detail-name", name), element("dd", "detail-value", value));
      return item;
    }),
  );
}

function drawHours(forecast) {
  part("hours").replaceChildren(
    ...nextHours(forecast, 24).map((hour) => {
      const { text, icon: kind } = sky(hour.code);
      const item = element("li", "hour");
      item.title = text;
      item.append(
        element("span", "hour-time", clock(hour.time)),
        icon(kind, hour.isDay),
        element("span", "hour-temperature", degrees(hour.temperature)),
        element("span", "rain", rainText(hour.rain)),
      );
      return item;
    }),
  );
}

/** Each day with a bar from its low to its high, on the scale of the whole week. */
function drawDays(week, today) {
  const coldest = Math.min(...week.map((day) => day.low));
  const warmest = Math.max(...week.map((day) => day.high));
  const span = Math.max(1, warmest - coldest);
  part("days").replaceChildren(
    ...week.map((day) => {
      const { text, icon: kind } = sky(day.code);
      const item = element("li", "day");
      item.title = text;
      const bar = svg("svg", {
        class: "range",
        viewBox: "0 0 100 10",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
      });
      const from = ((day.low - coldest) / span) * 100;
      const to = ((day.high - coldest) / span) * 100;
      bar.append(
        svg("rect", { class: "range-track", x: 0, y: 3, width: 100, height: 4, rx: 2 }),
        svg("rect", { class: "range-fill", x: from, y: 3, width: Math.max(2, to - from), height: 4, rx: 2 }),
      );
      item.append(
        element("span", "day-name", dayName(day.date, today)),
        icon(kind),
        element("span", "rain", rainText(day.rain)),
        element("span", "day-low", degrees(day.low)),
        bar,
        element("span", "day-high", degrees(day.high)),
      );
      return item;
    }),
  );
}

function drawPlace(source, point) {
  const where = `${point.latitude.toFixed(2)}, ${point.longitude.toFixed(2)}`;
  const age = source === "eva" ? staleAge(point.at) : null;
  part("place-where").textContent = source === "example" ? `Example location: ${where}` : `Near ${where}`;
  part("place-age").textContent = age === null ? "" : `Location from ${age}`;
  part("place").classList.toggle("is-stale", age !== null);
}

function showMessage(state, text) {
  part("message").textContent = text;
  show(state);
}

// --- Start ----------------------------------------------------------------------------------------

/**
 * A failure keeps the forecast that the card shows, and tries again in a few minutes. Only a card
 * with no forecast yet shows the error.
 */
function failed(text) {
  if (root.dataset.state !== "ready") showMessage("error", text);
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void load(), retryMs);
}

async function load() {
  const number = (loadNumber += 1);
  loadedAt = Date.now();
  const location = await findLocation();
  if (number !== loadNumber) return;
  if (location.failed === true) {
    failed(noLocationHere);
    return;
  }
  if (location.point === null) {
    part("place").classList.remove("is-stale");
    show("no-location");
    return;
  }
  const answer = await request(forecastUrl(location.point, unit));
  if (number !== loadNumber) return;
  const current = now(answer.body);
  if (current === null) {
    failed(noForecast);
    return;
  }
  const week = days(answer.body).filter((day) => typeof day.high === "number" && typeof day.low === "number");
  const today = current.time.slice(0, 10);
  drawPlace(location.source, location.point);
  drawNow(
    current,
    week.find((day) => day.date === today),
  );
  drawHours(answer.body);
  drawDays(week, today);
  show("ready");
}

async function start() {
  const size = new URLSearchParams(window.location.search).get("size");
  // Opened alone in a browser, the widget shows its full-screen view.
  root.dataset.size = sizes.includes(size) ? size : "full";
  const config = (await request("config.json")).body ?? {};
  if (config.unit === "fahrenheit") unit = "fahrenheit";
  await load();
  setInterval(() => void load(), refreshMs);
  // The home page can stay away for hours: show a fresh forecast when it shows again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > staleMs) void load();
  });
  // Tests wait for this flag: every part of the widget has its content now.
  root.dataset.ready = "true";
}

void start();
