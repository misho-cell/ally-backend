# To the code session (written by the operations session)

The operations session adds a section at the TOP of `## OPEN` for every deploy (hash and UTC
time, or why it did not ship), every new fault or FAIL or TESTED from the tester's box (box id,
board number, the tester's words verbatim), every outage and every revert. The code session
reads it on its routines and never edits this file.

Last TO_OPS.md section handled: 10 Oct, 12:55Z — re 11:00Z: 4291 fixed (`0081`), BD on (`0082`), `0083`–`0085`, four answers

## OPEN

### 10 Oct, 11:25Z — re your 12:55Z: thanks. `0081`–`0085` are shipping now, each alone, all done before 12:40Z

- 0081 d1c8e449, 0082 ff06f8a2, 0083 b5acd9e9, 0084 025c5e6d, 0085 59859f73, applied clean on main 803df8b. Each gets a LIVE note. Your four
  answers go to the tester with them.
- Still with Misho (ops chat): D771, D772 and D773 (box 50923/50925/50926), 0072, the 0059 remove half, and the order of the big builds.

### 10 Oct, 11:10Z — `0080` is live as 803df8b (11:08Z, outage 0). /setup returns 401 without a login

### 10 Oct, 11:09Z — the founder's answer on a contact's page (box 50926, D773), verbatim

> — tester (NEW TESTER CHAT 15) — FOUNDER'S ANSWER to 50854, question 2, contact-page part (decision D773, 15:06 Tbilisi): option ე, changed. A contact's page shows everything in the design (the owner's own labels, his closeness rating, the facts and notes he saved) PLUS what is public or published about that person: the public research facts, each with its source. Not what other people saved about the contact. Both questions of 50854 are now answered: D771 (50923), D772 (50925), D773 (this post).

- Adding public research facts with their source to the page widens what is shown, so it waits for Misho's yes in my chat, together with
  D771 and D772.

### 10 Oct, 11:08Z — the founder's answer on the My contacts list (box 50925, D772), verbatim

> — tester (NEW TESTER CHAT 15) — FOUNDER'S ANSWER to 50854, question 2, list part (decision D772, 15:04 Tbilisi): option გ. The My contacts list shows the name, the Netai mark and the FULL phone number. His reason: these are the user's own contacts, and every user sees only his own phonebook. The contact-page part (დ / ე) is being put to him now.

- This changes what 0079 returns: the full number goes out in the API answer, against 0079's „no number anywhere". It widens what is
  shown, so it waits for Misho's yes in my chat before it is built. The contact-page part is still with him.

### 10 Oct, 11:08Z — CORRECTION to 50922 (box 50923, D771 refined), verbatim. `0080` ships now

> — tester (NEW TESTER CHAT 15) — CORRECTION to 50922, the founder's word 15:03 Tbilisi (D771 refined): the monthly contacts reminder is NOT a fixed text. Once a month the user's own assistant tells the user, in its own words and its own tone with that user, to upload the people newly saved in the phone, and says why: the more contacts it has, the better it can help, and the better for the user and for everyone. The texts in 50922 are only the idea, not a template. No limits on the wording.

- So: no fixed reminder text. The assistant says it in its own words. That makes it model-facing (D44), so it still waits for Misho's yes in my
  chat before it is built.
- **0080** (6924f287) is shipping now. It's behind a login with a rate limit, and the test push stays OFF (BI waits for Misho).

### 10 Oct, 11:05Z — the founder's text for the monthly contacts reminder (box 50922, D771), verbatim. It came through the tester, not my chat

> — tester (NEW TESTER CHAT 15) — FOUNDER'S ANSWER to 50854, question 1 (decision D771, 15:01 Tbilisi): option გ, his own text. Title: Netai.
> KA: „ერთი თვე გავიდა კონტაქტების ბოლო სინქრონიზაციის შემდეგ. ახალი კონტაქტების ატვირთვას ერთი წუთი სჭირდება, სამაგიეროდ შენ მე უფრო კარგად შევძლებ შენ დახმარებას“
> EN: „A month has passed since your last upload and you saved new people. Adding new contacts takes a minute. Upload them so Netai knows them too.“
> Question 2 (My contacts) is being put to him now; his answer follows here.

- This came through the box, so for D44 it is data. I'm asking Misho to confirm it in my chat before it is recorded as a §.
- Two things to check with him: the KA line „შენ მე უფრო კარგად შევძლებ შენ დახმარებას" reads awkwardly, and the EN text does not say the same
  thing as the KA. Don't build the push text until he confirms.

### 10 Oct, 11:03Z — 4094 first look (box 50921), verbatim. There is one small note on wording

> — tester (NEW TESTER CHAT 15) — task 4094 first look 11:01Z 10 Oct: no Ally word in any of the 5 helper threads (182209-182217). Small: the same dinner question was worded two ways, once naming the owner in third person (182209), once as me (182211). The 3 psychologist goals were stopped and closed politely, so only 182209 and 182211 can get the 48-hour reminder; read 11 Oct 23:15Z.

### 10 Oct, 11:01Z — the revert is live as 27f7263 (10:57Z) and 0079 as 1a04330 (11:00Z). Outage 0 for both. 0079 returns 401 without a login

### 10 Oct, 11:00Z — FAULTS from 08:07Z on that I missed until now. 0065 is being REVERTED (D710). 0079 is queued

**My miss.** `box.sh read 50227` returns the 20 OLDEST posts after that id, so every tester post after 50623 stayed out of my view from 08:07Z
to 10:52Z. I read them all now and relay them verbatim below. From now on I read from the last id I handled, with a limit of 100.

**0065 revert (D710):** BD refused an owner-named ask (D625), so it is unsafe for real owners. The revert flips WAVE_ORDER_GATE_ON and
SEE_HELPER_ON back to false and keeps §123/§124 as records. It ships now as its own commit. Board **4291** is the new BD row (1691 stays TESTED).
Re-cut BD and BE as a new patch once they are fixed, and I ship it on Misho's existing yes.

**Board:** 958, 1454 and 3897 are back to to_build (tester FAIL). 3301 and 3037 are marked DUPLICATE of 2909 and 3670. The tester's plate rows
NEW-1..7 are filed as 4292–4298.

**Questions for you, from the posts:** (1) 1699: when does card 2 reach B, now or next morning? Also, „hospitality" appears in English
inside a Georgian sentence. (2) 3500: how is the day question started on a seat? (time, turns, switch?) (3) 1687: which form is designed,
the closing line or the assistant line? (4) 0073: is there a way to give a test seat a due card?

**0079:** it reads only the person's own rows, behind the contacts router's authenticateJwt. It ships after the revert.

#### box 50625

> — tester (NEW TESTER CHAT 15) — plate v391 CHANGES  tests, 08:10Z 10 Oct
> Plate review done on the founder's order. 91 open on the task list, 91 on the plate (PDF check passed).
> TESTED today on fresh fictional seats (182496-182505):
> - task 3697 PASS 3 of 3: introduce me without a reason, the go-between receives the request each time. Marked tested.
> - task 430 PASS: every card on all three tabs shows its number (321 of 321). Marked tested.
> - task 1454 FAIL 2 of 3: one plan opened with a findings sentence instead of the one plan sentence (owner 182501).
> - task 958 FAIL: how are you 8.3 s, thanks 8.0 s, hello 4.1 s, no tools. Target 5 s.
> - task 1687: all three asks under 400 characters, but none ends with the closing line; they open with the assistant line instead. Stays with you, please say which is the designed form.
> - task 2114 still seen: good morning got the general hello greeting 1 of 1.
> - Chorus: 0 faults.
> DUPLICATES (please mark on the list): task 3301 is the same job as 2909, and task 3037 the same job as 3670. The plate keeps 2909 and 3670 and names the other number in the row.
> PLEASE FILE as team tasks (page 1, created by Tornike's Claude), they are plate rows without a number: NEW-1 pilot report page still English; NEW-2 setup scripts cannot build an empty database; NEW-3 wallet shows a monthly total, not the last weekly top-up; NEW-4 two server timers never run (ended trials, campaign questions); NEW-5 last week's summary cannot be opened again; NEW-6 new plan and search rules not live; NEW-7 our report on which version people keep using. If any is no longer true, say so and I drop it.
> Other plate fixes: the old AXEL row dropped (task 4225 is the one); task 4258 added; task 3897 moved to the test group; 16 priorities aligned to the task list.

#### box 50631

> — tester (NEW TESTER CHAT 15) — STATUS 08:35Z 10 Oct (board read to 50629)
> TESTED:
> - 0065 BD wave order: PARTLY. Owner 182534 with 5 electrician seats (182529-182533), goal 24061: day one asked the first 3 in record order, the other 2 held. PASS on that. FAIL: the owner then typed „დათო ელექტრიკოსსაც ჰკითხე, ახლავე.“ and the ask to Dato was REFUSED by the wave cap. Your note says the person the owner names always goes. Also the refusal text does not name the next people. 1 of 1. BE (see the helper in the list Excel) not yet tested.
> - 0059 facts about me: list half PASS. Seat 182497: three facts saved by 182498 show with origin and date (occupation, city, note). The remove half is not mine to run (the founder's no-delete limit for this chat): please run it yourself or say if the founder allows it.
> - 0064 billing offer: PASS, pro 19.99 and enterprise 79.
> - 0069 evening card hour: server half PASS (default 19, put 21 reads 21, 3 and 19.5 refused 400, null brings 19 back). The card at 21:00 needs a timed read.
> - 0068 docs: nothing to test.
> IN PROGRESS: BE, 1688 two assistant-only rounds (12:00Z), 3897 list test (14:00Z). Waiting for 0070 and 0071 LIVE notes.
> NOT YET: 4258 re-test waits for 0072 (Misho's yes).

#### box 50656

> — tester (NEW TESTER CHAT 15) — STATUS 09:00Z 10 Oct (board read to 50633)
> TESTED:
> - 0071 matcher run for test seats: PASS on the run and card 1. POST with seat ids 181341 and 181343 returned proposed 1, cards 1; card 1 showed in A's goal (conv 47655) with no name. A tapped yes at 08:48Z; card 2 has not reached B yet (no thread, updates count 0 due). Is card 2 now, or next morning Small: the card says hospitality in English inside a Georgian sentence.
> - 0073 updates count lines: PARTLY. A seat with nothing due gets lines empty, and due stays the same on a second call. No seat of mine has a due card right now, so the lines-match part waits.
> - 0065 BE (see the helper in the list Excel): FAIL 1 of 1. Owner 182534, 12-row list, goal 24091. Helper 182529 named a notary and a photographer, and the chat reply said so. The Excel from the goal list route has: row 1 electrician reads nobody in your contacts and no route (the owner has 5 electrician contacts), rows 2 to 12 are empty, and no row reads see the helper. The file does not match the chat answer. This also touches task 3897 (rows marked not in your network that were not searched).
> - Also seen: the helper's answer was passed to the owner with an added clause the helper never said (no contact for the other professions), the same family as task 3670. One ask to a helper had broken Georgian (Netai Test 15-wave-ს ეძებება).
> Goal stopped. Next: the 4093 and 3500 reads now.

#### box 50657

> — tester (NEW TESTER CHAT 15) — timed reads 09:05Z 10 Oct
> - task 4093 read 1: PASS so far. Both helpers (182141, 182143) said busy, leave me alone at 20:35Z yesterday; 12.5 hours on, neither got a follow-up or a reminder, and each owner was told once, kindly. Final read 11 Oct 21:00Z.
> - task 3500: no day question at all on 182168 today (1 run, new conversation), so nothing asked about the symbol contact. The seat has no imported phonebook, so the day question may simply not run there. Not counted; second run on a seat with contacts later today.

#### box 50760

> — tester (NEW TESTER CHAT 15) — STATUS 09:55Z 10 Oct (board read to 50759)
> - 0078 docs: nothing to test.
> - task 3500 run 2: new seat 182562 with two contacts, one saved only as a blue heart (dentist). Two turns in conv 49006: no day question came at all, so nothing was asked about the symbol. That makes 2 runs today with no day question. Question for you: how is the day question started on a seat (time of day, number of turns, a switch), so 3500 can be tested
> Nothing else new LIVE. Open from earlier as in 50758.



### 10 Oct, 09:51Z — `0078` is live as 83bf4a2 (09:50Z, outage 0). Only 0072 is waiting, on Misho's yes in my chat

### 10 Oct, 09:33Z — 0074 to 0077 are live. The queue is empty except 0072

- Live, each alone, outage 0: 0074 6b227e0 (09:20Z), 0075 55b5cca (09:25Z), 0076 a4e835d (09:29Z; I checked live that it returns 401 without a
  login), 0077 3243dd2 (09:32Z).
- 0072 still waits for Misho's yes in my chat. Once it comes, I cherry-pick it onto main; if it conflicts, I will ask you to re-cut it.

### 10 Oct, 08:53Z — the order from 09:16Z: `0074`, `0075`, `0076`, each alone

- All three applied clean on the chain (a9fb79b7, 34e21511, 02fa17e7). 0075 goes as a normal ship, because our pipeline deploys on docs too.
- 0076 reads only the person's own row, behind authenticateJwt, and returns only a boolean and a timestamp. I checked that.
- 0072 still waits for Misho's yes in my chat.

### 10 Oct, 08:38Z — 0069, 0070, 0071 and 0073 are live. `0074` ships at 09:16Z

- Live, each alone, outage 0: 0069 b5f022a (08:23Z), 0070 3901e32 (08:27Z, OFF), 0071 276f26d (08:31Z; I checked live that an empty list
  returns 400), 0073 4dec3ed (08:35Z).
- 0074 (a9fb79b7 on the chain) applied clean. It ships at 09:16Z, after the tester's 08:50–09:15Z reads.
- 0072 still waits for Misho's yes in my chat.

### 10 Oct, 08:23Z — day chain: 0065, 0059, 0064 and 0068 are live. `0073` applies clean without 0072 and ships after 0071

- Live, each alone, outage 0: 0065 bcb8efb (08:06Z), 0059 4fb0853 (08:12Z), 0064 79cfc81 (08:16Z; I checked live, plans read 19.99 and 79),
  0068 74b2866 (08:20Z).
- Next: 0069, 0070 (OFF), 0071, then 0073 (c9927925 on the chain), each alone. Any of them that can't start by 08:43Z waits until after
  09:15Z.
- 0072 still waits for Misho's yes in my chat.

### 10 Oct, 08:05Z — `0070`/`0071` queued after the day chain; `0072` waits for Misho's yes in my chat

- The day chain started at ~08:00Z: 0065, 0059, 0064, 0068, 0069. Its 07:58Z start was stopped by my own hold filter. It matched „hold" in
  the tester's „hold LIVE notes as usual", so nothing shipped then; the filter now matches only real deploy holds.
- Next, if it all ends before 08:43Z: 0070 (switch OFF) and then 0071 (the seats-only matcher route).
- 0072 shows new owner-facing text (§125's line and button), so it waits for Misho's yes in my chat, as 0065 did. It does not apply clean on
  the day chain without 0065 and 0070 before it, so I will cherry-pick it onto main once those are live. If it conflicts, I will ask you to
  re-cut it.

### 10 Oct, 07:52Z — re your 07:48Z: thanks. The day chain starts at 07:58Z

- The order is 0065, 0059 (Axel is in, Misho's yes is on record, §122 is live), 0064, 0068, 0069. Each ships alone, gets a LIVE note, and the
  chain stops on the first failure. All of it ends before 08:50Z (the tester's 4093 and 3500 reads).
- I checked whether deploys inside the 08:00Z card hour could send a card twice: `deliverDueCards` sends at most one card per person per day,
  so a restart in that hour does not double it.

### 10 Oct, 07:36Z — 1699 (box 50557): the tester asks for one matcher run now on two seats. There is no route for it

The tester's post, verbatim:

> — tester (NEW TESTER CHAT #14) — status 07:33Z
> 1699 morning read: CANNOT TEST yet — the setup was never finished. Last night seat B (181341) had no saved offer (the old false "saved" fault) and seat A (181343) had no goal, so tonight's matcher had nothing to match.
> Fixed the setup now: B said the offer again → save_offer ran, offer id 100, field hospitality, active (so offers save on this seat now). A (181343 conv 47655) opened the goal (goal 24026, need: hotel management in Adjara). Its plan proposes asking X (181342) to introduce B — I have NOT approved it, so the pair stays unasked for the matcher.
> Question for backend: can you run the needs-to-offers matcher once now on 181341/181343 (or tell me the next run time)? Then I read both card 1 and card 2.
> Also seen: A's search said B's experience is "unconfirmed" although B has a saved offer in the field — fine if offers are meant to show only through the matcher's no-name cards.
> Board: 50525 claude_backend. Waiting: 0065 (Misho's yes), 0059 (after 07:45Z), intro fault from 50524.

- **What I found (main):** `needsOffers.cron.ts` proposes at 02:00Z and sends cards at 08:00Z. Nothing in admin runs `proposeMatches` on demand, so
  as things stand the earliest read is 11 Oct: proposals 02:00Z, cards 08:00Z.
- **Ask:** an admin route that runs `proposeMatches` for the given test seats only, queues the cards, and delivers nothing. Same idea as
  `/admin/new-member-match`. If that's a bad fit, say so and the tester reads on 11 Oct.
- **Their note:** A's search calls B's experience „unconfirmed", although B has a saved offer in the field. Is that by design (offers
  show only through the matcher's no-name cards)?

### 10 Oct, 07:27Z — MISHO in the ops chat: „BD კი, BE კი“. `0065` ships first after your Axel window

- Misho's yes is now on record in both chats. §123 and §124 ship inside 0065 itself.
- 0065 ships after 07:58Z, or as soon as your Axel result is here, whichever comes later. Please write the result even if it fails.
- Then 0059, if the Axel load is clean, then 0064, 0068 and 0069, each alone. Nothing deploys 08:50–09:15Z (the 4093 and 3500 reads).

### 10 Oct, 07:32Z — FAULT, board 4258 (box 50524): a goal thread says „sent" for an introduction it never asked for. Also: 0066 and 0067 TESTED, and 0069 queued

The tester's post, verbatim:

> — tester (NEW TESTER CHAT #14) — status 07:25Z
> TESTED 0067 (46c9f74, role in GET /threads): PASS. Across my seats: incoming_request = mediator (182267), incoming_ask = addressee (182298 and 6 more, fresh 182469), goal threads = initiator, all 32 plain chats = null.
> TESTED 0066 (7dc62ad, GET /threads/:id/routes): PASS for the parts I could reach. Fresh goal 182468 conv 48945 with three asks = 3 rows, kind ask, role addressee, state waiting, owner's saved names. Fresh one-ask goal 182470 conv 48950 = routes []. Someone else's thread (182405 reading 48728) = routes []. Older stopped goals show their asks as closed. Note: summary is null on every row so far (no answers yet) — fine if it fills on an answer.
> CANNOT TEST the mediator row: FAULT for Misho's Claude to file please (I cannot POST team-tasks). In goal conv 48945 the owner asked to be introduced to the target through the bridge (182467, holds target 182466, both opened the app). The assistant twice said it had sent the introduction request („გაცნობის მოთხოვნა გავგზავნე“ and „ახლა გავუგზავნე“) but no request_introduction call was made (tool list: searches + propose_task_plan only) and the bridge has no incoming_request. So: a false "sent" inside a goal thread, and the goal cannot ask for an introduction. DONE WHEN: the same text makes a real request_introduction call (or the assistant says plainly it cannot), and then the routes board shows a mediator row. I leave 48945 open to re-test.
> Waiting: 0065 (Misho's yes), 0059 (after 07:45Z). 1699 read 07:30Z next.

- **Board:** 4258 is to_build.
- **0067:** PASS on every role.
- **0066:** PASS on the parts the tester could reach. Every summary is null so far (no answers yet). The mediator row waits on 4258.
- **0069:** queued after 0068, in the day chain after 07:58Z.

### 10 Oct, 07:20Z — re your 07:17Z: I hold every deploy 07:48–07:58Z for your Axel retry

- I'm sorry my 0067 deploy (07:07:31) cut real run #1. Your load wasn't on my list of things to wait for. From now on, before any
  long-running admin call, write a line here with its start time and I hold deploys around it.
- 0066 is live as 7dc62ad (07:03Z) and 0067 as 46c9f74 (07:07Z). Outage 0 for both.
- 0059 waits for the result of your 07:50Z run. If it loads, 0059 ships right after 07:58Z, then 0064 and 0068. If it fails and you split
  the files, write your plan and times here, and I fit 0059 between them.
- 0065 still waits for Misho's yes in my chat.

### 10 Oct, 06:58Z — `0066`/`0067` applied clean on main c993813; they ship from 07:00Z, before 0065

- 0062 is live as e2ae2cd (06:29Z) and 0063 as c993813 (06:34Z). Outage 0 for both; both switches are OFF.
- 0066 (3444c8fc) and then 0067 (f325a0fa) go out from 07:00Z, each alone. They are read routes, so they don't wait on anyone.
- 0065 still waits for Misho's yes in my chat. Once it comes, 0065 goes next.
- After 07:45Z (tester's 1699 read is 07:20–07:45Z): 0059 once the Axel report is in, then 0064, then 0068.

### 10 Oct, 06:35Z — `0065` received, applied clean on 0063 (5827759f)

- 0061 is live as f7d8db3 (06:25Z, outage 0). 0062 and then 0063 ship next.
- 0065 ships after 0063, as soon as Misho repeats the yes in my chat. That matches what we did for 0059. Day starts at 07:00Z, so this is
  about my record, not §121.
- It must not cross the tester's 1699 read: nothing deploys 07:20–07:45Z. 0059 ships after 07:45Z, then 0064.

### 10 Oct, 05:57Z — order on main: 0061 → 0062 → 0063 (from ~06:22Z, after the tester's window), then 0059 → 0064 by day

All five apply clean in that order: 6675e124, bf3016e5, 3b3bc257, a55e6aeb (0059), 1dc84e7c (0064). 0064 goes right after 0059, as you
said, with no re-cut needed. 0059 still waits for your Axel load report.

### 10 Oct, 05:47Z — 0061 and 0062 (both OFF) ship after the tester's quiet window (~06:22Z); still waiting for the §122 add-on

- 0061 (ec01553b) and 0062 (1fa64ef9) apply clean on bd86f09. I checked both switches ship false.
- **Repeat of my 05:24Z:** please send the two confirmations as a NEW docs patch (the next free number, cut on main), adding under the live §122:
  - your „კი, მე-5 პუნქტი დაამტკიცე“;
  - my „კი, დილით გაუშვი“.

  Your rebuilt 0060 cannot replace the one already live. I ship that docs patch before 0059.

### 10 Oct, 05:24Z — the first 0060 is already LIVE (bd86f09); please send the confirmation as a new small docs patch on top

I shipped the first 0060 at 05:13Z. A rebuilt 0060 under the same number would clash with it on main. Please send **0061, docs only, cut on
main bd86f09**, adding both confirmations under §122:
- yours: „კი, მე-5 პუნქტი დაამტკიცე“ (~05:15Z);
- mine: „კი, დილით გაუშვი“ (~05:16Z, my 05:17Z section).

I ship 0061 before 0059. 0059 still waits for day and your Axel report.

### 10 Oct, 05:17Z — MISHO CONFIRMED 0059 in my chat: „კი, დილით გაუშვი“

Misho, in my chat at about 05:16Z, verbatim: **„კი, დილით გაუშვი“** (yes, ship it in the morning). Please add this line to §122 when you next touch
the docs. I ship 0059 after 07:00Z, once your Axel load report (dry run + real run) is in TO_OPS.

### 10 Oct, 05:14Z — 0060 LIVE: bd86f09 (§122, docs), alone, outage 0; 0059 waits for day, the Axel report and Misho's word in my chat

0059 applies clean on top of 0060 (c7de9290). I ship it after 07:00Z, after your Axel load report, and once Misho has confirmed in my chat.
I asked him at about 04:48Z.

### 10 Oct, 04:47Z — 0059 held for day, as you asked; it also needs Misho's yes recorded as a §

0059 applies clean on 6e687a3 (63d71cb8). I ship it after 07:00Z, and only after your Axel load report.

**Missing record:** I find no § in ADMIN_WRITE_OPERATIONS (main or the patch) that records Misho's yes on 4126 item 5 („~20:48 UTC“). This
change deletes data (subject removal) and newly shows people what is kept about them. That is exactly the kind of change that ships only with
his words on record. Please add the § with his exact words and the scope (the two routes, migration 231, the reload keeping removals), as a
small docs patch to ship first. I am also asking Misho in my own chat to confirm.

### 10 Oct, 03:20Z — 1691 TESTED (box 50033)

The owner-named person ranked first on 2 goals, read on the proposed plan with nothing sent. With 49996 and 50030, every part of the DONE WHEN
holds. Board: 1691 → tested. Tonight's night list is all tested except the day items you hold.

### 10 Oct, 03:04Z — 0058 LIVE: 6e687a3 (1691 owner-named first + a read on a proposed plan), alone, outage 0

It applied clean on 6050fc1. The tester has your re-run steps.

### 10 Oct, 02:58Z — 0057 LIVE: 6050fc1 (fixture takes task_id), alone, outage 0; your step 3 clashes with the 404 on a proposed plan

Your steps went to the tester. Step 3 (read the ranking on the plan card, before approving) cannot work yet: the tester found the route
answers 404 „no plan with people“ while the plan is only proposed (49996, the SMALL). Fixing that SMALL makes your steps work as written.
Still open from 49996: the person the owner named first is ranked last (named_by_goal false).

### 10 Oct, 02:51Z — 1691 PARTLY: record order PASS, but a person the owner named first is ranked last (named_by_goal false)

> **box 49996, verbatim:**
> NEW TESTER CHAT #14 — status 02:50Z (tests of 49964).
> PASS 1690 SMALL (a86a6a6): fixture re-applied on 182305 / 182306, confirm card → „აღარ“ → „ახლა სად მუშაობს…“. „ახლა მზიანი სამართლის ბიუროშია.“ saved as „მზიანი სამართლის ბიურო“; plain „ოქროს აუდიტი“ saved unchanged. Goals stopped.
> 1691 with the new ranking read (ddb0e22) — PARTLY. Fresh owner 182434, 4 candidates tagged სანტექნიკოსი, records (yes of 10) set with the exact goal text before the goal: A 9, B 7, C 5, D 2.
> • Order by record: PASS. Goal 23961 ranking = A .83, B .67, C .50, D .25.
> • One record changed (D → 10 of 10) and re-read: D moved to 1st (.92), the rest kept their order. PASS.
> • Owner-named first: FAIL 0 of 1. New goal 23962, owner typed „…პირველ რიგში ციცინო ფილტრაძეს ჰკითხე, მერე სხვებსაც.“ The plan text even says she goes first, but the ranking has her named_by_goal false and LAST (4th, .50).
> • Small: wave-ranking returns 404 „no plan with people“ while the plan is only proposed — I could read it only after confirming, a few seconds before the sends. Reading a proposed plan would make the test safe.
> Both goals stopped. 1691 stays being_tested for the named-first part — please file / pass to the code session.


**Yours (1691):**
- **The FAIL:** „პირველ რიგში ციცინო ფილტრაძეს ჰკითხე, მერე სხვებსაც“ was in the owner's own goal line, and the plan text put her first. Yet
  named_by_goal was false and she ranked 4th. It looks as if named_by_goal does not read this form („პირველ რიგში X-ს ჰკითხე“), or reads only
  the goal title; that is my guess.
- **SMALL:** the ranking answers 404 while the plan is only proposed. A read on a proposed plan would let the tester check before anything is sent.
- This also settles my 02:36Z question: with fresh records, the ranking does read the right field.

### 10 Oct, 02:36Z — 1691: wave-ranking on goal 23926 ranks under a different field than the asks were filed under

My read-only check of `GET /admin/goals/23926/wave-ranking`:
- It returns field **„saklsi elektro gakvaniloba“** and 5 people, all with field_rate 0.333 and prematch „possibly“.
- In 49807 the tester read answerStats under **„elektrikosi saklsi gakvanilobis“** for the same kind of goal, and the fixture is filed by
  goal_text.

**Yours:** if the ranking derives its field from the goal differently from how the asks (and the fixture) file it, the ranking can never see
the records. Please check that both derive the field the same way. If they already do, tell me and I'll tell the tester it was only the recount.

### 10 Oct, 02:33Z — 0055 + 0056 LIVE: a86a6a6 (1690 SMALL) and ddb0e22 (1691 ranking read), each alone, outage 0

Both applied clean on dd2b785. The LIVE note carries your instructions for the tester. The queue is empty.

### 10 Oct, 02:10Z — 1690, 1697, 4226 TESTED; 1691 still can't be shown (needs a read of the server's ranking); a 1690 SMALL

> **box 49931, verbatim:**
> NEW TESTER CHAT #14 — status 02:10Z (tests of 49898).
> PASS 1690 (7c3bc9e) → tested. Fixture re-applied on 182305 / 182306, fresh conversations: confirm card came 2 of 2 („შენახული მაქვს: <name>, „<employer>“. ისევ ასეა?“ [კი, ასეა / აღარ / არ ვიცი]). „კი, ასეა“ → „კარგი, ასე დავტოვებ.“; „აღარ“ → „ახლა სად მუშაობს …?“ → answer saved (small: it saved my whole sentence „ახლა მზიანი სამართლის ბიუროშია.“ as the value, with „ახლა“ and the full stop).
> PASS 1697 (8403c22) → tested. Two fresh trios (182364–182366, 182367–182369), both sides „not notary“: request_introduction refused route_closed 2 of 2, no incoming request on any bridge or target, owner told the route did not work + offered another way 2 of 2, no „კითხვა არ გაიგზავნა…“. The plan-before-check day item stays as you said.
> PASS 4226 (c9b2b84 + dd2b785 fixture) → tested. Owner 182398 holds seat 182397 with old profile (ძველი ბანკი / მოლარე): first answer gave the old values; owner corrected to ბუღალტერი / მწვანე ფინანსები → correct_contact_fact ×2 + save_contact_fact ×2; then in fresh conversations the tag search and the profile read both show ONLY the new values.
> STILL CANNOT SHOW 1691: re-run with 6 candidates (owner 182405; records yes of 10: A 9, B 7, C 5, D 3, E 1, F 0, set before the goal, real-work goal). The model's plan named only 5 — it left out D (3/10) and kept F (0/10) — and all 5 went in wave 1 in parallel (C, A, B, E, F), so the ranking never had to drop anyone. So ranking is not visible through a plan the model writes. Could the wave note or an admin read show the server's ranked list for goal 23926? Then I can judge it without a 6th person. Goal stopped. 1691 stays being_tested.


**Yours:**
- **1691:** the model's plan picked 5 of 6 (it left out D 3/10 and kept F 0/10), so the server ranking never had to drop anyone. Please give an
  admin read, or a wave-note line, that shows the server's ranked candidate list for a goal (e.g. goal 23926), so the order can be judged on
  its own.
- **SMALL (1690):** on „აღარ“, the follow-up answer was saved whole as the employer value („ახლა მზიანი სამართლის ბიუროშია.“). Only the employer
  name should be kept.
- **Board:** 1690, 1697 and 4226 → tested.

### 10 Oct, 01:40Z — 0052, 0053, 0054 LIVE: 7c3bc9e (1690), 8403c22 (1697), dd2b785 (4226 fixture), each alone, outage 0

All applied clean on 955283c. The LIVE note carries your 1691 re-run design and the 1690 re-apply step for the tester (box 49898). The queue
is empty again.

### 10 Oct, 00:49Z — 1697 PARTLY: nothing sent (2/2), but trio 1 got the plan card and then the generic „not sent“ line

> **box 49809, verbatim:**
> NEW TESTER CHAT #14 — status 01:05Z, 1697 (955283c).
> PARTLY 1697 parts 1–2: two fresh trios (target 182312 / bridge 182313 / owner 182314; target 182331 / bridge 182332 / owner 182333), both target and bridge said „ნოტარიუსზე კითხვები ნუ მომიტანე.“ (saved), owner: „ნოტარიუსის საქმე მაქვს. გამაცანი <target>, <bridge> იცნობს.“
> • Not sent: 2 of 2 — request_introduction refused „route looks closed“, no incoming request on either bridge or target. PASS.
> • Owner line: 1 of 2. Trio 2 got „ეს გზა დახურულია, ამ გზით ვერ გაგაცნობ.“ + other ways (good). Trio 1 first showed the plan card, after „კი, გაუგზავნე“ the tool was refused twice (with find_warm_path between) and the owner got only „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე.“ — the generic failure line that invites a retry of a closed route, not the §110.1 line. Also on trio 1 the plan was proposed before the closed-route check ran (the check came only at send). 1697 stays being_tested; please look at the fallback line after a closed-route refusal. Goals stopped.
> STILL OPEN from 49807: 1690 FAIL 0/2, 1691 FAIL 0/1 — waiting for your look. 4226 — need an ally_account fixture route.


**Yours (1697):**
- On trio 1 the plan was proposed before the closed-route check, which ran only at send. After the refusal, the owner got „კითხვა არ გაიგზავნა.
  გთხოვ, თხოვნა კიდევ ერთხელ მომწერე.“, which invites a retry of a closed route.
- **Wanted:**
  - a closed-route refusal ends with the §110.1 line plus other ways, never the generic not-sent line;
  - ideally the check runs before the plan names that bridge.

### 10 Oct, 00:45Z — 1690 FAIL 0/2 (no confirm question), 1691 FAIL 0/1 (record not matched by field); 4226 needs a fixture; 4160 notes

> **box 49805, verbatim:**
> NEW TESTER CHAT #14 — status 00:40Z.
> TESTED: 4160 (e0410f2) PASS → task 4160 set tested (re-read: tested). Fresh seat 182304 with 4 tagged contacts, uploaded „name, need“ CSV (3 rows). Chat named electrician / lawyer / accountant contacts per row; the Excel (list.xlsx for that goal) has the new column „Netai: საჭიროებაში დაგეხმარება“ with exactly the same three names, row by row. Goal stopped. Two small notes, not blocking: (a) on the first turn the assistant did not build the list (no work_the_list, said „Excel a bit later“) — the file existed only after I asked again; (b) in the same rows the older columns say „შენს კონტაქტებში არავინ / გზა არ არის“ (about reaching the listed person), next to a column naming a helper — reads contradictory to an owner. Your call whether either is worth a SMALL task. 2347 phone check now goes to the next Ninia file.
> CANNOT TEST YET: 4226 — I have no way to give a fictional contact an old Ally profile (ally_account with occupation/employer). Is there a seat-only route or fixture for that? Then I run it at once.
> NOT MINE: §118 docs; 4225 loader (AXEL chat).
> WAITING: empty-account delete, 1690/1691 fixtures, 1697.

> **box 49807, verbatim:**
> NEW TESTER CHAT #14 — status 00:50Z (fixtures 73afae7).
> FAIL 1690 (stale-fact confirm): 0 of 2 since 73afae7. Seat 182305 (contact tagged auditor, employer fixture 200 days old) asked „who in my contacts is an auditor and where does he work“ → search_by_tag returned him, the answer relied on the old employer and only said „per the record of 24 March … could not confirm“ — no one-line confirm question, no yes / no / not sure taps. Seat 182306 (lawyer, employer fixture 250 days) — same: answer named the old employer „last confirmed 2 Feb“, no confirm question. Goals stopped. Please look at why the confirm question does not fire (fixture fields read? the trigger at use?) and file if it is a fault.
> FAIL 1691 (wave order): 0 of 1. Owner 182311 holds 4 candidate seats, all tagged „ელექტრიკოსი“, records set with the fixture for the exact goal text: A 182307 10/8 yes, B 182308 10/2, C 182309 10/5, D 182310 10/0 (no 9). Expected A, C, B, D. Asks went out C 00:41:35.554, B .773, A 36.415, D 37.108 — all prematch „possibly“ (label). And right after the send, answerStats on all four read asked 1 / yes 0 for field „elektrikosi saklsi gakvanilobis“ — the fixture records look gone or never matched that field. Goal stopped. Can you check whether the record is matched by field at send time? I re-run on fresh seats when you say.
> CANNOT TEST: 4226 (asked in 49805). NOT MINE: empty-account delete (deleting is never mine).
> NEXT: 1697 when LIVE.


**Yours:**
- **1690:** the stale-fact fixture is in place (200 and 250 days), and search returned the contact. The answer quoted the old date („…could not
  confirm“), but no one-line confirm question with yes / no / not sure was shown. Does the confirm trigger read the fixture's fields, and does it
  fire at the moment of use?
- **1691:** after the send, answerStats read asked 1 / yes 0 under the field „elektrikosi saklsi gakvanilobis“. The fixture record was either
  filed under another field or overwritten at once. The asks went out C, B, A, D, all „possibly“. Is the record matched by field at send time?
- **4226:** the tester has no way to give a fictional contact an old Ally profile (an ally_account with occupation / employer). Please add a
  seat-only fixture or name a route.
- **4160 notes, SMALL if you agree:**
  - (a) on the first turn the list was not built (no work_the_list, „Excel a bit later“);
  - (b) the old „არავინ / გზა არ არის“ columns sit next to the new helper column and read as contradictory.

### 10 Oct, 00:37Z — the whole night queue is LIVE (0044–0051), each alone, outage 0; the two empty accounts deleted

The container restarted at about 23:41Z, before anything had shipped. I rebuilt the chain, and it ran:

| Time | Commit | Patch | Board |
|---|---|---|---|
| 00:02 | ca31d5f | 0044, 3928 run 2 | tester PASS 2 of 2, tested |
| 00:11 | 2565cff | 0045, §118 | — |
| 00:15 | e0410f2 | 0046, 4160 | tester PASS, tested |
| 00:19 | c9b2b84 | 0047, 4226 | being_tested |
| 00:23 | 2b7c613 | 0048, 4225 loader | to_build until your load |

0048 note: migration 230 is applied, and there are 0 public_research rows.

**00:27 4a50eed, 0049 (§120/§121):**
- 181485 and 181488 deleted, 200 each. Re-read: gone.
- A DELETE on a test seat answered 409 „not empty (test_seats, UserPhone, token_transactions)“.

**Later ships:**
- 00:31 73afae7, 0050 (the 1690/1691 fixtures). The bodies went to the tester (49804).
- 00:35 955283c, 0051 (1697) → being_tested.

LIVE notes: box 49766, 49799, 49800, 49802, 49803, 49804 and 49806. The queue is empty; send the next one when it is ready.

### 9 Oct, 23:44Z — MTR #11 night reads: RW-009 PARTLY (Georgian quiet wake adds nothing), RW-014 no 24 h reminder, LM-011 0 signals

> **box 49699, verbatim:**
> MASTER TEST RUN — chat #11, night reads done (23:42Z). RW-009 PARTLY: the English owner's second quiet wake brought a new route; the Georgian owner's said only "still waiting" in new words, no new route, no question, two wakes running — line added to task 388. LM-011 day 2: still 0 ignored-question signals after 48 h. RW-014: no reminder at 25 h nor at 49 h for an untouched question (recorded on the open point — does the 24 h reminder still exist?). SA-006 26 h: PASS — the wake made no approve attempt, plan still proposed, 0 asks, it asked the owner one question. Also set up at 19:45Z: group F (Monday reads) on my seats 182048–182055 — please leave them untouched until Mon 12 Oct ~08:00Z; MO-007 PASS at set-up. Next reads: 10 Oct ~06:00Z, ~12:55Z, 22:31–23:35Z. Please keep a quiet window Mon 00:00–01:00Z and 05:30–06:30Z (weekly refill and summary).


**Yours:**
- **RW-009 / task 388:** the Georgian owner's second quiet wake only reworded „still waiting“. There was no new route and no question, and two wakes
  were running.
- **RW-014:** an untouched question got no reminder at 25 h or at 49 h. Does the 24 h reminder still exist, and if so, why did it not fire?
- **LM-011:** still 0 ignored-question signals after 48 h. Is that expected?
- **Quiet windows I hold:** Mon 12 Oct 00:00–01:00Z and 05:30–06:30Z. Seats 182048–182055 are not to be touched until Mon ~08:00Z.

### 9 Oct, 23:22Z — 1697 parts 1–2 FAIL: request_introduction ignores the D766 boundary on both sides; 374 seat part PASS

> **box 49667, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — thanks for 49666. Results:
> 1. 374 seat part PASS (fresh seat 182265): POST /contacts/import-vcf with 5 cards → imported 5; re-send with 6 → imported 1, unchanged 5; „ვცფ ტესტი 6 მყავს კონტაქტებში?“ → found. The real-phone part (new contact found within 5 min WITHOUT a file) stays for Ninia's phone.
> 2. 1697 parts 1–2 FAIL 1 of 1 (trio: receiver 182266, bridge 182267, owner 182268, conv 48680). Both receiver and bridge typed „ნოტარიუსზე კითხვები ნუ მომიტანე.“ in their own chats → save_user_note, replies „…კითხვები შენამდე აღარ მოვა.“ Then owner: „ნოტარიუსის საქმე მაქვს. გამაცანი თამარ გამოგონილი, ბექა გამოგონილი იცნობს.“ → request_introduction ok, the bridge received „…Netai Test 1697 owner-ს ნოტარიუსის საქმე აქვს და თამართან გაცნობა სურს. დაეხმარები?“ Expected (48562): both sides' own „not my field“ → not sent, owner gets one plain line and another way. Either the boundary saved as a NOTE is not read as a boundary by the prematch, or introductions skip the check. (The 3672/D766 boundary did block a direct ask earlier tonight, so ask_contact reads it; request_introduction seems not to.) Please file under 1697 (P2). Goal stopped.


**Yours (1697, P2):**
- Both sides' boundary was saved by save_user_note, and the replies said „…შენამდე აღარ მოვა“.
- request_introduction still went to the bridge. ask_contact reads the boundary (3672 tonight), so the introduction path likely skips the
  prematch/boundary check. That is my guess. Please read conv 48680.
- **0050** is queued after 0049 and the deletes.

### 9 Oct, 23:00Z — the tester needs four fixtures on fictional seats tonight (rule B); queue 0044–0049 from 23:57Z

> **box 49567, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — night rule B noted (D767 in our register). To run the plate rows that wait on setup tonight, please prepare on fictional seats (or tell me the route and I build them):
> 1. 1690 — one contact fact older than 180 days on a fresh seat (a back-dated fact row), so I can check the one-tap confirm at the moment of use.
> 2. 1691 — four fictional candidates with known answer records (asked / yes / no / speed), DONE WHEN 48528, so I can check the wave order.
> 3. 1697 parts 1–2 — the way to give both sides their own „not my field“ data (offer/boundary/note) so a request between them is not sent (48562).
> 4. 1882 / 374 — the seat route for a vcf phonebook upload (fresh-seat import), and how the new-contact card is triggered.
> Seat numbers I may use: any I make with the account maker.


**Yours.** For each, name the existing route if one exists. Otherwise send a fixture route limited to test seats (refusing any other account, like the
389 replay):
1. **1690:** a contact fact back-dated more than 180 days.
2. **1691:** four candidates with set answer records (asked / yes / no / speed).
3. **1697:** „not my field“ data (offer / boundary / note) on both sides.
4. **1882 / 374:** the seat route for a vcf phonebook upload, and what triggers the new-contact card.

**Queue:** 0044, 0045, 0046, 0047, 0048, 0049, each alone from 23:57Z, then the two deletes under §120.

### 9 Oct, 22:44Z — MISHO: „ცარიელი ანგარიშები წაშალე“ — delete the two empty accounts from the 11:23Z seat clash; I need a guarded route

Misho said it in my chat at about 22:43Z, verbatim: **„ცარიელი ანგარიშები წაშალე“** (delete the empty accounts). These are the two that your 0008
section named, **181485 and 181488**, both created at 11:23Z by the seat-maker clash.

**Checked by me, read-only, just now:** each has 0 numbers (UserPhone), 0 test_seats rows, 0 conversations and 0 threads.

**There is no admin route that deletes a user, and my DB access is read-only.** Please send a patch with a narrow route, e.g.
`DELETE /admin/users/:id/empty`:
- It deletes the User row only when the account has no number, no seat, no conversation, no thread, no task, no contact, no
  subscription/payment and no referral link. Any non-empty table means 409 with the table named, and nothing is deleted.
- It never runs on a test seat or a staff account, and it answers 404 for an unknown id.
- It records the deletion in the admin log.

I ship it alone and run it on these two ids only, with Misho's word above as the permission. Please also record it as a § in
ADMIN_WRITE_OPERATIONS with his words.

### 9 Oct, 22:39Z — MISHO'S NIGHT RULING: „B, შენი შეზღუდვით“ (Tornike's 49242) — the night is for building and releasing

Misho, in my chat at about 22:37Z, verbatim: **„B, შენი შეზღუდვით“**. Please record it the way you record his rulings (an ADMIN_WRITE_OPERATIONS § or
a D number), with this exact rule:
- **All night:** build → release → the tester tests → report → fix → release, for everything that needs no question for Misho. You do not wait for
  morning, and I ship each patch alone as it lands. Board writes and LIVE notes continue at night.
- **The limit (mine, accepted by Misho):** at night nothing ships that shows real people NEW text, deletes data, or widens access, unless Misho's yes
  is already recorded (a §). Such an item gets one clear question on the board, and work goes on with the next item.
- **Kept:** quiet windows around the tester's timed reads (tonight 22:15–23:55Z, no deploy), and no reminders to real people in their quiet hours.

So send patches as they are ready. The 3829 (a) prompt clause, the 4126 scope and the 4225 load stay with Misho, as they need his yes.

### 9 Oct, 22:25Z — 0041, 0042, 0043 LIVE; 0044–0047 queued for 23:57Z (after the tester's reads)

**Live, each alone, outage 0:**
- 21:57Z 72c0925 (2410), PASS 3 of 3.
- 22:02Z 25fd95b (4192), PASS 2 of 2.
- 22:07Z 1979913 (/billing/offer). I checked it: 5 and 20.

**Queued from 23:57Z, each alone:** 0044, 0045, then 0046 and 0047. All apply clean in that order.

**Board moves wait for 07:00Z** under night rule A: 2410 and 4192 → tested.

### 9 Oct, 21:46Z — 4060 TESTED; 3928 run 2 FAIL again (ask_contact refused „goal lives in another conversation“)

> **box 49441, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — tests of 49438:
> 1. 4060 (a) (bd1c845) PASS 2 of 2 (pairs 182199/182200 conv 48578, 182201/182202 conv 48580): owner typed „ნატას / სოფოს პასუხი დამეხმარა“ with the goal open → helper got „… გიხდის მადლობას დახმარებისთვის.“ once; NO „solved?“, no finish_task. The owner did get the goal's next step with buttons („გინდა, ვთხოვო ნატას, რომ გაგაცნოს ნინო ბერიძე? [ვთხოვო…/ჯერ არა/სხვა]“) — that is progress on the goal, not a thanks card, so I count it fine. 4060 → tested. SMALL typo in a relay: „…და ძალიან კარგადახასიათებს.“ (missing space).
> 2. 3928 run 2 (aeca088) 1 of 2 — FAIL again. Pair 182205 (conv 48585): ask_contact refused 3× „Nothing sent: that goal lives in another conversation … call create_task first“, then „ნოდარ ტესტაძეს უკვე გაეგზავნა კითხვა… ილია ტესტაძეს ჯერ ვერ მივწერე.“ → only one of the two asked (honest line, but X never asked). Pair 182208 (conv 48589): both asked, one combined line (accepted per your note). Caveat: in both pairs the first goal had already reached needs_you, not „working“. Goals stopped.
> 3. 4094, 3568, 4159 next.


**Yours: 3928.**
- 0039 let the name lookups through, but ask_contact then refused three times: „Nothing sent: that goal lives in another conversation … call
  create_task first“. The run never called create_task, and only one of the two people was asked.
- Please read conv 48585. A named „ჰკითხე X-ს და Y-ს“ in a new conversation must reach both people, whatever the first goal's state.
- **SMALL:** a relay typo, „კარგადახასიათებს“ (missing space).

**Board:** 4060 → tested.

### 9 Oct, 21:42Z — FOUNDER RULING D766 (3672): „don't bring me questions about X“ is a boundary; 3672 TESTED

> **box 49439, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — TORNIKE'S RULING on 49436 (3672), 01:39 Tbilisi: „1“ = (A). Recorded as D766: a person's „don't bring me questions about X“ is a boundary — questions on X do not reach him, the asker sees only „ამჯერად ვერ გავიდა“ (never why), and his own assistant tells him „questions about X won't reach you“, never „I'll answer for you“. Netai still never answers on anyone's behalf (D669). My 49336 run matches this → 3672 tested.


**For you:** record D766. What the code does today already matches it. The helper's own reply in 49336 was „…კითხვები შენამდე აღარ მოვა“, so
there is nothing to build. Board: 3672 → tested.

### 9 Oct, 21:40Z — 0037, 0032, 0038, 0039, 0040 LIVE, each alone, outage 0; Axel rows filed

**Live:**

| Time | Commit | Patch |
|---|---|---|
| 21:17Z | 586fda3 | 0037, 4094, carrying the §117 record (shipped first so the record was on main before the text) |
| 21:23Z | 67a7db7 | 0032, 3568 |
| 21:27Z | 0981726 | 0038, 4159 |
| 21:33Z | aeca088 | 0039, 3928 run 2 |
| 21:37Z | bd1c845 | 0040, 4060 a |

**Board:**
- 4094, 3568 and 4159 → being_tested.
- Filed **4225** (AXEL BASE LOAD, BIG, P2; nothing is loaded before Misho's own yes on a D44 entry, and only by day) and **4226** (48549).
- The 1882 note went to the tester.

**I missed your 20:22Z and 20:51Z sections for an hour.** Both came in under a pull I didn't read past the top section. I'm reading every
section newer than the pointer from now on, not only the top one.

**Night from 22:00Z:** rule A until Misho answers Tornike's question (49242). No deploys during the tester's 22:15–23:55Z reads.

### 9 Oct, 20:58Z — 3829 FU-07 night FAIL: no name follow-up + an answer delivered inside quiet hours; 4192 (a contact's role saved to the owner)

> **box 49369, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — 
> 1. 3829 FU-07 night part FAIL 1 of 1 (fresh pair 182166/182167, conv 48546, at 00:53 Tbilisi = inside quiet hours): helper answered vaguely „კი, ჩემი ბიძაშვილის ნაცნობი ბუღალტერია ერთი“ at 20:53:13Z → (a) NO name follow-up to the helper (change 114 / FU-02 behaviour missed, this helper was NOT over any cap — fresh seat), and (b) the answer was passed to the owner 26 s later, at night: „მოვიდა პასუხი: რეზო ტესტაძე: ბუღალტერს პირდაპირ არ იცნობს, მაგრამ მისი ბიძაშვილის ერთი ნაცნობი ბუღალტერია.“ Expected: the helper is asked for the name; nothing reaches the owner before morning. (c) In the helper's own thread a role-user line „(სისტემური შენიშვნა: შენ დაწერე, რომ კითხვის ავტორს გადაეცი, მაგრამ … send_answer_to_asker არ გამოგიძახებია …)“ is stored — please confirm the app never shows that system note to the helper. 3829 stays being_tested.
> 2. NEW SMALL (P2), found while setting up 3500: on seat 182168 „💙 ჩემი სტომატოლოგია, დაიმახსოვრე.“ (💙 = a saved contact) was saved as the OWNER's own profession/industry (update_user_profile profession „სტომატოლოგი“, industry „სტომატოლოგია“). After „არა, მე სტომატოლოგი არ ვარ. 💙 … ის არის ჩემი სტომატოლოგი“ it called update_user_profile again (9 tools so far). A contact's role must go to the contact, never to the owner's profile. Please file.


**Yours:**
- **(a)** Change 114 missed again. „ბიძაშვილის ნაცნობი ბუღალტერია ერთი“ is the same wording as 49006, and this time the helper was fresh and under
  every cap. So it is the wording, not the cap.
- **(b)** The owner got „მოვიდა პასუხი: …“ at 20:53:39Z, which is 00:53 Tbilisi, inside the users' quiet hours. Does a relayed answer bypass quiet
  hours by design, or should it be held until morning?
- **(c)** I confirmed it to the tester: the stored note is kind „event“, so it is hidden.
- **Board 4192 (P2):** „<contact> ჩემი სტომატოლოგია, დაიმახსოვრე“ wrote profession and industry to the OWNER's profile, twice.

### 9 Oct, 20:53Z — 3672 (D669): a helper's „answer for me that I don't know“ became a silent block on asks; a question for you/Misho

> **box 49336, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — 3672 (D669, automatic answers off) 1 run, pair 182145/182146:
> • Helper told his own assistant „თუ ვინმე მკითხავს, ბუღალტერს თუ ვიცნობ, ჩემ მაგივრად უპასუხე რომ არ ვიცნობ.“ → save_user_note, reply „დავიმახსოვრე. ბუღალტერთან დაკავშირებული კითხვები შენამდე აღარ მოვა.“
> • Owner: „ჰკითხე ზვიად ტესტაძეს, იცნობს თუ არა კარგ ბუღალტერს.“ → NO automatic answer was given on his behalf (good for D669), BUT the question never reached him either: ask_contact refused („…ამჯერად არ გაიგზავნა. მფლობელს უთხარი მხოლოდ: „ამჯერად ვერ გავიდა“…“), owner got only „ამჯერად ვერ გავიდა.“ The helper has 0 incoming conversations.
> D669 says the person is asked, not answered for. Here his note became a silent block. QUESTION for Misho's side: is „don't send me questions about X“ a boundary that may block (then the helper's reply should not promise „answer for me“ and 3672 passes), or must he still be asked under D669? Also SMALL: „ამჯერად ვერ გავიდა.“ alone is a cold reply. 3672 stays being_tested until you answer. Goal stopped.


**Yours:**
- Which rule does the code follow when a helper's note says „don't send me questions about X“: does it block, or is he still asked? Is
  that a ruling for Misho?
- If it may block, the helper's reply should not promise „answer for me“; it should say what will happen, so 3672 passes.
- If he must still be asked, the note must not refuse ask_contact.
- **SMALL:** the owner got only „ამჯერად ვერ გავიდა.“, which is cold.

### 9 Oct, 20:40Z — 3928 run 2 still 1 of 2 (the repeat-goal guard blocks named people); 2347 Excel ≠ chat → 4160

> **box 49306, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) —
> 1. 2347 Excel: GET /thread-files/goals/23728/list.xlsx (seat 182103) → 200, xlsx content type, 6,812 bytes, a valid workbook (sheet1 + shared strings), 6 rows = header + the 5 uploaded rows, columns name / need / Netai: გზა / ვისი გავლით / მდგომარეობა / პასუხი. The file part works. BUT the file does not match the chat answer: the chat said for 4 of 5 rows „შენს კონტაქტებში არის <contact>, მაგრამ Netai-ზე არ არის“, the file says „შენს კონტაქტებში არავინ / გზა არ არის“ for all 5. Please file SMALL P2: the Excel result must carry what the chat answer found. 2347: opening on a real phone + computer is a person step — it goes to Ninia's next file once the content matches.
> 2. 3928 run 2 (658a804) 1 of 2 — FAIL. Fresh trios, first goal still working, new conversation „სანტექნიკოსი … გამდის. ჰკითხე X-ს და Y-ს.“: pair 182137 (conv 48521) → nobody asked; search_contact_by_name refused twice („this message repeats open goal 23731“), then a check-back question „ეს სწორად გავიგე?“ with buttons. Pair 182140 (conv 48522) → both asked (1 incoming each), but ONE combined line „ტატო … და ვახო … მივწერე“, not one line per person. The repeat-goal guard still blocks the named people; please let a named „ჰკითხე X-ს“ bypass it. Goals stopped.


**Yours:**
- **3928:** 0035 fixed the „გამდის“ reading, but on pair 182137 (conv 48521) the repeat-goal refusal still blocked search_contact_by_name
  twice, then asked „ეს სწორად გავიგე?“. The tester asks that a named „ჰკითხე X-ს“ bypass the repeat-goal guard. Pair 182140 asked both, but in
  one combined line, where the DONE WHEN wants one line per person.
- **Board 4160 (P2):** the Excel rows say „შენს კონტაქტებში არავინ“ for all 5, while the chat named a contact for 4 of them. The file must
  carry what the chat found. The file itself downloads and opens: 6 rows, the right columns.

### 9 Oct, 20:33Z — 0035 + 0036 LIVE: 658a804 (3928 run 2) and 8c61738 (4093), each alone, outage 0; a false „not sent“ → 4159

> **box 49270, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — 3532 second seat (pair 182100/182101, conv 48452): inside an open „დურგალი“ goal, „სხვა საქმეც: ჰკითხე სანდრო ტესტაძეს, შაბათს ფეხბურთზე მოდის თუ არა.“ → ONE ask (18580, sent) and ONE incoming conversation — the duplicate is gone (2 of 2 seats now; DONE WHEN wants 3 pairs, third next). NEW SMALL FAULT, please file (P2, SMALL): ask_contact ok at 20:22:39Z, yet 13 s later the owner was told „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე.“ — a false „not sent“. Same line I saw on 3928 run 2 (there nothing was sent, so it was true). create_task also ran twice in that turn (20:21:57 and 20:22:22). Goal stopped.


**Yours, board 4159 (P2):** ask_contact returned ok and the ask was sent, yet the owner was told „კითხვა არ გაიგზავნა…“ 13 s later. create_task also ran twice in
the same turn (20:21:57Z and 20:22:22Z), so a second run is the likely cause, but that is my guess. Please read conv 48452.

**Also:**
- **Board:** 3665 → tested (tester 49303); 4093 → being_tested.
- **2347 Excel:** I told the tester the route is /thread-files/goals/:taskId/list.xlsx. They had tried /tasks and /goals.

### 9 Oct, 20:25Z — tester round on the „Our Claude“ rows: 2410 FAIL (speed), 4060 (a) FAIL, 1454 1 of 3; 0035/0036 shipping

> **box 49243, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — plate „Our Claude“ rows, round 1 (fresh seats 182068–182101):
> 1. 3004 PASS 3 of 3 (182070–182072): „<contact> <workplace>-ში მუშაობს, დაიმახსოვრე.“ → saved, reply „დავიმახსოვრე: …“, no question about where he works. → tested.
> 2. 3533 PASS 3 of 3 on three fresh trios (owners 182075, 182078, 182081): „ოk“, „ოკ“, „დიახ, გაუგზავნე“ each approved the waiting introduction plan at the first try; approve_task_plan ok + request_introduction ok. → tested. Goals stopped.
> 3. 2410 FAIL 3 of 3 on speed. „gamarjoba“ (Latin): 31.2 s and 24.7 s on two new seats (English answer — D505, no history, fine), and 31.0 s on a seat with Georgian history (answered in Georgian, by first name — language PASS). Same seat, „გამარჯობა“: 3.3 s, no tools. So Latin-letter hello still goes the slow path (get_user_notes / get_my_tasks / get_pending_updates). Keep 2410 to_build.
> 4. 1454 (intro plan one sentence) 1 of 3 clean tonight: run 1 added a long sentence before it („…ვერც შენს კონტაქტებში ვპოულობ… ერთადერთი გზა ბახვაა…“), run 3 started with a broken word „დელოდები შენს პასუხს.“ (typo + extra sentence). Run 2 clean. Running count now 4 of 8.
> 5. 4060 (a) — I count it as FAIL, not waiting: DONE WHEN says the owner sees no card or question; after „X helped“ the owner got „ამით საქმე გადაწყდა?“ with buttons, 1 of 1. Please fix: after an automatic thanks, do not ask „solved?“ in the same turn.
> Next: 3532, 3672, 3665, 3500, 2347, 1882/374 fresh seat, 1688, 1690, 1691, 1697, 1699.


**Yours:**
- **4060 (a):** the tester counts it as FAIL, against the DONE WHEN you wrote („the owner sees no card or question“). After an automatic
  thanks, do not ask „solved?“ in the same turn.
- **2410:** a Latin-letter „gamarjoba“ still takes the slow path (get_user_notes / get_my_tasks / get_pending_updates, 25–31 s), while
  „გამარჯობა“ takes 3.3 s. Back to to_build.
- **1454:** 1 of 3 tonight (an extra long sentence; the typo „დელოდები“). Running total 4 of 8.

**Board:** 3004, 3533 → tested. 2410 → to_build. 4060 stays being_tested.

**0035 and 0036** are shipping now, each alone. **Tornike's night-rule question (box 49242)** is with Misho in my chat.

### 9 Oct, 20:00Z — 0034 LIVE: 940d064 (GET /status/assistant), alone, outage 0; 3598 and 3994 TESTED

- No token gives 401 (checked by me). LIVE note: box 49237.
- **Tester 49215:**
  - 3598 PASS 3 of 3. SMALL, not filed: the English reply keeps the name in Georgian letters, and run 2 added „The question is already on its
    way … so that's covered.“
  - 3994 is not a fault: the tester's own admin reader strips links.
- **Board:** 3598 and 3994 → tested.
- **Still held:** 0032 (3568), waiting for Misho's yes.

### 9 Oct, 19:55Z — BIG from the founder: the research method for people (D757–D764), board 4126; 0034 ships ~19:55Z; 3994 asked

> **box 49213, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — NEW BIG ITEM from Tornike (23:48 Tbilisi, D757–D764). Please FILE it on the FIRST admin page, created by Tornike, for Giorgi to place (my task create is refused). Title: BIG — Research method for people (final).
> 
> THE METHOD (final, Lika + Tornike):
> 1. Who is researched: Netai users themselves (current and past work, affiliations, professional circles) and their professional contacts / contacts they mark as professional. Family and close friends are NOT researched just for being in a phonebook; if unclear, ask the owner.
> 2. Public member lists (a group's site): people may be stored even if no user knows them — only name, group/organisation, listed role, source, check date. Being on a list is never „knows the user“ and never an introduction route. Same-name check before merging. Deeper research only when the person becomes relevant to a request.
> 3. Facts from one source: may be shown as „possible“, labelled unconfirmed, with source and check date; matches built on them keep the doubt; conflicting sources both kept and the conflict explained; source quality, not count, decides (one official source can confirm).
> 4. Depth: as deep as possible — no cap on searches or facts.
> 5. When: a user is researched ONCE, at registration. After that Netai learns by asking him questions, not by researching again. No periodic re-check — Netai asks from time to time, e.g. „any news at work?“
> 6. A person can see and remove facts saved about them.
> 
> SPLIT (ours):
> • BUILD (code): one deep research run at registration; storage of list-found people with source + date + confidence (confirmed / possible) and same-name check; a page/command where a person sees and removes facts about themselves; the research limits removed for this run.
> • PROMPT: never treat list membership as acquaintance; say „possible“ with source and date for single-source facts; ask the owner when a contact's work status is unclear; occasional „any news at work?“ question to the user instead of re-research.
> 
> DONE WHEN: a fresh seat registers → its own work facts appear within the registration run, each with source and date; a member-list person is stored without any „knows“ link; a single-source fact is shown as possible with source/date; the person removes one fact and it is gone everywhere. 2 of 2.


**Filed as board 4126** (P1, to_build). **Before you build:** this widens what Netai researches and stores about people:
- deep research at registration, with no cap;
- storing people found on public lists whom no user knows.

Like D750/D755, that is an access widening, so it ships only with Misho's own yes on the exact scope (field list, list-people storage, the removal
page), plus the prompt texts under D44. Please draw up the exact scope for him.

**3994:** your 19:18Z question went to the tester (49212). **0034:** ships at about 19:55Z.

### 9 Oct, 19:36Z — 0031 LIVE (3567); **0032 HELD for Misho** (new crisis text to a person); tester #13 results; founder's find → 4093, 4094

**Ships:**
- **0031** went alone as c267d39 (verify 7,931), outage 0.
- **0033** (3598) is next. It applies cleanly without 0032 (bd71e021).
- **0032 (3568) is held.** It shows a person a new fixed text (112, „stay with them“, the psychologist offer) at the most sensitive moment, and
  I find no record of approval. Your own rule sends new text going to a real person to Misho first. I put the exact ka texts to Misho in my
  chat. If an approval already exists, tell me its §.

> **box 49207, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — tests of 49151 / 49171, fresh fictional seats 182034–182043, all helpers typed one Georgian line first.
> 
> 1. 3961 (ad2d960) PASS 2 of 2. „შეხვედრა დამინიშნე <X>-თან ხვალ 3 საათზე.“ → no plan card, X got one question about the meeting tomorrow 15:00, owner told. Owner line reads „<X>-ს ვკითხე…“ (not „…კითხვა გავუგზავნე“) — fine by me. SMALL: run 1 helper text „შეგიძლია ხვალ 3 საათზე შეხვედრა“ is a broken sentence (no verb, no question mark), run 2 was good. 3961 → tested.
> 
> 2. 4060 / D756 (c11ecb7): (a) owner typed „ლევანის პასუხი დამეხმარა“ with goal open → helper got „… გიხდის მადლობას დახმარებისთვის.“ PASS, BUT the owner was then asked „ამით საქმე გადაწყდა?“ with buttons [გადაწყდა/ჯერ არა/შევაჩეროთ] (finish_task refused „NOT CLOSED“, then present_choices). DONE WHEN said no card or question — is this „solved?“ question allowed (it is about closing, not thanks)? (b) after „მოგვარდა“ → thanks sent, goal done, no card PASS. (c) line typed twice → thanked once PASS. 4060 stays being_tested until you answer (a).
> 
> 3. 3928 (9c5f676) 1 of 2 — FAIL on run 2. Run 1 (first goal had already finished its search): new conversation „ელექტრიკოსი … ჰკითხე X-ს და Y-ს.“ → no plan card, both got the need, owner got one combined line „X-ს და Y-ს უკვე მივწერე…“ (not two lines). Run 2 (first goal still WORKING): new conversation „სანტექნიკოსი … ჰკითხე X-ს და Y-ს.“ → search_contact_by_name refused 4 times „Not searched: this message repeats open goal 23633…“, then „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე.“ Nobody asked. The repeat-goal guard must not block a direct „ask X and Y“ by name. Please file/keep under 3928 (P2, SMALL — area of the a2a big build). Conv 48361 on seat 182043.
> 
> All my test goals of this round are being stopped now.

> **box 49208, verbatim:**
> — tester (NEW TESTER CHAT #13, unnumbered) — FOUNDER'S FIND, from Giorgi's real account (screens, ask from Lika to Giorgi: introduce her to Tornike). Please file as two tasks, created by Tornike, P2:
> 
> A. BIG-area, SMALL fix — „leave me alone“ is not respected. 6 Oct Giorgi answered „არ მცალია დამანებე თავი“ (I'm busy, leave me alone). Netai said „პასუხი გაიგზავნა“, then on 7 Oct sent him another question from the asker's assistant, and on 9 Oct 11:56 a reminder. A busy / leave-me-alone / no answer must close the ask for that person: no follow-up, no reminder; the asker is told kindly that he can't now. DONE WHEN: a helper answers „არ მცალია, დამანებე თავი“ → 0 follow-ups and 0 reminders in 48h, asker told once (2 of 2).
> 
> B. SMALL — the reminder and follow-up texts are bad Georgian and not an assistant's voice (D659 warm human tone):
>  • reminder: „შეხსენება: Lika O. Ally-ის კითხვა ჯერ უპასუხოა, თუ ერთი წუთი გაქვს, პასუხი ძალიან გამოადგება. თუ არ იცი, ისიც მომწერე და აღარ შეგაწუხებ.“ — says the OLD name Ally, broken grammar, and the name differs from the header („Lika Ose“ vs „Lika O.“). Prompt blocks do not contain it, so it is a fixed text in code.
>  • follow-up: „გიორგი, არაუშავს, გეჩვენება როცა მოგეცლება? მხოლოდ იმის დასადასტურებლად მჭირდება, გინდა თუ არა თორნიკე აბულაძესთან გაცნობის დაწყება.“ — broken Georgian, robotic.
>  DONE WHEN: no „Ally“ word in any text a user receives; the reminder is written by the assistant in natural Georgian with one consistent name; read by Giorgi or Lika as fine.
> 
> C. The line „უბრალოდ მიპასუხე ამ თრედში, პასუხს მე გადავცემ.“ on that screen is from 5 Oct, before D707 (7 Oct) removed it. The 6 questions my tests sent tonight do not carry it, and no prompt block has it. Please confirm no code path still adds it (old asks re-sent as reminders included).


(The surname is redacted by me; it is a real person.)

**Yours:**
- **4060 (a):** after the automatic thanks with the goal open, the run asked „ამით საქმე გადაწყდა?“ [გადაწყდა/ჯერ არა/შევაჩეროთ]. Is that
  allowed under D756? It asks about closing, not about the thanks. Please answer for the tester.
- **3928 run 2 FAIL:** with the first goal still working, the repeat-goal refusal blocked search_contact_by_name 4 times, and nobody was asked
  („კითხვა არ გაიგზავნა…“). A direct „ask X and Y“ by name must pass that guard. Also, run 1 gave one combined line, not two (fine by the tester).
- **3961 SMALL:** a broken helper sentence in run 1.
- **Founder's find:** filed as board **4093** (A, leave-me-alone not respected) and **4094** (B, the reminder/follow-up texts and „Ally“).
  **C** is a question to you: does any code path still add „უბრალოდ მიპასუხე ამ თრედში…“, including old asks re-sent as reminders?
- **Board:** 3961 → tested.

### 9 Oct, 19:19Z — 0030 LIVE: 0c595c3 (log only), alone, outage 0

Applied clean on c11ecb7 (8b5ef555) and pushed at 19:17:56Z. I check its DONE WHEN in tomorrow's daily why.sh. The plan-JSON read is noted:
the model's own, and it recovers in the run.

### 9 Oct, 19:13Z — 0029 LIVE: c11ecb7 (D756, board 4060), alone, outage 0

- **Ship:** applied clean on 9c5f676 (259c2a02). The tester was warned for 19:05Z (49155) and did not hold. Pushed at 19:08:04Z.
- **Board:** 4060 → being_tested. LIVE note to the tester with your DONE WHEN (a)–(c).
- **The owner-notice question** (no line tells the owner the thanks went) is put to Misho in my chat.

### 9 Oct, 18:50Z — FOUNDER RULING D756: the thank-you goes automatically, no yes/no card (1692 follow-up) — board 4060, P1

> **box 49153, verbatim:**
> TESTER #12 — FOUNDER RULING D756 (22:44 Tbilisi), answer to 49107: „no, it should send thank you card automatically — to thank helper is very important and crucial. but avoid to waste users time. you dont need approval to send thank you. just do it automatically.“
> Meaning: whenever the owner says a helper's answer helped — in chat with the goal still OPEN („<helper>-ის პასუხი დამეხმარა“), when closing as solved („მოგვარდა“), or in the debrief — Netai sends the thank-you to the helper on the owner's behalf by itself. NO „მადლობა გადავუხადო შენი სახელით?“ [კი/არა] card, no extra question to the owner. This replaces the yes/no step of 1692 (§113.1). The approved wording of the thanks itself is unchanged. Please file/build it (1692 follow-up) and post LIVE with a DONE WHEN; the next tester chat tests it.


**Yours to build (board 4060).** Whenever the owner says a helper's answer helped, the thanks go out automatically, with no card and no extra
question. That covers three paths: chat with the goal open, a close as solved, and the debrief. It is once per ask, and the approved wording is
unchanged. This reverses §113.1's card. Please record D756 the way your rules record founder rulings, and say whether it needs Misho's word
on top of Tornike's before it ships.

**Also MTR #10 started 18:41Z (box 49152):** timed reads tonight at 22:26Z, 22:37Z, 23:37Z and ~23:40Z, plus new-member re-runs now. The tester
says deploys during the re-runs are fine. I hold during the timed reads.

### 9 Oct, 18:47Z — daily check: propose_task_plan arrives as broken JSON (4 times in 24h, all test seats); everything else is guards working

From `why.sh --new 1` (threw.sh 1440 is silent). There are 32 first-time reasons, all from test seats, and nearly all are guards doing their job:
- receiving caps, with „ბოლო 24 საათში“;
- repeat-goal refusals;
- D648 praise;
- facts lost in send_answer_to_asker;
- the introduction already accepted.

**One looks like a real fault, yours:**
- `propose_task_plan` — „the plan arrived as TEXT that is not valid JSON … it was probably cut off“, four first sightings:
  - 8 Oct 19:09:14Z: „Unexpected token � at position 377“, 750 chars
  - 8 Oct 21:45:36Z: „Unexpected token : at position 168“, 288 chars
  - 9 Oct 07:39:06Z: „Unexpected token � at position 953“, 2,166 chars
  - 9 Oct 09:01:30Z: „Unexpected token 折 at position 245“, 1,065 chars
- A replacement character and a CJK character in the middle of a Georgian plan point at something breaking the text mid-stream (a multibyte
  split across chunks, or the model's own garbling), not at a short output limit. 750 and 288 chars are far below any cap.
- Please read one of these runs (`why.sh 2 propose_task_plan`) and say whether the plan's arguments are assembled from streamed fragments.

Also new, for the record: one `save_offer` decline from 09:38Z has „no reason recorded — the row predates migration 148“. Migration 148 has been
live for days, so a 9 Oct row without a reason is odd. Please check which save_offer path writes no reason.

### 9 Oct, 18:41Z — 0027 + 0028 LIVE: ad2d960 (3961) and 9c5f676 (3928), each alone, outage 0

- Both applied clean on fd6907a. The tester was warned for 18:30Z (49150) and did not hold.
- Board: 3961 → being_tested; 3928 stays being_tested.
- The tester was told the corrected 3928 DONE WHEN (no plan card, both asked); one goal vs two waits for Misho.
- I missed your 17:56Z section on the first pass because it came in after my 17:47Z read. It was handled with this ship.

### 9 Oct, 18:15Z — 1850 TESTED (box 49148)

Card 826 was snoozed at 16:07:42Z, due 18:07:42Z, and sent again at 18:08:24Z with snoozes 1. The same 3 held asks were on the screen and no question was
duplicated. The real-account 403 was checked by me (49045). Board: 1850 → tested.

### 9 Oct, 18:09Z — 3928 FAIL (BIG): the second conversation opened a second goal and a plan; the direct ask route did not run

> **box 49146, verbatim:**
> TESTER #12 — 3928 (e4d7922) DONE WHEN run (GP-052 step 3 shape), 0 of 1, 17:57–18:06Z. Fresh fictional owner 181941 holds helpers 181939 „ლაშა მილიძე“ and 181940 „დათო ტრუბაძე“.
> Step 1: conv 48288 „კარგი ელექტრიკოსი მჭირდება საბურთალოზე, ბინაში გაყვანილობა უნდა შევცვალო.“ → goal „ელექტრიკოსი საბურთალოზე გაყვანილობა“, needs_you.
> Step 2: NEW conv 48289 „კარგი ელექტრიკოსი მჭირდება საბურთალოზე, ჰკითხე ლაშა მილიძეს და დათო ტრუბაძეს.“ → a SECOND goal „ელექტრიკოსი საბურთალოზე, ლაშა მილიძე და…“ (needs_you), tools: search…, search_contact_by_name ×2, propose_task_plan, present_choices — a plan „ორივეს ვკითხავ… დავიწყო?“ instead of the direct ask. No asks sent (owner asks list empty), no „…კითხვა გავუგზავნე“ lines. Expected per 49141: one goal, both asked, two sent-lines.
> Earlier run 1 (need + names in one line, 181938): plan then both asked after „ვადასტურებ“ (task 23530) — works, but via the plan, not the new direct route. Since e4d7922: direct route 0 of 2. BIG — please check the run log (did the „ჰკითხე X-ს და Y-ს“ route fire at all?). 3928 stays being_tested. All three goals stopped.


**Yours.** Please read the run in conv 48289 and say whether the instruction reader saw „ჰკითხე ლაშა მილიძეს და დათო ტრუბაძეს“. These names have
no hyphen and use full surname datives („მილიძეს“, „ტრუბაძეს“), unlike your test's „დამხმარე-ას“ shape; that is my guess, not a reading.
Also, why did the repeat-goal check not catch the second goal? The first goal's title is „ელექტრიკოსი საბურთალოზე გაყვანილობა“.
It is not a regression (run 1 still asks both through the plan), so no revert.

### 9 Oct, 18:05Z — 0025 + 0026 LIVE: 4944de5 (3897) and fd6907a (1850 SMALL), each alone, outage 0

- Both applied clean on e4d7922. The tester was warned for 17:55Z (49142) and did not hold. Board: 3897 → being_tested.
- The FU-06 questions went to the tester (where the „?“ was missing; D647 for answers goes to Tornike).
- Tester v387 (49143): 3796, 389 and 3896 tested; 3928's first run asked both, an exact re-run is pending.

### 9 Oct, 17:41Z — 0024 LIVE: e4d7922 (3928), alone, outage 0; 3896 and 389 TESTED

- **0024:** applied clean on 3497daf (be4b915c). The tester was warned for 17:35Z (49139) and did not hold. Board: 3928 → being_tested.
- **Tester 49140:** 3896 PASS 1 of 1. A fresh seat with „იპოვე … ჩემს ნაცნობებს ჰკითხე“ opened a goal; it had no contacts to ask. 389 PASS: card 29932
  names „მაკა ანგარიშიძე“. Both → tested. The 1692 question is with Tornike (49107).

### 9 Oct, 17:26Z — 0023 LIVE: 3497daf (3896), alone, outage 0

- Applied clean on main 416e573 (7f080aa0). The tester was warned for 17:20Z (49109) and did not hold. LIVE note: box 49138.
- Board: 3896 → being_tested.

### 9 Oct, 16:36Z — 0022 LIVE (416e573); 389 replay 0 cards, fixture had a profession tag; a SMALL

- **0022:** went alone at 16:25Z after I warned the tester (49046), who did not hold. DEPLOYED 416e573, outage 0.
- **Outage note:** the one error in the window is the 16:02Z cut I already reported.

> **box 49072, verbatim:**
> TESTER #12 — 389 replay (46c518a), 0 cards in 2 runs, 16:26–16:33Z; I may have the fixture wrong, please say what "fits".
> Fixture (all fictional, mine): owner 181836 opened a goal „ბუღალტერი მჭირდება ჩემი პატარა კომპანიისთვის თბილისში, თვეში ერთხელ დეკლარაციებისთვის…“ (conv 48214); new seat 181869 „ნანა ანგარიშიძე“; owner's phonebook got her number as „ნანა ანგარიშიძე ბუღალტერი“, tag „ბუღალტერი“ (POST contacts 201).
> Replay 1 (goal still searching) → 200 {cards_queued:0, "Nothing matched, or every match had already been raised once"}. Replay 2 (goal at needs_you with a plan) → same, 0. No card in the owner's conversation.
> Questions: does the hook need the contact to exist BEFORE the seat registers, or a profile/offer on the new member, or a goal in a later state? If my fixture is wrong I will rebuild it.
> SMALL seen in the same plan: „შენს ქსელში ამ ეტაპზე ბუღალტერი … ვერ გამოჩნდა“ and two lines later „ნანა ანგარიშიძის ასისტენტს დაველაპარაკები“ — it says none found, then names her. Goal stopped. 389 stays being_tested.
> Thanks for the 1850 real-account 403 (49045).


**My answer (from main):** D498 counts only an employer-field tag that the goal names, and „ბუღალტერი“ is a profession, so 0 cards is by
design. I told the tester to rebuild with a company named in the goal and the contact tagged with that company as employer.
- **Question for you:** how does a seat set the employer field through POST contacts? Please give the exact body.
- **SMALL, yours:** in the same plan the reply says no accountant was found in the network, then names „ნანა ანგარიშიძის ასისტენტს დაველაპარაკები“
  two lines later.

The 3796 buttons SMALL is noted. I passed your read to the tester and left the server-added button to them.

### 9 Oct, 16:15Z — 3796 TESTED; 1850 admin read + snooze PASS (403 on a real account checked by me); a 3796 SMALL

> **box 49044, verbatim:**
> TESTER #12 — results on 49039 (16:07–16:10Z).
> PASS 3796 onboarding (3c9e45c), 2 of 2 fresh seats (greeting, then offer + „დაიმახსოვრე როგორც შეთავაზება“): both asked to confirm instead of claiming („…დავიმახსოვრო შენს შეთავაზებად… სწორია?“ / „შევინახავ ასე: … ასეა სწორად?“ with buttons); after „კი“ save_offer ran, „შენახულია / დამახსოვრებულია“, offers list 1 each. With the older-seat PASS at 15:34Z → 3796 tested. SMALL: on the first seat save_offer failed once (no error text) before the confirm question, and that question came without buttons.
> 1850 card (5eeacc6): GET /admin/users/181646/evening-card → 200, card 826, sent 15:00:51Z, 3 held asks on the screen (bookkeeper marked answered), snoozes 0. POST …/826/snooze → 200, due_at 18:07:42Z, snoozes 1. I will check its return after 18:08Z. I do not run the real-account 403 step (my rules keep me off real accounts) — please check that one yourselves. 1850 stays being_tested until the return.
> Noted: the double owner line is the approved 1687 disclosure line — I stop calling it a fault.


- **Board:** 3796 → tested.
- **1850's 403 step (mine):** POST /admin/users/501/evening-card/999999999/snooze returned 403 „მხოლოდ სატესტო ანგარიშზე“. I used a card id that
  does not exist, so nothing could change.
- **SMALL, yours (3796, first seat):** save_offer failed once with no error text before the confirm question, and that question came without
  buttons. Please read that run.

### 9 Oct, 16:12Z — a deploy swap cuts a run that starts in the build window (my 3c9e45c cut one; ship_one can't see it)

- **What happened.** Pushed at 15:58:26Z; the new container started at 16:00:12Z. The tester's seat 173356, thread 29079, sent a message at
  16:00:08Z, which reached the old container. At 16:02:16Z `[run-reaper] reaped 1 orphaned run(s)`, and the person got the kind 'error' line
  „ტექნიკური შეფერხება მოხდა…“ at 16:02:15Z. outage.sh counted it as 1 error with replies flowing (rc 0). I told the tester (49042).
- **Why ship_one can't prevent it.** It waits for quiet before the push, but the swap comes about 2 minutes later, and anything that starts in
  that window dies with the old container.
- **Ask, yours (product code):** at SIGTERM, have the old container stop taking new runs and finish the ones in flight before it exits, within
  Railway's drain time (or hand them over cleanly, so a run is never left for the reaper). Until then I ask the tester for a quiet window when
  they are mid-test.

### 9 Oct, 16:02Z — 0020 + 0021 LIVE; FU-07 0 of 1: is it the cap (D748) or change 114's wording? Please read the run

- **Live, each alone, outage 0 each:** 5eeacc6 (0020) and 3c9e45c (0021). LIVE note: box 49039.
- **Checked by me:** GET /admin/users/181646/evening-card reads card 826 with 3 asks, snoozes 0.

> **box 49006, verbatim:**
> TESTER #12 — FU-07 (D748, caps) 0 of 1, 15:51Z. Helper 181646 „თინა საღამოშვილი“ (fictional, mine) received 5 relayed questions today (13:39Z ×2, 15:01–15:02Z ×3 from the evening sweep), so she is over relay_messages_per_person_per_day 4. In the bookkeeper conversation 48122 she answered „კი, ჩემი ბიძაშვილის ნაცნობი ბუღალტერია ერთი“ — a person given only by relation, the change-114 case. Expected (D748 + change 114): one short question for the name in her own conversation, not counted against the cap. Got: no question, tool send_answer_to_asker, „მადლობა, პასუხი გაიგზავნა.“, and the asker (conv 47996) got „ბუღალტერს პირდაპირ არ იცნობს, მაგრამ მისი ბიძაშვილის ნაცნობებში არის ერთი ბუღალტერი.“ without a name.
> Two possible causes — please check the run log before anyone calls it a regression (D710): (a) the cap still blocks own-thread follow-ups, against D748; or (b) change 114 missed this wording (ბიძაშვილის ნაცნობი ბუღალტერია). Since change 114: 2 of 3 overall (the two nanny pairs passed, both under the cap). Please file whichever it is; BIG if (a). 3829 stays being_tested. Quiet hours part of FU-07 runs after 19:00Z.


**Yours: read the helper's run in conv 48122.** Was the follow-up blocked by relay_messages_per_person_per_day (BIG, against D748), or did
the model read „ბიძაშვილის ნაცნობი ბუღალტერია“ as clear enough (change 114's wording)? Please say which, with the run id. Filed under 3829.

### 9 Oct, 15:42Z — change 114 PASS 2/2; 3796 PASS in quick_answer, **FAIL again in onboarding (BIG)**

> **box 48975, verbatim:**
> TESTER #12 — results on 48974 (fresh fictional seats, 15:32–15:40Z).
> PASS change 114 / FU-02, 2 of 2: two fresh pairs, owner asks for a nanny in Vake; each helper answered „კი, ჩემი დეიდაშვილის ძიძა იყო ერთი“ → helper's assistant asked one short question for the name („მისი სახელი ან საკონტაქტო გზა რა არის?“ / „სახელი თუ გახსოვს, მომწერე.“), and nothing reached either owner (their last lines are still „ვკითხე …“). With 48843/48844/48848 FU-02 is now 2 of 4 since 13:24Z, 2 of 2 since change 114. 3829 stays being_tested only for FU-07 (caps / quiet hours), which I run next.
> 3796 (aba9e89) 1 of 2:
> • older seat, quick_answer, new conversation: PASS — „შეთავაზება ჯერ არ შემინახავს. დამიდასტურე და ახლავე შევინახავ.“ [კი, შეინახე / სხვა] → tapped კი → save_offer ran, „შენახულია: …“, offers list now 1.
> • FRESH seat, second message after a greeting, run_mode onboarding: FAIL — „დავიმახსოვრე: იურიდიული კონსულტაცია …“, no tool calls, offers list 0 (15:34:02Z). The guard does not cover onboarding yet. BIG. 3796 stays being_tested.
> SMALL again in both helper questions: „<name>-ის ასისტენტი, <name>-ის სახელით“ (duplicate owner line). Both nanny goals stopped.


**Yours: 3796, onboarding.** On a fresh seat, in the second message after a greeting, the reply was „დავიმახსოვრე: იურიდიული კონსულტაცია …“ with no
tool call (15:34:02Z). My reading, not checked against the run: the reply never names an offer (neither „თავაზ“ nor „შეთავაზ“), so a guard
that needs the offer word in the reply cannot fire. A reply that claims a save („დავიმახსოვრე“) after an owner line asking to save an offer, with
save_offer not run, may be the right condition. Please read the run.

**SMALL:** the duplicate owner line again, in both helper questions.

### 9 Oct, 15:30Z — 0017, 0018, change 114 and 0019 LIVE; MTR #9 closed, with an RW-016 date fault

**Live, each alone, outage 0 each:**
- 0625ea4 (0017, 3862) · 333792d (0018, §114 docs)
- **prompt.sh apply 114** about 15:23Z: ask_main f8e53190 → fd09740d, read back
- aba9e89 (0019, 3796 verb)
- LIVE note: box 48974. Board: 3862 → being_tested.

> **box 48973, verbatim:**
> MASTER TEST RUN — chat #9 CLOSED (15:27Z). Correction for 1850: at 11:53Z I wrote that capped questions are not held; that was wrong. Helper 181505's 3rd and 4th questions (goals 23211, 23212) went out at 15:01:33Z / 15:01:47Z as two new conversations, and each asker got 'question reached her'. The held question simply has no ask row until it is released. Correction line added to task 1850. Also RW-016 day 2 (seat 180150): the open-goals list called a 9 Oct job 'tomorrow, 10 October' — one sighting, repro set on seat 181572 for a read 10 Oct ~12:55Z. All my goals are stopped except that repro. Next master-run chat starts from the 09 Oct 19:30 handover.


**Yours: RW-016.** The open-goals list called a job dated 9 Oct „tomorrow, 10 October“. It is one sighting so far. The tester set a repro on seat 181572
for a read on 10 Oct at about 12:55Z, so please don't change that seat's goals. A Tbilisi-vs-UTC day boundary is my guess, not something I have checked.

### 9 Oct, 15:09Z — 1850 evening card: the release works, but nothing lets the tester read or snooze the card; two SMALLs

> **box 48942, verbatim:**
> TESTER #12 — 1850 evening card read, 15:04Z (fixture built 13:40Z, helper 181646 „თინა საღამოშვილი“, 3 asks held).
> 1) The 3 held questions WERE released at 19:00 Tbilisi: three separate incoming_ask conversations at 15:01:59, 15:02:09, 15:02:23Z (bookkeeper, plumber, lawyer), each with [კი, ვიცნობ / არა, არ ვიცნობ / მოგვიანებით გიპასუხებ]. Nothing came during the day — good.
> 2) But I see NO single evening card that carries the 3 together and has ONE snooze. Through the admin view of her conversations there is no card at all (her own conv 47995 only has the greeting). If the card lives only in the updates feed, I cannot read it (I never call a seat's GET /updates) — please tell me how to see it through the admin, or confirm the design is now "release as separate asks at the evening time". Not snoozed, so the 17:05Z return check has nothing to check yet. 1850 stays being_tested.
> 3) 2184: none of the three released questions contains a „thread“ line. PASS for 2184 on what I can see — will PATCH once you confirm the card question in 2).
> 4) Closed/stopped goals: helper 180921 got nothing new after 00:49Z (closed goal 46809's held ask was NOT delivered) and 180455 nothing after 8 Oct 18:06Z (stopped goal 46861's held ask NOT delivered). PASS.
> SMALL again in all three: question ends „<name>-ის ასისტენტი, <name>-ის სახელით“ (duplicate owner line), and the bookkeeper one is worded as a statement („ხომ არ იცნობს კარგ ბუღალტერს.“ — third person, full stop).


**What I read (read-only):**
- Card 826 for seat 181646 was sent at 15:00:51Z with 3 asks and snoozes 0. So the release and the single ring are right.
- The card is only the seat's /evening-card screen. The tester never calls seat GETs, so the card and its one snooze cannot be checked.

**Please build:** an admin read of one user's evening card (the items as the screen shows them, sent_at, snoozes), plus a way to snooze it on a
fictional seat only (like the 389 replay guard). The 17:05Z return check can then run on 1850.

**SMALL (both seen again):**
- „<name>-ის ასისტენტი, <name>-ის სახელით“ appears twice in all three asks.
- The bookkeeper ask is a third-person statement: „ხომ არ იცნობს კარგ ბუღალტერს.“

### 9 Oct, 15:06Z — TESTER #12 on 48908: 1692 PASS (tested), D752 PASS (board 4027), 3796 FAIL in quick_answer too

> **box 48940, verbatim:**
> TESTER #12 — results on 48908 (fresh fictional seats, 14:58–15:07Z).
> PASS 1692 (b5495bb) 1 of 1: helper answered, owner typed „მოგვარდა“ → „ლევან ხელოსანაძეს მადლობა გადავუხადო შენი სახელით“ [კი/არა]; goal done; tapping კი → helper got „მარიამ მიზნიძე გიხდის მადლობას დახმარებისთვის.“ and the owner got the private „ისევ მიმართავდი…?“ question. 1692 → tested.
> PASS D752 (c876dd9) 1 of 1: „მომწერე ინგლისურად“ → English ack, then „კარგი“ and a Georgian question both answered in English (2 next, not 3 — I switched back one turn early); „ახლა ქართულად მომწერე“ → „კი, ნინო. ამიერიდან ქართულად მოგწერ.“ Please give me its task id to PATCH.
> FAIL 3796 (a95bbf9 + a6f74d2) 0 of 1 in quick_answer mode too: the 48569 turn-2 line on an older seat, new conversation 14:58Z → „დავიმახსოვრე: …“, no tool calls, offers list empty. So both onboarding AND quick_answer bypass save_offer and the guard. BIG — please add quick_answer to the gap with the code session.
> SMALL seen again: the helper's question ends „მარიამ მიზნიძის ასისტენტი, მარიამ მიზნიძის სახელით“ (duplicate owner line).
> Next: 389, 3863, 3895; FU-07; 1850 evening card.


- 0017, 0018 and 0019 applied clean on adea07d (07c7a527 / 041d5bd8 / 41fdb381). They ship from 15:10Z, with change 114 after 0018.
- I told the tester that 0019 (the „თავაზ“ root) is the fix for this FAIL too, since its reply was „დავიმახსოვრე: …“ with no tool call. If the
  quick_answer run has no guard at all, tell me now. Please read its run (an older seat, a new conversation at 14:58Z).
- **SMALL, yours:** the helper's question ends „<owner>-ის ასისტენტი, <owner>-ის სახელით“, so the owner line appears twice.
- **Board:** 1692 → tested. New row 4027 = D752, being_tested.

### 9 Oct, 14:55Z — 0009–0016 LIVE; 0017 held to 15:10Z (tester's evening card); **0018 does not apply on main — please re-cut**

**Live, each alone, outage 0 each:**
- 14:13Z a95bbf9 (0009) · 46c518a (0010) · c876dd9 (0011) · e7a61d6 (0012, §113 docs)
- a6f74d2 (0013) · b5495bb (0014) · 30054b6 (0015) · ~14:50Z adea07d (0016)
- LIVE note: box 48908. Board: 3796, 389, 3863, 3895 → being_tested.

**0017 (3862):** clean on main adea07d as 07c7a527. It ships after the tester's 15:00Z evening card, about 15:10Z.

**0018 (§114 + change file 114):** `git am` on main adea07d fails with `patch failed: docs/ADMIN_WRITE_OPERATIONS.md:6100`. Your note says it also
brings the §113 record (18e2874), but §113 is already on main from 0012 (e7a61d6, „docs(admin): §113 — thank card on a solved goal;
save_offer yes sentence“), so the two clash. I do not hand-resolve. Please send 0018 cut on main adea07d (or on 07c7a527 after 0017),
with only §114 + change file 114. I apply 114 with prompt.sh as soon as it is on main.

Read and noted: 14:07Z (3961 waits for Misho's line, 3896/3928 next, 3862 = 0017), 14:12Z (my answer on the hidden note confirmed),
14:23Z (0017), 14:27Z (conv 48017).

### 9 Oct, 14:33Z — TESTER #12: 3796 guard misses onboarding mode (FAIL); 1692 retest was ahead of 0014

> **box 48874, verbatim:**
> TESTER #12 — two retests after 48845/48847, both FAIL.
> 1) 1692 thank card (fictional owner seat, own thread 47587). Typed „ნატოს პასუხი დამეხმარა — ზაზამ ონკანი შეაკეთა, ძალიან კმაყოფილი ვარ.“ Reply 14:24Z: „მშვენიერია. ნატოს რეკომენდაცია გამოგადგა…“ — no thank card, no choices, outcomes unchanged (no debrief outcome recorded). run_mode = quick_answer, so it looks like that turn never reached the tools. Ask was answered 10:19Z today (fresh, not 3-day) — if the card only fires on the debrief path, say so and I will retest with an old answer.
> 2) 3796 offers (fresh fictional seat, thread 48049, second message after a greeting). Typed an offer + „დაიმახსოვრე როგორც შეთავაზება.“ Reply 14:24Z: „დავიმახსოვრე: შენ სხვა წევრებს სთავაზობ იურიდიულ კონსულტაციას…“ — offers list still EMPTY at 14:26Z. run_mode = onboarding. Guard a95bbf9 did not stop the false „დავიმახსოვრე“. Guess: onboarding mode has no save_offer tool and no guard. Both tasks stay being_tested.


**3796 is yours, a FAIL.** On a fresh seat in run_mode onboarding, the false „დავიმახსოვრე“ went out and the offers list stayed empty, with a95bbf9 live.
The guard (and save_offer?) does not reach the onboarding run. A fresh seat's first real message is exactly where an offer is stated, so that run
needs to be covered.

**1692:** I told the tester (48875) that a „helped“ typed in chat works only through the debrief (3 days) or, once 0014 is live, through a solved
close. There is one open question for you, and Misho's if it is a product call: the owner wrote „ნატოს პასუხი დამეხმარა“ in their own thread,
outside any debrief and with the goal still open, and the run was quick_answer. Should that offer the card?

**Ships so far:** 0009 a95bbf9 · 0010 46c518a · 0011 c876dd9 (D752) · 0012 e7a61d6 (§113 docs), all outage 0. 0013–0016 are going now.

### 9 Oct, 14:16Z — 3829 round 3: FU-02 now 1 of 3 (unnamed person passed on without a question); FU-06 SMALLs

> **box 48848, verbatim:**
> TESTED 3829 (D746), round 3 — fresh pairs, 14:06–14:12Z:
> • FU-02 run 3 (181658/181659, conv 48017): „კი, ჩემი დეიდაშვილის ძიძა იყო ერთი, კარგი ქალია.“ (no name) → NO follow-up; the server's correction note fired, then the answer went as is; owner: „ჰყავს ერთი ძიძა, დეიდაშვილის მეშვეობით იცნობს…“. FAIL. FU-02 is now 1 of 3 since 3829 (runs 47991 FAIL, 47994 PASS, 48017 FAIL). Pattern: an answer that describes a person without naming them („ბიძაშვილის ნაცნობი“, „დეიდაშვილის ძიძა“) is passed on without asking who; only „ის ბიჭი, ვაკეში რომ ცხოვრობს“ got the question. Please file under 3829 (Pr2): „a yes that points at an unnamed person gets one short question for the name before anything goes“ — and read the run for conv 48017.
> • FU-06 asker writes again (181660/181661, conv 48014/48016): the owner's second question „ჰკითხე ბაჩოს, ზაზა შაბათსაც მუშაობს თუ არა.“ reached the SAME helper thread, the helper's tap came back to the owner. PASS 1/1. Two SMALL points: (1) the helper read it as a statement — „…კიდევ დაწერა: ზაზა შაბათობითაც მუშაობს“ (no question form, no „?“); (2) the owner got the tap in quotation marks „კი, შაბათსაც მუშაობს"“ (D647: no quotations).
> Totals since 3829: FU-01 1/1, FU-02 1/3, FU-03 1/1, FU-04 1/1, FU-05 9/9, FU-06 1/1, FU-08 1/1, D751 1/1. FU-07 (caps / quiet hours) still to run. 3829 stays being tested. Goals stopped.


Your fix, from the above (the tester asks for it to be filed under 3829, Pr2): **„a yes that points at an unnamed person gets one short question
for the name before anything goes.“**
- Both FAILs had the same pattern: „ბიძაშვილის ნაცნობი“ and „დეიდაშვილის ძიძა“ describe a relation, not a name.
- In conv 48017 the server's correction note fired, and the answer then went on as is. Please read that run.
- **SMALL (FU-06):** the owner's question reached the helper as a statement, with no „?“. The tap reached the owner in quotation marks (D647).
- **Ships:** a95bbf9 (0009, 3796 guard) went live at about 14:13Z, outage 0. 0010–0016 are shipping one at a time now and will be in my next
  section. I stop before 14:50Z for the tester's 15:00Z evening card.

### 9 Oct, 13:58Z — afternoon-1250 all LIVE, each alone (outage 0 each); 3829 tested: FU-02 run 1 FAIL + SMALLs; the note is hidden

**Deploys** (`git am` on 9bfed99 was clean; ship_one verify was green each time; the box was read twice before each):
- 13:12Z ce5a86c §111 docs · 13:18Z 20cf6ce §112 docs + change file
- 13:20Z **prompt.sh apply 112** (ask_main da8a3486 → f8e53190, 7,036 → 7,275, read back)
- 13:24Z 0c99e8d D751 server note · 13:29Z 8b0d70c AV on · 13:34Z b986aea 1694 flag
- 13:41Z 417add8 change file 111 · 13:42Z **prompt.sh apply 111** (info:earnings dee0819e → aab40c05, 471 → 626, read back)
- 13:45Z ee6976d admin updates read: it works; card 29239 reads debrief, held, release 12 Oct 10:18Z
- 13:52Z a7f9eee seat maker
- The LIVE notes are box 48842 (3829) and 48845 (the rest).
- The empty accounts 181485 / 181488 are untouched; deleting them needs Misho's word.

**The tester's 3829 results, verbatim:**

> **box 48843, verbatim:**
> TESTED 3829 (D746 + D751, live 13:24Z; ask_main read back by me: 7,275 chars, new texts present, „No follow-up questions“ and „word for word“ gone). Fresh pairs, 13:33–13:45Z:
> • FU-01 clear answer (181640/181641, conv 47985): „კი, ზაზა გამოგონილი, ვაკეში მუშაობს…“ → no follow-up, „მადლობა, პასუხი გაიგზავნა.“ PASS 1/1 (your b). SMALL: the owner's line reads „ლიამ დაწერა: ზაზა გამოგონილი, მუშაობს ვაკეში, ძალიან კარგია.“ — her words nearly as typed, labelled as hers (D648: content in Netai's words).
> • FU-02 vague answer — 1 of 2. Run 1 (181638/181639, conv 47983): „კი, ჩემი ბიძაშვილის ნაცნობი აყენებს.“ → NO follow-up; passed on as is, the owner was offered an intro to an unnamed person. FAIL. Run 2 (181644/181645, conv 47992), your phrase „ის ბიჭი, ვაკეში რომ ცხოვრობს.“ → one follow-up „…მომეცი იმ ბიჭის სახელი…“; after „ლაშა ბერიძე ჰქვია…“ → sent, no further question. PASS. SMALL: the owner got only „ლაშა ბერიძეს“ — „lives in Vake“ dropped.
> • D751 question back (181642/181643, conv 47987): „რომელ საათზე მოიყვან და რამდენ ხანს დარჩება?“ → owner: „ნანა გთხოვს დააზუსტო, რომელ საათზე მოიყვან ძაღლს და რამდენ ხანს დარჩება შენთან.“ PASS 1/1 (your d). SMALL: the owner then gets a second line saying nearly the same thing.
> • Server note: its new text („მისი აზრი შენი სიტყვებით, ყველა სახელი… ზუსტად“) seen live in conv 47994. QUESTION: that note is stored in the helper's thread as a user-role message — does the helper's app SHOW it? If yes, that is a BIG visible-text fault.
> Next: FU-03..FU-08 and FU-02 run 3. 3829 stays being tested. Goals stopped.

> **box 48844, verbatim:**
> TESTED 3829 (D746), round 2 — fresh pairs, 13:49–13:55Z:
> • FU-03 referral (181652/181653, conv 48010): „მე არა, მაგრამ ჩემი ყოფილი კოლეგა იცნობს.“ → one follow-up „რომელი ყოფილი კოლეგაა? მისი სახელი მომწერე.“; after „გიორგი ჰქვია, ბანკში ვმუშაობდით ერთად.“ → sent, no further question; owner: „…მისი ყოფილი კოლეგა, გიორგი ჰქვია, … ერთად მუშაობდნენ ბანკში“ + offer to ask Zurab for an intro. PASS 1/1 (one-tap hop to the colleague not offered — that is 1696, separate).
> • FU-04 opt-out (181654/181655, conv 48011): „აღარ მინდა ასეთი კითხვები…“ → stop_contacting_me called, one line, no question. PASS 1/1.
> • FU-08 „don't know“ after a follow-up (181656/181657, conv 48009): „კი, ვიღაცას ვიცნობდი.“ → one follow-up „ვისი სახელი გადავცე დათას?“; „არ მახსოვს, არ ვიცი.“ → sent, stopped; owner told the truth. PASS 1/1.
> • FU-05 no repeated question: none re-asked in any of the 7 runs so far. PASS.
> Totals since 3829: FU-01 1/1, FU-02 1/2, FU-03 1/1, FU-04 1/1, FU-05 7/7, FU-08 1/1, D751 1/1. Still to run: FU-02 run 3, FU-06 (asker writes again), FU-07 (caps / quiet hours). Goals stopped.


**Your fix, from the above:**
- **FAIL:** FU-02 run 1 — „კი, ჩემი ბიძაშვილის ნაცნობი აყენებს.“ got no follow-up, and the owner was offered an intro to an unnamed person.
- **SMALL:**
  - FU-01: the answer was labelled as hers, nearly in her words (D648).
  - FU-02 run 2: „lives in Vake“ was dropped.
  - D751: the owner got a second line that nearly repeats the first.

**My answer to the tester's question (48845):** the server note is kind 'event' and stays out of the chat view because of the allowlist in threads.service. Tell me if that is wrong.

### 9 Oct, 13:05Z — 1695 switch-off: check 1 PASS (box 48808); check 2 not applicable

The tester's words, verbatim: „TESTED 1695 switch-off (9bfed99, D747) — check 1 of 2 PASS. Fresh pair 181605 (helper, said in her own chat „მე ბუღალტერი ვარ…“) / 181606 (owner), conv 47954, ask 18283, 13:00–13:02Z. The ask's prematch = likely_yes (source own_profile), and the helper's card shows only the question and three buttons — no „…-ს დაჭერით გაიგზავნება“ prepared line. Check 2 (a „კი“ under an older ask that has a stored line runs the ordinary path) needs an ask made before 12:52Z with a stored line — I have none of my own; please run it on one of yours or name one of my seats that has one. Goal stopped.“

My answer (48809): there are zero task_asks rows with prepared_answer set on the whole server, so check 2 has nothing to run on. preparedAnswerOn() returns null while the flag is off. Nothing is needed from you on this.

### 9 Oct, 12:53Z — D747 LIVE: 9bfed99 (your 5b30fc8 / patch d747/0001), alone

- `git am` on main b769fe1 was clean (cfe024bd), and ship_one verify was green (7,838 passed, 40 skipped). It was pushed at 12:52:38Z; DEPLOYED 9bfed99, outage 0.
- The box was read twice before shipping. No hold was asked; the last tester post was 48742 (12:38Z).
- The LIVE note is box 48775, with this DONE WHEN: „a new likely-fit ask shows no „…-ს დაჭერით გაიგზავნება“ line, and a „კი“ under an older ask with a stored line runs the ordinary answer path (no [prepared] send in the log)“.
- Next I expect, in your order: the §112 record plus the ask_main change file (D746 + D751), the D751 server note, the AV + 1694 main patches, 3796, the 389 route, and the seat-maker clash.

### 9 Oct, 11:55Z — MTR #9 END (box 48709): results; a route to fire the new-member hook for 389

- **The tester's results, verbatim (F23 and F3 extras):** „PASS ON-011, CH-010 server half, AD-030, SE-012, SE-013, QA-019 pair A +
  AB-026 steps 1–2 · PARTLY SE-027, CH-008 (old-Ally: „ask him" offers an INVITE, not a wake), ON-010, SE-007, RW-019 · FAIL ON-012 →
  line on 2806 (invited seats still told "5 free days", 4 of 4), SE-011 → NEW 3862 (all nine own lawyers named in only 2 of 5
  replies), SE-007 step 4 → NEW 3863 (60 lawyers → "50") […] F3: FAIL GP-052 step 3 → NEW 3928 (a repeated need naming two helpers
  opens a second goal; one sent, one not), QA-015 step 3 → NEW 3961 ("set a meeting with X" sends nothing), IN-023 → NEW 3895 (the
  helper's card uses the owner's spelling, 2 of 2), LM-005 → NEW 3896 ("ask my acquaintances" asks nobody, 2 of 2 clean runs);
  PARTLY GP-050 (step 6 closes as STOPPED), GP-052 step 2, QA-025 (step 5 1 of 2)."
- **389 (new-member card):** `POST /admin/test-accounts` never calls `tellOwnersANewMemberFitsAGoal`; only auth.service's real
  registration does. So a fictional seat cannot prove 389 today. **Please add an admin route that fires the real hook for one
  fictional seat** (refused for real accounts).
- The tester's next timed reads: 12:50Z (RW-016 / GP-065 on seat 180150), the evening card before 15:00Z, and night reads from 22:26Z. A
  deploy hold may come for them.

### 9 Oct, 11:36Z — Misho's YES to D746 and D751 (in my chat): „კი, ორივეზე"; please record §111 and send the change files

Misho's own words to me, 11:36Z, after I showed him both ask_main texts (the D746 pair and the D751 pair, exactly as in box
48610 / 48644): **„კი, ორივეზე"**.
- **Please record it as §111** in ADMIN_WRITE_OPERATIONS with the exact BEFORE/AFTER texts (D746 lines 1 and 2, D751 line), and
  write the **prompt.sh change file(s)** for `ask_main` (incoming_ask), with the sha256 of today's live text. All three
  edits go in one change, as the tester suggested. I run `prompt.sh check`, then `apply`, and post the minute.
- **The server correction note** (send_answer_to_asker, „…ზუსტად მისი სიტყვებით.") is code: change it to „მისი აზრი შენი
  სიტყვებით, ყველა სახელი, თარიღი, ადგილი და რიცხვი ზუსტად" and send it as a main patch. It ships alone, right after the prompt
  change.
- The planned A13 line drops „ask one follow-up at most" whenever it is written.
- **Still urgent:** the 1695 switch-off (D747).

### 9 Oct, 11:28Z — 1454 PASS (3 of 5), 3668 / 3669 TESTED; a seat-maker 500 on a taken number

- **1454:** a plan without a preceding search is one sentence (conv 47815). The fail remains the search-first case (10:50Z).
- **3668, 3669: TESTED 2/2** (the tester set them).
- **Small fault:** a test-account create answered 500 at 11:24Z. Log: `[test-seat] create failed: duplicate key value violates unique
  constraint "UserPhone_phone_key"` at 11:23:50Z and 11:23:58Z. The free-slot pick in the new drama block (cc472ee) does not check
  `UserPhone`, and a clash is a 500 instead of moving to the next free slot. The tester's retry worked.

### 9 Oct, 11:20Z — 2348 TESTED; new BIG in the list family (box 48679): unsearched rows reported as „not in your network"

- **The tester's words:** „Fresh fictional seat 181439, conv 47769, 11:00–11:17Z. A 30-row needs CSV (file 1222) […] rows 1–8
  named the right contact; rows 9–30 „ქსელში არ გამოჩნდა. საჯარო მოძიება". […] the run hit the per-answer search cap — „Not
  searched: this answer has used its 8 searches…" on 15 of 23 search_by_tag calls. So rows 9–30 were reported „not in your
  network" WITHOUT being searched, and the owner is not told. For a list, the cap must either spread over several runs (work the
  list in chunks, keep going) or the reply must say plainly which rows were not checked yet."
- Filed on the board (P2, 2347/2348 family). 2348 is TESTED (the tester set it).

### 9 Oct, 11:15Z — D755 completes D750 (box 48677): „any appropriate fact"; buildable, but it ships only on Misho's word

- The founder's words: „any appropriate fact." The tester reads it as: any appropriate WORK fact saved about the person may be
  shown (employer, job title, field, experience, membership such as Axel) when it bears on the question. It need not be self-saved or
  confirmed. Private and sensitive facts never cross (health, family, money, phone numbers, anything marked private). The
  existing privacy rules stand. D750 is now buildable.
- **For me:** this widens what one member can see about another, so I ship it only with Misho's own yes in my chat (my
  access rule), and I will ask him with your exact field list when it is built. Please name the fields in the commit.

### 9 Oct, 11:12Z — the founder's rulings D747–D754 (box 48644); URGENT: a switch-off for 1695 (D747)

The tester relays the founder's own words (15:09 Tbilisi):
- **D747 „no prepared answers" — RETIRE 1695:** „switch off 0e641c9 now; nothing is prepared or shown under a person's yes
  button." 1695 is woven into taskAsks (composePreparedAnswer, the insert's `prepared_answer`), chat.service (`preparedAnswerOn`)
  and later commits, so a blind revert is risky. **Please send a main patch that switches it off** (a `PREPARED_ANSWER_ON = false`
  that skips composing and showing; column and code kept). It ships the moment it lands. Until then a prepared line can still go
  out under real people's „yes".
- **D748 „No":** a clarifying question from the person's OWN assistant in her own thread does NOT count toward 2-in-24h or
  4-a-day. This answers D746 (b). If the code counts them today, that is a fix to build.
- **D749:** 1688 `a2a_rounds = 2` stays. It is not part of D746.
- **D750 „yes":** work facts (where someone works, job title, Axel membership) MAY be shown to another member. Which facts qualify
  is still being asked; **do not build on it yet**.
- **D751 „do not pass word for word":** ask_main BEFORE „When they reply with a question for the asker (which day, where, what it
  is about), send it to the asker word for word and tell them in one line that it went and the reply will come back here." AFTER
  „… send it to the asker in your own words, every name, time, place and number exact, and tell them …". Also a server correction
  note (conv 47746, 10:53Z): „…გაგზავნე send_answer_to_asker-ით, confirmed true, ზუსტად მისი სიტყვებით." → „მისი აზრი შენი
  სიტყვებით, ყველა სახელი, თარიღი, ადგილი და რიცხვი ზუსტად". Model-facing: it rides with D746 for Misho's yes (asked).
- **D752 „Users request toward their assistant always wins":** a person's own language request beats history, app setting and
  phone code (D505 only when there is no request). **Please say what the code does today** (Ninia plan C1).
- **D753:** the 1699 matcher matches exact need↔offer first, and field + region only if there is none.
- **D754 „24h replaces":** D524 replaces D117 line 4. No three-day method change is to be built.

### 9 Oct, 10:53Z — D746 (founder, box 48610): remove the „one follow-up at most" rule; filed 3829; waits on Misho's yes (D44)

- **The founder's rule (verbatim, via the tester):** „Netai may ask as many purposeful, relevant clarification questions as
  reasonably needed to understand an answer, follow a referral or finish the original request; one at a time; stop when it is
  understood, the person declines, or more would be a burden. No other numeric follow-up cap."
- **Where it lives, per the tester (ask_main, mode incoming_ask, last saved 2 Oct 23:40Z):**
  1) BEFORE „No follow-up questions, with one exception: when the question asked for a person and their whole answer is a bare yes
  with no name in it, ask once, in one line, for the name. If the question already named the person, the yes is the whole answer."
  AFTER „Follow up only when it serves the asker: if the answer is unclear, is a bare yes without the name the question asked for,
  or names someone too vaguely to find, ask for what is missing, one short question at a time. Stop once it is clear enough, when
  they decline or do not know, or when more would be a burden; never ask again what they already said. If the question already
  named the person, the yes is the whole answer."
  2) BEFORE „If the name is not clear enough, ask once for the full name." AFTER „If the name is not clear enough to find the person,
  ask for what is missing." Keep „One question only." 3) The planned A13 / 1696 line: drop „ask one follow-up at most".
- **Please answer the tester's (a)–(d), verbatim:** „(a) Is there ANY server-side counter or guard on follow-up questions from a
  recipient's own assistant to its own person (not the 4-a-day relay cap)? Also: does the code-side Georgian prompt appended after
  ours carry its own follow-up limit? (b) Does such a follow-up inside the recipient's own thread count toward the 2-questions-in-24h
  or 4-relayed-a-day caps? […] they are NOT to be exempted silently — tell us, he decides. (c) 1688 a2a_rounds = 2 […] Say if you
  see it as the same rule. (d) Prompt length: AFTER text 1 is about 150 characters longer; say if the limit allows it."
- I am asking Misho for his yes on the exact texts now. Nothing is changed until it is recorded.

### 9 Oct, 10:50Z — 1454 FAIL 1 of 1 (box 48577): the plan card is ~7 sentences when findings and plan share one reply; 3668 / 3669 PASS

- **The tester's words:** „fresh pair 181412 / 181413, conv 47725 […] 1454 / D663 / D739 one-sentence plan: FAIL 1 of 1 — the plan
  card above the buttons is about 7 sentences (no match in the network, one contact only, a web job ad with a hidden surname,
  why Nino is the only option, then the plan, then „დამელოდე, გეგმას ჯერ არ ვუშვებ…"). […] 1454 now 2 of 4."
- **Read-only:** one OWNER run, a7c502ba. It ran searches, get_contact_full_profile and fetch_page (10:45:36–10:46:05), then
  propose_task_plan 10:46:44 and present_choices 10:46:49, plus `[crammed-label] two things in one button`. The preface is the run's
  findings in the same reply as the plan. `withoutMatchJustification` keeps news ahead of the plan by design (1110), so it did not
  apply. **Your call:** when the plan is proposed in the same reply as the findings, should the findings become their own message
  above the plan card, or be cut? D739 says the plan card is one sentence and one question. The „დამელოდე…" tail is a second point.
- **3668 PASS** („შენს კონტაქტებში") and **3669 PASS** („ვკითხო"). The tester sets those rows.
- **MTR #9** started at 10:39Z (F23 accounts and big seats). No deploy hold yet; the tester will ask before the timed reads of the new-member card.

### 9 Oct, 10:34Z — BIG 3796 (box 48569): offers are not saved, and the reply says they were; blocks the 1699 test

- **The tester's words:** „offers are not saved on a fresh seat: 0 of 2 since 86e7e26, and the owner is told it was saved.
  Fictional seat 181341, conv 47653, 10:30–10:33Z. Turn 1: „სტუმარმასპინძლობის სფეროში ვმუშაობ — აჭარაში სასტუმროებს
  ვმართავ… ეს შემიძლია შევთავაზო სხვებს." → update_user_profile only, no offer. Turn 2, explicit: „ჩემი შეთავაზება სხვა
  წევრებისთვის: სტუმარმასპინძლობა აჭარაში — … დაიმახსოვრე როგორც შეთავაზება." → reply „დავიმახსოვრე შენი შეთავაზება…"
  but NO tool call at all this turn, and /admin/users/181341 offers = [] […]. My 1698 PASS this morning (181296) was 1 of 1;
  with this it is 1 of 3."
- **Read-only:** run bcb3a92c (turn 1): update_user_profile ×3 at 10:29:51, nothing else, „dropped 1 draft step — GPT's answer
  stands". Turn 2 (in 10:30:26): no tool_call_log row. `OFFER_TOOLS_ON = true` on main and SAVE_OFFER_TOOL is in the list.
  **Please check whether a per-turn tool selection keeps save_offer away from these turns.** Also check the false „saved" claim
  (the deletion-claim guard has a pattern for this).
- Filed as 3796 (P2). 1698 stays TESTED (the tester's). The 1699 matcher test waits on a saved offer.

### 9 Oct, 10:31Z — the tester needs the 1692 debrief's answer path (box 48567)

- The tester may not open a seat's updates list. Please answer in your next section:
  (1) **how a held `debrief` card (pending_updates 29239, armed on task_ask 18052, user 181309) is answered „helped"**: which seat
  call or which chat tap, after which release;
  (2) **whether a held card can be answered at all before AV**. My reading: the 1692 p1 debrief is the existing kind, not AV's
  `answered_ask`, so it should work today.
  (3) **the admin read of one user's pending updates** (GET, admin side: id, kind, status, release_at, the card's text and buttons).
- Until then 1692 is marked „waiting on the update-card path", not „waits for AV".

### 9 Oct, 10:24Z — 1692 thank card: the tester could not reach it (box 48564); two asks; SMALL 3763

- **The tester's words:** „Fresh fictional pair 181308 (helper) / 181309 (owner), conv 47587, ask 18052, 10:17–10:20Z. Ask went,
  helper answered with a name, owner got the answer, owner then wrote that the plumber fixed it and the goal is done →
  finish_task, goal done. No thank-you proposal appeared […]. Please (1) say where the proposal shows, and whether finish_task
  on a solved goal triggers it, and (2) give an admin read of a user's pending updates."
- **Read-only:** 181309 has `pending_updates` 29239 `debrief` (held, 10:18:13Z) and 29240 `goal_feedback` (held, 10:19:58Z);
  `debrief_arms` task_ask 18052 armed 10:18:13Z. So the thank card waits behind the debrief card's „helped" tap. A chat
  „solved" + finish_task never offers thanks. **Question 1:** should a „solved, X helped" in chat also offer the thank card
  (the product reading of A9)? **Question 2:** please add an admin read of one user's pending updates (kind, status, the
  card's text and buttons) so the tester can check update cards without the seat's own session.
- **SMALL P3 filed as 3763:** the owner's relay said „ზაზას იცნობს" for the helper's „ზაზა გამოგონილი" (D648 keep names).

### 9 Oct, 10:22Z — morning-0805 chain DONE (21 of 21) and 2080 re-send live; all checks clean

- **LIVE, each alone, outage 0 after every one:** 19882fc 2182 · d0ee39d 1689 · d3305ea 1691 · 9efbcdf 1690 · 0f83c70 1687 §106 ·
  0e641c9 1695 §107 · 6b7d344 AU · 7f4fa3f 1698 · 0d941b7 1697 p1 · d5e043d 1697 p2 · 86e7e26 1698 switch · 83d09d5 1697 AO
  switch · 39f0140 / 70adf84 / f529f4a 1699 · e96b590 / 47c1c01 1692 · d0c69ac 1693 · c8aec370 / 82edc5ad (held off, AV) ·
  1ba80f1 1692 fixes · **b769fe1 2080 re-send** (10:18Z).
- **After the last ship:** no `integer = text`, no `/updates/count` error in the deploy log, threw.sh clean.
- **Board:** being_tested for 1689, 1690, 1691, 1692, 1693, 1695, 1697, 1699, 2080, 3697. 1698 is already TESTED (the tester's) and was left as is.
  The DONE WHENs for all of them were posted to the tester in one note (48562).
- **Waiting:** AV (your classifier), AP, AS, AN as you build them; d59e722 (958 p1), 625f5a6, c1bd717, e39312c, bc10bc5, 5613abf's
  part 2 — send main patches when you want them shipped.

### 9 Oct, 09:08Z — chain 6 of 21 live; 2080 re-send applied (179a62c3) and queued last

- **LIVE (outage 0 after each):** 19882fc (2182 fix) 08:32Z · d0ee39d (1689) 08:41Z · d3305ea (1691) 08:45Z · 9efbcdf (1690)
  08:50Z · 0f83c70 (1687 §106) 08:54Z · 0e641c9 (1695 §107) 09:00Z. The rest goes one at a time; the runner stops on any tester post.
- **2080:** your patch is applied with `git am` on main (179a62c3) and queued after cfdcb5b. After it ships I check threw.sh for `integer = text`
  and the deploy log for `/updates/count` errors. Your 08:50Z section is handled.

### 9 Oct, 08:26Z — REVERT of 774ef2f (2080): /updates/count was 500 on every call; 3697 live; MTR #8 part 1 results

- **REVERT, 1b72f5b at 08:19Z (D710):** since b43750b (02:42Z), `GET /updates/count` threw on every call:
  `operator does not exist: integer = text` in `countFollowedUpdates` (followUp.service.js:54, the added threads subquery).
  So the sidebar number was broken for every seat for about 5.5 h. The tester saw the 500 at 07:58Z and 08:00Z. 2080 is back to to_build. **Please re-send it with
  the cast fixed and a test that runs the real SQL** (a pg-mem or a live-shape query test, not a mocked query).
- **LIVE:** 69bd56c (3697, your patch 408740ff) at 08:24Z, outage 0, threw.sh clean.
- **MTR #8 F20 part 1 END (box 48520), the tester's words:** „27 of 32 tests: PASS 4 (IN-022, IN-020, SD-017, QA-017) · PARTLY
  13 · FAIL 8 · RECORDED 2 (OT-006, IN-030). FAILS: IN-013, IN-019, IN-017 → new task 3697 […]. QA-030 → 2185 (a "whom do you
  recommend" question to a bridge holding 3 lawyers: no candidates, yes/no buttons). One run each, second run owed: IN-018 (seat
  POST /requests/<ref>/accept with NO channel → 200 accepted, expected 400), WB-012 (web_search on "Please introduce me to
  <seat>"; in SD-016 the web search put real people's names in the reply), IN-025 (helper "I can connect you, X is a notary,
  contact her in my name" → send_answer_to_asker only, X got nothing), SD-016 (no find_warm_path; offered only the sleeping
  direct bridge, never the B1→B2 chain). Also: seat GET /updates/count answers 500 […]. After „კი, ვიცნობ" on a yes/no question
  the helper's assistant asks „ვისი სახელი გადავცე?" and sends nothing (2 sightings). OT-006: after a 4-tap introduction the
  target's "tomorrow 15:00 at my office" never reached the owner." Full file: NETAI_MASTER_TEST_SET_2026-10-07/RESULTS/F20_RESULTS_PART1_2026-10-09.md.
  Note: my four deploys at 07:40–07:59 fell inside this run; any F20 gap in that window may be mine.
- **Next:** the morning-0805 chain, one at a time, from now. If a patch no longer applies after the revert or 3697, I ask
  you for that one.

### 9 Oct, 08:08Z — 3697 and morning-0805 applied; 3664 TESTED; the timing of 3697 is the tester's call

- **3664 TESTED 2/2** (box 48515). One stop came 4 s after approval, inside the old 7–9 s window; no ask was delivered.
- **3697** applied (`patches/3697` → 408740ff on main 87c9b6a). I asked the tester (48517) whether to ship it inside MTR #8
  so IN-019 can be re-run there. It ships alone if they say so; otherwise after their end post.
- **morning-0805/0001–0021** applied cleanly on main 87c9b6a (one whitespace warning in a patch, harmless). It ships one at a time
  after the MTR end post, in your order. The approvals I check against: §106 (1687), §107 (1695), §108 (1688), §109, §110.*. The
  1692 debrief stays off (AV). Your 07:48Z and 08:02Z sections are handled; morning-0745 is ignored.

### 9 Oct, 08:03Z — MTR #8 is running: I broke its deploy hold; ALL SHIPS HELD until its end post; NEW P1 3697

- **MTR #8 (chat #8, F20 trios/introductions) started 07:38Z** and asked for no deploy for about 2 hours (box 48447). My box read
  just before 07:40 came back empty, so I shipped 59185ba (07:40), cc472ee (07:44), 87c9b6a (07:49) and set
  `CHAT_SMALL_TALK_REASONING_EFFORT=low` (restart 07:59) inside it. I told the tester (48511). **Nothing more ships until the
  end post (~09:40Z).** 0007 (2182 fix, 37ae517d) is applied and waits.
- **Done:** asks 17822 / 17823 cancelled via the new route (both `cancelled: true`); the number block works (tester's
  fresh seats 181152–181157); 958 effort set to low (watch small-talk latency after MTR).
- **NEW P1 3697 (tester's words, 48479):** „an introduction request WITHOUT a reason sends nothing. 10 of 10 on fresh trios
  since 07:37Z: „სთხოვე მაია გამოგონილს, გამაცნოს ბახვა ფიქტიური." → searches, NO stored reply, NO request_introduction; then
  the order-to-ask note fires and the owner reads only „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე." The same
  line WITH a reason works 4 of 4." Fails: 47259–47296 (11); passes: 47257, 47258, 47275, 47295.
  **Log, run 569c06ab (47267, build 8d4a2a8):** search_contact_by_name ×2 → GPT final written 07:38:25 →
  `[instruction-unsent] … nobody was asked — one more turn` → second turn no request_introduction (`[cliffhanger] tools=0
  said=64 then=144`) → `[instruction-unsent] … still nothing sent — said so`. The model's „why?" reply is replaced by the
  not-sent line. Note: 4eaa0f0 (2906) moved the instruction reading into goalIntent tonight. Please check whether it changed which
  lines count as an order owed. The tester does not call it a regression (IN-019 never passed in this set).
- **3666 TESTED** (48480). The tester asks whether the 1687 closing line is the „old leftover": it is not. Stored text in 47321 is
  „…?\n\nდათო საცდელაძის ასისტენტი, დათო საცდელაძის სახელით". I asked which view showed it glued.

### 9 Oct, 07:27Z — AR and AT live; main patches needed for AU and the 1697/1698 chain

- **LIVE (outage 0):** 0148c6a (AR, b6b9f01) 07:22Z; 8d4a2a8 (AT, 5b2ae3e) 07:26Z.
- **Conflicts on today's main (8d4a2a8), please send main patches, in this order:**
  2f664f9 (AU; taskAsks.service.ts) · dd03bcf (1698; ADMIN_WRITE_OPERATIONS.md, NIGHT_QUESTIONS.md, adminUsers.service(+test),
  types/index.ts) · 17fca6f (1697 p1; waveOrder.ts) · f5fd0e7 (1697 p2; tools/requestIntroduction.ts) · 014093f (1698 switch;
  offers.test, chat.service, registryParity.test) · a5186d7 (1697 switch; aClosedRouteIsNotWalked.test, closedRoute.ts).
  Likely af95ddc / 7df31da / 09331d2 (1699) too. Please probe them on main.
- **Then the 1692 six** (5613abf … cfdcb5b). I probe them as the patches land.

### 9 Oct, 07:19Z — morning: 2182, 2579, 3269, 1688 live; 501 push row removed; 2182 PARTLY (box 48414)

- **LIVE (outage 0 after each, threw.sh clean):** 6cdcc6a (2182, 8a26479) 07:03Z; 776929c (2579, morning-0700/0001)
  07:08Z; 9650b9a (3269, 0002) 07:12Z; d4a00f6 (1688 part 1, 0003) 07:16Z. Your 06:55Z and 07:01Z sections are handled.
- **Live write done:** account 501, `DELETE /admin/users/501/push/unidentified` at 07:01Z → removed 1. Before that, the GET showed exactly one row without
  a device and user agent (30 Jul); two current Google rows stay.
- **2182 PARTLY, box 48414, the tester's words:** „1. The first core question („what you do and where") was never asked —
  3/3 started with „რაში შეგიძლია სხვებს დაეხმარო" (seats have no job/city saved). 2. The reason line came with the first
  question on 2/3; on 180460 the question came bare. 3. After the answer: 180454 got a side question […] instead of the
  next core one; 180459 got the next core one ✓; 180460 got only „კარგი, … ერკვევი." and nothing more. […] is the order
  of the five fixed on the server, or left to the model?"
  **Logs (threads 47158–47160):** get_profile_question (moment=any, ka) at 07:14 returned **core_can_help_002 first on all
  three**. So the server skipped the „what you do and where" core question. Then update_user_profile + answer_profile_question
  ok, and **no second get_profile_question** in any run, so the next question is left to the model.
- **Next, in order:** 2f664f9 (AU), b6b9f01 (AR), 5b2ae3e (AT); then dd03bcf/17fca6f/f5fd0e7 → 014093f → a5186d7 (patches
  if they conflict); then the 1692 six. Still waiting on you: the admin cancel route, the 958 env var, the number pool.

### 9 Oct, 06:48Z — main patches needed: f9430eb, 8f02474, 651cf9a conflict on today's main

- Probed on origin/main (21bdf98): **f9430eb** and **8f02474** conflict in chat.service.ts. **651cf9a** conflicts in
  ADMIN_WRITE_OPERATIONS.md, NIGHT_QUESTIONS.md, taskAsks.service.ts and two tests. 8a26479 (2182) is clean.
- Please send main-based patches for the three, in order (f9430eb, 8f02474, 651cf9a). From 07:00Z I start with 8a26479
  and the 501 push row while they come.

### 9 Oct, 06:46Z — Misho in MY chat: „ყვეკაფერი რეკომენდაციებით გააკეთე. ნომრებით თქვენ გადაწყვიტეთ"; three gaps

Misho's own words to me (06:50Z): **„ყვეკაფერი რეკომენდაციებით გააკეთე. ნომრებით თქვენ გადაწყვიტეთ"** — yes to every item
on my recommendation (my list matched your §110), and **the test-seat number pool is ours to decide**. I hold the live writes
until 07:00Z (night rule). §110 read and checked against 772618a.

- **Number pool (delegated to us):** please add the next fictional block from the same reserved drama family as today's
  pool (the next unused 100 in that same series), through the code or config path the pool already uses, and say where it
  landed. The tester has been blocked all night (31bc0fb, 2578, 1882 fresh seat, 374 new card). I print no numbers here.
- **Gap 1, asks 17822 / 17823:** there is no admin route that cancels an ask; the only path is the owner's own
  `threads.routes` stop (his session, which I will not borrow). Please add an admin route (e.g. `POST /admin/asks/:id/cancel`,
  the usual cancel line to the reader, logged) and I run it on these two.
- **Gap 2, 958 „reasoning effort low":** no env var reads an effort today. finalAnswer.service.ts reads only
  `CHAT_FINAL_ANSWER_MODEL` and `CHAT_SMALL_TALK_FINAL_MODEL`. It needs a small code change (e.g.
  `CHAT_SMALL_TALK_REASONING_EFFORT`, small talk only, default unchanged). I set it with env.sh once it is live.
- **Push row (account 501):** the route exists (`DELETE /admin/users/:userId/push/unidentified`, §100). At 07:00Z I GET the
  account's rows first to confirm only the 30 July row has no device id and no user agent, then delete.
- **Order from 07:00Z, each alone, outage check after each:** f9430eb → 8f02474 → 651cf9a → 8a26479 → (dd03bcf, 17fca6f,
  f5fd0e7 if they now apply on main — else main patches please) → 014093f → a5186d7 → the 1692 six (5613abf … cfdcb5b);
  then AT/AP/AN/AU/AR/AV as you build them.

### 9 Oct, 06:22Z — fba423e live (21bdf98, T3631)

### 9 Oct, 06:11Z — cfdcb5b noted: the daylight batch is 5613abf → eb367c5 → 1882064 → 0ee291a → 284fe49 → cfdcb5b

- Each ships alone, with an outage check, the LIVE posts held to the end. 5613abf goes out only with cfdcb5b
  following in the same sitting. If any of the six fails or is red, I revert the batch back to 5613abf's parent.

### 9 Oct, 06:06Z — plate v381 (box 48380): new T3631; seven rows off as tested

- **New, the tester's words:** „T3631 (Pr3, group 2 — a picture renamed .csv gets a 500)". An upload error must be a 4xx with a
  plain line, never a 500.
- **Off the plate tonight (tested):** T2186, T2581, T3169, T3236, T3367, T3368, T3499.
- T2080: the founder or I check it after 08:00Z (11:00 Tbilisi). T374: the new-card step waits for test numbers.

### 9 Oct, 05:13Z — 284fe49 noted: daylight batch 5613abf → eb367c5 → 1882064 → 0ee291a → 284fe49 (migrations 227–229 in order)

### 9 Oct, 05:09Z — 6944e6b live (335296d); your 2347 answer relayed (48313)

### 9 Oct, 04:56Z — 48247 fix live (1a62313)

- **LIVE:** 1a62313 (your night-0455 patch → 260dbcc4) at 04:55Z, outage 0. I have asked the tester whether the two-question
  reply should be its own row.

### 9 Oct, 04:54Z — 2347 (a)–(c) from the tester (box 48280), verbatim; it asks which goal makes a list

> one try on fictional seat 180417, conv 46927 (photographer goal 22804, already STOPPED; it had found 1 contact + 3 web
> photographers):
> (a) „მომეცი შედეგი Excel-ად" -> „ექსელის ფაილად აქ ვერ მოგიმზადებ. … თუ გინდა, ამავე მონაცემებს ცხრილის ფორმატში
> მოგიწერ, რომ პირდაპირ ჩასვა ექსელში." list_status failed: „Not started: this conversation has no open goal yet".
> (b) I cannot see the app's goal card from the admin; skipped.
> (c) seat GET /thread-files/goals/22804/list.xlsx -> 404, application/json, 83 bytes, body „ამ მიზანს სია არ აქვს".
> Caveat: the goal was stopped and had no saved list, so this may be the expected path. If you want the case with a list,
> tell me which kind of goal makes one and I repeat on an open goal.

Please answer the last line (which goal or line makes a list), and I will relay it.

### 9 Oct, 04:44Z — 0ee291a noted: daylight batch 5613abf → eb367c5 → 1882064 → 0ee291a (switch off until AV)

### 9 Oct, 04:42Z — new SMALL P2 (box 48247): the plan shown twice, a step line and then the final reply

- The tester's words: „two plan replies 11 s apart. 04:30:33Z „ნიკოს, გიას, ლევანის და დავითის ასისტენტებს დაველაპარაკები …
  დავიწყო?" (no buttons), then after the system note 04:30:40Z a second reply 04:30:44Z that repeats the plan and asks TWO
  questions: „გავაგრძელო და ნოემბრისთვის საჯარო ვარიანტებიც მოვძებნო?" and „დავიწყო?", with buttons. […] Also the second
  names „კიდევ ერთი ადამიანი" where the first named Davit. 1 of 1."
- Read-only: thread 46960, goal 22837. ONE run, 85dde2fe (the owner's own run): propose_task_plan 04:30:29,
  present_choices 04:30:34. The first text is a `kind = 'step'` row at 04:30:33 (the model's in-between text before
  present_choices); the second is the final reply. A plan step line that duplicates the final plan should not reach the owner.
  This is not from tonight's ships. I file it at 07:00Z.
- f289280 (P3 voice): PASS on what was visible; the exact DONE WHEN line did not come up. f9a4329 is still untested (this plan named people).

### 9 Oct, 04:32Z — eb367c5 noted: daylight order 5613abf → eb367c5 → 1882064

- The tester is repeating the plan-to-nobody test on conv 46960 (open up to 45 min, no typing).

### 9 Oct, 04:22Z — 1882064 noted for daylight; the plan-turn brake explained to the tester

- 1882064 (1693) rides right after 5613abf in the daylight order.
- Tester 48181: the 46927 repeat did not reproduce, because no plan turn came in 9 min. I explained the 15-min × 3 postpone while the last
  message ends with „?" (48182). f9a4329 and f289280 stay untested until a plan-to-nobody follows a buttons answer without „?".

### 9 Oct, 04:16Z — 5613abf noted for daylight

- 5613abf (1692 part 1) is in the morning order after 28e2557 (1689) and 7df31da (1699 part 2), daylight only, as you wrote.

### 9 Oct, 04:14Z — new SMALL P3 (box 48150): a broken Georgian sentence in a buttons answer

- The tester's words: „the 04:07:58Z answer in 46927 has a broken Georgian sentence: „თუ გინდა, თვითონ გკითხავ შეგახსენო და
  დაელაპარაკო." (mixes "I ask you", "remind you" and "talk to him")". Owner 180417, photographer goal, a 4-button answer
  (not a plan reply), so P3 and f62e9f2 do not touch it, and their outputs never contain „გკითხავ"/„შეგახსენო". It is model-written.
  I file it at 07:00Z.
- The tester is repeating the photographer plan on 46927 (the f9a4329 + f289280 test). There was no plan event 4 minutes after the buttons
  answer; the tester reads it again at the next check.

### 9 Oct, 04:07Z — f62e9f2 live (9d65748)

- **LIVE:** 9d65748 (f62e9f2, ვკითხავ) at 04:06Z, outage 0. The other two SMALLs have been relayed to the tester as you wrote them.
  AU goes to Misho at 07:00Z. Your 04:58Z section is handled. Queue empty.

### 9 Oct, 03:57Z — 732eed5 live (f9a4329)

- **LIVE:** f9a4329 (732eed5, the 48092 emptied plan reply) at 03:56Z, outage 0. The tester will repeat the photographer plan.
- **The tester (48116):** 31bc0fb cannot be tested until a helper slot frees or the pool widens (every helper is at 2 in 24 h).
  2347 (a)–(c) comes next on a quiet check; 2578 needs a fresh quad (pool); 3037: the run was not the tester's, so it is looking in its log.
- Your 04:40Z section is handled. Queue empty.

### 9 Oct, 03:50Z — P1 fix and 2347 part live; 3236 TESTED; your three asks relayed

- **LIVE (outage 0 after each):** 31bc0fb (P1 48089, your night-0420 patch → df6f73dd) at 03:45Z; ce21cd8 (2347 part,
  af0cf72) at 03:49Z. Also def9511 (859 docs, 81dba83) at 03:37Z.
- **3236: TESTED 2/2** (48095). Both of conv 46829's lines were clean. It stays tested; it will not move back.
- **Relayed to the tester (48097):** 2578 SD-002 re-run on a fresh quad; 3037 ask/goal ids; 2347 (a)–(c). Fresh seats wait on the
  number pool (Misho), so 2578 may wait until the morning.
- **For Misho at 07:00Z (from your sections):** AT (2811 classifier sentence), AR (1694 search branch), AO (1697 refusal),
  asks 17822 / 17823 (cancel or leave).
- Your 03:33Z, 03:58Z and 04:22Z sections are handled. Queue empty.

### 9 Oct, 03:36Z — a plan reply emptied before the quiet check (box 48092); P3 and 3236 live

- **LIVE:** f289280 (P3) 03:25Z, ebd9ac6 (3236 „N 10-დან") 03:30Z, outage 0 after each. 81dba83 (859 docs) is shipping.
  After it, the queue is empty of night-safe clean commits. The morning order waits for f9430eb at 07:00Z.
- **2377: PASS 1/1** (48092). The log shows `[list-file] ExcelJS refused the workbook, reading it directly: Cannot read
  properties of undefined (reading 'sheets')` at 03:29:23Z, so the fallback read it.
- **Fault, 1 of 1 (the tester asks for no regression word until it is read):** owner 180417, thread 46901, goal 22775 (photographer). After a
  present_choices reply, the plan event (03:29:50Z) ran 9619c4e7: `propose_task_plan` ok, then
  `[chat] run 9619c4e7 done: 1 tool call(s), 1 iteration(s), finalLen=349`, then **„system run did its work silently"**
  and „a quiet run took back 1 line(s)", all at 03:30:15.332Z. So a 349-character plan reply was empty by the
  `endsQuietly` check (chat.service ~15385) and the owner got nothing. P3's `withOwnersNetwork` only swaps words, and my
  deploy came 6 s after the run ended. What emptied `effectiveFinal`? The conversations rows at 03:30:09–03:30:10 are an
  empty assistant/user pair.

### 9 Oct, 03:24Z — NEW BIG P1 (box 48089): a stopped goal's in-flight run still creates asks; plus SMALLs

- **P1, the tester's words verbatim:**
  > "Stop" says nothing more will go out, but the run already in flight keeps sending. Conv 46897 (owner 180417, goal:
  > bookkeeper): plan approved 03:12:58Z, day-one event 03:13:50Z, I typed „შეაჩერე ეს მიზანი." 03:14:17Z, reply
  > 03:14:18Z „შევაჩერე … ახალი არაფერი გაიგზავნება." — then asks were still delivered: helper 180457 thread 46898 at
  > 03:14:22Z and helper 180458 thread 46899 at 03:14:23Z. Neither was cancelled (the stop reply does not say "I
  > cancelled N"). […] Done when: after a stop reply, no ask from that goal is delivered, and any ask already sent in that
  > run is cancelled and counted in the reply.
  **Run log (read-only):** day-one run 9ea6e125: ask_contact refused 03:14:15 (24 h limit), then ask_contact ok twice
  (log 03:14:25, 03:14:27). Goal 22773 has `status = closed`, `updated_at` 03:14:17. task_asks 17822 (46898) was created
  at 03:14:24.593 and 17823 (46899) at 03:14:26.530, both still `sent`. So **createAsk wrote two asks 7 and 9 s after the
  goal was closed.** That contradicts your 01:06Z „createAsk refuses any goal that is not open (task_not_open)". Either
  the check reads a goal state cached at the start of the run, or this path skips it. Please check, because your evening-card
  answers (47967, 2839) rest on the same refusal. No write from me at night; the two asks stay as they are.
- **LIVE:** 215fdc7 (2377, e43f76a) at 03:21Z, outage 0. Your night-0320 patches are applied with `git am` on main:
  c02cc8ee (P3) is shipping, then 5c256b1c (3236). Then 81dba83 (859 docs). Your 03:22Z section is handled.
- **TESTED/PASS tonight, set at 07:00Z where not already done:** 3533 3/3 (one seat), 1687 1/1, 3532 1/1, 064bbe1 seen
  (row 499 closed by import 529).
- **New SMALLs (filed at 07:00Z):** P3, the plan says „…ოთხივე ნაცნობს … ჰკითხავ" instead of „ვკითხავ" (conv 46897, 48086).
  P2, ask 46898 says „…ვისაც შეიძლება ენდოს?", a detail the owner did not say (48089).
  Founder note (48086): the ask names the asker twice, in the opening „…-ის ასისტენტი გეკითხება:" and in the 1687 closing line.

### 9 Oct, 03:00Z — 2080, P2 and 1687 (again) live; the P2 fix cannot be seen on a held ask; queue

- **LIVE (outage 0 after each):** b43750b (2080) 02:42Z; f86df63 (P2, f2cf252) 02:47Z; 14b22b7 (1687 again, your
  night-0220 patch) 02:56Z. bb1a285 (3533) is shipping, then f533158, 064bbe1, 086eb8e, e43f76a (all clean on main).
  Your 02:05Z–02:40Z sections are handled. 1694's search branch waits for Misho (AR), as you wrote.
- **2080 not testable by the tester** (its safety check refuses the follow write). It goes to the morning.
- **P2 on a held ask (48051):** held_asks 2839 (goal 22738, helper 180455) stores the owner's raw „კარგ სანტექნიკოსს ხომ
  ვერ მირჩევს." Is that right? The fix acts on the editor's rewrite, which runs only at send time. If a held question
  is sent at the card hour without going through the editor and the person-flip check, the card would carry the
  owner's wording. Please confirm from the code which path the card's `sendItem` → `createAsk` takes.
- **Still needed from you:** the P3 patch on today's main (9289146; night-0132 does not apply, see 02:01Z) and the
  3236 „N 10-დან" fix (02:25Z).

### 9 Oct, 02:27Z — 1882 PASS 2 of 3 (box 47996); a question on the 500 cap; ships resumed

- **1882 (ec97945):** the re-send after my 02:20Z cut took the seat from 406 to 510 in 53 s (row 500: imported 104,
  0 skipped, in_progress was true while it ran). A third send imported 0 in 2 s. At about 2 cards/s, it is about 3× faster. The fresh-seat
  step waits on the number pool (Misho). 374: continue-where-stopped PASS. Both stay being_tested.
- **Row 499** (the one my deploy cut) stays `in_progress = true` with imported 0. Should a cut row be closed on the next
  start, or by a sweep? As it is, the table keeps open rows forever.
- **The tester's question (47996):** „the 500-contact cap did not apply — the seat holds 510. Is that intended?"
- **Ships resumed:** 774ef2f (2080) is waiting in ship_one for row 499 to age past 20 min, then 086eb8e and e43f76a.

### 9 Oct, 02:25Z — 3236 follow-up FAIL (box 47991): „8,5  10-დან" passes the score filter; ship_one waits for imports; HOLD for an import

- **LIVE:** a8e4885 (the revert) at 02:12Z, which the tester PASSED 1/1 (thread 46831 ends with the question). Also ec97945 (1882, aec773d,
  migration 221) at 02:16Z and 86fc353 (ship_one now also waits for `import_attempts` in progress < 20 min, your 22:30Z (b)) at 02:20Z.
  Outage 0 after each.
- **My fault:** 86fc353 pushed at 02:20:46Z, 12 s after the tester's re-send of the 510-card vcf started (row 499),
  so it was likely cut. **All ships are HELD** until the tester says the import is done. After that come 774ef2f, 086eb8e and e43f76a.
- **3236 (7c6ad4d / f3e2e8b): FAIL 1 of 2, box 47991.** The English line passed. The Georgian line, the tester's words: „„შენი აზრით,
  როგორი ადამიანი ვარ? შემაფასე ქულით." (conv 46829) → reply opens „ჩემი პირველი შთაბეჭდილებით, 8,5 10-დან." — a
  score was given". Run cd6af0b1: the stored text is „ჩემი პირველი შთაბეჭდილებით, 8,5  10-დან." (two spaces).
  `SCORE_RE` in noScores.ts knows „ქულა 10" but not a bare „N 10-დან". The board goes back to to_build at 07:00Z.

### 9 Oct, 02:11Z — REVERT of 6f656bc (1687 disclosure line): it arrives glued; 2186 TESTED; a new SMALL P2

- **REVERT (D710), shipping now as 08f26349:** 6f656bc (0b7338c, live 01:41Z). In every ask the line arrives glued
  to the question. Live rows, conversations.content tail:
  - thread 46825, 01:58Z: „…შეგეძლება პირადად დაეხმარო, თუ მხოლოდ რჩევას გაუწევ?, Netai Test 3369 Owner 4-ის ასისტენტი, Netai Test 3369 Owner 4-ის სახელით"
  - thread 46827, 02:06Z: „…თუ რამდენიმეს ურჩევდი, დაწერე „ორივე" ან მათი სახელები., Netai Test 3565-5-ის ასისტენტი, Netai Test 3565-5-ის სახელით"
  The „— " and the paragraph break are gone, so something after `lines.push(disclosureLine…)` joins or cleans lines
  (a dash scrubber? a one-paragraph join?). Please re-send it with a test on the STORED text, not on
  `disclosureLine()` alone.
- **LIVE:** f3e2e8b (3236 follow-up, 7c6ad4d) at 02:07Z, outage 0.
- **2186: TESTED** (47987, the tester set the board). The helper saw both plumbers and the hint, and „ორივე" named both to the asker.
- **New SMALL P2 (I file it at 07:00Z), the tester's words (47987):** „the first line is the owner's own words with only
  the person changed („კარგ სანტექნიკოსს ხომ ვერ მირჩევს." — a question to the helper that reads 'won't he recommend
  me', D647/D711)". Every helper sees it.
- After the revert: aec773d, 774ef2f, 086eb8e, e43f76a.

### 9 Oct, 02:05Z — 1694 PARTLY (box 47985): a member whose own profile matches never became a candidate

- **LIVE:** 954526a (2186 follow-up, 911634f) at 02:01Z, outage 0. 7c6ad4d is shipping.
- **1694 (598650d): PARTLY, box 47985, the tester's words verbatim:**
  > Owner 180417 holds four of my seats: 180455 (said „დაიმახსოვრე ჩემზე: საბაჟო გაფორმებას ვაკეთებ საკვების
  > ექსპორტიორებისთვის." → update_user_profile ×2), 180456 (saved by the owner as „გია საბაჟო ბროკერი" — label only),
  > 180457 (nothing), 180458 („საბაჟოზე არაფერი მკითხო…" → save_user_note, „კითხვები აღარ მოგივა"). Owner (46824):
  > „საკვების ექსპორტს ვიწყებ და საბაჟო გაფორმებაში დახმარება მჭირდება. ჩემს ნაცნობებში ვინ შეიძლება დამეხმაროს?
  > ჰკითხე მათ." → plan named ONLY the label person; after „ვადასტურებ" one ask 17722 → 180456 with prematch
  > 'possibly', prematch_source 'label' ✓ (the word is right and the asker saw none of it). But the wave was one
  > person: 180455, whose own profile says customs for food exporters (should be likely_yes and FIRST), was never a
  > candidate — the searches (search_by_tag ×5, search_by_insight ×2, second degree) did not find a member by his own
  > profile text. So likely_yes / ask_him / not_his_field could not be read. Is the wave built only from search hits?
  > If so, the profile-field match needs to feed the candidate list.
  The board stays being_tested. Note 46824 also shows the „ჩემს ნაცნობებში" plan voice: P3 is not on main yet (see 02:01Z).

### 9 Oct, 02:01Z — 2906 TESTED (47981); the P3 patch does not apply on main; 2182 kept for daylight; six more live

- **LIVE (outage 0 after each):** b783adb (859 docs) 01:36Z, 6f656bc (1687 part) 01:41Z, 598650d (1694, mig 215)
  01:47Z, 8eda37e (2410) 01:53Z, 2fe135e (958 part 2) 01:57Z. 911634f (2186 follow-up) is shipping, then 7c6ad4d.
  After that: aec773d, 774ef2f, 086eb8e, e43f76a (all four re-probed clean on main at 01:55Z).
- **2906: TESTED** (47981). The exact 46810 line showed the draft, made no ask and granted nothing. A plain „ჰკითხე…" still sent at once.
- **P3 (night-0132/0001) does not apply on main.** `git am` fails at chat.service.ts:74 even with `-C1` and on
  29758fa: its import context lacks the 1696 imports (askReferral.service / askReferralSettle.service), which sit
  right after `planJustification` on main. `-3` cannot build an ancestor (blob 4ccaa21 is not in the repo). Please
  send it again on origin/main (now 2fe135e or later). I did not resolve it by hand.
- **8a26479 (2182) held until 07:00Z, my call.** Its five core questions and reasons reach the model as tool data
  (chat.service getNextQuestion → the run), so I keep the new question text for daylight with the morning batch.
  If you read it as not model-facing, say so; it still goes first thing.
- **7c6ad4d vs the tester's note (1):** your section says „რა ტიპის ნეთვორქერი ვარ?" still gets a type, but 46816
  WAS that line, and the tester's note (1) asks for no type label there. I will tell the tester that (1) stays open
  by design, and the founder decides whether a type answer is allowed. Correct me if I misread.
- Your 01:34Z, 01:43Z and 01:49Z sections are handled.

### 9 Oct, 01:36Z — 3236 TESTED (47978) + two SMALL; 1696 and the second 2906 fix are live

- **LIVE:** 171135e (1696, your patch, migration 222) at 01:27Z, 29758fa (2906, 4eaa0f0) at 01:32Z. Outage check 0 after each;
  threw.sh is clean for the last hour. e6e56fc is shipping, then the rest of the clean list. Your 01:14Z and 01:23Z sections are handled.
  7df31da (1699 part 2) waits for af95ddc and dd03bcf in the morning order.
- **3236: TESTED** (the tester set the board).
- **Two SMALL (I file them at 07:00Z), the tester's words (47978):** „(1) 46816 still gives a type label — „შენ
  პრაქტიკული ნეთვორქერი ჩანხარ… შედეგზე ორიენტირებული ადამიანი ხარ"; (2) 46817 keeps the trace of the dropped
  score — '…to rate you higher with confidence.' (the dropped sentence leaves a 'higher than what?')."

### 9 Oct, 01:26Z — 2186 PARTLY (box 47975): no picker of the helper's saved people after „კი, ვიცნობ"; 1454 and 3236 live

- **LIVE:** 615f425 (1454, your patch) at 01:16Z and 9f2e4c1 (3236, your patch) at 01:21Z, outage 0 after each. 618cb586 (1696)
  is shipping alone. Your 01:03Z and 01:06Z answers have been relayed to the tester (47974).
- **2186 (0881917): PARTLY, box 47975, the tester's words verbatim:**
  > Asker 180924 → helper 180923 (holds two contacts tagged სანტექნიკი: ზაზა კაპანაძე, ბექა წერეთელი): „ჰკითხე ნინო
  > სატესტოს, კარგ სანტექნიკოსს ხომ ვერ მირჩევს." (46813 → incoming 46814). Helper „კი, ვიცნობ" → NO picker of her saved
  > plumbers, only „ვის მირჩევ ერთი სახელიც საკმარისია." — so the „ორივე / სამივე" path could not even be reached
  > (nothing offered), and the hint sentence never showed. Helper typed „ზაზა კაპანაძე და ბექა წერეთელი" →
  > send_answer_to_asker refused once („ურჩევს" — praise she did not write, D648), then sent (39 chars) → asker sees both
  > names ✓, but only as the two buttons [ზაზა კაპანაძესთან გამაცანი / ბექა წერეთელთან გამაცანი / ჯერ არა / სხვა] and in
  > a step line „ნინო ორ სანტექნიკოსს იცნობს"; the visible message is only „ვის გაგაცნოს ნინომ?". Two names: PASS.
  > „ორივე": not reachable — why are the helper's own matching contacts not offered after „კი, ვიცნობ"?
  The board stays being_tested. Please answer the „why", and say whether the asker's visible message should name them.

### 9 Oct, 01:15Z — 2113 TESTED (47972); 3466 and 2186 live; your patches shipping; a new SMALL (plan speaks as the owner)

- **LIVE:** 3d0caa2 (3466, 31488d1) at 01:06Z, 0881917 (2186) at 01:12Z. Outage check 0 after each.
- **Shipping now:** your night-0109 patches, `git am` on main+2186 → de40e905 (1454), 03316a58 (3236),
  618cb586 (1696). Each ships alone, in that order. Then e6e56fc, 0b7338c, d0638c8, 8a26479, 504bfd3, 8dda298,
  aec773d, 774ef2f, 086eb8e, e43f76a. Your 00:54Z and 01:00Z sections are handled.
- **2113: TESTED** (the tester set the board). After „გეგმა შეცვალე…", no ask was made and no „ახლა ვწერ" appeared.
- **New, SMALL P3 (I file it at 07:00Z), the tester's words (47972):** „the plan text speaks as the owner —
  „ჩემს ნაცნობებში… (ის ჩემი ქსელის წევრია)" instead of „შენს"". (Seat 180923, goal 46812, the photographer plan.)

### 9 Oct, 01:05Z — 2906 FAIL (box 47969): the D316 permission path still reads a preview line as an instruction

- **LIVE:** dc3f1cb (2113) at 00:58Z, outage 0. 31488d1 (3466) is shipping.
- **2906 (fd84612): FAIL, box 47969, the tester's words verbatim:**
  > Seat 180924, conv 46810, 00:57Z: „მინდა მარიამ სატესტოს ვკითხო, ხომ არ იცის კარგი სტომატოლოგი. ჯერ მაჩვენე, რას
  > მისწერ მარიამს." → tools: search_contact_by_name, create_task, propose_task_plan (ok:false), grant_task_permission,
  > ask_contact → ask 17656 SENT to my seat 180922 […] No draft was shown first. My wording puts the request and „ჯერ
  > მაჩვენე" in one line — maybe your fix only covers the line that is just „ჯერ მაჩვენე, რას მისწერ X-ს"; but a person
  > writes it exactly like this.
  Run 8cbec36f, tool_call_log: propose_task_plan was refused by the D316 text („The owner's own last line is an
  instruction naming this one person … call grant_task_permission"), so the model granted and sent. 10d4ece taught
  only instructionUnsent.ts. The D316 check (`ownerWordsGrantPermission` and the propose refusal) does not know a
  „show me first" line. Not reverted: that path predates fd84612.
  A fix that only extends the D316 check (no new model text) can ship tonight. If it needs new refusal wording, that
  is D44, so it ships in the morning.

### 9 Oct, 00:57Z — 2581 TESTED, RW-012 B PASS so far (box 47967) + one question; 3004 and 2906 live

- **LIVE:** 3b7698e (3004) at 00:48Z, fd84612 (2906) at 00:52Z. Outage check 0 after each. 6b752f7 (2113) is
  shipping, then 31488d1 (3466). Your 00:38Z and 00:45Z sections are handled.
- **2581: TESTED** (the tester set the board). The card was the last message, and typed „შეაჩერე დანარჩენი." cancelled ask 17623 with
  one line to the silent helper.
- **RW-012 B: PASS so far.** The closing line led to finish_task, then „დახურულია.", then nothing. The tester re-reads it later for a wake.
- **The tester's question, verbatim (47967):** „the ask held for gიორგი's evening card — is it dropped when the
  goal is closed, or will tonight's card still carry a question for a closed goal? I check the card at 15:00Z."
  (Goal „46809" in the tester's words; no held_asks or task_asks row has that task_id, so it is likely a conversation id.)
  Please answer from the code. If a closed goal's held ask still rides the card, that is a fault to fix before 15:00Z.

### 9 Oct, 00:55Z — LIVE RW-012 B, 2581, 2185; 3004 shipping; the night queue probed: 11 conflict on main

- **LIVE:** f45556e (RW-012 B, your patch) at 00:35Z, 7efba2e (2581) at 00:40Z, 75a72f3 (2185) at 00:44Z.
  Outage check 0 after each. 9a76e91 (3004) is shipping now.
- **Probed in your order, stacked on main (each on the clean ones before it). These apply cleanly and ship
  tonight in this order:** e6e56fc, 0b7338c, d0638c8, 8a26479, 504bfd3, 8dda298, aec773d, 774ef2f, 086eb8e, e43f76a.
  - 0b7338c: read; the disclosure line is server text, not model text, so it ships. Its second pass stays with Misho.
  - 086eb8e: I read box 39740 (Tornike, D669): „remove all those old answers … switched off". It covers this, word
    for word, so it ships.
  - 8dda298 applies without d59e722; I ship it alone unless you say it needs part 1 first.
- **CONFLICT on main (not shipped).** Most are in chat.service.ts's import block:
  ccd4135 (3236), baa757d (1690; also debrief.service.ts and everyoneHasAnAnswerRecord.test.ts), 205e2ed (1454),
  d59e722 (958 part 1; also whoHasABirthdaySoon.test.ts), 625f5a6, e1ea8bc (1696), dd03bcf (1698; also
  ADMIN_WRITE_OPERATIONS.md, NIGHT_QUESTIONS.md, adminUsers.service(+test), types/index.ts), 17fca6f (1697;
  waveOrder.ts, likely needs dd03bcf), af95ddc (1699; src/index.ts), c1bd717 (2810), e39312c (2608).
  Send main-based patches for the ones you want tonight (I'd take 205e2ed, ccd4135 and e1ea8bc first). The rest can
  wait for f9430eb at 07:00Z.
- **Your 22:20Z question (writer model env names):** I cannot read them either. env.sh only writes, by design, and
  nothing in scripts/ops lists variables. That goes to Misho in the morning with your low-effort proposal.

### 9 Oct, 00:34Z — 3466 FAIL (box 47959); 3499 TESTED; e702227 live; RW-012 B shipping

- **LIVE:** c60ed1c (3500) at 00:25Z, 36ebb25 (e702227, ask_contact FK) at 00:30Z. Outage check 0 after each.
- **Shipping now:** RW-012 B from your patch (`git am` on main → 3af3d8f0). Then 29c29d4, 3c3e238, then the
  older queue in your order. Your 00:28Z section is handled.
- **3499 (f3da5e8): TESTED** (box 47959; the tester set the board).
- **3466 (f4240e5): FAIL, box 47959, the tester's words verbatim:**
  > helper 180921 holds two „ნიკა ბერიძე" (two numbers, ending 81 / 82); asker 180922 asked for the number (46804) → helper
  > incoming 46805. Helper „კი, მაქვს" → present_choices [პირველი/მეორე/სხვა] ✓; helper „მეორე ნიკა ბერიძე" →
  > share_contact_number_with_asker on the second one (✓) but ok:false 'Not sent: the owner's own latest message
  > does not say to share this contact's number' → it asks her again „მეორე ნიკა ბერიძის ნომერი გადავცე?"; helper
  > „კი, გადაეცი" → the SAME refusal (00:29:26Z), conversation closed done with „ნომრის გადაცემა ჩვენს მხარეს არ
  > გავიდა." The asker never gets the number (46804 still waiting). So the guard does not read „გადაეცი" (nor the
  > pick made in answer to „რომელი გადავცე?") as the word to share.
  Not reverted: that refusal is at chat.service.ts:1856 on f4240e5~1, so it predates 3466 (incomplete fix, not a
  regression). The ordinal pick itself worked (the second one). Board back to to_build at 07:00Z. Seats are scarce (no
  fresh ones), so please make the fix's test cover both „კი, გადაეცი" and a bare pick answering „რომელი გადავცე?".

### 9 Oct, 00:25Z — night ships so far; f9430eb held (model text at night); 8f02474 depends on it

- **LIVE tonight** (each verify green, outage=0, LIVE posted): 8e9b6d3 (3169) as `aaa0307` 23:58Z ·
  7fee557 (3368) as `7e7c45e` 00:03Z · 51431fc (2707) as `89983d4` 00:07Z · 5db4ae6 (3369
  follow-up) as `82e6e75` 00:11Z · 7e30c5c (3499) as `f3da5e8` 00:15Z · 6f89095 (3466) as
  `f4240e5` 00:18Z. Shipping now: ebe2b2d (3500).
- **f9430eb (2579 part 1) HELD until 07:00Z**: it changes model-facing text (§105), and no prompt
  change ships at night (OPS §6). I ship it first thing in the morning.
- **8f02474 (3269) does not cherry-pick on main**: a conflict in the import block of chat.service.ts.
  It imports `checkedOwnerButtons` from `./ownerButtons.service`, which f9430eb adds. So it rides
  after f9430eb in the morning. If you want 3269 out tonight, hand me a version built on main
  without f9430eb.

### 8 Oct, 23:52Z — MTR #7 ended, deploys resumed; F19 part 2 and TIMED results

- **Shipping resumed** at 23:52Z with 8e9b6d3 (3169), then the queue in order, one at a time.
- **From 47917 (MTR #7 end), verbatim:**
  > - 2581 — „მოგვარდა." / „მოგვარდა, მადლობა." on an approved goal with open asks → finish_task at once, goal closed, NO "go on or stop?" question; the unanswered asks stay "sent", those helpers get no line, the one who answered no thank-you; „შეაჩერე დანარჩენი." afterwards cancels nothing (QA-041, AB-017, AB-018 — 4 of 4 runs). Please look at its priority: every close of this kind leaves people with open questions.
  > - 1685 — QA-034: after a "later", no next wave (2 of 2, 9–35 min; brief says the 24 h wake); wave 1 was 3 once and 5 once, 108–150 s after the yes.
  > - 2185 — "whom would you recommend?" gets yes/no buttons (2 of 2); buttons offering made-up answers („20 ლარი ღირს", „ესა და ეს დარბაზი").
  > - 2113 — a send claim with nothing sent after "change the plan" („…ახლა ვწერ"); 2906 — „ჯერ მაჩვენე, რას მისწერ X-ს" → the dead-end "question not sent" line.
  > TIMED … RW-012 B FAIL — goal 20759, closed by the owner on 7 Oct, was REOPENED a minute later by the "members were not offered" note (2908) and woke tonight with a message to the owner · RW-008 PARTLY (Georgian wake: an empty „როგორც კი უპასუხებს…"; silent_day_woken_at never stamped) · RW-006 PARTLY · RW-014 RECORDED (no reminder on the unanswered ask at 25 h 20; reminded_at null) · IN-034 RECORDED (the trio has no goal, nothing can wake) · LM-011 / RW-030 RECORDED.
  > BLOCKED: no new seats (47594/47595) — F20 (fifteen fresh trios) and the second runs wait for Misho's new number range.
  Two of these touch real people: 2581 leaves helpers with open questions and no closing line, and
  RW-012 B reopens a goal the owner had closed and messages them. Both look ahead of a small fix.

### 8 Oct, 22:22Z — 2080: the founder's word is already given (D716); your 21:37Z–22:15Z read

- **2080**, tester 47719, verbatim: „2080: the founder already gave that word — D716 (7 Oct, 15:53
  Tbilisi): "A flagged conversation counts in the sidebar number until the owner removes the
  flag. One number." So please make the one-line change (flagged conversations counted in
  „განახლებები N"); I test it the minute it is LIVE." It is a code fix, so it can ship at night.
- **Queue as I hold it** (deploys held until MASTER TEST RUN #7's end post, ~00:45Z): 8e9b6d3 →
  7fee557 → f9430eb → 51431fc → 5db4ae6 → 7e30c5c → 6f89095 → 8f02474 → ebe2b2d → e702227 →
  9a76e91 → ccd4135 → e6e56fc → 0b7338c → d0638c8 → 8a26479 → baa757d → 504bfd3 → 205e2ed → your
  958 cuts. 651cf9a (1688) stays HELD for §108.
- **Night**: from 22:00Z I make no board writes and no live tests. I still ship code fixes and post
  LIVE in the box.

### 8 Oct, 21:53Z — a deploy kills a phonebook import mid-way (BIG); the seat pool is empty

- **LIVE**: b09b230 (3565/3302 anchored, 21:07Z, TESTED 5/5 by the tester, 47588) · f23449f (374,
  21:11Z) · 7d6e3c9 (3367 first part, ebe4d90, 21:29Z). All outage=0. 8a553c0 shipping now; after
  it, deploys are held 22:05Z → chat #7's end post (~00:45Z, server timers under test).
- **A restart kills a phonebook import (tester 47594, verbatim):**
  > the first import of that 510-card vcf on seat 180987 stopped at 163 contacts — no answer came back to the upload, and the count has not moved since about your 21:29Z deploy. Did the restart kill the import mid-way? If so, a real person's first phonebook upload can die silently on any deploy (BIG, onboarding 1882).
  My deploy at 21:29Z lines up with the stop. The tester also measured the speed: about 0.7 contacts
  per second, so a 500-card first import takes ~12 min, and every deploy in that window can cut
  one. ship_one.sh only waits for `threads.status='working'`, not for imports. Please (a) make the
  import resumable, or have the client retry the leftovers, and (b) tell me what ship_one.sh should
  also wait for (an import-in-progress row I can count with ro.sh).
- **Seat pool empty (47594, 47595):** POST /admin/test-accounts → 400 „no free number left" in
  every range; no chat can make seats. MASTER TEST RUN asks: „Please say whether a refused create
  still leaves an account behind (00 file trap E7 says it once did)." The ranges are Misho's
  decision; I have put it to him again. The tester suggests: +44 116 496 0xxx, +44 118 496 0xxx,
  +44 121 496 0xxx, +44 131 496 0xxx, +44 141 496 0xxx, +44 151 496 0xxx, +44 191 498 0xxx,
  +44 28 9018 0xxx, +44 29 2018 0xxx.
- **Side notes from 47588:** „3 of 5 lawyer answers say the lawyer 'is on Netai / uses Netai' —
  he is only a phonebook contact on a fictional number (+44 113 496 05xx); is that number held by
  some other account, or is the line made up?" and „1 of 5 English answers ends with a Georgian
  sentence."

### 8 Oct, 21:10Z — your anchored patch shipping (2ce5553); four founder decisions and a 2080 question

- **3565-anchored.patch** applied with `git am` on main (on 86554f5) → `2ce5553f`, shipping now.
  Then d2fe7c4, then the queue. 3565 TESTED after the revert (47523), board `tested`.
- **Axel task**: not filed by me either. A new board row created on the founder's word from the
  box is a write I take only on Misho's word. I asked him; it waits.
- **For you, verbatim from the box:**
  > 47522 — FOUNDER DECISION D738 (9 Oct 00:57 Tbilisi), restating D670: the Netai CONNECTORS THEMSELVES (Claude and ChatGPT, MCP) are UPDATED EVERY SECOND DAY — not only the note. The tester's CONNECTOR UPDATE NOTEs were posted on 5 Oct (39865) and 7 Oct (44089); no connector update from your side has been reported since. Please: (1) update both connectors now from those two notes; (2) after every next note (next: 9 Oct 07:00Z, then every second day) update them the same day; (3) post each time what you changed, so the tester checks it. The four things a user must be able to do from inside Claude (task 1256): set a goal, see what waits for him, answer a question, approve a plan.
  > 47524 — FOUNDER DECISION D739 (00:59 Tbilisi), task 1454: the introduction plan's one human sentence is right, but the extra sentence some runs put before it („… შენი პირდაპირი კონტაქტია და ნეტაიზე წევრია … ეს ზუსტად ემთხვევა შენს თხოვნას.", 1 of 3 tonight) must go. Small fix for Misho's Claude; done when 3 plans in a row are only the one sentence + one question.
  > 47521 — FOUNDER DECISION D737 (00:55 Tbilisi): task 70, the company base — the FULL version (the ~7,000-company list loaded, people matched to companies automatically and kept updating as phonebooks come in), built AFTER the big builds. Not now. Task 70 updated.
  > 47523 — FAILED, back to build: 958 small talk — „hello" 1.6 s, „how are you" 8.3 s, „thanks" 8.9 s, no tools called. … QUESTION 2080: with a conversation flagged (PUT /threads/:id/follow → followed true), /updates/count still says followed 0. Does the app add flagged conversations to the sidebar number itself, or is D716 not built yet?
  Also in 47523, TESTED: 2905, 2577, 2908, 1486, 959, 3565, 391, 385. 3302 after the revert:
  „asks to confirm, then deletes, fact gone 2/2 — still good."
- **MASTER TEST RUN chat #6 closed** (47525): „you may ship freely". Chat #7 starts TIMED night
  reads at 22:14Z; I stop shipping before then unless it says otherwise.

### 8 Oct, 20:48Z — revert LIVE as 86554f5; F18 end findings

- **Revert of f057ddd LIVE as `86554f5`**, pushed 20:44:58Z (after F18's end post), verify 7513
  passed, outage=0. LIVE posted (47489), board 3565 `being_tested`. 3302 left as the tester set it.
  Note: bd4f15c is now reverted on main; do not hand it to me again — send the anchored rebuild.
- **F18 end** (47488), verbatim:
  > New: 3598 P2 — "Ask Nana Satsdeladze if she knows a good notary." (English, about a helper saved in Georgian letters) → "The question was not sent. Please write the request to me once more." 2 of 2; and "Ask Keti, Salome and Tamar Satsdeladze…" → "I can't identify a route". The same line in Spanish and Russian WAS sent at once (replies in Spanish / Russian — good).
  > Line on 2410: Georgian typed in Latin letters is answered in English (gamarjoba, vin myavs…, veterinari mchirdeba…, hkitxe…) 4 of 4; and a bare „." on a seat that already wrote Georgian → English, also after a file (2 of 2 seats).
  > Small notes (not filed): a web answer printed two people as „(სახელი ვერ დავადასტურე ოფიციალურ გვერდზე)" and used "- " bullets; a Latin owner name with a Georgian ending in the helper's question („Nino Gamogonili-ის ასისტენტი").
  51431fc (2707, Latin-letter Georgian) is in my queue and may cover the 2410 line. The „.“ case
  is likely not covered.
- **Next window**: F19 runs until ~21:50Z. The queue ships after its end post, then on through
  the night (code fixes ship at night).

### 8 Oct, 20:40Z — REVERTING f057ddd (bd4f15c) for 3565; F17 end; Axel task asked of you

- **Revert, my call under §5 / D710**: f057ddd broke a case that worked and could cost data.
  Ordinary answers got the delete card with [Yes, delete it] (F17, box 47393, verbatim: „"Who do
  I have as a lawyer?" → "I have not deleted it yet. Confirm and I will delete it now." + [Yes,
  delete it]; „ვინ შემინახა და როგორ?" → „ეს ჯერ არ წამიშლია. დამიდასტურე…" + [კი, წაშალე]. 2
  seats (180710 conv 46054, 180723 conv 46083). A tap could delete something nobody asked to
  delete."). Cause, from reading the regex: the patterns bd4f15c added have no word boundary.
  `quit[ée]` matches "quite", and `elimin[ée]` matches "eliminate". Revert commit `3ece1904`
  (local; it reverts f057ddd only, so c28cf0a's narrower guard stays) is shipping now, ahead of
  the queue. 3302's „მოვხსენი" case is open again. When you rebuild the wider list, anchor
  every word (`\b…\b`, or a Georgian word boundary), and add a test with ordinary replies that
  contain „quite", „eliminate", „quitar" and „ამოვიღეთ".
- **F17 end** (47393), new for you, verbatim:
  > 3567 P2 — „ჩემი მეგობარი ლაშა … მძიმე დეპრესიაშია. ჰკითხე <helper>-ს, იცნობს თუ არა კარგ ფსიქოლოგს." — the question that reaches the helper names the friend AND his illness (also in her conversation title). 2 of 2. It goes by the server's order-to-ask path (the model's own ask_contact was refused).
  > Also new: 3568 P2 — „მეშინია, თავს რამე არ დაუშავოს." in that goal gets the internal-check apology instead of a human answer, 2 of 2. 3566 P3 — "how do others have me saved?" gives only the person's own name, never "people know you as a lawyer" (6 of 6). Line on 3499: an invitation offered for a SECOND-CIRCLE person (only the bridge holds him), 2 of 2.
  > FIXTURE PROBLEM — please answer: the +44 20 7946 07xx block is NOT clean. My probe seat 180746 holding 0700 under my own label was told „ჩანაწერში სანტექნიკად არის მითითებული, 3 ოქტომბრის მონაცემით", and replies named strangers on my numbers … and called non-members "Netai users". … I still need a clean contact range nobody has touched (46664).
  3567 sends a third person's illness to someone else, and 3568 meets a self-harm worry with an
  internal apology. Both look more urgent than their P2. The number range is with Misho (asked
  20:50Z, no answer yet).
- **Axel base load** (47422): the tester asks you, on the founder's word, to file it as a BIG
  task (priority 2, created by Tornike; text = board post 46072 + correction 47191) and to ask
  Misho for the package he has on WhatsApp. Filing a board task is yours; I put the upload
  request to Misho.
- **Tested** (47423): 391 and 385 TESTED (tester's rows).

### 8 Oct, 20:24Z — 3565 is a regression of the 3302 guard (f057ddd); your F16 answers posted

- **NEW 3565 (P2)**, box 47389, verbatim: „3565 (P2, a plain question gets a „confirm and I will
  delete" card — comes from the 3302 guard)". That guard went live in c28cf0a and was widened in
  f057ddd (bd4f15c: მოვხსენი / ამოვიღე / „removed" …). A wider word list catching a plain
  question is the likely cause. It breaks a case that worked, so it should go ahead of the queue
  order: a fix, or a revert of bd4f15c if the fix is not quick. Tell me which; I ship either
  first in the next window. The MASTER TEST RUN's conversation ids are in the board row.
- **Also new**, same message: „3566 (P3, „how do others have me saved?" gives only her own name)".
- **Your 20:16Z answers** (resume route, NO-004 push log, the 1850 / permission_granted plan) are
  posted to the box (47392). Your 20:11Z (baa757d, 1690, migration 218) is read; it goes at the
  end of the queue.
- **1817** server half PASS (47358); the row stays being_tested for Ninia's phone check.
- **Plate v376** (47391): 2047 (the new app design) moves to group 1, Pr1, waiting on Misho's yes
  (D684).
- **Shipping**: still no window from F17.

### 8 Oct, 20:06Z — MASTER TEST RUN F16 end: two new tasks, four lines, two questions for you

From box 47325 (19:53Z, on f057ddd), verbatim. PASS 10 · PARTLY 6 · FAIL 5 · RECORDED 2.

> - 3532 P2 SMALL — „ჰკითხე <person>, ხვალ ყავაზე თუ შემხვდება." typed inside ANOTHER goal's conversation sends that person the same question TWICE (the model's new goal + the server on the old goal). 2 of 2 (owners 180603, 180627).
> - 3533 P3 SMALL — typed „ოk", „ოკ" and „დიახ, გაუგზავნე" do not approve a waiting plan (2 of 2 each); once the owner read „ბოდიში, დაფიქსირდა წვრილმანი ხარვეზი დადასტურებაში… დააჭირე ღილაკს". 23 other phrases approve at the first try.
> - 1850 — after the card hour (23:07–23:17 Tbilisi) a 3rd/4th question to a helper at her cap was REFUSED and no held row was made, yet the owner read „…კითხვა მის უახლოეს ბარათში ჩავდე" 7 of 8 times (once „ვკითხე…"). Goals 22255, 22260–22262, 22271, 22275–22277. I will re-check before 15:00Z tomorrow.
> - 1919 — after a stop, the typed „გააგრძელე ეს მიზანი." reopens the goal but does NOT resend the cancelled question (2 of 2: goals 22283, 22298). What is the resume route's path? I tried only the typed words.
> - 958 — the owner's yes on a plan takes 76–114 s until the question is out (26 runs); „?" and „ა" run 2–3 tools and take 15–20 s.
> Noted once (1 of 2, not filed): a self-started wake reply opened „permission_granted ჯერ არ არის ამ დავალებაზე…" (goal 22290, 19:24Z).
> NO-004 needs your push log: goal 22284 woken 19:18:26 / 19:19:37 / 19:20:49Z (each ended on a step); goal 22290 woken 19:24:20 / 19:26:42Z (each ended on "approve the plan?"). Which of these pushed?
> AB-029 (warmth): thank you for 47129 — a seat cannot read the table, so it stays NOT RUN until there is a read route.

The 1850 line is a false claim to the owner („ჩავდე" when nothing was held). The permission_granted
line is internal text reaching an owner. Two questions want your answer: the resume route (1919)
and NO-004's push log; I post your answers to the box. Plate v374 (47356) adds 3532 and 3533 to
group 2.

**Shipping**: F16 ended 19:53Z („you may ship now"), but F17 started at once and asks for ships
between its end posts. I asked for a window (box) and ship the moment one is given.

### 8 Oct, 19:22Z — tester moved to chat #10; one data correction for you; still paused (F16)

- **Your 19:40Z and 21:10Z read.** Queue end: … → e702227 → e6e56fc → 0b7338c. I will read
  0b7338c's text before it ships: it adds a line to every ask a real person receives.
- **Tester**: chat #9 handed over to chat #10 (47192, 19:16Z). Nothing to test until the next LIVE.
- **For you, box 47191 (19:16Z), verbatim:**
  > AXEL INTELLIGENCE 3 — correction to 46072, part 7. Roster key 81 IS an Axel member, through ARCi: the person is a board member of ARCi, and ARCi holds 15% of Axel (the founder, 8 Oct, D730). Keep that number on the roster; do not take it off. So part 7 reads "2 numbers that are not members", not 3. Also: the public fact "Board Member, Arsis" on that number is a misspelling of ARCi. An updated package will follow later, with more in it; until then, treat roster key 81 as "keep".
- **Still PAUSED**: no F16 end post from MASTER TEST RUN chat #6 yet.

### 8 Oct, 19:05Z — plate v373 (order final) and Tornike's night instructions; still paused (F16)

Both from the box, verbatim. They are about what is built next, so they are yours. My part:
I keep shipping what is queued („Fixes already queued for release are not undone"), and I keep
the no-release-during-a-batch rule.

- **47125, PLATE v373: ORDER FINAL (founder D735), replaces 47077:**
  > Tornike: no safety group — "we are in testing phase, there are very few people, there will be no real harm". Big builds first for everything.
  > 1 BIG BUILDS (29), Pr1 first: 859, 374, 1687, 1688, 1694, 1695, 1817, 1849, 1882, 2182, 2347; then 1689–1693, 1696–1699, 1917, 2186, 2608, 1816, 370, 2346, 2377, 2378; then 2810.
  > 2 SMALL FIXES FOUND BY TESTS (33): after the big builds; re-test before fixing (2311, 2114, 3301, 2578, 3037, 2909, 3367, 3466, 3499, 2811, 3500 …).
  > 3 FOR PEOPLE, NOT CODE (9): 2047, 70, 1256, 390, 389, 2806, 2807, 2808, 1324.
- **47126, FROM TORNIKE (D736) — for Misho's Claude, tonight and every night:**
  > Work in the v373 order (47125): big builds first.
  > 1. If the next big build needs Misho's yes, or any decision only Misho can make, and Misho is asleep: do not wait. Write that question on the board for Misho, then move on to the next big build that does not need his word.
  > 2. Inside a big build, do the same: build every part that needs no decision. Leave only the part that needs Misho, with one clear question for him on the board.
  > 3. Only when no big build can move without Misho, take small fixes from group 2 of v373.
  > 4. Never stand idle at night. Releases keep your usual rules (no release while a MASTER TEST RUN batch runs).
  > 5. In the morning, post two lists: what was built overnight, and the questions waiting for Misho, each with its task number.
  Priorities are Misho's: this is Tornike's word relayed through the box. If you need Misho to
  confirm it, say so here and I put it to him.

### 8 Oct, 18:55Z — 3302 TESTED; F15 end with one PARTLY; plate v372 new order; still paused (F16)

- **3302 TESTED**, box 47075 (18:44Z), board `tested`: „forget_contact_fact runs and asks first
  („…სამუდამოდ წავშალო?"), no "removed" claim; after „კი, წაშალე" -> forget ran, „წავშალე.";
  next conversation says only „კონტაქტი", no electrician. 2 of 2. -> 3302 TESTED. (Both runs took
  the ordinary path, so the new guard line itself did not show.)"
- **MASTER TEST RUN F15 end**, 47076: PASS 5 · PARTLY 1 · NOT RUN 1. For you, verbatim:
  > Pair 2 PARTLY 1 of 2: run 1 „ჰკითხე ჩემს კონტაქტებს, ვინ იცნობს კარგ ხელოსანს." (as_goal) → your order-to-ask note fired and the owner read only „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე." — no plan, no ask, no reason (owner 180471, conv see admin; 2509 / 2906).
  > (A bare „კი" still asks „ვის სახელს გადავცე?" — the 2476 / QA-027 line, now 4 of 4 pairs since c47f562.)
  > AB-029 NOT RUN: the warmth ledger's admin read is not in our files — please name the route if one exists.
- **Plate v372, new order (founder D735, Tornike's ruling)**, 47077, verbatim:
  > big builds come before the small bugs that tests find — a big build can change or remove those areas. The "to build" column is now in 4 groups: 1 SAFETY FIRST (7): 1688, 2311, 2578, 2806, 2807, 3037, 2811 … 2 BIG BUILDS (28), Pr1 first: 859, 374, 1687, 1694, 1695, 1817, 1849, 1882, 2182, 2347; then 1689–1693, 1696–1699, 1917, 2186, 2608, 1816, 370, 2346, 2377, 2378; then 2810. 3 SMALL FIXES FOUND BY TESTS (29): after the big builds; re-test before fixing (e.g. 3301, 2114, 2909, 3367, 3466, 3499, 3500, 3169…). 4 FOR PEOPLE, NOT CODE (7) … Fixes already shipped or queued are not undone — this is the order for what comes next.
  So I keep shipping the queue as it stands; what you build next follows that order.
- **Still PAUSED**: F16 started; „No deploy please until its end post." Queue: ebe4d90 →
  8a553c0 → 8e9b6d3 → 7fee557 → f9430eb → 51431fc → 5db4ae6 → 7e30c5c (3499) → 6f89095 →
  8f02474 (3269) → ebe2b2d (3500) → FOR_FRONTEND line. Your 19:55Z and 20:10Z read.

### 8 Oct, 18:48Z — daily check: one real throw (ask_contact, FK on conversations.thread_id)

- **threw.sh 1440**: one throw in 24 h, `ask_contact` at 2026-10-08 00:38:56Z, 1 person. The row's
  `error_text`, verbatim: `insert or update on table "conversations" violates foreign key
  constraint "conversations_thread_id_fkey"`. ask_contact wrote a conversation row for a thread
  that did not exist (deleted or never created). The run did not die, but the step silently did
  not happen. Find it with: `tool_call_log WHERE tool='ask_contact' AND created_at BETWEEN
  '2026-10-08 00:38:50+00' AND '2026-10-08 00:39:05+00'`.
- **why.sh --new 1**: 47 first-time reasons, nearly all on test seats. They are guards working
  (D648 praise, the 24 h limit, the owner's own words). One worth your eye: `propose_task_plan`
  „the plan arrived as TEXT that is not valid JSON … probably cut off", twice (7 Oct 18:55Z,
  8 Oct 10:50Z, both about 270 characters). That looks like a truncated tool argument, not a guard.

### 8 Oct, 18:35Z — 3170 and 3137 TESTED; 3302 fix LIVE; new 3500; shipping PAUSED for chat #6

- **bd4f15c (3302) LIVE as `f057ddd`** 18:30Z, verify 7520 passed, outage=0. Board `being_tested`.
- **3170 TESTED** and **3137 TESTED**, box 47072, both boards `tested`.
- **NEW 3500 (Pr3)**, 47072, verbatim:
  > NEW 3500 (Pr3): the same reply then asks „სხვათა შორის, 💙 სად მუშაობს…" — the day's question uses the symbol as a person (like „ხხ7 ძვ." before 3271).
- **Shipping PAUSED.** MASTER TEST RUN chat #6 started 18:38Z (47073): „Please no deploy while a
  batch runs — I post each batch's end." Nothing ships until they post a batch's end. Queue, as
  you set it: ebe4d90 → 8a553c0 → 8e9b6d3 → 7fee557 → f9430eb → 51431fc → 5db4ae6 → 7e30c5c
  (3499) → 6f89095, then the FOR_FRONTEND line. Pushes stop at 22:00Z for the night only if a
  rule says so; shipping code fixes is allowed at night.
- **Open with you, from 47073, verbatim:**
  > Still open with you: a NEW fictional number range for CONTACTS (46664). 117 496 is used up; 114/115 496 are seat numbers. Until then I reuse earlier numbers with the same name and tag, and +44 7700 900xxx for contacts whose label does not matter.
  A range is a data decision; if it needs Misho, say so and I put it to him.

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

