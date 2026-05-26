import { useState, useReducer, useEffect } from "react";
import { INITIAL_STATE, TABS } from "./data/mockData";
import { reducer } from "./store/reducer";
import { cn } from "./utils/helpers";
import Toast from "./components/Toast";
import TabMonitor  from "./pages/TabMonitor";
import TabHomecam  from "./pages/TabHomecam";
import TabPattern  from "./pages/TabPattern";
import TabRegistry from "./pages/TabRegistry";
import TabSolution from "./pages/TabSolution";

function NotificationPanel({ notifications, onClose, dispatch }) {
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="absolute inset-0 z-40 bg-white flex flex-col">
      <div className="bg-slate-800 text-white pt-10 pb-4 px-4 flex justify-between items-center">
        <div>
          <h2 className="font-bold text-lg">알림</h2>
          {unread > 0 && <p className="text-xs text-slate-400">{unread}개 읽지 않음</p>}
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <button
              onClick={() => dispatch({ type: "READ_ALL_NOTIFICATIONS" })}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              모두 읽음
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scroll">
        {notifications.length === 0 && (
          <p className="text-center text-slate-400 text-sm mt-8">알림이 없습니다.</p>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => dispatch({ type: "READ_NOTIFICATION", id: n.id })}
            className={cn(
              "p-3.5 rounded-xl border cursor-pointer transition-all hover:shadow-sm",
              n.read ? "bg-white border-slate-200" : "bg-blue-50 border-blue-200"
            )}
          >
            <div className="flex justify-between items-start gap-2">
              <p className="text-sm text-slate-800 leading-relaxed flex-1">{n.text}</p>
              {!n.read && (
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">{n.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 최초 실행 시 아동 이름/생후일 설정 모달
function SetupModal({ onSave }) {
  const [name, setName]     = useState("");
  const [birth, setBirth]   = useState(""); // YYYY-MM-DD
  const [error, setError]   = useState("");

  const handleSave = () => {
    if (!name.trim())  { setError("이름을 입력해주세요."); return; }
    if (!birth)        { setError("생년월일을 선택해주세요."); return; }
    const daysOld = Math.floor((Date.now() - new Date(birth).getTime()) / 86400000);
    if (daysOld < 0)   { setError("올바른 생년월일을 입력해주세요."); return; }
    onSave({ name: name.trim(), daysOld });
  };

  return (
    <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">👶</div>
          <h1 className="text-white font-bold text-xl">KidTrack AI</h1>
          <p className="text-slate-400 text-sm mt-1">시작하기 전에 아이 정보를 입력해주세요</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-slate-300 text-xs font-bold block mb-1.5">아이 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 김지훈"
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="text-slate-300 text-xs font-bold block mb-1.5">생년월일</label>
            <input
              type="date"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors active:scale-95 mt-2"
          >
            시작하기 →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch]   = useReducer(reducer, INITIAL_STATE);
  const [activeTab, setActiveTab] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [toast, setToast]   = useState(null);
  const [isSetup, setIsSetup] = useState(false); // 초기 설정 완료 여부

  // localStorage에서 아동 정보 복원
  useEffect(() => {
    const saved = localStorage.getItem("kidtrack_child");
    if (saved) {
      const child = JSON.parse(saved);
      dispatch({ type: "SET_CHILD", payload: child });
      setIsSetup(true);
    }
    const savedReports = localStorage.getItem("kidtrack_reports");
    if (savedReports) {
      JSON.parse(savedReports).forEach((r) => {
        dispatch({ type: "ADD_REPORT", report: r });
      });
    }
  }, []);

  // 소견서 변경 시 localStorage 동기화
  useEffect(() => {
    if (state.allReports.length > 0) {
      localStorage.setItem("kidtrack_reports", JSON.stringify(state.allReports));
    }
  }, [state.allReports]);

  const handleSetup = (childInfo) => {
    dispatch({ type: "SET_CHILD", payload: childInfo });
    localStorage.setItem("kidtrack_child", JSON.stringify(childInfo));
    setIsSetup(true);
  };

  const onToast = (msg) => setToast(msg);
  const unreadCount = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div
        className="w-full max-w-[400px] bg-slate-100 rounded-3xl shadow-2xl overflow-hidden flex flex-col border-4 border-gray-800 relative"
        style={{ height: "min(850px, 95vh)" }}
      >
        {/* 초기 설정 모달 */}
        {!isSetup && <SetupModal onSave={handleSetup} />}

        {/* 헤더 */}
        <header className="bg-slate-800 text-white pt-9 pb-3 px-4 z-10 flex-shrink-0">
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm flex items-center gap-1.5">
              👶{" "}
              <span>
                {state.child.name || "---"}{" "}
                <span className="text-slate-400 font-normal">
                  (D+{state.child.daysOld || 0})
                </span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-sm font-semibold opacity-80">🌐 KR</button>
              <button className="relative p-1" onClick={() => setShowNotif(true)}>
                <span className="text-lg">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full border-2 border-slate-800 text-[9px] font-bold flex items-center justify-center px-0.5">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
// header 태그 안, 기존 bg-slate-700 div를 아래로 교체
          <div className="bg-slate-700 rounded-lg py-1.5 px-3 text-xs flex items-center gap-2 text-slate-300">
            📝{" "}
            <span>
              관찰 기록 보조 앱{" "}
              <span className="text-slate-400">· 의료적 진단 도구가 아닙니다</span>
            </span>
          </div>
        </header>

        {/* 메인 */}
        <main className="flex-1 overflow-y-auto no-scroll pb-20">
          {activeTab === 0 && (
            <TabMonitor state={state} dispatch={dispatch} onToast={onToast} />
          )}
          {activeTab === 1 && (
            <TabHomecam state={state} dispatch={dispatch} onToast={onToast} />
          )}
          {activeTab === 2 && (
            <TabPattern state={state} dispatch={dispatch} onToast={onToast} />
          )}
          {activeTab === 3 && (
            <TabRegistry state={state} dispatch={dispatch} onToast={onToast} />
          )}
          {activeTab === 4 && (
            <TabSolution state={state} onToast={onToast} />
          )}
        </main>

        {/* 하단 탭바 */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 h-16 flex items-center z-20 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(i)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-all relative",
                activeTab === i
                  ? "text-blue-600"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[9px] font-bold">{tab.label}</span>
              {activeTab === i && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* 알림 패널 */}
        {showNotif && (
          <NotificationPanel
            notifications={state.notifications}
            onClose={() => setShowNotif(false)}
            dispatch={dispatch}
          />
        )}

        {/* 토스트 */}
        {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      </div>
    </div>
  );
}