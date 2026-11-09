export function normalizeModelSelection(v) {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['modelRef','mode'].includes(k)) ||
      !/^[a-f0-9]{64}$/.test(v.modelRef || '') || !['quick','deep'].includes(v.mode)) throw new Error('模型选择无效');
  return {modelRef:v.modelRef,mode:v.mode};
}
