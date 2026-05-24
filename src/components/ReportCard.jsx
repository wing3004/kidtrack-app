import { cn } from "../utils/helpers";

// severity 색상
const sevColor = {
  none:     "text-slate-400",
  mild:     "text-amber-500",
  moderate: "text-orange-500",
  severe:   "text-red-600",
};
const sevLabel = { none: "없음", mild: "경미", moderate: "중등도", severe: "심함" };

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
        analysis.flagged ? "bg-red-50 border-b border-red-100" : "bg-green-50 border-b border-green-100"
      )}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{analysis.flagged ? "⚠️" : "✅"}</span>
          <div>
            <p className={cn("font-bold text-sm", analysis.flagged ? "text-red-700" : "text-green-700")}>
              {analysis.flagged ? "이상 행동 감지됨" : "특이 소견 없음"}
            </p>
            <p className="text-[10px] text-slate-400">{date}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">신뢰도</p>
          <p className={cn("font-bold text-lg", analysis.flagged ? "text-red-600" : "text-green-600")}>
            {analysis.confidence}%
          </p>
        </div>
      </div>

      {/* 행동 체크리스트 */}
      {analysis.behaviors?.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">관찰 행동 목록</p>
          <div className="space-y-1.5">
            {analysis.behaviors.map((b, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0", b.observed ? "bg-red-400" : "bg-slate-200")} />
                  <span className={cn("text-xs", b.observed ? "text-slate-800 font-semibold" : "text-slate-400")}>
                    {b.name}
                  </span>
                </div>
                {b.observed && (
                  <span className={cn("text-[10px] font-bold flex-shrink-0", sevColor[b.severity])}>
                    {sevLabel[b.severity]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 요약 */}
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">AI 분석 요약</p>
        <p className="text-xs text-slate-700 leading-relaxed">{analysis.summary}</p>
      </div>

      {/* 권고사항 */}
      {analysis.recommendation && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs font-bold text-blue-600 mb-1">💡 권고사항</p>
          <p className="text-xs text-blue-800 leading-relaxed">{analysis.recommendation}</p>
        </div>
      )}

      {/* AI 소견서 (마크다운 렌더) */}
      {report && (
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">AI 소견서 전문</p>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-lg max-h-48 overflow-y-auto no-scroll">
            {report}
          </div>
        </div>
      )}

      {/* 의사 검토 요청 버튼 */}
      {analysis.needsDoctorReview && onRequestReview && (
        <div className="px-4 py-3">
          <button
            onClick={onRequestReview}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            📨 담당 의사에게 검토 요청
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            영상 프레임과 AI 소견서가 이메일로 전송됩니다
          </p>
        </div>
      )}
    </div>
  );
}