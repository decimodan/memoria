import { z } from "zod";

export const riskCategories = [
  "ATTRITION",
  "SUSTAINED_DISENGAGEMENT",
  "WORKPLACE_CONFLICT",
  "WORKLOAD_CAPACITY",
  "OTHER",
] as const;
export const riskLabels: Record<(typeof riskCategories)[number], string> = {
  ATTRITION: "Salida de la empresa",
  SUSTAINED_DISENGAGEMENT: "Desmotivación sostenida",
  WORKPLACE_CONFLICT: "Conflicto laboral",
  WORKLOAD_CAPACITY: "Sobrecarga y capacidad de trabajo",
  OTHER: "Fuera de la rúbrica",
};
const text = z.string().trim().min(1);
export const sessionSchema = z
  .object({
    transcript: text,
    context: z
      .array(
        z
          .object({
            date: z.iso.date().nullable(),
            text,
          })
          .strict(),
      )
      .max(100),
    summary: text,
    facts: z.array(text).max(200),
    risk: z
      .object({
        status: z.enum(["none", "flagged"]),
        signals: z
          .array(
            z
              .object({
                category: z.enum(riskCategories),
                justification: z.string().trim(),
              })
              .strict(),
          )
          .max(riskCategories.length),
      })
      .strict()
      .superRefine((risk, ctx) => {
        if (
          (risk.status === "none" && risk.signals.length) ||
          (risk.status === "flagged" && !risk.signals.length)
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Usa none sin señales o flagged con al menos una categoría.",
          });
        if (
          new Set(risk.signals.map((s) => s.category)).size !==
          risk.signals.length
        )
          ctx.addIssue({
            code: "custom",
            message: "Las categorías de riesgo no pueden repetirse.",
          });
      }),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export const fields = ["summary", "facts", "risk"] as const;
export const issueTypes = [
  "CONTRADICTION",
  "UNSUPPORTED_CLAIM",
  "SUMMARY_DISTORTION",
  "RISK_MISMATCH",
] as const;
export const fieldLabels = {
  summary: "Resumen",
  facts: "Facts",
  risk: "Riesgo",
};
export const issueLabels = {
  CONTRADICTION: "Contradicción",
  UNSUPPORTED_CLAIM: "Afirmación sin respaldo",
  SUMMARY_DISTORTION: "Distorsión del resumen",
  RISK_MISMATCH: "Desajuste de riesgo",
};
export const modelResultSchema = z
  .object({
    issues: z
      .array(
        z
          .object({
            type: z.enum(issueTypes),
            field: z.enum(fields),
            factIndex: z.number().int().nonnegative().nullable(),
            claim: text,
            explanation: text,
            evidence: z
              .array(
                z
                  .object({
                    source: z.enum(["transcript", "context"]),
                    id: text,
                    quote: text,
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .max(50),
    coverage: z
      .array(
        z
          .object({
            field: z.enum(fields),
            status: z.enum(["evaluated", "not_evaluable"]),
            reason: text.nullable(),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();
export type ModelResult = z.infer<typeof modelResultSchema>;
export type Report = ModelResult & {
  status: "consistent" | "inconsistent" | "not_evaluable";
  generatedAt: string;
  versions: { model: string; prompt: string; rubric: string };
};
export function sourceSegments(session: Session) {
  return {
    transcript: session.transcript
      .split(/\r?\n/)
      .map((text, i) => ({ id: `T${i + 1}`, text })),
    context: session.context.map((entry, i) => ({ id: `C${i + 1}`, ...entry })),
  };
}
