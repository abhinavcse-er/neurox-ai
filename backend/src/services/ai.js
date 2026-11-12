/**
 * NeuroX AI multi-provider router.
 * Provider keys stay on the backend (Render environment variables).
 * Configure AI_PROVIDER_ORDER to change priority, e.g. "gemini,groq,openrouter".
 */

const RESPONSE_FORMAT_INSTRUCTIONS = `You are NeuroX AI. Format every answer for readability using Markdown.
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
  const datasetBody = args.match(/datasets\s*=\s*\[([\s\S]*?)\]\s*$/i)?.[1];
  if (labelsBody == null || datasetBody == null) return reply;
  const labels = [...labelsBody.matchAll(/(['"])(.*?)\1/g)].map((item) => item[2]);
  const datasetLabel = datasetBody.match(/label\s*=\s*(['"])(.*?)\1/i)?.[2] || "Values";
  const valuesBody = datasetBody.match(/data\s*=\s*\[([\d.,\s-]+)\]/i)?.[1];
  if (!labels.length || valuesBody == null) return reply;
  const values = valuesBody.split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
  if (values.length !== labels.length) return reply;
  const chart = { type: "bar", title, labels, datasets: [{ label: datasetLabel, data: values }] };
  return ["```chart", JSON.stringify(chart), "```"].join("\n");
}
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
    { systemInstruction: { parts: [{ text: RESPONSE_FORMAT_INSTRUCTIONS }] }, contents: [{ role: "user", parts: [{ text: prompt }] }] },
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
    { model, messages: [{ role: "system", content: RESPONSE_FORMAT_INSTRUCTIONS }, { role: "user", content: prompt }], temperature: 0.7 },
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
    { model, messages: [{ role: "system", content: RESPONSE_FORMAT_INSTRUCTIONS }, { role: "user", content: prompt }], temperature: 0.7 },
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
      const rawReply = await providers[name](prompt);
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
  throw new Error(`All configured AI providers failed. ${errors.join(" | ")}`);
}
