import type pg from 'pg';
import type { StoredChunk } from '../db.js';

/**
 * Postgres full-text search 기반 키워드 검색 (hybrid 검색 실험용).
 * websearch_to_tsquery는 자연어 질의를 안전하게 tsquery로 변환한다.
 * score는 ts_rank 값으로 cosine similarity와 스케일이 다르지만,
 * RRF 융합은 순위만 사용하므로 문제가 되지 않는다.
 */
export async function searchFts(
  pool: pg.Pool,
  query: string,
  topK: number,
): Promise<StoredChunk[]> {
  const result = await pool.query<{
    id: string;
    doc_path: string;
    heading_path: string[];
    anchors: string[];
    url: string;
    content: string;
    score: number;
  }>(
    `SELECT id, doc_path, heading_path, anchors, url, content,
            ts_rank(tsv, query) AS score
     FROM chunks, websearch_to_tsquery('english', $1) query
     WHERE tsv @@ query
     ORDER BY score DESC, id
     LIMIT $2`,
    [query, topK],
  );
  return result.rows.map((row) => ({
    id: row.id,
    docPath: row.doc_path,
    headingPath: row.heading_path,
    anchors: row.anchors,
    url: row.url,
    content: row.content,
    score: row.score,
  }));
}
