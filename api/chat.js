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
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectAutoMode({ message }) {
    const current = normalizeText(message);

    // COPY
    if (current.includes("dm") || current.includes("copy") || current.includes("mensaje")) return "COPYWRITER";

    // CFO
    if (current.includes("cost") || current.includes("precio") || current.includes("cuanto cuesta")) return "CFO";

    // CTO (MEJORADO)
    if (
      current.includes("mvp") ||
      current.includes("build") ||
      current.includes("crear") ||
      current.includes("crear una app") ||
      current.includes("app") ||
      current.includes("plataforma") ||
      current.includes("software") ||
      current.includes("servicio") ||
      current.includes("producto")
    ) {
      return "CTO";
    }

    // SCRAPPING
    if (current.includes("lead") || current.includes("lista") || current.includes("contactos")) return "SCRAPPING";

    // PM
    if (current.includes("plan") || current.includes("roadmap") || current.includes("timeline")) return "PM";

    // FORMACION
    if (current.includes("explica") || current.includes("teach") || current.includes("como funciona")) return "FORMACION";

    // CMO
    if (current.includes("ads") || current.includes("campaign") || current.includes("trafico")) return "CMO";

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

  // ===== CODIR =====
  function forceCodir(text, mode) {
    if (mode !== "CODIR") return text;

    return `1) Decisión: vamos a asumir que estás resolviendo un problema concreto para un tipo de cliente específico.

2) Acción: escribe ahora un mensaje corto para contactar a 3 potenciales clientes y validar si ese problema les importa.`;
  }

  // ===== CFO =====
  function forceCfo(text, mode) {
    if (mode !== "CFO") return text;

    return `1) Supuestos
- Estás validando una idea simple
- Trabajas solo
- No hay ingresos en 30 días

2) Costes
- Herramientas: 20–50€
- Test adquisición: 100–200€

3) Total 30 días
→ 120€ – 300€

4) Decisión
ITERAR`;
  }

  // ===== CTO =====
  function forceCto(text, mode) {
    if (mode !== "CTO") return text;

    return `1) Objetivo del MVP
Validar si alguien está dispuesto a pagar por la solución.

2) Qué construir ahora
- 1 versión mínima del producto
- 1 forma simple de explicarlo
- 1 mecanismo de validación o pago

3) Qué NO construir
- funcionalidades extra
- automatizaciones
- branding complejo

4) Riesgo principal
Que no haya interés real

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
