export default async function handler(req, res) {
  // 1. Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ reply: "Missing message" });
  }

  const BACKEND_URL = process.env.BRKR_BACKEND_URL;
  if (!BACKEND_URL) {
    return res.status(500).json({ reply: "Missing BRKR_BACKEND_URL" });
  }

  try {
    const r = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const text = await r.text();

    // 2. Siempre devolver JSON consistente
    return res.status(200).json({ reply: text });
  } catch (e) {
    return res.status(500).json({ reply: String(e) });
  }
}
