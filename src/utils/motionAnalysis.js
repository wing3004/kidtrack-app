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

/**
 * 세션 전체 분석 결과를 종합 점수로 변환
 * @param {{ motionHistory, vectorHistory, repetitive, asymmetry, complexity }} sessionData
 * @returns {{ observationScore: number, attentionFlags: string[], summary: string }}
 */
export function computeSessionScore(sessionData) {
  const { motionHistory, vectorHistory, repetitive, asymmetry, complexity } = sessionData;

  const attentionFlags = [];
  let deduction = 0;

  // 상동 행동 감지
  if (repetitive.detected) {
    attentionFlags.push(`반복 움직임 패턴 관찰 (빈도 약 ${repetitive.frequency}Hz)`);
    deduction += 25;
  }

  // 좌우 비대칭
  if (asymmetry.attentionNeeded) {
    attentionFlags.push(`${asymmetry.dominantSide} 편측 움직임 집중 (비대칭도 ${asymmetry.asymmetryScore}%)`);
    deduction += 20;
  }

  // 움직임 매우 적음 (무반응 가능성)
  const avgMotion = motionHistory.length > 0
    ? motionHistory.reduce((a, b) => a + b, 0) / motionHistory.length
    : 0;
  if (avgMotion < 3 && motionHistory.length > 10) {
    attentionFlags.push("전반적인 움직임 매우 적음 (무반응 가능성)");
    deduction += 15;
  }

  // 복잡성 낮음 (단조로운 움직임)
  if (complexity.complexity < 20 && avgMotion > 5) {
    attentionFlags.push("움직임 다양성 낮음 (단조로운 패턴)");
    deduction += 10;
  }

  const observationScore = Math.max(0, 100 - deduction);

  const summary =
    attentionFlags.length > 0
      ? `관찰 중 ${attentionFlags.length}가지 주의 행동이 감지되었습니다: ${attentionFlags.slice(0, 2).join(", ")}.`
      : "관찰 기간 동안 특이 행동 패턴이 감지되지 않았습니다.";

  return { observationScore, attentionFlags, summary, avgMotion };
}