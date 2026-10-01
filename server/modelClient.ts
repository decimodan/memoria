export class EvaluationError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Config = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  maxInputChars: number;
  outputMode?: "prompt_json" | "json_schema";
  strategy?: "focused" | "single_pass";
};
export function parseModelContent(content: string): unknown {
  // Accept only known final-message envelopes, never arbitrary JSON inside prose.
  const final = content
    .trim()
    .replace(
      /^(?:<\|start\|>assistant)?<\|channel\|>final(?:\s*<\|constrain\|>json)?\s*<\|message\|>/i,
      "",
    )
    .replace(/(?:<\|fim_suffix\|>|<\|end\|>)$/, "")
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  return JSON.parse(final);
}
export async function requestModel(
  config: Config,
  system: string,
  input: string,
  schema: unknown,
  maxTokens: number,
  requestFetch: typeof fetch,
  signal: AbortSignal,
): Promise<unknown> {
  const endpoint = new URL(config.baseUrl);
  if (endpoint.pathname === "/") endpoint.pathname = "/v1";
  const useJsonSchema = config.outputMode === "json_schema";
  // LM Studio's native endpoint applies reasoning effort explicitly. Its
  // OpenAI-compatible chat endpoint has behaved inconsistently with GPT-OSS.
  const useNative = config.strategy !== "single_pass" && !useJsonSchema;
  if (useNative) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/?v1\/?$/, "")}/api/v1/chat`;
  } else {
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/chat/completions`;
  }
  let response: Response;
  let responseText: string;
  try {
    response = await requestFetch(endpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      signal,
      body: JSON.stringify(useNative
        ? {
            model: config.model,
            system_prompt: system,
            input,
            max_output_tokens: maxTokens,
            ...(config.model.includes("gpt-oss")
              ? { reasoning: "low" }
              : config.model.includes("qwen3.5")
                ? { reasoning: "off" }
                : {}),
            store: false,
          }
        : {
            model: config.model,
            max_tokens: maxTokens,
            ...(config.model.includes("gpt-oss")
              ? { reasoning_effort: "low" }
              : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
            ...(useJsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "session_evaluation",
                  strict: true,
                  schema,
                },
              },
            }
          : {}),
          }),
    });
    responseText = await response.text();
  } catch (error) {
    const timeout =
      signal.aborted ||
      (error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name));
    throw new EvaluationError(
      timeout ? 504 : 503,
      timeout ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE",
      timeout
        ? "El modelo excedió el tiempo de espera. Puedes volver a intentar."
        : "No se pudo conectar con LM Studio. Comprueba el servicio y su configuración.",
    );
  }
  if (!response.ok) {
    if (
      /model has crashed|fatal exception in.{0,40}scheduler|Slice indices must be 32-bit integers/i.test(
        responseText,
      )
    )
      throw new EvaluationError(
        503,
        "MODEL_ENGINE_CRASH",
        "El motor de LM Studio falló durante la generación. Recarga el modelo en LM Studio antes de volver a intentar.",
      );
    if (
      /context.{0,40}(length|window|limit)|exceed.{0,40}context|too many tokens/i.test(
        responseText,
      )
    )
      throw new EvaluationError(
        422,
        "CONTEXT_EXCEEDED",
        "La sesión excede el contexto disponible del modelo. No se ha truncado el material.",
      );
    throw new EvaluationError(
      502,
      "MODEL_REJECTED_REQUEST",
      `LM Studio rechazó la evaluación (HTTP ${response.status}). Comprueba el modelo${useJsonSchema ? " y su soporte de JSON Schema" : " y la configuración del servidor"}.`,
    );
  }
  try {
    const body = JSON.parse(responseText);
    if (useNative) {
      const message = Array.isArray(body.output)
        ? body.output.find((item: { type?: string }) => item.type === "message")
        : undefined;
      if (
        typeof message?.content !== "string" ||
        (typeof body.stats?.total_output_tokens === "number" &&
          body.stats.total_output_tokens >= maxTokens)
      )
        throw new EvaluationError(
          502,
          "INCOMPLETE_MODEL_OUTPUT",
          typeof message?.content === "string"
            ? "El modelo agotó su límite de generación antes de completar la respuesta."
            : "El modelo no completó la respuesta. No se pudo evaluar la sesión.",
        );
      return parseModelContent(message.content);
    }
    const choice = body.choices?.[0];
    if (!choice || choice.finish_reason !== "stop" || typeof choice.message?.content !== "string")
      throw new EvaluationError(
        502,
        "INCOMPLETE_MODEL_OUTPUT",
        choice?.finish_reason === "length"
          ? "El modelo agotó su límite de generación antes de completar la respuesta."
          : "El modelo no completó la respuesta. No se pudo evaluar la sesión.",
      );
    return parseModelContent(choice.message.content);
  } catch (error) {
    if (error instanceof EvaluationError) throw error;
    throw new EvaluationError(
      502,
      "INVALID_MODEL_OUTPUT",
      "El modelo devolvió una respuesta que no es JSON válido.",
    );
  }
}
