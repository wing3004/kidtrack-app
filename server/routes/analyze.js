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

    let localHint = {};
    try { localHint = JSON.parse(req.body.localAnalysisHint || "{}"); } catch {}

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

    // 로컬 모션 분석 힌트 문자열 구성
    const hintText = (localHint.attentionFlags?.length > 0 || localHint.repetitiveDetected)
      ? `
[기기 사전 모션 분석 데이터 — 참고용]
- 반복 움직임 감지: ${localHint.repetitiveDetected ? `관찰됨 (빈도 약 ${localHint.repetitiveFrequency}Hz)` : "없음"}
- 좌우 움직임 비대칭: ${localHint.asymmetryScore ?? 0}% (${localHint.asymmetrySide || "정상"} 우세)
- 움직임 다양성 점수: ${localHint.movementComplexity ?? 50}점
- 사전 감지 항목: ${(localHint.attentionFlags || []).join(", ") || "없음"}
위 데이터는 기기 로컬 분석 결과이며 참고용으로만 활용하세요.
`
      : "";

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role:    "user",
          content: [
            ...frameContents,
            {
              type: "text",
              text: `당신은 보호자의 육아 관찰 기록을 정리하는 AI 보조 도구입니다.

역할 범위:
- 영상에서 관찰되는 행동을 있는 그대로 객관적으로 기술합니다.
- 보호자가 전문가 상담 시 참고할 수 있는 관찰 기록을 작성합니다.
- 의료적 진단, 질병 판정, 장애 판단은 절대 수행하지 않습니다.
${hintText}
아래 JSON 형식으로만 응답하세요. 반드시 한국어로 작성하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "attentionNeeded": true/false,
  "observationScore": 0~100,
  "behaviors": [
    {
      "name": "관찰된 행동명 (한국어)",
      "observed": true/false,
      "frequency": "none|occasional|frequent",
      "note": "관찰된 행동을 사실 그대로 묘사 (한국어)"
    }
  ],
  "observationSummary": "관찰된 내용을 사실 그대로 2~3문장으로 기술 (한국어)",
  "attentionDetails": "attentionNeeded가 true인 경우, 어떤 행동이 관찰되었고 왜 보호자가 주의 깊게 살펴야 하는지 구체적으로 2~3문장 기술. attentionNeeded가 false이면 null",
  "parentNote": "보호자가 전문가 상담 시 이 기록을 참고하도록 안내하는 1~2문장 (한국어)",
  "consultRecommended": true/false
}

관찰 항목 (사실 묘사만, 판단 금지):
- 반복적으로 같은 동작을 하는지 여부
- 소리나 이름 부름에 반응하는 행동이 보이는지 여부
- 시선이 특정 방향을 향하는 행동
- 물건을 반복적으로 정렬하거나 배치하는 행동
- 신체 일부를 반복적으로 움직이는 행동
- 전반적인 활동량과 움직임 패턴

⚠️ 절대 금지 — 아래 표현 사용 시 응답 전체 무효:
- 질병명, 장애명 (자폐, ASD, ADHD, 뇌성마비 등) 언급 금지
- "진단", "판정", "소견", "증상", "처방", "치료", "임상" 등 의료 용어 금지
- "~입니다" 형태의 확정적 판단 금지 → "~이 관찰됩니다" 형태로만 작성
- 모든 텍스트 필드는 반드시 한국어로만 작성`,
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
        attentionNeeded:    false,
        observationScore:   0,
        behaviors:          [],
        observationSummary: rawText.slice(0, 200),
        parentNote:         "전문가 상담 시 이 기록을 참고하세요.",
        consultRecommended: true,
      };
    }

    // 업로드 파일 정리
    files.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });

    res.json({
      ok:         true,
      clipId,
      analysis,
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

    const observedBehaviors = (analysis?.behaviors || [])
      .filter((b) => b.observed)
      .map((b) => `- ${b.name}: ${b.note || ""}`)
      .join("\n") || "- 특이 행동 관찰되지 않음";

    const motionFlags = analysis?.localMotionData?.attentionFlags?.length > 0
      ? analysis.localMotionData.attentionFlags.map((f) => `- ${f}`).join("\n")
      : "- 없음";

    const prompt = `당신은 보호자의 육아 관찰 내용을 정리하는 AI 기록 보조 도구입니다.

역할 범위:
- 보호자가 소아과 또는 발달 전문가 상담 시 가져갈 관찰 기록 요약문을 작성합니다.
- 의료적 진단, 질병 판정은 절대 수행하지 않습니다.
- 반드시 한국어로만 작성합니다.

[관찰 대상]
- 이름: ${childName}
- 생후: ${childDaysOld}일 (약 ${Math.floor(childDaysOld / 30)}개월)

[관찰 기록 데이터]
- 주의 행동 관찰 여부: ${analysis?.attentionNeeded ? "관찰됨" : "관찰되지 않음"}
- 관찰 참고값: ${analysis?.observationScore ?? 0}점
- 관찰 영상 수: ${clipCount}개 / ${period}

[관찰된 행동 목록]
${observedBehaviors}

[기기 모션 분석 데이터]
${motionFlags}

[보호자 안내 메모]
${analysis?.parentNote || ""}

아래 형식으로 작성하세요.
질병명, 장애명, 의료 용어, 확정적 판단 표현은 절대 사용하지 마세요.

# 육아 관찰 기록 요약

**작성일**: ${new Date().toLocaleDateString("ko-KR")}
**관찰 대상**: ${childName} (생후 약 ${Math.floor(childDaysOld / 30)}개월)
**기록 도구**: KidTrack 관찰 기록 앱 (AI 보조)

## 1. 관찰 개요
(관찰 영상 수, 관찰 방법 간략 기술. 2문장)

## 2. 관찰된 행동 목록
(관찰된 행동을 사실 그대로 나열. 없으면 "특이 행동 관찰되지 않음"으로 작성)

## 3. 관찰 내용 요약
(사실 기반 서술, 2~3문장. "~이 관찰되었습니다" 형태로만 작성)

## 4. 주의 관찰 항목 상세 설명
(주의 행동이 관찰된 경우, 어떤 행동이 어떤 방식으로 관찰되었고 왜 보호자가 주의 깊게 살펴봐야 하는지 구체적으로 기술.
관찰된 행동이 없으면 "관찰 기간 중 특이 행동이 관찰되지 않았습니다."로 작성)

## 5. 전문가 상담 시 참고사항
(보호자가 상담 시 이 기록을 어떻게 활용할지 안내. 2~3가지)

## ※ 안내사항
본 기록은 보호자가 KidTrack 앱을 통해 수집한 관찰 내용을 AI가 정리한 참고 자료입니다.
의료적 진단이나 전문가의 판단을 대체하지 않으며,
정확한 평가는 반드시 소아과 또는 발달 전문가와의 상담을 통해 받으시기 바랍니다.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 1500,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const data   = await claudeRes.json();
    if (data.error) throw new Error(data.error.message);

    const report = data.content?.[0]?.text || "";
    res.json({ ok: true, report });

  } catch (err) {
    console.error("[analyze/report]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analyze/activity ────────────────────────────────
router.post("/activity", upload.array("frames", 20), async (req, res) => {
  try {
    const files         = req.files;
    const activityTitle = req.body.activityTitle || "활동";
    const activityDesc  = req.body.activityDesc  || "";

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "프레임 이미지가 없습니다." });
    }

    const frameContents = files.slice(0, 8).map((f) => {
      const data = fs.readFileSync(f.path);
      return {
        type:   "image",
        source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") },
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
        model:      "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role:    "user",
          content: [
            ...frameContents,
            {
              type: "text",
              text: `당신은 육아 활동 수행 여부를 관찰 기록하는 AI 보조 도구입니다.
반드시 한국어로만 답변하세요.

역할 범위:
- 영상에서 아이가 제시된 활동을 어느 정도 수행했는지 관찰 기록합니다.
- 보호자가 활동을 더 잘 도울 수 있도록 참고 정보를 제공합니다.
- 의료적 진단, 장애 판정은 절대 수행하지 않습니다.

[오늘의 활동 정보]
활동명: ${activityTitle}
활동 방법: ${activityDesc}

위 활동 영상을 관찰하고 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

{
  "participationLevel": "high|medium|low",
  "observedBehaviors": ["관찰된 행동을 사실 그대로 기술 (2~3개, 한국어)"],
  "activitySummary": "활동 수행 모습을 사실 그대로 2문장으로 기술 (한국어)",
  "encouragement": "보호자와 아이에게 전하는 긍정적 격려 메시지 1문장 (한국어)",
  "improvementTips": ["다음에 시도해볼 수 있는 참고 방법 1~2가지 (한국어)"],
  "continueActivity": true
}

⚠️ 절대 금지:
- 질병명, 장애명, 의료 용어 사용 금지
- "정상/비정상", "문제", "이상" 등 판단 표현 금지
- 확정적 의료 판단 금지
- 모든 텍스트는 반드시 한국어로만 작성`,
            },
          ],
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);

    const rawText = claudeData.content?.[0]?.text || "{}";
    let feedback;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      feedback = JSON.parse(cleaned);
    } catch {
      feedback = {
        participationLevel: "medium",
        observedBehaviors:  ["활동을 시도하는 모습이 관찰되었습니다"],
        activitySummary:    "활동에 참여하는 모습이 관찰되었습니다.",
        encouragement:      "잘 하고 있어요! 계속 함께 해보세요.",
        improvementTips:    ["다음에도 같은 활동을 반복해보세요"],
        continueActivity:   true,
      };
    }

    files.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });
    res.json({ ok: true, feedback, analyzedAt: new Date().toISOString() });

  } catch (err) {
    console.error("[analyze/activity]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;