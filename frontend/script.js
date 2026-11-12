// ===== Firebase Imports =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ===== Firebase Config =====
// For a plain HTML/JS project (no bundler) these values are inline.
// Keep Firebase Auth rules tight — these are not secret (they're public by design),
// but limit which domains can call your Firebase project in the Firebase Console.
const firebaseConfig = {
  apiKey:            "AIzaSyBfLn_JxmovMapRqby9RrdceaOc0Mmeo6Y",
  authDomain:        "eurox-ai-2cd91.firebaseapp.com",
  projectId:         "neurox-ai-2cd91",
  storageBucket:     "neurox-ai-2cd91.appspot.com",
  messagingSenderId: "242667828902",
  appId:             "1:242667828902:web:d4be4ca6e8c2ec75726667",
};

// ===== Initialize Firebase =====
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ── Backend URL — change to your Render service URL after deploying ────────
const BACKEND_URL = "https://neurox-ai-backend.onrender.com";

// ── DOM Elements ──────────────────────────────────────────────────────────
const overlay      = document.getElementById("auth-overlay");
const profileBtn   = document.getElementById("profileBtn");
const dropdown     = document.getElementById("profileDropdown");
const userEmailEl  = document.getElementById("userEmail");
const logoutBtn    = document.getElementById("logoutBtn");
const loginBtn     = document.getElementById("loginBtn");
const chatList     = document.querySelector(".chat-list");
const textarea     = document.querySelector("textarea");
const sendBtn      = document.getElementById("send-btn");
const themeBtn     = document.getElementById("theme-btn");
const deleteBtn    = document.getElementById("delete-btn");
const suggestions  = document.querySelectorAll(".suggestions button");
const fileInput    = document.getElementById("file-input");
const fileBtn      = document.getElementById("file-btn");
const micBtn       = document.getElementById("mic-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const container    = document.querySelector(".container");

// ── Auth State ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    overlay?.classList.add("hidden");
    if (userEmailEl)  userEmailEl.textContent = user.email;
    if (profileBtn && user.email)
      profileBtn.textContent = user.email.charAt(0).toUpperCase();
    if (loginBtn) loginBtn.style.display = "none";
  } else {
    overlay?.classList.remove("hidden");
    if (loginBtn) loginBtn.style.display = "inline-block";
  }
});

// ── Profile dropdown ──────────────────────────────────────────────────────
profileBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown?.classList.toggle("show");
});
window.addEventListener("click", () => dropdown?.classList.remove("show"));

// ── Logout ────────────────────────────────────────────────────────────────
logoutBtn?.addEventListener("click", () => {
  signOut(auth)
    .then(() => { window.location.href = "index.html"; })
    .catch((err) => console.error("Logout Error:", err));
});

// ── Chat persistence (localStorage) ──────────────────────────────────────
let chatHistory = JSON.parse(localStorage.getItem("chat-history")) || [];
let isProcessing = false;

function saveChats() {
  // Keep last 100 messages to avoid bloating localStorage
  if (chatHistory.length > 100) chatHistory = chatHistory.slice(-100);
  localStorage.setItem("chat-history", JSON.stringify(chatHistory));
}

// ── UI Helpers ────────────────────────────────────────────────────────────
function getTime() {
  return new Date().toLocaleTimeString();
}

function createMessage(msg, type) {
  const li = document.createElement("li");
  li.classList.add("chat", type);

  li.innerHTML = `
    <div>
      <p>${type === "incoming" ? marked.parse(msg) : msg}</p>
      <small style="opacity:0.6;font-size:11px">${getTime()}</small>
      ${type === "incoming" ? '<button class="copy-btn">Copy</button>' : ""}
    </div>
  `;

  chatList.appendChild(li);
  chatList.scrollTop = chatList.scrollHeight;

  if (type === "incoming") {
    li.querySelector(".copy-btn").addEventListener("click", () => {
      navigator.clipboard.writeText(msg);
    });
  }

  return li;
}

// Load saved chats
chatHistory.forEach((c) => createMessage(c.text, c.type));

// ── Theme toggle ──────────────────────────────────────────────────────────
themeBtn?.addEventListener("click", () => document.body.classList.toggle("light"));

// ── Delete chats ──────────────────────────────────────────────────────────
deleteBtn?.addEventListener("click", () => {
  if (confirm("Delete all chats?")) {
    chatHistory = [];
    localStorage.removeItem("chat-history");
    chatList.innerHTML = "";
  }
});

// ── File upload preview ───────────────────────────────────────────────────
fileBtn?.addEventListener("click", () => fileInput.click());
fileInput?.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    createMessage(`<img src="${e.target.result}" width="200">`, "outgoing");
  };
  reader.readAsDataURL(file);
});

// ── Drag & Drop ────────────────────────────────────────────────────────────
if (container) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    container.classList.add("dragover");
  });
  container.addEventListener("dragleave", () => container.classList.remove("dragover"));
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        createMessage(`<img src="${ev.target.result}" width="200">`, "outgoing");
      };
      reader.readAsDataURL(file);
    }
  });
}

// ── Voice Input ───────────────────────────────────────────────────────────
if ("webkitSpeechRecognition" in window && micBtn) {
  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  micBtn.addEventListener("click", () => {
    recognition.start();
    micBtn.classList.add("mic-active");
  });
  recognition.onresult = (e) => {
    textarea.value = e.results[0][0].transcript;
  };
  recognition.onend = () => micBtn.classList.remove("mic-active");
}

// ── Fullscreen ────────────────────────────────────────────────────────────
fullscreenBtn?.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

// ── Send message via backend ──────────────────────────────────────────────
async function sendToBackend(message) {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.reply;
}

async function handleSend() {
  const message = textarea.value.trim();
  if (!message || isProcessing) return;

  isProcessing = true;
  createMessage(message, "outgoing");
  chatHistory.push({ text: message, type: "outgoing" });
  saveChats();
  textarea.value = "";

  const loadingEl = createMessage("⏳ Thinking...", "incoming");

  try {
    const reply = await sendToBackend(message);
    loadingEl.querySelector("p").innerHTML = marked.parse(reply);
    chatHistory.push({ text: reply, type: "incoming" });
    saveChats();
  } catch (err) {
    loadingEl.querySelector("p").textContent = `❌ Error: ${err.message}`;
  } finally {
    isProcessing = false;
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────
sendBtn?.addEventListener("click", handleSend);

textarea?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

suggestions.forEach((btn) => {
  btn.addEventListener("click", () => {
    textarea.value = btn.innerText;
    handleSend();
  });
});

// ── Footer ────────────────────────────────────────────────────────────────
document.getElementById("year").textContent = new Date().getFullYear();

function updateTime() {
  document.getElementById("liveTime").textContent = new Date().toLocaleTimeString();
}
setInterval(updateTime, 1000);
updateTime();
