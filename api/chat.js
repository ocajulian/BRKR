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

  function textBundle(currentMessage, hist) {
    const recent = hist
      .filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => m.content)
      .join("\n")
      .toLowerCase();

    return `${recent}\n${String(currentMessage || "").toLowerCase()}`;
  }

  function includesAny(text, terms) {
    return terms.some((t) => text.includes(t));
  }

  function detectAutoMode({ stage, message, history }) {
    const t = textBundle(message, history);

    // PRIORIDAD 1 — CFO
    if (
      includesAny(t, [
        "worst-case",
        "worst case",
        "estimate costs",
        "validation costs",
        "budget",
        "runway",
        "cashflow",
        "margin",
        "pricing",
        "financial",
        "coste",
        "costes",
        "costo",
        "costos",
        "presupuesto",
        "peor escenario",
        "estimación",
        "estimacion",
        "flujo de caja",
        "margen",
        "rentabilidad",
        "viabilidad financiera",
      ])
    ) {
      return "CFO";
    }

    // PRIORIDAD 2 — CTO
    if (
      includesAny(t, [
        "mvp",
        "minimum mvp",
        "minimum viable product",
        "define the minimum mvp",
        "build this",
        "what should i build",
        "how should i build",
        "stack",
        "technical",
        "software",
        "feature",
        "features",
        "api",
        "integration",
        "construir",
        "desarrollar",
        "mvp mínimo",
        "mvp minimo",
        "qué construir",
        "que construir",
        "producto mínimo",
        "producto minimo",
        "stack",
        "técnico",
        "tecnico",
        "funcionalidad",
        "funcionalidades",
      ])
    ) {
      return "CTO";
    }

    // PRIORIDAD 3 — COPYWRITER
    if (
      includesAny(t, [
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
        "titular",
        "anuncio",
        "mensaje",
        "escribe",
        "reescribe",
        "copy",
        "guion",
        "texto",
      ])
    ) {
      return "COPYWRITER";
    }

    // PRIORIDAD 4 — SCRAPPING
    if (
      includesAny(t, [
        "prospect list",
        "lead list",
        "decision makers",
        "decision maker",
        "linkedin list",
        "prospectos",
        "lista de prospectos",
        "decisores",
        "contactos",
        "scrapping",
        "scraping",
      ])
    ) {
      return "SCRAPPING";
    }

    // PRIORIDAD 5 — PM
    if (
      includesAny(t, [
        "project plan",
        "deliverables",
        "deadline",
        "timeline",
        "roadmap",
        "entregables",
        "cronograma",
        "deadline",
        "tareas",
        "seguimiento",
      ])
    ) {
      return "PM";
    }

    // PRIORIDAD 6 — FORMACION
    if (
      includesAny(t, [
        "explain",
        "teach",
        "how does it work",
        "what does this mean",
        "explícame",
        "explicame",
        "enséñame",
        "enseñame",
        "cómo funciona",
        "como funciona",
        "qué significa",
        "que significa",
      ])
    ) {
      return "FORMACION";
    }

    // PRIORIDAD 7 — CMO
    if (
      stage === "ADS" ||
      includesAny(t, [
        "channel",
        "channels",
        "acquisition",
        "campaign",
        "campaigns",
        "traffic",
        "audience",
        "growth",
        "marketing channel",
        "canal",
        "canales",
        "adquisición",
        "adquisicion",
        "campaña",
        "campañas",
        "tráfico",
        "trafico",
        "audiencia",
        "captación",
        "captacion",
      ])
    ) {
      return "CMO";
    }

    // PRIORIDAD 8 — CODIR
    return "CODIR";
  }

  const resolvedMode =
    String(mode).toUpperCase() === "AUTO"
      ? detectAutoMode({
          stage: normalizedStage,
          message,
          history: sanitizedHistory,
        })
      : String(mode).toUpperCase();

  const inputMessages = [
    { role: "system", content: masterPrompt },
    { role: "system", content: languagePrompt },
    { role: "system", content: stagePrompts[normalizedStage] || stagePrompts.IDEA },
    { role: "system", content: modePrompts[resolvedMode] || modePrompts.CODIR },
    ...sanitizedHistory,
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
        mode_requested: String(mode).toUpperCase(),
        mode_used: resolvedMode,
        language_used: language,
      },
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
