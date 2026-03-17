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
    "Eres BRKR. Responde claro, directo y accionable.";

  const stagePrompts = {
    IDEA: "ETAPA IDEA: define problema, ICP y por qué ahora.",
    VALIDACION: "ETAPA VALIDACION: busca evidencia real, no opiniones.",
    OFERTA: "ETAPA OFERTA: define propuesta concreta con precio.",
    ADS: "ETAPA ADS: elige un canal y métrica clara.",
  };

  const modePrompts = {
    CODIR: "MODO CODIR: fuerza claridad y siguiente paso real.",
    CFO: "MODO CFO: da números estimados, peor escenario, sin placeholders.",
    CTO: "MODO CTO: define MVP mínimo y qué NO construir.",
    CMO: "MODO CMO: elige canal y objetivo medible.",
    SCRAPPING: "MODO SCRAPPING: lista decisores y fuentes públicas.",
    COPYWRITER: "MODO COPYWRITER: escribe para acción con CTA claro.",
    PM: "MODO PM: define entregables y siguientes acciones.",
    FORMACION: "MODO FORMACION: explica mínimo y manda tarea.",
  };

  const stagePrompt = stagePrompts[stage] || stagePrompts.IDEA;
  const modePrompt = modePrompts[mode] || modePrompts.CODIR;

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: masterPrompt },
          { role: "system", content: stagePrompt },
          { role: "system", content: modePrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_output_tokens: 300,
      }),
    });

    const data = await r.json();

    const text =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .flatMap((o) => o.content || [])
            .map((c) => c.text)
            .filter(Boolean)
            .join("\n")
        : "") ||
      "No response.";

    return res.status(200).json({ reply: text });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
