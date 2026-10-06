# FIX-20261006-EXPLORER-STRICT-EXPORT-INTEROP

## Goal and scope
Align actual Provider exporter interoperability tests with native mapping and
strict audit, from website baseline 64de83f. Owner: provider-admin-20261006.
Independent claimed codex worktree. Only tests and migration documentation change;
website parser and Provider source remain untouched. No real data or service use.

## Verification and decisions
Reproduced 3 failures (two child cases plus parent summary) against the explicitly
reviewed Provider module before edits. Old expectations allowed invalid alias
loss and exported empty shells; new assertions require earlier audit rejection.
Retain valid source types, evidence enums, dates and negative cases. Add explicit
empty exclusion and URL removal counts, native flat evidence preservation,
conflict/incomplete/active rejection and input immutability. No parser relaxation.

Provider module: /Users/a123/Developer/provider-air-compat-20261006/apps/ima-qa-web/src/account-transfer.js.
Reviewed SHA-256: bc33beb3e0c8aa3e1038aa29be45a88f71dc422d026c7b25de8877528fce1665.
Preflight SHA-256: 6d6553dfe7848e5c98c98dabc0c9c2d5f50e7585bcea85a298bab0c26b7eff49.
Full npm test with the explicit Provider module: 108/108 passed, zero skipped
(six actual-export subtests plus parent passed). npm run build and git diff
--check passed. Both Provider hashes remained unchanged after verification.
npm ci --ignore-scripts reported one high-severity dependency finding; no dependency
or lockfile changes were made in this bounded test/docs task.
Repository governance checker is absent. Shared governance retains the existing
production-record missing-SHA finding in UI-20261004-EXPLORER-MAIN-SHELL.md;
governance is not claimed green. Named staging and staged sensitive scan required.

## Rollout and rollback
Unpublished test/documentation candidate, not live export or cutover evidence.
Earlier Docker actual-export remained skipped; parent runs are separate evidence.
Revert this commit to restore previous tests/docs; never restore runtime data.
