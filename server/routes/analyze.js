import express from "express";
import multer  from "multer";
import fs      from "fs";
import path    from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router    = express.Router();

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /video\/|image\//.test(file.mimetype);
    cb(ok ? null : new Error("영상 또는 이미지 파일만 허용됩니다."), ok);
  },
});

// ── POST /api/analyze/frames ──────────────────────────────────
router.post("/frames", upload.array("frames", 30), async (req, res) => {
  try {
    const files   = req.files;
    const childId = req.body.childId || "unknown";
    const clipId  = req.body.clipId  || `clip_${Date.now()}`;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "프레임 이미지가 없습니다." });
    }

    const frameContents = files.slice(0, 10).map((f) => {
      const data = fs.readFileSync(f.path);
      return {
        type:   "image",
        source: {
          type:       "base64",
          media_type: "image/jpeg",
          data:       data.toString("base64"),
        },
      };
    });

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-5",
        max_tokens: 2000,
        messages: [{
          role:    "user",
          content: [
            ...frameContents,
            {
              type: "text",
              text: `당신은 보호자의 육아 관찰 기록을 돕는 AI 보조 도구입니다.
의료적 진단을 내리는 것이 아니라, 보호자가 전문가 상담 시 참고할 수 있도록
영상에서 관찰된 행동을 객관적으로 기록하는 역할입니다.

아래 영상 프레임에서 관찰되는 행동을 있는 그대로 기술하고,
반드시 한국어로만 JSON 형식으로 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "attentionNeeded": true/false,
  "observationScore": 0~100,
  "behaviors": [
    {
      "name": "관찰된 행동명 (한국어)",
      "observed": true/false,
      "frequency": "none|occasional|frequent",
      "note": "객관적 행동 묘사 (한국어, 진단 표현 금지)"
    }
  ],
  "observationSummary": "관찰된 행동을 사실 그대로 2~3문장으로 기술 (진단/판정 표현 금지, 한국어)",
  "parentNote": "보호자가 전문가 상담 시 이 내용을 참고하도록 안내하는 1~2문장 (한국어)",
  "consultRecommended": true/false
}

⚠️ 절대 하지 말아야 할 것:
- 질병명, 장애명 언급 금지 (자폐, ASD, ADHD 등)
- "진단", "판정", "소견", "처방" 등 의료 용어 사용 금지
- 확정적 표현 금지 ("~입니다" 대신 "~이 관찰됩니다" 사용)
- 모든 응답은 반드시 한국어로 작성`,
            },
          ],
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);

    const rawText = claudeData.content?.[0]?.text || "{}";

    let analysis;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        attentionNeeded:     false,
        observationScore:    0,
        behaviors:           [],
        observationSummary:  rawText,
        parentNote:          "전문가와 상담 시 이 기록을 참고하세요.",
        consultRecommended:  true,
      };
    }

    const framePaths = files.map((f) => f.path);

    res.json({
      ok:         true,
      clipId,
      analysis,
      framePaths,
      analyzedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[analyze/frames]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analyze/report ──────────────────────────────────
router.post("/report", async (req, res) => {
  try {
    const { childName, childDaysOld, analysis, clipCount, period } = req.body;

    const prompt = `당신은 보호자의 육아 관찰 내용을 정리해주는 AI 기록 보조 도구입니다.
의료적 진단이나 소견을 작성하는 것이 아니라,
보호자가 소아과 또는 발달 전문가 상담 시 가져갈 수 있는
관찰 기록 요약문을 작성합니다.

반드시 한국어로만 작성하세요.

[관찰 대상]
- 이름: ${childName}
- 생후: ${childDaysOld}일 (약 ${Math.floor(childDaysOld / 30)}개월)

[AI 관찰 기록 요약]
- 주의 행동 관찰 여부: ${analysis.attentionNeeded ? "관찰됨" : "관찰되지 않음"}
- 관찰 참고값: ${analysis.observationScore}점
- 관찰된 행동: ${
      analysis.behaviors
        ?.filter((b) => b.observed)
        .map((b) => b.name)
        .join(", ") || "특이 행동 관찰 없음"
    }
- 관찰 요약: ${analysis.observationSummary}
- 관찰 영상 수: ${clipCount}개 / ${period}

아래 형식으로 작성하세요. 진단, 병명, 장애명은 절대 포함하지 마세요:

# 육아 관찰 기록 요약

**작성일**: ${new Date().toLocaleDateString("ko-KR")}
**관찰 대상**: ${childName} (생후 약 ${Math.floor(childDaysOld / 30)}개월)
**작성 도구**: KidTrack 관찰 기록 앱

## 1. 관찰 기간 및 방법
(관찰 영상 수, 관찰 방법 간략 기술)

## 2. 관찰된 행동 목록
(관찰된 행동을 사실 그대로 나열. 없으면 "특이 행동 관찰되지 않음")

## 3. 관찰 내용 요약
(2~3문장, 사실 기반 서술, 확정적 표현 금지)

## 4. 전문가 상담 시 참고사항
(보호자가 상담 시 이 기록을 어떻게 활용할지 안내)

## ※ 안내사항
본 기록은 보호자가 작성한 관찰 내용을 AI가 정리한 참고 자료입니다.
의료적 진단이나 전문가의 소견을 대체하지 않으며,
반드시 소아과 또는 발달 전문가의 상담을 통해 정확한 평가를 받으시기 바랍니다.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const data   = await claudeRes.json();
    const report = data.content?.[0]?.text || "";

    res.json({ ok: true, report });

  } catch (err) {
    console.error("[analyze/report]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;