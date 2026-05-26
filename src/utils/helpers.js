export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

// 일반 텍스트 AI 호출 — /api/chat 으로 변경
export async function callAI(prompt) {
  const res = await fetch(`${BASE}/api/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// 영상 프레임 분석 (Vision)
export async function analyzeFrames({ frames, childId, clipId, localAnalysisHint }) {
  const fd = new FormData();
  frames.forEach((blob, i) => fd.append("frames", blob, `frame_${i}.jpg`));
  fd.append("childId", childId);
  fd.append("clipId",  clipId);
  if (localAnalysisHint) fd.append("localAnalysisHint", localAnalysisHint);

  const res = await fetch(`${BASE}/api/analyze/frames`, {
    method: "POST",
    body:   fd,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "분석 실패");
  }
  return res.json();
}

// AI 소견서 텍스트 생성
export async function generateReport({ childName, childDaysOld, analysis, clipCount, period }) {
  const res = await fetch(`${BASE}/api/analyze/report`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ childName, childDaysOld, analysis, clipCount, period }),
  });
  if (!res.ok) throw new Error("소견서 생성 실패");
  return res.json();
}

// 의사에게 이메일 전송
export async function sendDoctorReview({ doctorEmail, doctorName, childName, childDaysOld, report, analysis, frames }) {
  const fd = new FormData();
  fd.append("doctorEmail",  doctorEmail);
  fd.append("doctorName",   doctorName);
  fd.append("childName",    childName);
  fd.append("childDaysOld", String(childDaysOld));
  fd.append("report",       report);
  fd.append("analysisJson", JSON.stringify(analysis));
  frames.forEach((blob, i) => fd.append("frames", blob, `frame_${i}.jpg`));

  const res = await fetch(`${BASE}/api/email/send-review`, {
    method: "POST",
    body:   fd,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "이메일 전송 실패");
  }
  return res.json();
}