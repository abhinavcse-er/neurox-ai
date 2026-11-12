// NeuroX AI — browser client (Firebase Auth + secure backend API)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfLn_JxmovMapRqby9RrdceaOc0Mmeo6Y",
  authDomain: "neurox-ai-2cd91.firebaseapp.com",
  projectId: "neurox-ai-2cd91",
  storageBucket: "neurox-ai-2cd91.appspot.com",
  messagingSenderId: "242667828902",
  appId: "1:242667828902:web:d4be4ca6e8c2ec75726667",
};

const app = initializeApp(firebaseConfig);
// Call the backend directly for SSE so intermediary static-site proxies do not buffer tokens.
const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:10000" : "https://neurox-ai-backend-0ow2.onrender.com";
const auth = getAuth(app);

const $ = (selector) => document.querySelector(selector);
const profileBtn = $("#profileBtn");
const dropdown = $("#profileDropdown");
const userEmailEl = $("#userEmail");
const logoutBtn = $("#logoutBtn");
const loginBtn = $("#loginBtn");
const chatList = $(".chat-list");
const textarea = $("textarea");
const sendBtn = $("#send-btn");
const themeBtn = $("#theme-btn");
const deleteBtn = $("#delete-btn");
const suggestions = document.querySelectorAll(".suggestions button");
const fileInput = $("#file-input");
const fileBtn = $("#file-btn");
const micBtn = $("#mic-btn");
const modelSelect = $("#model-select");
const modeSelect = $("#mode-select");
const newChatBtn = $("#new-chat-btn");
const container = $(".main-wrapper");
const historyItems = $("#history-items");
const historySearch = $("#history-search");
const historySidebar = $("#historySidebar");
const conversationTitle = $("#conversation-title");
const conversationKicker = $("#conversation-kicker");
const historyCount = $("#history-count");
let isProcessing = false;
let chatHistory = [];
let conversations = [];
let activeConversationId = null;
let historyOwner = "guest";
let chartInstances = [];

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (userEmailEl) userEmailEl.textContent = user.email || "";
    if (profileBtn) {
      profileBtn.textContent = (user.displayName || user.email || "U").charAt(0).toUpperCase();
      profileBtn.style.display = "flex";
    }
    if (loginBtn) loginBtn.style.display = "none";
    loadConversations(user.uid || "guest");
  } else {
    if (profileBtn) profileBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "inline-flex";
    loadConversations("guest");
  }
});

profileBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  dropdown?.classList.toggle("show");
});
window.addEventListener("click", () => dropdown?.classList.remove("show"));
logoutBtn?.addEventListener("click", async () => {
  try { await signOut(auth); window.location.href = "index.html"; }
  catch (error) { console.error("Logout failed:", error); }
});

function makeConversationId() {
  return window.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function activeConversation() {
  return conversations.find((item) => item.id === activeConversationId) || null;
}
function setConversationHeading(conversation) {
  if (conversationTitle) conversationTitle.textContent = conversation?.title || "New conversation";
  const modes = { general: "GENERAL ASSISTANT", coding: "CODING ASSISTANT", study: "STUDY ASSISTANT", cybersecurity: "CYBERSECURITY ASSISTANT" };
  if (conversationKicker) conversationKicker.textContent = modes[conversation?.mode] || "YOUR AI WORKSPACE";
}
function createConversation(messages = [], mode = "general") {
  return {
    id: makeConversationId(),
    title: "New conversation",
    mode,
    updatedAt: Date.now(),
    messages: Array.isArray(messages) ? messages.slice(-100) : []
  };
}
function persistConversations() {
  conversations = conversations
    .filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 100);
  try {
    localStorage.setItem(`neurox-conversations-v1:${historyOwner}`, JSON.stringify(conversations));
  } catch (error) {
    console.warn("Could not persist chat history in this browser:", error);
  }
}
function renderHistory() {
  if (!historyItems) return;
  const query = (historySearch?.value || "").trim().toLowerCase();
  const matching = conversations.filter((item) => {
    if (!query) return true;
    const titleMatches = String(item.title || "").toLowerCase().includes(query);
    const messageMatches = item.messages.some((message) => String(message.text || "").toLowerCase().includes(query));
    return titleMatches || messageMatches;
  });
  historyItems.replaceChildren();
  if (historyCount) historyCount.textContent = String(conversations.length);
  if (!matching.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = query ? "No conversations match your search." : "Your saved conversations will appear here.";
    historyItems.appendChild(empty);
    return;
  }
  matching.forEach((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item" + (conversation.id === activeConversationId ? " active" : "");
    button.title = conversation.title || "New conversation";
    const icon = document.createElement("i");
    icon.className = "fa-regular fa-message";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = conversation.title || "New conversation";
    button.append(icon, label);
    button.addEventListener("click", () => openConversation(conversation.id));
    historyItems.appendChild(button);
  });
}
function renderActiveConversation() {
  if (!chatList) return;
  chartInstances.forEach((instance) => { try { instance.destroy(); } catch {} });
  chartInstances = [];
  const conversation = activeConversation();
  chatHistory = Array.isArray(conversation?.messages) ? conversation.messages.slice(-100) : [];
  if (modeSelect) modeSelect.value = ["general", "coding", "study", "cybersecurity"].includes(conversation?.mode) ? conversation.mode : "general";
  setConversationHeading(conversation);
  chatList.replaceChildren();
  if (!chatHistory.length) {
    chatList.appendChild(createWelcomePanel());
  } else {
    chatHistory.forEach((item) => {
      if (item && typeof item.text === "string" && ["incoming", "outgoing"].includes(item.type)) {
        createMessage(item.text, item.type, item.provider || "");
      }
    });
  }
  renderHistory();
}
function loadConversations(ownerId) {
  historyOwner = String(ownerId || "guest");
  try {
    const stored = JSON.parse(localStorage.getItem(`neurox-conversations-v1:${historyOwner}`) || "[]");
    conversations = Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)).slice(0, 100) : [];
  } catch {
    conversations = [];
  }

  // Migrate the older single-chat browser history without discarding it.
  if (!conversations.length) {
    try {
      const legacy = JSON.parse(localStorage.getItem("chat-history") || "[]");
      if (Array.isArray(legacy) && legacy.some((item) => item && typeof item.text === "string")) {
        const conversation = createConversation(legacy.filter((item) => item && typeof item.text === "string" && ["incoming", "outgoing"].includes(item.type)));
        const firstPrompt = conversation.messages.find((item) => item.type === "outgoing")?.text || "";
        conversation.title = firstPrompt.slice(0, 42) || "Previous conversation";
        conversations = [conversation];
        localStorage.removeItem("chat-history");
      }
    } catch { /* Ignore invalid legacy data and start a clean history. */ }
  }
  if (!conversations.length) conversations = [createConversation([], "general")];
  activeConversationId = conversations[0].id;
  persistConversations();
  renderActiveConversation();
}
function saveChats() {
  const conversation = activeConversation();
  if (!conversation) return;
  chatHistory = chatHistory.slice(-100);
  conversation.messages = chatHistory;
  conversation.updatedAt = Date.now();
  const firstPrompt = chatHistory.find((item) => item.type === "outgoing")?.text || "";
  if (firstPrompt) conversation.title = firstPrompt.replace(/\s+/g, " ").trim().slice(0, 42) || "New conversation";
  conversations = [conversation, ...conversations.filter((item) => item.id !== conversation.id)];
  setConversationHeading(conversation);
  persistConversations();
  renderHistory();
}
function openConversation(id) {
  if (!conversations.some((item) => item.id === id)) return;
  activeConversationId = id;
  renderActiveConversation();
  historySidebar?.classList.remove("is-open");
}
function startNewConversation() {
  const conversation = createConversation([], modeSelect?.value || "general");
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  persistConversations();
  renderActiveConversation();
  textarea?.focus();
}


function safeMarkdown(value) {
  const source = String(value ?? "");
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(source, { gfm: true, breaks: false }));
  }
  const escaped = source.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
  return escaped.replace(/\n/g, "<br>");
}

function normalizeChartConfig(candidate) {
  if (!candidate || typeof candidate !== "object") return null;

  // Native schema already used by the renderer.
  if (["bar", "line", "pie", "doughnut"].includes(candidate.chartType) &&
      typeof candidate.xKey === "string" && Array.isArray(candidate.series) &&
      Array.isArray(candidate.data)) {
    return {
      type: candidate.chartType,
      title: candidate.title || "Chart",
      labels: candidate.data.map((row) => String(row[candidate.xKey] ?? "")),
      datasets: candidate.series.map((item) => ({
        label: item.label || item.dataKey || "Values",
        data: candidate.data.map((row) => Number(row[item.dataKey])),
        backgroundColor: item.backgroundColor || item.barColors,
        borderColor: item.borderColor,
      })),
    };
  }

  // Standard Chart.js-like schema.
  if (["bar", "line", "pie", "doughnut"].includes(candidate.type) &&
      Array.isArray(candidate.labels) && Array.isArray(candidate.datasets)) {
    return {
      type: candidate.type,
      title: candidate.title || "Chart",
      labels: candidate.labels.map(String),
      datasets: candidate.datasets.map((item) => ({
        ...item,
        data: Array.isArray(item.data) ? item.data.map(Number) : [],
      })),
    };
  }

  // Alternate schema commonly generated by AI models.
  if (["bar", "line", "pie", "doughnut"].includes(candidate.type) &&
      Array.isArray(candidate.xaxis) && candidate.dataset) {
    const rows = Array.isArray(candidate.dataset.data) ? candidate.dataset.data : [];
    const labels = rows.length
      ? rows.map((row) => String(row.month ?? row.label ?? row.x ?? ""))
      : candidate.xaxis.map(String);
    const values = rows.map((row) => Number(row.value ?? row.revenue ?? row.sales ?? row.y));
    if (values.length && values.every(Number.isFinite)) {
      return {
        type: candidate.type,
        title: candidate.title || "Chart",
        labels,
        datasets: [{
          label: candidate.dataset.label || candidate.yaxis || "Values",
          data: values,
          backgroundColor: candidate.barColors || undefined,
        }],
      };
    }
  }
  return null;
}

function normalizeToolChartText(value) {
  const text = String(value);
  // Worst-case fallback: the model may return raw JSON instead of a fenced code block.
  const plainJson = text.trim().replace(/^\`\`\`(?:json|chart)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  try {
    const normalized = normalizeChartConfig(JSON.parse(plainJson));
    if (normalized) return "```chart\n" + JSON.stringify(normalized) + "\n```";
  } catch {}

  const markerStart = text.indexOf("<|tool_call_start|>");
  const markerEnd = text.indexOf("<|tool_call_end|>", markerStart);
  if (markerStart < 0 || markerEnd < 0) return text;
  const toolCall = text.slice(markerStart, markerEnd);
  if (!/^\s*\[\s*chart\s*\(/i.test(toolCall.replace("<|tool_call_start|>", ""))) return text;

  const title = toolCall.match(/title\s*=\s*(['"])(.*?)\1/i)?.[2] || "Chart";
  const labelsBody = toolCall.match(/labels\s*=\s*\[([\s\S]*?)\]/i)?.[1];
  const datasetsBody = toolCall.match(/datasets\s*=\s*\[([\s\S]*?)\]\s*\)/i)?.[1];
  const labels = labelsBody
    ? [...labelsBody.matchAll(/(['"])(.*?)\1/g)].map((item) => item[2])
    : [];
  const datasetLabel = datasetsBody?.match(/label\s*(?:=|:)\s*(['"])(.*?)\1/i)?.[2] || "Values";
  const valuesBody = datasetsBody?.match(/data\s*(?:=|:)\s*\[([\d.,\s-]+)\]/i)?.[1];
  if (!labels.length || valuesBody == null) return text;

  const values = valuesBody.split(",").map((item) => Number(item.trim()));
  if (values.length !== labels.length || values.some((item) => !Number.isFinite(item))) return text;
  const chart = { type: "bar", title, labels, datasets: [{ label: datasetLabel, data: values }] };
  return text.slice(0, markerStart) + "\`\`\`chart\n" + JSON.stringify(chart) + "\n\`\`\`" +
    text.slice(markerEnd + "<|tool_call_end|>".length);
}
let chartLibraryPromise = null;
function ensureChartLibrary() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (chartLibraryPromise) return chartLibraryPromise;
  const sources = [
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js",
    "https://unpkg.com/chart.js@4.4.7/dist/chart.umd.js"
  ];
  chartLibraryPromise = (async () => {
    for (const src of sources) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.onload = () => window.Chart ? resolve() : reject(new Error("Chart.js loaded without its global API"));
          script.onerror = () => reject(new Error("Could not load " + src));
          document.head.appendChild(script);
        });
        if (window.Chart) return window.Chart;
      } catch (error) {
        console.warn("Chart.js fallback failed:", error);
      }
    }
    chartLibraryPromise = null;
    throw new Error("Chart.js could not load from the primary or backup CDN. Check network/ad-blocker and CSP.");
  })();
  return chartLibraryPromise;
}

function enhanceRichOutput(root) {
  root.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement;
    const match = code.className.match(/language-([\w+-]+)/);
    const language = (match && match[1] ? match[1] : "text").toLowerCase();
    pre.dataset.language = language;

    // Normalize multiple AI chart schemas before rendering with Chart.js.
    let chartConfig = null;
    const codeText = code.textContent.trim();
    if (["chart", "json"].includes(language) || codeText.startsWith("{")) {
      try { chartConfig = normalizeChartConfig(JSON.parse(codeText)); }
      catch {}
    }

    if (chartConfig) {
      const card = document.createElement("div");
      card.className = "chart-card";
      if (chartConfig.title) {
        const heading = document.createElement("strong");
        heading.textContent = chartConfig.title;
        card.appendChild(heading);
      }
      const canvas = document.createElement("canvas");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", chartConfig.title || "AI generated chart");
      card.appendChild(canvas);
      pre.replaceWith(card);

      ensureChartLibrary().then((ChartLibrary) => {
        if (!canvas.isConnected) return;
        chartInstances.push(new ChartLibrary(canvas, {
          type: chartConfig.type,
          data: { labels: chartConfig.labels, datasets: chartConfig.datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: { legend: { display: true, labels: { color: document.body.classList.contains("light") ? "#26334b" : "#dce5f5" } } },
            scales: ["pie", "doughnut"].includes(chartConfig.type) ? {} : {
              x: { ticks: { color: "#9ba8bd" }, grid: { color: "rgba(148,163,184,.12)" } },
              y: { beginAtZero: true, ticks: { color: "#9ba8bd" }, grid: { color: "rgba(148,163,184,.12)" } }
            }
          }
        }));
      }).catch((error) => {
        console.error("Chart rendering failed:", error);
        const message = document.createElement("p");
        message.className = "chart-error";
        message.textContent = "Chart library unavailable. Check your internet connection, disable CDN-blocking extensions, or inspect the browser Console.";
        card.appendChild(message);
      });
      return;
    }

    if (["bash", "sh", "shell", "powershell", "ps1", "console", "terminal", "cmd"].includes(language)) pre.classList.add("terminal-code");

    if (language === "mermaid") {
      const diagram = document.createElement("div");
      diagram.className = "mermaid";
      diagram.textContent = code.textContent;
      pre.replaceWith(diagram);
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.body.classList.contains("light") ? "default" : "dark" });
        window.mermaid.run({ nodes: [diagram] }).catch((error) => console.warn("Diagram render failed:", error));
      }
      return;
    }

    if (window.hljs && !code.dataset.highlighted) {
      const highlightLanguage = language === "ps1" ? "powershell" : language;
      if (window.hljs.getLanguage(highlightLanguage)) window.hljs.highlightElement(code);
      else code.classList.add("no-highlight");
    }
    const copy = document.createElement("button");
    copy.className = "code-copy";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code.textContent); copy.textContent = "Copied"; }
      catch { copy.textContent = "Unavailable"; }
      setTimeout(() => { copy.textContent = "Copy"; }, 1300);
    });
    pre.appendChild(copy);
  });
}
async function loadModels() {
  if (!modelSelect) return;
  try {
    const response = await fetch("/api/chat/models");
    if (!response.ok) throw new Error("Model list unavailable");
    const data = await response.json();
    modelSelect.innerHTML = "";
    (data.models || [{id:"auto",label:"Auto (recommended)"}]).forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label;
      modelSelect.appendChild(option);
    });
    const saved = localStorage.getItem("neurox-model") || "auto";
    modelSelect.value = [...modelSelect.options].some((option) => option.value === saved) ? saved : "auto";
  } catch (error) {
    console.warn("Could not load model list:", error);
    modelSelect.innerHTML = '<option value="auto">Auto (recommended)</option>';
  }
}
loadModels();
modelSelect?.addEventListener("change", () => {
  try { localStorage.setItem("neurox-model", modelSelect.value); } catch {}
});

function createMessage(message, type, provider = "") {
  const li = document.createElement("li");
  li.className = `chat ${type}`;
  const wrapper = document.createElement("div");
  const paragraph = document.createElement("p");
  if (type === "incoming") { message = normalizeToolChartText(message); paragraph.innerHTML = safeMarkdown(message); enhanceRichOutput(paragraph); }
  else paragraph.textContent = message;
  wrapper.appendChild(paragraph);

  const meta = document.createElement("small");
  meta.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (provider) {
    const source = document.createElement("span");
    source.className = "message-provider";
    source.textContent = `· ${provider === "wikipedia" ? "Wikipedia" : provider}`;
    meta.appendChild(source);
  }
  wrapper.appendChild(meta);

  if (type === "incoming") {
    const copy = document.createElement("button");
    copy.className = "copy-btn";
    copy.type = "button";
    copy.textContent = "Copy response";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message);
        copy.textContent = "Copied!";
        setTimeout(() => { copy.textContent = "Copy response"; }, 1400);
      } catch { copy.textContent = "Copy unavailable"; }
    });
    wrapper.appendChild(copy);
  }
  li.appendChild(wrapper);
  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;
  return li;
}

function hideWelcome() {
  $("#welcomePanel")?.remove();
}


function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light", light);
  const icon = themeBtn?.querySelector("i");
  if (icon) icon.className = light ? "fa-solid fa-moon" : "fa-solid fa-sun";
}
try { applyTheme(localStorage.getItem("neurox-theme") || "dark"); }
catch { applyTheme("dark"); }
themeBtn?.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(nextTheme);
  try { localStorage.setItem("neurox-theme", nextTheme); } catch {}
});
deleteBtn?.addEventListener("click", () => {
  if (!confirm("Clear messages in this conversation?")) return;
  const conversation = activeConversation();
  if (!conversation) return;
  conversation.messages = [];
  conversation.title = "New conversation";
  conversation.updatedAt = Date.now();
  chatHistory = [];
  persistConversations();
  renderActiveConversation();
});

function createWelcomePanel() {
  const item = document.createElement("li");
  item.className = "welcome-panel";
  item.id = "welcomePanel";
  item.innerHTML = '<div class="welcome-orb"><img src="favicon.svg" alt=""></div><p class="eyebrow">WELCOME TO YOUR AI WORKSPACE</p><h2>Big ideas start<br><span>with one question.</span></h2><p class="welcome-copy">Explore concepts, write code, solve problems or simply think out loud. Let\'s build something brilliant.</p><div class="suggestions"><button type="button"><i class="fa-solid fa-code"></i><span><b>Code &amp; debug</b><small>Build something with me</small></span></button><button type="button"><i class="fa-regular fa-lightbulb"></i><span><b>Learn a concept</b><small>Make complex things simple</small></span></button><button type="button"><i class="fa-solid fa-pen-nib"></i><span><b>Write anything</b><small>Turn thoughts into words</small></span></button></div>';
  item.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    textarea.value = button.innerText.replace(/\s+/g, " ").trim();
    handleSend();
  }));
  return item;
}

fileBtn?.addEventListener("click", () => fileInput?.click());
fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("Please choose an image smaller than 5 MB.");
    fileInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const item = document.createElement("li");
    item.className = "chat outgoing";
    const image = document.createElement("img");
    image.src = reader.result;
    image.alt = "Selected attachment";
    image.style.cssText = "max-width:220px;border-radius:12px";
    item.appendChild(image);
    chatList.appendChild(item);
    chatList.scrollTop = chatList.scrollHeight;
  };
  reader.readAsDataURL(file);
});

if (container) {
  container.addEventListener("dragover", (event) => { event.preventDefault(); container.classList.add("dragover"); });
  container.addEventListener("dragleave", () => container.classList.remove("dragover"));
  container.addEventListener("drop", (event) => {
    event.preventDefault();
    container.classList.remove("dragover");
    const file = event.dataTransfer?.files?.[0];
    if (file?.type.startsWith("image/") && file.size <= 5 * 1024 * 1024) {
      fileInput.files = event.dataTransfer.files;
      fileInput.dispatchEvent(new Event("change"));
    }
  });
}

if ("webkitSpeechRecognition" in window && micBtn) {
  const recognition = new window.webkitSpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  micBtn.addEventListener("click", () => {
    try { recognition.start(); micBtn.classList.add("mic-active"); }
    catch (error) { console.warn("Voice input could not start:", error); }
  });
  recognition.onresult = (event) => {
    textarea.value = event.results[0][0].transcript;
    textarea.focus();
  };
  recognition.onerror = () => micBtn.classList.remove("mic-active");
  recognition.onend = () => micBtn.classList.remove("mic-active");
} else if (micBtn) {
  micBtn.title = "Voice input is not supported in this browser";
  micBtn.disabled = true;
  micBtn.style.opacity = ".4";
}

async function streamFromBackend(message, onToken = () => {}) {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify({
      message,
      provider: modelSelect?.value || "auto",
      mode: modeSelect?.value || "general",
      history: chatHistory.slice(0, -1)
        .filter((item) => item && typeof item.text === "string" && ["incoming", "outgoing"].includes(item.type))
        .slice(-20)
        .map((item) => ({ role: item.type === "outgoing" ? "user" : "assistant", content: item.text.slice(0, 4000) }))
    }),
    signal: AbortSignal.timeout(65000),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let messageText = raw;
    try { messageText = JSON.parse(raw)?.error || raw; } catch {}
    throw new Error(messageText || `Request failed (${response.status})`);
  }
  if (!response.body?.getReader) throw new Error("Streaming is not supported by this browser. Please refresh and try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let provider = "";
  let streamError = null;

  const dispatchBlock = (block) => {
    let eventName = "message";
    const dataLines = [];
    block.split(/\r?\n/).forEach((line) => {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    });
    if (!dataLines.length) return;
    let data;
    try { data = JSON.parse(dataLines.join("\n")); }
    catch { throw new Error("The server sent an invalid streaming event."); }

    if (eventName === "token") {
      if (typeof data.token !== "string") return;
      reply += data.token;
      onToken(data.token);
    } else if (eventName === "done") {
      provider = typeof data.provider === "string" ? data.provider : "";
    } else if (eventName === "error") {
      throw new Error(data.error || "The AI stream was interrupted.");
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      blocks.forEach(dispatchBlock);
      if (done) break;
    }
    if (buffer.trim()) dispatchBlock(buffer.trim());
  } catch (error) {
    streamError = error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (streamError) throw streamError;
  if (!reply.trim()) throw new Error("The AI returned an empty response.");
  return { reply, provider };
}

async function handleSend() {
  const message = textarea.value.trim();
  if (!message || isProcessing) return;
  isProcessing = true;
  const requestConversationId = activeConversationId;
  hideWelcome();
  createMessage(message, "outgoing");
  chatHistory.push({ text: message, type: "outgoing", mode: modeSelect?.value || "general" });
  const selectedMode = modeSelect?.value || "general";
  const conversation = activeConversation();
  if (conversation) conversation.mode = selectedMode;
  saveChats();
  textarea.value = "";
  textarea.style.height = "auto";
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

  const loading = createMessage("NeuroX is thinking…", "incoming");
  loading.classList.add("is-loading");
  const loadingParagraph = loading.querySelector("p");
  let streamedText = "";
  try {
    const result = await streamFromBackend(message, (token) => {
      streamedText += token;
      if (activeConversationId === requestConversationId && loadingParagraph?.isConnected) {
        loadingParagraph.textContent = streamedText;
        chatList.scrollTop = chatList.scrollHeight;
      }
    });
    loading.remove();
    const assistantMessage = {
      text: result.reply,
      type: "incoming",
      provider: result.provider || "",
      mode: selectedMode
    };
    const targetConversation = conversations.find((item) => item.id === requestConversationId);
    if (targetConversation) {
      targetConversation.messages = [...(targetConversation.messages || []), assistantMessage].slice(-100);
      targetConversation.updatedAt = Date.now();
      conversations = [targetConversation, ...conversations.filter((item) => item.id !== requestConversationId)];
    }
    if (activeConversationId === requestConversationId) {
      chatHistory.push(assistantMessage);
      createMessage(result.reply, "incoming", result.provider || "");
      saveChats();
    } else {
      persistConversations();
      renderHistory();
    }
  } catch (error) {
    loading.remove();
    const targetConversation = conversations.find((item) => item.id === requestConversationId);
    if (streamedText.trim() && targetConversation) {
      const partialMessage = { text: streamedText, type: "incoming", mode: selectedMode, partial: true };
      targetConversation.messages = [...(targetConversation.messages || []), partialMessage].slice(-100);
      targetConversation.updatedAt = Date.now();
    }
    if (activeConversationId === requestConversationId) {
      if (streamedText.trim()) {
        chatHistory.push({ text: streamedText, type: "incoming", mode: selectedMode, partial: true });
        createMessage(streamedText, "incoming");
        saveChats();
      } else if (targetConversation) {
        persistConversations();
      }
      const failure = createMessage(`I couldn't complete the response. ${error.message} Please retry or switch the provider.`, "incoming");
      failure.classList.add("error-message");
    } else {
      persistConversations();
      renderHistory();
    }
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    textarea.focus();
  }
}

sendBtn?.addEventListener("click", handleSend);
textarea?.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
});
textarea?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});
suggestions.forEach((button) => button.addEventListener("click", () => {
  textarea.value = button.innerText.replace(/\s+/g, " ").trim();
  handleSend();
}));

newChatBtn?.addEventListener("click", startNewConversation);
historySearch?.addEventListener("input", renderHistory);
modeSelect?.addEventListener("change", () => {
  const conversation = activeConversation();
  if (!conversation) return;
  conversation.mode = modeSelect.value;
  conversation.updatedAt = Date.now();
  setConversationHeading(conversation);
  persistConversations();
  renderHistory();
});
$("#history-toggle")?.addEventListener("click", () => historySidebar?.classList.toggle("is-open"));
$("#export-chat-btn")?.addEventListener("click", () => {
  const conversation = activeConversation();
  if (!conversation || !conversation.messages.length) {
    alert("There are no messages to export yet.");
    return;
  }
  const markdown = [
    `# ${conversation.title || "NeuroX AI conversation"}`,
    `_Exported ${new Date().toLocaleString()} · Mode: ${conversation.mode || "general"}_`,
    "",
    ...conversation.messages.map((item) => `## ${item.type === "outgoing" ? "You" : "NeuroX AI"}\n\n${item.text}\n`)
  ].join("\n");
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(conversation.title || "neurox-chat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "neurox-chat"}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    historySearch?.focus();
  }
});

const year = $("#year");
if (year) year.textContent = new Date().getFullYear();
