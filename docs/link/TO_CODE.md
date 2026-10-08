# To the code session (written by the operations session)

The operations session adds a section at the TOP of `## OPEN` for every deploy (hash and UTC
time, or why it did not ship), every new fault or FAIL or TESTED from the tester's box (box id,
board number, the tester's words verbatim), every outage and every revert. The code session
reads it on its routines and never edits this file.

Last TO_OPS.md section handled: 8 Oct, 19:00Z — ship after the queue: 6f89095 (3466); and 7e30c5c is board 3499

## OPEN

### 8 Oct, 18:29Z — 3433 TESTED, 2579 part two PASS 8 of 8; 3433, 3170, 3137 LIVE

- **LIVE**: ae1be86 (3433) as `6c2bed8` 18:11Z · c8485cd (3170) as `12625a8` 18:16Z · 427dab7
  (3137) as `aaa9f1c` 18:24Z. Each verify green, each outage=0. Boards: 3170 and 3137
  `being_tested`.
- **3433 TESTED**, box 47070, board `tested`: „helper 1 typed „აზრზე არ ვარ", helper 2 „ამაში ვერ
  დაგეხმარები", helper 3 „არა, ვერ მოვახერხებ, სხვას ჰკითხოს." -> all three asks state declined
  (16831/16832/16833), each helper got only „მადლობა, პასუხი გაიგზავნა.", no second question."
- **2579 part two PASS 8 of 8**, same message; row stays `to_build` for part one.
- **Notes from 47070, no task, verbatim:**
  > (a) after the decline card no owner was offered another way within ~2 min (0 of 3) — QA-026 asks for it; (b) owner 2's card shows the helper's own words in her first person: „ლალი ცდისელი: ამაში ვერ დაგეხმარები", while the other two are reworded („არ იცის…", „ვერ დაეხმარება…").
- **Your 18:35Z and 19:00Z read.** Now shipping bd4f15c (3302). Then 8e9b6d3 → 7fee557 →
  f9430eb → 51431fc → 5db4ae6 → 7e30c5c (LIVE names 3499, board 3499 `being_tested`) → 6f89095.

### 8 Oct, 18:12Z — 3367 FAIL (questions twice), new 3499; 3367 and 2579 LIVE

- **1274981 (3367) LIVE as `3ed1da8`** 17:54Z, **422bc93 (2579) LIVE as `7b3f6fe`** 18:06Z. Both
  verify green, both outage=0. The fixed ship_one.sh reported both deploys by itself. 2579 left
  `to_build`, as you wrote.
- **3367 FAIL**, box 47065 (18:10Z), board set to `to_build` as the tester set it. Verbatim:
  > - „რა მელოდება?" (conv 45691) and „რა არის ახალი?" (conv 45692): both goals on the server card, each once — good. Both questions are named in the model's reply AND listed again on the second server card („2 კითხვა შენს პასუხს ელოდება…") — each question shown twice, 2 of 2. Per your rule the card should list only the questions the reply did not name. -> 3367 TO_BUILD.
  > - Only-own-goal seat („რა მელოდება?", conv 45693): the server card names its goal, never „ჯერ არაფერი გელოდება" — good. But the model's whole reply is the by-the-way question („სხვათა შორის, … სად მუშაობს…"), the same in 45691/45692 tails.
  > - Small: the reply calls the askers „ნეტაი ტესტ 3367 მკითხველი 1" — it translated their saved name instead of using it.
- **NEW 3499 (Pr2)**, same message, verbatim:
  > NEW 3499 (Pr2): get_invite_link and the invite text come before the owner's yes — convs 45642, 45685 (and 45686 called it too). 3400 only gated invite_contact.
  Your 7e30c5c covers it; I told the tester its LIVE will name 3499. Tell me if 7e30c5c should be
  recorded under 3499 instead of 3400.
- **Plate v371** (47066): 106 open, 74 to build, 32 to test. Off since v370: 3369, 3400.
- **Now shipping** ae1be86 (3433). Queue after it: c8485cd → 427dab7 → 8e9b6d3 → 7fee557 →
  f9430eb → 51431fc → 5db4ae6 → 7e30c5c. After the queue, one line in FOR_FRONTEND.md for
  `questions_waiting` (3367), shipped as its own commit; with 3367 back to build, tell me if it
  should still go.

### 8 Oct, 17:55Z — 3302 FAIL (1 of 2), back to to_build; ship_one fix LIVE as 9f0b6dc

- **3302 FAIL**, box 47061 (17:48Z), board set to `to_build` as the tester set it. Verbatim:
  > Run 1 (180452, conv after 45676): NO deleting tool ran (only search_contact_by_name), yet the reply says „ავთან დაკავშირებული ჩანაწერიდან „ელექტრიკოსი" მოვხსენი." The next conversation still says „ელექტრიკოსად არის შენახული". The new check catches „წავშალე" / „წასაშლელად მოვნიშნე" but not „მოვხსენი" (and likely „ამოვიღე", „გავასუფთავე", „removed"). FAIL.
  Run 2 passed (forget_contact_fact ran, „კი, წაშალე" → gone). c28cf0a stays live: it catches
  part of the old fault and breaks nothing that worked, so no revert.
- **4ea5c40 LIVE as `9f0b6dc`**, pushed 17:39:19Z, deploy SUCCESS, outage OK. That run was the
  old script (it rewrote itself mid-run), so it did not see the deploy. The next ship is the first
  on the fixed script.
- **51431fc (2707)** read; queued last, after f9430eb.
- **Tester**: admin login renewed to 9 Oct 05:37Z; testing goes on.
- **Now shipping** 1274981 (3367).

### 8 Oct, 17:38Z — 3302 LIVE as c28cf0a; 3268 TESTED; shipping your ship_one fix now

- **9a2fadf (3302) LIVE as `c28cf0a`**, pushed 17:25:09Z, deploy SUCCESS. Verify: 7466 passed.
  Outage check after it: OK, 0 errors. LIVE posted (47060), board `being_tested`.
- **3268 TESTED**, box 47059 (17:31Z), verbatim: „„ჰკითხე ნოდარ გამოგონილს, ხვალ სცალია თუ არა." ->
  „ნოდარ გამოგონილისთვის არაფერს ვწერ, ასე მონიშნე. თუ სხვას ვკითხოთ, მითხარი ვის." — written
  together, asks 0, no goal. 3268 stays TESTED." Board set to `tested`.
- **4ea5c40 (ship_one fix)** read: the one line, as described. Shipping it now; then 1274981 →
  422bc93 → ae1be86 → c8485cd → 427dab7 → 8e9b6d3 → 7fee557 → f9430eb. I check the §105 record
  for f9430eb before it ships.
- **Tester**: their admin login ended 17:34Z; testing paused until Tornike logs in again.

### 8 Oct, 17:24Z — 3369 TESTED with two new points; 3268 LIVE as 963dd89

- **88ecbe3 (3268) LIVE as `963dd89`**, pushed 17:08:10Z, deploy SUCCESS. Verify: 7460 passed.
  Outage check after it: OK, 0 errors. LIVE posted (47028), board `being_tested`.
- **3369 TESTED**, box 47027 (17:15Z), 3 of 3, board set to `tested`. Two new points from the
  same message, verbatim:
  > - Small: in run 3 („…ლევან ტესტელთან") the cut name lost its final „ი" („ტესტელ"), so it is a stem, not the saved name.
  > - For 3400 (one sighting, 1 of 3, no new task): run 3 called get_invite_link and wrote „შეგიძლია გაუგზავნო ეს ტექსტი:" with the invite text, before the owner said yes to inviting. Should get_invite_link sit behind the same yes as invite_contact? It also wrote „რადგან მასთან უფრო რბილ გზას ეძებ" — the owner never said that.
- **Now shipping** 9a2fadf (3302).

### 8 Oct, 17:10Z — 3400 TESTED; 3369 LIVE as c7b00a5; shipping resumed

- **3400 TESTED** by the tester, box 46896 (16:11Z), verbatim: „First run: zero invite_contact
  calls (tool log), 2 of 2. … After the owner taps that button: invite_contact ok and „…მოსაწვევი
  მზადაა. გაზიარების ღილაკით…", 2 of 2. -> 3400 TESTED." Board reads `tested`. I set it back to
  `being_tested` at 16:50Z by mistake and restored it at 16:53Z; the tester has been told (47026).
- **6df7e63 (3369) LIVE as `c7b00a5`**, pushed 16:58:45Z, deploy SUCCESS. Verify: 7460 passed,
  38 skipped. Outage check after it: OK, 0 errors. LIVE posted (47026), board `being_tested`.
- **Now shipping** 88ecbe3 (3268), then 9a2fadf → 1274981 → 422bc93 → ae1be86 → c8485cd →
  427dab7 → 8e9b6d3 → 7fee557, one at a time. All ten sections up to 18:20Z (7fee557) are read.
- **Fault in ship_one.sh, for you**: it waits for `git rev-parse --short HEAD` in the
  `logs.sh deployments` line. This repo's short hash has 8 characters (`c7b00a55`) and the deploy
  list shows 7 (`c7b00a5`), so the script never sees its own deploy and ends „DEPLOY NOT SEEN"
  (exit 6) after 13 minutes, without running the outage check. Proposed fix:
  `head=$(git rev-parse --short=7 HEAD)`. Until then I watch the deploy and run the outage check
  myself.
- **Tester**: their admin login ends 17:34Z; they pause testing until Tornike logs in again (46993).

### 8 Oct, 15:55Z — 422bc93 (2579) received, verified, queued sixth

- **§3 check**: on `claude/ally-app-docs-ctezil`, one board item. Server-side filters only
  (`personFlip.ts`, `askChoices.ts`). No prompt or tool text changes, so no D44 record is needed.
- **Pre-verify**: origin/main `2d1e599` + the six handed commits in order (4b3e446, 6df7e63,
  88ecbe3, 9a2fadf, 1274981, 422bc93): `npm run verify` green. 713 suites passed (5 skipped),
  7484 tests passed (38 skipped).
- **Order**: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93. All still wait on Misho's access
  setting. 2579 stays `to_build` after its LIVE, as you wrote.
- **Box 46861**: no fault. The 1850 snooze is not testable today; the tester sets up a 5-question
  fixture before tomorrow's 15:00Z card.

### 8 Oct, 15:36Z — box 46795: 1850 (617dcb8) the asker's line at the card hour PASS 1 of 1; stays being_tested

Tester, verbatim: „Asker 178580, conv 42484, at 15:00:31Z: „Netai Test Helper Card8: კითხვა მიუვიდა,
პასუხს ველოდები". -> the DONE WHEN of 617dcb8 is met, 1 of 1." and „1850 stays BEING_TESTED: the
whole DONE WHEN (5 questions in a day -> 2 at once + 3 in one card, yes/no/later each, and the
card's one snooze bringing it back ~2 h later) is not covered by this look. … the snooze is still
untested." No board change is needed. 46828: the tester is still waiting for the LIVE of 3400, 3369 and 3268.

### 8 Oct, 15:30Z — 1274981 (3367) received, verified, queued fifth

- **§3 check**: on `claude/ally-app-docs-ctezil`, one board item. No prompt or tool-description
  text changes: `mcp/handlers.ts` adds the data field `waiting_for`. No D44 record needed.
- **Pre-verify**: origin/main `2d1e599` + 4b3e446 + 6df7e63 + 88ecbe3 + 9a2fadf + 1274981:
  `npm run verify` green. 712 suites passed (5 skipped), 7477 tests passed (38 skipped).
- **Order**: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981. All still wait on Misho's access setting.
- **Frontend line**: noted. One line goes in docs/FOR_FRONTEND.md after 1274981 is live.

### 8 Oct, 15:22Z — box 46762: one broken line under RO-014 (task 2579), the rest PASS

From the tester's 46762 (MASTER TEST RUN chat #5 close, 15:20Z, build 1ec9bd4), verbatim:

> - RO-014 PASS: 8 of 8 asks reworded (2 at once, 6 at the card), none in the owner's own words. One line broken: "იცნობს თუ არა კარგ ბუღალტერს." (third person, a full stop) — line added to task 2579, with a gym button "ამ სპორტდარბაზში დავდივარ" that names no gym.

Same message, PASS: LM-002 (held asks out at 15:00–15:02Z, 2→2 and 3→3), LM-004, LM-006 Q3, RO-014
(apart from the line above). LM-003 is set up; its reads are at 17:25Z and 18:10Z.
46763 (NEW TESTER CHAT #9, 15:15Z): still waiting for the LIVE of 3400, 3369 and 3268.
Shipping still waits on Misho's access setting; nothing marked or posted in the box yet.

### 8 Oct, 15:14Z — 9a2fadf (3302) received, verified, queued fourth

- **§3 check**: on `claude/ally-app-docs-ctezil`, one board item. The server replaces the reply
  after the run; no prompt or tool text changes, so it needs no D44 record.
- **Pre-verify**: origin/main `2d1e599` + 4b3e446 + 6df7e63 + 88ecbe3 + 9a2fadf: `npm run verify`
  green. 711 suites passed (5 skipped), 7466 tests passed (38 skipped).
- **Ship order**: 6df7e63 (3369) → 88ecbe3 (3268) → 9a2fadf (3302), one at a time. All of them
  still wait on Misho's access setting for this session (see the section below).
- **Box**: 46735 from the tester (14:57Z) only says they wait for the LIVE of 3400 and 6df7e63.
  It reports no fault and no result. It is not marked yet.

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

