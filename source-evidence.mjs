const ANSWER_BASES = new Set(['knowledge', 'web', 'mixed', 'agent_general', 'provider_fallback']);

export function inspectSourceEvidence(data = {}, requestedWeb = false, fallbackSourceCount = 0) {
  const sourceCount = parseCount(data.source_count ?? data.sourceCount ?? fallbackSourceCount);
  const rawKnowledge = data.knowledge_source_count ?? data.knowledgeSourceCount;
  const rawWeb = data.web_source_count ?? data.webSourceCount;
  const knowledgeCount = rawKnowledge === undefined ? null : parseCount(rawKnowledge);
  const webCount = rawWeb === undefined ? null : parseCount(rawWeb);
  const basis = data.answer_basis ?? data.answerBasis ?? '';
  const intent = data.source_intent ?? data.sourceIntent ?? '';
  const malformed = sourceCount === null
    || (basis && !ANSWER_BASES.has(basis))
    || (intent && intent !== 'web_requested')
    || (rawKnowledge !== undefined && knowledgeCount === null)
    || (rawWeb !== undefined && webCount === null)
    || (knowledgeCount !== null && knowledgeCount > sourceCount)
    || (webCount !== null && webCount > sourceCount)
    || (knowledgeCount !== null && webCount !== null && knowledgeCount + webCount > sourceCount)
    || (basis === 'web' && !(webCount > 0))
    || (basis === 'mixed' && (!(webCount > 0) || !(knowledgeCount > 0)))
    || (basis === 'knowledge' && !(knowledgeCount > 0))
    || (['agent_general', 'provider_fallback'].includes(basis) && sourceCount !== 0)
    || (requestedWeb && intent !== 'web_requested');
  if (malformed) return { kind: 'unverified', verified: false };
  if (intent === 'web_requested') {
    if (webCount === null) return { kind: 'unverified', verified: false };
    return webCount > 0
      ? { kind: 'requested_web_found', count: webCount, verified: true }
      : { kind: 'requested_web_missing', verified: false };
  }
  return webCount > 0
    ? { kind: 'web_present', count: webCount, verified: true }
    : { kind: 'none', verified: false };
}

function parseCount(value) {
  if (Number.isSafeInteger(value) && value >= 0 && value <= 100) return value;
  if (typeof value === 'string' && /^\d{1,3}$/u.test(value)) {
    const parsed = Number(value);
    return parsed <= 100 ? parsed : null;
  }
  return null;
}
