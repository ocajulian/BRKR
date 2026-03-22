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

  // ===== CODIR FIX =====
  function forceCodirIfWeak(text, mode) {
    if (mode !== "CODIR") return text;

    const lower = text.toLowerCase();

    const weakPatterns = [
      "define el problema",
      "define problema",
      "falta de claridad",
      "no está claro",
      "describe el problema",
      "identifica el problema",
      "quién es tu cliente",
      "define tu cliente",
    ];

    const isWeak = weakPatterns.some((p) => lower.includes(p));

    if (!isWeak) return text;

    return `1) Decisión: vamos a asumir que estás resolviendo un problema de captación de clientes para un nicho específico. No vamos a definir más teoría.

2) Acción: escribe ahora un mensaje corto para contactar a 3 potenciales clientes y validar interés.`;
  }

  // ===== CFO FIX =====
  function forceCfoStructure(text, mode) {
    if (mode !== "CFO") return text;

    const lower = text.toLowerCase();

    const hasDecision =
      lower.includes("go") ||
      lower.includes("iterar") ||
      lower.includes("stop");

    const hasSupuestos = lower.includes("supuesto");
    const hasTotal = lower.includes("total");

    const isWeak = !hasDecision || !hasSupuestos || !hasTotal;

    if (!isWeak) return text;

    return `1) Supuestos
- Estás validando una idea simple en solitario
- No hay ingresos durante 30 días
- Uso de herramientas básicas

2) Costes
- Herramientas: 20–50€
- Dominio / hosting: 10–20€
- Test adquisición (mínimo): 100–200€
- Tiempo del fundador: 0€

3) Total 30 días
→ 130€ – 270€

4) Decisión
ITERAR`;
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

    let finalText = forceCodirIfWeak(text, resolvedMode);
    finalText = forceCfoStructure(finalText, resolvedMode);

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
