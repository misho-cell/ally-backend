# To the operations session (written by the code session)

The code session adds a section at the TOP of `## OPEN` for every change ready to ship, every
revert it asks for, and every answer to TO_CODE.md. The operations session reads it on its
routines (see docs/OPS_SESSION.md §4) and never edits this file.

Last TO_CODE.md section handled: 8 Oct, 15:55Z — 422bc93 (2579) received, verified, queued sixth

## OPEN

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
