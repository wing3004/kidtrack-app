import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { cn, callAI, analyzeActivity } from "../utils/helpers";
import Button from "../components/Button";
import Modal from "../components/Modal";

// 행동명 → 활동 매핑
const BEHAVIOR_ACTIVITIES = {
  "상동 행동": [
    { title: "감각 통합 활동 — 촉감 박스 탐색",      desc: "다양한 질감의 물건(콩, 모래, 솜)을 담은 박스를 탐색하며 감각 자극을 조절하는 연습. 반복적 움직임 대신 손의 탐색으로 에너지를 전환합니다.", duration: "10분", icon: "🖐", source: "전문가 권장" },
    { title: "대근육 활동 — 트램폴린 또는 쿠션 점프", desc: "몸 튕기기 상동 행동을 안전한 환경에서 충족시켜주는 대체 활동. 일정한 리듬으로 점프하며 전정 감각을 자극합니다.", duration: "15분", icon: "🦘", source: "AI 커리큘럼" },
  ],
  "호명 반응": [
    { title: "이름 부르기 놀이 — 호명 반응 강화",     desc: "아이 이름을 부른 후 2초 대기 → 반응 시 즉각적인 긍정 강화(칭찬, 좋아하는 간식). 하루 10회 반복, 점진적으로 거리를 늘려가세요.", duration: "10분", icon: "📣", source: "전문가 권장" },
    { title: "숨바꼭질 변형 놀이 — 이름 반응 게임",   desc: "보호자가 숨은 후 이름을 부르면 찾아오는 게임. 호명 반응과 사회적 참여를 동시에 훈련합니다.", duration: "10분", icon: "🙈", source: "AI 커리큘럼" },
  ],
  "눈 맞춤": [
    { title: "눈맞춤 강화 놀이 — 거품 불기",          desc: "비누 거품을 아이 눈높이에서 불어주며 자연스러운 눈 맞춤을 유도. 시선이 맞으면 즉시 칭찬합니다.", duration: "10분", icon: "🫧", source: "전문가 권장" },
    { title: "손인형 놀이 — 공동 주시 훈련",           desc: "손인형으로 이야기를 만들며 아이의 시선이 인형과 보호자 얼굴을 번갈아 보도록 유도. 공동 주시 발달을 자극합니다.", duration: "10분", icon: "🧸", source: "AI 커리큘럼" },
  ],
  "반복적 물건 배열": [
    { title: "구성 놀이 — 함께 블록 쌓기",             desc: "아이가 배열하는 성향을 활용해 함께 블록을 쌓고 무너뜨리는 놀이. 사회적 참여와 유연성을 동시에 훈련합니다.", duration: "15분", icon: "🧱", source: "AI 커리큘럼" },
  ],
  "과잉행동": [
    { title: "전신 압박 활동 — 이불 말이",             desc: "이불로 아이를 부드럽게 감싸주는 고유감각 자극 활동. 과잉 활성화된 신경계를 진정시키는 데 효과적입니다.", duration: "5분", icon: "🛏", source: "AI 커리큘럼" },
  ],
  "자해 행동": [
    { title: "즉시 보호자에게 연락하세요",              desc: "자해 행동이 관찰된 경우 즉시 전문의와 상담하세요. 집에서 할 수 있는 것: 위험 물건 제거, 아이를 안전하고 조용한 환경으로 이동.", duration: "즉시", icon: "🚨", source: "전문가 권장" },
  ],
};

// 기본 활동 (이상 행동 없을 때)
const DEFAULT_ACTIVITIES = [
  { title: "오감 자극 놀이 — 탐색 바구니",  desc: "다양한 질감, 소리, 색깔의 물건을 담은 바구니를 자유롭게 탐색. 호기심과 탐색 행동을 촉진하는 기초 발달 활동입니다.", duration: "15분", icon: "🧺", source: "AI 커리큘럼" },
  { title: "모방 놀이 — 박수·행동 따라하기", desc: "보호자의 간단한 행동(박수, 손 흔들기)을 따라하도록 유도. 사회적 참조와 모방 능력 발달을 자극합니다.", duration: "10분", icon: "👏", source: "AI 커리큘럼" },
  { title: "그림책 읽기 — 함께 보기",        desc: "단순하고 큰 그림의 그림책을 무릎에 앉혀 함께 읽기. 언어 자극과 공동 주시를 동시에 훈련할 수 있습니다.", duration: "10분", icon: "📚", source: "AI 커리큘럼" },
];

const SPECIALISTS = [
  { id: "ped", label: "소아청소년과",   icon: "👶", desc: "발달 평가 및 의학적 소견" },
  { id: "dev", label: "발달재활 전문가", icon: "🧠", desc: "전반적 발달 지원" },
  { id: "ot",  label: "작업치료사",     icon: "🤲", desc: "감각·운동 발달" },
  { id: "st",  label: "언어치료사",     icon: "💬", desc: "언어·의사소통 발달" },
];

const PARTICIPATION_LABEL = {
  high:   "적극적으로 참여했어요",
  medium: "함께 참여했어요",
  low:    "조금씩 시도해봐요",
};
const PARTICIPATION_STYLE = {
  high:   "bg-green-100 text-green-700",
  medium: "bg-blue-100 text-blue-700",
  low:    "bg-amber-100 text-amber-700",
};
const PARTICIPATION_ICON = { high: "🌟", medium: "👍", low: "💪" };

export default function TabSolution({ state, dispatch, onToast }) {
  const [done,             setDone]             = useState(new Set());
  const [expanded,         setExpanded]         = useState(null);
  const [showSched,        setShowSched]        = useState(false);
  const [aiLoading,        setAiLoading]        = useState(false);
  const [aiActivities,     setAiActivities]     = useState(null);
  const [selectedSpecialist, setSelectedSpecialist] = useState(null);

  // 전문가 활동 추가 모달
  const [showAddDoctor,  setShowAddDoctor]  = useState(false);
  const [newActTitle,    setNewActTitle]    = useState("");
  const [newActDesc,     setNewActDesc]     = useState("");
  const [newActDuration, setNewActDuration] = useState("10분");

  // 활동 촬영 관련
  const [recordingAct,  setRecordingAct]  = useState(null); // { act, key, index? }
  const [actCamMode,    setActCamMode]    = useState("idle"); // idle|preview|recording|analyzing
  const [actCamStream,  setActCamStream]  = useState(null);
  const [actRecordSec,  setActRecordSec]  = useState(0);
  const [actFeedbacks,  setActFeedbacks]  = useState({});    // key → feedback
  const [showFeedback,  setShowFeedback]  = useState(null);  // { feedback, actTitle }

  const actVideoRef   = useRef(null);
  const actCanvasRef  = useRef(null);
  const actTimerRef   = useRef(null);
  const actCaptureRef = useRef(null);
  const actSessionRef = useRef({ frames: [] });

  // 언마운트 시 카메라 정리
  useEffect(() => () => {
    clearInterval(actTimerRef.current);
    clearInterval(actCaptureRef.current);
    if (actCamStream) actCamStream.getTracks().forEach((t) => t.stop());
  }, []);

  const startActCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setActCamStream(stream);
      setActCamMode("preview");
      if (actVideoRef.current) {
        actVideoRef.current.srcObject = stream;
        await actVideoRef.current.play().catch(() => {});
      }
      if (!actCanvasRef.current) actCanvasRef.current = document.createElement("canvas");
    } catch {
      onToast("⚠️ 카메라를 시작할 수 없습니다.");
    }
  }, [onToast]);

  const stopActCamera = useCallback(() => {
    clearInterval(actTimerRef.current);
    clearInterval(actCaptureRef.current);
    if (actCamStream) actCamStream.getTracks().forEach((t) => t.stop());
    if (actVideoRef.current) actVideoRef.current.srcObject = null;
    setActCamStream(null);
    setActCamMode("idle");
  }, [actCamStream]);

  const startActRecording = () => {
    actSessionRef.current = { frames: [] };
    setActRecordSec(0);
    setActCamMode("recording");
    actTimerRef.current  = setInterval(() => setActRecordSec((s) => s + 1), 1000);
    actCaptureRef.current = setInterval(() => {
      const video  = actVideoRef.current;
      const canvas = actCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) actSessionRef.current.frames.push(blob);
      }, "image/jpeg", 0.75);
    }, 1500);
  };

  const stopActAndAnalyze = async () => {
    clearInterval(actTimerRef.current);
    clearInterval(actCaptureRef.current);
    setActCamMode("analyzing");

    const frames = actSessionRef.current.frames;
    if (frames.length === 0) {
      onToast("⚠️ 캡처된 프레임이 없습니다. 다시 시도해주세요.");
      setActCamMode("preview");
      return;
    }
    try {
      onToast("🤖 활동 수행 기록을 분석 중입니다...");
      const result = await analyzeActivity({
        frames,
        activityTitle: recordingAct?.act?.title || "활동",
        activityDesc:  recordingAct?.act?.desc  || "",
      });
      const key      = recordingAct?.key;
      const savedAct = recordingAct;
      setActFeedbacks((prev) => ({ ...prev, [key]: result.feedback }));
      if (savedAct?.index !== undefined) {
        setDone((prev) => new Set([...prev, savedAct.index]));
      }
      stopActCamera();
      setRecordingAct(null);
      setShowFeedback({ feedback: result.feedback, actTitle: savedAct?.act?.title });
      onToast("✅ 활동 기록이 완료되었습니다.");
    } catch (err) {
      onToast(`❌ 분석 실패: ${err.message}`);
      setActCamMode("preview");
    }
  };

  const closeRecordingModal = () => {
    stopActCamera();
    setRecordingAct(null);
    setActCamMode("idle");
  };

  const clips   = state.todayClips;
  const reports = state.allReports;

  // 감지된 행동 기반 활동 목록 구성
  const activities = useMemo(() => {
    if (aiActivities) return aiActivities;
    const observedBehaviors = new Set();
    clips.forEach((c) =>
      c.analysis?.behaviors?.forEach((b) => { if (b.observed) observedBehaviors.add(b.name); })
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
      onToast("⚠️ 관찰된 영상이 없습니다. 모니터링 탭에서 먼저 촬영해주세요.");
      return;
    }
    setAiLoading(true);
    try {
      const observedBehaviors = [];
      clips.forEach((c) =>
        c.analysis?.behaviors?.forEach((b) => {
          if (b.observed) observedBehaviors.push(`${b.name}(${b.frequency})`);
        })
      );
      const prompt = `당신은 영유아 발달을 지원하는 육아 정보 안내 AI입니다.
반드시 한국어로만 답변하세요.
의료적 처방이나 치료 행위가 아닌, 일반적인 육아 놀이 활동을 안내합니다.

아래 관찰 기록을 참고하여 가정에서 할 수 있는 참고 활동 3가지를 안내하세요.

관찰된 행동: ${observedBehaviors.join(", ") || "특이 행동 관찰 없음"}
관찰 요약: ${clips[0]?.analysis?.observationSummary || clips[0]?.analysis?.summary || "없음"}

아래 JSON 형식으로만 응답하세요:
[
  {
    "title": "활동 제목 (10자 이내)",
    "desc": "활동 방법 설명 (2~3문장, 구체적인 놀이 방법)",
    "duration": "XX분",
    "icon": "이모지 1개",
    "source": "참고 활동"
  }
]

⚠️ 절대 금지: 치료, 처방, 진단, 증상, 병명 등 의료 용어 사용 금지`;

      const result  = await callAI(prompt);
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
    { date: "내일 오전",     time: "10:00", ok: true  },
    { date: "모레 오후",     time: "14:00", ok: true  },
    { date: "이번 주 수요일", time: "11:00", ok: false },
  ];

  const hasData = clips.length > 0;

  return (
    <div className="p-4 space-y-4">

      {/* 헤더 */}
      <div className="text-center mt-1">
        <span className="bg-slate-700 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-wider">
          {hasData ? "관찰 기록 기반" : "기본 커리큘럼"}
        </span>
        <h2 className="font-bold text-slate-800 text-lg mt-2">
          {state.child.name ? `${state.child.name}을(를) 위한` : ""} 활동 가이드
        </h2>
        {hasData ? (
          <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
            오늘 관찰된 {clips.length}개 영상 데이터를 기반으로<br />
            맞춤 활동이 구성되었습니다.
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-1 px-4 leading-relaxed">
            모니터링에서 영상을 분석하면<br />
            더 정확한 맞춤 활동 안내가 제공됩니다.
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
            <p className="text-xs font-bold text-amber-700 mb-1">오늘 관찰된 행동 기반 활동</p>
            <p className="text-[10px] text-amber-600">{[...behaviors].join(" · ")}</p>
          </div>
        );
      })()}

      {/* ── 전문가 추천 활동 ── */}
      <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex justify-between items-center">
          <div>
            <p className="font-bold text-sm text-slate-800">전문가 추천 활동</p>
            <p className="text-[10px] text-slate-500 mt-0.5">전문가가 직접 등록한 맞춤 활동</p>
          </div>
          <button
            onClick={() => setShowAddDoctor(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors active:scale-95"
          >
            + 추가
          </button>
        </div>

        {(state.doctorActivities || []).length === 0 ? (
          <div className="py-7 text-center">
            <p className="text-sm text-slate-400">등록된 전문가 추천 활동이 없습니다</p>
            <p className="text-xs text-slate-300 mt-1">+ 추가 버튼으로 활동을 등록하세요</p>
          </div>
        ) : (
          (state.doctorActivities || []).map((act) => {
            const key      = `doc_${act.id}`;
            const feedback = actFeedbacks[key];
            return (
              <div key={act.id} className="p-3 border-b border-slate-100 last:border-0">
                <div className="mb-2">
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                    전문가 추천
                  </span>
                  <p className="text-sm font-bold text-slate-800 mt-1">{act.title}</p>
                  {act.desc && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{act.desc}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">⏱ {act.duration}</p>
                </div>
                {feedback ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-green-700">수행 기록 완료</p>
                      <p className="text-[10px] text-green-600 mt-0.5 leading-relaxed line-clamp-1">
                        {feedback.encouragement}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowFeedback({ feedback, actTitle: act.title })}
                      className="text-[10px] text-green-700 font-bold underline flex-shrink-0 ml-2"
                    >
                      결과 보기
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRecordingAct({ act, key })}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors active:scale-95"
                  >
                    수락 · 영상 촬영
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── AI 추천 활동 목록 ── */}
      <div className="space-y-3">
        {activities.map((act, i) => {
          const key      = `reg_${i}`;
          const feedback = actFeedbacks[key];
          return (
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
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl",
                  done.has(i) ? "bg-green-100" : "bg-slate-100"
                )}>
                  {done.has(i) ? "✅" : act.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 leading-tight">{act.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] text-slate-400">⏱ {act.duration}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      act.source === "전문가 권장"
                        ? "bg-green-100 text-green-600"
                        : "bg-slate-100 text-slate-500"
                    )}>
                      {act.source === "전문가 권장" ? "👨‍⚕️ 전문가 권장" : "🤖 AI 추천"}
                    </span>
                    {feedback && (
                      <span className="text-[10px] font-bold bg-green-100 text-green-600 px-1.5 py-0.5 rounded">
                        기록 완료
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-slate-300 text-sm flex-shrink-0">
                  {expanded === i ? "▲" : "▼"}
                </span>
              </button>

              {/* 상세 내용 */}
              {expanded === i && !done.has(i) && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-bold text-slate-600 mb-1.5">활동 방법</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{act.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>⏱ 권장 시간:</span>
                    <span className="font-bold text-slate-700">{act.duration}</span>
                  </div>

                  {feedback ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-green-700">수행 기록 완료</p>
                        <p className="text-[10px] text-green-600 mt-0.5 line-clamp-1">
                          {feedback.encouragement}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowFeedback({ feedback, actTitle: act.title })}
                        className="text-[10px] text-green-700 font-bold underline ml-2 flex-shrink-0"
                      >
                        결과 보기
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setRecordingAct({ act, key, index: i })}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors active:scale-95"
                      >
                        수락 · 영상 촬영
                      </button>
                      <button
                        onClick={() => markDone(i)}
                        className="flex-1 bg-green-50 border border-green-200 text-green-700 text-xs font-bold py-2.5 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        ✅ 완료 체크
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI 맞춤 활동 추가 생성 */}
      <Button variant="primary" onClick={generateAIActivities} disabled={aiLoading}>
        {aiLoading ? "🤖 AI 활동 생성 중..." : "🤖 AI 맞춤 활동 추가 생성"}
      </Button>

      {/* 상담 예약 */}
      <Button variant="teal" onClick={() => { setShowSched(true); setSelectedSpecialist(null); }}>
        📞 발달 상담 예약하기
      </Button>

      {/* ── 모달: 전문가 추천 활동 추가 ── */}
      <Modal
        open={showAddDoctor}
        onClose={() => { setShowAddDoctor(false); setNewActTitle(""); setNewActDesc(""); setNewActDuration("10분"); }}
        title="전문가 추천 활동 추가"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            아이에게 필요한 활동을 등록합니다.<br />
            보호자가 활동을 수행하고 영상으로 기록할 수 있습니다.
          </p>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">
              활동 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newActTitle}
              onChange={(e) => setNewActTitle(e.target.value)}
              placeholder="예: 눈맞춤 강화 — 거품 불기"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">활동 방법 설명</label>
            <textarea
              value={newActDesc}
              onChange={(e) => setNewActDesc(e.target.value)}
              placeholder="활동 방법을 구체적으로 입력해주세요"
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">권장 시간</label>
            <select
              value={newActDuration}
              onChange={(e) => setNewActDuration(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            >
              {["5분", "10분", "15분", "20분", "30분"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              ※ 등록된 활동은 가정 내 육아 활동 참고용입니다.<br />
              의료적 처방이나 치료 행위가 아닙니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setShowAddDoctor(false); setNewActTitle(""); setNewActDesc(""); }}>
              취소
            </Button>
            <Button
              variant="dark"
              onClick={() => {
                if (!newActTitle.trim()) { onToast("활동 이름을 입력해주세요."); return; }
                dispatch({
                  type: "ADD_DOCTOR_ACTIVITY",
                  activity: {
                    id:       `dact_${Date.now()}`,
                    title:    newActTitle.trim(),
                    desc:     newActDesc.trim(),
                    duration: newActDuration,
                    source:   "전문가 추천",
                    icon:     "📋",
                  },
                });
                setShowAddDoctor(false);
                setNewActTitle(""); setNewActDesc(""); setNewActDuration("10분");
                onToast("✅ 활동이 등록되었습니다.");
              }}
            >
              활동 등록
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── 모달: 활동 수행 촬영 ── */}
      <Modal
        open={recordingAct !== null}
        onClose={closeRecordingModal}
        title="활동 수행 촬영"
      >
        <div className="space-y-3">
          {/* 활동 정보 요약 */}
          {recordingAct && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-bold text-blue-800">{recordingAct.act.title}</p>
              {recordingAct.act.desc && (
                <p className="text-[11px] text-blue-600 mt-0.5 leading-relaxed line-clamp-2">
                  {recordingAct.act.desc}
                </p>
              )}
            </div>
          )}

          {/* 카메라 뷰 */}
          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
              <video
                ref={actVideoRef}
                autoPlay
                playsInline
                muted
                className={cn("w-full h-full object-cover", actCamMode === "idle" && "hidden")}
              />
              {actCamMode === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="text-4xl">📷</span>
                  <p className="text-slate-400 text-xs text-center px-4">
                    아이가 활동하는 모습을<br />카메라로 촬영해주세요
                  </p>
                </div>
              )}
              {actCamMode === "analyzing" && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                  <div className="text-3xl animate-spin">🤖</div>
                  <p className="text-white text-sm font-bold">활동 기록 분석 중...</p>
                  <p className="text-slate-400 text-xs">잠시만 기다려주세요</p>
                </div>
              )}
              {actCamMode === "recording" && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 px-2 py-1 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 text-[11px] font-bold">
                    REC {String(Math.floor(actRecordSec / 60)).padStart(2, "0")}:
                        {String(actRecordSec % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>
            <div className="p-2 flex gap-2">
              {actCamMode === "idle" && (
                <button
                  onClick={startActCamera}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                >
                  카메라 켜기
                </button>
              )}
              {actCamMode === "preview" && (
                <button
                  onClick={startActRecording}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                >
                  ⏺ 촬영 시작
                </button>
              )}
              {actCamMode === "recording" && (
                <button
                  onClick={stopActAndAnalyze}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                >
                  ⏹ 촬영 완료 · AI 분석
                </button>
              )}
              {actCamMode === "analyzing" && (
                <div className="flex-1 bg-slate-700 text-slate-400 text-xs font-bold py-2.5 rounded-lg text-center cursor-not-allowed">
                  분석 중...
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            아이가 활동을 수행하는 모습을 촬영하세요.<br />
            AI가 활동 참여 모습을 관찰 기록합니다.
          </p>
          <p className="text-[10px] text-slate-300 text-center">
            ※ 본 기록은 활동 참여 관찰 자료입니다. 의료적 평가가 아닙니다.
          </p>
        </div>
      </Modal>

      {/* ── 모달: 활동 기록 결과 ── */}
      <Modal
        open={!!showFeedback}
        onClose={() => setShowFeedback(null)}
        title="활동 기록 결과"
      >
        {showFeedback && (
          <div className="space-y-3">
            {/* 참여도 헤더 */}
            <div className="text-center pt-1 pb-2">
              <p className="text-3xl mb-1.5">
                {PARTICIPATION_ICON[showFeedback.feedback.participationLevel] || "👍"}
              </p>
              <p className="font-bold text-slate-800 text-sm">{showFeedback.actTitle}</p>
              <span className={cn(
                "text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1.5 inline-block",
                PARTICIPATION_STYLE[showFeedback.feedback.participationLevel] || "bg-blue-100 text-blue-700"
              )}>
                {PARTICIPATION_LABEL[showFeedback.feedback.participationLevel] || "참여했어요"}
              </span>
            </div>

            {/* 관찰 내용 */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-bold text-slate-600 mb-1">관찰된 모습</p>
              <p className="text-xs text-slate-700 leading-relaxed">
                {showFeedback.feedback.activitySummary}
              </p>
            </div>

            {/* 관찰 행동 목록 */}
            {showFeedback.feedback.observedBehaviors?.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs font-bold text-slate-600 mb-1.5">관찰된 행동</p>
                <div className="space-y-1">
                  {showFeedback.feedback.observedBehaviors.map((b, i) => (
                    <p key={i} className="text-xs text-slate-600 flex gap-1.5">
                      <span className="flex-shrink-0 text-slate-400">·</span>
                      <span>{b}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* 응원 메시지 */}
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <p className="text-xs font-bold text-green-700 mb-0.5">오늘의 응원</p>
              <p className="text-xs text-green-800 leading-relaxed">
                {showFeedback.feedback.encouragement}
              </p>
            </div>

            {/* 다음 시도 팁 */}
            {showFeedback.feedback.improvementTips?.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-bold text-blue-700 mb-1.5">다음에는 이렇게 해보세요</p>
                <div className="space-y-1">
                  {showFeedback.feedback.improvementTips.map((tip, i) => (
                    <p key={i} className="text-xs text-blue-800 flex gap-1.5">
                      <span className="flex-shrink-0">·</span>
                      <span>{tip}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              ※ 본 기록은 활동 참여 관찰 참고 자료입니다.<br />
              의료적 평가나 진단이 아닙니다.
            </p>
            <Button variant="primary" onClick={() => setShowFeedback(null)}>확인</Button>
          </div>
        )}
      </Modal>

      {/* ── 모달: 발달 상담 예약 ── */}
      <Modal open={showSched} onClose={() => setShowSched(false)} title="발달 상담 예약">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">상담 전문가 선택</p>
            <div className="grid grid-cols-2 gap-2">
              {SPECIALISTS.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => setSelectedSpecialist(sp)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition-all",
                    selectedSpecialist?.id === sp.id
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                  )}
                >
                  <p className="text-base mb-0.5">{sp.icon}</p>
                  <p className={cn(
                    "text-[11px] font-bold leading-tight",
                    selectedSpecialist?.id === sp.id ? "text-blue-700" : "text-slate-800"
                  )}>
                    {sp.label}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{sp.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedSpecialist && (
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">원하시는 일정을 선택하세요</p>
              <div className="space-y-2">
                {slots.map((slot) => (
                  <button
                    key={slot.date}
                    disabled={!slot.ok}
                    onClick={() => {
                      setShowSched(false);
                      onToast(`📅 ${selectedSpecialist.label} 상담 ${slot.date} ${slot.time} 예약이 완료되었습니다.`);
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
            </div>
          )}

          {!selectedSpecialist && (
            <p className="text-[11px] text-slate-400 text-center">
              전문가를 선택하면 일정 선택 화면이 나타납니다.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
