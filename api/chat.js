import {
  MASTER_PROMPT,
  STAGE_ALIASES,
  STAGE_PROMPTS,
  MODE_PROMPTS,
  VALID_MODES,
  getLanguagePrompt,
} from "../lib/brkr-prompts.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const {
    message,
    stage = "IDEA",
    mode = "AUTO",
    history = [],
    language = "en",
  } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Missing message" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ reply: "Missing OPENAI_API_KEY" });
  }

  const normalizedStageInput = String(stage).toUpperCase();
  const normalizedStage = STAGE_ALIASES[normalizedStageInput] || "IDEA";

  const sanitizedHistory = Array.isArray(history)
    ? history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
        )
        .slice(-12)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))
    : [];

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s./:+-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function includesAny(text, terms) {
    return terms.some((t) => text.includes(t));
  }

  function detectBlockedDomains(text, domainTerms) {
    const negativeOpeners = [
      "sin",
      "todavia no",
      "no quiero",
      "no meterme en",
      "no entrar en",
      "no entrar todavia en",
      "sin meterme en",
      "without",
      "not yet",
      "i dont want",
      "i do not want",
    ];

    const blocked = new Set();

    for (const opener of negativeOpeners) {
      const openerIndex = text.indexOf(opener);
      if (openerIndex === -1) continue;

      const window = text.slice(openerIndex, openerIndex + 120);

      for (const [domain, terms] of Object.entries(domainTerms)) {
        if (terms.some((term) => window.includes(term))) {
          blocked.add(domain);
        }
      }
    }

    return blocked;
  }

  function detectAutoMode({ stage, message }) {
    const current = normalizeText(message);

    const cfoTerms = [
      "worst-case",
      "worst case",
      "estimate costs",
      "validation costs",
      "budget",
      "runway",
      "cashflow",
      "cash flow",
      "margin",
      "pricing",
      "financial",
      "finance",
      "revenue",
      "income",
      "profit",
      "cost",
      "costs",
      "price",
      "pricing model",
      "unit economics",
      "cac",
      "ltv",
      "burn",
      "dinero",
      "coste",
      "costes",
      "costo",
      "costos",
      "presupuesto",
      "peor escenario",
      "estimacion",
      "flujo de caja",
      "margen",
      "rentabilidad",
      "viabilidad financiera",
      "ingresos",
      "beneficio",
      "beneficios",
      "precio",
      "precios",
      "cuanto cobrar",
      "cuanto cuesta",
      "cuanto costaria",
      "cuanto necesito",
      "modelo de precios",
      "economia unitaria",
      "burn rate",
      "runway financiero",
    ];

    const ctoTerms = [
      "mvp",
      "minimum viable product",
      "minimum mvp",
      "define the minimum mvp",
      "build this",
      "what should i build",
      "how should i build",
      "how to build",
      "stack",
      "technical",
      "software",
      "feature",
      "features",
      "api",
      "integration",
      "integrations",
      "architecture",
      "backend",
      "frontend",
      "database",
      "schema",
      "supabase",
      "vercel",
      "wireframe",
      "product scope",
      "build plan",
      "construir",
      "desarrollar",
      "como construir",
      "como lo construyo",
      "como hacer el mvp",
      "mvp minimo",
      "que construir",
      "producto",
      "producto minimo",
      "tecnico",
      "tecnica",
      "funcionalidad",
      "funcionalidades",
      "arquitectura",
      "base de datos",
      "integracion",
      "integraciones",
      "estructura tecnica",
      "alcance tecnico",
      "que no construir",
      "prioridad tecnica",
    ];

    const copywriterTerms = [
      "headline",
      "cta",
      "landing page",
      "landing",
      "write a headline",
      "write copy",
      "rewrite this",
      "hook",
      "ad copy",
      "headline and cta",
      "cold dm",
      "cold email",
      "sales message",
      "outreach message",
      "copy",
      "titular",
      "anuncio",
      "escribe",
      "reescribe",
      "guion",
      "texto",
      "mensaje de venta",
      "mensaje de prospeccion",
      "dm",
      "email de venta",
      "email comercial",
      "texto para vender",
      "copy para landing",
      "hook de anuncio",
      "cta para landing",
    ];

    const scrappingTerms = [
      "prospect list",
      "lead list",
      "decision makers",
      "decision maker",
      "linkedin list",
      "prospects",
      "lead generation list",
      "prospectos",
      "lista de prospectos",
      "decisores",
      "contactos",
      "scrapping",
      "scraping",
      "lista de leads",
      "lista de decisores",
      "empresas objetivo",
    ];

    const pmTerms = [
      "project plan",
      "deliverables",
      "deadline",
      "timeline",
      "roadmap",
      "milestones",
      "execution plan",
      "task breakdown",
      "entregables",
      "cronograma",
      "tareas",
      "seguimiento",
      "plan de proyecto",
      "plan de ejecucion",
      "secuencia de trabajo",
      "prioridades del proyecto",
      "hitos",
    ];

    const trainingTerms = [
      "explain",
      "teach",
      "how does it work",
      "what does this mean",
      "what means",
      "explicame",
      "ensename",
      "como funciona",
      "que significa",
      "quiero entender",
    ];

    const cmoTerms = [
      "channel",
      "channels",
      "acquisition",
      "campaign",
      "campaigns",
      "traffic",
      "audience",
      "growth",
      "marketing channel",
      "funnel",
      "paid traffic",
      "organic traffic",
      "distribution",
      "lead magnet",
      "cold outreach",
      "ads strategy",
      "ads",
      "anuncios",
      "canal",
      "canales",
      "adquisicion",
      "campana",
      "campanas",
      "trafico",
      "audiencia",
      "captacion",
      "marketing",
      "canal de adquisicion",
      "estrategia de anuncios",
      "meta ads",
      "google ads",
      "linkedin ads",
      "tiktok ads",
    ];

    const blockedDomains = detectBlockedDomains(current, {
      CFO: [
        "pricing",
        "price",
        "precio",
        "precios",
        "cost",
        "costs",
        "coste",
        "costes",
        "costo",
        "costos",
        "dinero",
        "budget",
      ],
      CTO: [
        "producto",
        "mvp",
        "construir",
        "build",
        "stack",
        "api",
        "arquitectura",
        "technical",
        "tecnico",
      ],
      CMO: [
        "ads",
        "anuncios",
        "marketing",
        "campaign",
        "campaigns",
        "campana",
        "campanas",
        "trafico",
        "adquisicion",
        "canal",
        "canales",
      ],
    });

    const currentCopyIntent = includesAny(current, copywriterTerms);

    const currentMoneyIntent =
      !blockedDomains.has("CFO") &&
      (
        includesAny(current, cfoTerms) ||
        /(?:cuanto|how much)\s+(?:cuesta|costaria|cobrar|cost)/.test(current)
      );

    const currentBuildIntent =
      !blockedDomains.has("CTO") &&
      (
        includesAny(current, ctoTerms) ||
        /(?:como|how)\s+(?:construir|hacer|build)/.test(current) ||
        /que\s+(?:construyo|debo construir|no construir)/.test(current)
      );

    const currentScrappingIntent = includesAny(current, scrappingTerms);
    const currentPmIntent = includesAny(current, pmTerms);

    const currentTrainingIntent =
      includesAny(current, trainingTerms) &&
      !currentBuildIntent &&
      !currentMoneyIntent &&
      !currentCopyIntent;

    const currentCmoIntent =
      !blockedDomains.has("CMO") &&
      includesAny(current, cmoTerms) &&
      !currentCopyIntent;

    if (currentCopyIntent) return "COPYWRITER";
    if (currentMoneyIntent) return "CFO";
    if (currentBuildIntent) return "CTO";
    if (currentScrappingIntent) return "SCRAPPING";
    if (currentPmIntent) return "PM";
    if (currentTrainingIntent) return "FORMACION";
    if ((stage === "ADS" && !blockedDomains.has("CMO")) || currentCmoIntent) return "CMO";

    return "CODIR";
  }

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode) ? requestedMode : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({
          stage: normalizedStage,
          message,
        })
      : safeRequestedMode;

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA },
    { role: "system", content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: inputMessages,
        temperature: 0.25,
        max_output_tokens: 1200,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(500).json({ reply: raw });
    }

    const data = JSON.parse(raw);

    const text =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap((o) => o.content || [])
            .map((c) => c.text)
            .filter(Boolean)
            .join("\n")
        : "") ||
      "No pude generar respuesta.";

    return res.status(200).json({
      reply: text,
      meta: {
        stage_requested: normalizedStageInput,
        stage_used: normalizedStage,
        mode_requested: safeRequestedMode,
        mode_used: resolvedMode,
        language_used: language,
      },
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
