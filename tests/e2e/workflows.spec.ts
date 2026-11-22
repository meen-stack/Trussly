import { expect, test } from "@playwright/test";
import { loginAs, openProject, PHOTO, VIDEO } from "./helpers";

const PROJECT = "Harbour View Residences";

test("daily report: supervisor files with a photo, manager accepts", async ({ page }) => {
  await loginAs(page, "SUPERVISOR");
  await openProject(page, PROJECT, "Daily reports");
  await page.getByRole("link", { name: /File today/ }).click();
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await page.locator('input[name="date"]').fill(tomorrow);
  await page.locator('textarea[name="workDone"]').fill("E2E: poured level 3 columns on grid A to C.");
  await page.locator('textarea[name="issues"]').fill("E2E: pump arrived late.");
  await page.locator('textarea[name="materials"]').fill("E2E: 20 m³ concrete");
  await page.locator('textarea[name="incidents"]').fill("E2E: near miss on scaffold.");
  await page.locator('input[name="photos"]').setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("E2E: poured level 3 columns")).toBeVisible();
  await expect(page.getByText("Challenges or delays")).toBeVisible();
  await expect(page.getByText("E2E: near miss on scaffold.")).toBeVisible();

  await loginAs(page, "MANAGER");
  await page.goto("/notifications");
  await page.getByText(`New daily report: ${PROJECT}`).first().waitFor();
  await page.goto("/approvals");
  await page.getByRole("link", { name: /Issue flagged/ }).first().click();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted").first()).toBeVisible();
});

test("work: contractor submits, supervisor inspects, manager approves, owner gives final approval", async ({ page }) => {
  const title = "Level 3 and 4 frame";
  const card = () => page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: title }) });

  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Work");
  await card().getByRole("button", { name: "Submit completed work" }).click();
  await card().locator('input[name="photos"]').setInputFiles([PHOTO, VIDEO]);
  await card().locator('textarea[name="note"]').fill("Frame complete to level 4.");
  await card().getByRole("button", { name: "Submit for inspection" }).click();
  await expect(card().getByText("Awaiting inspection")).toBeVisible();
  await expect(card().getByRole("link", { name: "Play video" })).toHaveCount(1);

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Work");
  await expect(card().getByRole("button", { name: "Approve work" })).toHaveCount(0);

  await loginAs(page, "SUPERVISOR");
  await page.goto("/approvals");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await card().getByRole("button", { name: "Pass inspection" }).click();
  await expect(card().getByText("Awaiting manager")).toBeVisible();

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Work");
  await card().getByRole("button", { name: "Approve work" }).click();
  await expect(card().getByText("Awaiting owner")).toBeVisible();

  await loginAs(page, "OWNER");
  await openProject(page, PROJECT, "Work");
  await card().getByRole("button", { name: "Give final approval" }).click();
  await expect(card().getByText("Approved · verified")).toBeVisible();
  await expect(card().getByText("No invoice")).toBeVisible();

  await page.getByRole("link", { name: "Audit trail" }).click();
  await expect(page.getByText(`gave final approval on "${title}"`).first()).toBeVisible();
});

test("invoices: unverified work can't be approved", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Budget & spend");
  await page.locator("summary", { hasText: "Submit an invoice" }).click();
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Structure" });
  await page.locator('select[name="milestoneId"]').selectOption({ label: "Level 2 slab poured" });
  await page.locator('input[name="vendor"]').fill("E2E Slab Claim");
  await page.locator('input[name="description"]').fill("Slab progress claim");
  await page.locator('input[name="amount"]').fill("5000");
  await page.getByRole("button", { name: "Submit invoice" }).click();
  await expect(page.getByText("It can be approved once the work is verified.")).toBeVisible();

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Budget & spend");
  const row = page.locator("li", { hasText: "E2E Slab Claim" }).first();
  await expect(row.getByText("Can be approved once the work is verified.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("payments: manager and owner approve, finance pays in two parts", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Budget & spend");
  await page.locator("summary", { hasText: "Submit an invoice" }).click();
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Roofing" });
  await page.locator('input[name="vendor"]').fill("E2E Roofing Supplies");
  await page.locator('input[name="description"]').fill("Roof membrane");
  await page.locator('input[name="amount"]').fill("15000");
  await page.getByRole("button", { name: "Submit invoice" }).click();
  await expect(page.getByText("Invoice submitted for approval.")).toBeVisible();

  const row = () => page.locator("li", { hasText: "E2E Roofing Supplies" }).first();

  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Budget & spend");
  await row().getByRole("button", { name: "Approve" }).click();
  await expect(row().getByText("Under review")).toBeVisible();

  await loginAs(page, "OWNER");
  await page.goto("/approvals");
  await row().getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("li", { hasText: "E2E Roofing Supplies" })).toHaveCount(0);

  await loginAs(page, "FINANCE");
  await page.goto("/finance");
  await row().getByRole("button", { name: "Record payment" }).click();
  await row().locator('input[name="amount"]').fill("6000");
  await row().locator('input[name="reference"]').fill("E2E-1");
  await row().getByRole("button", { name: "Record payment" }).click();
  await expect(row().getByText("Partially paid")).toBeVisible();
  await row().getByRole("button", { name: "Record payment" }).click();
  await row().getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator("li", { hasText: "E2E Roofing Supplies" }).getByRole("button", { name: "Record payment" })).toHaveCount(0);

  await loginAs(page, "CONTRACTOR");
  await page.goto("/notifications");
  await expect(page.getByText("Payment confirmed: $9,000").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator("li", { hasText: "Roof membrane" }).getByText("Fully paid")).toBeVisible();
});

test("roles: contractor can't create projects, accountant can't approve work", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Finance" })).toHaveCount(0);
  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/projects$/);

  await loginAs(page, "FINANCE");
  await expect(page.getByRole("link", { name: "Finance" }).first()).toBeVisible();
  await openProject(page, PROJECT, "Work");
  await expect(page.getByRole("button", { name: /Pass inspection|Approve work|Give final approval/ })).toHaveCount(0);
});

test("signup creates a workspace and a project", async ({ page }) => {
  await page.context().clearCookies();
  await page.addInitScript(() => localStorage.setItem("trussly-tour-off", "1"));
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

test("invites: the join link can be copied when email isn't set up, and works", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginAs(page, "OWNER");
  const email = `invitee-${Date.now()}@example.com`;
  await page.goto("/team");
  await page.locator("summary", { hasText: "Invite someone" }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('select[name="role"]').selectOption("CONTRACTOR");
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("the email didn't send")).toBeVisible();
  const row = page.locator("li", { hasText: email });
  await row.getByRole("button", { name: "Copy link" }).click();
  await expect(row.getByText("Copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/invite/");

  await page.context().clearCookies();
  await page.goto(new URL(link).pathname);
  await page.locator('input[name="name"]').fill("Ivy Invitee");
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Join team" }).click();
  await page.waitForURL("**/dashboard");
});
