import { expect, test } from "@playwright/test";
import { fakeEvaLocation, fakeForecast } from "./helpers.js";

async function ready(page) {
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
}

test.describe("outside Eva, when the visitor allows the location", () => {
  test.use({ geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"] });

  test("shows the weather of the visitor's real location", async ({ page }) => {
    const requests = await fakeForecast(page);
    await page.goto("/");
    await ready(page);
    await expect(page.locator('[data-role="place"]')).toHaveText("Near 51.50, -0.12");
    expect(requests[0].searchParams.get("latitude")).toBe("51.50");
    expect(requests[0].searchParams.get("longitude")).toBe("-0.12");
  });
});

test("outside Eva, when the visitor does not allow the location, shows the mock location", async ({ page }) => {
  const requests = await fakeForecast(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator('[data-role="place"]')).toHaveText("Example location: 48.86, 2.29");
  expect(requests[0].searchParams.get("latitude")).toBe("48.86");
});

test.describe("inside Eva", () => {
  test.use({ geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"] });

  test("shows the weather of Eva's location, never the browser's or the mock one", async ({ page }) => {
    const requests = await fakeForecast(page);
    await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    await fakeEvaLocation(page, { latitude: 40.4168, longitude: -3.7038, accuracy: 20, at: "2026-01-01T09:30:00Z" });
    await page.goto("/");
    await ready(page);
    await expect(page.locator('[data-role="place"]')).toHaveText("Near 40.42, -3.70");
    expect(requests.map((url) => url.searchParams.get("latitude"))).toEqual(["40.42"]);
  });

  test("says how to share a location when Eva has none, and asks Open-Meteo nothing", async ({ page }) => {
    const requests = await fakeForecast(page);
    await fakeEvaLocation(page, null);
    await page.goto("/?size=medium");
    await ready(page);
    await expect(page.locator('[data-role="message"]')).toContainText("Eva has no location yet.");
    await expect(page.locator('[data-role="message"]')).toContainText("Your location");
    await expect(page.locator(".now")).toBeHidden();
    await expect(page.locator(".credit")).toBeVisible();
    expect(requests).toEqual([]);
  });

  test("shows the age of a location that is more than a day old", async ({ page }) => {
    await fakeForecast(page);
    await page.clock.setFixedTime(new Date("2026-03-10T12:00:00Z"));
    await fakeEvaLocation(page, { latitude: 40.4168, longitude: -3.7038, accuracy: 20, at: "2026-03-07T10:00:00Z" });
    await page.goto("/?size=medium");
    await ready(page);
    await expect(page.locator('[data-role="place"]')).toHaveText("Near 40.42, -3.70 · Location from 3 days ago");
  });
});
