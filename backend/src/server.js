import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import dotenv from "dotenv";
import { createServer } from "http";
import chatRouter from "./routes/chat.js";
import healthRouter from "./routes/health.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ── Trust proxy (Render sits behind a load balancer) ──────────────────────
app.set("trust proxy", 1);

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — only allow your Netlify domain ─────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://neuroaii.netlify.app",
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server calls (no origin) and listed origins
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parsing + compression ─────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: "32kb" }));

// ── Global rate limiter — 100 req / 15 min per IP ─────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  })
);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/api/chat", chatRouter);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ──────────────────────────────────────────────────────────────────
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`✅ NeuroX AI backend running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});
