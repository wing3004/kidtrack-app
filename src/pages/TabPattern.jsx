import { useState, useMemo } from "react";
import { cn, callAI } from "../utils/helpers";
import Button from "../components/Button";

export default function TabPattern({ state, onToast, onSwitchTab }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [aiText,    setAiText]    = useState("");
  const [aiErr,     setAiErr]     = useState("");

  const clips = state.todayClips;

  // ── 실제 데이터에서 통계 계산 ─────────────────────────────
  const stats = useMemo(() => {
    if (clips.length === 0) return null;

    const flaggedClips   = clips.filter((c) => c.flagged);
    const approvedClips  = clips.filter((c) => c.approved === true);
    const flagRate       = Math.round((flaggedClips.length / clips.length) * 100);

    // 행동별 집계
    const behaviorCount = {};
    clips.forEach((c) => {
      c.analysis?.behaviors?.forEach((b) => {
        if (b.observed) {
          behaviorCount[b.name] = (behaviorCount[b.name] || 0) + 1;
        }
      });
    });

    // 평균 신뢰도
    const avgConfidence = clips
      .filter((c) => c.analysis?.confidence !== undefined)
      .reduce((sum, c, _, arr) => sum + c.analysis.confidence / arr.length, 0);

    // 심각도 분포
    const severityDist = { none: 0, mild: 0, moderate: 0, severe: 0 };
    clips.forEach((c) =>
      c.analysis?.behaviors?.forEach((b) => {
        if (b.observed && severityDist[b.severity] !== undefined)
          severityDist[b.severity]++;
      })
    );

    return { flaggedClips, approvedClips, flagRate, behaviorCount, avgConfidence, severityDist };
  }, [clips]);

  // ── 발달 성장 그래프 (누적 관찰 기록에서) ───────────────────
  const growthData = useMemo(() => {
    const reports = state.allReports || [];
    if (reports.length === 0) return [];
    const byDate = {};
    [...reports].reverse().forEach((r) => {
      const d = new Date(r.createdAt);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDate[key]) byDate[key] = { date: key, total: 0, attention: 0 };
      byDate[key].total++;
      if (r.analysis?.attentionNeeded) byDate[key].attention++;
    });
    return Object.values(byDate).slice(-14);
  }, [state.allReports]);

  // ── 시간대별 감지 현황 (막대 그래프용) ────────────────────
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, flagged: 0 }));
    clips.forEach((c) => {
      const h = parseInt(c.time?.split(":")[0] || "0", 10);
      if (h >= 0 && h < 24) {
        hours[h].total++;
        if (c.flagged) hours[h].flagged++;
      }
    });
    // 데이터 있는 시간대만
    return hours.filter((h) => h.total > 0);
  }, [clips]);

  // ── AI 정밀 분석 ──────────────────────────────────────────
  const runAI = async () => {
  if (clips.length === 0) {
    onToast("⚠️ 분석할 영상 데이터가 없습니다.");
    return;
  }
  setAnalyzing(true);
  setAiText("");
  setAiErr("");

  try {
    const behaviorSummary = stats
      ? Object.entries(stats.behaviorCount)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => `- ${name}: ${count}회`)
          .join("\n") || "- 관찰된 주의 행동 없음"
      : "- 데이터 없음";

    const prompt = `당신은 보호자의 육아 관찰 기록을 정리하는 AI 보조 도구입니다.
반드시 한국어로만 답변하세요. 의료적 진단 표현은 절대 사용하지 마세요.

아래는 ${state.child.name}(생후 ${Math.floor(state.child.daysOld / 30)}개월)의
오늘 관찰 기록 데이터입니다.

[관찰 데이터]
- 총 관찰 영상: ${clips.length}개
- 주의 행동 관찰된 영상: ${stats?.flaggedClips?.length || 0}개
- 관찰 참고값 평균: ${Math.round(stats?.avgConfidence || 0)}

[관찰된 행동]
${behaviorSummary}

[영상별 관찰 요약]
${clips.slice(0, 5).map((c, i) =>
  `${i + 1}. ${c.time} — ${c.analysis?.observationSummary || c.analysis?.summary || "관찰 내용 없음"}`
).join("\n")}

위 관찰 기록을 바탕으로 다음을 한국어 산문 3~4문장으로 작성하세요:
1. 오늘 관찰된 행동의 전반적인 특징
2. 보호자가 주의 깊게 살펴볼 행동
3. 전문가 상담 시 이 기록을 어떻게 활용할지 안내

⚠️ 절대 금지:
- 질병명, 장애명 언급 금지
- "진단", "증상", "치료", "처방", "임상" 등 의료 용어 사용 금지
- 확정적 판단 표현 금지
- bullet point 없이 자연스러운 문단으로만 작성`;

    const result = await callAI(prompt);

    if (!result || result.trim() === "") {
      throw new Error("AI 응답이 비어있습니다. 서버 연결을 확인하세요.");
    }

    setAiText(result);

  } catch (e) {
    console.error("패턴 분석 오류:", e);
    setAiErr(e.message || "알 수 없는 오류가 발생했습니다.");
  } finally {
    setAnalyzing(false);   // ← finally로 변경 — 에러가 나도 반드시 로딩 해제
  }
};

  // ── 막대 그래프 렌더링 ────────────────────────────────────
  const maxBarVal = Math.max(...hourlyData.map((h) => h.total), 1);

  if (clips.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-slate-600 font-semibold text-sm">아직 분석 데이터가 없습니다</p>
        <p className="text-slate-400 text-xs mt-1">
          모니터링 탭에서 영상을 촬영하면<br />여기서 패턴을 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">

      {/* 발달 성장 그래프 (누적 기록) */}
      {growthData.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-1">📈 발달 관찰 추세</h3>
          <p className="text-[10px] text-slate-400 mb-3">누적 관찰 기록 기준 (최근 {growthData.length}일)</p>
          <svg
            viewBox={`0 0 ${Math.max(growthData.length * 28, 200)} 90`}
            className="w-full"
            preserveAspectRatio="none"
          >
            {(() => {
              const maxVal = Math.max(...growthData.map((d) => d.total), 1);
              const barW = 18;
              const gap  = 10;
              const chartH = 65;
              const offsetY = 10;
              return (
                <g>
                  {/* 가이드 라인 */}
                  {[0, 0.5, 1].map((ratio) => (
                    <line
                      key={ratio}
                      x1="0" y1={offsetY + chartH * (1 - ratio)}
                      x2={growthData.length * (barW + gap)} y2={offsetY + chartH * (1 - ratio)}
                      stroke="#e2e8f0" strokeWidth="1"
                    />
                  ))}
                  {growthData.map((d, i) => {
                    const x     = i * (barW + gap);
                    const totalH = (d.total / maxVal) * chartH;
                    const attnH  = (d.attention / maxVal) * chartH;
                    return (
                      <g key={d.date}>
                        {/* 전체 바 */}
                        <rect
                          x={x} y={offsetY + chartH - totalH}
                          width={barW} height={totalH}
                          rx="3" fill="#bfdbfe"
                        />
                        {/* 주의 행동 부분 */}
                        {d.attention > 0 && (
                          <rect
                            x={x} y={offsetY + chartH - attnH}
                            width={barW} height={attnH}
                            rx="3" fill="#f87171"
                          />
                        )}
                        {/* 날짜 라벨 */}
                        <text
                          x={x + barW / 2} y={offsetY + chartH + 12}
                          textAnchor="middle" fontSize="7" fill="#94a3b8"
                        >
                          {d.date}
                        </text>
                        {/* 총 횟수 */}
                        {d.total > 0 && (
                          <text
                            x={x + barW / 2} y={offsetY + chartH - totalH - 3}
                            textAnchor="middle" fontSize="7" fill="#475569" fontWeight="bold"
                          >
                            {d.total}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>
          <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-blue-200 inline-block" />전체 관찰
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-red-400 inline-block" />주의 행동 감지
            </span>
          </div>
        </div>
      )}

      {/* 오늘의 통계 요약 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">주의 행동 감지율</p>
          <p className={cn(
            "text-3xl font-bold mt-1",
            (stats?.flagRate || 0) > 30 ? "text-red-500" : "text-green-500"
          )}>
            {stats?.flagRate || 0}%
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {clips.length}개 중 {stats?.flaggedClips.length || 0}개 감지
          </p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">총 관찰 세션</p>
          <p className="text-3xl font-bold mt-1 text-blue-600">
            {clips.length}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">오늘 기준</p>
        </div>
      </div>

      {/* 시간대별 막대 그래프 */}
      {hourlyData.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3">시간대별 촬영 현황</h3>
          <div className="flex items-end gap-1.5 h-24">
            {hourlyData.map((h) => (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col justify-end" style={{ height: "72px" }}>
                  {/* 전체 바 */}
                  <div
                    className="w-full rounded-t relative overflow-hidden"
                    style={{ height: `${(h.total / maxBarVal) * 72}px` }}
                  >
                    <div className="absolute inset-0 bg-blue-200" />
                    {h.flagged > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-red-400"
                        style={{ height: `${(h.flagged / h.total) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
                <span className="text-[8px] text-slate-400">{h.hour}시</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-blue-200 inline-block" />일반
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-red-400 inline-block" />주의 행동 감지
            </span>
          </div>
        </div>
      )}

      {/* 감지된 행동 순위 */}
      {stats && Object.keys(stats.behaviorCount).length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3">관찰된 행동 빈도</h3>
          <div className="space-y-2">
            {Object.entries(stats.behaviorCount)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => {
                const maxCount = Math.max(...Object.values(stats.behaviorCount));
                return (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 w-28 flex-shrink-0 truncate">{name}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-red-400 h-2 rounded-full transition-all"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600 w-6 text-right">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* AI 정밀 분석 버튼 */}
      <Button variant="primary" onClick={runAI} disabled={analyzing}>
        {analyzing ? "🤖 AI 분석 중..." : "🤖 관찰 기록 AI 요약 실행"}
      </Button>

      {/* AI 분석 결과 */}
      {(analyzing || aiText || aiErr) && (
        <div className={cn(
          "rounded-xl p-4 text-sm leading-relaxed border",
          aiErr
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-blue-50 border-blue-200 text-blue-900"
        )}>
          {analyzing && (
            <div className="flex items-center gap-2 text-blue-700">
              <span className="animate-pulse">🤖</span> 실제 데이터 기반 분석 중...
            </div>
          )}
          {aiText && (
            <>
              <p className="font-bold text-blue-700 mb-2">🤖 관찰 기록 요약</p>
              <p className="whitespace-pre-wrap">{aiText}</p>
            </>
          )}
          {aiErr && <p>⚠️ {aiErr}</p>}
        </div>
      )}

      {/* 솔루션 탭 이동 */}
      {stats && stats.flaggedClips.length > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
          <p className="text-sm font-bold text-red-700 mb-1">⚠️ 주의 행동 패턴 감지됨</p>
          <p className="text-xs text-red-600 mb-3">
            오늘 {stats.flaggedClips.length}건의 주의 행동이 관찰되었습니다.
            맞춤 처방 탭에서 권장 활동을 확인하세요.
          </p>
          <button
            onClick={() => onSwitchTab(4)}
            className="w-full bg-white border border-red-200 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-50 transition-colors"
          >
            💡 맞춤 처방 보기 →
          </button>
        </div>
      )}
    </div>
  );
}