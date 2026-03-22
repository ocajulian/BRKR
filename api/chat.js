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

  function detectBlockedDomains(text, domainTerms) {
    const negativeOpeners = [
      "sin",
      "todavia no",
      "no quiero",
      "no meterme en",
      "no entrar en",
      "sin meterme en",
      "without",
      "not yet",
      "i dont want",
      "i do not want",
    ];

    const blocked = new Set();

    for (const opener of negativeOpeners) {
      const openerIndex = text.indexOf(opener);
      if (openerIndex === -1) continue;

      const window = text.slice(openerIndex, openerIndex + 120);

      for (const [domain, terms] of Object.entries(domainTerms)) {
        if (terms.some((term) => window.includes(term))) {
          blocked.add(domain);
        }
      }
    }

    return blocked;
  }

  function detectAutoMode({ stage, message }) {
    const current = normalizeText(message);

    const cfoTerms = ["cost", "precio", "pricing", "budget"];
    const ctoTerms = ["mvp", "build", "construir", "stack"];
    const copywriterTerms = ["dm", "copy", "mensaje", "headline"];
    const scrappingTerms = ["lista", "leads", "decisores"];
    const pmTerms = ["plan", "timeline", "roadmap"];
    const trainingTerms = ["explica", "teach", "como funciona"];
    const cmoTerms = ["ads", "campaña", "trafico"];

    const blockedDomains = detectBlockedDomains(current, {
      CFO: ["cost", "precio", "pricing"],
      CTO: ["mvp", "build", "producto"],
      CMO: ["ads", "campaña"],
    });

    if (includesAny(current, copywriterTerms)) return "COPYWRITER";
    if (!blockedDomains.has("CFO") && includesAny(current, cfoTerms)) return "CFO";
    if (!blockedDomains.has("CTO") && includesAny(current, ctoTerms)) return "CTO";
    if (includesAny(current, scrappingTerms)) return "SCRAPPING";
    if (includesAny(current, pmTerms)) return "PM";
    if (includesAny(current, trainingTerms)) return "FORMACION";
    if (!blockedDomains.has("CMO") && includesAny(current, cmoTerms)) return "CMO";

    return "CODIR";
  }

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode) ? requestedMode : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({
          stage: normalizedStage,
          message,
        })
      : safeRequestedMode;

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR },
    { role: "system", content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA },
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
