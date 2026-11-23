import { expect, test } from "@playwright/test";
import { loginAs, openProject, PHOTO, pickOption } from "./helpers";

// P0 hardening: financial privacy, separation of duties and invoice caps.
// Uses Riverside and read-only checks on Harbour View so the other specs are unaffected.

test("privacy: contractors don't see the project's budget or other people's money", async ({ page }) => {
  await loginAs(page, "OWNER");
  await openProject(page, "Riverside Medical Centre");
  await expect(page.getByText("Forecast final cost")).toBeVisible();
  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await expect(page.getByText('invoice for "Plant room roof deck"').first()).toBeVisible();

  await loginAs(page, "CONTRACTOR");
  await openProject(page, "Riverside Medical Centre");
  await expect(page.getByText("Forecast final cost")).toHaveCount(0);
  await expect(page.getByText("Budget vs actual by line")).toHaveCount(0);
  await page.getByRole("link", { name: "Budget & spend", exact: true }).click();
  await expect(page.getByText("Your invoices")).toBeVisible();
  await expect(page.getByText("Budget lines")).toHaveCount(0);
  await expect(page.getByText("Revised budget")).toHaveCount(0);
  // Jonah's roofing invoice and payment are on the trail, but not for Carla.
  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await expect(page.getByText('invoice for "Plant room roof deck"')).toHaveCount(0);
  await expect(page.getByText('invoice for "Structural frame"').first()).toBeVisible();
  // The CSV export follows the same rule.
  const csv = await (await page.request.get(`${new URL(page.url()).pathname}/export`)).text();
  expect(csv).not.toContain("Plant room roof deck");
  expect(csv).toContain("Structural frame");
});

test("privacy: supervisors see work but not the budget", async ({ page }) => {
  await loginAs(page, "SUPERVISOR");
  await openProject(page, "Harbour View Residences");
  await expect(page.getByText("Forecast final cost")).toHaveCount(0);
  await page.getByRole("link", { name: "Budget & spend", exact: true }).click();
  await expect(page.getByText("Budget lines")).toHaveCount(0);
  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await expect(page.getByText(/passed inspection on/).first()).toBeVisible();
  await expect(page.getByText(/invoice for/)).toHaveCount(0);
});

test("separation of duties: a manager can't inspect work they submitted", async ({ page }) => {
  const title = "MEP second fix";
  const card = () => page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: title }) });
  await loginAs(page, "MANAGER");
  await openProject(page, "Riverside Medical Centre", "Work");
  await card().getByRole("button", { name: "Submit completed work" }).click();
  await card().locator('input[name="photos"]').setInputFiles(PHOTO);
  await card().locator('textarea[name="note"]').fill("Second fix complete on all floors.");
  await card().getByRole("button", { name: "Submit for inspection" }).click();
  await expect(card().getByText("Awaiting inspection")).toBeVisible();
  await expect(card().getByRole("button", { name: "Pass inspection" })).toHaveCount(0);
  await expect(card().getByText("You submitted this work, so someone else must inspect it.")).toBeVisible();
  // The step is in the work item's history.
  await card().getByText(/History/).click();
  await expect(card().getByText(`submitted work on "${title}"`)).toBeVisible();
});

test("invoices: work can't be billed for more than it's worth, and needs a document", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await openProject(page, "Riverside Medical Centre", "Budget & spend");
  await page.locator("summary", { hasText: "Submit an invoice" }).click();
  await expect(page.locator('select[name="milestoneId"] option', { hasText: "Structural frame (invoiced in full)" })).toBeDisabled();

  await openProject(page, "Harbour View Residences", "Budget & spend");
  await page.locator("summary", { hasText: "Submit an invoice" }).click();
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Structure" });
  await pickOption(page, "milestoneId", "Level 2 slab poured");
  await page.locator('input[name="vendor"]').fill("E2E Over Claim");
  await page.locator('input[name="description"]').fill("More than the work is worth");
  await page.locator('input[name="amount"]').fill("200000");
  await page.locator('input[name="invoice"]').setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Submit invoice" }).click();
  await expect(page.getByText(/left to invoice\./)).toBeVisible();
});
