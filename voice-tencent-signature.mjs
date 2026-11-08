import { createHmac, randomInt, randomUUID } from 'node:crypto';

// Pure ticket construction for isolated tests; not reachable from a server route.
// A short URL expiry alone does not enforce spend or prevent ticket replay.
export function buildTencentVoiceTicket({ appId, secretId, secretKey, now = Date.now(),
  nonce = randomInt(1, 1000000000), voiceId = randomUUID(), hotwordId = '' }) {
  if (!/^[0-9]{1,20}$/u.test(String(appId)) || typeof secretId !== 'string' || !/^[A-Za-z0-9]{1,100}$/u.test(secretId) ||
      typeof secretKey !== 'string' || !secretKey || !Number.isFinite(now) || !Number.isInteger(nonce) || nonce < 1 || nonce > 999999999 ||
      !/^[A-Za-z0-9-]{1,128}$/u.test(voiceId) || (hotwordId && !/^[A-Za-z0-9-]{1,128}$/u.test(hotwordId))) throw new Error('invalid_voice_config');
  const timestamp = Math.floor(now / 1000), params = { engine_model_type: '16k_zh', expired: timestamp + 60,
    needvad: 1, nonce, secretid: secretId, timestamp, voice_format: 1, voice_id: voiceId };
  if (hotwordId) params.hotword_id = hotwordId;
  const query = Object.entries(params).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${k}=${v}`).join('&');
  const path = `asr.cloud.tencent.com/asr/v2/${appId}?${query}`;
  const signature = createHmac('sha1', secretKey).update(path).digest('base64');
  return { voiceId, socketUrl: `wss://${path}&signature=${encodeURIComponent(signature)}`, expiresAt: (timestamp + 60) * 1000 };
}
