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
const auth = getAuth(app);
const BACKEND_URL = "https://neurox-ai-backend.onrender.com";

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
const container = $(".container");
let isProcessing = false;
let chatHistory = [];

try {
  const stored = JSON.parse(localStorage.getItem("chat-history") || "[]");
  chatHistory = Array.isArray(stored) ? stored.slice(-100) : [];
} catch { chatHistory = []; }

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (userEmailEl) userEmailEl.textContent = user.email || "";
    if (profileBtn) {
      profileBtn.textContent = (user.email || "U").charAt(0).toUpperCase();
      profileBtn.style.display = "flex";
    }
    if (loginBtn) loginBtn.style.display = "none";
  } else {
    if (profileBtn) profileBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "inline-flex";
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

function saveChats() {
  chatHistory = chatHistory.slice(-100);
  try { localStorage.setItem("chat-history", JSON.stringify(chatHistory)); }
  catch (error) { console.warn("Could not save chat history:", error); }
}

function safeMarkdown(value) {
  const html = window.marked ? marked.parse(value) : String(value);
  return window.DOMPurify ? DOMPurify.sanitize(html) : document.createTextNode(value).textContent;
}

function createMessage(message, type, provider = "") {
  const li = document.createElement("li");
  li.className = `chat ${type}`;
  const wrapper = document.createElement("div");
  const paragraph = document.createElement("p");
  if (type === "incoming") paragraph.innerHTML = safeMarkdown(message);
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
chatHistory.forEach((item) => {
  if (item && typeof item.text === "string" && ["incoming", "outgoing"].includes(item.type)) {
    hideWelcome();
    createMessage(item.text, item.type, item.provider || "");
  }
});

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
  if (!confirm("Clear this conversation from this browser?")) return;
  chatHistory = [];
  localStorage.removeItem("chat-history");
  chatList.innerHTML = "";
  chatList.appendChild(createWelcomePanel());
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

async function sendToBackend(message) {
  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(65000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("The AI returned an empty response.");
  return data;
}

async function handleSend() {
  const message = textarea.value.trim();
  if (!message || isProcessing) return;
  isProcessing = true;
  hideWelcome();
  createMessage(message, "outgoing");
  chatHistory.push({ text: message, type: "outgoing" });
  saveChats();
  textarea.value = "";
  textarea.style.height = "auto";
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

  const loading = createMessage("NeuroX is thinking…", "incoming");
  loading.classList.add("is-loading");
  try {
    const result = await sendToBackend(message);
    loading.remove();
    createMessage(result.reply, "incoming", result.provider || "");
    chatHistory.push({ text: result.reply, type: "incoming", provider: result.provider || "" });
    saveChats();
  } catch (error) {
    loading.remove();
    const retry = createMessage(`I couldn't get a response just now. ${error.message} Please try again.`, "incoming");
    retry.classList.add("error-message");
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
const year = $("#year");
if (year) year.textContent = new Date().getFullYear();
