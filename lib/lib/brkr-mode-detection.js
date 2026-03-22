export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function isNegated(text, terms) {
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

export function detectAutoMode({ message, stage }) {
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

  // FORMACION — intención didáctica manda sobre tema
  if (
    current.includes("explica") ||
    current.includes("explícame") ||
    current.includes("teach") ||
    current.includes("como funciona") ||
    current.includes("cómo funciona") ||
    current.includes("que significa") ||
    current.includes("qué significa") ||
    current.includes("aprender") ||
    current.includes("ensename") ||
    current.includes("enséñame") ||
    current.includes("definicion") ||
    current.includes("definición")
  ) {
    return "FORMACION";
  }

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

  return "CODIR";
}
