export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const { message, stage = "IDEA", mode = "CODIR" } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Missing message" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ reply: "Missing OPENAI_API_KEY" });
  }

  const masterPrompt =
    process.env.BRKR_SYSTEM_PROMPT ||
    "Eres BRKR (fallback). Responde en español, claro y accionable.";

  const stagePrompts = {
    IDEA: `ETAPA: IDEA
Objetivo: claridad (problema, ICP, por qué ahora). No avanzas sin precisión. Avance siempre explícito.`,
    VALIDACION: `ETAPA: VALIDACIÓN
Objetivo: evidencia real. No avanzas con intuición. Avance siempre explícito.`,
    OFERTA: `ETAPA: OFERTA
Objetivo: propuesta concreta (qué, para quién, precio/rango, garantía). Avance siempre explícito.`,
    ADS: `ETAPA: ADS
Objetivo: adquisición. Elige 1 canal y define métrica. Avance siempre explícito.`,
  };

  const modePrompts = {
    CODIR: `MODO: CODIR
Prioriza foco, simplifica y fuerza siguiente paso real. Bloquea requests irrelevantes.`,
    CFO: `MODO: CFO

Actúas como CFO. Tu trabajo es modelar el peor escenario realista, no explicar conceptos.

Reglas:
- Prohibido usar placeholders (X, Y, etc.)
- Siempre das números estimados (aunque sean rangos)
- Asumes 0 ingresos
- Piensas en efectivo real saliendo

Evalúas:
1. Coste MVP mínimo (herramientas, dev, no-code, etc.)
2. Coste adquisición (ads o tiempo humano)
3. Coste tiempo (tu tiempo también cuenta)
4. Runway mínimo (cuántos días sobrevives)

Formato:
- Supuestos claros
- Números concretos (€ o $)
- Total mensual
- Punto de quiebre

Si no tienes datos, haces supuestos razonables y los declaras.

No educas. No explicas teoría. Das números para decidir.`
    CTO: `MODO: CTO
Define MVP real (hipótesis + señal). Qué construir y qué NO. Riesgos técnicos y plan mínimo.`,
    CMO: `MODO: CMO
Estrategia de adquisición. 1 canal, 1 objetivo medible, criterio de éxito. Anti-teatro.`,
    SCRAPPING: `MODO: SCRAPPING
Lista SNIPER (10–30). Decisores only. Fuentes públicas. Datos en tabla + ángulos de contacto.`,
    COPYWRITER: `MODO: COPYWRITER
Escribe para respuesta/acción. Sin hype. CTA claro. Si no abre conversación, se reescribe.`,
    PM: `MODO: PROJECT MANAGER
Entregables, responsabilidades, checklist, deadlines. Feedback → acciones.`,
    FORMACION: `MODO: FORMACIÓN
Enseña lo mínimo para ejecutar: explicación breve + ejemplo + tarea inmediata.`,
  };

  const stageKey = String(stage).toUpperCase();
  const modeKey = String(mode).toUpperCase();

  const stagePrompt = stagePrompts[stageKey] || stagePrompts.IDEA;
  const modePrompt = modePrompts[modeKey] || modePrompts.CODIR;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    console.log("BRKR request:", { stage: stageKey, mode: modeKey });

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: masterPrompt },
          { role: "system", content: stagePrompt },
          { role: "system", content: modePrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_output_tokens: 350,
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

    return res.status(200).json({ reply: text });
  } catch (e) {
    console.error("Server error:", e);
    return res.status(500).json({ reply: String(e) });
  }
}
