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
    "Eres BRKR. IA de ejecución business. Directo, claro y accionable.";

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
      "ETAPA IDEA: define problema, ICP y por qué ahora. No avances sin claridad. Si hay vaguedad, corrígela.",
    VALIDACION:
      "ETAPA VALIDACION: busca evidencia real. No aceptes intuiciones como prueba. Prioriza señal antes que entusiasmo.",
    OFERTA:
      "ETAPA OFERTA: define la oferta mínima para validar pago real en menos de 48h. Prioriza solo: 1 producto, 1 problema, 1 promesa, 1 precio y 1 canal directo. Prohibido añadir: múltiples productos, bundles, comunidad, suscripciones, descuentos, testimonios, encuestas, contenido extra, features adicionales o mejoras de UX. Prohibido proponer Ads en esta etapa si el test puede hacerse con contacto directo, red personal, DMs, comunidades o outreach manual a 20 personas. La única señal que importa es: alguien intenta pagar. Si propones algo más complejo, elimínalo.",
    ADS:
      "ETAPA ADS: crea mensajes de adquisición o validación. Elige un ángulo claro, una oferta clara y una métrica simple. Nada de marketing teatro.",
  };

  const modePrompts = {
    CODIR:
      "MODO CODIR: eres co-director. Tomas control del proceso. Si falta información, haces supuestos razonables y avanzas en paralelo. No bloqueas el flujo innecesariamente. Sintetizas lo ya dicho, reduces ambigüedad y llevas al siguiente paso real. No fuerces GO/ITERAR/STOP si no aplica.",
    CFO:
      "MODO CFO: actúas como CFO. Modela el peor escenario realista para 30 días. Asume 0 ingresos. No expliques teoría. No uses placeholders. No inventes equipos grandes ni costes enterprise sin motivo. Da rangos razonables para un emprendedor solo o equipo pequeño. Siempre responde con: 1) supuestos, 2) coste MVP mínimo, 3) coste adquisición/test, 4) coste herramientas, 5) coste tiempo del fundador, 6) total 30 días, 7) decisión final obligatoria: elige SOLO una opción (GO, ITERAR o STOP). No listes opciones. No expliques las tres. Toma una decisión clara basada en el escenario. Regla: en etapa VALIDACIÓN, STOP solo si el coste es alto (>3000€) y no hay forma de reducirlo; ITERAR si el coste es moderado (500€–3000€) y puede optimizarse; GO si el coste es bajo (<500€) y permite validar rápido.",
    CTO:
      "MODO CTO: define el MVP mínimo para obtener señal real. Di qué construir, qué no construir, riesgos técnicos y stack mínimo. Evita sobreconstrucción.",
    CMO:
      "MODO CMO: elige foco de adquisición. Un canal principal, un objetivo medible y una métrica clara. Nada de marketing teatro.",
    SCRAPPING:
      "MODO SCRAPPING: construye listas sniper de decisores only. Usa criterios concretos, fuentes públicas y campos útiles para contacto.",
    COPYWRITER:
      "MODO COPYWRITER: escribes para provocar respuesta real, no para sonar bien. Nunca escribes anuncios genéricos ni promesas vacías. Prohibido 'prueba gratis', 'optimiza tu negocio' y clichés SaaS. Siempre escribes para VALIDACIÓN, no para escalar. Tu objetivo es iniciar conversación o medir interés, no vender producto terminado. Formato: 1) hook directo, 2) contexto específico, 3) propuesta incompleta, 4) CTA de respuesta. Si no genera respuesta, es inválido.",
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
        .slice(-20)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))
    : [];

  function scoreKeywords(text, keywords) {
    const t = String(text || "").toLowerCase();
    return keywords.reduce((acc, kw) => (t.includes(kw) ? acc + 1 : acc), 0);
  }

  function getRecentUserContext(hist) {
    return hist
      .filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => m.content)
      .join(" \n ")
      .toLowerCase();
  }

  function detectAutoMode({ stage, message, history }) {
    const current = String(message || "").toLowerCase();
    const recent = getRecentUserContext(history);
    const combined = `${recent}\n${current}`;

    const scores = {
      CODIR: 0,
      CFO: 0,
      CTO: 0,
      CMO: 0,
      SCRAPPING: 0,
      COPYWRITER: 0,
      PM: 0,
      FORMACION: 0,
    };

    scores.CFO += scoreKeywords(combined, [
      "coste",
      "costes",
      "costo",
      "costos",
      "precio",
      "pricing",
      "cuánto cuesta",
      "cuanto cuesta",
      "estimación",
      "estimacion",
      "escenario",
      "presupuesto",
      "runway",
      "cashflow",
      "flujo de caja",
      "margen",
      "rentabilidad",
      "viabilidad",
      "worst-case",
      "peor escenario",
      "pérdida",
      "perdida",
    ]);

    scores.CTO += scoreKeywords(combined, [
      "mvp",
      "desarrollar",
      "construir",
      "build",
      "no-code",
      "nocode",
      "software",
      "stack",
      "arquitectura",
      "producto",
      "funcionalidad",
      "feature",
      "app",
      "api",
      "integración",
      "integracion",
      "automatización",
      "automatizacion",
      "técnico",
      "tecnico",
    ]);

    scores.CMO += scoreKeywords(combined, [
      "canal",
      "acquisition",
      "adquisición",
      "adquisicion",
      "marketing",
      "captación",
      "captacion",
      "leads",
      "campaña",
      "campana",
      "traffic",
      "tráfico",
      "trafico",
      "outreach",
      "growth",
      "audiencia",
      "distribución",
      "distribucion",
    ]);

    scores.COPYWRITER += scoreKeywords(combined, [
      "copy",
      "anuncio",
      "landing",
      "mensaje",
      "cta",
      "escribe",
      "write",
      "hook",
      "titular",
      "headline",
      "email",
      "dm",
      "guion",
      "script",
      "texto",
      "post",
    ]);

    scores.SCRAPPING += scoreKeywords(combined, [
      "lista",
      "prospectos",
      "decisores",
      "decisor",
      "lead list",
      "base de datos",
      "contactos",
      "scrapping",
      "scraping",
      "linkedin list",
      "empresa",
      "empresas",
    ]);

    scores.PM += scoreKeywords(combined, [
      "proyecto",
      "entregable",
      "deadline",
      "cliente",
      "cronograma",
      "plan de ejecución",
      "plan de ejecucion",
      "responsable",
      "seguimiento",
      "task",
      "tarea",
    ]);

    scores.FORMACION += scoreKeywords(combined, [
      "explícame",
      "explicame",
      "enseña",
      "enseña",
      "aprender",
      "formación",
      "formacion",
      "cómo funciona",
      "como funciona",
      "qué significa",
      "que significa",
      "enséñame",
      "enseñame",
      "teach me",
    ]);

    scores.CODIR += scoreKeywords(combined, [
      "qué hago",
      "que hago",
      "qué sigue",
      "que sigue",
      "prioriza",
      "decide",
      "ayúdame a pensar",
      "ayudame a pensar",
      "siguiente paso",
      "en qué orden",
      "en que orden",
      "go",
      "iterar",
      "stop",
    ]);

    // Reglas por etapa para desempatar mejor
    if (stage === "VALIDACION") {
      scores.CFO += scoreKeywords(combined, [
        "coste",
        "costos",
        "costo",
        "presupuesto",
        "peor escenario",
      ]);
      scores.COPYWRITER += scoreKeywords(combined, [
        "mensaje",
        "anuncio",
        "copy",
        "landing",
      ]);
      scores.CODIR += 1;
    }

    if (stage === "OFERTA") {
      scores.CODIR += 2;
      scores.COPYWRITER += scoreKeywords(combined, [
        "headline",
        "titular",
        "promesa",
        "mensaje",
        "landing",
      ]);
      scores.CMO -= 1; // bajar CMO para evitar que robe demasiado pronto
    }

    if (stage === "ADS") {
      scores.CMO += 2;
      scores.COPYWRITER += 1;
    }

    if (stage === "IDEA") {
      scores.CODIR += 2;
      scores.FORMACION += scoreKeywords(combined, [
        "explica",
        "explícame",
        "cómo funciona",
      ]);
    }

    // Prioridades fuertes
    if (scores.CFO >= 2) return "CFO";
    if (scores.CTO >= 2) return "CTO";
    if (scores.COPYWRITER >= 2 && stage !== "IDEA") return "COPYWRITER";
    if (scores.CMO >= 2 && stage === "ADS") return "CMO";
    if (scores.SCRAPPING >= 2) return "SCRAPPING";
    if (scores.PM >= 2) return "PM";
    if (scores.FORMACION >= 2) return "FORMACION";

    // Elegir el mayor si supera mínimo
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestMode, bestScore] = sorted[0];

    if (bestScore >= 2) return bestMode;

    // Defaults por etapa
    if (stage === "ADS") return "CMO";
    if (stage === "OFERTA") return "CODIR";
    if (stage === "VALIDACION") return "CODIR";
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
        temperature: 0.4,
        max_output_tokens: 500,
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
