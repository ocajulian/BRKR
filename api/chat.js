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

  function detectAutoMode({ message }) {
    const current = normalizeText(message);

    if (current.includes("dm") || current.includes("copy")) return "COPYWRITER";
    if (current.includes("cost") || current.includes("precio")) return "CFO";
    if (current.includes("mvp") || current.includes("build")) return "CTO";
    if (current.includes("lead") || current.includes("lista")) return "SCRAPPING";
    if (current.includes("plan") || current.includes("roadmap")) return "PM";
    if (current.includes("explica") || current.includes("teach")) return "FORMACION";
    if (current.includes("ads") || current.includes("campaign")) return "CMO";

    return "CODIR";
  }

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode) ? requestedMode : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({ message })
      : safeRequestedMode;

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR },
    { role: "system", content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  // ===== CODIR (GENERALISTA) =====
  function forceCodir(text, mode) {
    if (mode !== "CODIR") return text;

    return `1) Decisión: vamos a asumir que estás resolviendo un problema concreto para un tipo de cliente específico. No vamos a seguir en abstracto.

2) Acción: escribe ahora un mensaje corto para contactar a 3 potenciales clientes y validar si ese problema les importa.`;
  }

  // ===== CFO (GENERALISTA) =====
  function forceCfo(text, mode) {
    if (mode !== "CFO") return text;

    return `1) Supuestos
- Estás validando una idea simple
- Trabajas solo
- No hay ingresos en 30 días
- Objetivo: validar interés real

2) Costes
- Herramientas: 20–50€
- Test adquisición: 100–200€
- Otros: 0–50€

3) Total 30 días
→ 120€ – 300€

4) Decisión
ITERAR`;
  }

  // ===== CTO (GENERALISTA) =====
  function forceCto(text, mode) {
    if (mode !== "CTO") return text;

    return `1) Objetivo del MVP
Validar si alguien está dispuesto a pagar por la solución.

2) Qué construir ahora
- 1 versión mínima del producto
- 1 forma simple de explicarlo
- 1 mecanismo de pago o compromiso

3) Qué NO construir
- funcionalidades extra
- automatizaciones
- branding complejo
- múltiples versiones

4) Riesgo principal
Que no haya interés real → problema de demanda

5) Acción
Define en una frase qué vendes y envíalo hoy a 3 potenciales clientes`;
  }

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

    let finalText = forceCodir(text, resolvedMode);
    finalText = forceCfo(finalText, resolvedMode);
    finalText = forceCto(finalText, resolvedMode);

    return res.status(200).json({
      reply: finalText,
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
