export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Use POST");
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).send("Missing message");
  }

  const BACKEND_URL = process.env.BRKR_BACKEND_URL;
  if (!BACKEND_URL) {
    return res.status(500).send("Missing BRKR_BACKEND_URL");
  }

  try {
    const r = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const text = await r.text();
    res.status(200).send(text);
  } catch (e) {
    res.status(500).send(String(e));
  }
}
