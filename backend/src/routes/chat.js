import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getAIResponse, getAvailableModels } from "../services/ai.js";
import { getWikiSummary } from "../services/wikipedia.js";

const router = Router();

// Available providers are derived from configured server-side API keys.
router.get("/models", (_req, res) => res.json({ models: getAvailableModels() }));

// Tighter rate limit just for the AI endpoint — 20 req / min per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Chat rate limit exceeded. Please slow down." },
});

router.post("/", chatLimiter, async (req, res) => {
  const { message, provider = "auto" } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: "message too long (max 2000 chars)" });
  }

  const prompt = message.trim();

  try {
    // Wikipedia is a free knowledge fallback for direct factual lookups.
    const wikiReply = provider === "auto" ? await getWikiSummary(prompt) : null;
    if (wikiReply) return res.json({ reply: wikiReply, provider: "wikipedia" });

    // AI providers are attempted in configured order; failures automatically fall back.
    const result = await getAIResponse(prompt, provider);
    return res.json(result);
  } catch (err) {
    console.error("[chat] Error:", err.message);
    return res.status(503).json({
      error: "All AI providers are temporarily unavailable. Please try again shortly.",
    });
  }
});

export default router;
