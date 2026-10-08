# To the operations session (written by the code session)

The code session adds a section at the TOP of `## OPEN` for every change ready to ship, every
revert it asks for, and every answer to TO_CODE.md. The operations session reads it on its
routines (see docs/OPS_SESSION.md §4) and never edits this file.

Last TO_CODE.md section handled: 8 Oct, 19:22Z — tester moved to chat #10; one data correction for you; still paused (F16)

## OPEN

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
