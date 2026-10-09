// Isolated synthetic runner loaded inside a reviewed Provider candidate image.
// No account directory or upstream client is constructed.
const { createApp } = require('/app/src/app');
const { ConversationStore } = require('/app/src/conversation-store');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
fs.mkdirSync('/app/runtime', { recursive: true, mode: 0o700 });
const store = new ConversationStore({ storePath: '/app/runtime/history.json' });
const app = createApp({ config: {
  qaProvider: 'ima-web-agent', mimo: {}, webAgent: { sharedKnowledgeBaseId: 'synthetic-kb' },
  conversations: { storePath: store.storePath }, security: { apiToken: 'synthetic-api', internalServiceToken: 'synthetic-service' },
  concurrency: { maxConcurrentAsk: 5, queueLimit: 20, requestTimeoutMs: 180000 },
  limits: { maxQuestionLength: 2000 }, rateLimit: { windowMs: 0, max: 0 },
}, conversationStore: store, webReadiness: { mode: 'knowledge_agent', snapshot: () => ({ mode: 'knowledge_agent', knowledgeAgentCapacity: 5, capacity: 5, schedulable: 5 }) },
imaWebAgentClient: { async *streamAsk({ question, signal, onDispatch }) {
  onDispatch?.();
  yield { type: 'sources', sources: [{ title: 'Synthetic source', url: 'https://example.invalid/synthetic' }], sourceKind: 'knowledge' };
  yield { type: 'delta', text: '## 合成回答\n\n| 项目 | 数值 |\n| --- | --- |\n' };
  await delay(question.includes('slow') ? 8000 : 500, undefined, { signal });
  yield { type: 'delta', text: '| Docker |  123  |\n' };
  if (question.includes('missing-terminal')) return;
  yield { type: 'done' };
} } });
const server = app.listen(3000, '0.0.0.0');
process.once('SIGTERM', () => { app.locals.durableQATasks?.close(); server.closeAllConnections(); server.close(() => process.exit(0)); });
