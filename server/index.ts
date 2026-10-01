import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
const positiveInt = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} debe ser un entero positivo.`);
  return value;
};
const app = createApp({
  baseUrl: process.env.LM_STUDIO_BASE_URL ?? "http://192.168.50.155:1234/v1",
  model: process.env.LM_STUDIO_MODEL ?? "qwen/qwen3.5-9b",
  apiKey: process.env.LM_STUDIO_API_KEY,
  timeoutMs: positiveInt("MODEL_TIMEOUT_MS", 120000),
  maxInputChars: positiveInt("MAX_INPUT_CHARS", 40000),
  strategy: (() => {
    const strategy = process.env.MODEL_EVALUATION_STRATEGY ?? "focused";
    if (strategy !== "focused" && strategy !== "single_pass")
      throw new Error(
        "MODEL_EVALUATION_STRATEGY debe ser focused o single_pass.",
      );
    return strategy;
  })(),
  outputMode: (() => {
    const mode = process.env.MODEL_OUTPUT_MODE ?? "prompt_json";
    if (mode !== "prompt_json" && mode !== "json_schema")
      throw new Error("MODEL_OUTPUT_MODE debe ser prompt_json o json_schema.");
    return mode;
  })(),
});
const dist = fileURLToPath(new URL("../dist", import.meta.url));
app.use(express.static(dist));
app.get("/", (_req, res) => res.sendFile(path.join(dist, "index.html")));
const port = positiveInt("PORT", 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(`Memoria: http://127.0.0.1:${port}`),
);
