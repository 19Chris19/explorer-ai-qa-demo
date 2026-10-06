export const owner = 'demo:00000000-0000-4000-8000-000000000001';
export const otherOwner = 'demo:00000000-0000-4000-8000-000000000002';
export function syntheticConversation(overrides = {}) {
  return { id: 'synthetic-collision', ownerKey: owner, title: 'Synthetic archive', mode: 'native',
    createdAt: 1767225600000, updatedAt: 1767225600000, expiresAt: 4070908800000,
    turns: [{ question: 'Synthetic question', answer: 'Synthetic answer', createdAt: 1767225600000,
      sources: [{ index: 1, title: 'Synthetic source', url: 'https://example.com/source' }], searchSummary: '',
      evidence: { source_count: 1, answer_basis: 'knowledge', knowledge_source_count: 1, timing: { elapsed_ms: 1 }, process: [{ kind: 'status', text: 'Synthetic search' }] } }],
    ...overrides };
}
