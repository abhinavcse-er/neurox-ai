/**
 * NeuroX AI multi-provider router.
 * Provider keys stay on the backend (Render environment variables).
 * Configure AI_PROVIDER_ORDER to change priority, e.g. "gemini,groq,openrouter".
 */

async function postJson(url, headers, body, provider) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${provider} API ${response.status}: ${detail.slice(0, 180)}`);
  }
  return response.json();
}

async function gemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini key not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {},
    { contents: [{ role: "user", parts: [{ text: prompt }] }] },
    "Gemini"
  );
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

async function groq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq key not configured");
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const data = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${key}` },
    { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 },
    "Groq"
  );
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned an empty response");
  return text;
}

async function openrouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter key not configured");
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const data = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.APP_URL || "https://neuroaii.netlify.app",
      "X-Title": "NeuroX AI",
    },
    { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 },
    "OpenRouter"
  );
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned an empty response");
  return text;
}

const providers = { gemini, groq, openrouter };

/**
 * Try configured providers in priority order. Missing keys are skipped;
 * quota, network and provider errors automatically move to the next provider.
 */
export function getAvailableModels() {
  const configs = [
    { id: "gemini", label: "Gemini 2.5 Flash", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", key: "GEMINI_API_KEY" },
    { id: "groq", label: "Groq · Llama 3.3 70B", model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", key: "GROQ_API_KEY" },
    { id: "openrouter", label: "OpenRouter · Free", model: process.env.OPENROUTER_MODEL || "openrouter/free", key: "OPENROUTER_API_KEY" },
  ];
  return [{ id: "auto", label: "Auto (recommended)" }, ...configs.filter((item) => process.env[item.key])];
}

/**
 * A requested provider is tried first; configured providers remain as automatic fallbacks.
 */
export async function getAIResponse(prompt, requestedProvider = "auto") {
  const order = (process.env.AI_PROVIDER_ORDER || "gemini,groq,openrouter")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => providers[name]);
  const selected = String(requestedProvider || "auto").toLowerCase();
  const attemptOrder = selected !== "auto" && providers[selected]
    ? [selected, ...order.filter((name) => name !== selected)]
    : order;

  const errors = [];
  for (const name of attemptOrder) {
    const keyName = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" }[name];
    if (!process.env[keyName]) continue;
    try {
      const reply = await providers[name](prompt);
      console.log(`[AI] Response served by ${name}`);
      return { reply, provider: name };
    } catch (error) {
      console.error(`[AI] ${name} failed; trying next provider:`, error.message);
      errors.push(`${name}: ${error.message}`);
    }
  }

  if (errors.length === 0) {
    throw new Error("No AI provider configured. Add GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in Render.");
  }
  throw new Error(`All configured AI providers failed. ${errors.join(" | ")}`);
}
