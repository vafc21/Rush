import { test, expect } from "@playwright/test";

test("guest creates a lobby and reaches the waiting room", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play as Guest" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/play$/);
  await page.getByRole("button", { name: "Create Lobby" }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/lobby\//);
  await expect(page.getByText("Waiting Room")).toBeVisible();
  await expect(page.getByText(/Share this code/)).toBeVisible();
});
