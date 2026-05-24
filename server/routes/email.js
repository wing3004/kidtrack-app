import express    from "express";
import nodemailer from "nodemailer";
import multer     from "multer";
import fs         from "fs";
import path       from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router    = express.Router();
const upload    = multer({ dest: path.join(__dirname, "../uploads/tmp/") });

// ── POST /api/email/send-review ───────────────────────────────
// 영상 프레임들 + AI 소견서를 의사 이메일로 전송
router.post("/send-review", upload.array("frames", 30), async (req, res) => {
  try {
    const {
      doctorEmail,
      doctorName,
      childName,
      childDaysOld,
      report,        // AI 소견서 마크다운 텍스트
      analysisJson,  // JSON 문자열
    } = req.body;

    const frames   = req.files || [];
    const analysis = JSON.parse(analysisJson || "{}");

    // Gmail SMTP 설정 (환경변수로 주입)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // Gmail 앱 비밀번호
      },
    });

    // 첨부파일: 프레임 이미지들 (최대 5장)
    const attachments = frames.slice(0, 5).map((f, i) => ({
      filename:    `frame_${i + 1}.jpg`,
      path:        f.path,
      contentType: "image/jpeg",
    }));

    // 소견서를 HTML로 변환 (마크다운 -> 간단 HTML)
    const reportHtml = report
      .replace(/^# (.+)$/gm,  "<h1>$1</h1>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^\*\*(.+)\*\*: (.+)$/gm, "<p><strong>$1</strong>: $2</p>")
      .replace(/^- (.+)$/gm,  "<li>$1</li>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g,   "<br>");

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    body        { font-family: 'Malgun Gothic', sans-serif; color: #1e293b; max-width: 700px; margin: 0 auto; padding: 24px; }
    .header     { background: #1e293b; color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
    .header h1  { margin: 0; font-size: 20px; }
    .header p   { margin: 6px 0 0; font-size: 13px; opacity: 0.7; }
    .alert      { background: ${analysis.flagged ? "#fef2f2" : "#f0fdf4"}; border-left: 4px solid ${analysis.flagged ? "#ef4444" : "#22c55e"}; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px; }
    .alert h3   { margin: 0 0 8px; color: ${analysis.flagged ? "#dc2626" : "#16a34a"}; }
    .report     { background: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .report h1  { font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
    .report h2  { font-size: 15px; color: #475569; margin-top: 20px; }
    .footer     { margin-top: 24px; padding: 16px; background: #f1f5f9; border-radius: 8px; font-size: 12px; color: #64748b; }
    .badge      { display: inline-block; background: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🩺 KidTrack AI — 의사 검토 요청</h1>
    <p>${childName} 보호자가 AI 분석 소견 검토를 요청했습니다.</p>
  </div>

  <p>안녕하세요, <strong>${doctorName}</strong> 선생님.</p>
  <p>KidTrack 앱을 통해 아래 환아의 행동 영상이 AI 분석되었습니다. 검토 및 피드백을 부탁드립니다.</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:8px;color:#64748b;width:120px;">환아</td><td style="padding:8px;font-weight:bold;">${childName}</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:8px;color:#64748b;">생후</td><td style="padding:8px;">${childDaysOld}일 (약 ${Math.floor(childDaysOld / 30)}개월)</td></tr>
    <tr><td style="padding:8px;color:#64748b;">분석일시</td><td style="padding:8px;">${new Date().toLocaleString("ko-KR")}</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:8px;color:#64748b;">신뢰도</td><td style="padding:8px;"><span class="badge">${analysis.confidence ?? "-"}%</span></td></tr>
  </table>

  <div class="alert">
    <h3>${analysis.flagged ? "⚠️ 이상 행동 감지됨" : "✅ 특이 소견 없음"}</h3>
    <p style="margin:0;font-size:14px;">${analysis.summary || ""}</p>
  </div>

  <div class="report">
    ${reportHtml}
  </div>

  <div class="footer">
    <p>📎 첨부 파일: 행동 영상 프레임 ${frames.length}장</p>
    <p>이 메일은 KidTrack AI 시스템에서 자동 발송되었습니다. 의사의 피드백은 AI 모델 재학습에 활용됩니다.</p>
    <p style="margin-top:12px;color:#94a3b8;">⚠️ 본 소견서는 AI 보조 도구에 의해 생성된 것으로, 전문 의료진의 진단을 대체하지 않습니다.</p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from:        `"KidTrack AI" <${process.env.MAIL_USER}>`,
      to:          doctorEmail,
      subject:     `[KidTrack] ${childName} AI 소견 검토 요청 — ${new Date().toLocaleDateString("ko-KR")}`,
      html,
      attachments,
    });

    // 임시 파일 정리
    frames.forEach((f) => { try { fs.unlinkSync(f.path); } catch {} });

    res.json({ ok: true, message: "이메일이 전송되었습니다." });

  } catch (err) {
    console.error("[email/send-review]", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;