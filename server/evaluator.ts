import { z } from "zod";
import {
  fields,
  modelResultSchema,
  sessionSchema,
  sourceSegments,
  type ModelResult,
  type Report,
  type Session,
} from "../shared/contracts";
import { PROMPT_VERSION, RUBRIC_VERSION, SYSTEM_PROMPT } from "./rubric";

import { evaluateFocused } from "./focused";
import { EvaluationError, requestModel, type Config } from "./modelClient";
export { EvaluationError, parseModelContent, type Config } from "./modelClient";
const normalized = (s: string) => s.replace(/\s+/g, " ").trim();
export function validateResult(raw: unknown, session: Session): ModelResult {
  const parsed = modelResultSchema.safeParse(raw);
  if (!parsed.success)
    throw new EvaluationError(
      502,
      "INVALID_MODEL_OUTPUT",
      "El modelo devolvió una estructura inválida. No se pudo completar la evaluación.",
    );
  const result = parsed.data;
  if (
    new Set(result.coverage.map((c) => c.field)).size !== fields.length ||
    result.coverage.some((c) => c.status === "not_evaluable" && !c.reason)
  )
    throw new EvaluationError(
      502,
      "INVALID_MODEL_OUTPUT",
      "El modelo no informó correctamente la cobertura.",
    );
  const sources = sourceSegments(session);
  for (const issue of result.issues) {
    if (
      (issue.field === "facts" &&
        (issue.factIndex === null ||
          issue.factIndex >= session.facts.length)) ||
      (issue.field !== "facts" && issue.factIndex !== null) ||
      (issue.type === "SUMMARY_DISTORTION" && issue.field !== "summary") ||
      (issue.type === "RISK_MISMATCH" && issue.field !== "risk")
    )
      throw new EvaluationError(
        502,
        "INVALID_MODEL_OUTPUT",
        "El modelo señaló un campo o fact inexistente.",
      );
    const target =
      issue.field === "summary"
        ? session.summary
        : issue.field === "facts"
          ? session.facts[issue.factIndex!]
          : [
              session.risk.status,
              ...session.risk.signals.map(
                (s) => `${s.category} ${s.justification}`,
              ),
            ].join(" ");
    if (!normalized(target).includes(normalized(issue.claim)))
      throw new EvaluationError(
        502,
        "INVALID_MODEL_OUTPUT",
        "La afirmación cuestionada no corresponde a la salida cargada.",
      );
    for (const evidence of issue.evidence) {
      const source = sources[evidence.source].find((s) => s.id === evidence.id);
      if (
        !source ||
        !normalized(source.text).includes(normalized(evidence.quote))
      )
        throw new EvaluationError(
          502,
          "INVALID_MODEL_OUTPUT",
          "El modelo devolvió evidencia que no existe en el material.",
        );
    }
  }
  return result;
}
export function makeReport(result: ModelResult, model: string): Report {
  return {
    ...result,
    status: result.issues.length
      ? "inconsistent"
      : result.coverage.some((c) => c.status === "not_evaluable")
        ? "not_evaluable"
        : "consistent",
    generatedAt: new Date().toISOString(),
    versions: { model, prompt: PROMPT_VERSION, rubric: RUBRIC_VERSION },
  };
}
export async function evaluate(
  session: Session,
  config: Config,
  requestFetch: typeof fetch = fetch,
  externalSignal?: AbortSignal,
): Promise<Report> {
  const input = JSON.stringify({
    sources: sourceSegments(session),
    outputs: {
      summary: session.summary,
      facts: session.facts,
      risk: session.risk,
    },
  });
  if (input.length > config.maxInputChars)
    throw new EvaluationError(
      413,
      "INPUT_TOO_LARGE",
      `El material excede el límite de ${config.maxInputChars} caracteres. Reduce la sesión; no se ha truncado ni enviado al modelo.`,
    );
  const deadline = AbortSignal.timeout(config.timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([deadline, externalSignal])
    : deadline;
  if (config.strategy !== "single_pass") {
    return makeReport(
      validateResult(
        await evaluateFocused(session, config, requestFetch, signal),
        session,
      ),
      config.model,
    );
  }
  const outputSchema = z.toJSONSchema(modelResultSchema);
  const system =
    config.outputMode === "json_schema"
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}\nReturn plain JSON conforming to this JSON Schema, without Markdown fences:\n${JSON.stringify(outputSchema)}`;
  const raw = await requestModel(
    config,
    system,
    input,
    outputSchema,
    4096,
    requestFetch,
    signal,
  );
  return makeReport(validateResult(raw, session), config.model);
}
export { sessionSchema };
