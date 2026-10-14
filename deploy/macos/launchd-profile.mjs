// Stages a reviewed profile; never installs or reloads LaunchAgents.
import { readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const roles = Object.freeze({ provider: 'Interactive', 'website-4317': 'Interactive', relay: 'Interactive',
  'public-preview': 'Interactive', 'public-tunnel': 'Interactive', monitor: 'Background' });
export function patchProfile(xml, role) {
  if (!roles[role] || !/^<\?xml/u.test(xml) || !xml.includes('<plist')) throw Error('invalid_launchagent');
  const pattern = /(<key>ProcessType<\/key>\s*<string>)[^<]*(<\/string>)/gu;
  const matches = [...xml.matchAll(pattern)];
  if (matches.length > 1) throw Error('ambiguous_process_type');
  return matches.length ? xml.replace(pattern, (_, a, b) => a + roles[role] + b)
    : xml.replace(/\s*<\/dict>\s*<\/plist>\s*$/u, `\n<key>ProcessType</key><string>${roles[role]}</string>\n</dict>\n</plist>\n`);
}
function privateDirectory(dir) {
  if (!isAbsolute(dir) || resolve(dir) !== dir || realpathSync(dir) !== dir) throw Error('private_directory_required');
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) throw Error('private_directory_required');
}
export function stageProfiles(source, output) {
  privateDirectory(source);
  if (!isAbsolute(output) || output === source || output.startsWith(join(homedir(), 'Library/LaunchAgents'))) throw Error('staging_directory_required');
  mkdirSync(output, { mode: 0o700 }); privateDirectory(output);
  for (const role of Object.keys(roles)) {
    const file = join(source, `${role}.plist`), stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw Error('private_plist_required');
    const xml = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8' });
    const target = join(output, `${role}.plist`);
    writeFileSync(target, patchProfile(xml, role), { flag: 'wx', mode: 0o600 });
    execFileSync('/usr/bin/plutil', ['-lint', target], { stdio: 'ignore' });
  }
  return { staged: Object.keys(roles).length, installed: false, restarted: false };
}
export function verifyProfiles(read = role => execFileSync('/bin/launchctl', ['print',
  `gui/${process.getuid()}/local.zhitianxia.migration.${role}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) {
  return Object.fromEntries(Object.entries(roles).map(([role, type]) => {
    let matched = false;
    try { matched = new RegExp(`spawn type = ${type.toLowerCase()}(?:[ (]|$)`, 'u').test(read(role)); } catch {}
    return [role, { expected: type, matched }];
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--verify') {
      const result = verifyProfiles(); console.log(JSON.stringify(result));
      if (Object.values(result).some(row => !row.matched)) process.exitCode = 1;
    } else if (args.length === 4 && args[0] === '--source' && args[2] === '--output') {
      console.log(JSON.stringify(stageProfiles(args[1], args[3])));
    } else throw Error('usage_source_output_or_verify');
  } catch (error) { console.error(/^[a-z_]+$/u.test(error.message) ? error.message : 'launchagent_profile_failed'); process.exitCode = 1; }
}
