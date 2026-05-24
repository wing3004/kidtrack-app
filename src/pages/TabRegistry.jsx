import { useState } from "react";
import { cn, callAI } from "../utils/helpers";
import Button from "../components/Button";
import Modal from "../components/Modal";

export default function TabRegistry({ state, dispatch, onToast }) {
  const [selectedReport, setSelectedReport] = useState(null);
  const [generating,     setGenerating]     = useState(false);
  const [summaryText,    setSummaryText]     = useState("");
  const [summaryErr,     setSummaryErr]      = useState("");
  const [qrVisible,      setQrVisible]       = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [doctorEmail,    setDoctorEmail]     = useState("");
  const [doctorName,     setDoctorName]      = useState("");
  const [sending,        setSending]         = useState(false);

  const reports = state.allReports;

  // AI 소견서 종합 요약 생성
  const generateSummary = async () => {
    if (reports.length === 0) {
      onToast("⚠️ 생성된 소견서가 없습니다.");
      return;
    }
    setGenerating(true);
    setSummaryText("");
    setSummaryErr("");
    try {
      const reportSummaries = reports
        .slice(0, 10)
        .map((r, i) =>
          `[${i + 1}번 소견 / ${new Date(r.createdAt).toLocaleDateString("ko-KR")}]\n` +
          `이상 감지: ${r.analysis?.flagged ? "예" : "아니오"} / ` +
          `신뢰도: ${r.analysis?.confidence ?? "-"}% / ` +
          `요약: ${r.analysis?.summary || "없음"}`
        )
        .join("\n\n");

      const prompt = `당신은 소아 신경발달 전문 AI입니다.
아래는 ${state.child.name}(생후 ${Math.floor(state.child.daysOld / 30)}개월)의 누적 AI 소견 데이터입니다.

${reportSummaries}

위 누적 데이터를 종합하여 담당 의사에게 제출할 요약 소견서를 한국어로 작성하세요.

# 종합 AI 임상 소견서

**환아**: ${state.child.name} (생후 ${Math.floor(state.child.daysOld / 30)}개월)
**분석 기간**: ${reports.length}개 소견 누적
**작성일**: ${new Date().toLocaleDateString("ko-KR")}

## 1. 전체 관찰 요약
(2~3문장)

## 2. 주요 반복 관찰 행동
(실제 데이터 기반, bullet point)

## 3. 종합 임상 소견
(3~4문장)

## 4. 의사 권고 사항
(2~3가지)

## 5. 주의사항
이 소견서는 AI 보조 분석 도구에 의해 생성되었으며, 전문 의료진의 진단을 대체하지 않습니다.`;

      const result = await callAI(prompt);
      setSummaryText(result);
    } catch (e) {
      setSummaryErr(e.message);
    }
    setGenerating(false);
  };

  // 의사에게 이메일 전송
  const handleSendReview = async () => {
    if (!doctorEmail) { onToast("의사 이메일을 입력해주세요."); return; }
    if (!summaryText)  { onToast("먼저 AI 소견서 요약을 생성해주세요."); return; }
    setSending(true);
    try {
      const { sendDoctorReview } = await import("../utils/helpers");
      // 가장 최근 소견서 분석 데이터 사용
      const latestAnalysis = reports[0]?.analysis || {};
      await sendDoctorReview({
        doctorEmail,
        doctorName:    doctorName || "담당 의사",
        childName:     state.child.name,
        childDaysOld:  state.child.daysOld,
        report:        summaryText,
        analysis:      { ...latestAnalysis, summary: summaryText.slice(0, 200) },
        frames:        [], // 소견서 탭에서는 프레임 없이 텍스트만
      });
      // 전송 완료 표시
      dispatch({
        type: "ADD_NOTIFICATION",
        notification: {
          id:   "n_review_" + Date.now(),
          text: `${doctorName || "담당 의사"} 선생님께 소견서를 전송했습니다.`,
          time: "방금",
          read: false,
        },
      });
      setShowReviewModal(false);
      onToast("📨 담당 의사에게 소견서가 전송되었습니다.");
    } catch (e) {
      onToast("❌ 전송 실패: " + e.message);
    }
    setSending(false);
  };

  return (
    <div className="p-4 space-y-4">

      {/* 헤더 */}
      <div className="bg-slate-800 text-white p-4 rounded-xl shadow-lg">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="font-bold text-base">AI 소견서 보관함</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              모니터링에서 생성된 소견서 {reports.length}건
            </p>
          </div>
          <span className="text-green-400 text-xl">🛡️</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-slate-700 rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold text-white">{reports.length}</p>
            <p className="text-[10px] text-slate-400">누적 소견서</p>
          </div>
          <div className="bg-slate-700 rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold text-red-400">
              {reports.filter((r) => r.analysis?.flagged).length}
            </p>
            <p className="text-[10px] text-slate-400">이상 감지 건</p>
          </div>
        </div>

        <div className="space-y-2">
          <Button variant="primary" onClick={generateSummary} disabled={generating}>
            {generating ? "⏳ 요약 생성 중..." : "📄 AI 종합 소견서 요약 생성"}
          </Button>
          <button
            onClick={() => { setQrVisible(!qrVisible); onToast("🔗 QR 코드가 생성되었습니다."); }}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2.5 rounded-lg transition-colors"
          >
            📱 주치의용 QR 코드 생성
          </button>
        </div>
      </div>

      {/* QR 코드 */}
      {qrVisible && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
          <p className="text-xs text-slate-500 mb-3">주치의에게 이 QR을 보여주세요</p>
          <div className="inline-block bg-white p-3 border-4 border-slate-900 rounded-xl">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <rect x="5"  y="5"  width="35" height="35" rx="3" fill="none" stroke="#000" strokeWidth="4"/>
              <rect x="12" y="12" width="21" height="21" rx="1" fill="#000"/>
              <rect x="80" y="5"  width="35" height="35" rx="3" fill="none" stroke="#000" strokeWidth="4"/>
              <rect x="87" y="12" width="21" height="21" rx="1" fill="#000"/>
              <rect x="5"  y="80" width="35" height="35" rx="3" fill="none" stroke="#000" strokeWidth="4"/>
              <rect x="12" y="87" width="21" height="21" rx="1" fill="#000"/>
              {[0,1,2,3,4,5,6].map((row) =>
                [0,1,2,3,4,5,6].map((col) => {
                  const skip = (row<2&&col<2)||(row<2&&col>4)||(row>4&&col<2);
                  if (skip) return null;
                  const on = (row + col * 3 + row * col) % 3 !== 0;
                  if (!on) return null;
                  return <rect key={`${row}${col}`} x={45+col*10} y={45+row*10} width={8} height={8} fill="#000" rx="1"/>;
                })
              )}
            </svg>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            생성일: {new Date().toLocaleDateString("ko-KR")} · 유효기간 7일
          </p>
        </div>
      )}

      {/* AI 종합 요약 결과 */}
      {(summaryText || summaryErr) && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          {summaryErr ? (
            <p className="text-sm text-red-600">⚠️ {summaryErr}</p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 text-sm">📋 AI 종합 소견서</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard?.writeText(summaryText); onToast("📋 복사되었습니다."); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    복사
                  </button>
                  <button
                    onClick={() => setShowReviewModal(true)}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    전송
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg max-h-52 overflow-y-auto no-scroll">
                {summaryText}
              </div>
              <button
                onClick={() => setShowReviewModal(true)}
                className="mt-3 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                📨 담당 의사에게 검토 요청
              </button>
            </>
          )}
        </div>
      )}

      {/* 소견서 목록 */}
      {reports.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">소견서 이력</h3>
          </div>
          {reports.map((r) => (
            <button
              key={r.id}
              className="w-full text-left p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors flex items-center gap-3"
              onClick={() => setSelectedReport(selectedReport?.id === r.id ? null : r)}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg",
                  r.analysis?.flagged ? "bg-red-100" : "bg-green-100"
                )}
              >
                {r.analysis?.flagged ? "⚠️" : "✅"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800">
                  {new Date(r.createdAt).toLocaleString("ko-KR", {
                    month: "numeric", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {r.analysis?.flagged ? "이상 행동 감지" : "특이 소견 없음"} ·
                  신뢰도 {r.analysis?.confidence ?? "-"}%
                </p>
              </div>
              <span className="text-slate-300 text-sm">
                {selectedReport?.id === r.id ? "▲" : "▼"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 선택된 소견서 상세 */}
      {selectedReport && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">소견서 상세</h3>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg max-h-60 overflow-y-auto no-scroll">
            {selectedReport.reportText || "소견서 본문이 없습니다."}
          </div>
        </div>
      )}

      {/* 데이터 없음 */}
      {reports.length === 0 && !generating && !summaryText && (
        <div className="py-10 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm text-slate-500 font-semibold">아직 소견서가 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">
            모니터링 탭에서 영상을 촬영하고 분석하면<br />여기에 자동으로 저장됩니다.
          </p>
        </div>
      )}

      {/* 의사 검토 요청 모달 */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="담당 의사에게 검토 요청"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            AI 종합 소견서가 담당 의사의 이메일로 전송됩니다.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">의사 이름</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="예: 이수민"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                의사 이메일 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                placeholder="doctor@hospital.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <Button
            variant="primary"
            onClick={handleSendReview}
            disabled={sending || !doctorEmail}
          >
            {sending ? "⏳ 전송 중..." : "📨 소견서 전송"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}