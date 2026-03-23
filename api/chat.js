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

/* =========================
   HELPERS
========================= */

function normalizeChoice(value) {
  return String(value || "").trim().toUpperCase();
}

function isWelcomeChoice(value) {
  const c = normalizeChoice(value);
  return c === "1" || c === "2" || c === "3";
}

function isConfusionChoice(value) {
  const c = normalizeChoice(value);
  return c === "A" || c === "B" || c === "C";
}

function getLastAssistantMessage(history) {
  const list = Array.isArray(history) ? [...history] : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m?.role === "assistant" && m.content) return m.content;
  }
  return "";
}

function hasCompletedOnboarding(history) {
  if (!Array.isArray(history)) return false;

  return history.some((msg) => {
    if (msg.role !== "assistant") return false;
    if (!msg.meta) return false;

    return (
      msg.meta.onboarding_state &&
      msg.meta.onboarding_state.startsWith("SELECTION")
    );
  });
}

/* =========================
   SELECTION DETECTION
========================= */

function detectSelectionState({ message, history }) {
  const choice = normalizeChoice(message);
  const last = getLastAssistantMessage(history).toLowerCase();

  const fromWelcome =
    last.includes("1, 2 o 3") ||
    last.includes("1, 2 or 3") ||
    last.includes("1, 2 ou 3");

  const fromConfusion =
    last.includes("a, b o c") ||
    last.includes("a, b or c") ||
    last.includes("a, b ou c");

  if (fromWelcome && isWelcomeChoice(choice)) {
    if (choice === "1") return "WELCOME_IDEA";
    if (choice === "2") return "WELCOME_OFFER";
    if (choice === "3") return "WELCOME_DIAGNOSIS";
  }

  if (fromConfusion && isConfusionChoice(choice)) {
    if (choice === "A") return "CONFUSION_IDEA";
    if (choice === "B") return "CONFUSION_EXISTING";
    if (choice === "C") return "CONFUSION_BLOCKED";
  }

  return null;
}

/* =========================
   SELECTION RESPONSES
========================= */

function buildSelectionResponse(state, language) {
  const lang = language === "es" || language === "fr" ? language : "en";

  const responses = {
    es: {
      WELCOME_IDEA: {
        text:
          "Perfecto.\n\n" +
          "Vamos a aterrizar tu idea.\n\n" +
          "Escríbeme en una frase:\n" +
          "qué quieres vender, para quién y qué problema resuelve.",
        meta: {
          stage_used: "IDEA",
          mode_used: "CODIR",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      WELCOME_OFFER: {
        text:
          "Perfecto.\n\n" +
          "Vamos a simplificar lo que ya tienes.\n\n" +
          "Dime:\n" +
          "1) qué vendes\n" +
          "2) a quién\n" +
          "3) qué falla",
        meta: {
          stage_used: "OFERTA",
          mode_used: "OFFER",
          onboarding_state: "SELECTION_OFFER",
        },
      },
      WELCOME_DIAGNOSIS: {
        text:
          "Perfecto.\n\n" +
          "Vamos a ubicarte.\n\n" +
          "1) idea sin cliente\n" +
          "2) cliente sin oferta\n" +
          "3) oferta sin ventas\n\n" +
          "Escribe 1, 2 o 3.",
        meta: {
          stage_used: "IDEA",
          mode_used: "CODIR",
          onboarding_state: "SELECTION_DIAGNOSIS",
        },
      },
      CONFUSION_IDEA: {
        text:
          "Bien.\n\n" +
          "Dime en una frase:\n" +
          "qué quieres hacer, para quién y qué problema ves.",
        meta: {
          stage_used: "IDEA",
          mode_used: "CODIR",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      CONFUSION_EXISTING: {
        text:
          "Bien.\n\n" +
          "Dime:\n" +
          "qué vendes, a quién y qué quieres mejorar.",
        meta: {
          stage_used: "OFERTA",
          mode_used: "OFFER",
          onboarding_state: "SELECTION_EXISTING",
        },
      },
      CONFUSION_BLOCKED: {
        text:
          "Perfecto.\n\n" +
          "1) no sé qué idea\n" +
          "2) no sé a quién vender\n" +
          "3) no sé qué hacer\n\n" +
          "Escribe 1, 2 o 3.",
        meta: {
          stage_used: "IDEA",
          mode_used: "CODIR",
          onboarding_state: "SELECTION_BLOCKED",
        },
      },
    },
  };

  return responses[lang]?.[state] || null;
}

/* =========================
   HANDLER
========================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const {
    message,
    stage = "IDEA",
    mode = "AUTO",
    history = [],
    language = "es",
  } = req.body || {};

  const apiKey = process.env.OPENAI_API_KEY;

  const normalizedStage =
    STAGE_ALIASES[String(stage).toUpperCase()] || "IDEA";

  const sanitizedHistory = Array.isArray(history)
    ? history.slice(-12)
    : [];

  const resolvedMode =
    mode === "AUTO"
      ? detectAutoMode({ message, stage: normalizedStage })
      : mode;

  const onboardingState = detectOnboardingState({
    message,
    history: sanitizedHistory,
  });

  const onboardingCompleted = hasCompletedOnboarding(sanitizedHistory);

  const selectionState = detectSelectionState({
    message,
    history: sanitizedHistory,
  });

  /* =========================
     PRIORITY 1: SELECTION
  ========================= */

  if (selectionState) {
    const response = buildSelectionResponse(selectionState, language);
    if (response) {
      return res.json({
        reply: response.text,
        meta: response.meta,
      });
    }
  }

  /* =========================
     PRIORITY 2: ONBOARDING (ONLY ONCE)
  ========================= */

  if (onboardingState && !onboardingCompleted) {
    return res.json({
      reply:
        "¡Hola! Soy BRKR, tu aliado para tomar decisiones de negocio.\n\n" +
        "Elige una opción:\n" +
        "1) Validar idea\n" +
        "2) Mejorar algo existente\n" +
        "3) No sé qué hacer\n\n" +
        "Responde con 1, 2 o 3.",
      meta: null,
    });
  }

  /* =========================
     NORMAL FLOW
  ========================= */

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: MODE_PROMPTS[resolvedMode] },
    { role: "system", content: STAGE_PROMPTS[normalizedStage] },
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
        model: "gpt-4o-mini",
        input: inputMessages,
        temperature: 0.25,
        max_output_tokens: 1200,
      }),
    });

    const data = await r.json();

    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "Error";

    return res.json({
      reply: applyModeEnforcement(text, resolvedMode, message),
      meta: {
        stage_used: normalizedStage,
        mode_used: resolvedMode,
      },
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
