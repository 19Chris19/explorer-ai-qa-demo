import test from 'node:test';
import assert from 'node:assert/strict';
import { patchProfile, roles, verifyProfiles } from '../deploy/macos/launchd-profile.mjs';
test('request-serving roles are Interactive; only the monitor is Background', () => {
  const xml = '<?xml version="1.0"?><plist><dict><key>KeepAlive</key><true/><key>ProcessType</key><string>Background</string></dict></plist>';
  for (const [role, type] of Object.entries(roles)) {
    const result = patchProfile(xml, role);
    assert.match(result, new RegExp(`<string>${type}</string>`));
    assert.ok(result.includes('<key>KeepAlive</key><true/>'));
  }
  assert.throws(() => patchProfile(xml, 'unknown'));
  assert.throws(() => patchProfile(xml.replace('</dict>', '<key>ProcessType</key><string>Standard</string></dict>'), 'provider'));
  assert.match(patchProfile(xml.replace('<key>ProcessType</key><string>Background</string>', ''), 'provider'), /Interactive/u);
});
test('verification checks actual launchd spawn type rather than a template', () => {
  assert.equal(Object.values(verifyProfiles(role => `spawn type = ${roles[role].toLowerCase()} (4)`)).every(row => row.matched), true);
  assert.equal(verifyProfiles(() => 'spawn type = background (5)').provider.matched, false);
  assert.equal(verifyProfiles(() => { throw Error(); }).provider.matched, false);
});
