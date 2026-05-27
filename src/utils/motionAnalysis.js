/**
 * KidTrack 경량 모션 분석 엔진
 *
 * PDF 원본: MediaPipe 포즈 추정 + 시계열 관절 데이터셋
 * 열화버전: Canvas 픽셀 차분 기반 움직임 벡터 분석
 *
 * 한계: 관절 좌표 추출 불가 → 움직임 강도/패턴/대칭성으로 근사
 */

// ── 상수 ──────────────────────────────────────────────────────
const GRID_COLS  = 8;   // 화면을 8x6 구역으로 분할
const GRID_ROWS  = 6;
const REPEAT_WINDOW = 10; // 반복 패턴 감지 윈도우 (프레임 수)
const ASYMMETRY_THRESHOLD = 0.35; // 좌우 비대칭 판정 기준

/**
 * 두 프레임 사이의 픽셀 차분으로 움직임 벡터 계산
 * @param {ImageData} prev - 이전 프레임
 * @param {ImageData} curr - 현재 프레임
 * @returns {{ grid: number[][], totalMotion: number, leftMotion: number, rightMotion: number }}
 */
export function computeMotionVector(prev, curr) {
  const { width, height, data: pd } = prev;
  const { data: cd } = curr;

  const cellW = Math.floor(width  / GRID_COLS);
  const cellH = Math.floor(height / GRID_ROWS);

  // 구역별 움직임 강도 초기화
  const grid = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(0)
  );

  let totalMotion = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // RGB 채널 차분 합산
      const diff =
        Math.abs(pd[idx]     - cd[idx])     +
        Math.abs(pd[idx + 1] - cd[idx + 1]) +
        Math.abs(pd[idx + 2] - cd[idx + 2]);

      if (diff > 30) { // 노이즈 임계값
        const col = Math.min(Math.floor(x / cellW), GRID_COLS - 1);
        const row = Math.min(Math.floor(y / cellH), GRID_ROWS - 1);
        grid[row][col] += diff;
        totalMotion += diff;
      }
    }
  }

  // 좌/우 움직임 분리 (좌우 대칭성 분석용)
  let leftMotion  = 0;
  let rightMotion = 0;
  const midCol = Math.floor(GRID_COLS / 2);

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (c < midCol) leftMotion  += grid[r][c];
      else            rightMotion += grid[r][c];
    }
  }

  // 정규화 (최대값 기준)
  const maxVal = Math.max(...grid.flat(), 1);
  const normalizedGrid = grid.map((row) =>
    row.map((v) => Math.round((v / maxVal) * 100))
  );

  return {
    grid:        normalizedGrid,
    totalMotion: Math.round(totalMotion / (width * height)), // 픽셀당 평균
    leftMotion:  Math.round(leftMotion),
    rightMotion: Math.round(rightMotion),
    timestamp:   Date.now(),
  };
}

/**
 * 시계열 모션 데이터에서 상동 행동 패턴 감지
 * PDF 원본: "특정 관절이 비정상적으로 높은 주파수로 반복적 궤적"
 * 열화버전: 움직임 강도의 주기적 반복을 FFT 없이 자기상관으로 감지
 *
 * @param {number[]} motionHistory - totalMotion 시계열 배열
 * @returns {{ detected: boolean, frequency: number, confidence: number }}
 */
export function detectRepetitivePattern(motionHistory) {
  if (motionHistory.length < REPEAT_WINDOW) {
    return { detected: false, frequency: 0, confidence: 0 };
  }

  const recent = motionHistory.slice(-REPEAT_WINDOW);
  const mean   = recent.reduce((a, b) => a + b, 0) / recent.length;

  // 평균과의 편차
  const deviations = recent.map((v) => v - mean);

  // 자기상관: lag 2~5 사이에서 양의 상관이 반복되면 상동 행동 의심
  let autocorrSum = 0;
  let peakCount   = 0;

  for (let lag = 2; lag <= 5; lag++) {
    let corr = 0;
    for (let i = 0; i < recent.length - lag; i++) {
      corr += deviations[i] * deviations[i + lag];
    }
    corr /= (recent.length - lag);
    if (corr > 0) {
      autocorrSum += corr;
      peakCount++;
    }
  }

  // 분산
  const variance = deviations.reduce((a, b) => a + b * b, 0) / recent.length;

  const confidence = Math.min(
    100,
    Math.round((autocorrSum / Math.max(variance, 1)) * 20)
  );
  const detected   = confidence > 40 && peakCount >= 3;

  // 대략적 주파수 (Hz) — 500ms 간격 기준
  const frequency = detected ? peakCount / (REPEAT_WINDOW * 0.5) : 0;

  return { detected, frequency: Math.round(frequency * 10) / 10, confidence };
}

/**
 * 좌우 비대칭성 분석
 * PDF 원본: "양측 사지의 대칭성 수치화 → 뇌성마비 예측 인자"
 * 열화버전: 좌우 구역별 움직임 비율로 근사
 *
 * @param {Array<{leftMotion: number, rightMotion: number}>} history
 * @returns {{ asymmetryScore: number, dominantSide: string, attentionNeeded: boolean }}
 */
export function analyzeAsymmetry(history) {
  if (history.length < 5) {
    return { asymmetryScore: 0, dominantSide: "unknown", attentionNeeded: false };
  }

  const recent = history.slice(-20);
  const avgLeft  = recent.reduce((a, b) => a + b.leftMotion,  0) / recent.length;
  const avgRight = recent.reduce((a, b) => a + b.rightMotion, 0) / recent.length;
  const total    = avgLeft + avgRight;

  if (total < 100) {
    return { asymmetryScore: 0, dominantSide: "none", attentionNeeded: false };
  }

  const leftRatio  = avgLeft  / total;
  const rightRatio = avgRight / total;
  const asymmetry  = Math.abs(leftRatio - rightRatio);

  return {
    asymmetryScore:  Math.round(asymmetry * 100),
    dominantSide:    leftRatio > rightRatio ? "왼쪽" : "오른쪽",
    attentionNeeded: asymmetry > ASYMMETRY_THRESHOLD,
  };
}

/**
 * 움직임 복잡성 분석
 * PDF 원본: "움직임의 복잡성과 부드러움 수치화"
 * 열화버전: 구역 분포 엔트로피로 복잡성 근사
 *
 * @param {number[][]} grid - 구역별 정규화 움직임 강도
 * @returns {{ complexity: number, smoothness: number }}
 */
export function analyzeMovementComplexity(grid) {
  const flat     = grid.flat().filter((v) => v > 0);
  if (flat.length === 0) return { complexity: 0, smoothness: 100 };

  const total    = flat.reduce((a, b) => a + b, 0);
  const probs    = flat.map((v) => v / total);

  // 섀넌 엔트로피 (복잡성)
  const entropy  = -probs.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0);
  const maxEntropy = Math.log2(GRID_COLS * GRID_ROWS);
  const complexity = Math.round((entropy / maxEntropy) * 100);

  // 부드러움: 인접 구역 간 변화량의 역수
  let roughness = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (r > 0) roughness += Math.abs(grid[r][c] - grid[r-1][c]);
      if (c > 0) roughness += Math.abs(grid[r][c] - grid[r][c-1]);
    }
  }
  const smoothness = Math.max(0, Math.round(100 - roughness / (GRID_COLS * GRID_ROWS * 2)));

  return { complexity, smoothness };
}

// ─────────────────────────────────────────────────────────────
// 논문 근거 이상행동 감지 함수들
// 출처: 영유아 발달 이상행동 지표 (발달재활 임상 관찰 기준)
// ─────────────────────────────────────────────────────────────

/**
 * 몸 앞뒤 흔들기 감지 (상동 행동)
 * - lag 3~7 자기상관에서 중간 주파수 진동 패턴 탐지
 * @param {number[]} motionHistory
 * @returns {{ detected: boolean, confidence: number }}
 */
export function detectBodyRocking(motionHistory) {
  if (motionHistory.length < 14) return { detected: false, confidence: 0 };

  const recent   = motionHistory.slice(-24);
  const mean     = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;

  // 움직임 자체가 미미하면 흔들기 아님
  if (mean < 2 || variance < 3) return { detected: false, confidence: 0 };

  // lag 3~7 (1.5~3.5초 주기) 에서 자기상관 피크 계산
  let rockScore = 0;
  for (let lag = 3; lag <= 7; lag++) {
    let corr = 0;
    for (let i = 0; i < recent.length - lag; i++) {
      corr += (recent[i] - mean) * (recent[i + lag] - mean);
    }
    corr /= (recent.length - lag) * variance;
    if (corr > 0.25) rockScore++;
  }

  const confidence = Math.min(100, rockScore * 22);
  return { detected: confidence >= 55, confidence };
}

/**
 * 급격한 홱 움직임 감지
 * - 연속 프레임 간 delta가 평균의 2배 + 2.5σ 이상인 스파이크 탐지
 * @param {number[]} motionHistory
 * @returns {{ detected: boolean, count: number }}
 */
export function detectJerkyMovements(motionHistory) {
  if (motionHistory.length < 6) return { detected: false, count: 0 };

  const recent = motionHistory.slice(-20);
  const mean   = recent.reduce((a, b) => a + b, 0) / recent.length;
  const std    = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);

  let spikeCount = 0;
  for (let i = 1; i < recent.length; i++) {
    const delta = Math.abs(recent[i] - recent[i - 1]);
    if (delta > Math.max(mean * 2.0, std * 2.5)) spikeCount++;
  }

  return { detected: spikeCount >= 3, count: spikeCount };
}

/**
 * 손 위아래 반복 흔들기 감지 (Hand flapping)
 * - 화면 상단 2행 구역의 고주파 반복 움직임 탐지
 * @param {number[][][]} gridHistory  — 각 요소는 GRID_ROWS × GRID_COLS 배열
 * @returns {{ detected: boolean, confidence: number }}
 */
export function detectHandFlapping(gridHistory) {
  if (gridHistory.length < 8) return { detected: false, confidence: 0 };

  const upperMotions = gridHistory.slice(-16).map((grid) => {
    if (!grid || grid.length < 2) return 0;
    return (
      grid[0].reduce((a, b) => a + b, 0) +
      grid[1].reduce((a, b) => a + b, 0)
    );
  });

  const mean = upperMotions.reduce((a, b) => a + b, 0) / upperMotions.length;
  if (mean < 5) return { detected: false, confidence: 0 };

  // 고주파 = 평균 위/아래 교차 횟수 많음
  let crossings  = 0;
  let prevAbove  = upperMotions[0] >= mean;
  for (let i = 1; i < upperMotions.length; i++) {
    const currAbove = upperMotions[i] >= mean;
    if (currAbove !== prevAbove) { crossings++; prevAbove = currAbove; }
  }

  const confidence = Math.min(100, crossings * 9);
  return { detected: crossings >= 6 && confidence > 45, confidence };
}

/**
 * 회전/빙빙 돌기 감지 (Spinning)
 * - 프레임별 움직임 피크 컬럼이 좌↔우로 순환하는 패턴 탐지
 * @param {number[][][]} gridHistory
 * @returns {{ detected: boolean, confidence: number }}
 */
export function detectSpinning(gridHistory) {
  if (gridHistory.length < 10) return { detected: false, confidence: 0 };

  const recent = gridHistory.slice(-10);
  const COLS   = recent[0]?.[0]?.length || GRID_COLS;

  // 각 프레임에서 움직임이 가장 많은 열 index
  const peakCols = recent.map((grid) => {
    if (!grid) return 0;
    const colTotals = Array(COLS).fill(0);
    grid.forEach((row) => row.forEach((v, c) => { colTotals[c] += v; }));
    return colTotals.indexOf(Math.max(...colTotals));
  });

  // 피크 열이 좌↔우↔좌 방향 전환 횟수
  let dirChanges = 0;
  for (let i = 2; i < peakCols.length; i++) {
    const d1 = peakCols[i - 1] - peakCols[i - 2];
    const d2 = peakCols[i]     - peakCols[i - 1];
    if ((d1 > 1 && d2 < -1) || (d1 < -1 && d2 > 1)) dirChanges++;
  }

  const confidence = Math.min(100, dirChanges * 25);
  return { detected: dirChanges >= 3, confidence };
}

/**
 * 세션 전체 분석 결과를 종합 점수로 변환
 * — 논문 기반 9가지 이상행동 항목 반영
 *
 * @param {{ motionHistory, vectorHistory, repetitive, asymmetry, complexity, gridHistory }} sessionData
 * @returns {{ observationScore: number, attentionFlags: string[], summary: string, avgMotion: number }}
 */
export function computeSessionScore(sessionData) {
  const {
    motionHistory,
    repetitive,
    asymmetry,
    complexity,
    gridHistory = [],
  } = sessionData;

  const attentionFlags = [];
  let deduction = 0;

  // ── 논문 근거 이상행동 9가지 ───────────────────────────────

  // ① 회전 행동 (자신/물건을 빙빙 돌림)
  const spinning = detectSpinning(gridHistory);
  if (spinning.detected) {
    attentionFlags.push("회전성 반복 움직임(빙빙 돌기)이 관찰됨");
    deduction += 20;
  }

  // ② 몸 앞뒤 흔들기
  const rocking = detectBodyRocking(motionHistory);
  if (rocking.detected) {
    attentionFlags.push("몸을 앞뒤로 반복적으로 흔드는 행동이 관찰됨");
    deduction += 25;
  } else if (repetitive.detected && !spinning.detected) {
    // 기존 반복 패턴 (흔들기로 분류되지 않은 상동 행동)
    attentionFlags.push(`반복적인 움직임 패턴이 관찰됨 (빈도 약 ${repetitive.frequency}Hz)`);
    deduction += 20;
  }

  // ③ 보호자 행동 모방 없음 — 로컬 알고리즘으로는 감지 불가
  //    → Claude Vision이 단독 판단 (attentionFlags에 추가 안 함)

  // ④ 급격한 홱 움직임
  const jerky = detectJerkyMovements(motionHistory);
  if (jerky.detected) {
    attentionFlags.push(`몸을 급하게 홱 움직이는 행동이 ${jerky.count}회 관찰됨`);
    deduction += 15;
  }

  // ⑤ 갑자기 달려드는 행동 — 갑작스러운 대형 모션 스파이크로 근사
  //    jerky와 겹치지 않도록, 극단적 스파이크(top 5%) 따로 체크
  const avgMotion = motionHistory.length > 0
    ? motionHistory.reduce((a, b) => a + b, 0) / motionHistory.length
    : 0;
  const maxMotion = motionHistory.length > 0 ? Math.max(...motionHistory) : 0;
  if (!jerky.detected && maxMotion > avgMotion * 4 && maxMotion > 20) {
    attentionFlags.push("갑작스럽고 충동적인 큰 움직임이 관찰됨");
    deduction += 10;
  }

  // ⑥ 까치발 보행 — 픽셀 차분으로는 감지 불가 → Claude Vision 단독

  // ⑦ 손 위아래 반복 흔들기 (hand flapping)
  const flapping = detectHandFlapping(gridHistory);
  if (flapping.detected) {
    attentionFlags.push("손을 위아래로 반복적으로 흔드는 행동이 관찰됨");
    deduction += 20;
  }

  // ⑧ 안겼을 때 신체 경직 — 카메라 관찰로 감지 불가 → Claude Vision 단독

  // ⑨ 주변 자극 무관심 (무반응)
  if (avgMotion < 3 && motionHistory.length > 10) {
    attentionFlags.push("주변 자극에 대한 반응 움직임이 매우 적게 관찰됨");
    deduction += 15;
  }

  // ── 추가 보조 지표 ────────────────────────────────────────

  // 좌우 비대칭 (편측 움직임)
  if (asymmetry.attentionNeeded) {
    attentionFlags.push(
      `${asymmetry.dominantSide} 편측 움직임 집중 관찰 (비대칭도 ${asymmetry.asymmetryScore}%)`
    );
    deduction += 20;
  }

  // 단조로운 움직임 패턴
  if (complexity.complexity < 20 && avgMotion > 5) {
    attentionFlags.push("움직임 다양성이 낮고 단조로운 패턴이 관찰됨");
    deduction += 10;
  }

  const observationScore = Math.max(0, 100 - deduction);

  const summary =
    attentionFlags.length > 0
      ? `관찰 중 ${attentionFlags.length}가지 주의 행동이 감지되었습니다: ${attentionFlags.slice(0, 2).join(", ")}.`
      : "관찰 기간 동안 특이 행동 패턴이 감지되지 않았습니다.";

  return { observationScore, attentionFlags, summary, avgMotion };
}