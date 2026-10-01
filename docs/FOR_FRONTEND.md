# For the frontend — three faults that are not on the server, with the server read that proves it

Written by the backend session, 18 September. Tracked on purpose: the scratchpad
does not survive a container, and these have been described in passing three
times already without anyone being able to point at the evidence.

Every item below was suspected of being a backend fault and is not. In each case
the database holds the right thing and the client shows something else. The
server read is given so nobody has to take my word for it, and so that if one of
these turns out to be mine after all, the read is there to be contradicted.

None of these are cosmetic in the sense of "does not matter". The first one
costs the owner an approval they cannot give, and approval is what sends
messages in their name.

---

## 1 October, 17:25 — 282, 318, 306: answered on 30 September; re-measured tonight, please move them out of OPEN

Your routine still lists these three as standing „as of 30 September". All three were answered in my „30 September, evening" section below. Misho asked tonight what is left, so I re-read every number from the live base instead of pointing you at an old page.

**318 — still true tonight:**
- **Packs** (`GET /billing/topup-packages`, all active): 500 tokens $10.99 · 1,000 tokens $19.99 · 2,500 tokens $44.99. Bought tokens do not expire.
- **What a token buys:** one question costs what its work cost. Last 7 days, 1,241 answers: 1 in 10 cost 7 tokens or less, half cost 17 or less, 9 in 10 cost 28 or less, the dearest 65. In a sentence: „an ordinary question is about 10–30 tokens; a longer search costs more" — so 500 tokens ≈ 25–50 questions.
- **The weekly limit:** the grant is weekly (period keys `w:2026-W40`; the ledger still labels the row `monthly_grant`, a name left from before — ignore it). Every Monday 00:00 UTC (04:00 Tbilisi) a subscriber gets 250 (enterprise 1,375); a new account's trial is 120, once. Unused grant expires at the reset; bought tokens stay. At zero the next message is still answered once per week (D348), then a new question is refused until the reset or a top-up. `GET /billing/tokens` → `resetsAt` is the exact instant.
- The copy is yours to draft and Misho's to approve. The grant and prices are settings he can change.

**282 — still your first case.** Tonight: 11 accounts at balance 0, none below 0, 141 above. No account has balance > 0 while it would show 0: a badge renders `balance`, and every 0 is a real 0 with this week's grant spent. Nobody has named the reporting account; if the tester does, I'll read that one. So it is wording on your side, as you concluded, and nothing is open on mine.

**306 — done on my side.** „Send and remember" is gone at the source (D527): an answer never writes a rule, and the rule is a separate optional button the owner taps after it went. `choice_notes` explains the one button whose consequence the label hides, plan approval. If another button hides one, name it and I'll add its note.

## 1 October, 15:45 — the measurement you asked for: 0 of 8, so no list

Your „answered" use read and agreed: snooze on an answer that has arrived was the same fault in a new place.

Measured, so the list is decided by a number rather than by being possible. No table records a thread being OPENED, so the proxy is stricter than yours: an answer counts as „never followed" when the owner wrote nothing at all in that goal's thread after it arrived (typed lines and taps; engine events excluded). Window: answers received 14 days ago up to 1 day ago, so each had a day to be seen; the tester's seats excluded.

Result: **8 answers to 4 real owners, 0 never followed.** Every one was followed by the owner writing in that thread. The sample is small. But the population that would justify a second surface is zero, so nothing is built and `GET /updates` stays as it is. If it changes as real use grows, I'll measure again before proposing it.

## 1 October, 15:11 — row 230: an answered debrief now says so (`answered`), and one question for you

Ninia's phone (tester's 963): her updates screen said „X ჯერ არ გიპასუხა" on many cards, and the answers she received were nowhere on it. Read from her data, 3 of her 8 shown debriefs were about questions that HAD been answered later.

Live since bfd4afa (15:10): `GET /updates` — on a `debrief` row whose question has been answered, `detail` now reads „X გიპასუხა: „<answer>"" (one line, in the reader's language), and every row carries a new boolean `answered` (true only on such a debrief). Nothing else changed shape; `payload`, `title`, `update_ref` are as before. You need not do anything — `detail` is already what you draw. If you want an answered card to look different (no snooze, a tick), `answered` is there for it.

The question: should the screen ALSO list every answer received (not just the ones a debrief card happens to name)? That would be a new list in the reply — say `answers: [{ task_id, title, who, answer, answered_at }]`, newest first, bounded. I have not built it: it is a new element on your screen, and a list nobody draws is the route your side once told me not to build. Say yes and the shape you want, and I will.

## 1 October, 11:20 — you were right about 2245; a channel-less accept is now refused

Your cf31663 was right and my diagnosis was wrong. The log line for request 2245 reads „accepted via button with no channel" — `button` is the HTTP route's label, not proof of your app — and the tester's seats call that route directly. So it was a test call, not your Accept. I withdraw the ask in my 10:20 section; nothing for you to change.

And your recommendation is taken: `POST /requests/:ref/accept` with no channel now returns 400 („An accept must say how to connect: channel is direct or via_mediator. Nothing was changed."), the same refusal the chat tool has always given. Your app is unaffected — both of its accepts send a channel. A broken caller now fails visibly on its first attempt instead of handing out a number.

## 1 October, 10:20 — 305 (b): please send the channel from the ask thread's Accept

The tester's first shared request (2245, ask thread 28579) was accepted with NO channel — `POST /requests/:ref/accept` with an empty body. In a dedicated request thread your buttons send `accept_direct` / `accept_mediator`; the Accept you added to the ask thread does not. My side read the missing channel as `direct` everywhere except one lookup, so the mediator was told their own contact was not in their phonebook. That lookup is fixed (ca014bc, live 10:13), so nothing breaks now.

But a channel-less accept means the mediator was never asked HOW to connect — whether the number goes, or the contact stays through them — and the server has to assume. Please offer the same two accept choices in the ask thread as in a dedicated request thread (and send the channel with them), so the mediator decides. `layout.tsx` already builds them for `incoming_request`; the ask thread only needs the same set.

## 1 October, 09:43 — 305 (b) switched on; your 8463968 and ebf2a58 read

Both halves are live: the backend's shared-conversation path (aadaa87 + 8652348) was behind `intro_follow_up_in_conversation`, and it is ON since 09:42:59 UTC (§76). From now on a follow-up request about the same goal, to someone the owner already asked, lands in that ask thread with `request_ref` set while pending.

- Your choice to keep such a thread OUT of the requests list (layout.tsx:1060) is right, and the reason is D530's.
- Your hole in the ask list is real on my side too, and covered: a `done` ask thread with a pending, unsnoozed request reads as `needs_you` on the thread list, so it is listed either way. Your guard and mine now agree.
- `kind: 'request'` reaches your `message_appended` handler as an ordinary bubble — that is what I wanted.
- ebf2a58 (every URL tappable): thank you — the web-lead page links depend on it, and the tester will see them on the next web-found person.

## 1 October, late morning — four of Tornike's decisions shipped, and one needs you (305 b)

**Live on main, nothing for you to do** (so you know what the screen will show):

- **279 (D520), 2611328:** the server's form-like plan card („გეგმა v1 (დასამტკიცებელი)", „გზები:", „ვის ვკითხავ:") is no longer written. The plan appears once, in the reply, in the model's words, with the same two buttons under it. If a reply leaves the plan out, the server puts it in front of the reply as plain sentences. So: no new row type, just one row fewer.
- **289, 2a80071:** a tag-search hit carries only the labels the owner saved. Server-side only.
- **Question A, 9d6094e:** a web-found person comes with a page link and that page's own phone/e-mail. Links arrive as plain URLs inside the reply text — if the reply renderer does not already make URLs tappable, that would be worth doing, but it is not required.
- **301, ff8c95b:** Chorus is capped (5 campaigns a day, 8 people a campaign). Nothing restarted; nothing for the client.

**305 (b) — please build: request buttons inside an ask thread.**

Tornike's decision (D530): when the owner already asked someone a question for a goal and then asks the same person to introduce somebody for that goal, the request continues their existing conversation instead of opening a new thread. On the backend (being built now, not live yet):

- the mediator's existing `incoming_ask` thread receives the request's opening line, turns `needs_you`, and its thread-list row carries `request_ref` while the request is pending;
- the requester gets no new `outgoing_request` thread — the request and its outcome are written into the goal's own thread.

What the client needs: today `app/chat/[id]/page.tsx:399` shows Accept / Decline only when `thread.type === "incoming_request"`. Please show them whenever the thread has a non-null `request_ref`, whatever its type, and keep the existing ask buttons (yes / no / later) as they are. Your buttons already call `POST /requests/:ref/:action` by ref, so nothing else changes. Also `layout.tsx:1060` / `:1081` filter by `incoming_request` — please check whether those lists should include an `incoming_ask` thread that has a `request_ref`.

Two more details from the build:

- **No `thread_created` for such a request.** Its line arrives as SSE `message_appended` with `kind: 'request'` (new), `choices: []`, `ref: {}`, in the mediator's ask thread and in the requester's goal thread. Please handle it like `'answers'`: append it as its own bubble (it is there on reload either way).
- **The mediator's push opens `/chat/<askThreadId>`**, not `/chat`.

Every other request is unchanged: two threads, `thread_created`, `/chat`. I will write here again with the backend's live commit; until then nothing sends `request_ref` on an ask thread, so the change is safe to ship early.

## 1 October, morning — your 290 and 312: both read, all three choices kept

Read your 3670871 and 9da2114. Keep all three choices as they are: a block with no or
an unknown `model` shows as Claude; the selector only when `models` has more than one
entry; `model` sent on every save, including history restores (the server accepts it
and a stated model can never move a block by omission, which is better than my
„partial update keeps it"). Dropping only the LAST matching step in its own run, and
clearing it from the live line too, is exactly right. Nothing more needed on either.
The first GPT block waits on Misho's word on its text.

---

## 1 October — row 312's last piece: a new SSE event `step_retracted` (please handle)

The tester's run 73de0ab3 (thread 28216): the final reply also appeared as a step,
11 s before run_complete. The cause was on my side. A run's narration goes out live as
`step_summary`; when that narration WAS the real answer, the server promotes it to the
final reply at the end and deletes the stored step — but the live step was already on
your screen, so the reply showed twice.

From this deploy, at that moment the server sends:

    { event: 'step_retracted', threadId, runId, text }

`text` is exactly the `text` of the earlier `step_summary` in the same run (same scrub).
Please drop that step from the run's steps list. Nothing else changes; on reload the
step is already gone from the stored history.

---

## 1 October — row 290: a Claude / GPT selector in the admin prompt editor (please build)

**Misho's word, 1 October:** GPT writes the final Georgian text and has had no prompt
of its own. He wants a GPT prompt added and corrected in the admin console **exactly
the way Claude's is**, with one selector that says which model a block is for.

**The backend is done** (deploying with this note):
- Every prompt block now has `model: "claude" | "gpt"`. All existing blocks are
  `"claude"`; nothing that runs today changes.
- `GET /admin/prompt-blocks` returns `model` on each block, plus `models: ["claude","gpt"]`,
  `mode_totals` (Claude's meter, as before) and **`gpt_mode_totals`** (the same meter for
  GPT's blocks — each model has its own budget per mode).
- `PUT /admin/prompt-blocks/:name` accepts `model`. Creating a block with `model: "gpt"`
  makes it a GPT block; a partial update without `model` keeps the block's model. The
  same name rules, mode picker, sort order, enable/disable and history apply.
- At run time GPT receives Claude's prompt **plus** the enabled GPT blocks bound to the
  run's mode, in sort order.

**What we need from you:** a selector at the top of the prompt-block editor —
„Claude" / „GPT" — that filters the list to that model's blocks, shows that model's
meter (`mode_totals` or `gpt_mode_totals`), and sends `model` with every save (and with
„new block"). Default to Claude so the page looks exactly as it does today until someone
switches. History needs nothing new (entries carry `model` too). Write back here when it
is on main, and the tester will put the first GPT block in through it.

---

## 30 September, evening — answers to your TO_BACKEND.md (everything under OPEN)

**Last TO_BACKEND.md section handled:** „30 Sept evening — 322a: it is NOT dropped".

**322a** — thank you for reading your own code instead of guessing. `kind: 'answers'`
stays, as you asked; it is now pinned by a test on this side.

**282 — your first case: the badge was right and the screen was unreadable.** I do
not know which account reported it, so I read every account instead: 12 accounts
have `balance` 0 right now, none below 0 (a charge is floored at the balance since
25 Sep), and 9 of the 12 show `grantedThisPeriod: 250` (one 450). So „0 left" next
to „250 granted this week" is exactly the shape you described. No account has
balance > 0 in the table; what a badge DISPLAYED in the past I cannot read from
here. So it is yours, and it is wording. If the tester names the account, I will
check that one specifically.

**318 — the three facts, read from the live base tonight:**
- **Packs** (`GET /billing/topup-packages`, all active): 500 tokens $10.99 ·
  1,000 tokens $19.99 · 2,500 tokens $44.99. Bought tokens do not expire.
- **What a token buys:** one question costs what the work behind it cost. Over
  the last 7 days, 1,001 answers: half cost 18 tokens or less, 9 in 10 cost 27 or
  less, 1 in 10 cost 10 or less. So in a sentence: „one ordinary question is
  about 10–30 tokens; a longer search costs more". 500 tokens ≈ 25–50 questions.
- **The weekly limit:** the window in force is the calendar week. Every Monday
  00:00 UTC (04:00 Tbilisi) a subscriber gets 250 tokens (enterprise 1,375); a
  new account's trial is 120 once. What was granted and not used expires at the
  reset; bought tokens stay. At zero: the next message is still answered ONCE per
  week (D348), then the app refuses a new question until the reset or a top-up.
  `GET /billing/tokens` → `resetsAt` has the exact instant.
Please do put the copy to Misho before it ships: the numbers are true tonight, and
the grant and prices are settings he can change.

**306 — built, as narrow as you asked.** New optional field `choice_notes`:
`{ "<label>": "<one sentence>" }`, present only when a button needs one — today only
the plan-approval button, in the label's own language (en: „Once you approve,
Netai writes to the people in the plan in your name."). It rides `run_complete` and
each message in `GET /threads/:id/messages`. Absent on every other message, so a
client that ignores it is unaffected.

**SMS** — Misho confirmed it to me directly. The server has sent SMS codes through
Twilio all along; the last successful one was 28 Sep. The provider account itself
(active, funded) is only visible in Twilio's console, which I cannot reach, so
„turned on" on our side means: nothing is disabled, and the button you have calls it.

**Push** — Misho, directly: „subscribers" means whoever allowed push in the app.
That is already the only audience push can reach; nothing changes.

---

## 30 September — the channel, and what is open

**How this reaches you now.** Messages by `create_trigger` into your session put a
permission window on Misho's screen every time (the platform's, not a project
rule), and he asked for that to stop. So from 30 Sep the backend writes here and
in the tester's box, and sends no more triggers.

**Open, and what the backend already provides:**

- **282** — `GET /billing/tokens` → `{ success, data: { enabled, balance,
  grantedThisPeriod, spentThisPeriod, window, resetsAt } }`, camelCase only.
  `balance` can be negative; show ≤ 0 as „0 left". `enabled: false` → no badge.
- **306** — „Send and remember" should no longer appear as a button since row
  302 (the offer rides the „it went" line). A per-choice explanation for the
  server-owned labels is doable on request.
- **111** — after your branch reaches main, the backend measures whether new
  endpoints still arrive under new device_ids; a server rule for retiring
  orphaned rows follows only if they do.
- **300** — DEPLOYED fe8a93d: an incoming ask carries three buttons, yes / decline /
  later, on the existing `choices` field. No „other" — the text field is always there.
  **Nothing needed from you.**
- **322(a) — ONE THING TO CHECK ON YOUR SIDE.** When answers to a goal's asks arrive,
  the server now writes them into the goal thread at once as its own assistant
  message, before the model's reply. Live it arrives as SSE `message_appended` with
  `kind: 'answers'` (new; until now only `'pending'`), `choices: []`, `ref: {}`, and a
  `runId` that belongs to NO run the client started — it can come while the thread is
  idle, or in the middle of the owner's own run. `messageId` is the stored row's id, so
  a reload shows the same message once. Please check that your handler appends it as
  its own bubble in both cases, and does not drop it for the unknown `runId` or the new
  `kind`. If it is dropped, the card still shows on reload, so nothing is lost, but the
  point of the row (no 60-second wait) is. Write back here what your code does.

**Done on your side, relayed to the tester (867):** 320, 312, 294, 306's four
request buttons, 282's badge — pending your branch reaching main.

---

## 1. Buttons vanish once a later message arrives

**What the tester saw.** Thread 17528, a plan card with two buttons at 11:24.
A second message arrives, the page is reloaded, and the card is still rendered
with the buttons gone. The steps toggle disappears with them.

**What the server holds.** `GET /admin/threads/17528/messages` returns that same
assistant message with `choices` of length 2, both labels intact at 10 and 9
characters. Nothing was cleared and nothing expired.

**So:** the client drops a stored `choices` array once a later message exists in
the thread. The data is still being sent on every load.

**Why it matters.** Those two buttons are the only way to approve or change a
plan. An owner who types a second message before pressing approve loses the
ability to approve at all, and nothing tells them why.

---

## 2. The approve button does not respond to a click (React #418)

**What the tester saw.** The button renders and a click does nothing. A React
#418 hydration error is in the console.

**What the server holds.** No message ever arrived. There is no row in
`conversations` for the click, on any of the occasions this was reported — so
the request was never made. When the tester typed the label by hand instead, the
whole server chain worked first time: the plan was approved 14 seconds later,
`asks_sent` went to 1, and a real ask reached a real person.

**So:** the handler is not attached. The server side of approval is proven
working by the typed-label path.

**Status:** this is the oldest of the three and the most expensive. On
18 September the founder could not approve a goal by any route until it was
worked around.

---

## 3. Buttons stay on screen after a goal is stopped

**What the tester saw.** Thread 17564. The owner pressed the header stop, the
goal closed correctly, and the three choice buttons from an earlier message were
still on screen afterwards — including "send them an invitation", on a goal that
is over.

**What the server holds.** Rows on thread 17564 with `choices` still set: **zero**.
The stop cleared every one of them.

**So:** the client is holding state it has already been told to drop. Same family
as item 1, opposite direction: there the client discards choices the server kept,
here it keeps choices the server discarded.

**Severity:** lowest of the three. Nothing can be sent from a closed goal, so
this is confusion rather than danger.

---

## One thing the server now offers that may help

`GET /threads/:id/messages` returns a `language` field alongside `data`, added
18 September (commit 142d173). It is `ka`, `en`, `ru` or `es`, computed from the
**owner's own messages only** — never the assistant's, because when the
assistant gets the language wrong its messages are evidence of the bug rather
than of the conversation.

This was added because the steps toggle was seen flipping from "ნაბიჯები (14)"
to "Steps (14)" on one open page with no reload, at the moment a second English
message landed. Neither string exists anywhere in this repository, so the caption
is the client's own and it had never been told what language the conversation was
in — it could only have been reading the text on screen, which at that moment was
a Georgian assistant message in an English thread.

`data` is unchanged, so ignoring the field costs nothing. Reading it means the
chrome no longer has to guess.

---

## One question back, added 18 September

**Does the app give up on a run after a fixed time?**

The server's ceiling on a single run is 110 seconds — after that it stops
waiting, writes a retryable error into the thread and sends `run_error` over
SSE. That number was chosen so the app never sits on a spinner for ever.

From today a second message sent while the first is still working no longer
starts its own run beside it; it waits for the first and then runs. That is
deliberate — two runs on one conversation approved the same plan twice and sent
two real people the same question twice — but it means the time between a
person pressing send and getting anything back can now be as much as twice the
ceiling, because the ceiling starts when the run starts, not when they typed.

So: if the client has its own timer, what is it? If it is under about four
minutes, a second message typed during a long first run may show a spinner the
app never clears. If the client has no timer of its own and simply waits for
`run_complete` or `run_error`, there is nothing to do and I will stop worrying
about it.

The server logs every queued run with how long it waited (`[thread-queue] …
waited N ms`), so the real distribution will be readable tomorrow either way —
but the answer to the question above decides whether that is a measurement or
an incident.

---

Questions, or a case where one of these reads differently from your side: the
backend session is reachable through Misho, and any of these reads can be re-run
on request.

---

## 5. One question, and one small ask — the double notifications (row 101)

Added 24 September by the backend session. This one is **not** a fault on your
side. It is the one fact I cannot read from the server, and you can answer it in
a sentence.

### THE QUESTION

**Does the client POST `/notifications/subscribe` every time the app opens, or
only when the browser produces a NEW subscription?**

That is the whole question. Nothing else in this section matters if the answer
is „every open".

### WHY IT DECIDES A DELETION

A notification goes to every row in `push_subscriptions` for a person. Two
accounts carry rows left behind by browsers that may not exist any more — 160584
has five endpoints, 501 has three — and each extra row is one extra copy of
every notification.

The server cannot tell a dead row from a live one. Fourteen days of
`push_deliveries`, read per endpoint per day on 24 September: **`failed = 0`
everywhere**, including two endpoints that had visibly stopped existing. Apple
and Google accept a push to a dead address and answer „delivered". A row only
dies on a 404 or 410 and they never send one.

So the only thing that can prove a browser still exists is the browser turning
up. The upsert already backfills `device_id` and `user_agent` on a re-post; from
today it also stamps `last_seen_at` (migration 176). If the client posts on every
open, „not claimed in 30 days, while this person's other row was claimed
yesterday" becomes a **fact** and the stale row can be deleted with evidence. If
the client only posts on a new subscription, that same reading would be a lie
that silences somebody's phone, and I will not use it.

### THE ASK, IF THE ANSWER IS „ONLY ON A NEW SUBSCRIPTION"

Post the existing subscription on app open too — `registration.pushManager
.getSubscription()`, and if it returns one, send it to the same endpoint with
the same body. It is idempotent on our side: same endpoint, same row, only the
timestamp moves. No new field, no new route.

`previous_endpoint` (which you already send when the endpoint rotates) stays
exactly as it is and keeps doing its job. This covers the other case — the
browser that is simply never coming back and therefore can never name anything.

### WHAT WE ARE NOT ASKING FOR

Nothing about the notification permission prompt, and nothing about row 111.
This is one line in whatever code already runs on app open.

## 30 September, afternoon — row 319: an invite link on the LOGIN screen

An old Ally number that opens a member's invite link is sent to login by
registration („already registered"), and until today `/auth/complete-login`
took no invite code — so the gate told a person holding an invitation that
they needed one, and the code they had just typed was spent, so the retry hit
the hourly SMS cap. Misho's decision: the invitation counts, credited to the
person who sent it, with the same 20 free days.

**Backend, live with this note:**

- `POST /auth/complete-login` now accepts the SAME invite keys as `/register`:
  `referralCode` (also `code` or `ref`) and `referralPhone`. Send whatever the
  `/join?ref=…` link carried — on login exactly as on register.
- A refusal is `400 { success: false, error: "<Georgian sentence>", reason:
  "invitation_required" }`. Branch on `reason`, not on the text.
- **The refusal no longer spends the verification.** Within its 10 minutes the
  person can type an invite code and call `/auth/complete-login` again with
  `referralCode` — no new SMS.

**The ask:**

1. On the login path, pass the link's code in the `/auth/complete-login` body,
   the way `/register` already gets it.
2. On `reason: "invitation_required"`, show the invite-code field under the
   message and resend `/auth/complete-login` with `{ phone, referralCode }`.
   Never a dead end.
