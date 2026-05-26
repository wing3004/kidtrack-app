import { cn } from "../utils/helpers";

const freqLabel = {
  none:       "관찰 안됨",
  occasional: "가끔 관찰",
  frequent:   "자주 관찰",
};
const freqColor = {
  none:       "text-slate-400",
  occasional: "text-amber-500",
  frequent:   "text-orange-500",
};

export default function ReportCard({ analysis, report, analyzedAt, onRequestReview }) {
  if (!analysis) return null;

  const date = analyzedAt
    ? new Date(analyzedAt).toLocaleString("ko-KR")
    : "";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className={cn(
        "px-4 py-3 flex items-center justify-between",
        analysis.attentionNeeded
          ? "bg-amber-50 border-b border-amber-100"
          : "bg-slate-50 border-b border-slate-100"
      )}>
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {analysis.attentionNeeded ? "📋" : "📋"}
          </span>
          <div>
            <p className="font-bold text-sm text-slate-800">
              관찰 기록 완료
            </p>
            <p className="text-[10px] text-slate-400">{date}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">관찰 참고값</p>
          <p className="font-bold text-lg text-slate-700">
            {analysis.observationScore}
          </p>
        </div>
      </div>

      {/* 관찰 행동 목록 */}
      {analysis.behaviors?.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
            관찰된 행동
          </p>
          <div className="space-y-1.5">
            {analysis.behaviors.map((b, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0",
                    b.observed ? "bg-amber-400" : "bg-slate-200"
                  )} />
                  <span className={cn(
                    "text-xs",
                    b.observed ? "text-slate-800" : "text-slate-400"
                  )}>
                    {b.name}
                  </span>
                </div>
                {b.observed && (
                  <span className={cn(
                    "text-[10px] font-bold flex-shrink-0",
                    freqColor[b.frequency]
                  )}>
                    {freqLabel[b.frequency]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관찰 요약 */}
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
          관찰 내용 요약
        </p>
        <p className="text-xs text-slate-700 leading-relaxed">
          {analysis.observationSummary}
        </p>
      </div>

      {/* 주의 관찰 항목 설명 */}
      {analysis.attentionDetails && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-bold text-amber-700 mb-1">
            ⚠️ 주의 관찰 항목 설명
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            {analysis.attentionDetails}
          </p>
        </div>
      )}

      {/* 보호자 안내 */}
      {analysis.parentNote && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs font-bold text-blue-600 mb-1">
            💡 전문가 상담 시 참고사항
          </p>
          <p className="text-xs text-blue-800 leading-relaxed">
            {analysis.parentNote}
          </p>
        </div>
      )}

      {/* 관찰 기록 전문 */}
      {report && (
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
            관찰 기록 요약문
          </p>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg max-h-48 overflow-y-auto no-scroll">
            {report}
          </div>
        </div>
      )}

      {/* 법적 고지 */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          ※ 본 기록은 AI가 보조한 관찰 참고 자료입니다.
          의료적 진단이 아니며, 전문가의 판단을 대체하지 않습니다.
        </p>
      </div>

      {/* 전문가 상담 요청 버튼 */}
      {analysis.consultRecommended && onRequestReview && (
        <div className="px-4 py-3">
          <button
            onClick={onRequestReview}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            📨 전문가에게 관찰 기록 전달
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            관찰 기록 요약문이 전문가 이메일로 전달됩니다
          </p>
        </div>
      )}
    </div>
  );
}