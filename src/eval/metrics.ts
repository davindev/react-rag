import type { Citation } from '../rag/pipeline.js';

/**
 * 결정적(비-LLM) metric 계산.
 * 검색·인용 평가는 문서(docPath) 단위로 매칭한다 — 청크 경계는 청킹 전략에 따라
 * 달라지므로 청크 단위 gold label은 청킹 전략 실험과 양립할 수 없기 때문.
 */

/** Recall@k: 기대 근거 문서 중 top-k 검색 결과에 포함된 비율 */
export function recallAtK(expectedDocs: string[], retrievedDocs: string[]): number {
  if (expectedDocs.length === 0) return Number.NaN;
  const retrieved = new Set(retrievedDocs);
  const hit = expectedDocs.filter((doc) => retrieved.has(doc)).length;
  return hit / expectedDocs.length;
}

/** MRR: 기대 근거 문서가 처음 등장하는 순위의 역수 (문서 단위 dedupe 후) */
export function reciprocalRank(expectedDocs: string[], retrievedDocs: string[]): number {
  if (expectedDocs.length === 0) return Number.NaN;
  const expected = new Set(expectedDocs);
  const seen = new Set<string>();
  let rank = 0;
  for (const doc of retrievedDocs) {
    if (seen.has(doc)) continue;
    seen.add(doc);
    rank += 1;
    if (expected.has(doc)) return 1 / rank;
  }
  return 0;
}

/**
 * Citation Precision: 답변이 인용한 문서 중 기대 근거 문서에 속하는 비율.
 * 인용이 없으면 NaN (계산 불가 — 분모 0).
 */
export function citationPrecision(expectedDocs: string[], citations: Citation[]): number {
  const citedDocs = [...new Set(citations.map((c) => c.docPath))];
  if (citedDocs.length === 0 || expectedDocs.length === 0) return Number.NaN;
  const expected = new Set(expectedDocs);
  return citedDocs.filter((doc) => expected.has(doc)).length / citedDocs.length;
}

/**
 * Anchor Recall@k: 기대 근거 섹션(문서+앵커) 중 top-k 청크에 포함된 비율.
 * 문서 단위 Recall이 포화된 corpus에서 검색기의 섹션 수준 변별력을 측정한다.
 * 앵커는 문서 구조에서 오므로 청킹 전략이 바뀌어도 라벨이 유효하다.
 */
export function anchorRecallAtK(
  expected: { doc: string; anchor: string }[],
  retrieved: { docPath: string; anchors: string[] }[],
): number {
  if (expected.length === 0) return Number.NaN;
  const hit = expected.filter((e) =>
    retrieved.some((chunk) => chunk.docPath === e.doc && chunk.anchors.includes(e.anchor)),
  ).length;
  return hit / expected.length;
}

/** NaN을 제외한 평균. 유효 표본이 없으면 NaN */
export function mean(values: number[]): number {
  const valid = values.filter((v) => !Number.isNaN(v));
  if (valid.length === 0) return Number.NaN;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}
