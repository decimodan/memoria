import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  fieldLabels,
  issueLabels,
  riskCategories,
  riskLabels,
  sessionSchema,
  sourceSegments,
  type Report,
  type Session,
} from "../shared/contracts";
import { example } from "../shared/example";
import { sessionFiles } from "../shared/sessionFiles";
import type { SessionFile } from "../shared/sessionFiles";
import "./style.css";

const blank: Session = {
  transcript: "",
  context: [],
  summary: "",
  facts: [],
  risk: { status: "none", signals: [] },
};
const statusLabels = {
  consistent: "Sin inconsistencias detectadas",
  inconsistent: "Inconsistencias detectadas",
  not_evaluable: "Evaluación incompleta",
};
type WorkspaceTab = {
  id: string;
  title: string;
  detail?: string;
  session: Session;
  report: Report | null;
  savedAs: string;
  error: string;
};
type BatchProgress = {
  completed: number;
  total: number;
  current: string;
  folder: string;
  failed: string[];
  done: boolean;
};
const makeTab = (
  id: string,
  title: string,
  session: Session,
  detail?: string,
): WorkspaceTab => ({
  id,
  title,
  detail,
  session,
  report: null,
  savedAs: "",
  error: "",
});
const makeSourceTabs = () =>
  sessionFiles.map((item) =>
    makeTab(
      item.id,
      item.title,
      structuredClone(item.session),
      `${item.language.toUpperCase()} · ${item.durationMinutes} min`,
    ),
  );
const sourceTabsCount = (tabs: WorkspaceTab[]) =>
  tabs.filter((tab) => /^source-session-\d+$/.test(tab.id)).length;
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(makeSourceTabs);
  const [activeTabId, setActiveTabId] = useState(sessionFiles[0].id);
  const [busy, setBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [showSources, setShowSources] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId)!;
  const { session, report, error } = activeTab;
  const update = (value: Session) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTabId
          ? { ...tab, session: value, report: null, savedAs: "", error: "" }
          : tab,
      ),
    );
    setShowSources(false);
  };
  const setTabError = (id: string, value: string) =>
    setTabs((current) =>
      current.map((tab) => (tab.id === id ? { ...tab, error: value } : tab)),
    );
  const setTabReport = (id: string, value: Report | null, savedAs = "") =>
    setTabs((current) =>
      current.map((tab) =>
        tab.id === id ? { ...tab, report: value, savedAs } : tab,
      ),
    );
  const openTab = (title: string, value: Session, detail?: string) => {
    const id = crypto.randomUUID();
    setTabs((current) => [...current, makeTab(id, title, value, detail)]);
    setActiveTabId(id);
    setShowSources(false);
  };
  async function loadSourceTabs() {
    setSourceLoading(true);
    setSourceError("");
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok)
        throw new Error("No se pudieron cargar los archivos de sesiones.");
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.length !== 8)
        throw new Error("La carpeta debe contener exactamente 8 sesiones válidas.");
      const loaded = (data as SessionFile[]).map((item) =>
        makeTab(
          item.id,
          item.title,
          item.session,
          `${item.language.toUpperCase()} · ${item.durationMinutes} min`,
        ),
      );
      setTabs((current) => [
        ...current.filter((tab) => !tab.id.startsWith("source-session-")),
        ...loaded,
      ]);
      setActiveTabId(loaded[0].id);
      setShowSources(false);
    } catch (e) {
      setSourceError(
        e instanceof Error ? e.message : "No se pudieron leer las sesiones.",
      );
    } finally {
      setSourceLoading(false);
    }
  }
  useEffect(() => {
    void loadSourceTabs();
  }, []);
  const sources = sourceSegments(session);
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 512 * 1024)
        throw new Error("El archivo supera el límite de 512 KB.");
      const parsed = sessionSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success)
        throw new Error(
          "La sesión no cumple el formato. Descarga el ejemplo JSON para consultar los campos esperados.",
        );
      openTab(file.name.replace(/\.json$/i, "") || "Sesión importada", parsed.data);
    } catch (e) {
      setTabError(
        activeTabId,
        e instanceof Error ? e.message : "No se pudo importar el archivo.",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function run(event: React.FormEvent) {
    event.preventDefault();
    const tabId = activeTabId;
    setTabError(tabId, "");
    setTabReport(tabId, null);
    const parsed = sessionSchema.safeParse(session);
    if (!parsed.success) {
      setTabError(
        tabId,
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
      );
      return;
    }
    setTabs((current) =>
      current.map((tab) =>
        tab.id === tabId ? { ...tab, session: parsed.data } : tab,
      ),
    );
    setBusy(true);
    setShowSources(true);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Name": encodeURIComponent(activeTab.title),
        },
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "No se pudo completar la evaluación.",
        );
      setTabReport(tabId, body, body.savedAs ?? "");
    } catch (e) {
      setTabError(
        tabId,
        e instanceof Error ? e.message : "No se pudo conectar con el servidor.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runAllSessions() {
    const sourceTabs = tabs
      .filter((tab) => /^source-session-\d+$/.test(tab.id))
      .sort(
        (a, b) =>
          Number(a.id.match(/\d+$/)?.[0]) - Number(b.id.match(/\d+$/)?.[0]),
      );
    if (sourceTabs.length !== 8) {
      setBatchProgress({
        completed: 0,
        total: 8,
        current: "",
        folder: "",
        failed: ["Se necesitan las ocho pestañas de sesiones cargadas."],
        done: true,
      });
      return;
    }

    setBusy(true);
    setShowSources(false);
    const failed: string[] = [];
    let folder = "";
    setBatchProgress({
      completed: 0,
      total: sourceTabs.length,
      current: sourceTabs[0].title,
      folder: "",
      failed,
      done: false,
    });
    try {
      for (const [index, tab] of sourceTabs.entries()) {
        const sessionNumber = Number(tab.id.match(/\d+$/)?.[0]);
        setBatchProgress({
          completed: index,
          total: sourceTabs.length,
          current: tab.title,
          folder,
          failed: [...failed],
          done: false,
        });
        setTabError(tab.id, "");
        setTabReport(tab.id, null);
        let errorResultPath = "";
        try {
          const parsed = sessionSchema.safeParse(tab.session);
          if (!parsed.success)
            throw new Error(
              parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(" · "),
            );
          const response = await fetch("/api/evaluate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Session-Name": encodeURIComponent(tab.title),
              "X-Result-Format": "markdown",
              "X-Session-Index": String(sessionNumber),
            },
            body: JSON.stringify(parsed.data),
          });
          const body = await response.json();
          if (!response.ok) {
            errorResultPath = body.savedAs ?? "";
            throw new Error(
              body.error?.message ?? "No se pudo evaluar esta sesión.",
            );
          }
          setTabReport(tab.id, body, body.savedAs ?? "");
          if (!folder && typeof body.savedAs === "string")
            folder = body.savedAs.replace(/\/session\d+\.md$/, "");
        } catch (e) {
          if (!folder && errorResultPath)
            folder = errorResultPath.replace(/\/session\d+\.md$/, "");
          const message =
            e instanceof Error ? e.message : "No se pudo evaluar esta sesión.";
          failed.push(`${tab.title}: ${message}`);
          setTabError(tab.id, message);
        }
        setBatchProgress({
          completed: index + 1,
          total: sourceTabs.length,
          current: tab.title,
          folder,
          failed: [...failed],
          done: false,
        });
      }
      setBatchProgress({
        completed: sourceTabs.length,
        total: sourceTabs.length,
        current: "",
        folder,
        failed,
        done: true,
      });
      setShowSources(true);
    } finally {
      setBusy(false);
    }
  }
  function toggleRisk(
    category: (typeof riskCategories)[number],
    checked: boolean,
  ) {
    const signals = checked
      ? [...session.risk.signals, { category, justification: "" }]
      : session.risk.signals.filter((s) => s.category !== category);
    update({
      ...session,
      risk: { status: signals.length ? "flagged" : "none", signals },
    });
  }
  return (
    <>
      <header className="header">
        <a className="brand" href="/" aria-label="Memoria, inicio">
          <span className="brand-icon" aria-hidden="true">
            m
          </span>
          memoria<span className="brand-divider">/</span>
          <span className="brand-sub">Session consistency</span>
        </a>
        <span className="version">PREVIEW · V1</span>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span className="dot" /> REVISIÓN DE SESIONES
          </div>
          <h1>
            De la conversación
            <br />a la evidencia.
          </h1>
          <p>
            Comprueba que el resumen, los facts y el riesgo
            <br className="desktop-break" /> conserven lo que realmente se dijo.
          </p>
        </section>
        <div className="workspace-heading">
          <div>
            <h2>Evaluador de consistencia</h2>
            <p>Prueba cada sesión en su pestaña y revisa la evidencia.</p>
          </div>
          <div className="toolbar">
            <button
              disabled={busy || sourceLoading}
              onClick={() => openTab("Nueva sesión", structuredClone(blank))}
            >
              Nueva sesión
            </button>
            <button
              disabled={busy || sourceLoading}
              onClick={() => openTab("Ejemplo", structuredClone(example))}
            >
              Cargar ejemplo
            </button>
            <button disabled={busy || sourceLoading} onClick={loadSourceTabs}>
              {sourceLoading ? "Cargando sesiones…" : "Recargar 8 sesiones"}{" "}
              <span className="tab-count">8</span>
            </button>
            <button
              disabled={busy || sourceLoading}
              onClick={() => fileInput.current?.click()}
            >
              Importar JSON <span aria-hidden="true">↗</span>
            </button>
            <button
              type="button"
              className="batch-evaluate"
              disabled={busy || sourceLoading || sourceTabsCount(tabs) !== 8}
              onClick={() => void runAllSessions()}
            >
              {batchProgress && !batchProgress.done
                ? `Evaluando ${batchProgress.completed + 1}/${batchProgress.total}…`
                : "Evaluar las 8 sesiones"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
        </div>
        {batchProgress && (
          <div className="batch-status" role="status" aria-live="polite">
            {!batchProgress.done ? (
              <>
                Sesión {Math.min(batchProgress.completed + 1, batchProgress.total)} de {batchProgress.total}: {batchProgress.current}. Se guardará cada resultado al terminar.
              </>
            ) : (
              <>
                Lote finalizado: {batchProgress.completed}/{batchProgress.total} sesiones procesadas.
                {batchProgress.failed.length > 0 && <> {batchProgress.failed.length} con error de evaluación.</>}
                {batchProgress.folder && <> Resultados en {batchProgress.folder}/</>}
                {batchProgress.failed.length > 0 && (
                  <span> Errores: {batchProgress.failed.join(" · ")}</span>
                )}
              </>
            )}
          </div>
        )}
        {sourceError && (
          <div className="error source-load-error" role="alert">
            <strong>No se pudieron leer las sesiones</strong>
            <p>{sourceError}</p>
          </div>
        )}
        <nav className="session-tabs" role="tablist" aria-label="Sesiones">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              disabled={sourceLoading}
              className={tab.id === activeTabId ? "active" : ""}
              onClick={() => {
                setActiveTabId(tab.id);
                setShowSources(Boolean(tab.report));
              }}
            >
              <span>{tab.title}</span>
              {tab.detail && <small>{tab.detail}</small>}
              {tab.report && <i aria-label="Evaluada" />}
            </button>
          ))}
        </nav>
        <div className="workspace">
          <form className="session-panel" onSubmit={run}>
            <div className="panel-heading">
              <h3>
                <span className="step">01</span> Material de la sesión
              </h3>
              <button
                type="button"
                disabled={busy || sourceLoading}
                className="text-button"
                onClick={() => {
                  const valid = sessionSchema.safeParse(session);
                  if (valid.success) download("session.json", valid.data);
                  else
                    setTabError(
                      activeTabId,
                      "Completa los campos requeridos antes de descargar la sesión.",
                    );
                }}
              >
                Descargar JSON ↓
              </button>
            </div>
            <fieldset disabled={busy || sourceLoading}>
              <div className="field">
                <label htmlFor="transcript">
                  Transcript <span className="required">*</span>
                </label>
                <p className="hint">
                  Conserva los hablantes. Cada línea se podrá citar como
                  evidencia.
                </p>
                <textarea
                  id="transcript"
                  rows={10}
                  required
                  value={session.transcript}
                  onChange={(e) =>
                    update({ ...session, transcript: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <div className="label-row">
                  <label>Antecedentes</label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({
                        ...session,
                        context: [...session.context, { date: null, text: "" }],
                      })
                    }
                  >
                    + Añadir
                  </button>
                </div>
                <p className="hint">
                  La fecha ayuda a distinguir un cambio de una contradicción.
                </p>
                {session.context.length === 0 && (
                  <p className="empty-inline">Sin antecedentes cargados.</p>
                )}
                {session.context.map((entry, i) => (
                  <div className="entry" key={i}>
                    <div className="entry-top">
                      <label htmlFor={`context-${i}`}>
                        Antecedente {i + 1}
                      </label>
                      <input
                        aria-label={`Fecha del antecedente ${i + 1}`}
                        type="date"
                        value={entry.date ?? ""}
                        onChange={(e) =>
                          update({
                            ...session,
                            context: session.context.map((c, j) =>
                              j === i
                                ? { ...c, date: e.target.value || null }
                                : c,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="remove"
                        aria-label={`Eliminar antecedente ${i + 1}`}
                        onClick={() =>
                          update({
                            ...session,
                            context: session.context.filter((_, j) => j !== i),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      id={`context-${i}`}
                      rows={2}
                      required
                      value={entry.text}
                      onChange={(e) =>
                        update({
                          ...session,
                          context: session.context.map((c, j) =>
                            j === i ? { ...c, text: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="section-divider">
                <span>Salidas del procesador</span>
              </div>
              <div className="field">
                <label htmlFor="summary">
                  Resumen <span className="required">*</span>
                </label>
                <textarea
                  id="summary"
                  rows={4}
                  required
                  value={session.summary}
                  onChange={(e) =>
                    update({ ...session, summary: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <div className="label-row">
                  <label>Facts extraídos</label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update({ ...session, facts: [...session.facts, ""] })
                    }
                  >
                    + Añadir fact
                  </button>
                </div>
                {session.facts.length === 0 && (
                  <p className="empty-inline">
                    El procesador no extrajo facts.
                  </p>
                )}
                {session.facts.map((fact, i) => (
                  <div className="fact-entry" key={i}>
                    <span className="fact-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <textarea
                      aria-label={`Fact ${i + 1}`}
                      rows={2}
                      required
                      value={fact}
                      onChange={(e) =>
                        update({
                          ...session,
                          facts: session.facts.map((f, j) =>
                            j === i ? e.target.value : f,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Eliminar fact ${i + 1}`}
                      onClick={() =>
                        update({
                          ...session,
                          facts: session.facts.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="field">
                <label>Riesgo informado</label>
                <p className="hint">
                  Selecciona las categorías reportadas por el procesador.
                </p>
                <div className="risk-options">
                  <label className="risk-option">
                    <input
                      type="checkbox"
                      checked={session.risk.status === "none"}
                      onChange={(e) => {
                        if (e.target.checked)
                          update({
                            ...session,
                            risk: { status: "none", signals: [] },
                          });
                      }}
                    />
                    Ninguno
                  </label>
                  {riskCategories.map((category) => (
                    <React.Fragment key={category}>
                      <label className="risk-option">
                        <input
                          type="checkbox"
                          checked={session.risk.signals.some(
                            (s) => s.category === category,
                          )}
                          onChange={(e) =>
                            toggleRisk(category, e.target.checked)
                          }
                        />
                        {riskLabels[category]}
                      </label>
                      {session.risk.signals.some(
                        (s) => s.category === category,
                      ) && (
                        <textarea
                          className="risk-justification"
                          aria-label={`Justificación: ${riskLabels[category]}`}
                          placeholder="Justificación del procesador (opcional)"
                          rows={2}
                          value={
                            session.risk.signals.find(
                              (s) => s.category === category,
                            )?.justification ?? ""
                          }
                          onChange={(e) =>
                            update({
                              ...session,
                              risk: {
                                ...session.risk,
                                signals: session.risk.signals.map((s) =>
                                  s.category === category
                                    ? { ...s, justification: e.target.value }
                                    : s,
                                ),
                              },
                            })
                          }
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button type="submit" className="primary evaluate">
                {busy ? (
                  <>
                    <span className="spinner" /> Evaluando la sesión…
                  </>
                ) : (
                  <>
                    Evaluar consistencia <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
              <p className="footnote">
                Sentimiento fuera del alcance de esta versión.
              </p>
            </fieldset>
          </form>
          <section
            className="review-panel"
            aria-label="Resultados de evaluación"
            aria-busy={busy}
          >
            <div className="panel-heading">
              <h3>
                <span className="step">02</span> Revisión de evidencia
              </h3>
              {report && (
                <button
                  className="text-button"
                  onClick={() =>
                    download("consistency-report.json", { session, ...report })
                  }
                >
                  Reporte JSON ↓
                </button>
              )}
            </div>
            {error && (
              <div className="error" role="alert">
                <strong>No se pudo completar la operación</strong>
                <p>{error}</p>
              </div>
            )}
            <div aria-live="polite">
              {busy && (
                <div className="loading">
                  <span className="spinner" />
                  <strong>Contrastando las salidas con el material</strong>
                  <p>La duración depende del modelo y de la sesión.</p>
                </div>
              )}
              {!busy && !report && (
                <div className="empty-state">
                  <div className="evidence-icon" aria-hidden="true">
                    ≋
                  </div>
                  <h3>Cada afirmación necesita respaldo.</h3>
                  <p>
                    Carga una sesión y evalúa sus salidas.
                    <br />
                    Aquí verás los hallazgos y las citas que los sustentan.
                  </p>
                  <div className="checks">
                    <span>✓ Resumen</span>
                    <span>✓ Facts</span>
                    <span>✓ Riesgo</span>
                  </div>
                </div>
              )}
              {report && (
                <>
                  <div className={`result-banner ${report.status}`}>
                    <span className="eyebrow">RESULTADO</span>
                    <h3>{statusLabels[report.status]}</h3>
                    <p>
                      {report.issues.length
                        ? `${report.issues.length} hallazgo${report.issues.length === 1 ? "" : "s"} para revisar con el material original.`
                        : report.status === "consistent"
                          ? "Las salidas evaluadas no presentan errores detectados bajo la rúbrica actual."
                          : "Falta evidencia para evaluar todos los campos."}
                    </p>
                  </div>
                  <div className="coverage">
                    {report.coverage.map((c) => (
                      <div key={c.field}>
                        <span>{fieldLabels[c.field]}</span>
                        <strong>
                          {c.status === "evaluated"
                            ? "Evaluado"
                            : "No evaluable"}
                        </strong>
                        {c.reason && <p>{c.reason}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="issues">
                    {report.issues.map((issue, i) => (
                      <article className="issue" key={i}>
                        <div className="issue-top">
                          <span className="issue-number">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="issue-type">
                            {issueLabels[issue.type]}
                          </span>
                          <span className="field-tag">
                            {fieldLabels[issue.field]}
                            {issue.factIndex !== null
                              ? ` ${issue.factIndex + 1}`
                              : ""}
                          </span>
                        </div>
                        <h4>Afirmación cuestionada</h4>
                        <p className="claim">{issue.claim}</p>
                        <p className="explanation">{issue.explanation}</p>
                        <h4>Evidencia</h4>
                        {issue.evidence.map((e, j) => (
                          <a className="quote" key={j} href={`#source-${e.id}`}>
                            <span className="quote-source">
                              {e.source === "transcript"
                                ? "Transcript"
                                : "Antecedente"}{" "}
                              · {e.id} <span aria-hidden="true">↗</span>
                            </span>
                            <q>{e.quote}</q>
                          </a>
                        ))}
                      </article>
                    ))}
                  </div>
                  <div className="report-meta">
                    {activeTab.savedAs && (
                      <p>Guardado en {activeTab.savedAs}</p>
                    )}
                    <p>Modelo: {report.versions.model}</p>
                    <p>
                      Prompt {report.versions.prompt} · Rúbrica{" "}
                      {report.versions.rubric}
                    </p>
                    <p>
                      {new Date(report.generatedAt).toLocaleString("es-MX")}
                    </p>
                  </div>
                </>
              )}
            </div>
            {showSources && (
              <div className="source-view">
                <h3>Material de referencia</h3>
                <p className="hint">
                  Las citas de cada hallazgo enlazan a estas líneas.
                </p>
                {sources.transcript.map((segment) => (
                  <div
                    className="source-line"
                    id={`source-${segment.id}`}
                    key={segment.id}
                  >
                    <span>{segment.id}</span>
                    <p>{segment.text || "—"}</p>
                  </div>
                ))}
                {sources.context.map((segment) => (
                  <div
                    className="source-line context-line"
                    id={`source-${segment.id}`}
                    key={segment.id}
                  >
                    <span>{segment.id}</span>
                    <p>
                      <small>{segment.date ?? "Sin fecha"}</small>
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="rubric-note">
              <span aria-hidden="true">ⓘ</span>
              <p>
                La revisión verifica fidelidad al material. Los hallazgos de
                riesgo señalan respaldo según la rúbrica, no predicen resultados
                sobre el personal.
              </p>
            </div>
          </section>
        </div>
        <footer>
          <span>memoria / consistency evaluator</span>
          <span>Sin historial en la aplicación · Reportes descargables</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
