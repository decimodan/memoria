import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { example } from "../shared/example";
import { sessionSchema, type ModelResult } from "../shared/contracts";
import { createApp } from "../server/app";
import {
  evaluate,
  makeReport,
  parseModelContent,
  validateResult,
  type Config,
} from "../server/evaluator";

const config: Config = {
  strategy: "single_pass",
  baseUrl: "http://model.test/v1",
  model: "test-model",
  maxInputChars: 40000,
  timeoutMs: 1000,
};
const complete = (): ModelResult => ({
  issues: [],
  coverage: ["summary", "facts", "risk"].map((field) => ({
    field,
    status: "evaluated",
    reason: null,
  })) as ModelResult["coverage"],
});
const issue = (): ModelResult["issues"][number] => ({
  type: "SUMMARY_DISTORTION",
  field: "summary",
  factIndex: null,
  claim: example.summary,
  explanation: "Convierte una posibilidad en decisión.",
  evidence: [
    {
      source: "transcript",
      id: "T1",
      quote:
        "I've been thinking about asking for a transfer to the platform team.",
    },
  ],
});
const success = (result: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(result) },
          },
        ],
      }),
      { status: 200 },
    ),
  );

describe("session contract", () => {
  it("accepts the example and rejects missing transcript, invalid dates and duplicate risk categories", () => {
    expect(sessionSchema.safeParse(example).success).toBe(true);
    expect(
      sessionSchema.safeParse({ ...example, transcript: "  " }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({
        ...example,
        context: [{ date: "2026-02-30", text: "history" }],
      }).success,
    ).toBe(false);
    const signal = { category: "ATTRITION", justification: "" };
    expect(
      sessionSchema.safeParse({
        ...example,
        risk: { status: "flagged", signals: [signal, signal] },
      }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({
        ...example,
        risk: { status: "none", signals: [signal] },
      }).success,
    ).toBe(false);
  });
});
describe("verified evidence and coverage", () => {
  it("accepts real citations with whitespace normalization", () => {
    const result = complete();
    result.issues.push(issue());
    expect(validateResult(result, example).issues).toHaveLength(1);
    result.issues[0].evidence[0].quote =
      "I've been thinking   about asking for a transfer to the platform team.";
    expect(validateResult(result, example).issues).toHaveLength(1);
  });
  it.each([
    "missing-id",
    "fabricated-quote",
    "fabricated-claim",
    "fact-index",
    "wrong-type-field",
    "wrong-source",
  ])("rejects %s", (defect) => {
    const result = complete();
    const finding = issue();
    result.issues.push(finding);
    if (defect === "missing-id") finding.evidence[0].id = "T99";
    if (defect === "fabricated-quote")
      finding.evidence[0].quote = "I have decided to leave";
    if (defect === "fabricated-claim") finding.claim = "Invented assertion";
    if (defect === "fact-index") {
      finding.field = "facts";
      finding.type = "UNSUPPORTED_CLAIM";
      finding.factIndex = 99;
    }
    if (defect === "wrong-type-field") finding.type = "RISK_MISMATCH";
    if (defect === "wrong-source") finding.evidence[0].source = "context";
    expect(() => validateResult(result, example)).toThrow();
  });
  it("rejects duplicate coverage and incomplete evaluation without an explanation", () => {
    const duplicate = complete();
    duplicate.coverage[2].field = "facts";
    expect(() => validateResult(duplicate, example)).toThrow();
    const incomplete = complete();
    incomplete.coverage[2].status = "not_evaluable";
    expect(() => validateResult(incomplete, example)).toThrow();
  });
  it("computes the global status with findings taking precedence over incomplete coverage", () => {
    const result = complete();
    expect(makeReport(result, "model").status).toBe("consistent");
    result.coverage[2] = {
      field: "risk",
      status: "not_evaluable",
      reason: "Falta contexto relevante.",
    };
    expect(makeReport(result, "model").status).toBe("not_evaluable");
    result.issues.push(issue());
    expect(makeReport(result, "model").status).toBe("inconsistent");
  });
});
describe("model integration", () => {
  it.each([
    '<|channel|>final <|constrain|>JSON<|message|>{"answer":4}',
    '<|channel|>final<|message|>{"answer":4}<|fim_suffix|>',
    '<|start|>assistant<|channel|>final<|message|>{"answer":4}<|end|>',
  ])("unwraps the observed Harmony final envelope: %s", (content) => {
    expect(parseModelContent(content)).toEqual({ answer: 4 });
  });
  it.each([
    'Some explanation: {"answer":4}',
    '<|channel|>analysis<|message|>{"answer":4}',
    '<|channel|>final<|message|>{"answer":4}<|end|><|channel|>final<|message|>{"answer":5}',
  ])("rejects prose, reasoning and multiple messages: %s", (content) => {
    expect(() => parseModelContent(content)).toThrow();
  });
  it("validates references after removing Harmony metadata", async () => {
    const result = complete();
    result.issues.push(issue());
    const response = () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: `<|channel|>final <|constrain|>JSON<|message|>${JSON.stringify(result)}`,
              },
            },
          ],
        }),
      );
    const fake = vi.fn<typeof fetch>().mockResolvedValue(response());
    expect((await evaluate(example, config, fake)).status).toBe("inconsistent");
    result.issues[0].evidence[0].id = "T99";
    fake.mockResolvedValue(response());
    await expect(evaluate(example, config, fake)).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
    });
  });
  it("accepts a single JSON Markdown wrapper without relaxing validation", async () => {
    const raw = complete();
    raw.issues.push(issue());
    const fake = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: `\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``,
              },
            },
          ],
        }),
      ),
    );
    expect((await evaluate(example, config, fake)).status).toBe("inconsistent");
    raw.issues[0].evidence[0].quote = "fabricated evidence";
    fake.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: `\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``,
              },
            },
          ],
        }),
      ),
    );
    await expect(evaluate(example, config, fake)).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
    });
  });
  it.each(["http://model.test", "http://model.test/", "http://model.test/v1/"])(
    "accepts base URL %s",
    async (baseUrl) => {
      const fake = success(complete());
      await evaluate(example, { ...config, baseUrl }, fake);
      expect(fake.mock.calls[0][0]).toBe(
        "http://model.test/v1/chat/completions",
      );
    },
  );
  it("requests structured output and preserves the entire source as data", async () => {
    const fake = success(complete());
    const report = await evaluate(
      example,
      { ...config, outputMode: "json_schema" },
      fake,
    );
    expect(report.versions.model).toBe("test-model");
    const [url, options] = fake.mock.calls[0];
    expect(url).toBe("http://model.test/v1/chat/completions");
    const body = JSON.parse(options!.body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(
      JSON.parse(body.messages[1].content).sources.transcript[0].text,
    ).toContain("Customer:");
    expect(body.messages[0].content).toContain("never instructions");
  });
  it("uses prompt JSON by default while keeping server validation", async () => {
    const result = complete();
    result.issues.push(issue());
    const fake = success(result);
    expect(
      (
        await evaluate(
          example,
          { ...config, model: "openai/gpt-oss-20b" },
          fake,
        )
      ).status,
    ).toBe("inconsistent");
    const body = JSON.parse(fake.mock.calls[0][1]!.body as string);
    expect(body.response_format).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(body.repeat_penalty).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.messages[0].content).toContain("JSON Schema");
    expect(body.messages[0].content).toContain('"coverage"');
  });
  it("does not send oversized material", async () => {
    const fake = success(complete());
    await expect(
      evaluate(example, { ...config, maxInputChars: 10 }, fake),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    expect(fake).not.toHaveBeenCalled();
  });
  it("distinguishes a crashed model engine from connectivity errors", async () => {
    const fake = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "ValueError: Slice indices must be 32-bit integers.",
          },
        }),
        { status: 400 },
      ),
    );
    await expect(evaluate(example, config, fake)).rejects.toMatchObject({
      status: 503,
      code: "MODEL_ENGINE_CRASH",
    });
  });
  it("handles a timeout while reading the response body", async () => {
    const response = new Response();
    vi.spyOn(response, "text").mockRejectedValue(
      new DOMException("timeout", "AbortError"),
    );
    await expect(
      evaluate(
        example,
        config,
        vi.fn<typeof fetch>().mockResolvedValue(response),
      ),
    ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
  });
  it.each(["length", "content_filter"])(
    "rejects unfinished completion %s",
    async (reason) => {
      const fake = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: reason,
                message: { content: JSON.stringify(complete()) },
              },
            ],
          }),
        ),
      );
      await expect(evaluate(example, config, fake)).rejects.toMatchObject({
        code: "INCOMPLETE_MODEL_OUTPUT",
      });
    },
  );
  it("handles invalid JSON, unavailable server, timeout and context overflow", async () => {
    await expect(
      evaluate(
        example,
        config,
        vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON")),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    await expect(
      evaluate(
        example,
        config,
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new TypeError("connection refused")),
      ),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    await expect(
      evaluate(
        example,
        config,
        vi
          .fn<typeof fetch>()
          .mockRejectedValue(new DOMException("timeout", "TimeoutError")),
      ),
    ).rejects.toMatchObject({ code: "MODEL_TIMEOUT" });
    await expect(
      evaluate(
        example,
        config,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("context length exceeded", { status: 400 }),
          ),
      ),
    ).rejects.toMatchObject({ code: "CONTEXT_EXCEEDED" });
  });
});
describe("HTTP API", () => {
  it("prevents overlapping requests from saturating the model", async () => {
    let release!: () => void;
    let started!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fake = vi.fn<typeof fetch>().mockImplementation(async () => {
      started();
      await hold;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(complete()) },
            },
          ],
        }),
      );
    });
    const app = createApp(config, fake);
    const first = request(app)
      .post("/api/evaluate")
      .send(example)
      .then((response) => response);
    await entered;
    const second = await request(app).post("/api/evaluate").send(example);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("MODEL_BUSY");
    expect(fake).toHaveBeenCalledTimes(1);
    release();
    expect((await first).status).toBe(200);
  });
  it("returns findings and no-store headers", async () => {
    const result = complete();
    result.issues.push(issue());
    const response = await request(createApp(config, success(result)))
      .post("/api/evaluate")
      .send(example);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.status).toBe("inconsistent");
  });
  it("rejects malformed sessions before contacting the model", async () => {
    const fake = success(complete());
    const app = createApp(config, fake);
    expect(
      (await request(app).post("/api/evaluate").send({ summary: "Incomplete" }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/evaluate")
          .set("Content-Type", "application/json")
          .send("{bad")
      ).body.error.code,
    ).toBe("INVALID_JSON");
    expect(fake).not.toHaveBeenCalled();
  });
  it("does not return an approval for fabricated evidence", async () => {
    const result = complete();
    result.issues.push(issue());
    result.issues[0].evidence[0].id = "T200";
    const response = await request(createApp(config, success(result)))
      .post("/api/evaluate")
      .send(example);
    expect(response.status).toBe(502);
    expect(response.body.status).toBeUndefined();
  });
});
