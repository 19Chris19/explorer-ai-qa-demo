# DOC-20261006-EXPLORER-SHELL-SHA-EVIDENCE

## Goal and scope
Correct the main-shell record's missing source traceability without claiming a
deployment or weakening governance. Owner: provider-admin-20261006.
Documentation only; no checker, runtime, original worktree or live changes.

## Evidence and verification
Verified real commit metadata and changed paths: 1952486f86129d2913bcb79c207a27ba87994430
implements the shell and states preview-only rollout; 222c892c4f1a6dd326420e39ef6c9d75d9b15486
normalizes the font notice. Added explicit source SHA fields and Not deployed
statement. Neither SHA is labeled a production deployment.
Shared governance no longer flags main-shell. Its first-failure checker now
reveals another existing missing-SHA record: FEAT-20261004-EXPLORER-HOST-ADAPTER.md.
Overall CI remains one hard finding and four warnings; local checker is absent.
No unchecked historical record or checker rule was changed to make CI green.
Named staged whitespace/sensitive review passed.
No application changes or additional test execution in this documentation commit.

## Rollout and rollback
Documentation candidate only. Revert this commit to remove the added evidence;
no deployment or runtime rollback is involved.
