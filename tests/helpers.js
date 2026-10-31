// Helpers for the widget tests. The tests never call the real Open-Meteo: a helper answers it
// with the mock forecast of tests/forecast.json.
import { readFile } from "node:fs/promises";

const forecast = await readFile(new URL("forecast.json", import.meta.url), "utf8");

/**
 * Answers each request to Open-Meteo with the mock forecast, or with `status` when it is given.
 * Returns the list of the addresses that the widget asked for, as URL objects.
 */
export async function fakeForecast(page, status = 200) {
  const requests = [];
  await page.route("https://api.open-meteo.com/**", (route) => {
    requests.push(new URL(route.request().url()));
    if (status !== 200) return route.fulfill({ status });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      // Eva's Content Security Policy allows the host; a browser also needs the CORS header.
      headers: { "access-control-allow-origin": "*" },
      body: forecast,
    });
  });
  return requests;
}

/** Answers eva/location.json as Eva does, with this point, or with null for "no location yet". */
export async function fakeEvaLocation(page, point) {
  await page.route("**/eva/location.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(point) }),
  );
}
