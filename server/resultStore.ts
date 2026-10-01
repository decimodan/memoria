import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Report, Session } from "../shared/contracts";

const resultsDirectory = fileURLToPath(new URL("../results/", import.meta.url));

function safeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100) || "resultado";
}

function fileStem(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sesion"
  );
}

export async function saveResult(
  sessionName: string,
  session: Session,
  report: Report,
) {
  await mkdir(resultsDirectory, { recursive: true });
  const stem = fileStem(sessionName);
  for (let suffix = 1; ; suffix += 1) {
    const filename = `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`;
    try {
      await writeFile(
        new URL(filename, `file://${resultsDirectory}/`),
        `${JSON.stringify({ sessionName, session, ...report }, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      return `results/${filename}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

export async function saveMarkdownResult(
  model: string,
  sessionNumber: number,
  sessionName: string,
  report: Report,
) {
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 8)
    throw new Error("El número de sesión debe estar entre 1 y 8.");
  const modelDirectory = safeName(model);
  const relativePath = path.join(
    "results",
    modelDirectory,
    `session${sessionNumber}.md`,
  );
  await mkdir(path.join(resultsDirectory, modelDirectory), { recursive: true });
  const status = {
    consistent: "Consistente",
    inconsistent: "Inconsistente",
    not_evaluable: "No evaluable",
  }[report.status];
  const fieldName = {
    summary: "Resumen",
    facts: "Facts",
    risk: "Riesgo",
  };
  const escapeCell = (value: string | null) =>
    (value ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const coverage = report.coverage
    .map(
      (item) =>
        `| ${fieldName[item.field]} | ${item.status === "evaluated" ? "Evaluado" : "No evaluable"} | ${escapeCell(item.reason)} |`,
    )
    .join("\n");
  const issues = report.issues.length
    ? report.issues
        .map((issue, index) => {
          const target =
            issue.field === "facts" && issue.factIndex !== null
              ? `Hecho ${issue.factIndex + 1}`
              : fieldName[issue.field];
          const evidence = issue.evidence
            .map(
              (item) =>
                `- ${item.source === "transcript" ? "Transcript" : "Antecedente"} · ${item.id}: “${item.quote.replace(/\r?\n/g, " ")}”`,
            )
            .join("\n");
          return [
            `### Hallazgo ${index + 1}: ${issue.type} · ${target}`,
            "",
            `**Afirmación cuestionada:** ${issue.claim}`,
            "",
            `**Análisis:** ${issue.explanation}`,
            "",
            "**Evidencia:**",
            evidence,
          ].join("\n");
        })
        .join("\n\n")
    : "No se encontraron hallazgos.";
  const markdown = [
    `# Evaluación de ${sessionName}`,
    "",
    `- **Modelo:** ${report.versions.model}`,
    `- **Resultado:** ${status}`,
    `- **Generado:** ${report.generatedAt}`,
    `- **Prompt:** ${report.versions.prompt} · **Rúbrica:** ${report.versions.rubric}`,
    "",
    "## Cobertura",
    "",
    "| Campo | Estado | Motivo |",
    "|---|---|---|",
    coverage,
    "",
    "## Hallazgos",
    "",
    issues,
    "",
  ].join("\n");
  await writeFile(path.join(resultsDirectory, modelDirectory, `session${sessionNumber}.md`), markdown, "utf8");
  return relativePath;
}

export async function saveMarkdownFailure(
  model: string,
  sessionNumber: number,
  sessionName: string,
  message: string,
) {
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 8)
    throw new Error("El número de sesión debe estar entre 1 y 8.");
  const modelDirectory = safeName(model);
  const filename = `session${sessionNumber}.md`;
  await mkdir(path.join(resultsDirectory, modelDirectory), { recursive: true });
  const markdown = [
    `# Evaluación no completada: ${sessionName}`,
    "",
    `- **Modelo:** ${model}`,
    `- **Fecha:** ${new Date().toISOString()}`,
    "",
    "No se generó un reporte de hallazgos porque falló la evaluación.",
    "",
    `**Error:** ${message.replace(/\r?\n/g, " ")}`,
    "",
  ].join("\n");
  await writeFile(path.join(resultsDirectory, modelDirectory, filename), markdown, "utf8");
  return path.join("results", modelDirectory, filename);
}
