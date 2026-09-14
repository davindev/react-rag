import type { StoredChunk } from '../db.js';

/**
 * 검색 전략 경계 인터페이스.
 * 검색 전략(RETRIEVER_KINDS 참조)을 동일 파이프라인·동일 Eval로
 * 교체 비교하기 위해 검색을 이 인터페이스 뒤로 분리한다.
 *
 * 계약: 반환 배열은 관련도 내림차순이다. 단 `score`의 스케일·의미는 구현마다
 * 다르다 (dense: cosine, hybrid: RRF 점수, rerank 계열: base의 원 점수 유지) —
 * 소비자는 순서를 신뢰하되 score를 구현 간 비교하면 안 된다.
 */
export interface Retriever {
  retrieve(query: string, topK: number): Promise<StoredChunk[]>;
}
