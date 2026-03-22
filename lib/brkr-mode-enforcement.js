import { normalizeText } from "./brkr-mode-detection.js";

export function forceCodir(text, mode) {
  if (mode !== "CODIR") return text;

  return `1) Decisión: vamos a asumir que estás resolviendo un problema concreto para un tipo de cliente específico.

2) Acción: escribe ahora un mensaje corto para contactar a 3 potenciales clientes y validar si ese problema les importa.`;
}

export function forceCfo(text, mode) {
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

export function forceCto(text, mode) {
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

export function forceOffer(text, mode) {
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

export function forceCopywriter(text, mode, originalMessage) {
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

export function forceCmo(text, mode, originalMessage) {
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

export function forcePm(text, mode, originalMessage) {
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

export function forceScrapping(text, mode) {
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

export function forceFormacion(text, mode, originalMessage) {
  if (mode !== "FORMACION") return text;

  const lowerText = normalizeText(text);
  const question = normalizeText(originalMessage);

  const looksWeak =
    lowerText.includes("explica la idea en una sola definicion corta y practica") ||
    lowerText.includes("da un ejemplo basico que ayude a entenderlo sin teoria larga") ||
    lowerText.includes("haz ahora una tarea pequena para aplicar el concepto inmediatamente") ||
    lowerText.length < 80;

  if (!looksWeak) return text;

  if (question.includes("landing page") || question.includes("landing")) {
    return `1) Concepto mínimo
Una landing page es una página diseñada para que una persona haga una sola acción concreta, como dejar su email o pedir información.

2) Ejemplo simple
Si ofreces un servicio, la landing no explica toda tu empresa: solo muestra el problema, la promesa y un botón para contactar o apuntarse.

3) Acción
Abre un documento y escribe hoy los 3 bloques mínimos de tu landing: problema, promesa y botón.`;
  }

  if (question.includes("mvp")) {
    return `1) Concepto mínimo
Un MVP es la versión más pequeña de una solución que te permite comprobar si alguien realmente la quiere o pagaría por ella.

2) Ejemplo simple
Si quieres vender una app, el MVP no es la app completa: puede ser una página simple, una demo o una oferta mínima para ver si alguien muestra interés real.

3) Acción
Escribe ahora qué parte mínima de tu idea te permitiría validarla sin construir todo el producto.`;
  }

  return `1) Concepto mínimo
Es la versión más simple del concepto, explicada de forma práctica y sin teoría innecesaria.

2) Ejemplo simple
Piensa en el caso más pequeño posible donde se entienda cómo funciona en la realidad.

3) Acción
Escribe ahora un ejemplo de tu caso aplicado en una frase.`;
}

export function applyModeEnforcement(text, mode, originalMessage) {
  let finalText = text;

  finalText = forceCodir(finalText, mode);
  finalText = forceCfo(finalText, mode);
  finalText = forceCto(finalText, mode);
  finalText = forceOffer(finalText, mode);
  finalText = forceCopywriter(finalText, mode, originalMessage);
  finalText = forceCmo(finalText, mode, originalMessage);
  finalText = forcePm(finalText, mode, originalMessage);
  finalText = forceScrapping(finalText, mode);
  finalText = forceFormacion(finalText, mode, originalMessage);

  return finalText;
}
