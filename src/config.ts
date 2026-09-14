import { z } from 'zod';
import type { ClientConfig } from './llm/client.js';
import { RETRIEVER_KINDS } from './retrieval/index.js';

// 시스템 경계(환경 변수)에서만 런타임 검증을 수행한다.
const envSchema = z.object({
  LLM_API_KEY: z.string().min(1),
  // 엘리스 ML API는 모델(엔드포인트)마다 base_url이 다르므로 역할별로 받는다.
  // (mlapi.run/{endpoint-id}/v1 — 모델별 endpoint-id가 상이)
  LLM_MODEL: z.string().min(1),
  LLM_BASE_URL: z.url(),
  EMBEDDING_MODEL: z.string().min(1),
  EMBEDDING_BASE_URL: z.url(),
  JUDGE_MODEL: z.string().min(1),
  JUDGE_BASE_URL: z.url(),
  /** rerank 전용 모델 — 미지정 시 LLM_MODEL 사용. 분리 이유: reranker만 싼 모델로 교체하는 ablation 지원 */
  RERANK_MODEL: z.string().min(1).optional(),
  /** rerank 전용 base_url — RERANK_MODEL 지정 시 함께 지정 (미지정 시 LLM_BASE_URL) */
  RERANK_BASE_URL: z.url().optional(),
  /**
   * temperature를 지원하지 않는 모델명(쉼표 구분). reasoning 모델(예: gpt-5.6-sol)은
   * temperature=0을 400으로 거부하므로 여기에 넣으면 파라미터를 생략한다.
   */
  NO_TEMPERATURE_MODELS: z
    .string()
    .default('')
    .transform(
      (s) =>
        new Set(
          s
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean),
        ),
    ),
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** retrieval 최고 점수 하한(점수 의미는 retriever별 상이). 기본 0(비활성) — Eval 데이터로 튜닝한다 */
  RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).default(0),
  TOP_K: z.coerce.number().int().positive().default(5),
  /** 검색 전략 실험 토글: 서버·Eval이 공유하는 검색 전략 선택 */
  RETRIEVER: z.enum(RETRIEVER_KINDS).default('dense'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`잘못되었거나 누락된 환경 변수: ${missing} (.env.example 참고)`);
  }
  return parsed.data;
}

/** LlmClient가 쓸 model → base_url 매핑을 config에서 구성한다 */
export function endpointsOf(config: Config): Record<string, string> {
  const endpoints: Record<string, string> = {};
  // 클라이언트가 model 이름으로만 라우팅하므로, 같은 모델명에 서로 다른 base_url이
  // 지정되면 조용한 오라우팅 대신 부팅 시점에 실패시킨다 (시스템 경계 검증)
  const add = (model: string, baseUrl: string) => {
    const existing = endpoints[model];
    if (existing !== undefined && existing !== baseUrl) {
      throw new Error(
        `모델 '${model}'에 서로 다른 base_url이 지정되었습니다: ${existing} vs ${baseUrl}`,
      );
    }
    endpoints[model] = baseUrl;
  };
  add(config.LLM_MODEL, config.LLM_BASE_URL);
  add(config.EMBEDDING_MODEL, config.EMBEDDING_BASE_URL);
  add(config.JUDGE_MODEL, config.JUDGE_BASE_URL);
  if (config.RERANK_MODEL !== undefined) {
    add(config.RERANK_MODEL, config.RERANK_BASE_URL ?? config.LLM_BASE_URL);
  }
  return endpoints;
}

/** createOpenAiCompatibleClient에 넘길 클라이언트 설정을 config에서 구성 */
export function clientConfigOf(config: Config): ClientConfig {
  return {
    apiKey: config.LLM_API_KEY,
    endpoints: endpointsOf(config),
    noTemperatureModels: config.NO_TEMPERATURE_MODELS,
  };
}
