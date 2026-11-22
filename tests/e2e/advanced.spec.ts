import { expect, test } from "@playwright/test";
import { loginAs, openProject, VIDEO } from "./helpers";

const PROJECT = "Harbour View Residences";

test("change order: proposer can't approve it, owner and accountant both sign", async ({ page }) => {
  await loginAs(page, "MANAGER");
  await openProject(page, PROJECT, "Change orders");
  await page.locator("summary", { hasText: "Propose a change" }).click();
  await page.locator('input[name="title"]').fill("E2E: extra site lighting");
  await page.locator('textarea[name="reason"]').fill("Night work needs more lighting on the north side.");
  await page.locator('input[name="amount"]').fill("2500");
  await page.locator('select[name="budgetLineId"]').selectOption({ label: "Contingency" });
  await page.getByRole("button", { name: "Propose change order" }).click();
  await expect(page.getByText(/CO-\d+ proposed\./)).toBeVisible();
  const card = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "E2E: extra site lighting" }) });
  await expect(card.getByText("Needs 2 signatures")).toBeVisible();
  await expect(card.getByRole("button", { name: /sign/ })).toHaveCount(0);

  await loginAs(page, "OWNER");
  await openProject(page, PROJECT, "Change orders");
  await card.locator('input[name="signature"]').fill("Olivia Bennett");
  await card.getByRole("button", { name: "Confirm and sign" }).click();
  await expect(card.getByText("Tick the box to confirm the change and what the money is for.")).toBeVisible();
  await card.locator('input[name="confirm"]').check();
  await card.locator('input[name="signature"]').fill("Olivia Bennett");
  await card.getByRole("button", { name: "Confirm and sign" }).click();
  await expect(card.getByText("Signed 1 of 2 · waiting for a manager or the accountant")).toBeVisible();

  await loginAs(page, "FINANCE");
  await openProject(page, PROJECT, "Change orders");
  await expect(card.getByText("Signed 1 of 2 · waiting for a manager or the accountant")).toBeVisible();
  await card.locator('input[name="confirm"]').check();
  await card.locator('input[name="signature"]').fill("Fiona Reyes");
  await card.getByRole("button", { name: "Approve and sign" }).click();
  await expect(card.getByText("Approved", { exact: true })).toBeVisible();
  await expect(card.getByText("Fingerprint")).toHaveCount(2);

  await loginAs(page, "OWNER");
  await openProject(page, PROJECT, "Audit trail");
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

  await page.locator("summary", { hasText: "Log material use" }).click();
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
  await expect(doc.getByText("Awaiting Ruth Alvarez")).toBeVisible();
  await expect(doc.locator(".font-display", { hasText: "Olivia Bennett" })).toBeVisible();
});

test("documents: only the named contractor can sign", async ({ page }) => {
  await loginAs(page, "CONTRACTOR");
  await openProject(page, PROJECT, "Documents");
  const doc = page.locator("div.rounded-xl", { hasText: "Subcontract: Alvarez Electrical" });
  await expect(doc.getByText("Awaiting")).toBeVisible();
  await expect(doc.getByRole("button", { name: "Sign document" })).toHaveCount(0);
});

test("retention: owner and manager both confirm at handover, finance pays it", async ({ page }) => {
  await loginAs(page, "OWNER");
  await openProject(page, "Cedar Park Dental Clinic", "Budget & spend");
  await page.getByRole("button", { name: "Confirm release" }).click();
  await expect(page.getByText("Tick the box to confirm handover.")).toBeVisible();
  await page.getByLabel(/The project is handed over/).check();
  await page.getByRole("button", { name: "Confirm release" }).click();
  await expect(page.getByText("Waiting for a second person")).toBeVisible();

  await loginAs(page, "MANAGER");
  await openProject(page, "Cedar Park Dental Clinic", "Budget & spend");
  await expect(page.getByText("Confirmed by Olivia Bennett, Owner")).toBeVisible();
  await page.getByLabel(/The project is handed over/).check();
  await page.getByRole("button", { name: /^Release \$/ }).click();
  await expect(page.getByText(/All retention has been released\./)).toBeVisible();
  await expect(page.getByText("Retention released · awaiting payment").first()).toBeVisible();

  await loginAs(page, "FINANCE");
  await page.goto("/finance");
  const row = page.locator("li", { hasText: "Strip-out and new partitions" }).first();
  await expect(row.getByText("Retention released · awaiting payment")).toBeVisible();
  await row.getByRole("button", { name: "Record payment" }).click();
  await row.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator("li", { hasText: "Strip-out and new partitions" }).getByRole("button", { name: "Record payment" })).toHaveCount(0);
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
  await page.locator("summary", { hasText: "New group chat" }).click();
  await page.locator('input[name="title"]').fill("E2E crew");
  await page.getByLabel(/Sam Okafor/).check();
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("heading", { name: "E2E crew" })).toBeVisible();
  await expect(page.getByText('Carla Mendes created the group "E2E crew".', { exact: true })).toBeVisible();
  // A video with no text sends on its own and plays in the chat.
  await page.locator('input[name="media"]').setInputFiles(VIDEO);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("video[controls]")).toHaveCount(1);

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

test("tutorial: shows once with Skip, reopens from the menu", async ({ page }) => {
  await page.goto("/");
  await page.locator('form:has(input[value="OWNER"]) button').click();
  await expect(page).toHaveURL(/\/dashboard/);
  const tour = page.getByRole("dialog", { name: "Tutorial" });
  await expect(tour.getByText("Hi Olivia, welcome")).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByText("All sites at a glance")).toBeVisible();
  await tour.getByRole("button", { name: "Skip" }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Tutorial" }).first().click();
  await expect(tour.getByText("Hi Olivia, welcome")).toBeVisible();
});
