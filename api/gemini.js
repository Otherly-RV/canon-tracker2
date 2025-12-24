import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing GEMINI_API_KEY (set it in Vercel env vars)" });
    return;
  }

  const ai = new GoogleGenAI({ apiKey, vertexai: false });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const prompt = String(body?.prompt || "").trim();

    if (!prompt) {
      res.status(400).json({ error: "Missing prompt" });
      return;
    }

    const out = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
      config: { temperature: 0.2 },
    });

    res.status(200).json({ text: out?.text ?? "" });
  } catch (e) {
    console.error("Gemini handler error:", e);
    res.status(500).json({
      error: e?.message || "Gemini failed",
    });
  }
}
