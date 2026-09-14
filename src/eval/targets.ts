import type { Summary } from './report.js';

/**
 * Metric별 달성 목표.
 *
 * - gate: 회귀 차단 하한(또는 상한). CI에서 이 선을 넘으면 fail — baseline에서
 *   소표본·judge 분산으로 흔들릴 수 있는 여유를 뺀 값
 * - target: 개선 목표. 실험으로 도달 가능성이 확인된 수준(근거를 rationale에 기록)
 *
 * 수치의 기준 baseline: goldset v6, 최종 구성 모델(생성 gpt-5.6-sol + judge
 * gemini-3.1-pro-preview), dense (2026-08-18, eval/runs 참고).
 * 주의 1: goldset 버전이 바뀌면 분모(문항 구성)가 달라지므로 서로 다른 goldset의
 * 동명 지표는 직접 비교 불가 — run별 config.json의 goldsetHash로 구분한다.
 * 주의 2: judge 모델이 바뀌면 correctness/faithfulness 절대값이 달라진다 — Gemini judge는
 * 개발기 gpt-4o judge보다 엄격해 correctness가 0.914→0.845로 재현성 있게 하락했다(통제 반복 확인).
 */
export interface MetricTarget {
  key: keyof Pick<
    Summary,
    | 'recallAtK'
    | 'anchorRecallAtK'
    | 'mrr'
    | 'citationPrecision'
    | 'abstentionAccuracy'
    | 'falseRefusalRate'
    | 'faithfulness'
    | 'correctness'
  >;
  label: string;
  /** min: 값이 gate 이상이어야 통과, max: gate 이하이어야 통과 */
  direction: 'min' | 'max';
  gate: number;
  target: number;
  rationale: string;
}

export const METRIC_TARGETS: readonly MetricTarget[] = [
  {
    key: 'recallAtK',
    label: 'Recall@k (doc)',
    direction: 'min',
    gate: 0.95,
    target: 1.0,
    rationale:
      '최종 baseline dense 0.966 / rerank 1.0. 문서 단위 검색 실패는 파이프라인 전체를 무효화하는 심각 회귀',
  },
  {
    key: 'anchorRecallAtK',
    label: 'Anchor Recall@k',
    direction: 'min',
    gate: 0.6,
    target: 0.85,
    rationale:
      '최종 baseline dense 0.625 / rerank 0.750. 실험 3(개발기)의 topK=10 대조군이 0.893을 기록해 정답 섹션이 검색 가능함이 입증됨 — 정밀 선별(rerank 개선)로 0.85 달성이 현실적 목표. 임베딩 모델·차원은 개발기와 동일',
  },
  {
    key: 'mrr',
    label: 'MRR',
    direction: 'min',
    gate: 0.8,
    target: 0.9,
    rationale: '최종 baseline dense 0.819 / rerank 0.874. 상위 배치 품질의 회귀 감지용',
  },
  {
    key: 'citationPrecision',
    label: 'Citation Precision',
    direction: 'min',
    gate: 0.85,
    target: 0.95,
    rationale:
      'citation은 서비스의 핵심 계약. 실험 4의 라벨 감사(acceptableEvidence 도입)로 측정 오류를 제거함. 최종 baseline dense 0.883~0.895 / rerank 0.930 (생성 모델 의존 지표라 개발기 0.957에서 gpt-5.6-sol로 정당하게 변동). gate 0.85는 dense baseline에서 여유를 뺀 값',
  },
  {
    key: 'abstentionAccuracy',
    label: 'Abstention Accuracy',
    direction: 'min',
    gate: 0.75,
    target: 1.0,
    rationale:
      'baseline 1.0. hallucination 방지는 최우선 계약이므로 target은 만점. gate 0.75는 거부가 정답인 en 문항(v6: unanswerable 4 + injection 1 = 5문항) 중 1문항 실패까지만 허용(소표본 노이즈 여유). injection 회귀가 unanswerable에 희석될 수 있으므로 유형별 표도 함께 확인할 것',
  },
  {
    key: 'falseRefusalRate',
    label: 'False Refusal Rate',
    direction: 'max',
    gate: 0.1,
    target: 0,
    rationale:
      'baseline 0. 과잉 거부는 abstention을 올리는 손쉬운 편법이므로 반드시 쌍으로 gate를 둠 (한쪽으로의 붕괴 방지)',
  },
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    direction: 'min',
    gate: 0.9,
    target: 1.0,
    rationale: '최종 baseline 0.981. 근거 없는 주장 혼입은 citation 서비스의 신뢰를 직접 훼손',
  },
  {
    key: 'correctness',
    label: 'Correctness',
    direction: 'min',
    gate: 0.8,
    target: 0.9,
    rationale:
      '최종 구성 모델 baseline: dense 0.845(통제 반복 동일) / rerank 0.862. Gemini judge가 개발기 gpt-4o judge보다 엄격해 개발기(0.914~0.935)보다 낮게 재산정. gate는 dense baseline에서 여유를 뺀 0.80, target은 남은 실패(q12 유사 문서 혼동, q37/q38 partial, judge 엄격도)의 개선을 전제로 0.90',
  },
];

export type TargetStatus = 'target' | 'gate' | 'fail' | 'na';

/** 합격/불합격 판정의 단일 소스 — report 표시와 --strict exit code가 반드시 같은 규칙을 쓰도록 */
export function evaluateTarget(t: MetricTarget, actual: number): TargetStatus {
  if (Number.isNaN(actual)) return 'na';
  const meets = (threshold: number) =>
    t.direction === 'min' ? actual >= threshold : actual <= threshold;
  if (meets(t.target)) return 'target';
  return meets(t.gate) ? 'gate' : 'fail';
}

export interface GateViolation {
  label: string;
  actual: number;
  gate: number;
  direction: 'min' | 'max';
}

export function checkGates(summary: Summary): GateViolation[] {
  return METRIC_TARGETS.flatMap((t) => {
    const actual = summary[t.key];
    if (evaluateTarget(t, actual) !== 'fail') return [];
    return [{ label: t.label, actual, gate: t.gate, direction: t.direction }];
  });
}
