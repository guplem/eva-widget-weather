import { expect, test } from "@playwright/test";
import { fakeForecast } from "./helpers.js";

async function open(page, size) {
  const requests = await fakeForecast(page);
  await page.goto(`/?size=${size}`);
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  return requests;
}

test("the card shows the weather now, with the credit of Open-Meteo", async ({ page }) => {
  await open(page, "small");
  await expect(page.locator('[data-role="now-temperature"]')).toHaveText("14°");
  await expect(page.locator('[data-role="now-sky"]')).toHaveText("Partly cloudy");
  const credit = page.getByRole("link", { name: "Weather data by Open-Meteo" });
  await expect(credit).toBeVisible();
  await expect(credit).toHaveAttribute("href", "https://open-meteo.com/");
  await expect(page.locator(".hours")).toBeHidden();
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

test("when the forecast does not load, the widget says so, and keeps the credit", async ({ page }) => {
  const requests = await fakeForecast(page, 503);
  await page.goto("/?size=medium");
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
  expect(requests.length).toBe(1);
  await expect(page.locator('[data-role="message"]')).toHaveText(
    "The forecast did not load. The widget tries again soon.",
  );
  await expect(page.locator(".credit")).toBeVisible();
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
