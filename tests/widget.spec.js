import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fakeForecast } from "./helpers.js";

async function open(page, size) {
  const requests = await fakeForecast(page);
  await page.goto(`/?size=${size}`);
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  return requests;
}

test("the card shows the weather now, with no credit", async ({ page }) => {
  await open(page, "small");
  await expect(page.locator('[data-role="now-temperature"]')).toHaveText("14°");
  await expect(page.locator('[data-role="now-sky"]')).toHaveText("Partly cloudy");
  await expect(page.locator(".credit")).toBeHidden();
  await expect(page.locator(".hours")).toBeHidden();
});

for (const size of ["medium", "large"]) {
  test(`the ${size} card shows no credit`, async ({ page }) => {
    await open(page, size);
    await expect(page.locator(".credit")).toBeHidden();
  });
}

test("full screen shows the credit of Open-Meteo, with its link", async ({ page }) => {
  await open(page, "full");
  const credit = page.getByRole("link", { name: "Weather data by Open-Meteo" });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute("href", "https://open-meteo.com/");
});

test("the medium size also shows the next hours, from the hour after now", async ({ page }) => {
  await open(page, "medium");
  await expect(page.locator('[data-role="now-range"]')).toHaveText("Feels like 13° · High 16° · Low 7°");
  await expect(page.locator(".hour-time").first()).toHaveText("13:00");
  await expect(page.locator(".hour-temperature").first()).toHaveText(/^-?\d+°$/);
  await expect(page.locator(".days")).toBeHidden();
});

test("the hours never scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await open(page, "medium");
  const hours = page.locator(".hours");
  await expect(hours).toBeVisible();
  expect(await hours.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("the large size also shows the next days, today first", async ({ page }) => {
  await open(page, "large");
  await expect(page.locator(".day")).toHaveCount(7);
  await expect(page.locator(".day-name").first()).toHaveText("Today");
  await expect(page.locator(".day-high").first()).toHaveText("16°");
  await expect(page.locator(".day-low").first()).toHaveText("7°");
});

test("full screen also shows the wind, the humidity, the sunrise and the sunset", async ({ page }) => {
  await open(page, "full");
  await expect(page.locator(".detail-name")).toHaveText(["Wind", "Humidity", "Sunrise", "Sunset"]);
  await expect(page.locator(".detail-value")).toHaveText(["12 km/h", "62%", "07:12", "18:51"]);
});

test("the unit of config.json asks Open-Meteo for Fahrenheit", async ({ page }) => {
  await page.route("**/config.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unit: "fahrenheit" }) }),
  );
  const requests = await open(page, "full");
  expect(requests[0].searchParams.get("temperature_unit")).toBe("fahrenheit");
  await expect(page.locator(".detail-value").first()).toHaveText("12 mph");
});

test("when the forecast does not load, the widget says so, and full screen keeps the credit", async ({ page }) => {
  const requests = await fakeForecast(page, 503);
  await page.goto("/?size=full");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  expect(requests.length).toBe(1);
  await expect(page.locator('[data-role="message"]')).toHaveText(
    "The forecast did not load. The widget tries again in a few minutes.",
  );
  await expect(page.locator(".credit")).toBeVisible();
});

test("a refresh that fails keeps the forecast on the card, and tries again in a few minutes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-03-10T12:00:00Z") });
  let status = 200;
  const forecast = await readFile(new URL("forecast.json", import.meta.url), "utf8");
  let calls = 0;
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls += 1;
    return status === 200
      ? route.fulfill({
          status,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: forecast,
        })
      : route.fulfill({ status, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/?size=medium");
  await expect(page.locator(".widget")).toHaveAttribute("data-state", "ready");
  status = 503;
  await page.clock.runFor(30 * 60_000);
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator(".widget")).toHaveAttribute("data-state", "ready");
  await expect(page.locator('[data-role="now-temperature"]')).toHaveText("14°");
  status = 200;
  await page.clock.runFor(5 * 60_000);
  await expect.poll(() => calls).toBe(3);
});

test("the next days name today by the date of the weather now", async ({ page }) => {
  const forecast = JSON.parse(await readFile(new URL("forecast.json", import.meta.url), "utf8"));
  forecast.daily.temperature_2m_max[0] = null;
  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(forecast),
    }),
  );
  await page.goto("/?size=large");
  await expect(page.locator(".widget")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".day")).toHaveCount(6);
  await expect(page.locator(".day-name").first()).toHaveText("Wed");
  await expect(page.locator('[data-role="now-range"]')).toHaveText("Feels like 13°");
});

test("the widget follows the dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, "medium");
  const light = await page.locator(".widget").evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.locator(".widget").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(dark).not.toBe(light);
});

test("the demo server answers a broken address with 404, and keeps running", async ({ request }) => {
  expect((await request.get("/%E0%A4%A")).status()).toBe(404);
  expect((await request.get("/")).status()).toBe(200);
});
