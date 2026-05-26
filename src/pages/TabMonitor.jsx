import { useState, useRef, useEffect, useCallback } from "react";
import { cn, analyzeFrames, generateReport } from "../utils/helpers";
import {
  computeMotionVector,
  detectRepetitivePattern,
  analyzeAsymmetry,
  analyzeMovementComplexity,
  computeSessionScore,
} from "../utils/motionAnalysis";
import Button from "../components/Button";
import Modal from "../components/Modal";
import PulsingDot from "../components/PulsingDot";
import ReportCard from "../components/ReportCard";

// ── 히든 캔버스에서 ImageData 추출 ──────────────────────────
function getFrameImageData(videoEl, canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width  = videoEl.videoWidth  || 320;
  canvas.height = videoEl.videoHeight || 240;
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ── Blob → 썸네일 data URL 변환 ─────────────────────────────
function blobToThumbnail(blob, maxW = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const scale = maxW / img.width;
      const canvas = document.createElement("canvas");
      canvas.width = maxW;
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── AI 전송용 JPEG Blob 캡처 ────────────────────────────────
function captureJpegBlob(videoEl, canvas) {
  return new Promise((resolve) => {
    const ctx = canvas.getContext("2d");
    canvas.width  = videoEl.videoWidth  || 640;
    canvas.height = videoEl.videoHeight || 480;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });
}

export default function TabMonitor({ state, dispatch, onToast }) {
  // 카메라
  const [camStream,       setCamStream]       = useState(null);
  const [camError,        setCamError]        = useState("");
  const [camMode,         setCamMode]         = useState("idle"); // idle|preview|recording|analyzing
  const [facingMode,      setFacingMode]      = useState("environment");
  const [recordSec,       setRecordSec]       = useState(0);

  // 분석 결과
  const [analysis,        setAnalysis]        = useState(null);
  const [report,          setReport]          = useState("");
  const [analyzedAt,      setAnalyzedAt]      = useState(null);
  const [capturedFrames,  setCapturedFrames]  = useState([]);
  const [showReport,      setShowReport]      = useState(false);

  // 실시간 모션 UI
  const [liveMotion,      setLiveMotion]      = useState(0);
  const [liveRepeat,      setLiveRepeat]      = useState(false);
  const [frameCount,      setFrameCount]      = useState(0);

  // UI 상태
  const [showGuide,       setShowGuide]       = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [doctorEmail,     setDoctorEmail]     = useState("");
  const [doctorName,      setDoctorName]      = useState("");
  const [sendingEmail,    setSendingEmail]    = useState(false);

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);   // 히든 캔버스 (모션 분석 + 캡처 공용)
  const timerRef   = useRef(null);
  const captureRef = useRef(null);

  // 세션 데이터 — ref로 관리 (렌더링 없이 누적)
  const sessionRef = useRef({
    frames:        [],
    motionHistory: [],
    vectorHistory: [],
    prevImageData: null,
    repetitive:    { detected: false, frequency: 0, confidence: 0 },
    asymmetry:     { asymmetryScore: 0, dominantSide: "unknown", attentionNeeded: false },
    complexity:    { complexity: 50, smoothness: 50 },
  });

  // ── 카메라 시작 ───────────────────────────────────────────
  const startCamera = useCallback(async (facing) => {
    const useFacing = facing || facingMode;
    setCamError("");
    try {
      if (camStream) camStream.getTracks().forEach((t) => t.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: useFacing,
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setCamStream(stream);
      setCamMode("preview");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
    } catch (err) {
      const msgs = {
        NotAllowedError:  "카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.",
        NotFoundError:    "카메라 장치를 찾을 수 없습니다.",
        NotReadableError: "카메라가 다른 앱에서 사용 중입니다.",
      };
      setCamError(msgs[err.name] || "카메라를 시작할 수 없습니다.");
      setCamMode("idle");
    }
  }, [facingMode, camStream]);

  // ── 카메라 종료 ───────────────────────────────────────────
  const stopCamera = useCallback(() => {
    clearInterval(timerRef.current);
    clearInterval(captureRef.current);
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStream(null);
    setCamMode("idle");
  }, [camStream]);

  // ── 전후면 전환 ───────────────────────────────────────────
  const flipCamera = () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (camMode !== "idle") {
      if (camStream) camStream.getTracks().forEach((t) => t.stop());
      setCamMode("idle");
      setTimeout(() => startCamera(next), 300);
    }
  };

  // ── 관찰 시작 ─────────────────────────────────────────────
  const startRecording = () => {
    if (!camStream || !videoRef.current) return;

    sessionRef.current = {
      frames:        [],
      motionHistory: [],
      vectorHistory: [],
      prevImageData: null,
      repetitive:    { detected: false, frequency: 0, confidence: 0 },
      asymmetry:     { asymmetryScore: 0, dominantSide: "unknown", attentionNeeded: false },
      complexity:    { complexity: 50, smoothness: 50 },
    };

    setRecordSec(0);
    setFrameCount(0);
    setLiveMotion(0);
    setLiveRepeat(false);
    setCamMode("recording");

    timerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);

    // 500ms마다 프레임 처리 (초당 2프레임)
    captureRef.current = setInterval(async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const session = sessionRef.current;

      // 1. ImageData 추출 (모션 분석용)
      const currImageData = getFrameImageData(video, canvas);

      if (session.prevImageData) {
        // 2. 픽셀 차분 기반 움직임 벡터 계산
        const vector = computeMotionVector(session.prevImageData, currImageData);

        session.motionHistory.push(vector.totalMotion);
        session.vectorHistory.push({
          leftMotion:  vector.leftMotion,
          rightMotion: vector.rightMotion,
        });

        // 3. 복잡성 분석
        session.complexity = analyzeMovementComplexity(vector.grid);

        // 4. 반복 패턴 감지
        session.repetitive = detectRepetitivePattern(session.motionHistory);

        // 5. 좌우 비대칭 분석
        session.asymmetry  = analyzeAsymmetry(session.vectorHistory);

        // 실시간 UI
        setLiveMotion(vector.totalMotion);
        setLiveRepeat(session.repetitive.detected);
      }

      session.prevImageData = currImageData;

      // 6. AI 전송용 JPEG — 2초마다 1장 (4프레임마다)
      if (session.motionHistory.length % 4 === 0) {
        try {
          const blob = await captureJpegBlob(video, canvas);
          if (blob) session.frames.push(blob);
        } catch {}
      }

      setFrameCount(session.motionHistory.length);
    }, 500);
  };

  // ── 관찰 종료 + AI 분석 ───────────────────────────────────
  const stopAndAnalyze = async () => {
    clearInterval(timerRef.current);
    clearInterval(captureRef.current);
    setCamMode("analyzing");

    const session = sessionRef.current;

    // 마지막 프레임 추가 캡처
    if (videoRef.current && canvasRef.current) {
      try {
        const blob = await captureJpegBlob(videoRef.current, canvasRef.current);
        if (blob) session.frames.push(blob);
      } catch {}
    }

    if (session.frames.length === 0) {
      onToast("⚠️ 캡처된 프레임이 없습니다. 다시 시도해주세요.");
      setCamMode("preview");
      return;
    }

    try {
      // 1. 로컬 모션 분석 종합
      const localScore = computeSessionScore({
        motionHistory: session.motionHistory,
        vectorHistory: session.vectorHistory,
        repetitive:    session.repetitive,
        asymmetry:     session.asymmetry,
        complexity:    session.complexity,
      });

      onToast("🤖 관찰 기록을 분석 중입니다...");

      // 2. Claude Vision 분석
      const result = await analyzeFrames({
        frames:  session.frames,
        childId: state.child.id || "child_001",
        clipId:  `clip_${Date.now()}`,
        localAnalysisHint: JSON.stringify({
          repetitiveDetected:  session.repetitive.detected,
          repetitiveFrequency: session.repetitive.frequency,
          asymmetryScore:      session.asymmetry.asymmetryScore,
          asymmetrySide:       session.asymmetry.dominantSide,
          movementComplexity:  session.complexity.complexity,
          attentionFlags:      localScore.attentionFlags,
        }),
      });

      // 3. 로컬 + Claude 분석 병합
      const mergedAnalysis = {
        ...result.analysis,
        localMotionData: {
          observationScore: localScore.observationScore,
          attentionFlags:   localScore.attentionFlags,
          repetitive:       session.repetitive,
          asymmetry:        session.asymmetry,
          complexity:       session.complexity,
          frameCount:       session.motionHistory.length,
        },
        attentionNeeded:
          result.analysis.attentionNeeded ||
          localScore.attentionFlags.length > 0,
      };

      setAnalysis(mergedAnalysis);
      setAnalyzedAt(result.analyzedAt);
      setCapturedFrames(session.frames);

      // 4. 이상 감지 시 키 프레임 썸네일 생성 (이전/감지순간/이후)
      const keyFrames = [];
      if (session.frames.length > 0) {
        const motionH = session.motionHistory;
        const peakMotionIdx = motionH.indexOf(Math.max(...motionH, 0));
        const peakFrameIdx  = Math.min(
          Math.floor(peakMotionIdx / 4),
          session.frames.length - 1
        );
        const frameIndices = [...new Set([
          0,
          peakFrameIdx,
          session.frames.length - 1,
        ])];
        const thumbs = await Promise.all(
          frameIndices.map((i) => blobToThumbnail(session.frames[i]))
        );
        keyFrames.push(...thumbs.filter(Boolean));
      }

      // 5. 클립 저장
      dispatch({
        type: "ADD_CLIP",
        clip: {
          id:       result.clipId,
          time:     new Date().toLocaleTimeString("ko-KR", {
            hour: "2-digit", minute: "2-digit",
          }),
          label:    mergedAnalysis.attentionNeeded
            ? "주의 행동 관찰 구간"
            : "일상 관찰 영상",
          duration: `${recordSec}초`,
          flagged:  mergedAnalysis.attentionNeeded,
          approved: null,
          analysis: mergedAnalysis,
          keyFrames,
        },
      });

      // 6. 관찰 기록 요약문 생성
      const { report: reportText } = await generateReport({
        childName:    state.child.name,
        childDaysOld: state.child.daysOld,
        analysis:     mergedAnalysis,
        clipCount:    state.todayClips.length + 1,
        period:       "오늘",
      });

      setReport(reportText);

      // 6. 소견서 저장
      dispatch({
        type: "ADD_REPORT",
        report: {
          id:           "report_" + result.clipId,
          createdAt:    result.analyzedAt,
          childName:    state.child.name,
          clipId:       result.clipId,
          analysis:     mergedAnalysis,
          reportText,
          sentToDoctor: false,
        },
      });

      // 7. 주의 행동 관찰 시 알림
      if (mergedAnalysis.attentionNeeded) {
        dispatch({
          type: "ADD_NOTIFICATION",
          notification: {
            id:   "n_" + Date.now(),
            text: "주의 행동이 관찰되었습니다. 관찰 기록을 확인하세요.",
            time: "방금",
            read: false,
          },
        });
      }

      setCamMode("preview");
      setShowReport(true);
      onToast(
        mergedAnalysis.attentionNeeded
          ? "📋 주의 행동이 관찰되었습니다. 기록을 확인하세요."
          : "✅ 관찰 완료. 특이 행동이 관찰되지 않았습니다."
      );

    } catch (err) {
      console.error("분석 오류:", err);
      onToast(`❌ 분석 실패: ${err.message}`);
      setCamMode("preview");
    }
  };

  // 언마운트 시 스트림 정리
  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(captureRef.current);
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
  }, []);

  const totalSec = state.todayClips.reduce((acc, c) => {
    const m = c.duration?.match(/(\d+)분\s*(\d+)초/);
    if (m) return acc + parseInt(m[1]) * 60 + parseInt(m[2]);
    const s = c.duration?.match(/(\d+)초/);
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

      {/* 수집 현황 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-slate-800">
          <PulsingDot />
          관찰 기록 수집 중
        </div>
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
          <span className="text-sm text-slate-600">오늘 저장된 관찰 영상</span>
          <span className="font-bold text-slate-800">
            {state.todayClips.length}개{" "}
            <span className="text-xs font-normal text-slate-500">
              (총 {Math.floor(totalSec / 60)}분)
            </span>
          </span>
        </div>
      </div>

      {/* 카메라 뷰 */}
      <div className="bg-slate-800 rounded-xl overflow-hidden shadow-lg">

        {/* 상태바 */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            {camMode === "recording" && (
              <>
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-xs font-bold">
                  REC {String(Math.floor(recordSec / 60)).padStart(2, "0")}:
                      {String(recordSec % 60).padStart(2, "0")}
                </span>
                <span className="text-slate-400 text-xs">· {frameCount}f</span>
                {liveRepeat && (
                  <span className="text-amber-400 text-[10px] font-bold animate-pulse ml-1">
                    반복 감지
                  </span>
                )}
              </>
            )}
            {camMode === "analyzing" && (
              <span className="text-amber-400 text-xs font-bold animate-pulse">
                🤖 분석 중...
              </span>
            )}
            {camMode === "preview" && (
              <span className="text-green-400 text-xs font-bold">● 연결됨</span>
            )}
            {camMode === "idle" && (
              <span className="text-slate-400 text-xs">카메라 꺼짐</span>
            )}
          </div>
          {camMode !== "idle" && (
            <button
              onClick={flipCamera}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
            >
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
              facingMode === "user" && "scale-x-[-1]",
              camMode === "idle" && "hidden"
            )}
          />

          {camMode === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl">📷</span>
              <p className="text-slate-400 text-sm text-center px-4 leading-relaxed">
                카메라를 켜면 AI가<br />아이의 행동을 관찰·기록합니다
              </p>
              <p className="text-slate-600 text-[10px] text-center px-6">
                ※ 관찰 기록 보조 도구입니다.<br />의료적 판단을 내리지 않습니다.
              </p>
            </div>
          )}

          {camMode === "analyzing" && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
              <div className="text-4xl animate-spin">🤖</div>
              <p className="text-white text-sm font-bold">관찰 기록 분석 중...</p>
              <p className="text-slate-400 text-xs">
                {capturedFrames.length}개 프레임 처리 중
              </p>
            </div>
          )}

          {/* 녹화 중 모션 강도 바 */}
          {camMode === "recording" && (
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none">
              <div className="bg-black/40 rounded-full h-1 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-200",
                    liveMotion > 15 ? "bg-amber-400" :
                    liveMotion > 5  ? "bg-blue-400"  : "bg-green-400"
                  )}
                  style={{ width: `${Math.min(liveMotion * 4, 100)}%` }}
                />
              </div>
              <p className="text-[9px] text-white/40 text-center mt-0.5">
                움직임 강도
              </p>
            </div>
          )}
        </div>

        {camError && (
          <div className="px-3 py-2 bg-red-900/50 text-red-300 text-xs">
            ⚠️ {camError}
          </div>
        )}

        {/* 컨트롤 버튼 */}
        <div className="p-3 flex gap-2">
          {camMode === "idle" && (
            <button
              onClick={() => startCamera()}
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
                ⏺ 관찰 시작
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
              ⏹ 관찰 종료 후 기록 분석
            </button>
          )}
          {camMode === "analyzing" && (
            <div className="flex-1 bg-slate-700 text-slate-400 font-bold py-3 rounded-lg text-sm text-center cursor-not-allowed">
              분석 중...
            </div>
          )}
        </div>
      </div>

      {/* 모션 분석 요약 (관찰 후 표시) */}
      {analysis?.localMotionData && (
        <div className="bg-slate-700 text-white p-4 rounded-xl space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">
            📊 모션 관찰 요약
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-600 rounded-lg p-2 text-center">
              <p className="text-xl font-bold text-white">
                {analysis.localMotionData.observationScore}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">관찰 점수</p>
            </div>
            <div className="bg-slate-600 rounded-lg p-2 text-center">
              <p className="text-xl font-bold text-white">
                {analysis.localMotionData.frameCount}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">분석 프레임</p>
            </div>
            <div className="bg-slate-600 rounded-lg p-2 text-center">
              <p className={cn(
                "text-xl font-bold",
                analysis.localMotionData.repetitive?.detected
                  ? "text-amber-400"
                  : "text-green-400"
              )}>
                {analysis.localMotionData.repetitive?.detected ? "감지" : "없음"}
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">반복 움직임</p>
            </div>
          </div>

          {analysis.localMotionData.attentionFlags?.length > 0 && (
            <div className="space-y-1">
              {analysis.localMotionData.attentionFlags.map((f, i) => (
                <p key={i} className="text-[11px] text-amber-300 flex items-start gap-1">
                  <span className="mt-0.5 flex-shrink-0">·</span>
                  <span>{f}</span>
                </p>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-500 leading-relaxed">
            ※ 위 수치는 기기 내 모션 분석 참고값입니다.
            의료적 판단 기준이 아닙니다.
          </p>
        </div>
      )}

      {/* 전문가 참고 사항 */}
      {state.doctorNote?.keyword && (
        <div className="bg-slate-700 text-white p-4 rounded-xl border-l-4 border-amber-500">
          <div className="flex items-center gap-2 mb-1 text-amber-400 font-bold text-sm">
            🩺 전문가 참고 사항
          </div>
          <p className="text-sm leading-relaxed">
            이번 주{" "}
            <strong className="bg-slate-800 px-1 rounded">
              '{state.doctorNote.keyword}'
            </strong>{" "}
            집중 관찰 기간입니다.
          </p>
          <p className="text-xs text-slate-300 mt-1">
            {state.doctorNote.text}
          </p>
        </div>
      )}

      {/* 관찰 기록 결과 */}
      {analysis && (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <h3 className="font-bold text-slate-800 text-sm">최근 관찰 기록</h3>
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

      {/* 지역 자원 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm mb-2">🏥 지역 자원 연계</h3>
        <button
          onClick={() => setShowGuide(true)}
          className="w-full text-left bg-slate-50 hover:bg-slate-100 p-3 rounded-lg text-sm text-slate-700 flex justify-between items-center transition-colors"
        >
          <span>광진구 발달지원 자원 안내</span>
          <span className="text-slate-400">›</span>
        </button>
      </div>

      {/* 모달: 지역 자원 */}
      <Modal open={showGuide} onClose={() => setShowGuide(false)} title="발달지원 자원 안내">
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

      {/* 모달: 전문가 기록 전달 */}
      <Modal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="전문가에게 관찰 기록 전달"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            관찰 기록 요약문과 영상 프레임이 전문가 이메일로 전달됩니다.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                전문가 이름
              </label>
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
                이메일 <span className="text-red-500">*</span>
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

          <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-700 mb-1">📦 전달 내용</p>
            <p>· 육아 관찰 기록 요약문</p>
            <p>· 모션 분석 참고 데이터</p>
            <p>· 영상 프레임 ({Math.min(capturedFrames.length, 5)}장)</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <p className="text-[11px] text-amber-700 leading-relaxed">
              ※ 전달되는 내용은 관찰 기록 참고 자료입니다.
              의료적 진단이 아니며, 정확한 평가는 전문가 상담을 통해 받으시기 바랍니다.
            </p>
          </div>

          <Button
            variant="primary"
            onClick={async () => {
              if (!doctorEmail) { onToast("이메일을 입력해주세요."); return; }
              setSendingEmail(true);
              try {
                const { sendDoctorReview } = await import("../utils/helpers");
                await sendDoctorReview({
                  doctorEmail,
                  doctorName,
                  childName:    state.child.name,
                  childDaysOld: state.child.daysOld,
                  report,
                  analysis,
                  frames:       capturedFrames,
                });
                setShowReviewModal(false);
                onToast("📨 전문가에게 관찰 기록을 전달했습니다.");
              } catch (err) {
                onToast(`❌ 전송 실패: ${err.message}`);
              }
              setSendingEmail(false);
            }}
            disabled={sendingEmail || !doctorEmail}
          >
            {sendingEmail ? "⏳ 전송 중..." : "📨 관찰 기록 전달"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}