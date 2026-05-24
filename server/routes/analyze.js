import express from "express";
import multer  from "multer";
import fs      from "fs";
import path    from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router    = express.Router();

// uploads 폴더 자동 생성
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// multer: 영상 + 프레임 이미지 저장
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file,  cb) => {
    const ext  = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const ok = /video\/|image\//.test(file.mimetype);
    cb(ok ? null : new Error("영상 또는 이미지 파일만 허용됩니다."), ok);
  },
});

// ── POST /api/analyze/frames ──────────────────────────────────
// 프론트에서 영상 프레임(JPEG 이미지)들을 보내면 Claude Vision으로 분석
router.post("/frames", upload.array("frames", 30), async (req, res) => {
  try {
    const files   = req.files;           // 프레임 이미지 배열
    const childId = req.body.childId || "unknown";
    const clipId  = req.body.clipId  || `clip_${Date.now()}`;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "프레임 이미지가 없습니다." });
    }

    // 프레임 이미지를 base64로 변환
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

    // Claude Vision 호출
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
        messages: [
          {
            role:    "user",
            content: [
              ...frameContents,
              {
                type: "text",
                text: `당신은 소아 신경발달 전문 AI입니다.
위 영상 프레임들은 영유아(ID: ${childId})의 일상 행동을 촬영한 것입니다.

다음 항목들을 분석하여 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "flagged": true/false,
  "confidence": 0~100,
  "behaviors": [
    { "name": "행동명", "observed": true/false, "severity": "none|mild|moderate|severe", "note": "설명" }
  ],
  "summary": "2~3문장 요약",
  "recommendation": "부모/보호자를 위한 권고사항 1~2문장",
  "needsDoctorReview": true/false
}

분석할 행동 항목:
- 상동 행동 (손 흔들기, 몸 튕기기, 빙글빙글 돌기)
- 호명 반응 (카메라/소리에 반응하는지)
- 눈 맞춤 시도
- 반복적 물건 배열
- 자해 행동
- 과잉행동/충동성

근거 없는 진단은 하지 말고, 관찰된 사실만 기술하세요.`,
              },
            ],
          },
        ],
      }),
    });

    const claudeData = await claudeRes.json();

    if (claudeData.error) {
      throw new Error(claudeData.error.message);
    }

    const rawText = claudeData.content?.[0]?.text || "{}";

    // JSON 파싱 (Claude가 markdown 코드블록으로 감쌀 경우 처리)
    let analysis;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        flagged:           false,
        confidence:        0,
        behaviors:         [],
        summary:           rawText,
        recommendation:    "분석 결과를 파싱하는 데 실패했습니다. 다시 시도해주세요.",
        needsDoctorReview: true,
      };
    }

    // 업로드된 프레임 파일 경로 보존 (이메일 첨부용)
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
// 분석 결과를 바탕으로 정식 AI 소견서(텍스트) 생성
router.post("/report", async (req, res) => {
  try {
    const { childName, childDaysOld, analysis, clipCount, period } = req.body;

    const prompt = `당신은 소아 신경발달 전문 AI 소견서 작성 시스템입니다.
아래 관찰 분석 데이터를 바탕으로 의사에게 제출할 공식 AI 소견서를 작성하세요.

[환아 정보]
- 이름: ${childName}
- 생후: ${childDaysOld}일 (약 ${Math.floor(childDaysOld / 30)}개월)

[AI 행동 분석 요약]
- 이상 행동 감지: ${analysis.flagged ? "예" : "아니오"}
- 신뢰도: ${analysis.confidence}%
- 주요 관찰 행동: ${analysis.behaviors?.filter((b) => b.observed).map((b) => b.name).join(", ") || "없음"}
- 분석 요약: ${analysis.summary}
- 분석 기간 클립 수: ${clipCount}개 / ${period}

다음 형식으로 작성하세요:

# AI 임상 소견서

**작성일**: (오늘 날짜)
**환아**: ${childName} (생후 ${Math.floor(childDaysOld / 30)}개월)
**분석 시스템**: KidTrack AI v1.0

## 1. 관찰 개요
(2~3문장)

## 2. 주요 관찰 행동
(bullet point로 관찰된 행동 나열, 없으면 '특이 소견 없음'으로)

## 3. AI 분석 소견
(3~4문장, 임상적 의미 서술)

## 4. 권고사항
(의사에게 권고하는 사항 2~3가지)

## 5. 주의사항
이 소견서는 AI 보조 분석 도구에 의해 생성되었으며, 전문 의료진의 진단을 대체하지 않습니다.

마크다운 형식으로 작성하세요.`;

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

    const data    = await claudeRes.json();
    const report  = data.content?.[0]?.text || "";

    res.json({ ok: true, report });

  } catch (err) {
    console.error("[analyze/report]", err);
    res.status(500).json({ error: err.message });
  }
});



export default router;