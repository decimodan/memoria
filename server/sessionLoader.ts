import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionSchema } from "../shared/contracts";
import type { SessionFile } from "../shared/sessionFiles";

const sessionsDirectory = fileURLToPath(
  new URL("../sessions/", import.meta.url),
);
const fields = new Set([
  "language",
  "duration",
  "context_loaded",
  "transcript",
  "summary",
  "facts_extracted",
  "sentiment",
  "risk_flag",
]);

function scalar(text: string, name: string): string {
  const line = text.split(/\r?\n/).find((entry) =>
    entry.startsWith(`${name}:`),
  );
  if (!line) throw new Error(`Falta el campo ${name}.`);
  return line.slice(name.length + 1).trim();
}

function block(text: string, name: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${name}:`);
  if (start < 0) throw new Error(`Falta el bloque ${name}.`);
  const content: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if ([...fields].some((field) => line.startsWith(`${field}:`))) break;
    if (line.trim()) content.push(line.trim());
  }
  return content;
}

function parseSessionFile(filename: string, text: string): SessionFile {
  const number = Number(filename.match(/^session(\d+)\.md$/)?.[1]);
  if (!Number.isInteger(number)) throw new Error("Nombre de sesión inválido.");
  const language = scalar(text, "language");
  if (language !== "es" && language !== "en")
    throw new Error("Idioma inválido.");
  const duration = Number(scalar(text, "duration").match(/\d+/)?.[0]);
  if (!Number.isInteger(duration)) throw new Error("Duración inválida.");
  const context = block(text, "context_loaded").map((line) =>
    line.replace(/^-\s*/, ""),
  );
  const transcript = block(text, "transcript").join("\n");
  const summary = scalar(text, "summary");
  const facts = block(text, "facts_extracted").map((line) =>
    line.replace(/^-\s*/, ""),
  );
  const riskFlag = scalar(text, "risk_flag");
  const session = sessionSchema.parse({
    context: context.map((entry) => ({ date: null, text: entry })),
    transcript,
    summary,
    facts,
    risk:
      riskFlag.toLowerCase() === "none"
        ? { status: "none", signals: [] }
        : {
            status: "flagged",
            signals: [
              {
                category: /burnout|distress|medium/i.test(riskFlag)
                  ? "WORKLOAD_CAPACITY"
                  : "OTHER",
                justification: riskFlag,
              },
            ],
          },
  });
  return {
    id: `source-session-${number}`,
    title: `Sesión ${number}`,
    language,
    durationMinutes: duration,
    session,
  };
}

export async function loadSessionFiles(): Promise<SessionFile[]> {
  const filenames = (await readdir(sessionsDirectory))
    .filter((filename) => /^session\d+\.md$/.test(filename))
    .sort((a, b) =>
      Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]),
    );
  if (filenames.length !== 8)
    throw new Error(`Se esperaban 8 sesiones y se encontraron ${filenames.length}.`);
  return Promise.all(
    filenames.map(async (filename) => {
      try {
        return parseSessionFile(
          filename,
          await readFile(path.join(sessionsDirectory, filename), "utf8"),
        );
      } catch (error) {
        throw new Error(
          `${filename}: ${error instanceof Error ? error.message : "sesión inválida"}`,
        );
      }
    }),
  );
}
