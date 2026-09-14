import { readFileSync } from 'node:fs';
import path from 'node:path';
import { swaggerUI } from '@hono/swagger-ui';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { ask, askStream, type RagDeps } from '../rag/pipeline.js';
import { askRequestSchema, askResponseSchema, errorResponseSchema } from './schemas.js';

export interface AppDeps extends RagDeps {
  defaultTopK: number;
}

const askRoute = createRoute({
  method: 'post',
  path: '/ask',
  summary: 'React 문서 기반 질의응답',
  description:
    '질문을 받아 관련 문서 청크를 검색하고, 검색된 근거에 citation을 달아 답변한다. ' +
    '근거가 불충분하면 answerable=false로 응답한다. ' +
    '스트리밍이 필요하면 POST /ask/stream(SSE)을 사용한다.',
  request: {
    body: { content: { 'application/json': { schema: askRequestSchema } }, required: true },
  },
  responses: {
    200: {
      description: '답변',
      content: { 'application/json': { schema: askResponseSchema } },
    },
    500: {
      description: '서버 오류',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono();

  // 데모·개발 편의용 전체 허용 — 페이지를 다른 origin(file://, 다른 포트)에서 열어도 API 호출 가능.
  // 인증 없는 로컬 데모 API라 허용 범위를 좁힐 실익이 없음 (운영 전환 시 origin 제한 필요)
  app.use('*', cors());

  app.openapi(askRoute, async (c) => {
    const { question, topK = deps.defaultTopK, history = [] } = c.req.valid('json');
    return c.json(await ask(deps, question, topK, history), 200);
  });

  // SSE는 zod-openapi의 typed response로 표현할 수 없어 별도 엔드포인트로 분리한다.
  // (JSON/SSE를 한 엔드포인트에 합치면 응답 타입 보장을 포기해야 함)
  // 요청 스키마는 /ask와 동일하며, delta 이벤트(답변 토큰) → done 이벤트(최종 AskResponse) 순으로 전달.
  app.post('/ask/stream', async (c) => {
    const parsed = askRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, 400);
    }
    const { question, topK = deps.defaultTopK, history = [] } = parsed.data;

    return streamSSE(c, async (sse) => {
      for await (const event of askStream(deps, question, topK, history)) {
        if (event.type === 'delta') {
          await sse.writeSSE({ event: 'delta', data: JSON.stringify({ text: event.text }) });
        } else {
          await sse.writeSSE({ event: 'done', data: JSON.stringify(event.result) });
        }
      }
    });
  });

  // 상세 오류는 로그로만 남긴다 — 업스트림(LLM API) 오류 본문을 클라이언트에 노출하지 않음
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'react-rag',
      version: '0.1.0',
      description: 'Citation 기반 React 문서 QA API',
    },
  });
  app.get('/doc', swaggerUI({ url: '/openapi.json' }));
  app.get('/healthz', (c) => c.json({ ok: true }));

  // 데모용 챗 UI — 빌드 스텝 없는 단일 정적 파일. 부팅 시 1회 로드(CWD 비의존)
  const chatPage = readFileSync(path.resolve(import.meta.dirname, 'public/index.html'), 'utf-8');
  app.get('/', (c) => c.html(chatPage));

  return app;
}
