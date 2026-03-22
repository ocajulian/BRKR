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

  function hasAny(text, terms) {
    return terms.some((term) => text.includes(term));
  }

  function isNegated(text, terms) {
    const openers = [
      "sin",
      "todavia no",
      "todavia sin",
      "no quiero",
      "no usar",
      "no meterme en",
      "no entrar en",
      "without",
      "not yet",
      "no ",
    ];

    for (const term of terms) {
      for (const opener of openers) {
        if (text.includes(`${opener} ${term}`)) return true;
      }
    }

    return false;
  }

  function detectAutoMode({ message, stage }) {
    const current = normalizeText(message);

    const cmoTerms = [
      "canal",
      "canales",
      "adquisicion",
      "audiencia",
      "marketing",
      "growth",
      "trafico",
      "campaign",
      "campana",
      "ads",
    ];

    const cmoNegated = isNegated(current, [
      "ads",
      "campaign",
      "campana",
      "marketing",
      "trafico",
    ]);

    // COPYWRITER
    if (
      current.includes("dm") ||
      current.includes("copy") ||
      current.includes("mensaje") ||
      current.includes("headline") ||
      current.includes("cta") ||
      current.includes("email") ||
      current.includes("landing") ||
      current.includes("hook") ||
      current.includes("reescribe") ||
      current.includes("escribeme") ||
      current.includes("escribeme un")
    ) {
      return "COPYWRITER";
    }

    // CFO
    if (
      current.includes("cost") ||
      current.includes("coste") ||
      current.includes("costes") ||
      current.includes("precio") ||
      current.includes("pricing") ||
      current.includes("cuanto cuesta") ||
      current.includes("cuanto me costaria") ||
      current.includes("cuanto me costaría")
    ) {
      return "CFO";
    }

    // OFFER
    if (
      current.includes("oferta") ||
      current.includes("offer") ||
      current.includes("propuesta") ||
      current.includes("promesa") ||
      current.includes("que vendo") ||
      current.includes("qué vendo") ||
      current.includes("como vender") ||
      current.includes("cómo vender")
    ) {
      return "OFFER";
    }

    // SCRAPPING
    if (
      current.includes("lead") ||
      current.includes("leads") ||
      current.includes("lista") ||
      current.includes("contactos") ||
      current.includes("decisores") ||
      current.includes("decision makers") ||
      current.includes("decision maker") ||
      current.includes("prospectos") ||
      current.includes("prospects") ||
      current.includes("base de datos de contactos")
    ) {
      return "SCRAPPING";
    }

    // CMO
    if (!cmoNegated && (stage === "ADS" || hasAny(current, cmoTerms))) {
      return "CMO";
    }

    // PM
    if (
      current.includes("plan") ||
      current.includes("roadmap") ||
      current.includes("timeline") ||
      current.includes("entregables") ||
      current.includes("orden de ejecucion") ||
      current.includes("orden de ejecución") ||
      current.includes("esta semana") ||
      current.includes("siguiente paso") ||
      current.includes("prioridades")
    ) {
      return "PM";
    }

    // CTO
    if (
      current.includes("mvp") ||
      current.includes("build") ||
      current.includes("crear") ||
      current.includes("app") ||
      current.includes("plataforma") ||
      current.includes("software") ||
      current.includes("producto") ||
      current.includes("servicio")
    ) {
      return "CTO";
    }

    // FORMACION
    if (
      current.includes("explica") ||
      current.includes("teach") ||
      current.includes("como funciona") ||
      current.includes("cómo funciona") ||
      current.includes("que significa") ||
      current.includes("qué significa") ||
      current.includes("aprender") ||
      current.includes("ensename") ||
      current.includes("enséñame")
    ) {
      return "FORMACION";
    }

    return "CODIR";
  }

  const requestedMode = String(mode || "AUTO").toUpperCase();
  const safeRequestedMode = VALID_MODES.has(requestedMode) ? requestedMode : "AUTO";

  const resolvedMode =
    safeRequestedMode === "AUTO"
      ? detectAutoMode({ message, stage: normalizedStage })
      : safeRequestedMode;

  const inputMessages = [
    { role: "system", content: MASTER_PROMPT },
    { role: "system", content: getLanguagePrompt(language) },
    { role: "system", content: MODE_PROMPTS[resolvedMode] || MODE_PROMPTS.CODIR },
    { role: "system", content: STAGE_PROMPTS[normalizedStage] || STAGE_PROMPTS.IDEA },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  function forceCodir(text, mode) {
    if (mode !== "CODIR") return text;

    return `1) Decisión: vamos a asumir que estás resolviendo un problema concreto para un tipo de cliente específico.

2) Acción: escribe ahora un mensaje corto para contactar a 3 potenciales clientes y validar si ese problema les importa.`;
  }

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

  function forceOffer(text, mode) {
    if (mode !== "OFFER") return text;

    return `1) Problema
Define un problema específico y urgente.

2) Cliente
Define un único tipo de cliente claro.

3) Promesa
Define un resultado concreto que ofreces.

4) Precio
Define un único precio claro.

5) Canal
Elige un canal directo para ofrecerlo.

6) Acción
Escribe el mensaje y envíalo hoy a 5 personas.`;
  }

  function forceCopywriter(text, mode, originalMessage) {
    if (mode !== "COPYWRITER") return text;

    const current = normalizeText(originalMessage);

    if (current.includes("dm")) {
      return `Hola [Nombre], estoy validando una propuesta para [tipo de cliente] que busca [resultado concreto]. No es una venta cerrada todavía: quiero comprobar si este problema te interesa de verdad. Si te encaja, te explico cómo lo plantearía en 2 líneas.`;
    }

    if (current.includes("email")) {
      return `Asunto: pregunta rápida sobre [problema]

Hola [Nombre],

Estoy validando una propuesta para ayudar a [tipo de cliente] a conseguir [resultado concreto] sin [fricción principal].

No te escribo para venderte algo cerrado todavía. Solo quiero saber si este problema es prioritario para ti ahora mismo.

Si lo es, te envío la propuesta resumida en un mensaje.

Un saludo,
[Tu nombre]`;
    }

    if (current.includes("landing")) {
      return `Hook:
Consigue [resultado concreto] sin [fricción principal].

Contexto:
Una propuesta simple para [tipo de cliente] que necesita resolver [problema específico] sin perder tiempo en soluciones complejas.

Propuesta:
Te ayudamos a conseguir [resultado] con un enfoque directo, mínimo y accionable.

CTA:
Quiero ver la propuesta`;
    }

    return `Hook:
[Resultado concreto] sin [fricción principal].

Contexto:
Esto es para [tipo de cliente] que necesita resolver [problema específico] sin complicarse.

Propuesta:
Una solución simple, directa y enfocada en conseguir [resultado].

CTA:
¿Te interesa que te lo envíe?`;
  }

  function forceCmo(text, mode, originalMessage) {
    if (mode !== "CMO") return text;

    const current = normalizeText(originalMessage);

    let channel = "outreach directo";
    let objective = "conseguir conversaciones reales con potenciales clientes";
    let metric = "numero de respuestas";
    let action = "envia hoy 10 mensajes directos al perfil de cliente mas obvio";

    if (
      current.includes("linkedin") ||
      current.includes("b2b") ||
      current.includes("consultoria") ||
      current.includes("consultoría") ||
      current.includes("servicio")
    ) {
      channel = "LinkedIn o email directo";
      objective = "abrir conversaciones con decisores";
      metric = "respuestas positivas";
      action = "haz hoy una lista de 10 decisores y enviales un mensaje corto";
    } else if (
      current.includes("instagram") ||
      current.includes("tiktok") ||
      current.includes("consumer") ||
      current.includes("comunidad")
    ) {
      channel = "DM directo a usuarios potenciales";
      objective = "validar interes real antes de hacer contenido o ads";
      metric = "respuestas utiles";
      action = "escribe hoy 10 mensajes cortos a personas que encajen con el perfil";
    } else if (
      current.includes("ads") ||
      current.includes("campana") ||
      current.includes("campaña")
    ) {
      channel = "1 campaña simple en un solo canal";
      objective = "medir si el mensaje genera interes";
      metric = "CTR o respuestas";
      action = "lanza una sola pieza creativa con una sola promesa y mide solo una metrica";
    }

    return `1) Canal principal
${channel}

2) Objetivo
${objective}

3) Métrica única
${metric}

4) Acción
${action}`;
  }

  function forcePm(text, mode, originalMessage) {
    if (mode !== "PM") return text;

    const current = normalizeText(originalMessage);

    let weeklyGoal = "cerrar una validacion simple sin dispersarte";

    if (current.includes("esta semana") || current.includes("entregables")) {
      weeklyGoal = "terminar la semana con un output concreto y verificable";
    }

    return `1) Objetivo semanal
${weeklyGoal}

2) Entregables
- 1 entregable principal cerrado
- 1 material de soporte minimo
- 1 test o envio real hecho

3) Orden de ejecución
- cerrar el entregable principal
- preparar el soporte minimo
- ejecutar el test o envio real

4) Acción
define ahora el entregable unico que debe quedar cerrado esta semana`;
  }

  function forceScrapping(text, mode) {
    if (mode !== "SCRAPPING") return text;

    return `1) Perfil objetivo
Define el tipo exacto de decisor o contacto que necesitas.

2) Criterios de selección
- empresa o proyecto dentro del nicho correcto
- rol con capacidad real de decision
- presencia publica verificable

3) Campos a capturar
- nombre
- empresa
- cargo
- linkedin o web
- email o via de contacto

4) Acción
elige un nicho concreto y prepara una lista inicial de 10 contactos verificables`;
  }

  function forceFormacion(text, mode) {
    if (mode !== "FORMACION") return text;

    return `1) Concepto mínimo
Explica la idea en una sola definición corta y práctica.

2) Ejemplo simple
Da un ejemplo básico que ayude a entenderlo sin teoría larga.

3) Acción
Haz ahora una tarea pequeña para aplicar el concepto inmediatamente.`;
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
    finalText = forceOffer(finalText, resolvedMode);
    finalText = forceCopywriter(finalText, resolvedMode, message);
    finalText = forceCmo(finalText, resolvedMode, message);
    finalText = forcePm(finalText, resolvedMode, message);
    finalText = forceScrapping(finalText, resolvedMode);
    finalText = forceFormacion(finalText, resolvedMode);

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
