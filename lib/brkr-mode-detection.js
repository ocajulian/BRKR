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

function countWords(text) {
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}

function getBusinessSignalTerms() {
  return [
    "idea",
    "negocio",
    "business",
    "startup",
    "mvp",
    "cliente",
    "clientes",
    "customer",
    "customers",
    "usuario",
    "usuarios",
    "problema",
    "mercado",
    "nicho",
    "validar",
    "validacion",
    "validation",
    "oferta",
    "offer",
    "precio",
    "pricing",
    "landing",
    "copy",
    "cta",
    "ad",
    "ads",
    "marketing",
    "canal",
    "acquisition",
    "trafico",
    "lead",
    "leads",
    "prospecto",
    "prospectos",
    "coste",
    "costes",
    "cost",
    "costs",
    "roadmap",
    "plan",
    "app",
    "software",
    "producto",
    "servicio",
    "service",
    "build",
    "building",
    "saas",
  ];
}

function getGreetingTerms() {
  return [
    "hola",
    "buenas",
    "hello",
    "hi",
    "hey",
    "bonjour",
    "salut",
    "que tal",
    "como estas",
    "como va",
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "test",
    "prueba",
  ];
}

function getConfusionTerms() {
  return [
    "no entiendo",
    "no entendi",
    "no lo entiendo",
    "no se que hacer",
    "no se por donde empezar",
    "estoy perdido",
    "estoy perdida",
    "me perdi",
    "no tengo claro",
    "no tengo contexto",
    "no entiendo como funciona",
    "i dont understand",
    "i do not understand",
    "i dont get it",
    "i do not get it",
    "im lost",
    "i am lost",
    "not sure what you mean",
    "je ne comprends pas",
    "je suis perdu",
    "je suis perdue",
  ];
}

function hasBusinessSignal(text) {
  return hasAny(text, getBusinessSignalTerms());
}

function isGreetingLike(text) {
  const greetingTerms = getGreetingTerms();

  if (greetingTerms.includes(text)) return true;

  const greetingStarts = [
    "hola ",
    "hello ",
    "hi ",
    "hey ",
    "bonjour ",
    "salut ",
    "buenas ",
  ];

  if (greetingStarts.some((prefix) => text.startsWith(prefix))) return true;

  if (hasAny(text, greetingTerms) && countWords(text) <= 6) return true;

  return false;
}

function isShortVagueStart(text) {
  const vagueTerms = [
    "ayuda",
    "help",
    "aide",
    "empezar",
    "start",
    "commencer",
    "quiero empezar",
    "quiero arrancar",
    "no se",
    "nose",
  ];

  return countWords(text) <= 5 && !hasBusinessSignal(text) && hasAny(text, vagueTerms);
}

export function detectOnboardingState({ message, history = [] }) {
  const current = normalizeText(message);

  if (!current) return null;

  if (hasAny(current, getConfusionTerms())) {
    return "CONFUSION";
  }

  // Regla principal:
  // saludo o arranque vago => onboarding WELCOME
  // NO depende de history
  if (!hasBusinessSignal(current) && (isGreetingLike(current) || isShortVagueStart(current))) {
    return "WELCOME";
  }

  return null;
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
