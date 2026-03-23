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

  const systemMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
  ];

  if (onboardingState) {
    systemMessages.push({
      role: "system",
      content:
        ONBOARDING_PROMPTS[onboardingState] || ONBOARDING_PROMPTS.WELCOME,
    });
  } else {
    systemMessages.push({
      role: "system",
      content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR,
    });

    systemMessages.push({
      role: "system",
      content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA,
    });
  }

  const inputMessages = [
    ...systemMessages,
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

    let finalText;
    let finalMeta;

    if (onboardingState === "WELCOME") {
      if (language === "es") {
        finalText =
          "¡Hola! Soy BRKR, tu aliado para tomar decisiones de negocio y avanzar con tus ideas.\n\n" +
          "Si no sabes cómo empezar, elige una opción:\n" +
          "1) Tengo una idea y quiero validarla\n" +
          "2) Tengo algo y quiero simplificarlo o venderlo\n" +
          "3) No sé por dónde empezar\n\n" +
          "Responde con 1, 2 o 3.";
      } else if (language === "fr") {
        finalText =
          "Salut ! Je suis BRKR, ton allié pour prendre des décisions business et faire avancer tes idées.\n\n" +
          "Si tu ne sais pas par où commencer, choisis une option :\n" +
          "1) J’ai une idée et je veux la valider\n" +
          "2) J’ai quelque chose et je veux le simplifier ou le vendre\n" +
          "3) Je ne sais pas par où commencer\n\n" +
          "Réponds avec 1, 2 ou 3.";
      } else {
        finalText =
          "Hi! I'm BRKR, your ally to make business decisions and move your ideas forward.\n\n" +
          "If you're not sure how to start, choose an option:\n" +
          "1) I have an idea and want to validate it\n" +
          "2) I have something and want to simplify or sell it\n" +
          "3) I don't know where to start\n\n" +
          "Reply with 1, 2 or 3.";
      }

      finalMeta = null;
    } else if (onboardingState === "CONFUSION") {
      if (language === "es") {
        finalText =
          "Perfecto. Vamos simple.\n\n" +
          "BRKR te ayuda a decidir qué hacer con tu idea o tu negocio.\n\n" +
          "¿Cuál de estas situaciones te describe mejor?\n" +
          "A) Tengo una idea\n" +
          "B) Ya tengo algo en marcha\n" +
          "C) Estoy bloqueado y no sé qué hacer\n\n" +
          "Responde solo con A, B o C.";
      } else if (language === "fr") {
        finalText =
          "D'accord. On va faire simple.\n\n" +
          "BRKR t’aide à décider quoi faire avec ton idée ou ton business.\n\n" +
          "Laquelle de ces situations te décrit le mieux ?\n" +
          "A) J’ai une idée\n" +
          "B) J’ai déjà quelque chose en cours\n" +
          "C) Je suis bloqué et je ne sais pas quoi faire\n\n" +
          "Réponds seulement avec A, B ou C.";
      } else {
        finalText =
          "Alright, let's keep it simple.\n\n" +
          "BRKR helps you decide what to do with your idea or business.\n\n" +
          "Which of these situations fits you best?\n" +
          "A) I have an idea\n" +
          "B) I already have something in progress\n" +
          "C) I'm stuck and don't know what to do\n\n" +
          "Reply with A, B or C only.";
      }

      finalMeta = null;
    } else {
      finalText = applyModeEnforcement(text, resolvedMode, message);
      finalMeta = {
        stage_requested: normalizedStageInput,
        stage_used: normalizedStage,
        mode_requested: safeRequestedMode,
        mode_used: resolvedMode,
        language_used: language,
        onboarding_state: null,
      };
    }

    return res.status(200).json({
      reply: finalText,
      meta: finalMeta,
    });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
