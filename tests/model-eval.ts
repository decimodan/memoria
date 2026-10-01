import "dotenv/config";
import { fixtures } from "../fixtures/sessions";
import { evaluate } from "../server/evaluator";
const selected = process.argv.slice(2);
const cases = selected.length
  ? fixtures.filter((f) => selected.includes(f.name))
  : fixtures;
if (!cases.length) throw new Error("No hay fixtures con esos nombres.");
let failures = 0;
for (const fixture of cases) {
  const start = Date.now();
  try {
    const report = await evaluate(fixture.session, {
      baseUrl:
        process.env.LM_STUDIO_BASE_URL ?? "http://192.168.50.155:1234/v1",
      model: process.env.LM_STUDIO_MODEL ?? "openai/gpt-oss-20b",
      apiKey: process.env.LM_STUDIO_API_KEY,
      timeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 120000),
      maxInputChars: Number(process.env.MAX_INPUT_CHARS ?? 40000),
      strategy:
        process.env.MODEL_EVALUATION_STRATEGY === "single_pass"
          ? "single_pass"
          : "focused",
      outputMode:
        process.env.MODEL_OUTPUT_MODE === "json_schema"
          ? "json_schema"
          : "prompt_json",
    });
    const foundFields = new Set(report.issues.map((i) => i.field));
    const passed =
      report.status === fixture.expected.status &&
      fixture.expected.fields.every((f) =>
        foundFields.has(f as "summary" | "facts" | "risk"),
      ) &&
      (fixture.expected.forbiddenFields ?? []).every(
        (f) => !foundFields.has(f as "summary" | "facts" | "risk"),
      ) &&
      (fixture.expected.factIndexes ?? []).every((index) =>
        report.issues.some(
          (issue) => issue.field === "facts" && issue.factIndex === index,
        ),
      ) &&
      report.coverage.every((c) => c.status === "evaluated");
    console.log(
      JSON.stringify(
        {
          fixture: fixture.name,
          passed,
          elapsedMs: Date.now() - start,
          report,
        },
        null,
        2,
      ),
    );
    if (!passed) failures++;
  } catch (error) {
    failures++;
    console.error(fixture.name, error instanceof Error ? error.message : error);
  }
}
console.log(
  `${cases.length - failures}/${cases.length} fixtures aprobadas. Esta comprobación no mide precisión sobre sesiones reales.`,
);
if (failures) process.exitCode = 1;
