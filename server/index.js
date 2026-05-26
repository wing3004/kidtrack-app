import express    from "express";
import cors       from "cors";
import dotenv     from "dotenv";
import analyzeRouter from "./routes/analyze.js";
import emailRouter   from "./routes/email.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    "https://kidtrack-app.vercel.app",  // ← 본인 Vercel URL
  ],
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ── 일반 텍스트 AI 호출 (callAI용) ─────────────────────────
// 기존 helpers.js의 callAI가 POST /api/chat 으로 오도록 분리
app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 1000,
        messages:   req.body.messages,
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Vision 분석 / 소견서 생성 ───────────────────────────────
app.use("/api/analyze", analyzeRouter);

// ── 이메일 전송 ─────────────────────────────────────────────
app.use("/api/email", emailRouter);

// ── 헬스체크 ────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ KidTrack 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   POST /api/chat          ← 일반 텍스트 AI`);
  console.log(`   POST /api/analyze/frames ← Vision 프레임 분석`);
  console.log(`   POST /api/analyze/report ← 소견서 생성`);
  console.log(`   POST /api/email/send-review ← 의사 이메일`);
});