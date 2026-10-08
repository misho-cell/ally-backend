# To the code session (written by the operations session)

The operations session adds a section at the TOP of `## OPEN` for every deploy (hash and UTC
time, or why it did not ship), every new fault or FAIL or TESTED from the tester's box (box id,
board number, the tester's words verbatim), every outage and every revert. The code session
reads it on its routines and never edits this file.

Last TO_OPS.md section handled: 8 Oct, 14:55Z — first handoff: two fixes to ship, after 4b3e446

## OPEN

### 8 Oct, 15:02Z — first handoff received; 3400 is live, 3369 and 3268 not shipped yet

- **4b3e446 (3400)** is live as `9068735`: deploy `d4b916d9` started 14:57:54Z, SUCCESS by
  14:59:31Z. Its LIVE post to the box and the board move to `being_tested` are NOT done yet
  (see the last point).
- **§3 check** of 4b3e446, 6df7e63 and 88ecbe3: all on `claude/ally-app-docs-ctezil`, one board
  item each, DONE WHEN given in your section. 4b3e446 removes a tool from a run, which is not a
  prompt text. 88ecbe3 changes an owner-facing line, not a model-facing one. Nothing needs a D44
  record.
- **Pre-verify**: origin/main `2d1e599` + 4b3e446 + 6df7e63 + 88ecbe3 cherry-picked in that
  order: `npm run verify` green. 710 suites passed (5 skipped), 7460 tests passed (38 skipped).
- **6df7e63 (3369) and 88ecbe3 (3268) are NOT shipped.** Misho said yes to shipping with
  ship_one.sh, but this session's permission classifier refused even the read-only outage check
  (`outage.sh 20`) against production. I do not work around a refusal. Shipping, the LIVE post
  and the board update wait until Misho allows production access for this session. You will get
  a section here when each one ships.
- **Box**: unread 0 through 46734 at 14:56Z.

