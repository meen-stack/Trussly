import { expect, test } from "@playwright/test";
import { loginAs, openProject } from "./helpers";

// Object-level access: contractors only see their own invoices and the disputes that involve them,
// and someone taken off a project loses its chat. Uses Riverside and Oakridge so the other specs are unaffected.

test("access: a contractor can't see another contractor's invoices or disputes", async ({ page }) => {
  await loginAs(page, "OWNER");
  await openProject(page, "Riverside Medical Centre", "Budget & spend");
  await expect(page.getByText("Price Roofing Co.").first()).toBeVisible();
  await page.getByRole("link", { name: "Disputes", exact: true }).click();
  await expect(page.getByText("Flashing detail missing from drawings").first()).toBeVisible();

  // Carla is on Riverside too, but the roofing invoice and dispute are Jonah's.
  await loginAs(page, "CONTRACTOR");
  await openProject(page, "Riverside Medical Centre", "Budget & spend");
  await expect(page.getByText("Price Roofing Co.")).toHaveCount(0);
  await page.getByRole("link", { name: "Disputes", exact: true }).click();
  await expect(page.getByText("Back-charge for crane standby").first()).toBeVisible();
  await expect(page.getByText("Flashing detail missing from drawings")).toHaveCount(0);
});

test("access: removing someone from a project closes its chat to them", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await page.goto("/messages");
  await page.getByRole("link", { name: /Oakridge Townhomes/ }).first().click();
  await expect(page).toHaveURL(/\/messages\/.+/);
  const chatUrl = page.url();

  await loginAs(page, "OWNER");
  await openProject(page, "Oakridge Townhomes");
  await page.goto(`${new URL(page.url()).pathname}/team`);
  await page.locator("li", { hasText: "Carla Mendes" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("li", { hasText: "Carla Mendes" }).getByRole("button", { name: "Remove" })).toHaveCount(0);

  await loginAs(page, "CONTRACTOR");
  await page.goto("/messages");
  await expect(page.getByRole("link", { name: /Oakridge Townhomes/ })).toHaveCount(0);
  const res = await page.goto(chatUrl);
  expect(res?.status()).toBe(404);
});
