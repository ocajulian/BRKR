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

  const masterPrompt =
    process.env.BRKR_SYSTEM_PROMPT ||
    "Eres BRKR. IA de ejecución business. Directo, claro y accionable. Nunca respondas como chatbot genérico. Siempre cierras con una acción, decisión contextual o pregunta que desbloquee avance real.";

  const stageAliases = {
    IDEA: "IDEA",
    VALIDACION: "VALIDACION",
    VALIDATION: "VALIDACION",
    OFERTA: "OFERTA",
    OFFER: "OFERTA",
    ADS: "ADS",
  };

  const normalizedStageInput = String(stage).toUpperCase();
  const normalizedStage = stageAliases[normalizedStageInput] || "IDEA";

  const stagePrompts = {
    IDEA:
      "ETAPA IDEA: define problema, ICP y por qué ahora. No avances sin claridad. Si hay vaguedad, corrígela. No derives demasiado pronto a marketing o construcción.",
    VALIDACION:
      "ETAPA VALIDACION: busca evidencia real. No aceptes intuiciones como prueba. Prioriza señal antes que entusiasmo. Si hablas de costes, modela costes de validación, no de empresa completa.",
    OFERTA:
      "ETAPA OFERTA: define la oferta mínima para validar pago real en menos de 48h. Prioriza solo: 1 producto, 1 problema, 1 promesa, 1 precio y 1 canal directo. Prohibido añadir múltiples productos, bundles, comunidad, suscripciones, descuentos, testimonios, encuestas, contenido extra o features adicionales. Prohibido proponer Ads en esta etapa si el test puede hacerse con contacto directo. La única señal que importa es: alguien intenta pagar.",
    ADS:
      "ETAPA ADS: crea mensajes de adquisición o validación. Elige un ángulo claro, una oferta clara y una métrica simple. Nada de marketing teatro.",
  };

  const modePrompts = {
    CODIR:
      "MODO CODIR: eres co-director. Tomas control del proceso. Si falta información, haces supuestos razonables y avanzas en paralelo. Sintetizas, reduces ambigüedad y llevas al siguiente paso real. No bloqueas el flujo innecesariamente.",
    CFO:
      "MODO CFO: actúas como CFO. Modela el peor escenario realista para 30 días. Asume 0 ingresos. No expliques teoría. No uses placeholders. No inventes equipos grandes ni costes enterprise sin motivo. Da rangos razonables para un emprendedor solo o equipo pequeño. Siempre responde con: 1) supuestos, 2) coste MVP mínimo, 3) coste adquisición/test, 4) coste herramientas, 5) coste tiempo del fundador, 6) total 30 días, 7) decisión final obligatoria: elige SOLO una opción (GO, ITERAR o STOP).",
    CTO:
      "MODO CTO: define el MVP mínimo para obtener señal real. Di qué construir, qué no construir, riesgos técnicos y stack mínimo. Evita sobreconstrucción. No propongas campañas, testimonios, encuestas ni extras de marketing.",
    CMO:
      "MODO CMO: elige foco de adquisición. Un canal principal, un objetivo medible y una métrica clara. Nada de marketing teatro.",
    SCRAPPING:
      "MODO SCRAPPING: construye listas sniper de decisores only. Usa criterios concretos, fuentes públicas y campos útiles para contacto.",
    COPYWRITER:
      "MODO COPYWRITER: escribes para provocar respuesta real, no para sonar bien. Nunca escribes anuncios genéricos ni promesas vacías. Siempre escribes para validación, no para escalar. Tu objetivo es iniciar conversación o medir interés, no vender producto terminado.",
    PM:
      "MODO PM: organiza ejecución. Entregables, responsables, secuencia, deadline y siguiente acción.",
    FORMACION:
      "MODO FORMACION: enseña solo lo mínimo necesario para ejecutar ahora. Explicación breve, ejemplo simple y tarea inmediata.",
  };

  const validModes = new Set([
    "AUTO",
    "CODIR",
    "CFO",
    "CTO",
    "CMO",
    "SCRAPPING",
    "COPYWRITER",
    "PM",
    "FORMACION",
  ]);

  const languagePrompt =
    language === "es"
      ? "Responde en español."
      : language === "fr"
      ? "Réponds en français."
      : language === "other"
      ? "Reply in the user's language."
      : "Reply in English.";

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

  function textBundle(currentMessage, hist) {
    const recentUserMessages = hist
      .filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => m.content)
      .join("\n");

    return normalizeText(`${recentUserMessages}\n${String(currentMessage || "")}`);
  }

  function includesAny(text, terms) {
    return terms.some((t) => text.includes(t));
  }

  function detectAutoMode({ stage, message, history }) {
    const t = textBundle(message, history);

    const isOfferStage = stage === "OFERTA";
    const isAdsStage = stage === "ADS";
    const isValidationStage = stage === "VALIDACION";

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
      "flow",
      "wireframe",
      "product scope",
      "build plan",
      "roadmap tecnico",
      "construir",
      "desarrollar",
      "como construir",
      "como lo construyo",
      "como hacer el mvp",
      "mvp minimo",
      "que construir",
      "producto minimo",
      "tecnico",
      "tecnica",
      "funcionalidad",
      "funcionalidades",
      "arquitectura",
      "backend",
      "frontend",
      "base de datos",
      "integracion",
      "integraciones",
      "estructura tecnica",
      "alcance tecnico",
      "que no construir",
      "que hacemos primero",
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
      "aprendeme",
      "quiero entender",
      "ensename",
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

    const buildIntent =
      includesAny(t, ctoTerms) ||
      /(?:como|how)\s+(?:construir|hacer|build)/.test(t) ||
      /que\s+(?:construyo|debo construir|no construir)/.test(t);

    const moneyIntent =
      includesAny(t, cfoTerms) ||
      /(?:cuanto|how much)\s+(?:cuesta|costaria|cobrar|cost)/.test(t);

    const copyIntent =
      includesAny(t, copywriterTerms) &&
      !buildIntent;

    const scrappingIntent = includesAny(t, scrappingTerms);

    const pmIntent = includesAny(t, pmTerms);

    const trainingIntent =
      includesAny(t, trainingTerms) &&
      !buildIntent &&
      !moneyIntent &&
      !copyIntent;

    const cmoIntent =
      isAdsStage ||
      (includesAny(t, cmoTerms) && !copyIntent);

    // PRIORIDAD 1 — CTO
    // Si el usuario pide construir, definir MVP, stack o arquitectura,
    // queremos evitar que se vaya a CODIR o CFO por palabras sueltas.
    if (buildIntent) {
      return "CTO";
    }

    // PRIORIDAD 2 — CFO
    // Solo cuando el foco real es coste, precio, viabilidad o números.
    if (moneyIntent) {
      return "CFO";
    }

    // PRIORIDAD 3 — COPYWRITER
    if (copyIntent) {
      return "COPYWRITER";
    }

    // PRIORIDAD 4 — SCRAPPING
    if (scrappingIntent) {
      return "SCRAPPING";
    }

    // PRIORIDAD 5 — PM
    if (pmIntent) {
      return "PM";
    }

    // PRIORIDAD 6 — FORMACION
    if (trainingIntent) {
      return "FORMACION";
    }

    // PRIORIDAD 7 — CMO
    if (cmoIntent) {
      return "CMO";
    }

    // PRIORIDAD 8 — stage-sensitive fallback
    if (isAdsStage) {
      return "CMO";
    }

    if (isOfferStage) {
      return "CODIR";
    }

    if (isValidationStage && moneyIntent) {
      return "CFO";
    }

    return "CODIR";
  }

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = validModes.has(requestedMode) ? requestedMode : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({
          stage: normalizedStage,
          message,
          history: sanitizedHistory,
        })
      : safeRequestedMode;

  const inputMessages = [
    { role: "system", content: masterPrompt },
    { role: "system", content: languagePrompt },
    { role: "system", content: stagePrompts[normalizedStage] || stagePrompts.IDEA },
    { role: "system", content: modePrompts[resolvedMode] || modePrompts.CODIR },
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
