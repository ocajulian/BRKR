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
  normalizeText,
} from "../lib/brkr-mode-detection.js";
import { applyModeEnforcement } from "../lib/brkr-mode-enforcement.js";

function sanitizeHistory(history) {
  return Array.isArray(history)
    ? history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
        )
        .slice(-20)
        .map((m) => ({
          role: m.role,
          content: m.content,
          meta: m.meta || null,
        }))
    : [];
}

function getConversationState(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (
      msg.role === "assistant" &&
      msg.meta &&
      typeof msg.meta.conversation_state === "string"
    ) {
      return msg.meta.conversation_state;
    }
  }
  return "INIT";
}

function normalizeChoice(value) {
  return String(value || "").trim().toUpperCase();
}

function buildMeta({
  conversationState,
  stageUsed = null,
  modeUsed = null,
  languageUsed = "en",
  showContext = true,
  onboardingState = null,
}) {
  return {
    conversation_state: conversationState,
    stage_used: stageUsed,
    mode_used: modeUsed,
    language_used: languageUsed,
    show_context: showContext,
    onboarding_state: onboardingState,
  };
}

function buildWelcomePrompt(language, type = "WELCOME") {
  if (language === "es") {
    if (type === "CONFUSION") {
      return (
        "Perfecto. Vamos simple.\n\n" +
        "BRKR te ayuda a decidir qué hacer con tu idea o tu negocio.\n\n" +
        "¿Cuál de estas situaciones te describe mejor?\n" +
        "A) Tengo una idea\n" +
        "B) Ya tengo algo en marcha\n" +
        "C) Estoy bloqueado y no sé qué hacer\n\n" +
        "Responde solo con A, B o C."
      );
    }

    return (
      "¡Hola! Soy BRKR, tu aliado para tomar decisiones de negocio y avanzar con tus ideas.\n\n" +
      "Si no sabes cómo empezar, elige una opción:\n" +
      "1) Tengo una idea y quiero validarla\n" +
      "2) Tengo algo y quiero simplificarlo o venderlo\n" +
      "3) No sé por dónde empezar\n\n" +
      "Responde con 1, 2 o 3."
    );
  }

  if (language === "fr") {
    if (type === "CONFUSION") {
      return (
        "D'accord. On va faire simple.\n\n" +
        "BRKR t’aide à décider quoi faire avec ton idée ou ton business.\n\n" +
        "Laquelle de ces situations te décrit le mieux ?\n" +
        "A) J’ai une idée\n" +
        "B) J’ai déjà quelque chose en cours\n" +
        "C) Je suis bloqué et je ne sais pas quoi faire\n\n" +
        "Réponds seulement avec A, B ou C."
      );
    }

    return (
      "Salut ! Je suis BRKR, ton allié pour prendre des décisions business et faire avancer tes idées.\n\n" +
      "Si tu ne sais pas par où commencer, choisis une option :\n" +
      "1) J’ai une idée et je veux la valider\n" +
      "2) J’ai quelque chose et je veux le simplifier ou le vendre\n" +
      "3) Je ne sais pas par où commencer\n\n" +
      "Réponds avec 1, 2 ou 3."
    );
  }

  if (type === "CONFUSION") {
    return (
      "Alright, let's keep it simple.\n\n" +
      "BRKR helps you decide what to do with your idea or business.\n\n" +
      "Which of these situations fits you best?\n" +
      "A) I have an idea\n" +
      "B) I already have something in progress\n" +
      "C) I'm stuck and don't know what to do\n\n" +
      "Reply with A, B or C only."
    );
  }

  return (
    "Hi! I'm BRKR, your ally to make business decisions and move your ideas forward.\n\n" +
    "If you're not sure how to start, choose an option:\n" +
    "1) I have an idea and want to validate it\n" +
    "2) I have something and want to simplify or sell it\n" +
    "3) I don't know where to start\n\n" +
    "Reply with 1, 2 or 3."
  );
}

function buildReentryPrompt(language, state) {
  if (language === "es") {
    if (state === "IDEA_CAPTURE" || state === "IDEA_EXECUTION") {
      return "Ya estamos dentro. Dime en una sola frase qué quieres vender, para quién y qué problema resuelve.";
    }
    if (state === "OFFER_CAPTURE" || state === "OFFER_EXECUTION") {
      return "Ya estamos dentro. Dime qué vendes, a quién y qué quieres mejorar ahora mismo.";
    }
    if (state === "BLOCKED_DIAGNOSIS") {
      return "Ya estamos dentro. Responde con 1, 2 o 3: 1) no sé qué idea elegir 2) no sé a quién vender 3) no sé cuál debería ser mi siguiente paso.";
    }
    return "Ya estamos dentro. Dime directamente qué necesitas.";
  }

  if (language === "fr") {
    if (state === "IDEA_CAPTURE" || state === "IDEA_EXECUTION") {
      return "On est déjà dedans. Dis-moi en une phrase ce que tu veux vendre, pour qui, et quel problème tu résous.";
    }
    if (state === "OFFER_CAPTURE" || state === "OFFER_EXECUTION") {
      return "On est déjà dedans. Dis-moi ce que tu vends, à qui, et ce que tu veux améliorer maintenant.";
    }
    if (state === "BLOCKED_DIAGNOSIS") {
      return "On est déjà dedans. Réponds avec 1, 2 ou 3 : 1) je ne sais pas quelle idée choisir 2) je ne sais pas à qui vendre 3) je ne sais pas quelle doit être ma prochaine étape.";
    }
    return "On est déjà dedans. Dis-moi directement ce dont tu as besoin.";
  }

  if (state === "IDEA_CAPTURE" || state === "IDEA_EXECUTION") {
    return "We're already inside. Tell me in one sentence what you want to sell, who it's for, and what problem it solves.";
  }
  if (state === "OFFER_CAPTURE" || state === "OFFER_EXECUTION") {
    return "We're already inside. Tell me what you sell, who you sell it to, and what you want to improve right now.";
  }
  if (state === "BLOCKED_DIAGNOSIS") {
    return "We're already inside. Reply with 1, 2 or 3: 1) I don't know which idea to choose 2) I don't know who to sell to 3) I don't know what my next step should be.";
  }
  return "We're already inside. Tell me directly what you need.";
}

function buildSelectionResponse(choice, language) {
  const c = normalizeChoice(choice);

  if (language === "es") {
    if (c === "1" || c === "A") {
      return {
        reply:
          "Perfecto.\n\n" +
          "Vamos a aterrizar tu idea.\n\n" +
          "Escríbeme en una frase:\n" +
          "qué quieres vender, para quién y qué problema resuelve.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_IDEA",
        }),
      };
    }

    if (c === "2" || c === "B") {
      return {
        reply:
          "Perfecto.\n\n" +
          "Vamos a simplificar lo que ya tienes.\n\n" +
          "Dime:\n" +
          "1) qué vendes\n" +
          "2) a quién\n" +
          "3) qué falla",
        meta: buildMeta({
          conversationState: "OFFER_CAPTURE",
          stageUsed: "OFERTA",
          modeUsed: "OFFER",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_OFFER",
        }),
      };
    }

    if (c === "3" || c === "C") {
      return {
        reply:
          "Perfecto.\n\n" +
          "Vamos a ubicar el bloqueo.\n\n" +
          "Responde con una sola opción:\n" +
          "1) no sé qué idea elegir\n" +
          "2) no sé a quién vender\n" +
          "3) no sé cuál debería ser mi siguiente paso",
        meta: buildMeta({
          conversationState: "BLOCKED_DIAGNOSIS",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_BLOCKED",
        }),
      };
    }
  }

  if (language === "fr") {
    if (c === "1" || c === "A") {
      return {
        reply:
          "Parfait.\n\n" +
          "On va clarifier ton idée.\n\n" +
          "Écris-moi en une phrase :\n" +
          "ce que tu veux vendre, pour qui, et quel problème tu résous.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_IDEA",
        }),
      };
    }

    if (c === "2" || c === "B") {
      return {
        reply:
          "Parfait.\n\n" +
          "On va simplifier ce que tu as déjà.\n\n" +
          "Dis-moi :\n" +
          "1) ce que tu vends\n" +
          "2) à qui\n" +
          "3) ce qui bloque",
        meta: buildMeta({
          conversationState: "OFFER_CAPTURE",
          stageUsed: "OFERTA",
          modeUsed: "OFFER",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_OFFER",
        }),
      };
    }

    if (c === "3" || c === "C") {
      return {
        reply:
          "Parfait.\n\n" +
          "On va situer le blocage.\n\n" +
          "Réponds avec une seule option :\n" +
          "1) je ne sais pas quelle idée choisir\n" +
          "2) je ne sais pas à qui vendre\n" +
          "3) je ne sais pas quelle doit être ma prochaine étape",
        meta: buildMeta({
          conversationState: "BLOCKED_DIAGNOSIS",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "SELECTION_BLOCKED",
        }),
      };
    }
  }

  if (c === "1" || c === "A") {
    return {
      reply:
        "Perfect.\n\n" +
        "Let's clarify your idea.\n\n" +
        "Write one sentence with:\n" +
        "what you want to sell, who it's for, and what problem it solves.",
      meta: buildMeta({
        conversationState: "IDEA_CAPTURE",
        stageUsed: "IDEA",
        modeUsed: "CODIR",
        languageUsed: language,
        showContext: true,
        onboardingState: "SELECTION_IDEA",
      }),
    };
  }

  if (c === "2" || c === "B") {
    return {
      reply:
        "Perfect.\n\n" +
        "Let's simplify what you already have.\n\n" +
        "Tell me:\n" +
        "1) what you sell\n" +
        "2) who you sell it to\n" +
        "3) what is not working",
      meta: buildMeta({
        conversationState: "OFFER_CAPTURE",
        stageUsed: "OFERTA",
        modeUsed: "OFFER",
        languageUsed: language,
        showContext: true,
        onboardingState: "SELECTION_OFFER",
      }),
    };
  }

  if (c === "3" || c === "C") {
    return {
      reply:
        "Perfect.\n\n" +
        "Let's locate the blockage.\n\n" +
        "Reply with one option:\n" +
        "1) I don't know which idea to choose\n" +
        "2) I don't know who to sell to\n" +
        "3) I don't know what my next step should be",
      meta: buildMeta({
        conversationState: "BLOCKED_DIAGNOSIS",
        stageUsed: "IDEA",
        modeUsed: "CODIR",
        languageUsed: language,
        showContext: true,
        onboardingState: "SELECTION_BLOCKED",
      }),
    };
  }

  return null;
}

function buildBlockedRoutingResponse(choice, language) {
  const c = normalizeChoice(choice);

  if (language === "es") {
    if (c === "1") {
      return {
        reply:
          "Bien.\n\n" +
          "Entonces el bloqueo está en elegir idea.\n\n" +
          "Escríbeme ahora 2 ideas máximas, en una línea cada una.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_IDEA",
        }),
      };
    }
    if (c === "2") {
      return {
        reply:
          "Bien.\n\n" +
          "Entonces el bloqueo está en el cliente.\n\n" +
          "Escríbeme qué quieres vender y a qué tipo de persona o empresa crees que podría servirle.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_CUSTOMER",
        }),
      };
    }
    if (c === "3") {
      return {
        reply:
          "Bien.\n\n" +
          "Entonces vamos a definir el siguiente paso.\n\n" +
          "Dime en una frase qué tienes hoy: idea, oferta, clientes o nada todavía.",
        meta: buildMeta({
          conversationState: "IDEA_EXECUTION",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_NEXT_STEP",
        }),
      };
    }
  }

  if (language === "fr") {
    if (c === "1") {
      return {
        reply:
          "Bien.\n\n" +
          "Donc le blocage est dans le choix de l’idée.\n\n" +
          "Écris-moi maintenant 2 idées maximum, une ligne chacune.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_IDEA",
        }),
      };
    }
    if (c === "2") {
      return {
        reply:
          "Bien.\n\n" +
          "Donc le blocage est dans le client.\n\n" +
          "Écris-moi ce que tu veux vendre et à quel type de personne ou d’entreprise cela pourrait servir.",
        meta: buildMeta({
          conversationState: "IDEA_CAPTURE",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_CUSTOMER",
        }),
      };
    }
    if (c === "3") {
      return {
        reply:
          "Bien.\n\n" +
          "Alors on va définir la prochaine étape.\n\n" +
          "Dis-moi en une phrase ce que tu as aujourd’hui : idée, offre, clients, ou rien encore.",
        meta: buildMeta({
          conversationState: "IDEA_EXECUTION",
          stageUsed: "IDEA",
          modeUsed: "CODIR",
          languageUsed: language,
          showContext: true,
          onboardingState: "BLOCKED_TO_NEXT_STEP",
        }),
      };
    }
  }

  if (c === "1") {
    return {
      reply:
        "Good.\n\n" +
        "So the blockage is choosing the idea.\n\n" +
        "Write up to 2 ideas now, one line each.",
      meta: buildMeta({
        conversationState: "IDEA_CAPTURE",
        stageUsed: "IDEA",
        modeUsed: "CODIR",
        languageUsed: language,
        showContext: true,
        onboardingState: "BLOCKED_TO_IDEA",
      }),
    };
  }
  if (c === "2") {
    return {
      reply:
        "Good.\n\n" +
        "So the blockage is the customer.\n\n" +
        "Write what you want to sell and what kind of person or company you think it could help.",
      meta: buildMeta({
        conversationState: "IDEA_CAPTURE",
        stageUsed: "IDEA",
        modeUsed: "CODIR",
        languageUsed: language,
        showContext: true,
        onboardingState: "BLOCKED_TO_CUSTOMER",
      }),
    };
  }
  if (c === "3") {
    return {
      reply:
        "Good.\n\n" +
        "Then let's define the next step.\n\n" +
        "Tell me in one sentence what you have today: idea, offer, clients, or nothing yet.",
      meta: buildMeta({
        conversationState: "IDEA_EXECUTION",
        stageUsed: "IDEA",
        modeUsed: "CODIR",
        languageUsed: language,
        showContext: true,
        onboardingState: "BLOCKED_TO_NEXT_STEP",
      }),
    };
  }

  return null;
}

function resolveStatePlan({
  currentState,
  normalizedStage,
  safeRequestedMode,
  message,
}) {
  if (currentState === "IDEA_CAPTURE") {
    return {
      systemStatePrompt:
        "ESTADO IDEA_CAPTURE: el usuario está definiendo idea, cliente y problema. Tu trabajo es clarificar sin saltar todavía a marketing ni construcción. Responde corto y estructurado. Formato obligatorio: 1) síntesis de la idea en una línea 2) hueco crítico que falta 3) siguiente paso concreto. No hagas más de una pregunta.",
      stageUsed: "IDEA",
      modeUsed: "CODIR",
      nextState: "IDEA_EXECUTION",
    };
  }

  if (currentState === "OFFER_CAPTURE") {
    return {
      systemStatePrompt:
        "ESTADO OFFER_CAPTURE: el usuario ya tiene algo y ahora hay que simplificarlo o hacerlo más vendible. Responde corto y estructurado. Formato obligatorio: 1) qué está vendiendo realmente 2) qué está roto o confuso 3) siguiente ajuste concreto. No abras brainstorming.",
      stageUsed: "OFERTA",
      modeUsed: "OFFER",
      nextState: "OFFER_EXECUTION",
    };
  }

  if (currentState === "IDEA_EXECUTION") {
    return {
      systemStatePrompt:
        "ESTADO IDEA_EXECUTION: ya hubo intake inicial. Ahora empuja decisión y siguiente acción real en etapa idea/validación. No reinicies onboarding. No repitas preguntas ya respondidas si puedes inferir lo razonable.",
      stageUsed: "IDEA",
      modeUsed: "CODIR",
      nextState: "IDEA_EXECUTION",
    };
  }

  if (currentState === "OFFER_EXECUTION") {
    return {
      systemStatePrompt:
        "ESTADO OFFER_EXECUTION: ya hubo intake inicial. Ahora simplifica, concreta y orienta a venta o validación de pago. No reinicies onboarding. No añadas extras innecesarios.",
      stageUsed: "OFERTA",
      modeUsed: "OFFER",
      nextState: "OFFER_EXECUTION",
    };
  }

  const fallbackMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({ message, stage: normalizedStage })
      : safeRequestedMode;

  const fallbackStage =
    fallbackMode === "OFFER" ? "OFERTA" : normalizedStage;

  return {
    systemStatePrompt:
      "ESTADO DIRECT_ENTRY: el usuario entró con contexto útil sin pasar por menú. No lo mandes a onboarding. Responde con decisión o siguiente paso real.",
    stageUsed: fallbackStage,
    modeUsed: fallbackMode,
    nextState: fallbackStage === "OFERTA" ? "OFFER_EXECUTION" : "IDEA_EXECUTION",
  };
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

  const sanitizedHistory = sanitizeHistory(history);
  const currentState = getConversationState(sanitizedHistory);
  const normalizedMessage = normalizeText(message);

  const normalizedStageInput = String(stage).toUpperCase();
  const normalizedStage = STAGE_ALIASES[normalizedStageInput] || "IDEA";

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode)
    ? requestedMode
    : "AUTO";

  const onboardingState = detectOnboardingState({
    message,
    history: sanitizedHistory,
  });

  const choice = normalizeChoice(message);

  if (currentState === "INIT") {
    if (choice === "1" || choice === "2" || choice === "3") {
      const selection = buildSelectionResponse(choice, language);
      if (selection) {
        return res.status(200).json(selection);
      }
    }

    if (choice === "A" || choice === "B" || choice === "C") {
      const selection = buildSelectionResponse(choice, language);
      if (selection) {
        return res.status(200).json(selection);
      }
    }

    const shouldShowWelcome =
      onboardingState === "WELCOME" ||
      onboardingState === "CONFUSION" ||
      normalizedMessage === "hola" ||
      normalizedMessage === "hello" ||
      normalizedMessage === "bonjour";

    if (shouldShowWelcome) {
      const promptType = onboardingState === "CONFUSION" ? "CONFUSION" : "WELCOME";
      return res.status(200).json({
        reply: buildWelcomePrompt(language, promptType),
        meta: buildMeta({
          conversationState: "INIT",
          stageUsed: null,
          modeUsed: null,
          languageUsed: language,
          showContext: false,
          onboardingState: promptType,
        }),
      });
    }
  }

  if (currentState === "BLOCKED_DIAGNOSIS") {
    if (choice === "1" || choice === "2" || choice === "3") {
      const routing = buildBlockedRoutingResponse(choice, language);
      if (routing) {
        return res.status(200).json(routing);
      }
    }
  }

  if (
    currentState !== "INIT" &&
    (onboardingState === "WELCOME" || onboardingState === "CONFUSION")
  ) {
    return res.status(200).json({
      reply: buildReentryPrompt(language, currentState),
      meta: buildMeta({
        conversationState: currentState,
        stageUsed: null,
        modeUsed: null,
        languageUsed: language,
        showContext: false,
        onboardingState: "REENTRY",
      }),
    });
  }

  const plan = resolveStatePlan({
    currentState,
    normalizedStage,
    safeRequestedMode,
    message,
  });

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: plan.systemStatePrompt },
    { role: "system", content: MODE_PROMPTS[plan.modeUsed] || MODE_PROMPTS.CODIR },
    { role: "system", content: STAGE_PROMPTS[plan.stageUsed] || STAGE_PROMPTS.IDEA },
    ...sanitizedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
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
        temperature: 0.2,
        max_output_tokens: 900,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(500).json({ reply: raw, meta: null });
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

    const finalText = applyModeEnforcement(text, plan.modeUsed, message);

    return res.status(200).json({
      reply: finalText,
      meta: buildMeta({
        conversationState: plan.nextState,
        stageUsed: plan.stageUsed,
        modeUsed: plan.modeUsed,
        languageUsed: language,
        showContext: true,
        onboardingState: null,
      }),
    });
  } catch (e) {
    return res.status(500).json({
      reply: String(e),
      meta: null,
    });
  }
}
