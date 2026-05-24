export function reducer(state, action) {
  switch (action.type) {

    case "SET_CHILD":
      return { ...state, child: { ...state.child, ...action.payload } };

    case "ADD_CLIP":
      return {
        ...state,
        todayClips: [...state.todayClips, action.clip],
      };

    case "DELETE_CLIP":
      return {
        ...state,
        todayClips: state.todayClips.filter((c) => c.id !== action.clipId),
      };

    case "APPROVE_CLIP":
      return {
        ...state,
        todayClips: state.todayClips.map((c) =>
          c.id === action.clipId ? { ...c, approved: action.value } : c
        ),
      };

    case "ADD_CAMERA":
      return { ...state, cameras: [...state.cameras, action.cam] };

    case "UPDATE_CAMERA_STATUS":
      return {
        ...state,
        cameras: state.cameras.map((c) =>
          c.id === action.id ? { ...c, status: action.status } : c
        ),
      };

    // AI 소견서 저장
    case "ADD_REPORT":
      return {
        ...state,
        allReports: [action.report, ...state.allReports],
      };

    // 의사 권고 업데이트
    case "SET_DOCTOR_NOTE":
      return { ...state, doctorNote: action.payload };

    case "READ_NOTIFICATION":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, read: true } : n
        ),
      };

    case "READ_ALL_NOTIFICATIONS":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };

    case "ADD_NOTIFICATION":
      return {
        ...state,
        notifications: [action.notification, ...state.notifications],
      };

    default:
      return state;
  }
}