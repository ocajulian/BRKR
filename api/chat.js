import {
  MASTER_PROMPT,
  STAGE_ALIASES,
  STAGE_PROMPTS,
  MODE_PROMPTS,
  VALID_MODES,
  getLanguagePrompt,
} from "../lib/brkr-prompts.js";

import {
  detectAutoMode,
  detectOnboardingState,
} from "../lib/brkr-mode-detection.js";

import { applyModeEnforcement } from "../lib/brkr-mode-enforcement.js";

/* =========================
   STATE MACHINE
========================= */

function getStateFromHistory(history) {
  if (!Array.isArray(history)) return "INIT";

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && m.meta?.conversation_state) {
      return m.meta.conversation_state;
    }
  }

  return "INIT";
}

/* =========================
   HELPERS
========================= */

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function isChoice(value, list) {
  return list.includes(normalize(value));
}

/* =========================
   STATE TRANSITIONS
========================= */

function handleStateTransition({ message, state }) {
  const input = normalize(message);

  if (state === "INIT") {
    if (["1"].includes(input)) {
      return { next: "IDEA_CLARIFICATION" };
    }
    if (["2"].includes(input)) {
      return { next: "OFFER_CLARIFICATION" };
    }
    if (["3"].includes(input)) {
      return { next: "DIAGNOSIS" };
    }
  }

  if (state === "DIAGNOSIS") {
    if (["1", "A"].includes(input)) {
      return { next: "IDEA_CLARIFICATION" };
    }
    if (["2", "B"].includes(input)) {
      return { next: "OFFER_CLARIFICATION" };
    }
    if (["3", "C"].includes(input)) {
      return { next: "DIAGNOSIS" };
    }
  }

  return null;
}

/* =========================
   STATE RESPONSES
========================= */

function buildStateResponse(state, language) {
  const lang = language === "fr" ? "fr" : language === "es" ? "es" : "en";

  const responses = {
    es: {
      INIT:
        "¡Hola! Soy BRKR.\n\n" +
        "Te ayudo a avanzar en tu negocio sin perder tiempo.\n\n" +
        "Elige una opción:\n" +
        "1) Tengo una idea\n" +
        "2) Ya tengo algo\n" +
        "3) Estoy bloqueado\n\n" +
        "Responde con 1, 2 o 3.",

      IDEA_CLARIFICATION:
        "Perfecto.\n\n" +
        "Dime en una frase:\n" +
        "qué quieres vender, para quién y qué problema resuelve.",

      OFFER_CLARIFICATION:
        "Perfecto.\n\n" +
        "Dime:\n" +
        "qué vendes, a quién y qué quieres mejorar.",

      DIAGNOSIS:
        "Vamos a ubicarte.\n\n" +
        "1) idea sin cliente\n" +
        "2) cliente sin oferta\n" +
        "3) oferta sin ventas\n\n" +
        "Responde 1, 2 o 3.",
    },
  };

  return responses[lang][state] || responses["es"][state];
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

  const currentState = getStateFromHistory(sanitizedHistory);

  const transition = handleStateTransition({
    message,
    state: currentState,
  });

  /* =========================
     STATE TRANSITION RESPONSE
  ========================= */

  if (transition) {
    const text = buildStateResponse(transition.next, language);

    return res.json({
      reply: text,
      meta: {
        conversation_state: transition.next,
        stage_used: transition.next.includes("OFFER") ? "OFERTA" : "IDEA",
        mode_used: transition.next.includes("OFFER") ? "OFFER" : "CODIR",
      },
    });
  }

  /* =========================
     INIT STATE (ONBOARDING ONCE)
  ========================= */

  if (currentState === "INIT") {
    return res.json({
      reply: buildStateResponse("INIT", language),
      meta: {
        conversation_state: "INIT",
      },
    });
  }

  /* =========================
     NORMAL AI FLOW (CONTROLLED)
  ========================= */

  const resolvedMode =
    mode === "AUTO"
      ? detectAutoMode({ message, stage: normalizedStage })
      : mode;

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
        conversation_state: currentState,
        stage_used: normalizedStage,
        mode_used: resolvedMode,
      },
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
