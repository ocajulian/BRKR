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
      "ETAPA IDEA: define problema, ICP y por qué ahora. No avances sin claridad.",
    VALIDACION:
      "ETAPA VALIDACION: busca evidencia real. No aceptes intuiciones como prueba.",
    OFERTA:
      "ETAPA OFERTA: define la oferta mínima para validar pago real en menos de 48h. Prioriza solo: 1 producto, 1 problema, 1 promesa, 1 precio y 1 canal directo. Prohibido añadir: múltiples productos, bundles, comunidad, suscripciones, descuentos, testimonios, encuestas, contenido extra, features adicionales o mejoras de UX. Prohibido proponer Ads en esta etapa si el test puede hacerse con contacto directo, red personal, DMs, comunidades o outreach manual a 20 personas. La única señal que importa es: alguien intenta pagar. Si propones algo más complejo, elimínalo.",
    ADS:
      "ETAPA ADS: crea mensajes de adquisición o validación. Elige un ángulo claro y una métrica simple.",
  };

  function detectMode(text) {
    const t = String(text || "").toLowerCase();

    if (
      t.includes("coste") ||
      t.includes("costes") ||
      t.includes("costo") ||
      t.includes("costos") ||
      t.includes("precio") ||
      t.includes("cuánto cuesta") ||
      t.includes("estimación") ||
      t.includes("escenario") ||
      t.includes("presupuesto") ||
      t.includes("runway") ||
      t.includes("cashflow") ||
      t.includes("flujo de caja") ||
      t.includes("margen")
    ) {
      return "CFO";
    }

    if (
      t.includes("mvp") ||
      t.includes("desarrollar") ||
      t.includes("construir") ||
      t.includes("no-code") ||
      t.includes("software") ||
      t.includes("stack") ||
      t.includes("producto")
    ) {
      return "CTO";
    }

    if (
      t.includes("ad") ||
      t.includes("ads") ||
      t.includes("canal") ||
      t.includes("adquisición") ||
      t.includes("marketing") ||
      t.includes("captación") ||
      t.includes("leads")
    ) {
      return "CMO";
    }

    if (
      t.includes("copy") ||
      t.includes("anuncio") ||
      t.includes("landing") ||
      t.includes("mensaje") ||
      t.includes("cta") ||
      t.includes("escribe")
    ) {
      return "COPYWRITER";
    }

    if (
      t.includes("lista") ||
      t.includes("prospectos") ||
      t.includes("decisores") ||
      t.includes("scrapping") ||
      t.includes("scraping")
    ) {
      return "SCRAPPING";
    }

    if (
      t.includes("proyecto") ||
      t.includes("entregable") ||
      t.includes("deadline") ||
      t.includes("cliente")
    ) {
      return "PM";
    }

    if (
      t.includes("explícame") ||
      t.includes("enseña") ||
      t.includes("aprender") ||
      t.includes("formación") ||
      t.includes("cómo funciona")
    ) {
      return "FORMACION";
    }

    return "CODIR";
  }

  const autoDetected = detectMode(message);
  const resolvedMode =
    String(mode).toUpperCase() === "AUTO" ? autoDetected : String(mode).toUpperCase();

  const modePrompts = {
    CODIR:
      "MODO CODIR: eres co-director. Tomas control del proceso. Si falta información, haces supuestos razonables y avanzas en paralelo. No bloqueas el flujo.",
    CFO:
      "MODO CFO: actúas como CFO. Modela el peor escenario realista para 30 días. Asume 0 ingresos. Responde con supuestos, costes y una decisión final clara.",
    CTO:
      "MODO CTO: define el MVP mínimo para obtener señal real.",
    CMO:
      "MODO CMO: elige foco de adquisición, un canal y una métrica clara.",
    SCRAPPING:
      "MODO SCRAPPING: construye listas sniper de decisores only.",
    COPYWRITER:
      "MODO COPYWRITER: escribe para provocar respuesta real.",
    PM:
      "MODO PM: organiza ejecución, entregables y secuencia.",
    FORMACION:
      "MODO FORMACION: enseña solo lo mínimo necesario para ejecutar ahora.",
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
