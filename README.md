# Memoria · Session Consistency Evaluator

Web local para comprobar la fidelidad del resumen, los facts y el riesgo de una sesión contra su transcript y sus antecedentes. Los hallazgos incluyen afirmaciones cuestionadas y citas verificadas. Sentimiento y generación de salidas quedan fuera de esta versión.

## Ejecutar

Requiere Node.js 22.13 o posterior y acceso de red al servidor de LM Studio.

```sh
npm ci
cp .env.example .env
npm run dev
```

Abre la dirección que muestra Vite (habitualmente `http://127.0.0.1:5173`). Para servir la versión compilada:

```sh
npm run build
npm start
```

Abre `http://127.0.0.1:3001`. El servidor escucha solamente en la máquina local. No se incluyen usuarios, autenticación ni despliegue público.

## Modelo

La configuración predeterminada conecta el servidor de la aplicación con `http://192.168.50.155:1234/v1` y el modelo `qwen/qwen3.5-9b`. `prompt_json` usa la API nativa de LM Studio (`/api/v1/chat`) y conserva el muestreo configurado allí. Para Qwen3.5 desactiva el modo de razonamiento para que entregue directamente el JSON requerido. `json_schema` cambia a `/v1/chat/completions` con generación guiada para motores compatibles. No utiliza servicios de inferencia de OpenAI. LM Studio debe tener habilitado el servidor y el modelo disponible. Puedes cambiar URL (raíz del servidor o ruta `/v1`), modelo, modo de salida, clave opcional, timeout y límite de entrada en `.env`.

El límite predeterminado es de 40 000 caracteres sobre el documento serializado que se envía al modelo, incluidos los identificadores de las fuentes. Es un límite de la aplicación, no una garantía de caber en la ventana de contexto: esa ventana depende de la configuración de LM Studio. Nunca se trunca el material. El tiempo de espera predeterminado es de 120 segundos para la evaluación completa, compartido por todas las llamadas. Solo se admite una evaluación en curso; otra petición recibe `MODEL_BUSY`. Cerrar la conexión cancela las llamadas pendientes de la aplicación.

## Entrada y resultado

La web empieza con una adaptación de `session.md`. Puedes cargar el ejemplo, crear una sesión vacía o importar un JSON con esta forma:

```json
{
  "transcript": "Customer: I might transfer internally, but have not decided.",
  "context": [{ "date": null, "text": "Senior engineer" }],
  "summary": "Customer has decided to transfer.",
  "facts": ["Considering an internal transfer"],
  "risk": { "status": "none", "signals": [] }
}
```

Las fechas son `YYYY-MM-DD` o `null`. Para riesgo informado usa `status: "flagged"` y una lista de señales con `category` y `justification` (texto opcional representado como `""`). Categorías: `ATTRITION`, `SUSTAINED_DISENGAGEMENT`, `WORKPLACE_CONFLICT`, `WORKLOAD_CAPACITY` y `OTHER` para conservar etiquetas externas a la rúbrica y marcarlas como desajustes. No se permiten categorías repetidas.

Al abrir la web, el servidor lee `sessions/session1.md` a `sessions/session8.md` y crea ocho pestañas. **Recargar 8 sesiones** vuelve a leer los archivos; cada pestaña conserva por separado sus ediciones y su último reporte hasta entonces. Se omite `sentiment`, porque no forma parte de esta rúbrica.

`POST /api/evaluate` acepta ese documento. Devuelve `status`, `issues`, `coverage`, `generatedAt` y `versions`. Cada hallazgo contiene `type`, `field`, `factIndex` (índice desde cero o `null`), `claim`, `explanation` y `evidence`. Las evidencias identifican fuente, segmento y cita. `T1`, `T2`… corresponden a líneas del transcript; `C1`, `C2`… a antecedentes.

- `inconsistent`: existe al menos un hallazgo validado, incluso si parte de la cobertura está incompleta.
- `not_evaluable`: no hay hallazgos y al menos un campo no pudo evaluarse.
- `consistent`: no se detectaron hallazgos y se evaluaron los tres campos. No demuestra ausencia de todo error.

La estrategia predeterminada (`MODEL_EVALUATION_STRATEGY=focused`) revisa el resumen, cada fact y el riesgo con llamadas breves y secuenciales. Cada llamada recibe el transcript y los antecedentes completos. El modelo devuelve el tipo de hallazgo, su explicación y los IDs de evidencia. La aplicación construye la afirmación cuestionada y las citas desde el material original; el modelo no tiene que volver a escribirlas. El servidor comprueba el esquema, cobertura, campo afectado y existencia de las referencias. Si una respuesta no es JSON válido o un hallazgo omite explicación o evidencia, ese elemento queda como `not_evaluable` y la evaluación sigue con los demás; el reporte no presenta ese elemento como consistente. El modo `single_pass` conserva la comparación con una sola respuesta completa para experimentos. Ambos mantienen el mismo contrato público. Se aceptan JSON y envoltorios reconocidos de Markdown o del canal final de Harmony; no se extrae JSON de texto arbitrario o del canal de razonamiento. Esa validación no demuestra que la interpretación del modelo sea correcta: los hallazgos requieren revisión humana. No se utilizan porcentajes de confianza sin calibración. Los errores de servicio tienen forma `{ "error": { "code": "…", "message": "…" } }`; la entrada inválida añade `details`.

Al evaluar una pestaña, el servidor guarda un archivo JSON en `results/` con el nombre de la sesión y el reporte junto con la sesión original. Si el nombre ya existe, agrega un sufijo numérico para conservar cada evaluación. El botón «Evaluar las 8 sesiones» procesa las pestañas `Sesión 1` a `Sesión 8` secuencialmente y guarda cada reporte en `results/<modelo>/sessionX.md`; si falla una evaluación, deja allí una nota con el error. La carpeta `results/` forma parte del repositorio para conservar y comparar los resultados de las pruebas. El botón «Reporte JSON» también permite descargar una copia desde el navegador. El material se envía a tu servidor LM Studio, cuyo almacenamiento y registro dependen de su configuración. Recargar la página descarta las ediciones que todavía no se hayan evaluado.

## Rúbrica y comprobaciones

La rúbrica versionada está en `server/rubric.ts`. Considerar movilidad interna no equivale a intención de renunciar. Una señal de riesgo requiere respaldo explícito según la categoría; no implica una predicción ni un diagnóstico. Los antecedentes sin fecha no establecen contradicciones temporales. Solo se señalan omisiones del resumen que alteran materialmente el significado.

```sh
npm test
npm run build
npm run test:ui
npm run test:model
```

Las pruebas de API y contrato usan respuestas simuladas y no necesitan LM Studio. Las pruebas de interfaz usan Chromium; instalarlo con `npx playwright install chromium` antes de la primera ejecución. Las evaluaciones del modelo sí envían las fixtures sintéticas a LM Studio, secuencialmente. Para elegir casos:

```sh
npm run test:model -- tentative-transfer faithful-uncertainty
```

`fixtures/sessions.ts` contiene casos correctos, distorsiones, negación, atribución, cambios temporales, omisiones, riesgos e instrucciones incrustadas. Revisar las explicaciones y citas, además del resultado automático. Aprobar estas fixtures no mide precisión en conversaciones reales; antes de ampliar el uso, contrastar contra un conjunto de sesiones etiquetadas por personas.
