import { useState, useRef, useEffect, useCallback } from "react";
import { cn, analyzeFrames, generateReport } from "../utils/helpers";
import Button from "../components/Button";
import Modal from "../components/Modal";
import PulsingDot from "../components/PulsingDot";
import ReportCard from "../components/ReportCard";

// 영상에서 일정 간격으로 프레임 캡처 (canvas 사용)
function captureFrames(videoEl, count = 10) {
  const canvas = document.createElement("canvas");
  canvas.width  = videoEl.videoWidth  || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");

  // 현재 프레임 1장만 즉시 캡처
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve([blob]), "image/jpeg", 0.85);
  });
}

export default function TabMonitor({ state, dispatch, onToast }) {
  // 카메라 상태
  const [camStream,    setCamStream]    = useState(null);
  const [camError,     setCamError]     = useState("");
  const [camMode,      setCamMode]      = useState("idle"); // idle | preview | recording | analyzing
  const [recordSec,    setRecordSec]    = useState(0);
  const [facingMode,   setFacingMode]   = useState("user"); // user | environment

  // 분석 결과
  const [analysis,     setAnalysis]     = useState(null);
  const [report,       setReport]       = useState("");
  const [analyzedAt,   setAnalyzedAt]   = useState(null);
  const [capturedFrames, setCapturedFrames] = useState([]);

  // UI 상태
  const [showGuide,    setShowGuide]    = useState(false);
  const [showReport,   setShowReport]   = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [doctorEmail,  setDoctorEmail]  = useState("");
  const [doctorName,   setDoctorName]   = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const videoRef    = useRef(null);
  const mediaRecRef = useRef(null);
  const timerRef    = useRef(null);
  const frameCapRef = useRef(null); // 녹화 중 프레임 캡처 인터벌

  // ── 카메라 시작 ───────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCamError("");
    try {
      // 기존 스트림 정리
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setCamStream(stream);
      setCamMode("preview");

      // video 엘리먼트에 연결
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      let msg = "카메라를 시작할 수 없습니다.";
      if (err.name === "NotAllowedError")  msg = "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.";
      if (err.name === "NotFoundError")    msg = "카메라 장치를 찾을 수 없습니다.";
      if (err.name === "NotReadableError") msg = "카메라가 다른 앱에서 사용 중입니다.";
      setCamError(msg);
    }
  }, [facingMode, camStream]);

  // ── 카메라 종료 ───────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStream(null);
    setCamMode("idle");
    clearInterval(timerRef.current);
    clearInterval(frameCapRef.current);
  }, [camStream]);

  // ── 전후면 카메라 전환 ────────────────────────────────────────
  const flipCamera = async () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (camMode !== "idle") {
      if (camStream) camStream.getTracks().forEach((t) => t.stop());
      setCamMode("idle");
      // 짧은 딜레이 후 재시작
      setTimeout(() => startCamera(), 200);
    }
  };

  // ── 녹화 시작 ────────────────────────────────────────────────
  const startRecording = () => {
    if (!camStream) return;

    const frames = [];
    setCapturedFrames([]);
    setRecordSec(0);
    setCamMode("recording");

    // 타이머
    timerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);

    // 3초마다 프레임 캡처
    frameCapRef.current = setInterval(async () => {
      if (videoRef.current) {
        const [blob] = await captureFrames(videoRef.current);
        if (blob) frames.push(blob);
        setCapturedFrames([...frames]);
      }
    }, 3000);

    // 내부 배열 참조 저장
    mediaRecRef.current = frames;
  };

  // ── 녹화 중지 + 분석 ─────────────────────────────────────────
  const stopAndAnalyze = async () => {
  clearInterval(timerRef.current);
  clearInterval(frameCapRef.current);
  setCamMode("analyzing");

  const frames = mediaRecRef.current || [];

  // 마지막 프레임 추가 캡처
  if (videoRef.current && frames.length < 3) {
    try {
      const [blob] = await captureFrames(videoRef.current);
      if (blob) frames.push(blob);
    } catch {}
  }

  if (frames.length === 0) {
    onToast("⚠️ 캡처된 프레임이 없습니다. 다시 시도해주세요.");
    setCamMode("preview");   // ← 반드시 복구
    return;
  }

  try {
    onToast("🤖 AI가 영상을 확인 중입니다...");

    const result = await analyzeFrames({
      frames,
      childId: state.child.id || "child_001",
      clipId:  `clip_${Date.now()}`,
    });

    setAnalysis(result.analysis);
    setAnalyzedAt(result.analyzedAt);
    setCapturedFrames(frames);

    dispatch({
      type: "ADD_CLIP",
      clip: {
        id:       result.clipId,
        time:     new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
        label:    result.analysis.flagged ? "이상 행동 감지 구간" : "일상 영상",
        duration: `${recordSec}초`,
        flagged:  result.analysis.flagged,
        approved: null,
        analysis: result.analysis,
      },
    });

    const { report: reportText } = await generateReport({
      childName:    state.child.name,
      childDaysOld: state.child.daysOld,
      analysis:     result.analysis,
      clipCount:    state.todayClips.length + 1,
      period:       "오늘",
    });

    setReport(reportText);

    dispatch({
      type: "ADD_REPORT",
      report: {
        id:           "report_" + result.clipId,
        createdAt:    result.analyzedAt,
        childName:    state.child.name,
        clipId:       result.clipId,
        analysis:     result.analysis,
        reportText,
        sentToDoctor: false,
      },
    });

    if (result.analysis.flagged) {
      dispatch({
        type: "ADD_NOTIFICATION",
        notification: {
          id:   "n_" + Date.now(),
          text: `AI가 이상 행동을 감지했습니다. (신뢰도 ${result.analysis.confidence}%)`,
          time: "방금",
          read: false,
        },
      });
    }

    setCamMode("preview");   // ← 분석 완료 후 반드시 preview로 복구
    setShowReport(true);

    onToast(result.analysis.flagged
      ? "⚠️ 이상 행동이 감지되었습니다. 관찰 요약을 확인하세요."
      : "✅ 확인 완료. 이상 행동이 없습니다."
    );

  } catch (err) {
    console.error("관찰 오류:", err);
    onToast(`❌ 관찰 실패: ${err.message}`);
    setCamMode("preview");   // ← 에러 시에도 반드시 복구
  }
};

  // ── 의사에게 검토 요청 ────────────────────────────────────────
  const handleSendReview = async () => {
    if (!doctorEmail) { onToast("의사 이메일을 입력해주세요."); return; }
    setSendingEmail(true);
    try {
      const { sendDoctorReview } = await import("../utils/helpers");
      await sendDoctorReview({
        doctorEmail,
        doctorName:    doctorName || "담당 의사",
        childName:     state.child.name,
        childDaysOld:  state.child.daysOld,
        report,
        analysis,
        frames:        capturedFrames,
      });
      setShowReviewModal(false);
      onToast("📨 담당 의사에게 검토 요청을 전송했습니다.");
    } catch (err) {
      onToast(`❌ 전송 실패: ${err.message}`);
    }
    setSendingEmail(false);
  };

  // 컴포넌트 언마운트 시 스트림 정리
  useEffect(() => () => stopCamera(), []);

  const totalSec = state.todayClips.reduce((acc, c) => {
    const m = c.duration.match(/(\d+)분\s*(\d+)초/);
    if (m) return acc + parseInt(m[1]) * 60 + parseInt(m[2]);
    const s = c.duration.match(/(\d+)초/);
    if (s) return acc + parseInt(s[1]);
    return acc;
  }, 0);

  const resources = [
    { name: "광진구 보건소 모자보건실",  tel: "02-450-1517",  wait: "약 2주 대기" },
    { name: "서울아동발달지원센터",       tel: "1899-0184",    wait: "약 4주 대기" },
    { name: "한국자폐인사랑협회",         tel: "02-2235-0131", wait: "즉시 상담 가능" },
  ];

  return (
    <div className="p-4 space-y-4">

      {/* ── 수집 현황 ── */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-slate-800">
          <PulsingDot />
          가정 내 홈캠 및 CCTV 자동 수집 중
        </div>
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
          <span className="text-sm text-slate-600">오늘 저장된 일상 영상</span>
          <span className="font-bold text-slate-800">
            {state.todayClips.length}개{" "}
            <span className="text-xs font-normal text-slate-500">
              (총 {Math.floor(totalSec / 60)}분)
            </span>
          </span>
        </div>
      </div>

      {/* ── 카메라 뷰 ── */}
      <div className="bg-slate-800 rounded-xl overflow-hidden shadow-lg">
        {/* 상단 툴바 */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            {camMode === "recording" && (
              <>
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-xs font-bold">
                  REC {String(Math.floor(recordSec / 60)).padStart(2, "0")}:
                      {String(recordSec % 60).padStart(2, "0")}
                </span>
                <span className="text-slate-400 text-xs">
                  프레임 {capturedFrames.length}장 캡처됨
                </span>
              </>
            )}
            {camMode === "analyzing" && (
              <span className="text-amber-400 text-xs font-bold animate-pulse">
                🤖 AI 확인 중...
              </span>
            )}
            {camMode === "preview" && (
              <span className="text-green-400 text-xs font-bold">● 카메라 연결됨</span>
            )}
            {camMode === "idle" && (
              <span className="text-slate-400 text-xs">카메라 꺼짐</span>
            )}
          </div>
          {camMode !== "idle" && (
            <button onClick={flipCamera} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors">
              🔄 전환
            </button>
          )}
        </div>

        {/* 비디오 영역 */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "w-full h-full object-cover",
              facingMode === "user" && "scale-x-[-1]", // 전면 카메라 좌우 반전
              camMode === "idle" && "hidden"
            )}
          />

          {/* 카메라 꺼진 상태 */}
          {camMode === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl">📷</span>
              <p className="text-slate-400 text-sm text-center px-4">
                카메라를 켜면 AI가 실시간으로<br />아이의 행동을 확인합니다
              </p>
            </div>
          )}

          {/* 분석 중 오버레이 */}
          {camMode === "analyzing" && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
              <div className="text-4xl animate-spin">🤖</div>
              <p className="text-white text-sm font-bold">AI 확인 중...</p>
              <p className="text-slate-400 text-xs">{capturedFrames.length}개 프레임 처리 중</p>
            </div>
          )}

          {/* 녹화 중 격자 오버레이 */}
          {camMode === "recording" && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 border-2 border-red-500/30 m-4 rounded" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/10" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/10" />
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/10" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/10" />
            </div>
          )}
        </div>

        {/* 카메라 오류 */}
        {camError && (
          <div className="px-3 py-2 bg-red-900/50 text-red-300 text-xs">
            ⚠️ {camError}
          </div>
        )}

        {/* 컨트롤 버튼 */}
        <div className="p-3 flex gap-2">
          {camMode === "idle" && (
            <button
              onClick={startCamera}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg text-sm transition-colors active:scale-95"
            >
              📷 카메라 켜기
            </button>
          )}

          {camMode === "preview" && (
            <>
              <button
                onClick={startRecording}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg text-sm transition-colors active:scale-95"
              >
                ⏺ 녹화 시작
              </button>
              <button
                onClick={stopCamera}
                className="px-4 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg text-sm transition-colors"
              >
                끄기
              </button>
            </>
          )}

          {camMode === "recording" && (
            <button
              onClick={stopAndAnalyze}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg text-sm transition-colors active:scale-95"
            >
              ⏹ 중지 후 이상 행동 확인
            </button>
          )}

          {camMode === "analyzing" && (
            <div className="flex-1 bg-slate-700 text-slate-400 font-bold py-3 rounded-lg text-sm text-center cursor-not-allowed">
              확인 중...
            </div>
          )}
        </div>
      </div>

      {/* ── 의사 권고 ── */}
      <div className="bg-slate-700 text-white p-4 rounded-xl shadow-md border-l-4 border-amber-500">
        <div className="flex items-center gap-2 mb-1 text-amber-400 font-bold text-sm">
          🩺 의사 권고 사항
        </div>
        <p className="text-sm leading-relaxed">
          이번 주{" "}
          <strong className="bg-slate-800 px-1 rounded">
            '{state.doctorNote.keyword}'
          </strong>{" "}
          집중 관찰 기간입니다.
        </p>
        <p className="text-xs text-slate-300 mt-1">{state.doctorNote.text}</p>
      </div>

      {/* ── AI 소견서 결과 ── */}
      {analysis && (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-800 text-sm">최근 AI 관찰 결과</h3>
            <button
              onClick={() => setShowReport(!showReport)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showReport ? "접기" : "펼치기"}
            </button>
          </div>
          {showReport && (
            <ReportCard
              analysis={analysis}
              report={report}
              analyzedAt={analyzedAt}
              onRequestReview={() => setShowReviewModal(true)}
            />
          )}
        </div>
      )}

      {/* ── 지역 자원 ── */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm mb-2">🏥 지역 자원 연계 가이드</h3>
        <button
          onClick={() => setShowGuide(true)}
          className="w-full text-left bg-slate-50 hover:bg-slate-100 p-3 rounded-lg text-sm text-slate-700 flex justify-between items-center transition-colors"
        >
          <span>광진구 보건소 대기 현황 연동 가이드</span>
          <span className="text-slate-400">›</span>
        </button>
      </div>

      {/* ── 모달: 지역 자원 ── */}
      <Modal open={showGuide} onClose={() => setShowGuide(false)} title="광진구 발달지원 자원 안내">
        <div className="space-y-3 text-sm">
          {resources.map((r) => (
            <div key={r.name} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-800">{r.name}</p>
              <p className="text-slate-500 text-xs mt-1">
                📞 {r.tel} · <span className="text-green-600">{r.wait}</span>
              </p>
            </div>
          ))}
          <Button
            variant="teal"
            onClick={() => { setShowGuide(false); onToast("📅 상담 예약 화면으로 이동합니다."); }}
          >
            📅 바로 예약하기
          </Button>
        </div>
      </Modal>

      {/* ── 모달: 의사 검토 요청 ── */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="담당 의사에게 검토 요청"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            종합 관찰 요약과 영상 프레임이 담당 의사의 이메일로 전송됩니다.
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

          {/* 전송 내용 미리보기 */}
          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-700 mb-2">📦 전송될 내용</p>
            <p>· 종합 관찰 요약</p>
            <p>· 행동 관찰 요약 ({analysis?.behaviors?.filter((b) => b.observed).length || 0}개 항목)</p>
            <p>· 영상 프레임 이미지 ({Math.min(capturedFrames.length, 5)}장)</p>
            <p>· 환아 정보: {state.child.name} (D+{state.child.daysOld})</p>
          </div>

          <Button
            variant="primary"
            onClick={handleSendReview}
            disabled={sendingEmail || !doctorEmail}
          >
            {sendingEmail ? "⏳ 전송 중..." : "📨 검토 요청 전송"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}