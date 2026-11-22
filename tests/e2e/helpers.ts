import { expect, type Page } from "@playwright/test";

export async function loginAs(page: Page, role: "OWNER" | "MANAGER" | "SUPERVISOR" | "CONTRACTOR" | "FINANCE") {
  await page.context().clearCookies();
  // The first-run tutorial would cover the page; tests that need it turn it back on.
  await page.addInitScript(() => localStorage.setItem("trussly-tour-off", "1"));
  await page.goto("/login");
  await page.locator(`form:has(input[value="${role}"]) button`).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function openProject(page: Page, name: string, tab?: string) {
  await page.goto("/projects");
  await page.getByRole("link", { name: new RegExp(name) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  if (tab) await page.getByRole("link", { name: tab, exact: true }).click();
}

export const PHOTO = "tests/e2e/fixtures/site.png";
