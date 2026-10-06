// Fresh installs must never adopt accounts or queued turns left after container removal.
export async function assertFreshProject(project, execute) {
  if (!/^[a-z0-9][a-z0-9_-]{0,48}$/u.test(project)) throw Error('invalid_compose_project');
  const label = `label=com.docker.compose.project=${project}`;
  for (const args of [['ps', '-aq', '--filter', label],
    ['volume', 'ls', '-q', '--filter', label], ['network', 'ls', '-q', '--filter', label]]) {
    if ((await execute(args, true)).trim()) throw Error('existing_compose_project_protected');
  }
  // An unlabeled resource with Compose's generated name can also be reused.
  for (const [kind, names] of [['volume', [`${project}_provider-state`, `${project}_explorer-state`]],
    ['network', [`${project}_backend`]]]) {
    const existing = (await execute([kind, 'ls', '--format', '{{.Name}}'], true)).trim().split(/\r?\n/u);
    if (existing.some(name => names.includes(name))) throw Error('existing_compose_project_protected');
  }
}
