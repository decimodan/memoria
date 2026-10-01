import express from "express";
import {
  evaluate,
  EvaluationError,
  sessionSchema,
  type Config,
} from "./evaluator";
import { loadSessionFiles } from "./sessionLoader";
import {
  saveMarkdownFailure,
  saveMarkdownResult,
  saveResult,
} from "./resultStore";
export function createApp(config: Config, requestFetch: typeof fetch = fetch) {
  const app = express();
  let evaluating = false;
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "512kb" }));
  app.get("/api/sessions", async (_req, res, next) => {
    try {
      res.json(await loadSessionFiles());
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/evaluate", async (req, res, next) => {
    const resultFormat = req.get("X-Result-Format");
    const sessionNumber = Number(req.get("X-Session-Index"));
    const encodedName = req.get("X-Session-Name");
    let sessionName = resultFormat === "markdown" ? `Sesión ${sessionNumber}` : "";
    if (
      resultFormat &&
      resultFormat !== "markdown"
    ) {
      res.status(400).json({
        error: { code: "INVALID_RESULT_FORMAT", message: "Formato inválido." },
      });
      return;
    }
    if (encodedName) {
      try {
        sessionName = decodeURIComponent(encodedName);
      } catch {
        res.status(400).json({
          error: {
            code: "INVALID_SESSION_NAME",
            message: "El nombre de la sesión no es válido.",
          },
        });
        return;
      }
    }
    if (
      resultFormat === "markdown" &&
      (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 8)
    ) {
      res.status(400).json({
        error: {
          code: "INVALID_SESSION_INDEX",
          message: "El número de sesión debe estar entre 1 y 8.",
        },
      });
      return;
    }
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_SESSION",
          message: "Revisa el formato de la sesión.",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      });
      return;
    }
    if (evaluating) {
      res
        .status(409)
        .json({
          error: {
            code: "MODEL_BUSY",
            message:
              "Ya hay una evaluación en curso. Espera a que termine antes de volver a intentar.",
          },
        });
      return;
    }
    evaluating = true;
    const controller = new AbortController();
    res.once("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const report = await evaluate(
        parsed.data,
        config,
        requestFetch,
        controller.signal,
      );
      if (!res.destroyed) {
        if (resultFormat === "markdown") {
          const savedAs =
            await saveMarkdownResult(
              config.model,
              sessionNumber,
              sessionName,
              report,
            );
          res.json({ ...report, savedAs });
        } else if (encodedName) {
          const savedAs = await saveResult(sessionName, parsed.data, report);
          res.json({ ...report, savedAs });
        } else {
          res.json(report);
        }
      }
    } catch (error) {
      if (!res.destroyed && resultFormat === "markdown") {
        try {
          res.locals.savedAs = await saveMarkdownFailure(
            config.model,
            sessionNumber,
            sessionName,
            error instanceof Error ? error.message : "Error desconocido.",
          );
        } catch {
          // Preserve the evaluation error if writing the failure note also fails.
        }
      }
      if (!res.destroyed) next(error);
    } finally {
      evaluating = false;
    }
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof EvaluationError) {
        res
          .status(error.status)
          .json({
            error: { code: error.code, message: error.message },
            ...(typeof res.locals.savedAs === "string"
              ? { savedAs: res.locals.savedAs }
              : {}),
          });
        return;
      }
      const status = (error as { status?: number })?.status;
      res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({
        error: {
          code:
            status === 413
              ? "INPUT_TOO_LARGE"
              : status === 400
                ? "INVALID_JSON"
                : "INTERNAL_ERROR",
          message:
            status === 413
              ? "El archivo supera el límite de carga."
              : status === 400
                ? "El contenido no es JSON válido."
                : "No se pudo completar la evaluación.",
        },
      });
    },
  );
  return app;
}
