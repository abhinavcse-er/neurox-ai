import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getGeminiResponse } from "../services/gemini.js";
import { getWikiSummary } from "../services/wikipedia.js";

const router = Router();

// Tighter rate limit just for the AI endpoint — 20 req / min per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Chat rate limit exceeded. Please slow down." },
});

router.post("/", chatLimiter, async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: "message too long (max 2000 chars)" });
  }

  try {
    // Try Wikipedia first (free, no quota)
    let reply = await getWikiSummary(message.trim());

    // Fall back to Gemini
    if (!reply) {
      reply = await getGeminiResponse(message.trim());
    }

    return res.json({ reply });
  } catch (err) {
    console.error("[chat] Error:", err.message);
    return res.status(502).json({ error: "AI service temporarily unavailable" });
  }
});

export default router;
