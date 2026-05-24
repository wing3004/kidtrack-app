import express    from "express";
import nodemailer from "nodemailer";
import multer     from "multer";
import fs         from "fs";
import path       from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router    = express.Router();

// 임시 파일 저장 (메모리 사용으로 변경 — 파일 시스템 의존 제거)
const upload = multer({ storage: multer.memoryStorage() });

router.post("/send-review", upload.array("frames", 30), async (req, res) => {
  try {
    const {
      doctorEmail,
      doctorName,
      childName,
      childDaysOld,
      report,
      analysisJson,
    } = req.body;

    if (!doctorEmail) {
      return res.status(400).json({ error: "의사 이메일이 없습니다." });
    }
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      return res.status(500).json({ error: "메일 환경변수(MAIL_USER, MAIL_PASS)가 설정되지 않았습니다." });
    }

    let analysis = {};
    try { analysis = JSON.parse(analysisJson || "{}"); } catch {}

    const transporter = nodemailer.createTransport({
      host:   "smtp.gmail.com",
      port:   465,
      secure: true,           // SSL
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    // 연결 테스트
    await transporter.verify();

    // 첨부파일 (메모리에서 직접)
    const attachments = (req.files || []).slice(0, 5).map((f, i) => ({
      filename:    `frame_${i + 1}.jpg`,
      content:     f.buffer,
      contentType: "image/jpeg",
    }));

    const reportHtml = (report || "")
      .replace(/^# (.+)$/gm,   "<h1 style='font-size:18px;border-bottom:2px solid #3b82f6;padding-bottom:8px'>$1</h1>")
      .replace(/^## (.+)$/gm,  "<h2 style='font-size:15px;color:#475569;margin-top:20px'>$1</h2>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.+)$/gm,   "<li>$1</li>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g,   "<br>");

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:sans-serif;color:#1e293b;max-width:680px;margin:0 auto;padding:24px">
  <div style="background:#1e293b;color:white;padding:24px;border-radius:12px;margin-bottom:24px">
    <h1 style="margin:0;font-size:20px">🩺 KidTrack AI — 의사 검토 요청</h1>
    <p style="margin:6px 0 0;opacity:0.7;font-size:13px">${childName || "환아"} 보호자가 AI 분석 소견 검토를 요청했습니다.</p>
  </div>

  <p>안녕하세요, <strong>${doctorName || "선생님"}</strong>.</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:8px;color:#64748b;width:100px">환아</td><td style="padding:8px;font-weight:bold">${childName || "-"}</td></tr>
    <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">생후</td><td style="padding:8px">${childDaysOld}일 (약 ${Math.floor((childDaysOld||0)/30)}개월)</td></tr>
    <tr><td style="padding:8px;color:#64748b">분석일시</td><td style="padding:8px">${new Date().toLocaleString("ko-KR")}</td></tr>
    <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b">이상감지</td><td style="padding:8px;font-weight:bold;color:${analysis.flagged?"#dc2626":"#16a34a"}">${analysis.flagged ? "⚠️ 감지됨" : "✅ 없음"}</td></tr>
  </table>

  <div style="background:${analysis.flagged?"#fef2f2":"#f0fdf4"};border-left:4px solid ${analysis.flagged?"#ef4444":"#22c55e"};padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
    <p style="margin:0;font-size:14px">${analysis.summary || report?.slice(0,200) || ""}</p>
  </div>

  <div style="background:#f8fafc;padding:24px;border-radius:12px;border:1px solid #e2e8f0">
    ${reportHtml}
  </div>

  <div style="margin-top:24px;padding:16px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#64748b">
    <p>📎 첨부 프레임: ${attachments.length}장</p>
    <p style="margin-top:8px;color:#94a3b8">⚠️ 본 소견서는 AI 보조 도구에 의해 생성된 것으로, 전문 의료진의 진단을 대체하지 않습니다.</p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from:        `"KidTrack AI" <${process.env.MAIL_USER}>`,
      to:          doctorEmail,
      subject:     `[KidTrack] ${childName || "환아"} AI 소견 검토 요청 — ${new Date().toLocaleDateString("ko-KR")}`,
      html,
      attachments,
    });

    res.json({ ok: true, message: "이메일이 전송되었습니다." });

  } catch (err) {
    console.error("[email/send-review] 상세 오류:", err);
    // 클라이언트에 구체적인 에러 메시지 전달
    res.status(500).json({
      error: err.message || "이메일 전송 실패",
      detail: err.code || "",
    });
  }
});

export default router;