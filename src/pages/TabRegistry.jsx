import { useState } from "react";
import { cn, callAI } from "../utils/helpers";
import Button from "../components/Button";
import Modal from "../components/Modal";

export default function TabRegistry({ state, dispatch, onToast }) {
  const [selectedReport,  setSelectedReport]  = useState(null);
  const [generating,      setGenerating]      = useState(false);
  const [summaryText,     setSummaryText]     = useState("");
  const [summaryErr,      setSummaryErr]      = useState("");
  const [qrVisible,       setQrVisible]       = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [doctorEmail,     setDoctorEmail]     = useState("");
  const [doctorName,      setDoctorName]      = useState("");
  const [sending,         setSending]         = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const reports = state.allReports;

  // 관찰 기록 요약문 종합 요약 생성
  const generateSummary = async () => {
    if (reports.length === 0) {
      onToast("⚠️ 생성된 관찰 기록 요약이 없습니다.");
      return;
    }
    setGenerating(true);
    setSummaryText("");
    setSummaryErr("");
    try {
      const reportSummaries = reports
        .slice(0, 10)
        .map((r, i) =>
          `[${i + 1}번 기록 / ${new Date(r.createdAt).toLocaleDateString("ko-KR")}]\n` +
          `이상 감지: ${r.analysis?.attentionNeeded ? "예" : "아니오"} / ` +
          `신뢰도: ${r.analysis?.confidence ?? "-"}% / ` +
          `요약: ${r.analysis?.summary || "없음"}`
        )
        .join("\n\n");

      const prompt = `당신은 보호자의 육아 관찰 기록을 정리하는 AI 보조 도구입니다.
반드시 한국어로만 작성하세요.

아래는 ${state.child.name}(생후 ${Math.floor(state.child.daysOld / 30)}개월)의
누적 관찰 기록입니다.

${reportSummaries}

위 기록을 종합하여 전문가 상담 시 제출할 관찰 기록 요약문을 작성하세요.

# 육아 관찰 기록 종합 요약

**작성일**: ${new Date().toLocaleDateString("ko-KR")}
**관찰 대상**: ${state.child.name} (생후 ${Math.floor(state.child.daysOld / 30)}개월)
**관찰 기록 수**: ${reports.length}건

## 1. 전체 관찰 기간 요약
(관찰된 내용을 사실 그대로 2~3문장)

## 2. 반복적으로 관찰된 행동
(사실 기반 나열, 진단 표현 없이)

## 3. 전문가 상담 시 참고사항
(보호자가 상담 시 이 기록을 어떻게 활용할지 안내, 2~3가지)

## ※ 안내사항
본 문서는 보호자가 작성한 관찰 기록을 AI가 정리한 참고 자료입니다.
의료적 진단이나 전문가의 소견을 대체하지 않으며,
반드시 소아과 또는 발달 전문가의 상담을 통해 정확한 평가를 받으시기 바랍니다.

⚠️ 절대 금지: 질병명, 장애명, 의료 용어, 확정적 판단 표현 사용 금지`;

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
    if (!summaryText)  { onToast("먼저 AI 관찰 기록 요약을 생성해주세요."); return; }
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
        frames:        [], // 관찰 기록 탭에서는 프레임 없이 텍스트만
      });
      // 전송 완료 표시
      dispatch({
        type: "ADD_NOTIFICATION",
        notification: {
          id:   "n_review_" + Date.now(),
          text: `${doctorName || "담당 의사"} 선생님께 관찰 기록을 전송했습니다.`,
          time: "방금",
          read: false,
        },
      });
      setShowReviewModal(false);
      onToast("📨 담당 의사에게 관찰 기록이 전송되었습니다.");
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
            <h2 className="font-bold text-base">AI 관찰 기록 보관함</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              모니터링에서 생성된 관찰 기록 {reports.length}건
            </p>
          </div>
          <span className="text-green-400 text-xl">🛡️</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-slate-700 rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold text-white">{reports.length}</p>
            <p className="text-[10px] text-slate-400">누적 관찰 기록</p>
          </div>
          <div className="bg-slate-700 rounded-lg p-2.5 text-center">
            <p className="text-xl font-bold text-red-400">
              {reports.filter((r) => r.analysis?.attentionNeeded).length}
            </p>
            <p className="text-[10px] text-slate-400">이상 감지 건</p>
          </div>
        </div>

        <div className="space-y-2">
          <Button variant="primary" onClick={generateSummary} disabled={generating}>
            {generating ? "⏳ 요약 생성 중..." : "📄 종합 관찰 기록 요약 생성"}
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
                <h3 className="font-bold text-slate-800 text-sm">📋 AI 종합 관찰 기록</h3>
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

      {/* 관찰 기록 목록 */}
      {reports.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">관찰 기록 이력</h3>
          </div>
          {reports.map((r) => (
            <div
              key={r.id}
              className="w-full text-left p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer"
              onClick={() => setSelectedReport(selectedReport?.id === r.id ? null : r)}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg",
                  r.analysis?.attentionNeeded ? "bg-red-100" : "bg-green-100"
                )}
              >
                {r.analysis?.attentionNeeded ? "⚠️" : "✅"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800">
                  {new Date(r.createdAt).toLocaleString("ko-KR", {
                    month: "numeric", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {r.analysis?.attentionNeeded ? "주의 행동 관찰됨" : "특이 행동 관찰 없음"} ·
                  신뢰도 {r.analysis?.confidence ?? "-"}%
                </p>
              </div>
              <span className="text-slate-300 text-sm mr-1">
                {selectedReport?.id === r.id ? "▲" : "▼"}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(r.id); }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="삭제"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 선택된 관찰 기록 상세 */}
      {selectedReport && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">관찰 기록 상세</h3>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg max-h-60 overflow-y-auto no-scroll">
            {selectedReport.reportText || "관찰 기록 본문이 없습니다."}
          </div>
        </div>
      )}

      {/* 데이터 없음 */}
      {reports.length === 0 && !generating && !summaryText && (
        <div className="py-10 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm text-slate-500 font-semibold">아직 관찰 기록이 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">
            모니터링 탭에서 영상을 촬영하고 분석하면<br />여기에 자동으로 저장됩니다.
          </p>
        </div>
      )}

      {/* 관찰 기록 삭제 확인 모달 */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="관찰 기록 삭제"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            이 관찰 기록을 삭제하시겠습니까?<br />
            <span className="text-red-500 font-bold">삭제된 기록은 복구할 수 없습니다.</span>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
              취소
            </Button>
            <button
              onClick={() => {
                dispatch({ type: "DELETE_REPORT", reportId: deleteConfirmId });
                if (selectedReport?.id === deleteConfirmId) setSelectedReport(null);
                setDeleteConfirmId(null);
                onToast("🗑 관찰 기록이 삭제되었습니다.");
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </Modal>

      {/* 의사 검토 요청 모달 */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="담당 의사에게 검토 요청"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            AI 종합 관찰 기록이 담당 의사의 이메일로 전송됩니다.
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
            {sending ? "⏳ 전송 중..." : "📨 관찰 기록 전송"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}