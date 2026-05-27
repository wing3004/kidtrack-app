// 더미 데이터 없음. 모든 데이터는 실제 촬영/분석에서 생성됩니다.

export const INITIAL_STATE = {
  child: {
    name:     "",        // 앱 최초 실행 시 설정
    daysOld:  0,
    id:       "child_001",
  },
  cameras: [],           // 카메라는 기기 연결 시 추가
  todayClips: [],        // 오늘 촬영된 클립 (분석 결과 포함)
  allReports: [],        // 누적 AI 소견서 목록
  doctorActivities: [], // 전문가 추천 활동 목록
  doctorNote: {
    text:    "",
    keyword: "",
    date:    "",
  },
  notifications: [],
};

export const TABS = [
  { id: "monitor",  label: "모니터링", icon: "🏠" },
  { id: "homecam",  label: "홈캠 연동", icon: "📹" },
  { id: "pattern",  label: "패턴 분석", icon: "📊" },
  { id: "registry", label: "관찰기록",   icon: "📁" },
  { id: "solution", label: "활동 가이드", icon: "💡" },
];