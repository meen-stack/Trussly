import { expect, test } from "@playwright/test";
import { loginAs, openProject, PHOTO } from "./helpers";

const PROJECT = "Harbour View Residences";

test("daily report: supervisor files with a photo, manager accepts", async ({ page }) => {
  await loginAs(page, "SUPERVISOR");
  await openProject(page, PROJECT, "Daily reports");
  await page.getByRole("link", { name: /File today/ }).click();
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await page.locator('input[name="date"]').fill(tomorrow);
  await page.locator('textarea[name="workDone"]').fill("E2E: poured level 3 columns on grid A to C.");
  await page.locator('textarea[name="issues"]').fill("E2E: pump arrived late.");
  await page.locator('input[name="photos"]').setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("E2E: poured level 3 columns")).toBeVisible();
  await expect(page.getByText("Issue reported")).toBeVisible();

  await loginAs(page, "MANAGER");
  await page.goto("/notifications");
  await page.getByText(`New daily report: ${PROJECT}`).first().waitFor();
  await page.goto("/approvals");
  await page.getByRole("link", { name: /Issue flagged/ }).first().click();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted").first()).toBeVisible();
});

test("milestone: contractor submits, manager passes, owner signs off", async ({ page }) => {
  const title = "Level 3 and 4 frame";
  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Milestones");
  const card = () => page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: title }) });
  await card().getByRole("button", { name: "Mark done" }).click();
  await card().locator('input[name="photos"]').setInputFiles(PHOTO);
  await card().locator('textarea[name="note"]').fill("Frame complete to level 4.");
  await card().getByRole("button", { name: "Submit for inspection" }).click();
  await expect(card().getByText("Awaiting review")).toBeVisible();

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Milestones");
  await card().getByRole("button", { name: "Pass inspection" }).click();
  await expect(card().getByText("Awaiting sign-off")).toBeVisible();

  await loginAs(page, "OWNER");
  await openProject(page, PROJECT, "Milestones");
  await card().getByRole("button", { name: /Sign off/ }).click();
  await expect(card().getByText("Signed off")).toBeVisible();

  await page.getByRole("link", { name: "Audit trail" }).click();
  await expect(page.getByText(`signed off milestone "${title}"`).first()).toBeVisible();
});

test("spend: large invoice needs manager then owner", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Budget & spend");
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Roofing" });
  await page.locator('input[name="vendor"]').fill("E2E Roofing Supplies");
  await page.locator('input[name="description"]').fill("Roof membrane");
  await page.locator('input[name="amount"]').fill("15000");
  await page.getByRole("button", { name: "Submit invoice" }).click();
  await expect(page.getByText("Invoice submitted for approval.")).toBeVisible();

  const row = () => page.locator("tr", { hasText: "E2E Roofing Supplies" });

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Budget & spend");
  await row().getByRole("button", { name: "Approve" }).click();
  await expect(row().getByText("Pending owner")).toBeVisible();

  await loginAs(page, "OWNER");
  await page.goto("/approvals");
  await page.locator("li", { hasText: "E2E Roofing Supplies" }).getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("li", { hasText: "E2E Roofing Supplies" })).toHaveCount(0);
  await openProject(page, PROJECT, "Budget & spend");
  await expect(row().getByText("Approved")).toBeVisible();
});

test("roles: contractor cannot see approval controls or create projects", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/projects$/);
});

test("signup creates a workspace and a project", async ({ page }) => {
  await page.context().clearCookies();
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.locator('input[name="name"]').fill("Test Owner");
  await page.locator('input[name="company"]').fill("E2E Builders");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("No projects yet")).toBeVisible();

  await page.getByRole("link", { name: "Create a project" }).click();
  await page.locator('input[name="name"]').fill("E2E Tower");
  await page.locator('input[name="location"]').fill("Dallas, TX");
  await page.locator('input[name="endDate"]').fill("2028-01-01");
  await page.locator('input[name="budget"]').fill("900000");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Tower" })).toBeVisible();
  await page.getByRole("link", { name: "Budget & spend" }).click();
  await expect(page.getByText("$900,000").first()).toBeVisible();
});
