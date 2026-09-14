import { serve } from '@hono/node-server';
import { clientConfigOf, loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { createOpenAiCompatibleClient } from '../llm/client.js';
import { createRetriever } from '../retrieval/index.js';
import { createApp } from './app.js';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const llm = createOpenAiCompatibleClient(clientConfigOf(config));

const app = createApp({
  retriever: createRetriever(config.RETRIEVER, {
    pool,
    llm,
    embeddingModel: config.EMBEDDING_MODEL,
    rerankModel: config.RERANK_MODEL ?? config.LLM_MODEL,
  }),
  llm,
  llmModel: config.LLM_MODEL,
  minScore: config.RETRIEVAL_MIN_SCORE,
  defaultTopK: config.TOP_K,
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`react-rag 서버 시작: http://localhost:${info.port} (Swagger UI: /doc)`);
});
