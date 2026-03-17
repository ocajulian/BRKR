export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const {
    message,
    stage = "IDEA",
    mode = "AUTO",
    history = [],
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
    "Eres BRKR. IA de ejecución business. Directo, claro y accionable. Siempre cierras con una acción, decisión o pregunta que desbloquee avance.";

  const normalizedStage = String(stage).toUpperCase();

  const stagePrompts = {
    IDEA:
      "ETAPA IDEA: define problema, ICP y por qué ahora. No avances sin claridad. Si el usuario es vago, frénalo y exige precisión.",
    VALIDACION:
      "ETAPA VALIDACION: busca evidencia real. No aceptes intuiciones como prueba. Prioriza señal antes que entusiasmo.",
    OFERTA:
      "ETAPA OFERTA: define qué se vende, para quién, precio o rango, mecanismo y promesa concreta.",
    ADS:
      "ETAPA ADS: crea mensajes de adquisición o validación. Elige un ángulo claro y una métrica simple.",
  };

  function detectMode(text) {
    const t = String(text || "").toLowerCase();

    if (
      t.includes("coste") ||
      t.includes("costos") ||
      t.includes("coste") ||
      t.includes("precio") ||
      t.includes("margen") ||
      t.includes("runway") ||
      t.includes("flujo de caja") ||
      t.includes("cashflow") ||
      t.includes("presupuesto")
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
      t.includes("lead list") ||
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
      t.includes("cliente") ||
      t.includes("plan de ejecución")
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

  const resolvedMode =
    String(mode).toUpperCase() === "AUTO"
      ? detectMode(message)
      : String(mode).toUpperCase();

  const modePrompts = {
    CODIR:
      "MODO CODIR: eres co-director. Tomas control, reduces ambigüedad, fuerzas foco y siguiente paso real. Si el usuario ya respondió algo, no repitas la misma pregunta. Resume lo ya definido y empuja el siguiente cuello de botella.",
    CFO:
      "MODO CFO: actúas como CFO. Modela el peor escenario realista para 30 días. Asume 0 ingresos. No expliques teoría. No uses placeholders. No inventes equipos grandes ni costes enterprise sin motivo. Da rangos razonables para un emprendedor solo o equipo pequeño. Siempre responde con: 1) supuestos, 2) coste MVP mínimo, 3) coste adquisición/test, 4) coste herramientas, 5) coste tiempo del fundador, 6) total 30 días, 7) decisión final obligatoria: elige SOLO una opción (GO, ITERAR o STOP). No listes opciones. No expliques las tres. Toma una decisión clara basada en el escenario.
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

  const stagePrompt = stagePrompts[normalizedStage] || stagePrompts.IDEA;
  const modePrompt = modePrompts[resolvedMode] || modePrompts.CODIR;

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

  const inputMessages = [
    { role: "system", content: masterPrompt },
    { role: "system", content: stagePrompt },
    { role: "system", content: modePrompt },
    ...sanitizedHistory,
  ];

  try {
    console.log("BRKR request:", {
      stage: normalizedStage,
      mode: resolvedMode,
      historyCount: sanitizedHistory.length,
    });

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
      console.error("OpenAI error:", raw);
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
        stage: normalizedStage,
        mode: resolvedMode,
      },
    });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ reply: String(e) });
  }
}
