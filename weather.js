// The forecast of Open-Meteo, as the widget shows it. This file reads no page and no network, so
// the unit tests of tests/weather.test.js run it in Node.
//
// Open-Meteo gives each time in the time zone of the place, as `2026-03-10T13:00`, with no offset.

export const forecastHost = "https://api.open-meteo.com";
const hourMs = 3_600_000;
const dayMs = 86_400_000;

/**
 * The sky of each WMO weather code, which Open-Meteo gives as `weather_code`, with the icon that
 * the widget draws for it.
 */
const skies = new Map([
  [0, ["Clear", "clear"]],
  [1, ["Mostly clear", "clear"]],
  [2, ["Partly cloudy", "partly"]],
  [3, ["Cloudy", "cloud"]],
  [45, ["Fog", "fog"]],
  [48, ["Icy fog", "fog"]],
  [51, ["Light drizzle", "rain"]],
  [53, ["Drizzle", "rain"]],
  [55, ["Heavy drizzle", "rain"]],
  [56, ["Freezing drizzle", "rain"]],
  [57, ["Freezing drizzle", "rain"]],
  [61, ["Light rain", "rain"]],
  [63, ["Rain", "rain"]],
  [65, ["Heavy rain", "rain"]],
  [66, ["Freezing rain", "rain"]],
  [67, ["Freezing rain", "rain"]],
  [71, ["Light snow", "snow"]],
  [73, ["Snow", "snow"]],
  [75, ["Heavy snow", "snow"]],
  [77, ["Snow grains", "snow"]],
  [80, ["Light showers", "rain"]],
  [81, ["Showers", "rain"]],
  [82, ["Heavy showers", "rain"]],
  [85, ["Snow showers", "snow"]],
  [86, ["Heavy snow showers", "snow"]],
  [95, ["Thunderstorm", "storm"]],
  [96, ["Thunderstorm with hail", "storm"]],
  [99, ["Thunderstorm with hail", "storm"]],
]);

/** The words and the icon of a weather code: `{ text, icon }`. An unknown code reads "Unknown". */
export function sky(code) {
  const [text, icon] = skies.get(code) ?? ["Unknown", "cloud"];
  return { text, icon };
}

/** A point of eva/location.json, or null when the value is not one. */
export function pointOf(value) {
  if (typeof value !== "object" || value === null) return null;
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return value;
}

/**
 * The address of the forecast. The location goes with two decimals, about one kilometre: enough
 * for the weather, and no more than that leaves the device.
 */
export function forecastUrl(point, unit = "celsius") {
  const fahrenheit = unit === "fahrenheit";
  const query = new URLSearchParams({
    latitude: point.latitude.toFixed(2),
    longitude: point.longitude.toFixed(2),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m",
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: fahrenheit ? "fahrenheit" : "celsius",
    wind_speed_unit: fahrenheit ? "mph" : "kmh",
  });
  return `${forecastHost}/v1/forecast?${query.toString()}`;
}

/** A list of Open-Meteo, or an empty list. */
function list(block, key) {
  return Array.isArray(block?.[key]) ? block[key] : [];
}

/** The weather now: `{ temperature, feelsLike, code, isDay, wind, humidity, time }`, or null. */
export function now(forecast) {
  const current = forecast?.current;
  if (typeof current?.temperature_2m !== "number") return null;
  return {
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    code: current.weather_code,
    isDay: current.is_day !== 0,
    wind: current.wind_speed_10m,
    humidity: current.relative_humidity_2m,
    time: typeof current.time === "string" ? current.time : "",
  };
}

/** The hours after the time of `now`, up to `count`: `{ time, temperature, code, rain, isDay }`. */
export function nextHours(forecast, count = 24) {
  const hourly = forecast?.hourly;
  const times = list(hourly, "time");
  const temperatures = list(hourly, "temperature_2m");
  const codes = list(hourly, "weather_code");
  const rain = list(hourly, "precipitation_probability");
  const isDay = list(hourly, "is_day");
  const from = now(forecast)?.time ?? "";
  const hours = [];
  for (let index = 0; index < times.length && hours.length < count; index += 1) {
    if (times[index] <= from) continue;
    hours.push({
      time: times[index],
      temperature: temperatures[index],
      code: codes[index],
      rain: rain[index],
      isDay: isDay[index] !== 0,
    });
  }
  return hours;
}

/** Each day of the forecast, today first: `{ date, code, high, low, rain, sunrise, sunset }`. */
export function days(forecast) {
  const daily = forecast?.daily;
  const [codes, highs, lows, rain, sunrises, sunsets] = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "sunrise",
    "sunset",
  ].map((key) => list(daily, key));
  return list(daily, "time").map((date, index) => ({
    date,
    code: codes[index],
    high: highs[index],
    low: lows[index],
    rain: rain[index],
    sunrise: sunrises[index],
    sunset: sunsets[index],
  }));
}

/** A temperature as the widget shows it, such as "12°". */
export function degrees(value) {
  return typeof value === "number" ? `${String(Math.round(value))}°` : "–";
}

/** The `HH:MM` of an Open-Meteo time, which is already in the time zone of the place. */
export function clock(time) {
  return typeof time === "string" ? time.slice(11, 16) : "";
}

/**
 * The age of a stored location when it is more than a day old, such as "3 days ago". Null for a
 * newer location, or with no time: while a phone shares the location, it stays a few hours old.
 */
export function staleAge(at, nowMs = Date.now()) {
  const time = typeof at === "string" ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(time)) return null;
  const age = nowMs - time;
  if (age <= dayMs) return null;
  if (age < 2 * dayMs) return `${String(Math.floor(age / hourMs))} hours ago`;
  return `${String(Math.floor(age / dayMs))} days ago`;
}
