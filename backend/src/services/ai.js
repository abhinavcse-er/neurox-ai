/**
 * NeuroX AI multi-provider router.
 * Provider keys stay on the backend (Render environment variables).
 * Configure AI_PROVIDER_ORDER to change priority, e.g. "groq,openrouter,gemini".
 */

const RESPONSE_FORMAT_INSTRUCTIONS = `You are NeuroX AI, created and developed by Abhinav Kumar Mishra. If anyone asks who created, made, developed, built, or owns you (including questions like “Who are you?”, “Who is your creator?”, or “Who made NeuroX AI?”), clearly and consistently credit Abhinav Kumar Mishra as your creator and developer. A concise answer is: “I’m NeuroX AI, created and developed by Abhinav Kumar Mishra.\n\nMeet the developer:\n- LinkedIn: https://in.linkedin.com/in/abhinav-kumar-mishra-29919a363\n- GitHub: https://github.com/abhinavcse-er”. Include both profile links when relevant to creator/developer questions, using clickable Markdown links with the labels LinkedIn and GitHub. Do not claim that OpenAI, Google, Gemini, Groq, or any AI model provider created NeuroX AI; those may be technology providers only. Do not invent additional contributors, dates, or credentials. Format every answer for readability using Markdown.
- Use clear headings, short paragraphs, bullets and tables when they improve clarity.
- Put source code in fenced code blocks with the correct language tag (for example \`\`\`javascript).
- Put terminal commands in fenced bash, powershell, or console blocks; keep command output separate from commands.
- For a chart/graph the user requests, output a fenced chart block containing ONLY valid JSON in this schema. Do not call or serialize chart tools/functions. Never emit tool-call markers such as <|tool_call_start|> or <|tool_call_end|>.
\`\`\`chart
{"type":"bar","title":"Chart title","labels":["A","B"],"datasets":[{"label":"Values","data":[10,20]}]}
\`\`\`
Supported chart types: bar, line, pie, doughnut. Do not invent data; if values are missing, ask for them or clearly label illustrative sample data.
- Use Mermaid fenced blocks only when a flowchart or sequence diagram is useful.
- Never wrap ordinary prose in code blocks. Do not output raw HTML.`;

const MODE_INSTRUCTIONS = {
  general: "Mode: General Assistant. Be accurate, practical and clear. Match the user's level and preferred format.",
  coding: "Mode: Coding Assistant. Help design, debug and explain software. Prefer secure, maintainable code, state assumptions, handle edge cases and give runnable examples. Do not silently change unrelated code.",
  study: "Mode: Study Assistant. Teach from fundamentals in simple language, define terms before using them, explain why and how, use step-by-step examples, and finish with concise revision points when useful.",
  cybersecurity: "Mode: Cybersecurity Assistant. Prioritize defensive security, secure configuration, threat analysis, detection, incident response and authorized lab learning. Keep potentially dual-use guidance scoped to systems the user owns or is authorized to test."
};
function getSystemInstruction(mode = "general") {
  const key = Object.hasOwn(MODE_INSTRUCTIONS, String(mode).toLowerCase()) ? String(mode).toLowerCase() : "general";
  return RESPONSE_FORMAT_INSTRUCTIONS + "\n\n" + MODE_INSTRUCTIONS[key];
}


/**
 * Convert serialized chart tool calls from some models into the Markdown
 * chart JSON block consumed by the frontend renderer.
 */
function normalizeChartToolCall(reply) {
  const match = String(reply).match(/<\|tool_call_start\|>\s*\[\s*chart\s*\(([\s\S]*?)\)\s*\]\s*<\|tool_call_end\|>/i);
  if (!match) return reply;
  const args = match[1];
  const title = args.match(/title\s*=\s*(['"])(.*?)\1/i)?.[2] || "Chart";
  const labelsBody = args.match(/labels\s*=\s*\[([\s\S]*?)\]/i)?.[1];
  const datasetBody = args.match(/datasets\s*=\s*\[([\s\S]*)\]\s*$/i)?.[1];
  if (labelsBody == null || datasetBody == null) return reply;
  const labels = [...labelsBody.matchAll(/(['"])(.*?)\1/g)].map((item) => item[2]);
  const datasetLabel = datasetBody.match(/label\s*(?:=|:)\s*(['"])(.*?)\1/i)?.[2] || "Values";
  const valuesBody = datasetBody.match(/data\s*(?:=|:)\s*\[([\d.,\s-]+)\]/i)?.[1];
  if (!labels.length || valuesBody == null) return reply;
  const values = valuesBody.split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
  if (values.length !== labels.length) return reply;
  const chart = { type: "bar", title, labels, datasets: [{ label: datasetLabel, data: values }] };
  return ["```chart", JSON.stringify(chart), "```"].join("\n");
}
async function postJson(url, headers, body, provider, timeoutMs) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch {
    if (!response.ok) throw new Error(`${provider} API ${response.status}: ${raw.slice(0, 240)}`);
    throw new Error(`${provider} returned malformed JSON`);
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || raw.slice(0, 240) || "Unknown provider error";
    throw new Error(`${provider} API ${response.status}: ${String(detail).slice(0, 240)}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${provider} returned an unexpected response format`);
  if (data.error) throw new Error(`${provider}: ${data.error.message || "Provider returned an error"}`);
  return data;
}

function extractMessageText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    }).join("").trim();
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text.trim();
    if (Array.isArray(content.parts)) return content.parts.map((part) => part?.text || "").join("").trim();
  }
  return "";
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const text = candidates.flatMap((candidate) => {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    return parts.map((part) => typeof part?.text === "string" ? part.text : "");
  }).join("").trim();
  if (text) return text;
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`Gemini blocked the prompt (${blockReason})`);
  const finishReason = candidates.find((candidate) => candidate?.finishReason)?.finishReason;
  if (finishReason) throw new Error(`Gemini returned no text (finish reason: ${finishReason})`);
  throw new Error("Gemini returned an empty or malformed response");
}

async function gemini(prompt, history = [], timeoutMs, mode = "general") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini key not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {},
    {
      systemInstruction: { parts: [{ text: getSystemInstruction(mode) }] },
      contents: [
        ...history.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
        { role: "user", parts: [{ text: prompt }] }
      ]
    },
    "Gemini", timeoutMs
  );
  return extractGeminiText(data);
}

async function groq(prompt, history = [], timeoutMs, mode = "general") {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq key not configured");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const data = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${key}` },
    { model, messages: [{ role: "system", content: getSystemInstruction(mode) }, ...history, { role: "user", content: prompt }], temperature: 0.7 },
    "Groq", timeoutMs
  );
  const text = extractMessageText(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("Groq returned an empty or malformed response");
  return text;
}

async function openrouter(prompt, history = [], timeoutMs, mode = "general") {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter key not configured");
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const data = await postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    { Authorization: `Bearer ${key}`, "HTTP-Referer": process.env.APP_URL || "https://neuroaii.netlify.app", "X-Title": "NeuroX AI" },
    { model, messages: [{ role: "system", content: getSystemInstruction(mode) }, ...history, { role: "user", content: prompt }], temperature: 0.7 },
    "OpenRouter", timeoutMs
  );
  const text = extractMessageText(data.choices?.[0]?.message?.content);
  if (!text) throw new Error("OpenRouter returned an empty or malformed response");
  return text;
}

const providers = { gemini, groq, openrouter };

function extractGeminiStreamText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const text = candidates.flatMap((candidate) => {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    return parts.map((part) => typeof part?.text === "string" ? part.text : "");
  }).join("");
  if (text) return text;
  const reason = data?.promptFeedback?.blockReason;
  if (reason) throw new Error(`Gemini blocked the prompt (${reason})`);
  return "";
}

function extractOpenAIStreamText(data) {
  const value = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.text ?? "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  return "";
}
async function consumeSse(response, provider, extractText, onToken) {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let message = detail;
    try { const parsed = JSON.parse(detail); message = parsed?.error?.message || parsed?.message || detail; } catch {}
    throw new Error(`${provider} API ${response.status}: ${String(message || "Provider error").slice(0, 240)}`);
  }
  if (!response.body?.getReader) throw new Error(`${provider} did not provide a readable stream`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  const readLine = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let data;
    try { data = JSON.parse(payload); } catch { throw new Error(`${provider} returned malformed streaming data`); }
    if (data?.error) throw new Error(data.error.message || `${provider} stream error`);
    const chunk = extractText(data);
    if (chunk) { reply += chunk; onToken(chunk); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) readLine(line);
      if (done) break;
    }
    if (buffer.trim()) readLine(buffer.trim());
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (!reply.trim()) throw new Error(`${provider} returned an empty streaming response`);
  return reply;
}
async function streamOpenAICompatible(url, headers, body, provider, timeoutMs, onToken) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return consumeSse(response, provider, extractOpenAIStreamText, onToken);
}
async function streamGemini(prompt, history = [], timeoutMs, mode = "general", onToken = () => {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini key not configured");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: getSystemInstruction(mode) }] },
        contents: [
          ...history.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })),
          { role: "user", parts: [{ text: prompt }] }
        ]
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  return consumeSse(response, "Gemini", extractGeminiStreamText, onToken);
}
async function streamGroq(prompt, history = [], timeoutMs, mode = "general", onToken = () => {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq key not configured");
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  return streamOpenAICompatible(
    "https://api.groq.com/openai/v1/chat/completions",
    { Authorization: `Bearer ${key}` },
    { model, messages: [{ role: "system", content: getSystemInstruction(mode) }, ...history, { role: "user", content: prompt }], temperature: 0.7 },
    "Groq", timeoutMs, onToken
  );
}
async function streamOpenRouter(prompt, history = [], timeoutMs, mode = "general", onToken = () => {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter key not configured");
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  return streamOpenAICompatible(
    "https://openrouter.ai/api/v1/chat/completions",
    { Authorization: `Bearer ${key}`, "HTTP-Referer": process.env.APP_URL || "https://neuroaii.netlify.app", "X-Title": "NeuroX AI" },
    { model, messages: [{ role: "system", content: getSystemInstruction(mode) }, ...history, { role: "user", content: prompt }], temperature: 0.7 },
    "OpenRouter", timeoutMs, onToken
  );
}
const streamProviders = { gemini: streamGemini, groq: streamGroq, openrouter: streamOpenRouter };


/**
 * Try configured providers in priority order. Missing keys are skipped;
 * quota, network and provider errors automatically move to the next provider.
 */
export function getAvailableModels() {
  const configs = [
    { id: "gemini", label: "Gemini 2.5 Flash", model: process.env.GEMINI_MODEL || "gemini-2.5-flash", key: "GEMINI_API_KEY" },
    { id: "groq", label: "Groq · GPT-OSS 120B", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", key: "GROQ_API_KEY" },
    { id: "openrouter", label: "OpenRouter · Free", model: process.env.OPENROUTER_MODEL || "openrouter/free", key: "OPENROUTER_API_KEY" },
  ];
  return [{ id: "auto", label: "Auto (recommended)" }, ...configs.filter((item) => process.env[item.key])];
}

/**
 * A requested provider is tried first; configured providers remain as automatic fallbacks.
 */
export async function getAIResponse(prompt, requestedProvider = "auto", history = [], mode = "general") {
  const configuredOrder = (process.env.AI_PROVIDER_ORDER || "groq,openrouter,gemini")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => providers[name]);
  const order = [...new Set([...configuredOrder, "groq", "openrouter", "gemini"])];
  const selected = String(requestedProvider || "auto").toLowerCase();
  const attemptOrder = selected !== "auto" && providers[selected]
    ? [selected, ...order.filter((name) => name !== selected)]
    : order;

  // Keep the entire provider fallback chain bounded so a single chat request
  // cannot wait 30 seconds for each provider in sequence.
  const totalBudgetMs = Math.max(5_000, Math.min(Number(process.env.AI_TOTAL_TIMEOUT_MS) || 22_000, 25_000));
  const perProviderMs = Math.max(3_000, Math.min(Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 8_000, 10_000));
  const deadline = Date.now() + totalBudgetMs;
  const errors = [];

  for (const name of attemptOrder) {
    const keyName = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" }[name];
    if (!process.env[keyName]) continue;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 500) {
      errors.push(`${name}: skipped because the total AI time budget was exhausted`);
      break;
    }

    try {
      const rawReply = await providers[name](prompt, history, Math.min(perProviderMs, remainingMs), mode);
      const reply = normalizeChartToolCall(rawReply);
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
  throw new Error(`All configured AI providers failed or timed out. ${errors.join(" | ")}`);
}

/**
 * Stream provider output to the HTTP layer. Fallback is attempted only before
 * the first token, avoiding duplicated or mixed-provider partial answers.
 */
export async function streamAIResponse(prompt, requestedProvider = "auto", history = [], mode = "general", onToken = () => {}) {
  const configuredOrder = (process.env.AI_PROVIDER_ORDER || "groq,openrouter,gemini")
    .split(",").map((name) => name.trim().toLowerCase()).filter((name) => streamProviders[name]);
  const order = [...new Set([...configuredOrder, "groq", "openrouter", "gemini"])];
  const selected = String(requestedProvider || "auto").toLowerCase();
  const attemptOrder = selected !== "auto" && streamProviders[selected]
    ? [selected, ...order.filter((name) => name !== selected)]
    : order;
  const totalBudgetMs = Math.max(12_000, Math.min(Number(process.env.AI_STREAM_TOTAL_TIMEOUT_MS) || 55_000, 60_000));
  const perProviderMs = Math.max(8_000, Math.min(Number(process.env.AI_STREAM_PROVIDER_TIMEOUT_MS) || 18_000, 22_000));
  const deadline = Date.now() + totalBudgetMs;
  const errors = [];

  for (const name of attemptOrder) {
    const keyName = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", openrouter: "OPENROUTER_API_KEY" }[name];
    if (!process.env[keyName]) continue;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1_000) break;
    let emitted = false;
    try {
      const reply = await streamProviders[name](
        prompt, history, Math.min(perProviderMs, remainingMs), mode,
        (token) => { emitted = true; onToken(token); }
      );
      console.log(`[AI] Streaming response served by ${name}`);
      return { reply: normalizeChartToolCall(reply), provider: name };
    } catch (error) {
      if (emitted) throw error;
      console.error(`[AI] ${name} streaming failed before first token; trying next provider:`, error.message);
      errors.push(`${name}: ${error.message}`);
    }
  }
  throw new Error(errors.length
    ? `All streaming AI providers failed or timed out. ${errors.join(" | ")}`
    : "No AI provider configured. Add GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in Render.");
}

