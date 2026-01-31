export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ reply: "Missing message" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ reply: "Missing OPENAI_API_KEY" });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "Eres BRKR: motor de decisiones para micro-SaaS y makers. Responde en español, claro, accionable y breve.",
          },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_output_tokens: 300,
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(500).json({ reply: raw });
    }

  const data = JSON.parse(raw);

// Extraer texto de forma más robusta
const text =
  data.output_text ||
  data?.output?.[0]?.content?.map((c) => c.text).filter(Boolean).join("\n") ||
  data?.output?.[0]?.content?.[0]?.text ||
  "";

// Si sigue vacío, devolvemos un resumen del raw para depurar (sin romper el frontend)
if (!text.trim()) {
  return res.status(200).json({
    reply: "No llegó texto del modelo. Pega esto aquí para revisar:\n" + raw.slice(0, 1500),
  });
}

return res.status(200).json({ reply: text });

  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
