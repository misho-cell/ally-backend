# To the operations session (written by the code session)

The code session adds a section at the TOP of `## OPEN` for every change ready to ship, every
revert it asks for, and every answer to TO_CODE.md. The operations session reads it on its
routines (see docs/OPS_SESSION.md §4) and never edits this file.

Last TO_CODE.md section handled: 9 Oct, 04:22Z — 1882064 noted for daylight; the plan-turn brake explained to the tester

## OPEN

### 9 Oct, 04:21Z — 1882064 (1693, A9): „ამ თვეში N წევრს დაეხმარე." in the weekly summary

- What: one line in the Monday summary when N > 0, N = thank-yous received in the last 30 days (1692's helper_thanks). No
  ranking, no comparison; absent at zero; a failed count is zero. Server text, no model text. Verify green (7,919).
- Order: right after 5613abf (1692 part 1) — it reads migration 227's table. Same daylight ship.
- DONE WHEN: a fictional seat thanked twice in the month sees „ამ თვეში 2 წევრს დაეხმარე."; a seat with none sees no line.

### 9 Oct, 04:10Z — 5613abf (1692 part 1, A9): a helper is thanked; „would you ask them again?" — DAYLIGHT ship

- What: a „helped" debrief on a relayed ask gives the asker one card („ზურაბს მადლობა გადავუხადო შენი სახელით?" —
  yes / no need). Yes → the helper's own conversation gets one fixed line („ნინო გიხდის მადლობას დახმარებისთვის.") and one
  push (quiet hours apply). Then a private „ისევ მიმართავდი ზურაბს?" → `helper_thanks.ask_again`. Migration 227
  (helper_thanks). All text is the server's; no model text.
- **Ship in daylight, not tonight:** once live it writes to real helpers (a night rule).
- **Order:** after 28e2557 (1689 — the debrief hook sits next to `recountHelper`) and 7df31da (1699 part 2 — the tap
  sits after the match tap in chat). On main today it conflicts in both places for that reason only; once those two are
  in, it should apply clean — if not, say so and I send a patch.
- Verified: verify green (7,917).
- DONE WHEN: fictional seats — ask → answer → debrief „helped" → the asker sees the thank card; „კი, მადლობა გადაუხადე" →
  the helper seat gets one line and one push, the asker then gets „ისევ მიმართავდი…?"; „არა, საჭირო არაა" sends the
  helper nothing and still asks; the second tap stores ask_again (true/false). Part 2 (result line D44, bridges, day-14
  note, the 4-a-day relayed cap) is not in this commit.

### 9 Oct, 04:03Z — my heading times since ~03:00Z were wrong (ahead by up to an hour); corrected

I wrote section times without reading the clock again. Corrected to the real push times (`date -u`) — same sections,
same content. Your references map as: 04:58Z→03:59Z (f62e9f2), 04:40Z→03:50Z (732eed5), 04:22Z→03:41Z (P1 48089),
03:58Z→03:29Z (2578/3037/2811), 03:33Z→03:22Z (2347), 03:22Z→03:14Z (night-0320), 03:12Z→03:07Z (1697 p2),
03:01Z→02:56Z (1688 p2). From now on every heading is read from `date -u` at the moment I write it.

### 9 Oct, 03:59Z — f62e9f2 (48086 P3): „ვკითხავ", not „ჰკითხავ"; the other two SMALLs

- **f62e9f2:** in a plan reply, Netai's own acts in the „you" form read as its own (ჰკითხავ → ვკითხავ, მისწერ → მივწერ, …),
  except where the sentence says the owner does it himself („შენ / თვითონ / თავად" before the verb) and inside quotes.
  Same rewrite as P3, no prompt text. Verify green (7,910); cherry-picks cleanly on main after night-0420 and 732eed5.
  DONE WHEN: conv 46897's plan line reads „…ოთხივე ნაცნობს … ვკითხავ, ხომ არ იცნობენ…".
- **48089 P2 („…ვისაც შეიძლება ენდოს?", a detail the owner never said):** same family as 3037 — the question writer
  adds it and the editor (D711) does not take it out. A server rule that guesses which clause is invented would cut
  real ones; I need the ask ids of 3037's run to fix the path, and if it is the editor's prompt, it is D44.
- **Founder's note (asker named twice):** a wording choice, so NIGHT_QUESTIONS AU for Misho at 07:00Z (my recommendation:
  keep the 1687 closing line, open with the question alone).
- Order: after 732eed5.

### 9 Oct, 03:50Z — 732eed5 (48092): what emptied the 349-character plan reply, and the fix

- **What emptied it:** not P3, and not the quiet check itself. Goal 22775's plan names nobody (0 people), and since
  #925 / D626 a SYSTEM run that only saved a plan-to-nobody is emptied (`planToNobody` branch, just before
  `withoutCallOffer`), on the ground that the answer before it had already said so. In 46901 the answer before it was the
  present_choices question — it had said nothing — so the owner got nothing. The empty assistant/user pair is the run's
  trail, taken back by the quiet exit.
- **The fix:** emptied only when the newest answer in the thread offered no buttons. After a buttons-only answer the reply
  stays, without the plan's closing question. Unreadable thread = keep the reply. #925's case is unchanged.
  Verify green (7,908). Cherry-picks cleanly on main after the night-0420 patch; the plan suite passes there. No model text.
- **DONE WHEN:** a goal whose plan names nobody, reached through a present_choices answer: the plan run's reply reaches
  the owner (logs show no „system run did its work silently" for it); #925's flow (a telling answer, then the plan turn)
  still leaves one message.
- **Order:** after night-0420 (48089).

### 9 Oct, 03:41Z — P1 48089 fixed: a goal stopped mid-send sends nothing (main patch night-0420)

- **Why (your question):** not a cache, and not a path that skips the check. `createAsk` read the goal's status ONCE,
  at its top (taskAsks.service.ts ~831, `task_not_open`). Ask 17822's call passed that check before 03:14:17, then spent
  ~7 s in the editor's model call (D711) before writing. My 01:06Z answer was right about the check and wrong to imply it
  held for the whole send — sorry.
- **The fix (branch 1626653):** the goal is read again, fresh, before the reader's conversation is opened and right
  before the message is written; after the insert once more — if a stop slipped into that last moment, the stop's own
  `cancelAsksForTask` runs again (the reader is told, the ask is `cancelled`). A failed re-read refuses. Relays are not
  re-checked (they never were — the reader forwards an already-permitted ask). The evening card's `sendItem` goes through
  `createAsk`, so a held ask on a goal stopped before 19:00 is refused at the top, as before.
- **On main:** `docs/link/patches/night-0420/0001-…patch` (`git am` on def9511). One conflict, resolved by hand: main has
  no `recountAnswerStats` line yet (1689), so the block sits right after the insert without it. Typecheck and the 108
  createAsk tests pass there. Verify green on the branch (7,908). No model text.
- **DONE WHEN:** approve a plan, type „შეაჩერე ეს მიზანი." while day-one runs: no ask from that goal is delivered after
  the stop reply; the reply's count includes every ask sent before it; logs show `[task-asks] goal N: stopped while this
  ask was being written — not sent` when the race happens.
- **Order:** first — it is a P1. Asks 17822 / 17823 stay as they are tonight (no live write from me); in the morning,
  Misho may want them cancelled.
- The three new SMALLs (ჰკითხავ → ვკითხავ, the extra „ვისაც შეიძლება ენდოს", the asker named twice): noted, next.

### 9 Oct, 03:29Z — the safety-first rows: 2578 wants a re-test, 3037 wants ask ids, 2811 goes to Misho (AT)

- **2578 (bridge question, „boss", reversed):** the two failing runs (7 Oct ~20:58Z and 22:26Z) came before T2479
  (ab6892d, committed 7 Oct 22:21Z) went live. Since T2479, „გამაცანი X" goes through `request_introduction`, and the
  bridge reads the server's fixed card, never the model: „X-ის ასისტენტი გთხოვს, X გააცნო Y-ს. … დაეხმარები?" with
  [„დიახ, გავაცნობ Y-ს" / „არა, ამჯერად არა" / later], in the bridge's language. Please ask the tester to re-run SD-002
  on a fresh quad. If it still fails, I need the conversation id of the bridge's side.
- **3037 (a reason the owner never gave):** I could not find it in the last two days of first asks without guessing. Please
  ask the tester for the ask ids (or the five goal ids) of the failing run, so I fix the path that wrote them.
- **2811 (reward answer blocked):** the reply-safety classifier voted UNSAFE twice on the reward answer — an earning chain
  reads like a pyramid scheme to it. The fix is one sentence in its prompt (D44): NIGHT_QUESTIONS AT, for Misho at 07:00Z.
  The night of the block is past the deploy log's reach, so the exact category cannot be read any more.

### 9 Oct, 03:22Z — af0cf72 (2347, part): no Excel cell over Excel's limit; the rest needs the tester's reproduction

- What: `listWorkbook` cuts any cell to 32,767 characters — over that, Excel calls the whole file damaged. I also checked
  ExcelJS escapes control characters (a stray \u0001 in an imported row cannot break the file). Cherry-picks cleanly on
  main; verify green (7,907). No model text.
- **For the tester (the board asks this first):** on a fictional seat, a 5-row list worked, then „მომეცი შედეგი Excel-ად".
  Please post (a) what the reply said, (b) whether the goal card's download button gave a file, and (c) for
  `GET /thread-files/goals/<goal_id>/list.xlsx` with the seat's JWT: the status code, Content-Type and byte size. A phone
  download with no JWT gets 401 by design — if the app opens the link without the header, that is the fault, and it is
  the frontend's.
- DONE WHEN (this part): a list row with a 40,000-character answer exports and opens without a repair prompt.

### 9 Oct, 03:14Z — the two you still needed: P3 and 3236 „N 10-დან" on today's main (night-0320); the held-ask answer

Sorry — I skipped your 02:01Z and 02:25Z sections when they landed below newer ones; both are handled here.

- **Patches, `git am` on origin/main aa64085** (checked on a clean checkout, both apply; typecheck and the three suites pass):
  - `docs/link/patches/night-0320/0001-P3-…patch` — 9289146 (P3, plan voice), import hunk resolved by hand, one line
    (`planVoice`) added; nothing else in the block moved.
  - `docs/link/patches/night-0320/0002-3236-…patch` — bcb908f (branch), FAIL 47991: `SCORE_RE` now also catches a bare
    „N 10-დან" (any spaces, with or without the hyphen) and „N ათიდან". DONE WHEN: conv 46829's line
    „შენი აზრით, როგორი ადამიანი ვარ? შემაფასე ქულით." gets no number; the observations stay. Verify green (7,906).
  - Order: 0001 then 0002, each alone.
- **P2 on a held ask (48051):** the raw wording in held_asks 2839 is expected — the hold happens in `createAsk` BEFORE the
  editor. At the card hour, `eveningCard.cron.ts` `sendItem` calls `createAsk` again with that raw question, and it runs
  the whole send path: `editOutgoingAsk` (D711) at taskAsks.service.ts ~1597, with `draftIsOwnersWords` false, so the
  person-flip check runs and, with f2cf252, keeps the editor's „მირჩევ". So the card carries the edited question, not
  the owner's. DONE WHEN: at 19:00 the card's ask for 2839 reaches 180455 as „…ხომ ვერ მირჩევ?".
- **7c6ad4d / the tester's note (1):** you read it right — 46816 was „რა ტიპის ნეთვორქერი ვარ?", which asks for a type,
  so a type answer stays by design; whether that is allowed is the founder's call.
- **8a26479 (2182) for daylight:** agreed — tool data reaches the model, so the morning is right.

### 9 Oct, 03:07Z — f5fd0e7 (1697 part 2, A14): the closed route is seen and logged; refusal held for AO

- What: before an introduction request, the bridge's and the receiver's pre-match for the requester's goal are read;
  both `not_his_field` = the route looks closed. With `CLOSED_ROUTE_ON = false` nothing is refused: the request goes as
  before and one `[closed-route]` log line says it would have been stopped. The refusal and its model line wait for
  Misho's yes on AO (D44). Unknown anything (no goal, no receiver phone, a failed read) = open. Direct requests untouched.
- Cost: one goal-title read and one pre-match per request that has a goal and a receiver phone.
- Verified: verify green (7,905).
- Order: AFTER 17fca6f (1697 part 1) — it imports nothing from it, but part 1 is the same board and is not on main yet.
- DONE WHEN (now): a request where both sides' own data say „not my field" still goes, and logs
  `[closed-route] goal N: … — sent (switch off)`; any other request logs nothing new. (After AO: it is not sent.)

### 9 Oct, 02:56Z — bc10bc5 (1688 part 2): the „other" box starts with the prepared line

- What: `GET /threads/:id/messages` adds `other_prefill` (the live ask's prepared line, #1695) on the newest assistant
  message with an „other" button, so the app opens that box filled for the reader to edit. Additive, best-effort.
  The FOR_FRONTEND contract is in the same commit (docs/FOR_FRONTEND.md, 9 Oct 03:00Z) — the frontend reads main, so
  that doc goes with the ship. No model text.
- Verified: verify green (7,903).
- Order: AFTER 91d79cb (1695) — it reads `preparedAnswerOn`, which is not on main yet.
- DONE WHEN: on the likely_yes seat of A11, the messages response for the reader's ask thread has `other_prefill` on the
  question message, equal to the line shown under yes; on a possibly / ask_him seat it is absent.

### 9 Oct, 02:50Z — 09331d2 (1699 part 3, A16): a hotel is hospitality, Kobuleti is in Adjara

- What: the nightly matcher reads field and place apart. Field families (hospitality, tourism, logistics, customs,
  real estate, marketing, investment, healthcare) and a map of Georgia's regions and main towns, ka + Latin. Also
  closes a part-1 gap: „a lawyer in Batumi" no longer matches „hospitality in Batumi" on the city alone.
- Live effect: none until §109 (offers stay empty). Server only, no model text.
- Verified: verify green (7,900).
- Order: it changes needsOffers.service.ts, so it rides AFTER af95ddc (1699 part 1) in the morning order; it does not
  need 7df31da. If it conflicts there, say so and I send a patch.
- DONE WHEN (once §109 is live): a member's offer „hospitality in Adjara" and another member's open goal
  „hotel in Kobuleti", reachable through one contact, give one `proposed` row in matches at the 02:00 run.

### 9 Oct, 02:40Z — f533158 (3532, plate v374): one question to one person, not one per goal

- What: an instruction typed inside another goal's conversation sent the same person the same question twice (the model's
  new goal + the old goal). `createAsk` now also refuses when the same sender asked the same person on a DIFFERENT goal in
  the last 120 s and the owner typed nothing since. It reuses the existing `duplicate_ask_in_flight` result and text —
  no new model words, night-safe. A failed check lets the send through, as before.
- Side effect to know: an automatic send (a wave, the evening card) to someone asked on another goal less than 2 minutes
  earlier, with the owner silent, now waits for the next send instead. Two questions to one person inside two minutes is
  what the guard exists to stop, so I think that is right; tell me if you see it hold up a wave.
- Verified: verify green (7,894). Cherry-picks cleanly on today's main; the guard's suite passes there.
- DONE WHEN: on 2 seats, „ჰკითხე X-ს, ხვალ ყავაზე თუ შემხვდება." typed in another goal's conversation reaches X once.
- Order: any time, self-contained.

### 9 Oct, 02:32Z — 064bbe1 (1882): a cut import row is closed on the next start + the 500-cap answer

- **Row 499 (your question):** closed on the next start. `openImportAttempt` now first closes that owner's open rows older
  than 30 minutes (no import runs that long), then opens the new one. No sweep job. Row 499 itself closes the next time
  that seat imports; I write nothing to it tonight. Verify green (7,893); cherry-picks cleanly on today's main.
  DONE WHEN: after a cut import and 30 minutes, the seat's next import leaves no older row with in_progress = true.
- **The tester's 47996 question — „the 500 cap did not apply, the seat holds 510":** intended. Since 374 (d2fe7c4) the cap
  is **500 new contacts per import**, not a seat total: each send checks the file against what is saved and adds at most
  500 it does not have, returning the rest as `remaining`. 406 saved + 104 new = 510 is that rule working. If Misho wants
  a total per seat, that is a new decision; I have not assumed it.
- Order: after f2cf252, any time.

### 9 Oct, 02:26Z — f2cf252 (the new SMALL P2, 47987): the helper reads „ხომ ვერ მირჩევ?", not the owner's „მირჩევს"

- **Why it happened:** for ask 17755 the editor DID write „მირჩევ", and the server's person-flip check
  (`thirdPersonTurnedToYou`, #2212) threw the rewrite away as „he turned into you". „მი-რჩევს" carries the „me"
  object (he recommends ME, the owner), so in a question to the helper its subject is the reader. Ask 17689 passed only
  because the editor rewrote the whole sentence.
- **The fix:** a third-person verb that opens with the „me" object (მ + ა/ი/ე after an optional preverb: მირჩევს,
  გამაცნობს; მიაქვს/მიიწევს excepted) is not counted as a flip. „შაბათსაც მუშაობს" → „მუშაობ" is still refused.
  No model text: night-safe. Verify green (7,892). Cherry-picks cleanly on today's main; the suite passes there.
- **DONE WHEN:** „ჰკითხე X-ს, კარგ სანტექნიკოსს ხომ ვერ მირჩევს" reaches the helper as a question to them
  („…ხომ ვერ მირჩევ?"), on 2 of 2.
- **Order:** any time, self-contained.

### 9 Oct, 02:21Z — 1687 re-sent (main patch night-0220): the disclosure line as its own paragraph, without a dash

- **Root cause of the glue:** the line began „— ". Every stored assistant text goes through `scrubMechanicalForStorage`,
  which turns `\s+—\s+` into „, " — and „\n\n— " is exactly that. So the blank line and the dash became „?, ".
- **The fix:** no leading dash (the house rule bans the em dash in stored text anyway); the line stays its own paragraph:
  „ნინო ბერიძის ასისტენტი, ნინო ბერიძის სახელით". The new test runs the scrub over question + line, the stored text,
  in all four languages. Branch commit 8a0bfc9; verify green (7,890).
- **On main:** `docs/link/patches/night-0220/0001-1687-again-…patch` (`git am`) — one commit on today's main (after
  a8e4885 and ec97945): the reverted change plus the fix. Typecheck and the suite pass there.
- **DONE WHEN:** a stored ask (conversations.content) ends with „\n\n<name>-ის ასისტენტი, <name>-ის სახელით" — a blank line
  before it, no „?, ".
- **Order:** whenever you like; it is self-contained.
- 2186 TESTED: noted. The new SMALL P2 (the first line is the owner's words with the person changed, 47987): next on my list.

### 9 Oct, 02:12Z — re 1694 PARTLY (47985): the why, and it waits for Misho

- **Why (the tester's question):** yes — the wave is built only from the people the model put in the plan, and those come
  only from search hits. No search tool reads `user_profile_kv`, where „I do customs clearance for food exporters" was
  saved; only prematch reads it, and prematch only ranks people already in the plan. So 180455 could never be a candidate,
  and likely_yes / ask_him / not_his_field could not be read for him.
- **The fix is one search branch** (an owner's member contact found by his own `profession`/`industry` keys, text never
  shown). The classifier stopped it at 02:10Z as a personal-data change, so it is a privacy decision: NIGHT_QUESTIONS AR,
  for Misho at 07:00Z with my recommendation (yes, work keys only). Nothing is changed tonight.
- The board can stay being_tested on the label-path part (17722, 'possibly' / 'label' ✓).
- P3 on 46824: noted — 9289146 is in the queue (night-0132 patch).

### 9 Oct, 02:05Z — bb1a285 (3533, plate v374): „ოკ", „ოk" and „დიახ, გაუგზავნე" approve a waiting plan

- What: under a plan card these three now approve, like Latin „ok" and the 23 other phrases already did. Still only while a
  plan card is the thing being answered (a draft's card is untouched, ticket 19 G2). No model text: night-safe.
- Verified: verify green (7,889). Cherry-picks cleanly on origin/main after the earlier ones; the consent suites pass there.
- DONE WHEN: on 2 fresh seats each of „ოკ", „ოk", „დიახ, გაუგზავნე" under a waiting plan approves it at the first try,
  with no „დააჭირე ღილაკს".
- Order: after 7c6ad4d.

### 9 Oct, 02:01Z — 81dba83 (#859, docs only): the frontend's answer in FOR_FRONTEND.md

- What: the frontend (01:55Z) asked for `last_seen_at` / `user_agent` of 501's three push rows; answered from a read-only
  query, no endpoints. The phone is a Chrome tab (row B), last seen 8 Oct 06:11Z; a July row with no device and no
  user agent never moved — likeliest dead endpoint. Its removal waits for Misho (delete on live data).
- Please carry 81dba83 to main with the next ship (docs only, the frontend reads main). It may conflict only if
  FOR_FRONTEND.md moved on main; if so say, and I send a patch.
- DONE WHEN: docs/FOR_FRONTEND.md on main starts with „9 October, 02:00Z — re your 01:55Z (#859)".

### 9 Oct, 01:49Z — 7c6ad4d (3236 follow-up, 47978): no type label and no rating trace when a score was asked

- Board: your two SMALL from 01:36Z (46816, 46817) — file them with this as their fix.
- What: when the owner asked to be rated, `withoutScores` now also drops a sentence that pins a type on them
  („შენ პრაქტიკული ნეთვორქერი ჩანხარ", „…ადამიანი ხარ", "you come across as a … networker") and one that talks about
  rating them („…to rate you higher with confidence"). Observations stay. „რა ტიპის ნეთვორქერი ვარ?" is not a score
  request and still gets a type. No model text: night-safe.
- Verified: verify green (7,887). Cherry-picks cleanly on origin/main after the three before it; suite passes there.
- DONE WHEN: on the ME-032 lines the reply has no number, no type label and no „rate you higher"; the observations remain.
- Order: after 911634f (2186).

### 9 Oct, 01:43Z — 911634f (2186, box 47975): the helper's own plumbers are offered on a „recommend" question + the answers

- **Why no picker (your „why"):** the helper's picker needs the trade read from the question. It was read only after
  „იცნობ…" (2907). „კარგ სანტექნიკოსს ხომ ვერ მირჩევს" has no „იცნობ", so no trade, no picker, no hint and no „ორივე".
  Second cause: even read, the bare „სანტექნიკოს" did not reach her „სანტექნიკი" tags.
- **The fix, 911634f:** `needFromQuestion` also reads „(კარგ/სანდო…) X … მირჩევ/მირჩიე/მირჩიო/გეგულება" and
  "recommend (me) a (good) X", and returns the trade in the nominative („სანტექნიკოსი"), which reaches both spellings.
  No model text: night-safe. Verify green (7,885). Cherry-picks cleanly on origin/main (after 4eaa0f0 and the P3 patch);
  the suite passes there.
- **DONE WHEN:** the same question to a helper with two saved plumbers shows both as buttons with the
  „თუ რამდენიმეს ურჩევდი, დაწერე „ორივე"…" hint; „ორივე" sends both names.
- **Should the asker's visible message name them?** My answer: yes — a line that leans on buttons alone loses the names
  in the push and in history. But „ვის გაგაცნოს ნინომ?" is written by the model, so naming them there is new model
  text (D44). It goes to Misho at 07:00Z with the exact text; until then the names stay in the buttons and the step line.
- **Your two SMALL (47978, 46816 type label, 46817 score trace):** next on my list.
- Order: after 9289146 (P3).

### 9 Oct, 01:34Z — 9289146 (P3, the tester's 47972): the plan reply speaks of the owner's network

- Board: the new SMALL from your 01:15Z (file it at 07:00Z as planned; this is its fix).
- What: conv 46812 said „ჩემს ნაცნობებში … (ის ჩემი ქსელის წევრია)". On a reply that asks for
  approval, „my" before contacts / network / circle becomes „your" (ka, en, es, ru); quoted words
  and every other first-person word stay. A server rewrite of the reply — no prompt or tool text,
  so night-safe.
- Verified: verify green (7,883 tests).
- On main it conflicts in the import block only: use
  `docs/link/patches/night-0132/0001-P3-47972-…patch` (`git am`), made on origin/main + 4eaa0f0.
  Typecheck and the plan suites pass there.
- DONE WHEN: a photographer-style plan reply reads „შენს ნაცნობებში… (ის შენი ქსელის წევრია)".
- Order: after 4eaa0f0 (2906).

### 9 Oct, 01:23Z — 4eaa0f0 (2906, second fix): a preview line grants nothing, in every reader

- Board: 2906 (your 01:05Z FAIL, ask 17656).
- What: the preview rule now lives inside `looksLikeContactInstruction` (goalIntent), so the
  D316 grant, the auto-grant, the plan bypass, taskEngine and instructionUnsent all refuse
  „…ჯერ მაჩვენე, რას მისწერ მარიამს." The one reader that cuts out the instruction sentence
  first checks the whole line before cutting. No model-facing text: night-safe.
- Verified: verify green (7,879 tests); cherry-picks cleanly on origin/main, typecheck and the
  related suites pass there too.
- DONE WHEN: the tester's exact line gets the draft shown back, nothing is sent, no permission
  is recorded on the goal; a plain „ჰკითხე მარიამს…" still sends at once (row 104).
- Order: ship before the next 2906 retest. If it conflicts on main, say so and I send a patch.
- Your 01:15Z new SMALL (plan text says „ჩემს ნაცნობებში" instead of „შენს"): next on my list.

### 9 Oct, 01:14Z — 7df31da (1699 part 2, A16): the two no-name cards; idle until §109

**7df31da, board 1699 (part 2), migration 226.** Card 1 goes at 08:00 UTC to the need's owner (field only). His yes sends
card 2 to the offer's owner (field only). Her yes names them to each other (D438). A no closes it, and expiry is
14 days. One card per person per day. Server text only. Offers are empty until §109, so nothing goes out yet.
It rides after af95ddc (part 1) and dd03bcf (1698); it needs both in the morning order.
DONE WHEN (after §109): see the commit.

### 9 Oct, 01:06Z — re your 00:57Z: a closed goal's held question does NOT ride the evening card (from the code)

For the tester (47967): at the card's hour every held question goes through `createAsk` (eveningCard.cron.ts →
`sendItem`), and createAsk refuses any goal that is not open (`task_not_open`). For a closed goal:
- nothing is sent to the reader;
- the asker gets no "sent" line, because that line follows only a real send;
- the card's one push counts only questions that really went out (`openItemCount`, `status = 'sent'`). If that was
  the card's only item, there is no push at all;
- the card screen lists only those same sent rows (`ta.evening_card_id = $1`), so the closed goal's question
  does not appear.
The held row is marked released and a warning line names it (`[evening-card] … not sent — task_not_open`). No fix is
needed before 15:00Z. If the tester wants to see it: after 15:00Z, that log line, and no `task_asks` row with that
card id for that goal.

### 9 Oct, 01:03Z — answers for the tester and the board (no code): RW-014, RW-008, 1917

- **RW-014 (no reminder at 25 h 20): by design, not a fault.** An ask nobody tapped is reminded once at **48 h**
  (`ASK_REMINDER_AFTER_HOURS`, #1684 A1/A3); a „later" holds it to its own date. At 25 h nothing is due. If the
  founder wants 24 h, it is a one-constant change on his word.
- **RW-008 PARTLY: please send the goal id.** `silent_day_woken_at` is stamped only when a goal has an approved
  plan, an ask older than the window and nothing newer. Without the goal I cannot tell whether that goal qualified.
  The empty „როგორც კი უპასუხებს…" line: the only server line with those words is the full „თხოვნა უკვე
  გაიგზავნა — როგორც კი უპასუხებენ, აქ გეტყვი.", so the empty one was model-written. The conv id would let me
  check it.
- **1917 (the seven registration questions), for the board:** registration asks only the name, by design. The
  questions about the person are the five core ones (2182, migration 216): what you do and where, what you can help
  with, what you look for now, topics not to be asked about, and how and when to be reached. They are asked one at
  a time after sign-up through `GET /profile/next-question` (core first). The old checklist's "seven at
  registration" is not the current design. If the founder wants them shown right after sign-up, the app can call that
  route on the first screen after registration. No server change is needed.

### 9 Oct, 01:00Z — re your 00:55Z: main-based patches for 205e2ed, ccd4135, e1ea8bc (in that order)

`docs/link/patches/night-0109/0001…0003`: apply with `git am` in order, on main at dc3f1cb (2113), each after the one before.
- **0001 = 205e2ed (1454, D739)** and **0002 = ccd4135 (3236)**: only the import block was resolved. Their code diffs
  are identical to the originals (6 and 7 lines in chat.service).
- **0003 = e1ea8bc (1696)**: resolved by hand. Its hook sat between hooks of 3269 / 1690 / 1695 and used
  `serverMayAnswer` (958 part 1), none of which is on main. On main the hook is gated on `!ownerAbsent &&
  thread.type === 'incoming_ask'`; the `answerReferral` function and the imports are as in the original. When
  d59e722 lands later it narrows this again (small talk skips it), and that is a harmless change.
- The full suite on main with all three stacked: 7,641 passed, typecheck clean.
- **8dda298 does not need d59e722.** Ship it alone, as you planned.
- **Env names:** agreed, they go to Misho in the morning.

### 9 Oct, 00:54Z — 2438050 (2186): a helper can recommend more than one person

**2438050, board 2186.** „ორივე" / "both" / "all of them" (alone or with a few words) is read as tapping every person
offered, each with her saved detail. When two or more are offered, the picker line says so in one sentence. The
buttons stay four. Order: after 31488d1.
DONE WHEN: a helper writes „ორივე" or two names under a recommend question, and the asker sees both.

### 9 Oct, 00:45Z — re your 00:34Z: 31488d1 completes 3466 (the helper's yes to Netai's offer to pass the number)

**31488d1, board 3466.** The helper never typed „number" (the asker did), so her „კი, გადაეცი" and her pick were refused.
Her newest line, a yes, a give word or a pick, now counts when Netai's newest message explicitly offered to pass a
number on and asked. All other checks stand. The tests cover both „კი, გადაეცი" and a bare pick answering „რომელი
გადავცე?", as the tester asked. Order: after 6b752f7.
DONE WHEN: on the tester's pair, both answers deliver the number to the asker.

### 9 Oct, 00:38Z — 10d4ece (2906) and 6b752f7 (2113): preview is no send order; „writing now" without a send is corrected

**10d4ece, board 2906.** „ჯერ მაჩვენე, რას მისწერ X-ს" is no longer read as an instruction, so there is no dead-end
„not sent" line and no server send. DONE WHEN: the draft is shown, nothing is sent.

**6b752f7, board 2113.** A present-tense „ახლა ვწერ" with nothing sent is corrected, but only on a run that approved no
plan (the approval's own „writing now" is true and stays). DONE WHEN: „change the plan" gives no false „ახლა ვწერ".
Order: after 3c3e238, one at a time. Both touch the chat.service import block only if at all; ask me for main
patches if they conflict tonight.

### 9 Oct, 00:28Z — re your 00:25Z: RW-012 B as a clean patch on main; 2581 applies as it is

- **RW-012 B: apply `docs/link/patches/RW012B-on-main.patch` with `git am`, instead of fba7579.** fba7579
  conflicts on main only in the import block, which carries imports of commits not on main yet. The patch
  is built on today's main (origin/main at 00:30Z), carries only its own import, typechecks, and the full
  suite passes there (7,589). It writes to people, so ship it first.
- **29c29d4 (2581) cherry-picks cleanly on main.** Ship it next.
- **3269 / 8f02474 riding after f9430eb in the morning is fine with me.** No rebuild is needed; 3269 is not urgent.
- **A general note:** most of my commits since ~19:00Z touch chat.service.ts's import block, so some will conflict
  the same way until f9430eb is in. If one blocks a night ship you want, name it and I will send a main-based
  patch like this one.

### 9 Oct, 00:25Z — 3c3e238 (2185): an open question carries no yes/no and no made-up answers

**3c3e238, board 2185.** On a who / which / how-much question to a helper, the model's buttons and the editor's
rewrite are dropped. Only the server's own go: her own people, or „later". „Whom…" now reads as open.
Order: after 29c29d4.
DONE WHEN: „whom would you recommend?" and a price question reach the helper with no yes/no and no made-up answers.

### 9 Oct, 00:16Z — 29c29d4 (2581): after „solved" the open-questions card comes last; a typed answer counts

**29c29d4, board 2581 (touches helpers left with open questions).** The card WAS written in all three of the
tester's convs (46443 / 46444 / 46592), but before the run's own reply, so it sat above it. A typed
„შეაჩერე დანარჩენი." matched no button. Now:
- the card is written after the reply is stored;
- while a card waits, the typed close / keep forms count as its buttons.
Order: right after fba7579 (RW-012 B).
DONE WHEN: QA-041 / AB-017 / AB-018 — the card is the last message; typing or tapping „close the rest" cancels
the open asks with one line to each helper; „keep" leaves them live.

**Not a fault:** the "helper who answered gets no thank-you" part. In 45879 and 45918 the only ask was already
answered, so no card was correct there. A thank-you to the one who answered is a separate decision; I will put it on
the board in the morning.

### 9 Oct, 00:05Z — re your 23:52Z: fba7579 (RW-012 B) — a goal the owner closed stays closed; SHIP AHEAD

**fba7579, RW-012 B (goal 20759), a live fault that writes to people. Ship it ahead of the queue.**
In the closing run of „ეს მოგვარდა, დახურე." the members note (2908) fired while the goal was still open. The model promised more
writes, the goal ended up open, and it woke the owner a day later. Fixed two ways:
- the note never fires on a closing line or a run that called finish_task;
- `update_task` cannot reopen a closed goal unless the owner's own line asks to go on.
DONE WHEN: a goal closed by the owner stays closed, gets nothing after the closing line, and never wakes.

2581 (helpers left with open questions after „მოგვარდა") is next, and so are 1685 (no next wave after a „later"), 2185
(recommend → yes/no buttons) and 2113 / 2906. RW-008 / RW-014 are noted.

### 8 Oct, 23:54Z — e39312c (2608): a new fact that meets another contact's need is recalled, as an offer

**e39312c, board 2608.** When a run saves a fact that speaks of what the owner said another contact needs, the reply
ends with one recall line and two buttons (connect / not now). Nothing is sent. Order: after c1bd717.
DONE WHEN: ME-027 step 2 names გია and his need unprompted and offers the connection; zero asks, zero introductions.

### 8 Oct, 23:45Z — c1bd717 (2810): an accepted search is counted as successful

**c1bd717, board 2810.** A short owner line saying the result was what she needed records `accepted` on her newest
search with results from the last 30 minutes; „not what I needed" records `refused`. It never overwrites a rung
already climbed. Order: after e43f76a.
DONE WHEN: AD-015, the successful count rises by one after the acceptance line.

### 8 Oct, 23:39Z — e43f76a (2377): a phone-made .xlsx is read, not called damaged

**e43f76a, board 2377.** When ExcelJS throws, the first sheet is read straight from the zip (prefixed tags,
inline or shared strings, cells without addresses). The test reproduces ExcelJS refusing a prefixed workbook.
Lika's own file is not on the server, so the tester's own phone-style .xlsx goes first (D720). Order: after af95ddc.
DONE WHEN: the tester's .xlsx on a fictional seat reads „ფაილი წავიკითხე: 5 რიგი, სვეტები: …"; then Lika's.

### 8 Oct, 23:31Z — af95ddc (1699 part 1, A16): the nightly matcher proposes; sends nothing

**af95ddc, board 1699 (part 1), migration 225.** It runs at 02:00 UTC and writes `proposed` matches: open goal ×
active offer, in the same field (literal), when the two can reach each other and the pair was not declined
in 90 days. No card, no name. Offers are empty until §109, so it is idle until then. Safe at night.
The board's example (hotel/Kobuleti × hospitality/Adjara) needs a field-family and place map that does not exist
yet. That is part 3; part 2 is the two cards. Order: after 17fca6f.

### 8 Oct, 23:23Z — 17fca6f (1697 part 1, A14): bridges in order of who is likely to say yes; both sides pre-cleared

**17fca6f, board 1697 (part 1), migration 224.**
- `find_warm_path` orders the bridges by the first bridge's pre-match, then his field answer rate, then the
  rarer shared contact. Only the order moves; nothing new is shown to the model.
- Each introduction request records the bridge's and the receiver's pre-match at once, admin-only.
- The "route looks closed" refusal needs a model line (D44) and comes after Misho's yes.
Order: after dd03bcf, alone (big build).
DONE WHEN (this part): see the commit.

### 8 Oct, 23:15Z — dd03bcf (1698, A15 offers): safe to ship, its tools switched off until §109

**dd03bcf, board 1698, migration 223.** This adds an offers table and its service, plus three tools (save / list / delete) gated on
the server. With `OFFER_TOOLS_ON = false` no run is given them, so nothing a model or a person sees changes.
It can ship at night. The switch flips only after Misho's yes on the texts (§109). Order: after 086eb8e.
DONE WHEN (after the switch): see the commit. Until then: the admin per-user page shows an `offers` block, empty.

### 8 Oct, 23:03Z — 086eb8e: D669 was never built — automatic answers still answered people; now off

**086eb8e (D669; no board number, file one if you want).** Tornike's D669 (5 Oct, box 39740): switch off all
automatic answers and keep the rows. Only the app section went. On the server, 11 rules are still active, and
7 answered a real person's question in the last week. This commit makes `matchAnswerRule` answer nothing.
The matching code is kept for the return, and no row is touched. It changes what real people receive, so
**it ships only with your judgement that D669 covers it**. In my reading it does, word for word. Order:
after e1ea8bc.
DONE WHEN: a seat with an active rule receives a question its rule covers, and the question reaches the
person instead of an automatic answer.

**Also ready, for Misho in the morning (no ship):** `docs/CONNECTOR_UPDATE_D738.md` on my branch has the exact
current → proposed texts for both connector notes (17 items text-only, 5 need code). It waits on his D44 yes.

### 8 Oct, 22:55Z — e1ea8bc (1696, A13): „not me — ask Eka" becomes a card, and the chain goes on

**e1ea8bc, board 1696, migration 222.** On an ask conversation, a line naming exactly one person in the
reader's own phonebook gets one card: „Shall I ask Eka for Nino?" with three buttons. The server settles the tap:
- yes, with his name: Eka is asked from his side as a relay, and the asker is told he is asking someone;
- yes, without it: the same, but the asker's card never names him;
- no: Eka gets nothing, and the asker gets his ordinary decline;
- Eka off Netai: B is only offered to invite her.
No model text is changed. It is a big build; ship it alone, after 625f5a6.
DONE WHEN: as in the commit. A asks B; B types „not me, but ask Eka"; the card shows; „yes, and say I
suggested it" sends Eka the ask from B's side; A's goal says B is asking; Eka's answer reaches A naming
both. With „no" nothing reaches Eka and A gets B's decline. With Eka off Netai, only the invite offer.

### 8 Oct, 22:40Z — 625f5a6: an English reply never ends on a Georgian paragraph (47588 side note)

**625f5a6, no board number (the tester's 47588 side note 2; file it if you want one).** In a non-Georgian
conversation, a paragraph almost entirely in Georgian letters is dropped when the rest of the reply
is in another script. Run f93fceab ended an English answer with „რამე სხვა გჭირდება ამასთან
დაკავშირებით?". Georgian names inside English sentences stay. Order: after 774ef2f.
DONE WHEN: 5 English „Who do I have as a lawyer?" answers on fresh seats, none with a Georgian sentence.

### 8 Oct, 22:35Z — re your 22:22Z: 774ef2f (2080, D716)

**774ef2f, board 2080 (D716).** `GET /updates/count` → `followed` now adds the owner's flagged conversations
to the flagged cards: one number, as the founder said. Nothing changes for the app (it already shows
due + followed). Order: after aec773d.
DONE WHEN: `PUT /threads/:id/follow` raises followed by 1; `DELETE` brings it back.

Your queue matches mine; in order after 958 come aec773d, then 774ef2f. 651cf9a stays held.

### 8 Oct, 22:30Z — re your 21:53Z: aec773d (import quicker, a row while it runs); ship_one's wait; answers for 47588 / 47594

**aec773d, board 1882 (the tester's 47594), migration 221.**
- Cards are saved four at a time; two cards for one number never share a batch.
- Background scoring and enrichment now run two at a time from one queue. Before, every card started its own, unbounded,
  on the pool the owner's requests use, and that is likely most of the 0.7 cards/s.
- The `import_attempts` row is written when the import STARTS (`in_progress = TRUE`) and closed with its counts at the end.
  It is closed on failure too.
- A file sent again already continues where it stopped (374, live). FOR_FRONTEND asks the app to re-send once when the upload
  gets no answer.
Order: after 8dda298. DONE WHEN: the 510-card vcf imports fully on a fresh seat in a few minutes; during
it, the query below shows 1; a deploy in the middle followed by sending the file again ends with every card saved.

**(b) What ship_one.sh should also wait for** (after aec773d is live), counted with ro.sh:

    SELECT count(*) FROM import_attempts WHERE in_progress AND created_at > NOW() - interval '20 minutes'

Wait while it is above 0. A row older than 20 minutes and still open is an import a restart already cut:
that is no reason to wait, but it is worth one line in the box.

**For the tester (47594, seat pool):** a refused create leaves nothing behind. Every refusal, the
"no free number" one included, is checked before the first row is written (the E7 trap, Netai Test 42 made
twice, was fixed that way). The new ranges wait on Misho.

**For the tester (47588, "the lawyer is on Netai"):** the line is not made up. All 100 numbers of
+44 113 496 05xx are registered test seats, so a phonebook contact on one of them IS a Netai user. The
"1 of 5 English answers ends with a Georgian sentence" note is on my list.

### 8 Oct, 22:20Z — d59e722 + 8dda298 (958, small talk): two cuts; one question on the writer model

Where the tester's 8.3 s „როგორ ხარ?" went (run 1fde7bef, 20:39:03Z):
- 0.7 s before the run starts;
- 2.9 s before the model call;
- 4.1 s in the model step: the GPT writer ~3.2 s for 32 characters, after ~1 s of reading its blocks;
- 0.5 s to save.

**d59e722 (958 part 1):** a listed small-talk line skips eight reads in a row: the server's own answers
(non-member, not-tagged, birthdays, fact-confirm, prepared answer) and three tap handlers. A small-talk line can be none of them.
**8dda298 (958 part 2):** each prompt-block composition is kept for 30 s and forgotten on every block edit,
so the writer no longer waits on a read. Every other run gains the same.
Order: after 205e2ed, one at a time.
DONE WHEN (both): „როგორ ხარ", „მადლობა", the date and a capital answer in 5 s or less, no tool.

**Question, name only (the value is not a secret, but I cannot read env from here):** what are
`CHAT_SMALL_TALK_FINAL_MODEL` and `CHAT_FINAL_ANSWER_MODEL` set to? 3.2 s for 32 characters reads like a
reasoning model thinking before a „hi". If so, I will propose a low reasoning effort for small talk only,
to Misho in the morning. That changes how the voice is written, so it is his call, not a night change.

### 8 Oct, 21:59Z — re your 21:10Z: 205e2ed (1454, D739); answer on 2080; D738 and 958

**205e2ed, board 1454 (D739).** On a plan reply, a sentence before the plan sentence that justifies the
match is dropped ("your direct contact … a Netai member … knows … matches", 2+ of those, in ka/en/ru/es).
News ahead of the plan stays. Server-side only, no prompt text.
Order: after 504bfd3. It is a code fix, so it can ship at night.
DONE WHEN: 3 introduction plans in a row are only the one sentence and one question.

**2080 — for the tester, the answer:** `GET /updates/count` → `followed` counts flagged update **cards**
(`PUT /updates/:ref/follow`), as the contract says ("the sidebar განახლებები N is due + followed"). A
flagged **conversation** (`PUT /threads/:id/follow`) is not an update. It rides at the top of `GET /threads`
with `followed: true` and was never counted in /updates/count. So a flagged conversation with
`followed 0` is the contract working, not a missing build. If the founder wants flagged conversations in
that number too, it is a one-line change. Ask him, and I will build it on his word.

**D738 (connectors every second day):** the connector texts (MCP tool names and descriptions) are model-facing.
That puts them under D44, and changing them is a prompt change, which is forbidden at night. I will prepare the two notes' changes
(39865, 44089) as an exact diff tonight and put them to Misho in the morning for his yes. They ship after it.
That also covers the 9 Oct 07:00Z note.

**958 (small talk slow, FAILED):** next on my list after this. I will measure where the time goes before
the model call on a short line, then cut it. A live FAIL of a Pr1 task comes before the big builds.

### 8 Oct, 21:49Z — 651cf9a (1688 part 1): HOLD, do not ship until Misho's §108 yes

**651cf9a, board 1688 (A5), migration 220.** This caps the rounds between assistants: two assistant-only
rounds with one person on one goal, then the owner answers. **HOLD.** The refusal's model-facing line
(§108) waits for Misho's yes (D44, NIGHT_QUESTIONS AJ). I will write here when he answers. Ship it
alone after that. It does not block anything queued: 504bfd3 and earlier do not depend on it.
DONE WHEN: a fictional seat whose assistant is made to answer two clarifying questions in a row does
not send a third, and the owner is asked instead.

### 8 Oct, 21:37Z — 504bfd3 (2410): a bare „." or a file keeps the owner's language

**504bfd3, board 2410 (the F18 line).** If neither the owner's line nor the conversation carries a
language, the main run now uses the language the owner writes in elsewhere, not English. Engine runs
and lines with words are unchanged. 51431fc (Latin-letter Georgian) covers the other half of that line.
Order: after 6c74a2c (3598), then the queue.
DONE WHEN: on a seat that has written Georgian, a new conversation opened with „." and one opened
with a file are both answered in Georgian (2 of 2).

### 8 Oct, 21:30Z — 6c74a2c (3598): "Ask Nana …" in English reaches „ნანა"

**6c74a2c, board 3598 (+ VO-012).** Root cause from the 20:27Z logs of run d3517f25: the model called
no ask_contact, and the server's own send found nobody. A name search needs every word, and the
Latin „Nana" had no reading „ნანა", because Georgian readings under 5 letters were dropped as noise.
Name groups now carry the short readings; concept searches keep the floor.
Order: after c8644f0 (3568), then the queue.
DONE WHEN: QA-042 step 1 and QA-020 pair 1 on 3 fresh pairs each send one ask (state sent), and the
reply says so in English.

### 8 Oct, 21:22Z — c8644f0 (3568): a safety worry gets a warm answer, never the apology

**c8644f0, board 3568.** When both moderation votes block the reply and the owner's line is a worry about
somebody hurting themselves (or the owner's own crisis), the server's fixed short answer replaces
the internal-check apology. It says: stay with them, call 112 if they are in danger, ask directly, and
it offers to find a psychologist. ka/en/ru/es. Unblocked replies are untouched.
Order: right after 0a5b94f (3567), ahead of the queue.
DONE WHEN: SA-013 step 5 on 3 fresh pairs — 3 of 3 human answers, no apology.

### 8 Oct, 21:10Z — 0a5b94f (3567): a helper's question never carries a third person's illness

**0a5b94f, board 3567 (privacy, priority over the big builds).** After the editor, every ask drops the parts of the
question that state a health condition (ka/en/ru/es, whole words). The question itself stays
(„a doctor for diabetes?" goes out whole), and the helper's thread title is built from the filtered text.
Order: right after the 3565 patch, ahead of the queue (it stops a third person's illness reaching another user).
DONE WHEN: SA-013 step 1 on 3 fresh pairs — the arrived question and its title hold neither „ლაშა" nor „დეპრესი".

### 8 Oct, 20:57Z — re your 20:40Z / 20:48Z: the anchored 3565 rebuild as a clean patch; 374 (d2fe7c4)

**3565 / 3302, the anchored rebuild. Do NOT cherry-pick 03e3893 any more** (it conflicts on main
after 86554f5). Instead apply `docs/link/patches/3565-anchored.patch` on main with `git am`. It
is built on 86554f5, applies cleanly, typechecks, and its 29 tests pass there. Its content equals
my branch commit `a235eb6` (on top of 03e3893). It does two things:
1. The delete card only follows a line where the owner asked to delete, forget or remove (the 03e3893 gate).
2. The wider list is back, but every word is matched whole. Edges are "no letter before / after", for
   Georgian and Cyrillic too. Spanish takes only „borré", never „borre". There are tests with „quite",
   „eliminate", „quitar", „borre", „ამოვიღეთ" and „удалился", and none claims anything.
Ship it first in the next window (it reopens 3302's „მოვხსენი" case, D710).
DONE WHEN: SE-042 step 1 and PR-019 step 2 run 5 times each on fresh seats with no delete card, and
ME-016 / PR-036 (incl. „მოვხსენი") still pass.

**d2fe7c4, board 374 (Misho: option ა, re-upload the vcf).** The import capped the FILE at 500
before skipping saved contacts. A re-uploaded phonebook of 600+ therefore never got past its first 500,
and a contact added later could sit beyond that point. Now up to 5,000 rows are checked and the cap
counts only NEW contacts. Leftovers come back as `remaining`. FOR_FRONTEND has a line about it.
Order: after the patch, then the queue as before.
DONE WHEN: re-uploading a 500+ contact vcf with one new contact gives `imported: 1` with the
rest `unchanged`, and a search finds the new contact.

3567 and 3568 are next for me, ahead of the big builds: one sends a third person's illness, the other meets a self-harm worry with an
internal apology. After that comes 3598.

**Axel task: NOT filed. My board POST was refused by my permission classifier
(external system write), and I am not working around it.** The finished body is in
`docs/link/patches/axel_task.json` (problem, task = 46072 with the 47191 part-7 correction + the DONE WHEN of 47422,
priority 2, created_by tornike). It needs a POST to /admin/team-tasks. If you can file it, please do
and post the number in the box (47422 asks for it). If not, it waits for Misho's word to me.

### 8 Oct, 20:42Z — re your 20:24Z: 3565 fixed (03e3893) — ship it FIRST in the next window

**03e3893, board 3565.** A fix, not a revert: the 3302 guard now fires only when the owner's own line
asked to delete / forget / remove something (and the reply claims a deletion, and no deleting tool
ran). A plain question can no longer get the delete card. It breaks nothing ME-016 / PR-036 need.
Ship it first, ahead of everything queued (it closes a live regression; D710).
DONE WHEN: SE-042 step 1 and PR-019 step 2 run 5 times each on fresh seats with no delete card, and
ME-016 / PR-036 still pass.

3566 noted (group 2). 2047 waits on Misho's yes (D684), noted.

### 8 Oct, 20:35Z — three more: 8f894bc (internal words), 31d3f64 (1687, §106), 91d79cb (1695, §107)

**The 1850 „ჩავდე" from F16 is NOT a fault:** all 8 goals (22255, 22260–22262, 22271, 22275–22277)
DO have a held row each, made 19:07–19:16Z, for tomorrow's 15:00Z card, unreleased — the claim was
true. Held questions live in `held_asks`, not in `task_asks`, which is likely where the tester
looked. Only the one „ვკითხე" (1 of 8) was untrue. Please pass this on.

**8f894bc, no board item (the tester's 47325, goal 22290).** A sentence carrying an internal word
(a snake_case identifier outside a link or an email, or „ოუნერ") is dropped from every reply; never
empties a reply. DONE WHEN: no reply carries a field name like permission_granted or „ოუნერ".

**31d3f64, board 1687 (second part).** Misho approved the shortening brief tonight; recorded as §106
in docs/ADMIN_WRITE_OPERATIONS.md (this commit, exact text — your D44 check). A body over 400
characters is shortened once; used only if shorter, every number kept, one question. 1687 is then
whole. DONE WHEN: an ask first made 600 characters comes out under 400 with every fact kept; a log
line shows one that could not be shortened.

**91d79cb, board 1695 (A12).** Misho's yes, §107 (recorded in 31d3f64). Migration 219
(task_asks.prepared_answer). A likely_yes first ask gets one prepared line from the reader's own
profile fields, shown only to him under the question; his „yes" tap sends it as his answer, by the
server. Ship after d0638c8 (1694). The pre-filled „other" box needs the frontend (contract to follow).
DONE WHEN: the likely_yes seat of A11 sees the line under yes; a tap sends it, the asker gets it with
the facts exact; the asker never sees it before; possibly / ask_him seats see no line.

Order: … → baa757d (1690) → 8f894bc → 31d3f64 → 91d79cb.

### 8 Oct, 20:16Z — re your 20:06Z (F16): the two answers for the tester

**1919, the resume route:** `POST /threads/:threadId/resume` — the goal's conversation id, the same
JWT, no body. It reopens the goal AND wakes it with the question that was cancelled at the stop, to
send again. The typed „გააგრძელე ეს მიზანი." only reopens it (that is the model's path), which is
why nothing was resent. The app's „Resume" button calls the route.

**NO-004, the push log:** neither seat had anything to push to. Goals 22284 and 22290 belong to
seats with no push subscription at all, and push_deliveries holds no row ever for either — so none
of those five wakes pushed, and none could. NO-004 needs a seat with a subscription (a browser that
allowed notifications on that seat).

**The 1850 false „ჩავდე" and the „permission_granted" line:** both noted. The first is a false claim
of something I shipped, so I take it next, ahead of the order; the second (internal text reaching an
owner) right after.

### 8 Oct, 20:11Z — baa757d (1690, A7 fact confirm) with migration 218

**baa757d, board 1690.** When a search in the owner's run shows a contact with a core fact the owner
saved over 180 days ago, unconfirmed, the server adds one card after the reply („შენახული მაქვს:
ზურაბ — „BDO". ისევ ასეა?" / კი, ასეა · აღარ · არ ვიცი), at most one per conversation a day. The
tap is settled by the server, no model: yes → last_confirmed_at; not sure → not asked for 180 days;
no longer → „ახლა სად მუშაობს …?" and the next short line is saved as a new fact (old kept). A
„helped" debrief sets confirmed_by_result_at. New pending kind `fact_confirm` (text + buttons, like
any pending card) — please add it to the FOR_FRONTEND line you planned.
**Migration 218_fact_confirm.sql** (three columns on contact_facts, table fact_confirms). Ship after
28e2557 (it touches debrief.service too).
DONE WHEN: a fact saved 7 months ago gives exactly one confirm line when used; a tap updates the
right field; the same fact is not asked again; a fact under 180 days gives nothing; two old facts in
one conversation give one question.

Order: … → fb41846 (1691) → baa757d.

### 8 Oct, 20:00Z — fb41846 (1691, A8 order); ship after 28e2557 (it reads answer_stats)

**fb41846, board 1691.** A wave's remaining people in A8's order: the person the goal's text names
(D625); then the pre-match class (1694; not_his_field last); then the answer rate in the field,
(yes + referred + 1) / (asked + 2), then overall (1689's answer_stats); then the plan's order. Two
signals, two records, nothing merged. A failed read keeps the plan's order. It reads answer_stats,
so it MUST ship after 28e2557 (migration 217).
DONE WHEN: four fictional candidates with known records come out in the defined order; changing one
record changes the order; the owner-named person is always first.

Order: … → 28e2557 → fb41846.

### 8 Oct, 19:53Z — 28e2557 (1689, A6 answer record) with migration 217

**28e2557, board 1689.** answer_stats per person and field (asked, yes, no, referred, later, silent,
median first-answer minutes, helped, bridged — separate counters). Recounted from the source tables
after a first ask, an answer/decline, a „helped" debrief, and hourly. Each first ask now carries its
`field`. Admin per-user page: new `answerStats` block. Never in a user's app.
**Migration 217_answer_stats.sql** (new table). New hourly cron `answerStats.cron.ts`.
DONE WHEN: after one ask answered yes and one declined on fictional seats, the two records show the
right counters and the median minutes; a debrief „helped" adds 1 to helped; the numbers appear in no
user's app.

Order: … → 8a26479 (2182) → 28e2557.

### 8 Oct, 19:42Z — 8a26479 (2182) with migration 216; 1817 needs a phone check, not a build

**8a26479, board 2182.** Five core profile questions (migration 216, a seed, ON CONFLICT DO
NOTHING): what she does and where; what she can help with; what she looks for now; which topics
not to ask her about; when and how to reach her — answered in her own words, each with its reason,
served before every other bank question. A core answer is also kept as her note (profile / need /
preference); „don't ask me about" goes through the existing boundary path.
DONE WHEN: on three fictional seats „რისი ცოდნა გინდა ჩემზე?" gives only such questions, one at a
time, in good Georgian; Lika or Ninia reads ten and marks none as silly.

**1817:** built on both sides since 6 Oct (server `seen_at` + POST /threads/:id/seen; the frontend
draws an unseen answer on top, marked new). Nothing to build; it needs Ninia's phone check. Please
say so to the tester; the board row can go to being_tested.

Order: … → d0638c8 (1694) → 8a26479.

### 8 Oct, 20:25Z — first big build: d0638c8 (1694, A11 pre-matching), with a migration

**d0638c8, board 1694.** Before a wave is assembled, each candidate gets one word from HIS OWN data
only (rules, no model): not_his_field (his boundary) / likely_yes (his own profile or profile note)
/ possibly (only a label on his number) / ask_him (nothing; every non-member). The wave's remaining
people are ranked by it (the boundary last); each first ask stores prematch / prematch_source /
prematch_at; GET admin per-user asks shows the two new fields. The asker's side never sees a word.
**Migration 215_ask_prematch.sql** (three nullable columns on task_asks) runs at boot as usual;
the code reads/writes them only after it.
DONE WHEN: four fictional seats (a profile note „I handle customs for food exporters" / a customs
label only / nothing / a boundary on customs) get, for the same ask, likely_yes / possibly /
ask_him / not_his_field on the admin ask record; the wave asks them in that order; the asker's
messages carry none of the words and no fact from a seat's private data.

Order: at the end of the queue, after 0b7338c.

### 8 Oct, 19:40Z — re your 19:05Z: v373 order taken; two more to ship (e6e56fc, 0b7338c)

v373 and Tornike's night instructions read. I work the Pr1 big builds in that order; questions
that need Misho go to him (by day here, at night into docs/NIGHT_QUESTIONS.md — at night I write
no live data, the board included).

**e6e56fc, board 859 (docs only).** A section in docs/FOR_FRONTEND.md: 501's three Android
subscriptions got 201 from FCM on every push in 4 days, none 404/410 — the server sends and Google
accepts, so the fix is the service worker (show every push) and re-subscribing on app open; the
routes exist. No code. DONE WHEN: the frontend acknowledges it in TO_BACKEND.md.

**0b7338c, board 1687 (part).** Every outgoing ask now ends with the identical line in the reader's
language and the asker's profile name: „— ნინო ბერიძის ასისტენტი, ნინო ბერიძის სახელით" / „— Nino
Beridze's assistant, for Nino Beridze". A body over 400 characters is logged ([ask-length]) and sent
as written. The second writer pass („shorter, same facts") is model-facing and waits for Misho's yes.
DONE WHEN (this part): twenty asks each end with the identical line in the reader's language; a long
one shows an [ask-length] log line. 1687 stays to_build after the LIVE.

374 (a new phone contact found within 5 minutes): on the web a browser cannot read the phone's
contacts, and Misho said „ჯერ ვებზე ვრჩებით" — it is a question for him, not a build tonight.

Order: … → e702227 → e6e56fc → 0b7338c.

### 8 Oct, 21:10Z — re your 18:48Z and 18:55Z: the throw fixed (e702227); AB-029; the new order

**e702227, no board item (your daily check).** The ask_contact throw: goal 5580's last ask to that
person pointed at a conversation the reader had since deleted, and the new question was written
into it (foreign key). A conversation that no longer exists is not reused; a new one opens.
DONE WHEN: threw.sh shows no ask_contact foreign-key throw. Ship it at the end of the queue.

**propose_task_plan „not valid JSON … cut off" (2 in 24 h):** noted; a truncated tool argument.
It goes into group 3 (small fixes) under the new order, not now.

**AB-029, for the tester:** there is no admin route for the warmth ledger. It is the table
`warmth_events` (id, user_id, contact_phone, kind, weight, ref, created_at, day), kinds
stated_close / ask_answered / intro_accepted. Read it with ro.sh, read-only, on fictional seats
only, e.g. `SELECT kind, weight, created_at FROM warmth_events WHERE user_id = '<seat>' ORDER BY
created_at DESC LIMIT 20`. If the test needs a route, that is a build for the board.

**F15 PARTLY (order-to-ask note fired, „კითხვა არ გაიგზავნა…", no plan):** noted for group 3.

**Plate v372 / D735:** understood. From now on I build in that order: safety first (1688, 2311,
2578, 2806, 2807, 3037, 2811), then the Pr1 big builds. Small test findings wait unless they are
a live FAIL of something I shipped.

### 8 Oct, 20:45Z — two more for the end of the queue: 9a76e91 (3004), ccd4135 (3236)

**9a76e91, board 3004.** When the owner's line names the person the day's contact question is
about, that question waits for another reply (the owner had just told where Nino works and was
asked where Nino works). DONE WHEN: on 3 fresh seats the owner saves a contact's workplace in one
line — none of those replies asks where that contact works.

**ccd4135, board 3236.** Every reply's digits are written 0-9 (Gujarati „૮/૧૦" → „8/10"); when the owner
asks to be rated or scored, the sentences giving a score are dropped and the observations stay.
A personality type name is not caught by this. DONE WHEN: the three ME-032 lines get no number
and no foreign digit.

Order: … → 8f02474 (3269) → ebe2b2d (3500) → 9a76e91 → ccd4135.

### 8 Oct, 20:10Z — re your 18:35Z: 3500 fixed (ebe2b2d); the number range is Misho's

**ebe2b2d, board 3500.** The day's contact question never takes a label with no letter in it
(„💙") as a person. DONE WHEN: on a seat whose contact is saved only as 💙, no reply asks
„სხვათა შორის, 💙 …".

Order after the pause: as you hold it, then 8f02474 (3269), then ebe2b2d.

**The new contact number range (46664):** yes, it is Misho's — every block so far was opened on
his word (2, 3 and 4 October). I have put it to him: the next Ofcom drama blocks are
+44 116 496 0xxx and +44 118 496 0xxx. When he says yes, I add them in fictionalNumbers.ts as one
commit for you to ship. Until then the tester's reuse plan stands.

### 8 Oct, 19:55Z — ship last: 8f02474 (3269)

**8f02474, board 3269.** „ვის აქვს მალე დაბადების დღე?" is answered by the server from the told
birthdays (next 30 days, soonest first, nobody else); a note that is only a birthday is filed as
`birthday`, and birthday notes saved before are read too. No prompt or tool text.
DONE WHEN: SE-039 and ME-040. After two told birthdays, the question in a new conversation lists
both, soonest first, nobody else.

Order: … → 6f89095 (3466) → 8f02474.

### 8 Oct, 19:30Z — re your 18:12Z: 3367 FAIL fixed (ebe4d90 + 8a553c0); 3499 = 7e30c5c; FOR_FRONTEND yes

**ebe4d90, board 3367 (to_build → ship).** A question the reply already named is not listed
again on the server card: askers are looked for in both alphabets, and when two share a first
name („Netai Test 3367 Reader 1/2"), also by the words only one has („1" / „2"). The tester's
exact reply („ნეტაი ტესტ 3367 მკითხველი 1 … 2") now lists nothing again.

**8a553c0, board 3367 (same item, ship right after ebe4d90).** „რა მელოდება?" / „რა არის ახალი?" no
longer carry the day's „სხვათა შორის …" contact question (conv 45693's whole reply was that).
DONE WHEN (both): QA-047 and NO-005 step 4. Every incoming question and every own waiting goal is
shown once — named in the reply or on a card, never both — and no „სხვათა შორის" question rides
along.

The translated asker name („მკითხველი" for „Reader") is 3169's kind; 8e9b6d3 restores names a
search returned, not inbox askers. Not fixed here.

**3499:** keep 7e30c5c under 3400 in git, and name 3499 in its LIVE and on the board, as you said.
**FOR_FRONTEND line for `questions_waiting`:** yes, still goes — the card exists and is live; only
its duplicate listing was wrong.

Order: ebe4d90 → 8a553c0 ahead of what is left in the queue (they close a live FAIL), then the rest,
then 6f89095 (3466) last.

### 8 Oct, 19:00Z — ship after the queue: 6f89095 (3466); and 7e30c5c is board 3499

**6f89095, board 3466.** After the helper picks one of two same-named contacts, the number goes to
the asker: on a thread with a live question, when her own words say to give/send that number,
get_own_contact_number shares it with the asker instead of showing it to her (a line that only
asks to see a number is unchanged); an ordinal pick („მეორე", „2") takes that position in the
name search's order.
DONE WHEN: PR-011 twice. After the helper picks one namesake, that contact's number (and only it)
reaches the asker within 30 s, the ask is answered, no further question to the helper; „მეორე"
means the second.

**7e30c5c is the fix for the new board item 3499** (the tester's 17:14–18:08Z runs: get_invite_link
in the first reply). Please name 3499 in its LIVE and set 3499 to being_tested with it; its DONE
WHEN is the board's (GP-066 on 3 fresh seats: zero get_invite_link and invite_contact in the first
run, no invite text).

Order: … → 7e30c5c → 6f89095.

### 8 Oct, 18:35Z — re your 17:55Z: 3302 FAIL fixed, bd4f15c

**bd4f15c, board 3302 (to_build → ship, then being_tested).** The check now also knows a removal
said in other words: მოვხსენი / მოიხსნა / ამოვიღე / ამოვშალე / მოვაშორე / გავასუფთავე, „has been
removed", „I cleared / erased", убрал / стёр, eliminé / quité — the tester's „…ჩანაწერიდან
„ელექტრიკოსი" მოვხსენი." is now corrected to „ეს ჯერ არ წამიშლია…" with the „კი, წაშალე" button.
Agreed: c28cf0a stays live, no revert.
DONE WHEN: ME-016 step 4 and PR-036 step 4 on fresh seats, 2 of 2: no reply says a fact was
removed unless a deleting tool ran; after „კი, წაშალე" it is gone next conversation.

Order: ship it next after the commit now in flight, ahead of the rest (it closes a live FAIL).

### 8 Oct, 18:15Z — re your 17:24Z: the tester's two points, two commits

**5db4ae6, board 3369 (stays tested; a follow-up).** „…ლევან ტესტელთან" was searched as „ლევან
ტესტელ". When „-თან" leaves a consonant stem, the nominative „ი" comes back: „ლევან ტესტელი".
DONE WHEN: „დამაკავშირე ლევან ტესტელთან" searches „ლევან ტესტელი" (tool log).

**7e30c5c, board 3400 (stays tested; a follow-up).** get_invite_link is held like invite_contact: in
an owner's run it is offered only when the line asks to invite, approves, or asks for the link.
DONE WHEN: a need with a saved non-member contact gets no get_invite_link call and no invitation
text until the owner says yes; „მომეცი ჩემი ლინკი" still gets the link.
The tester's other remark in that run („რადგან მასთან უფრო რბილ გზას ეძებ", words the owner never
said) is one sighting with no task; noted, not fixed.

Order: … → f9430eb → 51431fc → 5db4ae6 → 7e30c5c.

### 8 Oct, 17:50Z — ship after f9430eb: 51431fc (2707, the Latin case)

**51431fc, board 2707 (stays being_tested).** A line of Georgian typed in Latin letters („iuristi
mchirdeba", „gamarjoba", „kargi … vinme icnob?") is now detected as Georgian, so the reply comes
in Georgian. Only words no English or Spanish sentence uses; English lines stay English.
DONE WHEN: ON-006 and ON-007 on a fresh empty seat in all three scripts; the Latin-letter line is
answered in Georgian.

Order: … → f9430eb → 51431fc.

### 8 Oct, 17:20Z — re your 17:10Z: ship_one.sh fixed (4ea5c40); one more fix, f9430eb (2579, §105)

Thank you for the hash finding — it was mine.

**4ea5c40 (ops, no board item).** `scripts/ops/ship_one.sh` now reads `git rev-parse --short=7`,
so it sees its own deploy and runs the outage check itself. Ship it NEXT, before the rest of the
queue, so every later ship runs the fixed script. No product change.
DONE WHEN: the next ship_one.sh run prints DEPLOYED and outage=0 by itself.

**f9430eb, board 2579 (first part).** The owner's model-written buttons pass the editor before
they are shown, with the brief Misho approved today (recorded as §105 in
docs/ADMIN_WRITE_OPERATIONS.md, exact text, in this commit). Server labels (approve / change /
other / later) are never sent to it; a failed or unusable check keeps the buttons as written.
This IS model-facing text: the §105 record is your D44 check.
DONE WHEN: on a fresh trio after one helper answers, the owner's buttons under the answer card
are correct Georgian, e.g. „კი, სთხოვე გაცნობა" / „არა, ჯერ ლევანს დაველოდოთ" / „სხვა, მე
დავწერ". After its LIVE, 2579 can go to being_tested (both parts are then in).

Order from now: 4ea5c40 → (the rest of the queue as you have it) → 7fee557 → f9430eb.

### 8 Oct, 18:20Z — ship after 8e9b6d3: 7fee557 (3368)

**7fee557, board 3368.** A Georgian run that used only tools with no caption of their own
(check_my_inbox, list_status) kept no step. Georgian now falls back to „⚙️ ვმუშაობ..." like every
other language, and the inbox, the goal status and the goal list have their own Georgian step.
Owner-visible: such tools now show a live step line too.
DONE WHEN: AP-022 on three different turns. Every run that used a tool shows its steps on its
last assistant message after a reload.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93 → ae1be86 → c8485cd → 427dab7 → 8e9b6d3
→ 7fee557.

### 8 Oct, 17:55Z — ship after 427dab7: 8e9b6d3 (3169)

**8e9b6d3, board 3169.** A name a search returned (two or three words) that the reply spells in the
other alphabet — „დათო ტესტაძე" for Dato Testadze, „Ana Tsdelidze" for ანა საცდელიძე — is put back
exactly as saved before the reply is stored. Names already in their own alphabet (with a case
ending too) are untouched. A word-for-word translation („Hans Fictional") is not caught.
DONE WHEN: on a seat with contacts 'Dato Testadze' and „ანა საცდელიძე", a Georgian and an English
question each show both names exactly as saved.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93 → ae1be86 → c8485cd → 427dab7 → 8e9b6d3.

### 8 Oct, 17:30Z — ship after c8485cd: 427dab7 (3137)

**427dab7, board 3137.** A contact saved only as a symbol („💙") that a search returns and the reply
leaves out is added by the server after the reply: „შენახული გყავს როგორც „💙" (სტომატოლოგი)."
Each label once, at most three; only in runs the owner started.
DONE WHEN: ME-011. On a seat with a contact named only 💙 tagged სტომატოლოგი, „ვინ მყავს
სტომატოლოგი?" shows the 💙 and invents no name.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93 → ae1be86 → c8485cd → 427dab7.

### 8 Oct, 17:05Z — ship after ae1be86: c8485cd (3170)

**c8485cd, board 3170.** „ვინ მყავს ისეთი, ვინც <word> არ არის…?" / „who is not a <word>?" is
answered by the server before any model call: the owner's own tagged contacts minus everyone the
ordinary search finds for the word (and the excluded), three by name with their tags. Only when
the word is something somebody is saved as; otherwise the run answers as before.
DONE WHEN: SE-031 step 3. The same question on seat 179960 names three non-investors with their
trades and no investor.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93 → ae1be86 → c8485cd.

### 8 Oct, 16:45Z — ship after 422bc93: ae1be86 (3433)

**ae1be86, board 3433.** A helper's typed refusal („აზრზე არ ვარ", „არა, ვერ მოვახერხებ, სხვას
ჰკითხოს.", „არ ვიცნობ"; also en/ru/es) now sets the ask declined like the button. Read from the
helper's own last line typed after the question; a line with a number, a „but", or longer than
100 characters stays an answer.
DONE WHEN: QA-026 on three helpers. A typed „აზრზე არ ვარ" / „არა, ვერ მოვახერხებ" / „არ
ვიცნობ" leaves the ask declined; an answer that carries a name or a number stays answered.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93 → ae1be86.

### 8 Oct, 16:20Z — ship after 1274981: 422bc93 (2579, the RO-014 line of box 46762)

**422bc93, board 2579.** A helper question that opens with „იცნობს" (about the helper, third
person) now reaches them as the editor's „იცნობ …?" — the #2212 check had been throwing that
rewrite away (ask 16678). A concrete-answer button that only points („ამ სპორტდარბაზში
დავდივარ", no gym named; ask 16669) is dropped when the rest is still a valid set.
DONE WHEN: RO-014 on fresh seats. No helper reads a question about themselves in the third
person or ending in a full stop; no button answers an open „which/where" question with „ამ …"
naming nothing. The first part of 2579 (owner buttons after an answer card, 7 Oct) is NOT in
this commit — the row stays to_build after the LIVE.

Order: 6df7e63 → 88ecbe3 → 9a2fadf → 1274981 → 422bc93.

### 8 Oct, 15:50Z — ship after 9a2fadf: 1274981 (3367)

**1274981, board 3367.** „რა მელოდება?" / „რა არის ახალი?" now name the owner's own goals waiting
on them — a plan waiting for a yes, a goal whose results are in and nothing is out — on the server
card with why each waits; and any incoming question the reply did not name is listed after it as
its own server card (kind `questions_waiting`, no buttons).
DONE WHEN: QA-047 and NO-005 step 4. On a fresh seat with two incoming questions, one plan
waiting for a yes and one goal with results in, „რა მელოდება?" and „რა არის ახალი?" show both
questions and both goals, each once; a seat whose only waiting thing is its own goal is never
told „ჯერ არაფერი გელოდება".
Frontend: a pending message of the new kind `questions_waiting` (text, empty choices). Please
add one line to docs/FOR_FRONTEND.md after it ships: it draws like any other pending message,
no buttons.

Order still open from earlier sections: 6df7e63, 88ecbe3, 9a2fadf, then 1274981.

### 8 Oct, 15:05Z — ship after the first handoff: 9a2fadf (3302)

**9a2fadf, board 3302.** When a reply claims a deletion („წავშალე", „წასაშლელად მოვნიშნე",
deleted) and no deleting tool ran in that run, the owner reads „ეს ჯერ არ წამიშლია. დამიდასტურე
და ახლავე წავშლი." with a „კი, წაშალე" button instead; the next run deletes it the ordinary way.
DONE WHEN: ME-016 step 4 and PR-036 step 4 on fresh seats. In a NEW conversation „დაივიწყე, რომ
<name> ელექტრიკოსია." never gets „წავშალე" unless forget_contact_fact (or another deleting
tool) ran in that run; after „კი, წაშალე" the fact is gone (get_contact_facts) and not told back
in a next conversation.

Note: 4b3e446 (3400) deployed as 9068735; its LIVE is yours to post, as in the section below.

### 8 Oct, 14:55Z — first handoff: two fixes to ship, after 4b3e446

**Wait first:** the code session is shipping 4b3e446 (3400) itself, the last one it ships. Do
not ship anything until `./scripts/ops/logs.sh deployments 1` shows that commit's cherry-pick
DEPLOYED (subject „fix(chat): no invitation is prepared before the owner says yes to it
(3400)"). Then post its LIVE yourself (text below), and ship the two that follow, in this order,
one at a time. All three are on branch `claude/ally-app-docs-ctezil`.

1. **4b3e446, board 3400 (shipped by the code session; you post the LIVE).** An owner's run
   whose line neither asks for an invitation nor approves one does not hold invite_contact.
   DONE WHEN: GP-066 and PR-035 on fresh seats (a goal whose best contact is not on Netai):
   the first run makes zero invite_contact calls (tool log), and the first reply only offers
   the invitation. After the owner's „yes" to it, invite_contact runs.
2. **6df7e63, board 3369.** „დამაკავშირე <X>-თან" hands the opening second circle the name,
   not the whole sentence; the name follows the Georgian imperative, with „-თან"/„-სთან" cut.
   DONE WHEN: the tester's 3 runs from 46731 again; search_second_degree:opening carries only
   the name („თამაზ ნიმუშაძე"), no web_search:opening.
3. **88ecbe3, board 3268 (small, the tester's 46732).** The kind line writes a Georgian name with
   „-სთვის" together („ბესო გამოგონილისთვის"); a name in other letters keeps the hyphen.
   DONE WHEN: ME-005 once, after the mark „ჰკითხე <name>-ს…"; the line reads „<name>სთვის
   არაფერს ვწერ…".

Nothing for the frontend. The box has been answered by the code session through id 46734.

### 8 Oct, 14:20Z — the link is open

Nothing to ship in this section. Read docs/OPS_SESSION.md first. The first real handoff
follows as its own section.
