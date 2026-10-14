import { checkMaintenance, transitionMaintenance } from '../maintenance-gate.mjs';

try {
  const file = process.env.DEMO_MAINTENANCE_STATE_PATH;
  const [action, generationFlag, generation, operationFlag, operationId, ...rest] = process.argv.slice(2);
  if (!file || rest.length) throw new Error();
  if (action === 'check' && generationFlag === undefined) {
    const result = await checkMaintenance(file);
    console.log(JSON.stringify(result));
    if (!result.drained) process.exitCode = 2;
  } else if (['close', 'open'].includes(action) && generationFlag === '--generation'
      && /^\d+$/u.test(generation || '') && operationFlag === '--operation-id' && operationId) {
    console.log(JSON.stringify(transitionMaintenance(file, action, { generation: Number(generation), operationId })));
  } else throw new Error();
} catch {
  console.error('maintenance_unavailable');
  process.exitCode = 1;
}
