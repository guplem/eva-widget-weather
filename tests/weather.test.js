// The forecast as the widget reads it, in Node.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { clock, days, degrees, forecastUrl, nextHours, now, pointOf, sky, staleAge } from "../weather.js";

const forecast = JSON.parse(await readFile(new URL("forecast.json", import.meta.url), "utf8"));

test("each weather code has words and an icon", () => {
  assert.deepEqual(sky(0), { text: "Clear", icon: "clear" });
  assert.deepEqual(sky(63), { text: "Rain", icon: "rain" });
  assert.deepEqual(sky(95), { text: "Thunderstorm", icon: "storm" });
  assert.deepEqual(sky(1234), { text: "Unknown", icon: "cloud" });
});

test("the forecast address sends the location with two decimals only", () => {
  const url = new URL(forecastUrl({ latitude: 48.858444, longitude: 2.294533 }));
  assert.equal(url.origin, "https://api.open-meteo.com");
  assert.equal(url.pathname, "/v1/forecast");
  assert.equal(url.searchParams.get("latitude"), "48.86");
  assert.equal(url.searchParams.get("longitude"), "2.29");
  assert.equal(url.searchParams.get("timezone"), "auto");
  assert.equal(url.searchParams.get("temperature_unit"), "celsius");
});

test("Fahrenheit asks for miles per hour too", () => {
  const url = new URL(forecastUrl({ latitude: 1, longitude: 2 }, "fahrenheit"));
  assert.equal(url.searchParams.get("temperature_unit"), "fahrenheit");
  assert.equal(url.searchParams.get("wind_speed_unit"), "mph");
});

test("a location must have a latitude and a longitude in range", () => {
  assert.equal(pointOf(null), null);
  assert.equal(pointOf({ latitude: 91, longitude: 0 }), null);
  assert.equal(pointOf({ latitude: "48", longitude: 2 }), null);
  assert.deepEqual(pointOf({ latitude: 48, longitude: 2 }), { latitude: 48, longitude: 2 });
});

test("the weather now, the next hours and the days come from the forecast", () => {
  assert.equal(now(forecast).temperature, 14.2);
  assert.equal(now(forecast).isDay, true);
  const hours = nextHours(forecast, 3);
  assert.deepEqual(
    hours.map((hour) => clock(hour.time)),
    ["13:00", "14:00", "15:00"],
  );
  assert.equal(hours[0].rain, 30);
  const week = days(forecast);
  assert.equal(week.length, 7);
  assert.deepEqual(
    { date: week[0].date, high: week[0].high, low: week[0].low },
    { date: "2026-03-10", high: 16.1, low: 7.4 },
  );
});

test("a broken forecast gives no weather, and no error", () => {
  assert.equal(now({}), null);
  assert.deepEqual(nextHours({ current: { temperature_2m: 1 } }), []);
  assert.deepEqual(days(null), []);
});

test("a temperature shows rounded, with a degree sign", () => {
  assert.equal(degrees(14.6), "15°");
  assert.equal(degrees(-0.4), "0°");
  assert.equal(degrees(undefined), "–");
});

test("a location shows its age only when it is more than a day old", () => {
  const at = Date.parse("2026-03-10T12:00:00Z");
  assert.equal(staleAge("2026-03-10T06:00:00Z", at), null);
  assert.equal(staleAge("2026-03-09T06:00:00Z", at), "30 hours ago");
  assert.equal(staleAge("2026-03-07T10:00:00Z", at), "3 days ago");
  assert.equal(staleAge(undefined, at), null);
});
