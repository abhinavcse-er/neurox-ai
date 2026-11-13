import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getAIResponse, getAvailableModels, streamAIResponse } from "../services/ai.js";
import { getWikiSummary } from "../services/wikipedia.js";
import { buildLivePrompt, getLiveContext } from "../services/live.js";

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
  const { message, provider = "auto", history = [], mode = "general" } = req.body || {};

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: "message too long (max 2000 chars)" });
  }

  const prompt = message.trim();

  // Accept only a small, validated window of prior turns; never trust client roles or payloads.
  const safeHistory = Array.isArray(history)
    ? history.slice(-20)
        .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
        .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
        .filter((item) => item.content.length > 0)
    : [];
  let historyChars = 0;
  const boundedHistory = safeHistory.reverse().filter((item) => {
    if (historyChars + item.content.length > 12000) return false;
    historyChars += item.content.length;
    return true;
  }).reverse();

  try {
    const liveData = await getLiveContext(prompt);
    const aiPrompt = buildLivePrompt(prompt, liveData);

    // Wikipedia is a free knowledge fallback for direct factual lookups.
    const wikiReply = provider === "auto" ? await getWikiSummary(prompt) : null;
    if (wikiReply) return res.json({ reply: wikiReply, provider: "wikipedia" });

    // AI providers are attempted in configured order; failures automatically fall back.
    const result = await getAIResponse(aiPrompt, provider, boundedHistory, mode);
    if (liveData?.length) result.liveData = liveData.map((item) => ({ category: item.category, retrievedAt: item.retrievedAt, sources: item.sources || [], error: item.error || null }));
    return res.json(result);
  } catch (err) {
    console.error("[chat] Error:", err.message);
    return res.status(503).json({
      error: "All AI providers are temporarily unavailable. Please try again shortly.",
    });
  }
});


// Server-sent events endpoint for real token-by-token provider output.
router.post("/stream", chatLimiter, async (req, res) => {
  const { message, provider = "auto", history = [], mode = "general" } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "message too long (max 2000 chars)" });
  }

  const prompt = message.trim();
  const safeMode = ["general", "coding", "study", "cybersecurity"].includes(String(mode).toLowerCase())
    ? String(mode).toLowerCase() : "general";
  const safeHistory = Array.isArray(history)
    ? history.slice(-20)
        .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
        .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 4000) }))
        .filter((item) => item.content.length > 0)
    : [];
  let historyChars = 0;
  const boundedHistory = safeHistory.reverse().filter((item) => {
    if (historyChars + item.content.length > 12000) return false;
    historyChars += item.content.length;
    return true;
  }).reverse();

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };
  // Keep intermediary proxies from closing an otherwise healthy generation.
  const heartbeat = setInterval(() => sendEvent("ping", { at: Date.now() }), 12000);

  try {
    const liveData = await getLiveContext(prompt);
    const aiPrompt = buildLivePrompt(prompt, liveData);

    // Preserve the existing free Wikipedia fallback for general factual lookups.
    // Stream it as one complete token so the frontend uses the same rendering path.
    if (provider === "auto" && safeMode === "general") {
      const wikiReply = await getWikiSummary(prompt);
      if (wikiReply) {
        sendEvent("token", { token: wikiReply });
        sendEvent("done", { provider: "wikipedia" });
        return;
      }
    }

    const result = await streamAIResponse(
      aiPrompt, provider, boundedHistory, safeMode,
      (token) => sendEvent("token", { token })
    );
    sendEvent("done", { provider: result.provider, liveData: liveData?.map((item) => ({ category: item.category, retrievedAt: item.retrievedAt, sources: item.sources || [], error: item.error || null })) || [] });
  } catch (err) {
    console.error("[chat-stream] Error:", err.message);
    sendEvent("error", { error: "The AI stream was interrupted. Please retry or switch provider." });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

export default router;
