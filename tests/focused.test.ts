import { describe, expect, it, vi } from "vitest";
import { evaluate, type Config } from "../server/evaluator";
import { example } from "../shared/example";
const config: Config = {
  baseUrl: "http://model.test/v1",
  model: "openai/gpt-oss-20b",
  maxInputChars: 40000,
  timeoutMs: 1000,
};
const checked = () => ({
  type: null,
  explanation: null,
  evidenceIds: [],
  evaluated: true,
  limitation: null,
});
const reply = (data: unknown) =>
  new Response(
    JSON.stringify({
      output: [
        { type: "message", content: JSON.stringify(data) },
      ],
      stats: { total_output_tokens: 32 },
    }),
  );
describe("focused evaluation", () => {
  it("checks each output separately and constructs claims and quotations from original material", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply({
          ...checked(),
          type: "SUMMARY_DISTORTION",
          explanation: "Exagera la decisión.",
          evidenceIds: ["T1", "T3"],
        }),
      )
      .mockResolvedValueOnce(
        reply({
          ...checked(),
          type: "UNSUPPORTED_CLAIM",
          explanation: "Aún no está solicitando el cambio.",
          evidenceIds: ["T1"],
        }),
      )
      .mockResolvedValueOnce(
        reply({
          ...checked(),
          type: "UNSUPPORTED_CLAIM",
          explanation: "Insatisfacción no establecida.",
          evidenceIds: ["T1"],
        }),
      )
      .mockResolvedValueOnce(reply(checked()));
    const report = await evaluate(example, config, fake);
    expect(report.status).toBe("inconsistent");
    expect(report.issues).toHaveLength(3);
    expect(report.issues.map((i) => i.claim)).toEqual([
      example.summary,
      ...example.facts,
    ]);
    expect(report.issues[0].evidence[0].quote).toBe(
      example.transcript.split("\n")[0],
    );
    expect(report.issues[1].factIndex).toBe(0);
    expect(report.issues[2].factIndex).toBe(1);
    expect(report.issues.some((i) => i.field === "risk")).toBe(false);
    const bodies = fake.mock.calls.map(([url, options]) => {
      expect(url).toBe("http://model.test/api/v1/chat");
      return JSON.parse(options!.body as string);
    });
    expect(
      bodies.map((body) =>
        Object.keys(JSON.parse(body.input)).filter(
          (k) => k !== "sources",
        ),
      ),
    ).toEqual([["summary"], ["facts"], ["facts"], ["risk"]]);
    expect(
      bodies.every(
        (body) =>
          JSON.parse(body.input).sources.transcript.length === 5,
      ),
    ).toBe(true);
    expect(
      new Set(fake.mock.calls.map(([, options]) => options!.signal)).size,
    ).toBe(1);
  });
  it("checks empty facts without calling the model for nonexistent claims", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => reply(checked()));
    const report = await evaluate({ ...example, facts: [] }, config, fake);
    expect(report.status).toBe("consistent");
    expect(fake).toHaveBeenCalledTimes(2);
    expect(report.coverage.map((c) => c.field)).toEqual([
      "summary",
      "facts",
      "risk",
    ]);
  });
  it.each([
    { ...checked(), evidenceIds: ["T999"] },
    {
      ...checked(),
      type: "SUMMARY_DISTORTION",
      explanation: "Defecto sin cita.",
    },
    {
      ...checked(),
      type: "RISK_MISMATCH",
      explanation: "Tipo incorrecto.",
      evidenceIds: ["T1"],
    },
    { ...checked(), evaluated: false },
  ])(
    "marks invalid evidence, wrong issue types or missing explanations not evaluable",
    async (result) => {
      const fake = vi.fn<typeof fetch>().mockResolvedValue(reply(result));
      const report = await evaluate(example, config, fake);
      expect(report.status).toBe("not_evaluable");
      expect(report.issues).toHaveLength(0);
      expect(report.coverage.every((c) => c.status === "not_evaluable")).toBe(
        true,
      );
      expect(fake).toHaveBeenCalledTimes(example.facts.length + 2);
    },
  );
  it("never approves incomplete coverage even when no defects were detected", async () => {
    const fake = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply({
          ...checked(),
          evaluated: false,
          limitation: "No hay evidencia suficiente para este campo.",
        }),
      )
      .mockImplementation(async () => reply(checked()));
    const report = await evaluate(example, config, fake);
    expect(report.status).toBe("not_evaluable");
    expect(report.coverage[0].reason).toContain("No hay evidencia");
  });
  it("uses one deadline for the complete session and stops later checks", async () => {
    const fake = vi.fn<typeof fetch>().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return reply(checked());
    });
    await expect(
      evaluate(example, { ...config, timeoutMs: 1 }, fake),
    ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    expect(fake).toHaveBeenCalledTimes(1);
  });
});
