import {
  MASTER_PROMPT,
  STAGE_ALIASES,
  STAGE_PROMPTS,
  MODE_PROMPTS,
  ONBOARDING_PROMPTS,
  VALID_MODES,
  getLanguagePrompt,
} from "../lib/brkr-prompts.js";
import {
  detectAutoMode,
  detectOnboardingState,
} from "../lib/brkr-mode-detection.js";
import { applyModeEnforcement } from "../lib/brkr-mode-enforcement.js";

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

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode)
    ? requestedMode
    : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({ message, stage: normalizedStage })
      : safeRequestedMode;

  const onboardingState = detectOnboardingState({
    message,
    history: sanitizedHistory,
  });

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    ...(onboardingState
      ? [
          {
            role: "system",
            content:
              ONBOARDING_PROMPTS[onboardingState] ||
              ONBOARDING_PROMPTS.WELCOME,
          },
        ]
      : []),
    {
      role: "system",
      content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR,
    },
    {
      role: "system",
      content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA,
    },
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
        temperature: onboardingState ? 0.2 : 0.25,
        max_output_tokens: onboardingState ? 450 : 1200,
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

    const finalText = onboardingState
      ? text
      : applyModeEnforcement(text, resolvedMode, message);

    return res.status(200).json({
      reply: finalText,
      meta: {
        stage_requested: normalizedStageInput,
        stage_used: normalizedStage,
        mode_requested: safeRequestedMode,
        mode_used: resolvedMode,
        language_used: language,
        onboarding_state: onboardingState || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
