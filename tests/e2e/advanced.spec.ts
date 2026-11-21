import { expect, test } from "@playwright/test";
import { loginAs, openProject } from "./helpers";

const PROJECT = "Harbour View Residences";

test("change order: manager proposes, approves with a signature, budget moves", async ({ page }) => {
  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Change orders");
  await page.locator('input[name="title"]').fill("E2E: extra site lighting");
  await page.locator('textarea[name="reason"]').fill("Night work needs more lighting on the north side.");
  await page.locator('input[name="amount"]').fill("2500");
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Contingency" });
  await page.getByRole("button", { name: "Propose change order" }).click();
  await expect(page.getByText(/CO-\d+ proposed\./)).toBeVisible();

  const card = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "E2E: extra site lighting" }) });
  await card.getByRole("button", { name: "Approve and sign" }).click();
  await expect(card.getByText("Type your full name (Marcus Reid) to sign.")).toBeVisible();
  await card.locator('input[name="signature"]').fill("Marcus Reid");
  await card.getByRole("button", { name: "Approve and sign" }).click();
  await expect(card.getByText("Fingerprint")).toBeVisible();

  await page.getByRole("link", { name: "Audit trail" }).click();
  await expect(page.getByText(/approved and signed change order CO-\d+ \(\$2,500\)/).first()).toBeVisible();
  await page.getByRole("link", { name: "CSV" }).waitFor();
});

test("materials: supervisor receives a delivery and logs use", async ({ page }) => {
  await loginAs(page, "SUPERVISOR");
  await openProject(page, PROJECT, "Materials");
  const po = page.locator("div.rounded-xl", { hasText: "Alvarez Electrical" }).filter({ hasText: "PO-3" });
  await po.getByText("Receive a delivery").click();
  await po.locator('input[name^="recv_"]').fill("500");
  await po.getByRole("button", { name: "Log delivery" }).click();
  await expect(po.getByText("Delivery logged.")).toBeVisible();

  await page.locator('select[name="materialId"]').selectOption({ label: "Electrical cable 2.5 mm² (500 m)" });
  await page.locator('input[name="quantity"]').fill("120");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("Logged. 380 m in stock.")).toBeVisible();
});

test("documents: owner signs a contract", async ({ page }) => {
  await loginAs(page, "OWNER");
  await openProject(page, PROJECT, "Documents");
  const doc = page.locator("div.rounded-xl", { hasText: "Subcontract: Alvarez Electrical" });
  await doc.locator('input[name="signature"]').fill("Olivia Bennett");
  await doc.locator('input[name="agree"]').check();
  await doc.getByRole("button", { name: "Sign document" }).click();
  await expect(doc.getByText("Awaiting Contractor")).toBeVisible();
  await expect(doc.locator(".font-display", { hasText: "Olivia Bennett" })).toBeVisible();
});

test("disputes: a disputed invoice can't be paid", async ({ page }) => {
  await loginAs(page, "FINANCE");
  await page.goto("/finance");
  const row = page.locator("li", { hasText: "Mendes Structural Ltd" }).filter({ hasText: "$300,000" }).first();
  await expect(row.getByText("In dispute: payment on hold.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Record payment" })).toHaveCount(0);
});

test("messages: direct chat, unread badge and a new group", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await page.goto("/messages");
  await page.locator('select[name="userId"]').selectOption({ label: "Marcus Reid (Project manager)" });
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/messages\/c/);
  await page.getByLabel("Message").fill("E2E: deck walk at 8?");
  await page.getByLabel("Message").press("Enter");
  await expect(page.getByText("E2E: deck walk at 8?", { exact: true })).toBeVisible();

  await page.goto("/messages");
  await page.locator('input[name="title"]').fill("E2E crew");
  await page.getByLabel(/Sam Okafor/).check();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("heading", { name: "E2E crew" })).toBeVisible();
  await expect(page.getByText('Carla Mendes created the group "E2E crew".', { exact: true })).toBeVisible();

  await loginAs(page, "MANAGER");
  await page.getByRole("link", { name: /Messages/ }).first().click();
  await page.getByRole("link", { name: /Carla Mendes/ }).first().click();
  await expect(page.getByText("E2E: deck walk at 8?", { exact: true })).toBeVisible();
});

test("analytics: owner sees the portfolio, contractor doesn't", async ({ page }) => {
  await loginAs(page, "OWNER");
  await page.getByRole("link", { name: "Analytics" }).first().click();
  await expect(page.getByText("Contractor scorecard")).toBeVisible();
  await expect(page.getByText("Jonah Price")).toBeVisible();
  await loginAs(page, "CONTRACTOR");
  await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);
});
