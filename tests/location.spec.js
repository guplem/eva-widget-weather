import { expect, test } from "@playwright/test";
import { fakeEvaLocation, fakeForecast } from "./helpers.js";

async function ready(page) {
  await expect(page.locator(".widget")).toHaveAttribute("data-ready", "true");
}

const where = '[data-role="place-where"]';
const age = '[data-role="place-age"]';

test.describe("outside Eva, when the visitor allows the location", () => {
  test.use({ geolocation: { latitude: 51.5007, longitude: -0.1246 }, permissions: ["geolocation"] });

  test("shows the weather of the visitor's real location", async ({ page }) => {
    const requests = await fakeForecast(page);
    await page.goto("/");
    await ready(page);
    await expect(page.locator(where)).toHaveText("Near 51.50, -0.12");
    expect(requests[0].searchParams.get("latitude")).toBe("51.50");
    expect(requests[0].searchParams.get("longitude")).toBe("-0.12");
  });
});

test("outside Eva, when the visitor does not allow the location, shows the mock location", async ({ page }) => {
  const requests = await fakeForecast(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator(where)).toHaveText("Example location: 48.86, 2.29");
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
    await expect(page.locator(where)).toHaveText("Near 40.42, -3.70");
    await expect(page.locator(age)).toHaveText("");
    expect(requests.map((url) => url.searchParams.get("latitude"))).toEqual(["40.42"]);
  });

  test("when Eva's location does not answer, never shows the browser's or the mock one", async ({ page }) => {
    const requests = await fakeForecast(page);
    await page.route("**/eva/location.json", (route) => route.fulfill({ status: 500 }));
    await page.goto("/?size=medium");
    await ready(page);
    await expect(page.locator('[data-role="message"]')).toHaveText(
      "Eva could not give the location. The widget tries again in a few minutes.",
    );
    expect(requests).toEqual([]);
  });

  test("says how to share a location when Eva has none, and asks Open-Meteo nothing", async ({ page }) => {
    const requests = await fakeForecast(page);
    await fakeEvaLocation(page, null);
    await page.goto("/?size=medium");
    await ready(page);
    const message = page.locator('[data-role="no-location"]');
    await expect(message).toContainText("Eva has no location yet.");
    await expect(message).toContainText("Settings > Access > Your location");
    await expect(message).toContainText("Telegram");
    await expect(page.locator(".now")).toBeHidden();
    await expect(page.locator(".credit")).toBeVisible();
    expect(requests).toEqual([]);
  });

  test("the small card says how to share a location, in full", async ({ page }) => {
    await page.setViewportSize({ width: 160, height: 160 });
    await fakeForecast(page);
    await fakeEvaLocation(page, null);
    await page.goto("/?size=small");
    await ready(page);
    const message = page.locator('[data-role="no-location"]');
    await expect(message).toContainText("Settings > Access > Your location");
    expect(await message.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  });

  test("shows the age of a location that is more than a day old, also on the small card", async ({ page }) => {
    await fakeForecast(page);
    await page.clock.setFixedTime(new Date("2026-03-10T12:00:00Z"));
    await fakeEvaLocation(page, { latitude: 40.4168, longitude: -3.7038, accuracy: 20, at: "2026-03-07T10:00:00Z" });
    await page.goto("/?size=small");
    await ready(page);
    await expect(page.locator(age)).toHaveText("Location from 3 days ago");
    await expect(page.locator(age)).toBeVisible();
    await expect(page.locator(where)).toBeHidden();
  });
});
