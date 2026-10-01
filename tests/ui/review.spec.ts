import { expect, test } from "@playwright/test";
import { example } from "../../shared/example";
const report = {
  status: "inconsistent",
  generatedAt: "2026-10-01T12:00:00Z",
  versions: { model: "test", prompt: "1.0.0", rubric: "1.0.0" },
  coverage: ["summary", "facts", "risk"].map((field) => ({
    field,
    status: "evaluated",
    reason: null,
  })),
  issues: [
    {
      type: "SUMMARY_DISTORTION",
      field: "summary",
      factIndex: null,
      claim: example.summary,
      explanation: "Convierte una posibilidad en una decisión.",
      evidence: [
        {
          source: "transcript",
          id: "T1",
          quote:
            "I've been thinking about asking for a transfer to the platform team.",
        },
      ],
    },
  ],
};
test("evaluates, links evidence, exports and clears stale results on edit", async ({
  page,
}) => {
  await page.route("**/api/evaluate", (route) =>
    route.fulfill({ json: report }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Evaluar consistencia" }).click();
  await expect(
    page.getByRole("heading", { name: "Inconsistencias detectadas" }),
  ).toBeVisible();
  await page.locator(".quote").click();
  await expect(page.locator("#source-T1")).toBeVisible();
  await expect(page).toHaveURL(/#source-T1$/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Reporte JSON" }).click();
  expect((await download).suggestedFilename()).toBe("consistency-report.json");
  await page.getByLabel("Resumen", { exact: false }).fill("Corrected summary");
  await expect(
    page.getByRole("heading", { name: "Inconsistencias detectadas" }),
  ).toHaveCount(0);
});
test("shows model failures without an approval", async ({ page }) => {
  await page.route("**/api/evaluate", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "No se pudo conectar con LM Studio." } },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Evaluar consistencia" }).click();
  await expect(page.getByRole("alert")).toContainText("No se pudo conectar");
  await expect(
    page.getByRole("heading", { name: "Sin inconsistencias detectadas" }),
  ).toHaveCount(0);
});
test("imports sessions, rejects invalid JSON, and stays within mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nueva sesión" }).click();
  await expect(page.getByLabel("Transcript")).toHaveValue("");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "session.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(example)),
    });
  await expect(page.getByLabel("Transcript")).toHaveValue(example.transcript);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });
  await expect(page.getByRole("alert")).toContainText("no cumple el formato");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
