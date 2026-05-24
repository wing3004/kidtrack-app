import { useState, useMemo } from "react";
import { cn, callAI } from "../utils/helpers";
import Button from "../components/Button";
import Modal from "../components/Modal";

// 행동명 → 활동 매핑
const BEHAVIOR_ACTIVITIES = {
  "상동 행동": [
    { title: "감각 통합 활동 — 촉감 박스 탐색",      desc: "다양한 질감의 물건(콩, 모래, 솜)을 담은 박스를 탐색하며 감각 자극을 조절하는 연습. 반복적 움직임 대신 손의 탐색으로 에너지를 전환합니다.", duration: "10분", icon: "🖐", source: "의사 권고" },
    { title: "대근육 활동 — 트램폴린 또는 쿠션 점프", desc: "몸 튕기기 상동 행동을 안전한 환경에서 충족시켜주는 대체 활동. 일정한 리듬으로 점프하며 전정 감각을 자극합니다.", duration: "15분", icon: "🦘", source: "AI 커리큘럼" },
  ],
  "호명 반응": [
    { title: "이름 부르기 놀이 — 호명 반응 강화",     desc: "아이 이름을 부른 후 2초 대기 → 반응 시 즉각적인 긍정 강화(칭찬, 좋아하는 간식). 하루 10회 반복, 점진적으로 거리를 늘려가세요.", duration: "10분", icon: "📣", source: "의사 권고" },
    { title: "숨바꼭질 변형 놀이 — 이름 반응 게임",   desc: "보호자가 숨은 후 이름을 부르면 찾아오는 게임. 호명 반응과 사회적 참여를 동시에 훈련합니다.", duration: "10분", icon: "🙈", source: "AI 커리큘럼" },
  ],
  "눈 맞춤": [
    { title: "눈맞춤 강화 놀이 — 거품 불기",          desc: "비누 거품을 아이 눈높이에서 불어주며 자연스러운 눈 맞춤을 유도. 시선이 맞으면 즉시 칭찬합니다.", duration: "10분", icon: "🫧", source: "의사 권고" },
    { title: "손인형 놀이 — 공동 주시 훈련",           desc: "손인형으로 이야기를 만들며 아이의 시선이 인형과 보호자 얼굴을 번갈아 보도록 유도. 공동 주시 발달을 자극합니다.", duration: "10분", icon: "🧸", source: "AI 커리큘럼" },
  ],
  "반복적 물건 배열": [
    { title: "구성 놀이 — 함께 블록 쌓기",             desc: "아이가 배열하는 성향을 활용해 함께 블록을 쌓고 무너뜨리는 놀이. 사회적 참여와 유연성을 동시에 훈련합니다.", duration: "15분", icon: "🧱", source: "AI 커리큘럼" },
  ],
  "과잉행동": [
    { title: "전신 압박 활동 — 이불 말이",             desc: "이불로 아이를 부드럽게 감싸주는 고유감각 자극 활동. 과잉 활성화된 신경계를 진정시키는 데 효과적입니다.", duration: "5분", icon: "🛏", source: "AI 커리큘럼" },
  ],
  "자해 행동": [
    { title: "즉시 보호자에게 연락하세요",              desc: "자해 행동이 관찰된 경우 즉시 전문의와 상담하세요. 집에서 할 수 있는 것: 위험 물건 제거, 아이를 안전하고 조용한 환경으로 이동.", duration: "즉시", icon: "🚨", source: "의사 권고" },
  ],
};

// 기본 활동 (이상 행동 없을 때)
const DEFAULT_ACTIVITIES = [
  { title: "오감 자극 놀이 — 탐색 바구니",  desc: "다양한 질감, 소리, 색깔의 물건을 담은 바구니를 자유롭게 탐색. 호기심과 탐색 행동을 촉진하는 기초 발달 활동입니다.", duration: "15분", icon: "🧺", source: "AI 커리큘럼" },
  { title: "모방 놀이 — 박수·행동 따라하기", desc: "보호자의 간단한 행동(박수, 손 흔들기)을 따라하도록 유도. 사회적 참조와 모방 능력 발달을 자극합니다.", duration: "10분", icon: "👏", source: "AI 커리큘럼" },
  { title: "그림책 읽기 — 함께 보기",        desc: "단순하고 큰 그림의 그림책을 무릎에 앉혀 함께 읽기. 언어 자극과 공동 주시를 동시에 훈련할 수 있습니다.", duration: "10분", icon: "📚", source: "AI 커리큘럼" },
];

export default function TabSolution({ state, onToast }) {
  const [done,        setDone]        = useState(new Set());
  const [expanded,    setExpanded]    = useState(null);
  const [showSched,   setShowSched]   = useState(false);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiActivities, setAiActivities] = useState(null);

  const clips   = state.todayClips;
  const reports = state.allReports;

  // 감지된 행동 기반으로 활동 목록 구성
  const activities = useMemo(() => {
    if (aiActivities) return aiActivities;

    const observedBehaviors = new Set();
    clips.forEach((c) =>
      c.analysis?.behaviors?.forEach((b) => {
        if (b.observed) observedBehaviors.add(b.name);
      })
    );

    if (observedBehaviors.size === 0) return DEFAULT_ACTIVITIES;

    const result = [];
    observedBehaviors.forEach((name) => {
      const matched = Object.entries(BEHAVIOR_ACTIVITIES).find(([key]) =>
        name.includes(key) || key.includes(name.split(" ")[0])
      );
      if (matched) result.push(...matched[1]);
    });

    return result.length > 0 ? result : DEFAULT_ACTIVITIES;
  }, [clips, aiActivities]);

  // AI로 맞춤 활동 추가 생성
  const generateAIActivities = async () => {
    if (clips.length === 0) {
      onToast("⚠️ 분석된 영상이 없습니다. 모니터링 탭에서 먼저 촬영해주세요.");
      return;
    }
    setAiLoading(true);
    try {
      const observedBehaviors = [];
      clips.forEach((c) =>
        c.analysis?.behaviors?.forEach((b) => {
          if (b.observed) observedBehaviors.push(`${b.name}(${b.severity})`);
        })
      );

      const prompt = `당신은 소아 작업치료사 AI입니다.
아래 아이(생후 ${Math.floor(state.child.daysOld / 30)}개월)의 실제 관찰 데이터를 기반으로 집에서 할 수 있는 맞춤 활동 3가지를 추천하세요.

관찰된 행동: ${observedBehaviors.join(", ") || "특이 행동 없음"}
분석 요약: ${clips[0]?.analysis?.summary || "없음"}

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 없어야 합니다:
[
  {
    "title": "활동 제목 (10자 이내)",
    "desc": "활동 설명 (2~3문장, 구체적인 방법 포함)",
    "duration": "XX분",
    "icon": "이모지 1개",
    "source": "AI 커리큘럼"
  }
]`;

      const result = await callAI(prompt);
      const cleaned = result.replace(/```json|```/g, "").trim();
      const parsed  = JSON.parse(cleaned);
      setAiActivities(parsed);
      onToast("✅ AI가 맞춤 활동을 생성했습니다.");
    } catch (e) {
      onToast("❌ 생성 실패: " + e.message);
    }
    setAiLoading(false);
  };

  const markDone = (i) => {
    setDone(new Set([...done, i]));
    setExpanded(null);
    onToast("✅ 오늘 완료로 기록되었습니다.");
  };

  const slots = [
    { date: "내일 오전", time: "10:00", ok: true },
    { date: "모레 오후", time: "14:00", ok: true },
    { date: "이번 주 수요일", time: "11:00", ok: false },
  ];

  const hasData = clips.length > 0;

  return (
    <div className="p-4 space-y-4">

      {/* 헤더 */}
      <div className="text-center mt-1">
        <span className="bg-slate-700 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wider">
          {hasData ? "실제 분석 기반" : "기본 커리큘럼"}
        </span>
        <h2 className="font-bold text-slate-800 text-lg mt-2">
          {state.child.name ? `${state.child.name}을(를) 위한` : ""} 맞춤 처방
        </h2>
        {hasData ? (
          <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
            오늘 분석된 {clips.length}개 영상 데이터를 기반으로<br />
            맞춤 활동이 구성되었습니다.
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
            모니터링에서 영상을 분석하면<br />
            더 정확한 맞춤 처방이 제공됩니다.
          </p>
        )}
      </div>

      {/* 진행률 */}
      {activities.length > 0 && (
        <>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${(done.size / activities.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-center text-slate-400 -mt-2">
            오늘 진행률 {done.size}/{activities.length}
          </p>
        </>
      )}

      {/* 감지 요약 배너 */}
      {hasData && (() => {
        const flagged = clips.filter((c) => c.flagged);
        if (flagged.length === 0) return null;
        const behaviors = new Set();
        flagged.forEach((c) =>
          c.analysis?.behaviors?.filter((b) => b.observed).forEach((b) => behaviors.add(b.name))
        );
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-700 mb-1">
              📋 오늘 관찰된 행동 기반 처방
            </p>
            <p className="text-[10px] text-amber-600">
              {[...behaviors].join(" · ")}
            </p>
          </div>
        );
      })()}

      {/* 활동 카드 목록 */}
      <div className="space-y-3">
        {activities.map((act, i) => (
          <div
            key={i}
            className={cn(
              "bg-white rounded-xl border shadow-sm overflow-hidden transition-all",
              done.has(i) ? "border-green-300 opacity-80" : "border-slate-200"
            )}
          >
            {/* 헤더 행 */}
            <button
              className="w-full text-left flex items-center gap-3 p-3"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              {/* 아이콘 */}
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl",
                done.has(i) ? "bg-green-100" : "bg-slate-100"
              )}>
                {done.has(i) ? "✅" : act.icon}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 leading-tight">{act.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">⏱ {act.duration}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    act.source === "의사 권고"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-slate-100 text-slate-500"
                  )}>
                    {act.source === "의사 권고" ? "👨‍⚕️ 의사 권고" : "🤖 AI 추천"}
                  </span>
                </div>
              </div>

              <span className="text-slate-300 text-sm flex-shrink-0">
                {expanded === i ? "▲" : "▼"}
              </span>
            </button>

            {/* 상세 내용 */}
            {expanded === i && !done.has(i) && (
              <div className="px-3 pb-3 space-y-3">
                {/* 활동 설명 */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-bold text-slate-600 mb-1.5">📝 활동 방법</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{act.desc}</p>
                </div>

                {/* 소요 시간 */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>⏱ 권장 시간:</span>
                  <span className="font-bold text-slate-700">{act.duration}</span>
                </div>

                {/* 완료 버튼 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => markDone(i)}
                    className="flex-1 bg-green-50 border border-green-200 text-green-700 text-xs font-bold py-2.5 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    ✅ 오늘 완료
                  </button>
                  <button
                    onClick={() => { setExpanded(null); onToast("📌 나중에 하기 목록에 저장되었습니다."); }}
                    className="flex-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold py-2.5 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    📌 나중에 하기
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* AI 맞춤 활동 추가 생성 */}
      <Button
        variant="primary"
        onClick={generateAIActivities}
        disabled={aiLoading}
      >
        {aiLoading ? "🤖 AI 활동 생성 중..." : "🤖 AI 맞춤 활동 추가 생성"}
      </Button>

      {/* 상담 예약 */}
      <Button variant="teal" onClick={() => setShowSched(true)}>
        📞 발달 상담 예약하기
      </Button>

      <Modal open={showSched} onClose={() => setShowSched(false)} title="발달 상담 예약">
        <div className="space-y-3">
          <p className="text-sm text-slate-500 mb-1">원하시는 일정을 선택하세요:</p>
          {slots.map((slot) => (
            <button
              key={slot.date}
              disabled={!slot.ok}
              onClick={() => {
                setShowSched(false);
                onToast(`📅 ${slot.date} ${slot.time} 상담 예약이 완료되었습니다.`);
              }}
              className={cn(
                "w-full p-3 rounded-xl text-left flex justify-between items-center border transition-all",
                slot.ok
                  ? "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50"
                  : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              <div>
                <p className={cn("font-bold text-sm", slot.ok ? "text-slate-800" : "text-slate-400")}>
                  {slot.date}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{slot.time}</p>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                slot.ok ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
              )}>
                {slot.ok ? "예약 가능" : "마감"}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}