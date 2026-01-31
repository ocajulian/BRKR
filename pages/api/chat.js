export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Use POST" });
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ reply: "Missing message" });
  }

  return res.status(200).json({
    reply: `OK ✅ Recibí: ${message}`,
  });
}
