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

function normalizeChoice(value) {
  return String(value || "").trim().toUpperCase();
}

function isWelcomeChoice(value) {
  const choice = normalizeChoice(value);
  return choice === "1" || choice === "2" || choice === "3";
}

function isConfusionChoice(value) {
  const choice = normalizeChoice(value);
  return choice === "A" || choice === "B" || choice === "C";
}

function getLastAssistantMessage(history) {
  const list = Array.isArray(history) ? [...history] : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (
      item &&
      item.role === "assistant" &&
      typeof item.content === "string" &&
      item.content.trim()
    ) {
      return item.content;
    }
  }
  return "";
}

function detectSelectionState({ message, history }) {
  const choice = normalizeChoice(message);
  const lastAssistant = getLastAssistantMessage(history);

  if (!choice || !lastAssistant) return null;

  const assistantLower = lastAssistant.toLowerCase();

  const cameFromWelcome =
    assistantLower.includes("responde con 1, 2 o 3") ||
    assistantLower.includes("reply with 1, 2 or 3") ||
    assistantLower.includes("réponds avec 1, 2 ou 3");

  const cameFromConfusion =
    assistantLower.includes("responde solo con a, b o c") ||
    assistantLower.includes("reply with a, b or c only") ||
    assistantLower.includes("réponds seulement avec a, b ou c");

  if (cameFromWelcome && isWelcomeChoice(choice)) {
    if (choice === "1") return "WELCOME_IDEA";
    if (choice === "2") return "WELCOME_OFFER";
    if (choice === "3") return "WELCOME_DIAGNOSIS";
  }

  if (cameFromConfusion && isConfusionChoice(choice)) {
    if (choice === "A") return "CONFUSION_IDEA";
    if (choice === "B") return "CONFUSION_EXISTING";
    if (choice === "C") return "CONFUSION_BLOCKED";
  }

  return null;
}

function buildSelectionResponse(selectionState, language) {
  const lang = language === "es" || language === "fr" ? language : "en";

  const responses = {
    es: {
      WELCOME_IDEA: {
        text:
          "Perfecto.\n\n" +
          "Vamos a aterrizar tu idea antes de validarla.\n\n" +
          "Respóndeme en una sola frase con esto:\n" +
          "qué quieres vender, para quién y qué problema resuelve.\n\n" +
          "Ejemplo:\n" +
          '"Quiero vender asesoría financiera a autónomos que no saben controlar su caja."',
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "es",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      WELCOME_OFFER: {
        text:
          "Perfecto.\n\n" +
          "Vamos a simplificar lo que ya tienes para volverlo más claro y vendible.\n\n" +
          "Respóndeme con estas 3 cosas:\n" +
          "1) qué vendes hoy\n" +
          "2) a quién se lo vendes\n" +
          "3) qué está fallando: claridad, conversión o precio.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "es",
          onboarding_state: "SELECTION_OFFER",
        },
      },
      WELCOME_DIAGNOSIS: {
        text:
          "Perfecto.\n\n" +
          "Vamos a ubicarte rápido.\n\n" +
          "Responde solo con una de estas opciones:\n" +
          "1) tengo idea pero no cliente\n" +
          "2) tengo cliente pero no oferta clara\n" +
          "3) tengo oferta pero no vendo\n\n" +
          "Escribe solo 1, 2 o 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "es",
          onboarding_state: "SELECTION_DIAGNOSIS",
        },
      },
      CONFUSION_IDEA: {
        text:
          "Bien.\n\n" +
          "Entonces estamos en punto idea.\n\n" +
          "Para ayudarte sin rodeos, escríbeme una sola frase con:\n" +
          "qué quieres hacer, para quién y qué problema ves.\n\n" +
          "Aunque esté incompleto, sirve.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "es",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      CONFUSION_EXISTING: {
        text:
          "Bien.\n\n" +
          "Entonces ya hay algo en marcha.\n\n" +
          "Dime solo esto:\n" +
          "qué vendes, a quién y qué quieres mejorar ahora mismo.\n\n" +
          "Ejemplo: oferta, claridad, ventas, precio o foco.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "es",
          onboarding_state: "SELECTION_EXISTING",
        },
      },
      CONFUSION_BLOCKED: {
        text:
          "Perfecto.\n\n" +
          "Vamos a desbloquearlo sin complicarlo.\n\n" +
          "Responde con la frase que más se parezca a tu situación:\n" +
          "1) no sé qué idea elegir\n" +
          "2) no sé a quién vender\n" +
          "3) no sé cuál debería ser mi siguiente paso\n\n" +
          "Escribe solo 1, 2 o 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "es",
          onboarding_state: "SELECTION_BLOCKED",
        },
      },
    },
    fr: {
      WELCOME_IDEA: {
        text:
          "Parfait.\n\n" +
          "On va clarifier ton idée avant de la valider.\n\n" +
          "Réponds en une seule phrase avec :\n" +
          "ce que tu veux vendre, pour qui, et quel problème tu résous.\n\n" +
          "Exemple :\n" +
          '"Je veux vendre du conseil financier à des indépendants qui ne maîtrisent pas leur trésorerie."',
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "fr",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      WELCOME_OFFER: {
        text:
          "Parfait.\n\n" +
          "On va simplifier ce que tu as déjà pour le rendre plus clair et plus vendable.\n\n" +
          "Réponds avec ces 3 éléments :\n" +
          "1) ce que tu vends aujourd’hui\n" +
          "2) à qui tu le vends\n" +
          "3) ce qui bloque : clarté, conversion ou prix.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "fr",
          onboarding_state: "SELECTION_OFFER",
        },
      },
      WELCOME_DIAGNOSIS: {
        text:
          "Parfait.\n\n" +
          "On va te situer rapidement.\n\n" +
          "Réponds seulement avec une de ces options :\n" +
          "1) j’ai une idée mais pas de client\n" +
          "2) j’ai un client mais pas d’offre claire\n" +
          "3) j’ai une offre mais je ne vends pas\n\n" +
          "Écris seulement 1, 2 ou 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "fr",
          onboarding_state: "SELECTION_DIAGNOSIS",
        },
      },
      CONFUSION_IDEA: {
        text:
          "Bien.\n\n" +
          "Donc on est au stade idée.\n\n" +
          "Pour t’aider simplement, écris une seule phrase avec :\n" +
          "ce que tu veux faire, pour qui, et quel problème tu vois.\n\n" +
          "Même incomplet, ça suffit.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "fr",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      CONFUSION_EXISTING: {
        text:
          "Bien.\n\n" +
          "Donc il y a déjà quelque chose en cours.\n\n" +
          "Dis-moi seulement :\n" +
          "ce que tu vends, à qui, et ce que tu veux améliorer maintenant.\n\n" +
          "Exemple : offre, clarté, ventes, prix ou focus.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "fr",
          onboarding_state: "SELECTION_EXISTING",
        },
      },
      CONFUSION_BLOCKED: {
        text:
          "Parfait.\n\n" +
          "On va débloquer ça sans compliquer.\n\n" +
          "Réponds avec la phrase qui ressemble le plus à ta situation :\n" +
          "1) je ne sais pas quelle idée choisir\n" +
          "2) je ne sais pas à qui vendre\n" +
          "3) je ne sais pas quelle doit être ma prochaine étape\n\n" +
          "Écris seulement 1, 2 ou 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "fr",
          onboarding_state: "SELECTION_BLOCKED",
        },
      },
    },
    en: {
      WELCOME_IDEA: {
        text:
          "Perfect.\n\n" +
          "Let's clarify your idea before trying to validate it.\n\n" +
          "Reply in one sentence with:\n" +
          "what you want to sell, who it's for, and what problem it solves.\n\n" +
          "Example:\n" +
          '"I want to sell financial coaching to freelancers who struggle to manage cash flow."',
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "en",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      WELCOME_OFFER: {
        text:
          "Perfect.\n\n" +
          "Let's simplify what you already have so it becomes clearer and easier to sell.\n\n" +
          "Reply with these 3 things:\n" +
          "1) what you sell today\n" +
          "2) who you sell it to\n" +
          "3) what's not working: clarity, conversion, or price.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "en",
          onboarding_state: "SELECTION_OFFER",
        },
      },
      WELCOME_DIAGNOSIS: {
        text:
          "Perfect.\n\n" +
          "Let's locate where you are quickly.\n\n" +
          "Reply with just one option:\n" +
          "1) I have an idea but no clear customer\n" +
          "2) I have a customer but no clear offer\n" +
          "3) I have an offer but I'm not selling\n\n" +
          "Write only 1, 2 or 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "en",
          onboarding_state: "SELECTION_DIAGNOSIS",
        },
      },
      CONFUSION_IDEA: {
        text:
          "Good.\n\n" +
          "Then we're at the idea stage.\n\n" +
          "To help without overcomplicating it, write one sentence with:\n" +
          "what you want to do, who it's for, and what problem you see.\n\n" +
          "Even if it's incomplete, that's enough.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "en",
          onboarding_state: "SELECTION_IDEA",
        },
      },
      CONFUSION_EXISTING: {
        text:
          "Good.\n\n" +
          "Then you already have something in motion.\n\n" +
          "Tell me only this:\n" +
          "what you sell, who you sell it to, and what you want to improve right now.\n\n" +
          "Example: offer, clarity, sales, price, or focus.",
        meta: {
          stage_requested: "OFERTA",
          stage_used: "OFERTA",
          mode_requested: "AUTO",
          mode_used: "OFFER",
          language_used: "en",
          onboarding_state: "SELECTION_EXISTING",
        },
      },
      CONFUSION_BLOCKED: {
        text:
          "Perfect.\n\n" +
          "Let's unblock it without making it complicated.\n\n" +
          "Reply with the sentence that fits your situation best:\n" +
          "1) I don't know which idea to choose\n" +
          "2) I don't know who to sell to\n" +
          "3) I don't know what my next step should be\n\n" +
          "Write only 1, 2 or 3.",
        meta: {
          stage_requested: "IDEA",
          stage_used: "IDEA",
          mode_requested: "AUTO",
          mode_used: "CODIR",
          language_used: "en",
          onboarding_state: "SELECTION_BLOCKED",
        },
      },
    },
  };

  return responses[lang][selectionState] || null;
}

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

  const selectionState = detectSelectionState({
    message,
    history: sanitizedHistory,
  });

  if (selectionState) {
    const selectionResponse = buildSelectionResponse(selectionState, language);

    if (selectionResponse) {
      return res.status(200).json({
        reply: selectionResponse.text,
        meta: selectionResponse.meta,
      });
    }
  }

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
