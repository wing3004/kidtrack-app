import { useState } from "react";
import { cn } from "../utils/helpers";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Button from "../components/Button";

export default function TabHomecam({ state, dispatch, onToast }) {
  const [openClip,      setOpenClip]      = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);
  const [filter,        setFilter]        = useState("all"); // all | flagged | approved
  const [sourceFilter,  setSourceFilter]  = useState("all"); // all | app | homecam
  const [showAddCam,    setShowAddCam]    = useState(false);
  const [newCamName,    setNewCamName]    = useState("");

  const handleApprove = (clipId) => {
    dispatch({ type: "APPROVE_CLIP", clipId, value: true });
    onToast("✅ 관찰 데이터 확인되었습니다.");
  };
  const handleReject = (clipId) => {
    dispatch({ type: "APPROVE_CLIP", clipId, value: false });
    onToast("❌ 기록 제외되었습니다.");
  };
  const handleDelete = () => {
    dispatch({ type: "DELETE_CLIP", clipId: deleteTarget.id });
    if (openClip === deleteTarget.id) setOpenClip(null);
    setDeleteTarget(null);
    onToast("🗑 영상이 삭제되었습니다.");
  };

  // 필터 적용
  const filtered = state.todayClips.filter((c) => {
    if (sourceFilter === "app"     && c.source !== "app")     return false;
    if (sourceFilter === "homecam" && c.source !== "homecam") return false;
    if (filter === "flagged")  return c.flagged;
    if (filter === "approved") return c.approved === true;
    return true;
  });

  // 통계
  const total    = state.todayClips.length;
  const flagged  = state.todayClips.filter((c) => c.flagged).length;
  const approved = state.todayClips.filter((c) => c.approved === true).length;
  const pending  = state.todayClips.filter((c) => c.approved === null && c.flagged).length;

  const freqColor = { none:"text-slate-400", occasional:"text-amber-500", frequent:"text-orange-500" };
  const freqLabel = { none:"관찰 안됨", occasional:"가끔 관찰", frequent:"자주 관찰" };

  const appCount    = state.todayClips.filter((c) => c.source === "app" || !c.source).length;
  const homecamCount = state.todayClips.filter((c) => c.source === "homecam").length;

  return (
    <div className="p-4 space-y-4">

      {/* 카메라 리스트 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">📹 연결된 카메라</h3>
          <button
            onClick={() => setShowAddCam(true)}
            className="text-[11px] text-blue-600 font-bold hover:underline"
          >
            + 홈캠 추가
          </button>
        </div>
        {/* 기기 카메라 */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">📱</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800">내 기기 카메라</p>
            <p className="text-[10px] text-slate-400">앱 촬영 · 영상 {appCount}개</p>
          </div>
          <span className="text-[10px] font-bold bg-green-100 text-green-600 px-1.5 py-0.5 rounded">연결됨</span>
        </div>
        {/* 등록된 홈캠 목록 */}
        {state.cameras.length === 0 ? (
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] text-slate-400">등록된 홈캠이 없습니다.</p>
          </div>
        ) : (
          state.cameras.map((cam) => (
            <div key={cam.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-base flex-shrink-0">🏠</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800">{cam.name || "홈캠"}</p>
                <p className="text-[10px] text-slate-400">홈캠 촬영</p>
              </div>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                cam.status === "online" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
              )}>
                {cam.status === "online" ? "연결됨" : "오프라인"}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 소스 필터 탭 */}
      <div className="flex gap-2">
        {[
          { key: "all",     label: `전체 (${state.todayClips.length})` },
          { key: "app",     label: `📱 앱 (${appCount})` },
          { key: "homecam", label: `🏠 홈캠 (${homecamCount})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setSourceFilter(f.key)}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition-colors",
              sourceFilter === f.key
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "총 영상",   value: total,    color: "text-slate-700", bg: "bg-white" },
          { label: "주의 행동 관찰", value: flagged,  color: "text-red-600",   bg: "bg-red-50" },
          { label: "승인됨",    value: approved, color: "text-green-600", bg: "bg-green-50" },
        ].map((s) => (
          <div key={s.label} className={cn("rounded-xl p-3 text-center border border-slate-200 shadow-sm", s.bg)}>
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 검수 필요 알림 */}
      {pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-xs font-bold text-amber-700">확인 필요 영상 {pending}개</p>
            <p className="text-[10px] text-amber-600">주의 행동이 관찰된 영상을 확인해주세요.</p>
          </div>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {[
            { key: "all",      label: `전체 (${total})` },
            { key: "flagged",  label: `이상 (${flagged})` },
            { key: "approved", label: `승인 (${approved})` },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold transition-colors",
                filter === f.key
                  ? "text-blue-600 border-b-2 border-blue-500"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 영상 목록 */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm text-slate-400">
              {total === 0 ? "모니터링 탭에서 영상을 촬영해주세요." : "해당 영상이 없습니다."}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((clip) => (
              <div
                key={clip.id}
                className={cn(
                  "border-b border-slate-100 last:border-0",
                  clip.flagged && clip.approved === null && "bg-amber-50"
                )}
              >
                {/* 클립 행 */}
                <div
                  className="flex items-center gap-3 p-3 hover:bg-slate-50/80 cursor-pointer transition-colors"
                  onClick={() => setOpenClip(openClip === clip.id ? null : clip.id)}
                >
                  {/* 썸네일 */}
                  <div
                    className={cn(
                      "w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center relative",
                      clip.flagged ? "bg-red-900" : "bg-slate-700"
                    )}
                  >
                    <span className="text-white text-sm">
                      {openClip === clip.id ? "⏸" : "▶"}
                    </span>
                    {clip.flagged && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {clip.label}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {clip.time} · {clip.duration}
                      {clip.analysis?.confidence !== undefined && (
                        <span className="ml-1 text-slate-300">
                          · 신뢰도 {clip.analysis.confidence}%
                        </span>
                      )}
                    </p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <Badge color="slate">{clip.source === "homecam" ? "🏠 홈캠" : "📱 앱"}</Badge>
                      {clip.flagged && clip.approved === null && <Badge color="amber">확인 필요</Badge>}
                      {clip.approved === true  && <Badge color="green">확인됨</Badge>}
                      {clip.approved === false && <Badge color="slate">제외됨</Badge>}
                    </div>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(clip); }}
                    className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                    title="삭제"
                  >
                    🗑
                  </button>
                </div>

                {/* 상세 패널 */}
                {openClip === clip.id && (
                  <div className="px-3 pb-4 space-y-3">
                    {/* 분석 결과 */}
                    {clip.analysis ? (
                      <div className="space-y-2">
                        {/* 요약 */}
                        <div
                          className={cn(
                            "p-3 rounded-lg text-xs leading-relaxed",
                            clip.flagged
                              ? "bg-red-50 border border-red-100 text-red-800"
                              : "bg-green-50 border border-green-100 text-green-800"
                          )}
                        >
                          <p className="font-bold mb-1">
                            {clip.flagged ? "⚠️ 관찰 내용 요약" : "✅ 관찰 내용 요약"}
                          </p>
                          <p>{clip.analysis.summary}</p>
                        </div>

                        {/* 행동 목록 */}
                        {clip.analysis.behaviors?.some((b) => b.observed) && (
                          <div className="bg-slate-50 p-3 rounded-lg">
                            <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase">
                              감지된 행동
                            </p>
                            <div className="space-y-1">
                              {clip.analysis.behaviors
                                .filter((b) => b.observed)
                                .map((b, i) => (
                                  <div key={i} className="flex justify-between items-center">
                                    <span className="text-xs text-slate-700">· {b.name}</span>
                                    <span className={cn("text-[10px] font-bold", freqColor[b.frequency])}>
                                      {freqLabel[b.frequency]}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* 주의 관찰 항목 상세 */}
                        {clip.analysis.attentionDetails && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                            <p className="text-[10px] font-bold text-amber-700 mb-1">⚠️ 주의 관찰 항목 설명</p>
                            <p className="text-xs text-amber-800 leading-relaxed">{clip.analysis.attentionDetails}</p>
                          </div>
                        )}

                        {/* 참고사항 */}
                        {clip.analysis.recommendation && (
                          <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                            <p className="text-[10px] font-bold text-blue-600 mb-1">💡 참고사항</p>
                            <p className="text-xs text-blue-800">{clip.analysis.recommendation}</p>
                          </div>
                        )}

                        {/* 관찰 순간 프레임 */}
                        {clip.keyFrames?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                              관찰 순간 프레임
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {clip.keyFrames.map((src, i) => (
                                <div key={i} className="flex-shrink-0 text-center">
                                  <img
                                    src={src}
                                    alt={`frame_${i}`}
                                    className="w-24 rounded-lg border border-slate-200 object-cover"
                                  />
                                  <p className="text-[9px] text-slate-400 mt-0.5">
                                    {i === 0
                                      ? "이전"
                                      : i === clip.keyFrames.length - 1
                                      ? "이후"
                                      : "감지 순간"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 승인/제외 버튼 */}
                        {clip.approved === null && clip.flagged && (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => handleReject(clip.id)}
                              className="flex-1"
                            >
                              ❌ 기록 제외
                            </Button>
                            <Button
                              variant="dark"
                              onClick={() => handleApprove(clip.id)}
                              className="flex-1"
                            >
                              ✓ 관찰 데이터 확인
                            </Button>
                          </div>
                        )}
                        {clip.approved !== null && (
                          <p className="text-center text-xs text-slate-400 py-1">
                            {clip.approved
                              ? "✅ 관찰 데이터로 승인됨"
                              : "❌ 기록 제외됨"}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-2">
                        분석 결과가 없습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 홈캠 추가 모달 */}
      <Modal open={showAddCam} onClose={() => { setShowAddCam(false); setNewCamName(""); }} title="홈캠 추가">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">홈캠의 이름을 입력하세요.</p>
          <input
            type="text"
            value={newCamName}
            onChange={(e) => setNewCamName(e.target.value)}
            placeholder="예: 거실 카메라"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400"
          />
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              ※ 실제 홈캠 연동 기능은 추후 업데이트 예정입니다.<br />
              현재는 카메라를 목록에 등록하는 기능만 제공합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setShowAddCam(false); setNewCamName(""); }} className="flex-1">취소</Button>
            <Button
              variant="dark"
              className="flex-1"
              onClick={() => {
                if (!newCamName.trim()) { onToast("카메라 이름을 입력해주세요."); return; }
                dispatch({ type: "ADD_CAMERA", cam: { id: `cam_${Date.now()}`, name: newCamName.trim(), status: "offline" } });
                setShowAddCam(false);
                setNewCamName("");
                onToast(`📹 "${newCamName.trim()}" 홈캠이 등록되었습니다.`);
              }}
            >
              등록
            </Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="영상 삭제"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="text-slate-800">"{deleteTarget?.label}"</strong> 영상을
            삭제하시겠습니까?
          </p>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3">
            <p className="text-xs text-red-600">
              ⚠️ 삭제된 영상은 복구할 수 없습니다.
              {deleteTarget?.approved === true && " 승인된 임상 데이터입니다."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="flex-1"
            >
              취소
            </Button>
            <button
              onClick={handleDelete}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg text-sm transition-colors"
            >
              삭제
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}