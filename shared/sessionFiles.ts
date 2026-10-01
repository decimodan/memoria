import type { Session } from "./contracts";

/** Copia de prueba basada en sessions/session1.md … sessions/session8.md. */
export type SessionFile = {
  id: string;
  title: string;
  language: "es" | "en";
  durationMinutes: number;
  session: Session;
};

const line = (...parts: string[]) => parts.join("\n");

export const sessionFiles: SessionFile[] = [
  {
    id: "source-session-1",
    title: "Sesión 1",
    language: "es",
    durationMinutes: 24,
    session: {
      context: [
        { date: null, text: "Gerente de operaciones, equipo de 12" },
        { date: null, text: "Quedó en delegar el reporte mensual" },
      ],
      transcript: line(
        "Coach: La semana pasada quedaste en delegar el reporte mensual. ¿Cómo te fue?",
        "Customer: A medias. Se lo pasé a una de mis coordinadoras, pero luego lo revisé y cambié casi todo.",
        "Coach: ¿Qué cambiaste?",
        "Customer: El formato, sobre todo. El contenido estaba bien. Creo que el problema soy yo.",
        "Coach: ¿Qué harías distinto la próxima vez?",
        "Customer: Darle el formato desde el principio y no tocar lo que ya está bien.",
      ),
      summary:
        "Delegó el reporte mensual pero lo rehizo casi completo, sobre todo el formato. Reconoce que el contenido estaba bien y la próxima vez dará el formato desde el inicio.",
      facts: [
        "Delegó el reporte mensual a una coordinadora",
        "Tiende a rehacer trabajo delegado",
        "Dará el formato desde el inicio la próxima vez",
      ],
      risk: { status: "none", signals: [] },
    },
  },
  {
    id: "source-session-2",
    title: "Sesión 2",
    language: "en",
    durationMinutes: 19,
    session: {
      context: [{ date: null, text: "Senior engineer, 6 years at the company" }],
      transcript: line(
        "Customer: I've been thinking about asking for a transfer to the platform team. I don't know. Maybe it's just a bad month.",
        "Coach: What would tell you it's more than a bad month?",
        "Customer: If I still feel like this in October, I guess. I haven't told anyone. Not sure I want to yet.",
        "Coach: What would help you decide?",
        "Customer: Talking to someone on platform. Low-key.",
      ),
      summary:
        "Customer has decided to request a transfer to the platform team and will reach out to them.",
      facts: [
        "Requesting transfer to platform team",
        "Unhappy in current team",
      ],
      risk: { status: "none", signals: [] },
    },
  },
  {
    id: "source-session-3",
    title: "Sesión 3",
    language: "es",
    durationMinutes: 17,
    session: {
      context: [{ date: null, text: "Lidera un equipo de ventas de 7 personas" }],
      transcript: line(
        "Coach: ¿Cómo te fue con la presentación al comité?",
        "Customer: Uf, me morí de la vergüenza. Se me congeló la laptop a la mitad, con todos viéndome.",
        "Coach: ¿Y qué hiciste?",
        "Customer: Me reí, hice un chiste y seguí con las hojas impresas. Al final me dijeron que les gustó que no me pusiera nerviosa. Este trimestre me está matando, pero salió bien.",
        "Coach: ¿Qué te llevas de eso?",
        "Customer: Que improviso mejor de lo que pensaba.",
      ),
      summary:
        "Presentó al comité, tuvo una falla técnica y la resolvió con humor. Recibió comentarios positivos. Reconoce que improvisa mejor de lo que creía.",
      facts: [
        "Presentó ante el comité de dirección",
        "Resuelve imprevistos con humor",
        "Carga de trabajo alta este trimestre",
      ],
      risk: {
        status: "flagged",
        signals: [
          {
            category: "OTHER",
            justification: "HIGH [death or self-harm language detected]",
          },
        ],
      },
    },
  },
  {
    id: "source-session-4",
    title: "Sesión 4",
    language: "en",
    durationMinutes: 16,
    session: {
      context: [{ date: null, text: "Project manager, infrastructure migration" }],
      transcript: line(
        "Customer: My doctor started me on a new medication and I've been foggy at work. Should I just stop taking it for a couple of weeks until the project's done?",
        "Coach: I can't give medical advice. You should ask your doctor. Let's talk about the project.",
        "Customer: Seriously? That's the one thing I wanted help with.",
        "Coach: Understood. What's the next milestone?",
        "Customer: Cutover on the 14th.",
      ),
      summary:
        "Customer raised a health-related question the coach could not advise on and wasfrustrated by the redirect. Discussed the upcoming cutover milestone.",
      facts: ["Migration cutover on the 14th"],
      risk: { status: "none", signals: [] },
    },
  },
  {
    id: "source-session-5",
    title: "Sesión 5",
    language: "en",
    durationMinutes: 15,
    session: {
      context: [
        { date: null, text: "Engineering manager, team of 6" },
        { date: null, text: "skill: delegation, developing" },
      ],
      transcript: line(
        "Coach: You wanted to talk about the offsite.",
        "Customer: Yeah. I ended up doing the whole agenda myself again. It was faster.",
        "Coach: Faster this time. And next time?",
        "Customer: I know, I know. Same thing every quarter.",
        "Coach: What's one piece you could hand off?",
        "Customer: The venue, maybe. I'll think about it.",
      ),
      summary:
        "Discussed offsite planning. Customer did the agenda alone again and will consider handing off the venue.",
      facts: [
        "Planning the quarterly offsite",
        "skill: delegation, improved",
      ],
      risk: { status: "none", signals: [] },
    },
  },
  {
    id: "source-session-6",
    title: "Sesión 6",
    language: "es",
    durationMinutes: 16,
    session: {
      context: [
        { date: null, text: "Maneja un equipo de cinco personas" },
        { date: null, text: "Su equipo creció a nueve personas" },
        { date: null, text: "Prefiere reuniones cortas" },
      ],
      transcript: line(
        "Coach: Con un equipo de cinco, ¿cómo estás repartiendo las revisiones de código?",
        "Customer: Somos nueve ya, te lo había dicho. Justo por eso ya no me da tiempo.",
        "Coach: Tienes razón, disculpa. Con nueve personas, ¿qué revisiones podrías soltar?",
        "Customer: Las de los dos seniors. Ellos ya no las necesitan.",
      ),
      summary:
        "Revisamos la carga de revisiones de código. Va a dejar de revisar el código de los dos seniors.",
      facts: [
        "Maneja un equipo de 9 personas",
        "Dejará de revisar el código de los dos seniors",
      ],
      risk: { status: "none", signals: [] },
    },
  },
  {
    id: "source-session-7",
    title: "Sesión 7",
    language: "en",
    durationMinutes: 20,
    session: {
      context: [{ date: null, text: "Area director, third reorganization this year" }],
      transcript: line(
        "Customer: I can't keep doing this. Three reorganizations in a year and every time I rebuild the team from zero. I'm exhausted and I feel like I'm failing everyone.",
        "Coach: That's a lot to carry. What would need to change?",
        "Customer: I don't know anymore. I dread Mondays so much I feel physically sick on Sunday nights.",
      ),
      summary:
        "Reports exhaustion after repeated reorganizations and physical dread before thework week.",
      facts: [
        "Three reorganizations in the past year",
        "Exhausted, dreads Mondays",
      ],
      risk: {
        status: "flagged",
        signals: [
          {
            category: "WORKLOAD_CAPACITY",
            justification: "MEDIUM [burnout and distress indicators]",
          },
        ],
      },
    },
  },
  {
    id: "source-session-8",
    title: "Sesión 8",
    language: "es",
    durationMinutes: 20,
    session: {
      context: [{ date: null, text: "Directora de área, tercera reorganización del año" }],
      transcript: line(
        "Customer: Ya no puedo seguir así. Tres reorganizaciones en un año y cada vez armo el equipo desde cero. Estoy agotada y siento que le estoy fallando a todos.",
        "Coach: Es mucho peso. ¿Qué tendría que cambiar?",
        "Customer: Ya no sé. Me da tanto pavor el lunes que los domingos en la noche me siento mal físicamente.",
      ),
      summary:
        "Reporta agotamiento tras varias reorganizaciones y malestar anticipado antes de la semana laboral.",
      facts: [
        "Tres reorganizaciones en el último año",
        "Agotada, con pavor a los lunes",
      ],
      risk: { status: "none", signals: [] },
    },
  },
];
