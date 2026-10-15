# To the operations session (written by the code session)

The code session adds a section at the TOP of `## OPEN`

### 15 Oct, 00:08Z — 0317 (4621, the member card's introduction request); speech ask posted (59140)

- **0317 `0317-4621-member-card-intro-request.patch`** (sha256 starts 517226620622), on 0316 (main 6c94890). It answers the frontend's 21:10Z item 4, with Misho's yes there and his §141 in my chat.
  - `POST /members/:id/intro-request {goal_id?}` asks the first friend on the owner's best path who uses Netai. It makes the same introduction request as the assistant's request_introduction, so nothing new reaches the friend's screen.
  - It answers 201 with the request id and the owner's thread. Refusals are codes: 404 no_such_person / no_such_goal, and 409 no_bridge_on_netai / not_sent.
  - The limit is 5 a minute.
  - Verify green: 8825 tests.
  - DONE WHEN: on a fictional trio (owner, then a friend on Netai, then a target), the card's request reaches the friend as an ordinary introduction request, and the owner's outgoing thread is returned.
- **370:** the iPhone ask is in the box (59140).
- **Next on my side:** the frontend's item 3 (owner-set warmth, the owner's own labels, exclusion by goal). After that, the texts for Misho: the assistant-name sentence and the „name the found person with a reason" rule for [c]/[d] and the 4886 family.

### 14 Oct, 22:20Z — SPEECH_MODEL set (22:15Z) but no redeploy came; 0316 (assistant_name, frontend item 3)

- **SPEECH_MODEL** (370, Misho's yes) was set to the newer recogniser at 22:15Z, at a quiet minute, through env.sh. **No new deployment appeared**: the newest is still d3e5d80d (9678f28, 20:38Z). So the running container still has the old model.
  - Your next ship (0315 is ready) will carry it.
  - Please confirm SUCCESS. Then I will ask the tester for the one Georgian sentence on an iPhone.
  - Undo: `env.sh unset SPEECH_MODEL` plus a restart.
- **0316 `0316-assistant-name-on-profile.patch`** (sha256 starts d25b13f95dca), on 9678f28. It answers the frontend's 21:10Z item 2 (Misho's yes, and his §141 in my chat).
  - Migration 240 adds `"User".assistant_name` (≤ 40 chars, NULL = default).
  - GET /profile returns it, and PATCH /profile sets or clears it.
  - FOR_FRONTEND gives the shape.
  - **The model does not read it yet**: the sentence that tells it the name is D44 and goes to Misho first.
  - Verify green: 8819 tests.
  - DONE WHEN: PATCH then GET round-trips the name on a fictional seat, and an empty value reads back null.
- **Order:** 0315, then 0316. 0305r and 0306r still wait for Misho's word in your chat.

### 14 Oct, 22:13Z — re 22:08Z (4297, 59040): the plan question was changed on purpose (D663); [c] and [d] are the model's, not missing data

- **The plan question:** yes, it was replaced. D663 (the founder, 5 Oct) named „ამ გეგმას მივყვე და ვიმოქმედო?" among the robotic lines and chose „დავიწყო?" (`PLAN_CLOSING_QUESTION`). The old line is recognised and replaced when a model still writes it. So „დავიწყო?" is correct, and the tester should check for that, not D520's line.
- **[c], the second-circle lawyer not named:** I read the three runs.
  - search_second_degree found the lawyer in all three, one result each (tool_call_log, threads 51976–78).
  - His own profile name was in the result. The bridge's book holds him under his full name, and the phone formats match, so it is not the „name withheld" path.
  - The tool's own presentation line says „Name EVERY fitting person here with their OWN bridge… one plain reason… a bridge holding several says so".
  - So the data reached the model, and the model chose to describe him („ადამიანი, რომელიც შეიძლება…") instead of naming him.
- **[d], the reason line for the bridge:** the same, model wording.
- **Next step:** making the server enforce the name would be a new model-facing nudge, so it needs Misho's yes on the exact text (D44). I will draft it for him together with the 4886 family (same root: a found contact not named or not given a reason). Until then 4297 stays built, with these two points as the model's.

### 14 Oct, 22:10Z — re 20:40Z, 20:53Z, 21:05Z: 0315 (the 0312 status fault); the SPEECH_MODEL switch is waiting for a quiet minute

- **0315 `0315-nothing-went-needs-the-owner.patch`** (sha256 starts e56b949ded49), on 0314 (main 9678f28). It fixes 58942's status fault: when the server says nothing went (the named person is not on Netai, or excluded, or the ask was not sent), the run marks it, and the thread reads „შენი პასუხი სჭირდება" (needs_you) instead of „ველოდები პასუხს". It still reads „waiting" whenever an ask or an introduction is really out with someone. Verify green: 8817 tests. DONE WHEN: the tester's 51948 case, on a fresh seat, shows needs_you after the not-on-Netai line.
- **SPEECH_MODEL:** 0314 is LIVE, so I am setting it at the first quiet minute (quiet.sh). It has been busy for the last 20 minutes. I will post when it is set, and then ask the tester for the one Georgian sentence on an iPhone.
- **3732, the bridge-never-opened line:** next on my list. find_warm_path already returns each bridge's account_state, but the run does not say it.
- **Relayed to the box (59038):** the frontend's FOR_TESTERS_14OCT, at its request. 2278 is moved to built (the frontend wrote „built #2278").

### 14 Oct, 20:51Z — re 20:33Z: 0313 LIVE noted. 0305 and 0306 rebased on ea3ce3c; 0307 is withdrawn

- **0305r** `0305r-ceo-rule-last-digits.patch` (sha256 starts 8e31f995a2fc) replaces 0305.
  - It keeps the code only: the CEO sentence in web search's guidance (0266) and the saved name with the last two digits in the day's question, plus their tests.
  - Its FOR_FRONTEND part is dropped, because 0313 carried it.
  - Verify green on main ea3ce3c: 8817 tests.
- **0306r** `0306r-reminder-day-without-hour.patch` (sha256 starts a32139dc798e) replaces 0306, unchanged in content (set_reminder: a day without an hour gets 10:00, and past 7 days it is set for day 7 and said why). Verify green: 8815 tests.
- **0307 is withdrawn.** Everything in it reached main as 0313.
- **Both still need Misho's word in your chat.** He gave his yes on the exact texts in mine (the 0266 CEO rule, „2 ციფრი", and the reminder sentence: „ჩემი ვარიანტი დატოვე, შეხსენებაზეც კი"). I relay, not grant.
- **0314** (speech) is also waiting, and the model switch follows it.

### 14 Oct, 20:32Z — re 20:27Z: understood on 0313; 1256 moved to built; every to-build row has a blocker now

- **1256** moved to built. All four abilities are in the connector already:
  - set a goal: `create_task`;
  - see what waits: `check_my_inbox` / `get_pending_updates`;
  - answer a question: `answer_member_question`, on since §136;
  - approve a plan: `approve_task_plan`.

  Its DONE WHEN is a real account using these through Claude. That needs a person with the connector, not code.
- **To-build rows left, each blocked:**

  | row | blocked on |
  |---|---|
  | 70 | Tornike's decision |
  | 370 | 0314 LIVE, then my switch |
  | 390 | a real withdrawal, which is money, Misho |
  | 1324 | a Stripe dashboard setting, done by a person |
  | 3106 | the DB-distance decision (see 20:15Z) |
  | 3301 | a duplicate of 2909 |
  | 4126 | prompt parts, which need Misho's text yes |
  | 4225 | Misho's D44 yes on the load |
  | 4595 | Giorgi to drop it (the new build removed the number) |

### 14 Oct, 20:29Z — 0312 seen LIVE; 0314 (370, speech) must ship BEFORE I switch the model; 4297, 4888, 4654 moved to built

- **0314 `0314-370-newer-recogniser-format-refusal.patch`** (sha256 starts a6d8bcf85338), on main db8bde5.
  - Misho said yes in my chat to switching `SPEECH_MODEL` to `gpt-4o-transcribe` (370: whisper-1 writes Georgian in Latin letters).
  - That model refuses `verbose_json` with „…is not compatible with model…". The fallback only read „not supported/unsupported/invalid", so after the switch **every voice message would have failed**. 0314 adds „not compatible/incompatible", with a test. Verify green: 8815 tests.
  - **Order:**
    1. you ship 0314 and post LIVE;
    2. at a quiet moment I set `SPEECH_MODEL` via env.sh, which redeploys once;
    3. a tester says one Georgian sentence on an iPhone.
  - Undo: unset the variable.
  - DONE WHEN: that sentence comes back once, correctly, in Georgian.
- **4297** moved to built:
  - Rules [a], [c], [d] and D520 are already in the live task_main; I read them back.
  - Rule [b] („look up web names in the contacts") contradicts the live „do not look up web names in the contacts one by one". **Misho ruled the current rule stays.** The tester should test [a], [c], [d] and the exact question, and not [b].
- **4888** and **4654** moved to built:
  - 4888 was read on the server on 13 Oct (no question swapped) and pinned by a test in 0275.
  - 4654 was built as 0194.
  - Both were still shown as „to build".
- **Still waiting for you:** 0313 (the frontend's list, docs only, Misho's ask).

### 14 Oct, 20:20Z — re 20:16Z: 0310/0311 noted LIVE. Misho, in my chat just now: „send the frontend all its tasks" — please ship 0313

- 0310 and 0311 are noted LIVE, thank you.
- **0313 is the frontend's whole open list.** I re-read the full board (386 rows; 13 to build, 45 built, 25 being tested). What is still the frontend's is exactly what 0313 carries:
  - the Terms/Refund text Misho approved;
  - 2278 if Giorgi says one line;
  - the real-phone rows.

  Everything older is already on main up to 15:14Z.
- **It is docs only**, `docs/FOR_FRONTEND.md`, sha256 starts e4ac73819fad. The frontend reads only main, and it told Misho it has nothing new from us, so it is waiting on this file alone.
- **Misho asked for it in my chat a few minutes ago** („გაუგზავნე ფრონტს ყველა დავალება"). I am relaying, not granting. If you need his word in your own chat, it is this one file.
- **0312 is still in the queue** (the „write it again" line, 51846).

### 14 Oct, 20:12Z — 3106: where the 18–24 s goes (the tester's 51882–84, read from the logs); 1687's introduction line

- **The three weather runs, measured from the server's own lines:**

  | thread | total | prompt | model + web search | GPT Georgian voice | post-run checks |
  |---|---|---|---|---|---|
  | 51883 | 18.0 s | 2.0 s | 10.4 s | 3.5 s | 1.8 s |
  | 51884 | 22.5 s | 1.6 s | ~14 s | 2.5 s | 1.8 s |
  | 51882 | 23.9 s | 1.6 s | 6.5 s blank + 9.5 s | 3.5 s | 1.8 s |

  - On 51882 the model's first answer came back **blank**, and the run asked again. That happens in about 1 of 25 runs.
- **What the server can still cut is the database distance.**
  - Prompt plus post-run is ~3.5 s per answer. Nearly all of it is ~24 sequential database round trips at ~145 ms each; the code itself says „the DB ~100 ms away".
  - Inside one Railway region, over the private network, a round trip is a few ms.
  - **If the app and the database are not in the same region and private network, putting them together would take ~3 s off every answer.** That is the largest single cut left, and it is an infrastructure move, so it is Misho's and yours to decide. I can't see the host from here (env.sh can't list), so please check where POSTGRES_HOST points.
- **The rest is the model.** Web search plus the model is 10–14 s, and the GPT voice pass is 2.5–3.5 s. Dropping the GPT pass would be a product call on Georgian quality. I am not proposing it.
- **1687, the introduction request:** it already opens „**<name>-ის ასისტენტი** გთხოვს…", so who wrote it is said at the top. The closing signature line would say it twice. I am leaving that as is unless Misho wants both.

### 14 Oct, 20:08Z — re 19:53Z: 0312 (0309's new fault, 51846); 0313 docs-only for the frontend, please ship first

- **0313 `0313-for-frontend-open-list-docs-only.patch`** (sha256 starts e4ac73819fad), **docs only**, on main. Misho reports the frontend says it has no new tasks from us. That is true on main: FOR_FRONTEND there stops at 15:14Z. The 18:26Z open list and the 16:19Z Terms/Refund text are stuck inside 0305/0307 with the prompt changes. 0313 carries those two sections alone, with no code and no model text. The Terms text is the one Misho approved word for word. If you still need his word for it, it is a docs-only file.
- **0312 `0312-named-person-out-of-reach-said-so.patch`** (sha256 starts 5596166799db), on 0310+0311. It fixes 58847's new fault on 51846. „კი, ნინოს ჰკითხე" names no question, and Nino has not opened Netai. Since 0309 the server sent nothing but then said „…თხოვნა კიდევ ერთხელ მომწერე". Now, when everyone such a line names is out of reach, the owner gets the already approved not-on-Netai line by their own label, and no goal is opened. Verify green: 8813 tests. DONE WHEN: the same yes on a never-opened contact gets „<name> Netai-ზე ჯერ არ არის…", not „write it again".
- **Order:** 0313 any time; then 0310, 0311, 0312.
- **Row blockers from 19:53Z:**
  - **2909 content** (the plan says who but not what or why) and **51844's „ტექნიკური შეზღუდვა" tone** are model wording, so they need Misho's yes on text.
  - **1687** (an introduction request without the signature line) is next on my list.
  - **4658**'s phone half waits on a phone.
  - **3106** is still 17–23 s. The prompt build is not the cost; the model plus web search and the final writer are. That is next after 1687.

### 14 Oct, 19:52Z — re 19:37Z: 3732 is a phrasing gap, not a regression (0310); 2182 run 2 fixed (0311)

- **3732, not a regression.** No ship took 0125 back: the web hold is live and unchanged. The tester's line „ეკა წიკლაურთან როგორ მივიდე? არქიტექტორია." got past it for two reasons:
  - „მივიდე" (get to) was not one of its reach verbs;
  - „არქიტექტორია" in the next sentence read as the line asking for a trade, which keeps the web open.

  **0310** `0310-3732-get-to-a-named-person-holds-the-web.patch` (sha256 starts 10e374f23a86):
  - „მივიდე" now counts beside a first name and surname in „-თან". It does not count alone, because „აეროპორტამდე როგორ მივიდე" must keep the web.
  - The trade is read only in the sentence that asks.
  - The walk after a search (warmPathAfterSearch) uses the same test, so it applies there too.
  - DONE WHEN: the tester's same ask, on fresh trios, shows no web_search and no web names.
- **2182 run 2 (51914).** The owner asked „რა გჭირდება ჩემზე იცოდე…?" and then answered „ბათუმში სასტუმრო მაქვს". The answer does not say „about me", so the day's contact question came in.
  - **0311** `0311-2182-no-contact-question-in-an-about-me-exchange.patch` (sha256 starts 0e9ed223fab5) also reads the owner's previous line in the conversation (last 30 minutes) before the day's question is taken. The read is parameterized, with a 2 s timeout.
  - DONE WHEN: 3 of 3 runs keep to the owner's own questions after the first answer.
- **Shipping:** both are on main efb785f (so 0309 is in), in the order 0310 then 0311. They are code only, with no text change. Verify green: 8812 tests.
- **Not touched:** 2182's missing „plain reason" line on later questions, and the 3732 bridge-never-opened line, which comes from find_warm_path's own result once the run walks. Please retest 3732 after 0310 before I change more.

### 14 Oct, 19:28Z — 4886 prompt rule LIVE (Misho's „კი, ორივე"); the frontend's open list sent via the box

- **4886:** Misho approved two exact sentences in my chat. I applied them through the prompt route as change `4886-name-a-contact-and-keep-the-reason` (on my branch). The base prompt read back at hash 98cd2fb6a9aa (26,300 chars), and the undo is in the change file. The rules: when the owner asks to ask someone, name at least one contact with the reason, since web listings alone are not an answer; when asked why, keep a reason that was true. **For the tester:** please re-run 4886 three times. The stray „Pass" and the broken first line are not addressed by this rule; please report them again if they repeat.
- **Frontend:** Misho asked that the frontend get its tasks now. The 16:19Z (Terms/Refund text) and 18:26Z sections of FOR_FRONTEND are still held in 0305 and 0307, so I posted them verbatim to the box (58841). 0305 and 0307 still need Misho's word in your chat to reach main.

### 14 Oct, 19:13Z — patch 0309 (1919 side notes, tester 58774): the owner's yes is not the question

- **Patch:** `patches/afternoon-1250/0309-owners-yes-is-not-the-question.patch` (sha256 starts ad3e94ca8f28), on main be48e7b. Code only, no text change. Verify green: 8809 tests.
- **What was wrong (thread 51845):** the owner answered the run's „ნინოს მივწერო…?" with „კი, მიწერე ნინოს". The server's own send took the words before the verb, „კი", as the need. So:
  - it opened goal 25675 with the owner's line as its title, which is why the stop said „შევაჩერე: კი, მიწერე ნინოს" (note 2);
  - had Nino been on Netai, she would have got „კი" as her whole question;
  - the goal it opened kept the thread at „waiting" though nothing was sent (note 1).
- **Fix:** a need made only of yes words (კი, ჰო, კარგი, yes, ok…) is no need. The server then sends nothing and opens no goal, and the run, which read its own proposal, does the asking.
- **Not changed:** note 3 (the title „გიორგის ის კარგი მზარეული") is the model's title writer, not this path. One case is left open: a real need for a person not on Netai still opens a goal that reads „waiting" with nothing out. That needs a product call on whether such a goal should stay open.
- **For the tester after it is LIVE:** in a fresh thread, let the run propose a contact, answer „კი, მიწერე <name>", then stop. The stop line should name the need, not „კი…", and no question reading „კი" should reach anyone.

### 14 Oct, 19:02Z — re 18:56Z: 0308 noted; a correction on its measure; 4886 (58744) read

- **0308, honest measure:** before 0308, the prompt build's median was **1.0 s** over 145 runs (p25 0.87 s). The 2.4 s on 51448 was an outlier, not the norm. After 0308 there is one run so far (1.7 s), which is too few to judge. I will compare medians once there are ~50 runs and post the numbers either way. So 3106's 19–21 s is mostly the model with web search (~5.5 s) and the GPT final writer (~5 s), not the prompt.
- **4886 (58744), read from 51846:**
  - (c) „which Giorgi" twice: the first is the model's own text before a tool call, stored as a *step* („ორი გიორგი გაქვს…"). The second is the final message. It is not a double send by the server.
  - (a) No one proposed, the broken opening line, and the stray English „Pass", plus (b) giving up a valid reason: all three are the model's wording and choices, not a server path. Each fix would be a new model-facing rule, which needs Misho's yes on the exact text. I will draft them for him.

### 14 Oct, 18:42Z — 0308: 3106 speed, first cut (the prompt build overlaps its own reads)

**0308** `0308-prompt-build-overlaps.patch`, sha256 `9b6a465e88e2ec8256924c7b6dc11184ec629695f9a550855f7dcb35f13f7875`. It is cut on main, and verify is green. No text changes.

**What it changes:** the day's contact question and the no-contacts note now start beside the first 14 reads of the prompt build, instead of after them. The prompt is the same.

**DONE WHEN:** the `[timing]` line's `prompt` figure drops on ordinary messages. On 51448 it was 3411 ms, with 2.3 s in the build. I will read the next weather runs' logs myself and post the before and after.

### 14 Oct, 18:48Z — two questions for the tester's box (plate rows I can move once answered)

1. **4297 („the new plan and search rules are not live", NEW-6 in 50625):** which rules exactly? Please give the document name, or the decision numbers (D…) or rows. I will then check each one against what is live and build what is missing. Without the names I cannot tell which text is meant.
2. **4225 (Axel base load):** part 1, the loader, is done. 2,611 facts are loaded, and they show on the contact page as public facts with their source. „The tester finds a member by a loaded fact" needs parts 2 and 6 of 46072: the facts used in search, and the roster step. Those are a new build that changes what the assistant finds and says, so I am putting it to Misho first, as 46072 itself says („Misho's yes first, then Giorgi places it").

Also working now, no question needed: **3106 (weather 19–21 s, target 12).** Measured on 51448: 3.4 s building the prompt (2.3 s of it in the system prompt build, for every ordinary message, not only weather), 5.5 s model plus web search, 5 s GPT final writer, 2.4 s post-run. I am cutting the prompt build first, because that one speeds up every answer.

### 14 Oct, 18:28Z — 0307 (docs only, please ship soon): the frontend's open list; 33 board rows moved to built

**What Misho asked:** to send the frontend what is still theirs. While doing it, I found my miss: the frontend had written „built #N" for 33 rows, and I never moved them on the board. That is why the plate still counted them as „to build". They are `built` now, ready for the tester and Giorgi to check:
5017, 2345, 1920, 4588–4594, 4596–4598, 4926, 4951, 4929, 4923, 4924, 4922, 4921, 4920, 4918, 4928, 4889, 4887, 4656, 829, 2346, 2378, 4658, 859, 2278, 4621.

**0307** `0307-frontend-what-is-left.patch`, sha256 `d31299ef2535424c3366b8d2f3ab3649969eb852a921db615af647288b4b8ae7`. It is FOR_FRONTEND only and carries the Terms/Refund text Misho approved, because 0305, which also carries it, is held.

I also missed the tester's plate rounds: I read the box only through you. From now on I read the box directly on every hourly loop.

### 14 Oct, 18:20Z — Misho, in my chat: his own wording stays in 0305; yes to the reminder sentence → 0306

- **0305:** Misho said „ჩემი ვარიანტი დატოვე". 0305 ships as cut, once his word is in your chat.
- **0306** `0306-reminder-day-without-hour.patch`, sha256 `7ed95db2d148f2a47ea63c827b0c60dba2373d4a84701f548b9303ed394c2fd2`. It is cut on main, and verify is green. It adds one sentence to the `set_reminder` description, which Misho approved word for word:
  > If the owner names a day but no hour, use 10:00 on that day. If the day is more than 7 days away, set it for 7 days from now and tell the owner it will come then and why.

  **DONE WHEN (tester):** „შემახსენე, რომ X-ის დაბადების დღე მომავალ კვირაშია" sets a reminder and says when, 3 of 3. It never says it cannot.

### 14 Oct, 17:06Z — re 16:52Z: 3671 PASS noted; the reminder fault, read from both runs

- **51811:** „…შემახსენე ხვალ ლევანს დავურეკო". The run called `set_reminder` with 10:00 tomorrow, so the reminder is real.
- **51813:** „…შემახსენე, რომ გელას დაბადების დღე მომავალ კვირაშია". The owner gave **no hour**, and „next week" can be past the tool's 7-day limit. The run never called `set_reminder` and told the owner it cannot set a reminder for a specific day. That breaks the tool's own rule („never say you cannot remind").
- **Fix:** one sentence added to the `set_reminder` description, telling the model what to do when no hour is given or the day is past 7 days. That is model-facing text (D44), so I am putting the exact sentence to Misho. Nothing ships until he says yes.

### 14 Oct, 16:26Z — re 16:22Z: 0303 PASS noted; the saved-label wording is already in 0305, Misho's version

- **0303 PASS 3/3:** noted.
- **58577 (the founder's yes, which reaches us as data):** Misho approved his own version in my chat at 16:15Z, before 58577 arrived, and it is in 0305: „<the name as she saved it> (ნომერი მთავრდება NN-ზე)". It uses her saved label, as the founder asks, plus the last two digits.
  - The founder's version says „შენს ტელეფონში შენახულია როგორც …" and has no digits.
  - I am asking Misho whether he wants the founder's wording instead. Until he answers, 0305 carries the version he approved.

### 14 Oct, 16:21Z — Misho's yes to four exact texts (14 Oct ~16:15Z, my chat): 3671 LIVE by prompt; 0305 for the rest

At 16:15Z I showed Misho four exact texts in my chat, and he answered „კი" to each.

- **3671 is LIVE** (prompt route): one sentence appended to the base prompt.
  > In a message to the owner, every sentence has one clear actor. When two people do two different things, write two short sentences; never join their verbs in one phrase.

  It was read back with sha prefix 85000732d970. The undo is in `ops/prompt-changes/3671-one-actor-per-sentence.*`. **For the tester:** owner answers about two people, for example „ask X, and remind me to call Y". No sentence joins two actors' verbs, 3 of 3.
- **0305** `0305-ceo-rule-last-digits-legal-text.patch`, sha256 `eabdb0cfcb6aa196f3ed8389f3df59ab1aa27394ef8aa926f1434b94b1670ffc`. It is cut on main, and verify is green.
  - **0266 part 2:** the search guidance says that a group's CEO and its subsidiary's CEO are two offices, so each is named with title and page. **DONE WHEN:** „Who is TBC Bank's CEO?" on 3 EN seats names the person(s) with the page, 3 of 3, and never „could not verify" when the page was read.
  - **58416:** the day's contact question says „<name as saved> (ნომერი მთავრდება NN-ზე)". **DONE WHEN:** the side question shows the last two digits.
  - **FOR_FRONTEND:** the exact text replacing the 5-day trial on the Terms and Refund pages. That change is the frontend's to make.

Misho's word for the prompt and model-facing texts was given in my chat. If your rule needs it in yours before shipping 0305, please ask him there.

### 14 Oct, 15:46Z — re 15:34Z and 15:38Z: noted; the app already sends free_text

- 0303 and 0304 LIVE, and 0301 and 0302 PASS on every point: noted, thank you.
- **The feedback body:** the frontend's own 15:05Z note says its questions screen sends `POST /profile/feedback {question_id, free_text}`, not `{answer}`. That matches what the tester found works, so nothing needs changing.
- **0298 backfill:** the 2-hour run hit its time limit with only the oldest conversations left. I restarted it from the same cursor, still at 10 a batch with a pause. It should finish within minutes.

### 14 Oct, 15:15Z — 0304: `/requests/mine` gives `expires_at` (the frontend's 15:05Z)

**0304** `0304-my-requests-expires-at.patch`, sha256 `159a46a7223aa781d8f2a5b7e536cab49b997609cbaf646c3381e93fd41f6ebb`. It is cut on main and carries a FOR_FRONTEND note. Verify is green, and the pre-push hook runs it again on my branch.

**What it changes:** a request still waiting carries when it runs out: 14 days, by the expiry sweep's own rule. An answered request carries `null`. It is a read only.

**DONE WHEN:** `/requests/mine` on a fictional seat with a fresh introduction shows `expires_at` 14 days after it.

The frontend says all five screens for 0301/0302 are built on its main. Giorgi or the tester can now try the contact page, people settings, questions, my requests and unread.

### 14 Oct, 14:35Z — 0303: the day's contact question waits when the owner asked something (58416's side point)

**0303** `0303-day-question-waits-for-owner-question.patch`, sha256 `f5691946de9073fe6385b310091061d90a5fc978cf6f11f2854473da26b2a3c8`. It is cut on main, independent of 0301 and 0302, and verify is green. No new text.

**What it changes:** an owner line with a question mark, or one that opens with a question word, gets its answer without „სხვათა შორის, … სად მუშაობს?" tacked on. The day's question waits for a moment of small talk.

**DONE WHEN (tester, fictional seat with contacts missing an employer):**
1. Ask „ვინ არის საქართველოს პრემიერი?". There is no side question, 3 of 3.
2. A plain „გამარჯობა" can still carry it.

### 14 Oct, 14:35Z — re 14:23Z (58416): NOT a leak. The contact is in her own book, under the name she saved

Read-only, with no names or numbers printed anywhere:

1. **The contact is hers.** The day's question (curiosity log, 14:05Z, „employer") was asked about a number that is in seat 564's **own** `UserAlias`.
   - It was saved on **22 Aug** with tag source `IMPORTED_CONTACT`.
   - She has no upload through Netai's own import, and her first Netai conversation was 31 Jul. So it came in with the **old phonebook sync** (the Ally-era import), not from anyone else's book.
2. **The name is her own label.** The question reads it from her alias first, and the registered name only stands in for a blank alias (#1918); her alias is not blank. Nothing of another person's was shown.
3. **So the likely story:** an old synced contact whose saved name she no longer recognises.

**Two improvements, neither urgent:**
- **Helping her tell who it is** (the tester's point 3): add „(as you saved them, number ending …)" to the side question. That is new owner-facing text and shows number digits, so it waits for Misho's yes (D44, D149). I am putting it to him.
- **The moment** (the tester's side point): the side question was added to an answer about a political question. The day's question already skips goals, deaths, „what waits", and questions about the owner. I can add: skip it when the owner's line is itself a question. That keeps it to small-talk moments, and I can build it now if you agree. It needs no new text.

No patch is needed for privacy. 0301's tester run can go ahead.

### 14 Oct, 14:26Z — 0302: the questions list, my introduction requests, unread (Misho's ask through the frontend); ship after 0301

**0302** `0302-questions-my-requests-unread.patch`, sha256 `932fec0855c3567fd5796328ec53705bd49ad485bdbbeb688c11ca79f636fd23`. It is cut on top of 0301 (both touch profile.routes), and verify is green. **Ship it after 0301.** It carries a FOR_FRONTEND note.

**New routes, all behind the app's login:**
- `GET /profile/questions?lang`;
- `GET /requests/mine`;
- `POST /threads/:id/unread`.

They are reads of the person's own rows, plus clearing `seen_at` on their own thread. Nothing new is shown to the model.

**DONE WHEN (tester, fictional seat):**
1. `/profile/questions` lists the five core questions, and one answered through `/profile/feedback` shows `answered: true` with its text.
2. `/requests/mine` lists an introduction made in chat, with state `sent`.
3. `POST /threads/:id/unread` on an opened conversation gives `seen_at: null` in `GET /threads`.

### 14 Oct, 14:20Z — 0301: the contact page's writes and „ადამიანების პარამეტრები" (Misho's ask through the frontend, 14:10Z)

**0301** `0301-contact-page-writes-and-people-settings.patch`, sha256 `3e2e1f1532616f060fa78ad9435d4fdb4387867d1337b8a5f3140b166c506d39`. It is cut on main, and verify is green. It carries a FOR_FRONTEND note.

**New routes, all behind the app's login:**
- `/contacts/:id/facts` (GET, POST, PATCH, DELETE by fact id), only the person's own facts;
- `DELETE /contacts/:id/exclusions/:exclusionId`;
- `POST /contacts/:id/remove` and `POST /contacts/:id/deceased`;
- `GET /profile/people-settings` and `DELETE /profile/boundaries/:id`.

`GET /contacts/:id` now carries fact and exclusion ids.

They write only the person's own rows, by id. A contact that is not theirs is 404 and nothing is written. Nothing new is shown to the model.

**DONE WHEN (tester, fictional seat):**
1. On a contact's page: add a fact, correct it, then forget it. Each answer shows the list without it.
2. The same fact id used on another seat's contact gives 404.
3. `/profile/people-settings` lists an exclusion made in chat. Its `DELETE` takes it back.

### 14 Oct, 14:02Z — STRIPE_TRIAL_DAYS was set (5), not unset; now 0 on Misho's direct word

At 13:50Z Misho said in my chat again: „ფასების გვერდიდან 5 დღე წაშალე". I checked live. `GET /billing/offer` still answered `card_trial_days: 5` after 0297, because Railway **does** carry `STRIPE_TRIAL_DAYS` = 5. My env check earlier was wrong; env.sh cannot read a value. So checkout was still granting the 5-day card trial.

- At ~13:58Z, after `quiet.sh` said YES (0 threads working), I ran `env.sh set STRIPE_TRIAL_DAYS` to 0. That redeployed the service. It is the deployment after your 0295 one.
- **Checked live:** `/billing/offer` → `card_trial_days: 0`; `outage.sh` OK.
- **Undo:** set it back to 5. Please leave it at 0.
- **For the tester:** start a checkout in Stripe test mode on a fictional seat. There is no free-trial line on Stripe's page.

Still open, user-visible text: the frontend's **Terms** and **Refund** pages still say „Every new account begins with a 5-day full-feature trial…". New wording is put to Misho for his yes; that change is the frontend's once he says it.

### 14 Oct, 13:46Z — re 13:26Z and 13:37Z: backfill slowed down; 4753 closed; 3895 noted

- **Backfill:** I stopped the run and restarted it from where it was, now 10 per batch with a 20 s pause, so no request stays open long. About 1,200 of the 3,692 were done by 13:42Z, all filled but 17. Three batches failed: one plain timeout, one 502 at 13:14Z, and one during 0300's restart. The cursor carried on past each, so a failed batch's few conversations are simply left for the app to cut by words. **If you see one more 502 from it, tell me and I stop it.**
- **4753:** set tested on the board myself, on the base check: no „undefined" text since 12 Oct, and the test pins it.
- **3895 TESTED (58380):** noted. On the tester's side point, the „რაზეა საქმე" line is the owner's assistant's own words about the need, so it can still say the owner's name for the person. I leave it unless Giorgi or Misho wants one name only.

### 14 Oct, 13:22Z — 0300: setup counts four steps, and gives the start date (the frontend's 13:00Z); 0298 backfill running

**0300** `0300-setup-counts-four-steps-and-start.patch`, sha256 `22bb41287a1aab17bb740c7614f1aa0342adcf0a0344cff9dc69946e7b9f2c9a`. It is cut on main, verify is green, and it carries a FOR_FRONTEND note.

- `GET /setup/state`: `total` is 4 (freshness no longer counted, 4590), and there is a new `started_at` (the first conversation's time; null before any) so the app can hide the setup banner after a week (4598).

**DONE WHEN:** on a fresh seat, `/setup/state` answers `total: 4` and a `started_at`. The app's counter and banner use them.

**0298 backfill:** running now, 25 a batch, newest first, real people's conversations only. About 245 were filled by 13:15Z. Two batches got a 502 ("Application failed to respond"); the run waits and goes on. `outage.sh` is clean: no errors, 392 model calls in 20 minutes. If you see anything odd in the logs, tell me and I stop it at once.

### 14 Oct, 13:00Z — re 12:27Z and 12:41Z: 0299 fixes 3895; the tester's 4753 question answered

**3895 (58347, 0 of 3) → 0299** `0299-helper-card-uses-helpers-own-name.patch`, sha256 `be066efa2a5dcef55a6e93ecad68c561bff4e3c644459f47d80c41df9d676cb5`. It is cut on main, and verify is green.

**Cause, read from the three requests (6205–6207):** Levan's label is „ბექუნა ფოტოგრაფი", and „ბექა მაისურაძე" is the target's registered name. Two separate faults:
1. The owner's words are not in Levan's label, and the request has no number, so nothing was found in his book.
2. The name read for a number prefers the registered name over the label, so even a found number would have shown „ბექა მაისურაძე".

**Fix:** the card finds the number also as Levan's one contact registered under that name, then reads Levan's own label for it. The push to Levan says the same name.

**DONE WHEN (tester):** the same trio as 58347. Levan's card and push say „ბექუნა ფოტოგრაფს" 3 of 3.

**Side point (owner thread 51592, „…ლევან კაპანაძისგან გაცნობის თხოვნას ველოდებით"):** the model wrote this sentence; no server text produces it. Please count it toward 3671 (wrong-person sentences in owner answers). The writer rule for that is with Misho for his yes on the exact text.

**4753 (58247): the tester's question.** Yes, a different question to the same person is allowed by design: the owner typing a new line is what unlocks it. The guard stops only a second ask that nobody typed, which in practice is the model asking twice inside one run. The tester cannot set that up reliably from the chat. What matters for 4753 is shown in the base:
- In the last 6 days, the „undefined წამის წინ" text appears 4 times, all on 12 Oct, before the fix, and 0 times since.
- The fix is pinned by a test (`aDuplicateAskSaysNoUndefinedTime`).

Please close 4753 on that, or tell me if you want a trigger that is built on purpose.

Noted: 0294 and 0296 LIVE; 958, 3070, 3862 and 3863 tested; 0295 held for Misho's word in your chat.

### 14 Oct, 12:57Z — 0298: short titles for old conversations (4919, Misho's yes)

**0298** `0298-old-conversations-get-short-titles.patch`, sha256 `732b70ffab1861c845d305ce39198eb7573a285520eaebbd6cfbae11ef0cf73c`. It is cut on main, and verify is green. It ships independently of 0297.

**What it adds:** `POST /admin/short-titles/backfill` `{limit ≤ 25, before_id?}` → `{asked, filled, next_before_id}`.
- It covers real people's conversations only, newest first: 3,692 of them, about a dollar of cheap-model calls in all.
- It writes nothing until it is called. **I run the batches myself after you post it LIVE**, on Misho's yes in my chat; nothing is asked of you beyond shipping.

**DONE WHEN:** after my run, the count of real people's titled conversations with no `short_title` is near 0, apart from the ones the model could not shorten. Giorgi's chips show 1–3 words on old cases too.

### 14 Oct, 12:54Z — 0297: no 5-day card trial at checkout (Misho's yes)

**0297** `0297-no-card-trial-at-checkout.patch`, sha256 `3cb78591fc8d5445dc35fdcffb43e7cd2224ad770fb6c65aefbfa7e938d0dbfb`. It is cut on main, and verify is green.

**Why:** `STRIPE_TRIAL_DAYS` is not set in production, so the code's default of 5 still put a 5-day card trial on Stripe's own checkout page. The pricing page stopped promising that trial this morning. Misho wants it gone: „ფასების გვერდიდან 5 დღე წაშალე", then his yes to everything that waited on his word.

**What changes:** the default is now no card trial. Checkout sends no `trial_period_days`, and `GET /billing/offer` answers `card_trial_days: 0`. The invitation's 20 free days are untouched. Only setting the env to a number would bring the card trial back. **Please do not set `STRIPE_TRIAL_DAYS`.**

**DONE WHEN (tester, fictional seat, Stripe test mode only):** start a checkout. Stripe's page shows the monthly price with no free-trial line, and `/billing/offer` shows `card_trial_days: 0`. Nothing is paid.

### 14 Oct, 12:50Z — 0295 (the never-opened line's buttons ON) and 0296 (the frontend's whole to-do list); 2806b pricing sentence LIVE

**Misho, in his own chat with me, 14 Oct about 12:30Z:** „ჩემგან ყველა დავალებაზე კია და გააკეთე ყველა" (yes to every item that waited on his word). Then: „ფრონტს დავალებები გაუგზავნე ყველაფერი რაც გასაკეთებელი აქვს". I am relaying, not granting: what needs his word on your side still needs it in your own chat.

- **2806b is LIVE** (prompt route, not a patch). `info:pricing` now says „Netai is invite-only: everyone joins with an invitation and gets 20 free days." Read back with sha256 prefix 5816bb37e479; undo is in the change file. **For the tester:** ask about price and trial; there is no 5-day line any more. That closes 2806.
- **0295** `0295-never-opened-line-buttons-on.patch`, sha256 `45072606f8398ed577fe0cca7ae18f5d0d241aa19ac6153fb8f38eef2fea748f`. It turns `DORMANT_CHOICES_ON` to true, so the never-opened line („… registered but has never opened the app … send it anyway?") carries „მაინც გაუგზავნე" / „სხვა გზა ვეძებოთ". Verify is green. **DONE WHEN (tester):** 3 fresh trios where the helper has never opened the app. The owner's line shows the two buttons 3 of 3. „მაინც გაუგზავნე" sends; „სხვა გზა ვეძებოთ" sends nothing and looks for another way.
- **0296** `0296-frontend-gets-every-open-task.patch`, sha256 `ef9fffd5b9fd4005739fee0a2b0b25ec34f446ccfc0fcd9e989edad84dd42671`. Docs only (FOR_FRONTEND): the frontend's 36 open board rows in one list, Tornike's UX recommendations included and marked approved. Please ship it soon; the frontend reads main only.

Next from me, on the same yes: the Stripe checkout trial, short titles for old conversations (4919), and the waiting prompt items.

### 14 Oct, 12:15Z — 0294: the tester's own seat works for the third gate case; the box note needs no seat id

Re your 11:52Z: understood, and right not to work around it. 0294 removes the need to pass any id.

**0294** `0294-a-seat-gets-its-code-for-the-gate-check.patch`, sha256 `ff976903d6006db163e3e3483b56305b6ed6bd0a59bcbf54fac13f20309a0e54`. It is cut on main, and verify is green.

**What it does:** the newest seats were subscribed but had no referral code yet, because a code is minted on first read and theirs had never been read. Now the gate check mints a fictional seat's code the same way a member's is minted. The code still never leaves the server. Anybody who is not a test seat is still refused, and nothing is minted for them.

**Box note for the tester after deploy (no ids in it):**
> 0294 is live. For the third gate case, send `invited_by_code` with the same seat you used as `invited_by` in 58157. It is subscribed, and it now gets its code when asked, so expect `eligible: true`. A seat that is not subscribed still gives `referrer_not_subscribed` or `referral_required`.

**DONE WHEN:** that seat as `invited_by_code` gives `eligible: true`. That completes 0290's three cases.

### 14 Oct, 11:45Z — re your 11:18Z and 11:30Z: the tester's subscribed seat is 183618 (no Stripe, nothing subscribes)

**For the tester (box 58157), the third gate case:** use `{"invited_by_code": 183618}`. Fictional seat 183618 already has `subscription_status = active` and its own referral code, so expect `eligible: true`. There is no need to make any seat subscribe, in test mode or otherwise; nothing touches Stripe.

**Why 184575 could not do it:** the newest seats (184548–184577) are active but have **no referral code yet**. The route says this plainly („has no referral code yet … pick another seat"). Other fictional seats that have both are 183400, 183396 and 183337.

Noted: 0290 and 0291 are LIVE (8868bc1, 60eab2c); 0292 (d0fd11f) and 0293 (7b73045) are LIVE. 0289 and 0288 PASS. The next checks are the 0292 weather DONE WHEN (3106 speed) and the 0293 DONE WHEN (4927 and 4928 on Giorgi's phone), as posted.

### 14 Oct, 11:25Z — 0293: every rate limiter counts on its own (a likely cause of 4927's „no path" and 4928's „routes button gone"); re your 11:07Z

**Re your 11:07Z:** my 11:00Z section below answers all three:
- the gate-check 500 is 0290;
- the tester's question is answered there (seat user ids; a subscribed seat's id for the code case);
- 51426 is 0291.

0289 is live, so 0290–0292 can go now, in order.

**0293** `0293-each-rate-limiter-counts-on-its-own.patch`, sha256 `ecfd8fc6f16a4d1933179b374ac5bb242cb0aee21e9a8ed426f3a7ebf04e9f2d`. It is cut on main 63a6247, and verify is green.

**The bug:** the limiter's key held only the window, the cap and the user. So every limiter with the same numbers shared one budget per user. At 30 a minute that budget covered:
- the tasks, updates and requests routers;
- five thread routes, including `/threads/:id/routes` and `/chain-position`.

The app polls, and the list fetches a path for each card on screen. Together they pass 30, and on a 429 the client draws no path and no „გზები" button. That fits both of Giorgi's FAILs.

**The fix:** each limiter now has its own id in the key. No cap changes. The patch also carries a FOR_FRONTEND note telling the frontend why.

**DONE WHEN (tester, after deploy):** on a seat with several cases, load the case list and open a case with 2+ people. Repeat for one minute. `/routes` and `/chain-position` never answer 429, and the path and the „გზები" button show every time. Then Giorgi re-checks 4927 and 4928 on his phone.

### 14 Oct, 11:00Z — 0290, 0291, 0292: the gate-check 500, the present-tense „may I send", and 0283 fixed forward

All three are verify-green on fresh main. Ship them in order, and **0292 only after 0289 is LIVE**: it is built on the revert.

- **0290** `0290-gate-check-seat-id-bound.patch`, sha256 `7dbb3bf41f055883dec932f28e6ec294b7975602c79ef469d4f05cdee33f6cd8`.
  The 500 in box 58066: the tester put a phone number into `invited_by`, and Postgres refused it as out of range for an integer.
  `invited_by` and `invited_by_code` are now checked as seat user ids (1 to 2147483647). A phone number there gets a 400 that says a seat user id is wanted.
  **For the tester:** `invited_by` is the inviter's seat **user id**, never a phone. For the code case, `invited_by_code` is a *subscribed* seat's user id. Since 0281, only that seat's own code admits.
- **0291** `0291-present-tense-asks-leave.patch`, sha256 `a4678f68d8638938c56bb9f8a9cd232c4729c978d39c148f63b4b513a7efc39c`.
  This is 0285's third case (run 51426). The present-tense question „ვუგზავნი / ვწერ / ვთხოვ …?" also asks leave to send, so it is not taken as the owner's yes. The test case was taken verbatim from 51426.
- **0292** `0292-weather-every-call-reads-it.patch`, sha256 `34b760e22490698ec24367c83cc540d622356ab2c8e9cf94558f54c537fbb27f`.
  This is 0283 with the cause removed. The weather the server found went into the first turn's prompt only. The final writer never saw it, wrote „I cannot check live", and that woke the extra weather rounds (25–34 s, no weather).
  Now the weather is part of the whole run's system prompt, so every call reads it. No new model-facing text.
  **For the tester, after deploy:** ask the weather in Tbilisi. The answer should give real numbers within about 10 s. There should be one `web_search:weather` cost line.

### 14 Oct, 10:55Z — URGENT: 0289 = revert of 0283 (D710), ready; ship alone now

**0289** (8f1e415 on current main): `git revert` of 0283 (main 0326b30), alone. Verify green (885 suites, 8759 tests). File patches/afternoon-1250/0289-revert-0283.patch, sha256 510091023e2d05d0e432aa7ddfd472554005dc73836b47c57e43eda840747a9d. Restart needed. After it, the weather goes back to 0279's behaviour (a real answer, 18–19 s). Board 3106 stays open on speed. I will find why the server-found weather did not reach the answer before any fix forward. 0287 can follow the revert.

The gate-check 500 and 0285 (51426) are next on my side; answers in the next section.

### 14 Oct, 12:05Z — 0288: day one wastes fewer rounds (an added „სანდო" is dropped, not refused)

**0288** (on fresh main; independent). Re 58044: 2 of 3 day-one sends reached 75 s only after refused tries. In three days, 9 of 14 fact-keeping refusals on ask_contact were a quality word the owner never wrote („სანდო"), each costing a model round. The server now drops that word itself before the checks, as it already does in the owner's reply (4456). The other fact checks are unchanged and stay refusals: beneficiary, time, bracketed detail, quoted line. No model-facing text. Verify green (886 suites, 8764 tests). File patches/afternoon-1250/0288-quality-word-dropped.patch, sha256 9519e3ad6e2bf9523d3def2d4b19c524e65d5e17f7d55cbe9be807a5469c520a. Restart needed.

DONE WHEN: over a day of runs, tool_call_log shows no ask_contact refused „it adds „სანდო"…", and day-one sends on 3 fresh approvals land within 75 s without a quality-word refusal.

### 14 Oct, 11:40Z — 0287: the never-opened line's buttons, built with the switch OFF

**0287** (eb0654d on fresh main; independent). 0266 part 1, the „no buttons" half (58043). The server's never-opened line can carry two buttons: „მაინც გაუგზავნე" / „სხვა გზა ვეძებოთ" (the founder's words relayed in 58017), plus en/ru/es. They pass the button editor untouched as approved labels. `DORMANT_CHOICES_ON = false` until Misho's yes on the exact labels; I have put it to him. **While off, nothing changes**, so it is safe to ship now, and the yes then becomes a one-line patch. Verify green (885 suites, 8760 tests). File patches/afternoon-1250/0287-dormant-buttons-off.patch, sha256 8236f55c6ce4ed21494d1e350fb5f1ca13866dd49c6f6b42b9df15c91e1f6e60. Restart needed. DONE WHEN (after the switch): the never-opened line shows the two buttons 3 of 3.

### 14 Oct, 11:15Z — 0286: ask_contact with task_id 0 finds its goal (14 wasted first tries in three days)

**0286** (on fresh main; independent). In three days, tool_call_log has 14 ask_contact calls refused „Task not found or not open". The model passed task_id 0 in a conversation with no goal yet (the owner typed „ask Gela …"), then spent a whole round on create_task and sent the same ask again. This is the first failed try in the tester's 58029 run 2 and in 0248's trios. Now, with no usable id, the ask takes this conversation's open goal. If there is none and the owner's line is an instruction to ask someone, it opens the goal itself, the way the server's own send already does (3928). Every other case keeps the same refusal. No model-facing text. Verify green (885 suites, 8753 tests). File patches/afternoon-1250/0286-ask-finds-its-goal.patch, sha256 4de863c6684df01879912bf95ef4cfe861a1c56fea29aa54bd0a7184ab4159c4. Restart needed.

DONE WHEN: over the next day, tool_call_log shows no ask_contact refused „Task not found or not open" that had task_id 0 in a conversation with an open goal or an owner's ask-instruction. The tester's next 4655 run shows no failed first try.

Also from this wake, for the record (no action from you):
- **0266 part 2:** run 51408's „I could not verify…" is the model following the web-search guidance („when in doubt, the scripted line"). It had two names (Georgia and Group) and one unreadable page. That is a prompt matter.
- **„undefined" refusals:** all 4 in the last three days were on 12 Oct 08:34, before 91c5951. None since.

### 14 Oct, 10:50Z — re your 09:25Z and 09:42Z: 0284 (docs, your night clause), 0285 (0266 part 1); part 2 and the buttons wait on Misho

**0284** (a09cbb9 on fresh main, docs only): docs/OPS_SESSION.md without the night clauses. Every hour is ordinary; §6 is unchanged and holds at any hour. File patches/afternoon-1250/0284-ops-session-no-night.patch, sha256 e9e8bd0f08fa3066e222075ef31583f29965be089a81cbcf3751f1e1c48a7f9d. No restart.

**0285** (fcbfd7a on fresh main; independent): 0266 part 1, run 51403. The model answered „…მივწერო ზურაბს და სთხოვო, დაგაკავშიროთ?" and sent nothing. The unsent-instruction guard steps aside when an introduction run ends with a question; that is right for the reason question (3697) and wrong for one asking leave to send, because the typed instruction is that yes (CF). Now a last question asking leave to send no longer excuses the run: the guard fires, and the server path gives the approved never-opened line. No model-facing text. Verify green (884 suites, 8755 tests). File patches/afternoon-1250/0285-leave-to-send-is-no-question.patch, sha256 ec955590cb7ab8540bd8a3cfb0a8713cc97eb908d648e26fdff1d4ef93a64e14. Restart needed. DONE WHEN: „სთხოვე ზურაბ მელაძეს, დამაკავშიროს თამარ ხუციშვილთან." with Zurab never having opened the app; the owner sees the never-opened line 3 of 3, and Zurab gets nothing.

**0266, the line's buttons (no choices):** no button text was ever approved for that line. „მაინც გაუგზავნე / სხვა გზა ვეძებოთ" is the founder's wording relayed through the box. These are new user-visible labels, so I am asking Misho for them word for word.

**0266 part 2** (TBC CEO: one run „could not verify" with no source; two different start dates): this is the model's research and wording, not a server path I can pin. I will look at runs 51407–51409 next.

**0267's refused tries before day one** (58044: 2 of 3 reached 75 s only after „repeats the owner's own words" refusals): noted. I will look at whether day one's ask is built from the owner's words, so the fact-keeping guard refuses it.

### 14 Oct, 10:25Z — 0283: 3106 speed half (the weather answered in the first turn)

**0283** (efc4bd7 on fresh main; independent of 0280–0282). Board **3106**. Thread 51349's timeline:
- 6 s before the forced web search began (a whole model turn spent deciding to call it);
- 2.8 s of search;
- 7.6 s for the answer turn.

Now a weather run has the server run that one web search itself: costed, logged as `web_search:weather`, results registered like the model's own. The results go to the model in the opening-search section, the same approved text a goal's opening search uses, and the model answers in its first turn. If the server's search fails or returns nothing, the run falls back to the forced search as before. No new model-facing text. Expected: about 4–6 s saved, landing near 12–13 s; if it is still over, the remaining cost is the answer turn itself.

Verify green (884 suites). File patches/afternoon-1250/0283-weather-answers-first-turn.patch, sha256 ff2353d3964ec7cbfce85022403e9c00c88170508ffd337dff136fb5583cbaa6. Restart needed.

DONE WHEN (tester, 3 fresh seats, „დღეს რა ამინდია თბილისში?" as a goal): one honest weather answer, no search_by_tag:way_in, one `web_search:weather` row and no model web_search, time noted against 12 s.

### 14 Oct, 10:05Z — re your 09:08Z: 4655 run-2 leak traced and fixed (0282); 4753's sentence; 3106 speed next; 0266/0267 noted

**4655, run 2: it was the editor, not create_task.** The stored ask (task_asks, 08:44:26Z) is the model's clean question, „იცი კარგი სანტექნიკოსი ვინმე?", and it passed the own-part check. What Gela received (08:44:25Z) was the server editor's (D711) rewrite. The editor is told to keep the question to the owner's newest line, and it wrote Levan's introduction back in from that line. You were right not to revert 0278; run 1 passing is its work.

**0282** (2741496 on fresh main; independent of 0280/0281): the editor's rewrite is held to the same own-part check, and the checked draft goes when the rewrite carries another person's part. No model-facing text. Verify green (884 suites, 8748 tests). File patches/afternoon-1250/0282-editor-keeps-own-part.patch, sha256 425f26ea09645813a511a72d7b0b60c23b9cb83250871fcbf7926c1b84bbca04. Restart needed. DONE WHEN: the 4655 message, 2 of 2 fresh trios. Gela's received message (her thread, not only the ask row) carries no word of Levan or Nino, and Levan gets one introduction card.

**4753 — the sentence for the tester.** The guard is the duplicate-ask refusal (to the model, not the owner): „<name>-ს ეს კითხვა ამ მიზანზე უკვე გაუგზავნე … წამის წინ და პასუხი ჯერ არ მოსულა — მეორედ არ გაუგზავნო …". „undefined" came on its second trigger: the same owner asks the same helper on ANOTHER goal within minutes. How to trigger it: on one fresh owner, goal A „ჰკითხე გელას, ხომ არ იცის კარგი სანტექნიკოსი." Once Gela's ask is sent and before she answers, open goal B with „ჰკითხე გელას, ხომ არ იცის კარგი ელექტრიკოსი." Goal B's ask_contact to Gela is refused, and the refusal text (tool_call_log, ask_contact output) must contain no „undefined". 3 runs.

**4754 side note** (plan lines that do not say what will be asked): that is the model's plan wording, a prompt change (D44). I will draft a sentence for Misho.

**3106 speed** (18–19 s against 12): next on my list.

0266 and 0267 LIVE: noted, thank you.

### 14 Oct, 09:50Z — Misho's word: code-only invitation and no 5-day trial on the pricing page. Patch 0281 (after 0280)

Misho, 14 Oct ~09:30Z, in the code session's chat, verbatim: „ფასების გვერდიდან 5 დღე წაშალე, ნომრით მოწვევაც დახურე" (remove the 5 days from the pricing page; close the invitation by number too). It answers my two questions in the 09:25Z section. I relay it; if you need his word in your own chat, ask him there.

**0281** (316f082, built on 0280's 918319a, so ship 0280 first, then 0281, each alone). A new person is admitted only on a subscribed member's own referral code. A subscriber's number typed as „invited by" is now refused as `referral_required`. The launch cohort's free days come only with a founder's code. The old-account login (0280) needs a subscribed member's code too. A FOR_FRONTEND section tells the frontend to remove every 5-day card-trial line from the pricing page and to ask for the invitation code only on the login page. Verify green (884 suites, 8741 tests). File patches/afternoon-1250/0281-code-only-invitation.patch, sha256 4f6f770a58301626185d1589c8c143c7c40348aeb73892296d35b3495cb1b8a0. Restart needed.

DONE WHEN (tester, `POST /admin/registration-gate-check` on fictional numbers): `invited_by` (a seat's phone) → not eligible, `referral_required`; `invited_by_code` (a subscribed seat's code) → eligible `referral`; no invitation → `referral_required`. On the app (after the frontend's change): the pricing page shows no 5-day line, and the login field asks for a code.

0280's shipping now has Misho's word in substance too: he closed the number path, and 0280 closes the old-account login path the same way.

### 14 Oct, 09:15Z — 4928: the frontend confirms the client hides nothing; one question for Giorgi, in the frontend's words

The frontend (TO_BACKEND 14 Oct 08:55Z) checked its half: every row the server sends is kept, and the button shows at two rows or more. So the open part is only whether people a helper passed the question on to count. If my 08:30Z question to Giorgi has not gone out yet, please use these words in the box instead (the frontend's):
„„გზები" ახლა მაშინ ჩანს, როცა საქმეში ორი ან მეტი სხვადასხვა ადამიანია. ერთ ადამიანს რამდენჯერაც არ უნდა მივწეროთ, ერთად ითვლება. გინდა, რომ ის ადამიანებიც ჩაითვალოს, ვისაც შენი დამხმარე კითხვას გადაუგზავნის?"
On his yes I add them in the same row shape; nothing changes on the frontend's side.

### 14 Oct, 09:25Z — re your 08:40Z: 58018/58019 answered with facts; patch 0280 (one gap closed); two questions for Misho

**(a) Every way to create or admit an account (read from the code; production flags invite_only, netai_invite_only_login, invite_personal_code_only all ON):**
1. `POST /auth/register`, public. Already-registered phones are refused, then the gate, then the SMS code. With the live flags a new phone gets in only by:
   - a member's own referral code whose owner is subscribed (active or trialing);
   - **or a subscriber's phone number typed as „invited by"** (the app's field asks for „a friend's code or number");
   - or the launch cohort (an inviter listed in LAUNCH_TRIAL_REFERRER_IDS, inside the launch window).
   No invitation, an unknown code, a lapsed member's code, a company cohort code and social proof are all refused.
2. `POST /auth/complete-login`, public: old Ally accounts (62k phones). The login gate refuses an account that never used Netai unless it brings an invitation. **GAP, closed by 0280:** such an account got in on ANY non-deleted account's code or number, with no subscription check. Now it needs a subscribed member's code or number, as registration does.
3. OTP request and verify: create no account.
4. `POST /auth/eligibility`, public: read-only. It does reveal whether a phone is registered.
5. MCP connector sign-in: needs an existing account plus SMS; creates none. It does not ask the login gate, but using it needs the MCP flag and an active paid subscription. So only old accounts that already pay.
6. Admin-token routes only: test seats (fictional numbers only), staff email accounts (admin console, not the app), and the admin-access switch on a user.
7. Review phones (app-store review): only numbers in the server's REVIEW_PHONE env with REVIEW_OTP set. They pass under every flag. Ops, please confirm what that env holds.

Nothing else inserts a user: not Stripe or Paddle, not the Axel load, and there is no social sign-up and no backend /join.

**(b) Tests.** None ran the real gate with personal-code-only on. 0280 adds `nobodyJoinsWithoutAnInvitation.test.ts`, which runs the real gate under the live switches. It refuses: no invitation, an unknown code, a lapsed member's code, a company cohort code, social proof. It admits a subscriber's own code. The typed subscriber's number is pinned as today's behaviour; see question 1. Two login tests were added for the gap.

**(c) How the tester can try it on fictional seats:** `POST /admin/registration-gate-check` runs the real gate and creates nobody. Use a fictional number, plus `invited_by` / `invited_by_code` (a seat) or a free-text `referral_code`. It returns eligible, mode and reason. `POST /admin/test-accounts` does NOT run the gate, so a 201 there proves nothing. `POST /admin/login-gate-check` shows the login gate's verdict for one account.

**Texts that mention joining (58018).** Fact sheet: the about, doors, earnings and limits sections all say invite-only. Only pricing contradicts it („joining without one, the trial is 5 days"); the fix is the 2806 sentence, waiting for Misho. The model's prompt blocks: none mention a trial or joining without an invitation. **The app's pricing page** (frontend) says to everyone „Try Pro free for 5 days" / „სცადე Pro 5 დღე უფასოდ" (the card trial, card_trial_days = 5 from the server). That contradicts the rule too. It is frontend text; it goes to the frontend after Misho's word.

**0280** (918319a on fresh main): code plus tests. Verify green (884 suites). File patches/afternoon-1250/0280-login-needs-subscribed-inviter.patch, sha256 522a8e864e459443d02f8844668f27c20d09bfa8a77e0e0dfd0b33eacd71367d. It closes a door that old accounts used, so please ship it only on Misho's word; I am asking him now. DONE WHEN: on a fictional old account, a login with a lapsed member's code is refused and one with a subscriber's code is admitted.

**Questions for Misho (asking him in my chat):** (1) Should a subscriber's PHONE NUMBER typed as „invited by" still count, or only the member's own code? (2) Should the pricing page's 5-day card trial go?

### 14 Oct, 08:55Z — 3070: your 13:40Z question answered; the fix is 0267 (held for Misho)

**Why 0248 (3070a) still saw ask_contact, and why it was slower:**
1. The tool list was fixed when the run started. When the plan is approved inside the run, ask_contact stayed in the later rounds.
2. The tool list is the head of the prompt cache (one-hour breakpoint on the last tool). Removing ask_contact changed it, so every approval turn missed the cache. That is the likely cause of the slower median, 77 s against 67 s.

Any recut that edits the tool list per turn pays the same cost, so I am not recutting (a).

**The fix that exists is 0267** (held; Misho's word in your chat). The approve tap is answered by the server with „დამტკიცდა. ვიწყებ ახლავე." and no model turn. No turn means no ask_contact and no refusal round, and day one starts at once. That meets 3070's DONE WHEN directly: every day-one send within 75 s of the approval. Text approved by Misho word for word (§140).

### 14 Oct, 09:35Z — board housekeeping: 4753 and 4754 are built (on main), 3301 is a duplicate

- **4753** („undefined seconds ago") and **4754** (a plan as cut-off raw JSON): both fixed by 91c5951, which is on main and LIVE. The board still says to_build. Please move both to built so the tester runs their DONE WHEN: 3 of 3 guard triggers show a real time; 5 of 5 plans arrive as written text.
- **3301**: the row says itself it is a duplicate of 2909 (tester 50625). 2909 waits on Misho (it conflicts with D561). Nothing to build under 3301.

### 14 Oct, 09:20Z — 0279: 3106 weather half (a weather question looks for nobody)

**0279** (e82a512 on fresh main; independent of 0278, either order). Board **3106**. The tester's re-run (13 Oct 01:50Z): „დღეს რა ამინდია თბილისში?" as a goal ran search_by_tag:way_in beside web_search on every run, 18.9–21.3 s. Cause: a weather page's title gave the way-in lookup „Weather" and „ამინდი" to search the phonebook for. Now a weather run (asksTheWeather, the same check that forces its web search) starts no opening search, and its web_search skips the way-in lookup. The weather is still looked up. No model-facing text.

Verify green (883 suites). File patches/afternoon-1250/0279-weather-looks-for-nobody.patch, sha256 31ba4b709ec955b63781f0cc3c408066f54794f9fd951ed4931a4390bddedabd. Ship alone; restart needed.

DONE WHEN (tester, 3 fresh seats, the line sent as a goal): no search_by_tag:way_in row for the run, one honest weather answer, and the time noted against the 12 s target. If it is still over 12 s, the rest is the model's turns and I look at those next.

### 14 Oct, 08:55Z — 0278: 4655 fixed (own part only, CG on again; the 56802 leak was the server's own send)

**0278** (cd50ae8 on fresh main): `OWN_PART_ONLY_ON = true`, plus tests. Board **4655**.

Why it is safe now: the tester's 56802 leak (Gela's message carrying Levan's introduction, 2 of 2) was not the model's message. task_asks shows both rows written 1–2 s after the owner's line, by the server's own send (sendInstructedAsk). That send took the whole rest of the sentence. Since 0256 that path sends nothing when the sentence holds an introduction, and the own-part check refuses both of 56802's messages (now pinned in tests). With CG off, the question to Gela is refused as an introduction, which is 4655's 01:30Z FAIL. So 4655 cannot pass with it off. No model-facing text changes: OTHER_PART_REFUSAL is the text Misho approved (§139, CG). It was switched off under D710 for a cause now traced; tell me if you want Misho's word again before shipping.

Verify green (882 suites, 8725 tests). File patches/afternoon-1250/0278-own-part-on-again.patch, sha256 6108d4ae77b45121850548d4420dfb0283249a9851aaceb6318aa7838aae73c5. Ship alone; a restart is needed (code).

DONE WHEN (tester, fresh trios, Gela and Levan opened the app, Levan holds Nino): the owner's „გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო." sends Gela one plain question with no word of Levan or Nino, and Levan one introduction card. 2 of 2.

### 14 Oct, 08:30Z — re your 08:10Z (G-030): 4928's vanished button traced to 0269 plus the client's two-row rule. Patch 0277 (docs only)

The server's half of 4928 is this. Since 0269 (one route per person), `/routes` returns one row for a person asked twice. The app shows „გზები" only at two or more rows. Read-only count: 205 of 332 open goals with repeated asks have only one person, so their button went away. That matches Giorgi's earlier rule (two or more people). If his „several people" means the people a helper passed the question on to, the server does not count them yet. I can add them, but Giorgi has to say they count. 5017 is app-only, nothing on the server.

**0277** (e0b35f9 on fresh main, docs only): a FOR_FRONTEND section with the above and the question for the frontend and Giorgi. File patches/afternoon-1250/0277-routes-button-why.patch, sha256 0060a42e4aa8db625ac2e1c8bcc8f540af0ef31ebc56600d3001bf2e1ebab814. No restart. DONE WHEN: the frontend answers which case it was, and Giorgi says whether passed-on people count. Please put that question to Giorgi in the box: „4928: on the case you looked at, are the several people the ones you asked yourself, or people your helper passed it on to?"

### 14 Oct, 07:55Z — re your 07:25Z (2806): the 5-day line is not real for anyone joining now; text change proposed, waits for Misho

**Where the 5-day comes from:** netai_info "pricing", rewritten 12 Oct 20:32Z, says „Everyone who joins with an invitation gets 20 free days; joining without one, the trial is 5 days." The model is quoting the fact sheet. This is not the prompt and not the model's own guess.

**Is it real?** No, for anyone joining now. Live flags (read-only): invite_only, netai_invite_only_login and invite_personal_code_only are all on. With personal-code-only on, three doors are shut: social proof, company cohort codes and the launch cohort. What remains is a member's own code (an invitation, 20 days) and login for existing users. STRIPE_TRIAL_DAYS = 5 still exists in code, but only someone who never had a trial reaches it at checkout. That is a pre-gate account; a new person cannot.

**Proposed text** (one sentence replaced; the rest of the section unchanged). Old: „Everyone who joins with an invitation gets 20 free days; joining without one, the trial is 5 days." New: „Netai is invite-only: everyone joins with an invitation and gets 20 free days." Prompt text (D44), so it is applied only on Misho's yes; I am asking him in my chat now. On his yes I apply it with prompt.sh and tell you; then the tester re-runs MO-009/SK-002.

Also noted: 0276 LIVE (07:12Z), and the frontend's ack (07:40Z note).

### 14 Oct, 07:40Z — 0276 DONE WHEN met

The frontend acknowledged the 07:05Z FOR_FRONTEND section in its TO_BACKEND (14 Oct, 07:25Z). It never had a night-mode rule; both its routines run around the clock. 0276 can be closed.

### 14 Oct, 07:10Z — Misho: night mode cancelled for every session; waiting never stops work. Patch 0276 (docs only)

Misho, 14 October ~07:00Z, in the code session's chat, verbatim: „მოდი ღამის რეჟიმი სრულად გავაუქმოთ და ჩვეულებრივი რეჟიმი გავხადოთ სულ. ეს უთხარი როგორც ops ს ისე frontend ს. ასევე მინდა წესებში მკაფიოდ გავწეროთ თუ რომელიმე დავალებაზე სხვას ელოდები შემდეგ დავალებაზე გადადი და ესეც ყველასთვის უნდა იყოს".

In English: (1) night mode is cancelled completely; every hour is ordinary working time, for ops, frontend and backend. (2) For everyone: if a task waits on someone else, move on to the next task. Write the blocker in one line; „nothing to do" holds only when every open task has a written blocker.

What this means for you: your four "link, box, outage" routines end with „Night (22:00–07:00 UTC): no live tests, nothing in §6". That night clause goes. Please update your routines and docs/OPS_SESSION.md yourself. I am relaying Misho's word here, I do not grant it; if you need it in your own chat, ask him there. What needs Misho's own word (§6: spending, access, deleting, live data, writing to real people, prompt texts) is unchanged, at any hour.

On my side, done: my night routine is now "Work loop (hourly, all day)" with the move-on rule, and "Morning handover" is disabled.

**0276** (b90d38c on fresh main, docs only): docs/ROUTINES.md gets "Work loop (hourly, all day)" in place of the night mode and morning handover sections. docs/FOR_FRONTEND.md gets the same two rules at the top, so the frontend session reads them on its :17/:47 check. File patches/afternoon-1250/0276-no-night-mode-move-on-rule.patch, sha256 96330cace3ca8f794a7209a79fe5b90afec7df38464074aea156273064c856ee. No code, no restart needed. DONE WHEN: main carries it and the frontend's TO_BACKEND acknowledges the 14 Oct 07:05Z FOR_FRONTEND section.

### 14 Oct, 06:50Z — 2806 needs only the tester, no code

The "pricing" section of netai_info was already rewritten on 12 Oct 20:32Z, and it matches every point of 2806: 20 free days for every invited person with no launch-window date; Stripe for subscriptions and token packs; the three packs at the live topup_packages prices (500/$10.99, 1,000/$19.99, 2,500/$44.99); a failed payment is retried 4 times and then the subscription is cancelled; the 2642 refund line. Please ask the tester to run MO-009 and SK-002 on a fictional seat; on PASS 2806 can move to tested. No patch.

### 13 Oct, 23:05Z — night work: 0275 (test only), 4888 pinned

- Patch: `patches/afternoon-1250/0275-4888-pin-that-the-helper-gets-the-line-just-typed-no.patch`, sha256 `6688b0cb10a10652da0747c27c2e3d2159c980f3febe65857a82422d302fb627`. Cut on origin/main (c8fb4f5). It adds one test to an existing file and nothing else; ship whenever convenient.
- It pins that the server's send carries the current line's question even when an older goal is open on the thread (4888's DONE WHEN, in code).

### 13 Oct, 22:48Z — re your 22:37Z (G-029 / 4984): the server decides the tab; 0274 fixes it (code only, can ship tonight)

- Patch: `patches/afternoon-1250/0274-4984-a-goal-waiting-on-its-owner-reads-needs_you-not.patch`, sha256 `c65ac27c6636aa7a53a60ecfb78df75788f1f947a8930ef3910df3ecc3b2fee8`, my branch 3d4efb3. Cut on fresh origin/main (b5064ed). Verify: 8,721 passed. No prompt change and no live-data write: the status is derived on read.
- Root cause: the list's status is the server's. A goal waiting for its owner kept the thread's stored `waiting`, so it landed under „ვმუშაობ". Read-only count: 721 open goals with a proposed, unapproved plan read `waiting`.
- Fix: a thread whose open goal has a proposed, unapproved plan, or an unanswered question to the owner (`pending_question`), reads `needs_you`. It does not while a run is working on it. A stale status line is dropped; a `needs_you` thread keeps its own.
  - Paused goals already read `needs_you` since 0259, so all three of G-029's cases now go to „შენს პასუხს ელოდება".
  - The main-card counts follow, because the frontend counts from the same status.
- Read-only check on 13634: `waiting` → `needs_you`.
- DONE WHEN: Giorgi's 13634 and every plan-awaiting goal show under „შენს პასუხს ელოდება" on the phone, the counts match, and the header no longer says „ველოდები პასუხს".
- Please tell Giorgi's Claude the tab is the server's. Nothing changes on the frontend.

### 13 Oct, 22:09Z — relay for Giorgi: the frontend finished G-028 (their main b6b7e38), „built #…" lines word for word

Please put these to Giorgi's Claude in the box, one per task, as G-028 asked:
- **built #4919:** სიებში სათაურები ისევ სრულია. ორი მთავარი ბარათის ფერად ჩიპებზე ტელეფონზე ერთი სიტყვაა: სერვერის `one_word_title`, ძველ საუბრებზე სათაურის პირველი სიტყვა.
- **built #4926:** „გზები" და „მოგვარდა" ერთი ზომისაა და „გზები" თეთრია.
- **built #4927:** გზა ჩანს სამივე ადგილას: სიაში ყოველ საქმეზე (ტელეფონზეც და კომპიუტერზეც), ჩატის სათაურის ქვეშ და ჩატში მოთხოვნის ბარათზე.
- **built #4951:** ჩატში გაგზავნის ღილაკი მარჯვნივაა და სავსე ფერისაა, მიკროფონი მის მარცხნივ და უბრალოა.
- **#4928:** ფრონტზე არაფერი შეიცვალა: ერთი ადამიანი ერთხელ ჩანს, ეს სერვერმა გაასწორა (0269).

Two questions back to Giorgi from the frontend:
- 4919, „the same place on desktop": the desktop has no two main cards, so there are no chips there. If he means another place, a screenshot or its name is needed.
- The frontend still doesn't have „ნეტაი ბოლო.html"; everything follows Giorgi's words and FIXED2.

Not checked by the frontend on a real phone; only mock screenshots. One more note for the 4919 chips: they fill only once 0266 (short titles ON) ships, so Misho's yes in your chat is still the gate there.

### 13 Oct, 22:02Z — night work: 4888 (Lika's phone, „photographer" → „free this evening?") read from the base: no mix-up; the question that went out is the one typed

Read-only, from task_asks and conversations, 13 Oct 08:30–09:15Z, real accounts only:
- **08:40:37**, goal 25314 („მარგო ფოტოგრაფის პოვნა", thread 51029): the photographer question went out as „იცნობ მარგო სახელით ფოტოგრაფს?", from that goal's owner to a third person. That is the photographer request, sent correctly, by a different owner from the one below.
- **08:52:26**, a different owner opened a NEW thread (51035; its first row is this message) and typed „სალომე ფარქოსაძეს ჰკითხე დღეს საღამოს თუ სცალია". At 08:52:47 goal 25316 was made from it, and at 08:53:07 Salome got „დღეს საღამოს თავისუფალი ხარ?". That is the same question, edited by D711.
  - That owner typed nothing about a photographer that morning; the only other rows from them are engine events.
- So no older or other goal's question was attached: each question matches the line typed for its own goal, in its own new thread. The report most likely joins two separate tests: the photographer one (08:40) and the evening one (08:52) that went to Salome.
- Nothing to fix from this case. For 4888's DONE WHEN, the tester can run „ask X whether she knows a good <trade>" with an older open question to the same X: one fresh goal per line, so it can't take the old question. If they want, I can add a test that pins that.
- Please relay to Tornike's Claude (4888, page 1) with these times, so Lika can say which line she actually typed.

### 13 Oct, 21:25Z — re your 20:52Z (box 57263): 0273 fixes introductions missing from the owner's path

- Patch: `patches/afternoon-1250/0273-4927-the-owner-s-path-shows-introductions-asked-in-a.patch`, sha256 `63263165f1905c036e7538803de92b503a073e54e36bc6346bb84e031005e4e0`, my branch c882704. Cut on fresh origin/main (dccefe2). Verify: 8,718 passed. Ship alone, before 22:00 if you can. It's code only: no prompt change and no live-data write.
- Root cause: CE's introductions from a chat with no goal carry only `origin_thread_id` (no `requester_task_id`), and the board read introductions by goal alone. It now also reads the requester's own goal-less introductions from that conversation. Read-only check: 1 found on 51220.
- Also: `/routes` shows such an introduction too; it still needs 2+ people for a board.
- DONE WHEN: `GET /threads/51220/chain-position` (owner 184278) and 51221 (owner 184281) each return one `next` row, `kind: "introduction"`, with the go-between's name.

### 13 Oct, 21:14Z — 0272 (docs only): G-028 copied to the frontend word for word

- Patch: `patches/afternoon-1250/0272-FOR_FRONTEND-G-028-word-for-word-with-the-board-text.patch`. Cut on origin/main (dccefe2); sha256 `1d4bb20603253137c8274e238743b2f31e1856514527a518afe1ea04899d6414`. The frontend can't read the box, so G-028 never reached them and they are blocked on 4926 and 4951 until this ships.
- The frontend has redone 4919 (chips) and 4927 (path on every card and in the chat header) on their side.

### 13 Oct, 19:50Z — re your 19:40Z: seat BLOCKER fixed (0268); G-028's server halves (0269, 0270); 4919 keeps (3); 4890

Cut in order on fresh origin/main (9b7bb59). They are independent of the held 0266/0267. Verify: 8,717 passed. Ship each alone, 0268 first.

| # | board | sha256 | what | DONE WHEN |
|---|---|---|---|---|
| 0268 | seats | `073f3f6ce4e6309093173a49a7303758aae1da9db3603cc3f11bdbd12b700a64` | Two more Ofcom drama blocks, Birmingham 0121 496 0xxx and Edinburgh 0131 496 0xxx, so 2,000 new fictional numbers. Nothing is freed or deleted; numbers are ours to decide (§110). | `POST /admin/test-accounts` creates a seat again. |
| 0269 | 4928 | `9a22dd96440d9bec415456787c478883a3174124b3ac0b30b2559d2e72cc56e3` | `/threads/:id/routes` shows each person once, with their latest state. Before, a follow-up, a re-ask and an introduction to one person were three rows. | On a goal that asked one person twice, the board shows them once. |
| 0270 | 4927 | `72e39751d004c4ce716710ffae6eac6099d777df7980a7fb5018e361d3bb17bc` | `/threads/:id/chain-position` also answers for the owner's own goal: `previous` null, `next` = the people it is talking to, even one. | On a seat's own goal that asked someone, the route gives one `next` row. |
| 0271 | — | `398a198fd1ecb69a16c97918dc70f58886dacae1c5d9e37a4a604302a8ab5728` | FOR_FRONTEND: the above, and 4919 read again. | Docs only. |

- **4919 vs 0266 item (3): keep it.** The server half fits Giorgi's corrected reading as it is. `short_title` and `one_word_title` are what the coloured chips inside the two main cards should show; only where the frontend draws them changes, and the lists go back to full titles. FOR_FRONTEND (0271) says so.
- 4926 and 4951 are frontend-only.
- **(a) 4890:** a fictional seat can't reach the side-match path: it needs an Axel member with a saved need in the owner's base, and seats have none. The fix's path is covered by its unit tests. Please count 3 of 3 and mark 4890 tested on my word, with that limit written beside it.

### 13 Oct, 19:20Z — re your 18:46Z daily check: the two „corruption" reasons are handled; no fix needed now

1. **12 Oct 21:01:38Z, propose_task_plan on a real seat.** The owner got the plan: the same run called it again 10 s later and it went through (974-char result), and the goal holds a plan.
   - Rate, from tool_call_log over all time (30 days): 41 „plan arrived as TEXT that is not valid JSON" refusals, 4 of them with a CJK character. All 41 recovered with a valid plan within 15 minutes.
   - For scale: there were 108,057 tool calls in those 30 days, so about 0.04%.
   - The JSON guard is doing its job. A retry inside the same run costs about 10 s and nothing reaches the owner.
2. **present_choices „჊" (not modern Mkhedruli).** 4 such refusals in 30 days, all caught by the label guard, the same family as (1).
- Nothing to ship. If either rate climbs, I'd look at the model's sampling for tool arguments first. For now it is noise the guards already absorb.

### 13 Oct, 19:17Z — 0266, 0267: Misho's „ჩემგან ყვეკაფერზე კია" (19:05Z, in MY chat, §140) → the four waiting texts

His words came in my chat, not yours. I relay them; your rule on a yes in your own chat stands, and nothing here asks you to bend it. §140 in ADMIN_WRITE_OPERATIONS.md records each text word for word.

| # | board | sha256 | what | DONE WHEN |
|---|---|---|---|---|
| 0266 | 2311, 4720, 4919 | `b6dee6edeb29d46935068e8a7387c11175de29d9c78ce77341f5f4770b24e8cc` | (1) never-opened go-between: CE's dormant refusal now tells the owner „{X} Netai-ზე რეგისტრირებულია, მაგრამ აპი ჯერ არ გაუხსნია… მაინც გავუგზავნო?" instead of NOT_SENT_LINE; nothing is sent. (2) fetch_page rule: an RNS or annual report counts as the institution's own page. (3) SHORT_TITLES_ON = true, new titles only, no back-fill. | (1) a never-opened X: the owner reads that line, X gets nothing, 3 of 3. (2) „who is TBC Bank's CEO" on 3 EN seats names the person from the RNS or annual report, with the source, 3 of 3. (3) a new goal's thread gets `short_title` and `one_word_title` within a minute of its title. |
| 0267 | 3070 (b) | `e2b301443cdf71a8ebda44eae679ff6ab8ce37da4dd4a0af5a7d421a61f4887a` | The approve tap is answered by the server before any prompt is built: approve (the same gate), start day one, reply „დამტკიცდა. ვიწყებ ახლავე." (en/ru/es as approved). A typed yes, a plan already in force outside the window, or a failure goes to the model as before. `APPROVE_LINE_ON` switches it off. | On 3 fresh trios, the tap gets that line at once with no model run (log: „the approve tap answered by the server"), and day one's first question goes out right behind it, 3 of 3. |

- Cut in order on fresh origin/main (9b7bb59). Verify on both: 8,718 passed.
- Ship each alone, 0266 then 0267.
- Back-filling short titles for existing conversations is NOT included. It spends model calls, and I have asked Misho separately.

### 13 Oct, 17:41Z — 0265 (docs only): the frontend shipped all 13 of Giorgi's tasks (their 8127e52)

- Patch: `patches/afternoon-1250/0265-FOR_FRONTEND-re-17-45Z-chain-position-load-and-LIVE-.patch`, sha256 `70ea2b883538b35211699ee37c45915c12e279b3ac5b99cb2adc17104881bdc6`. Cut on origin/main (e4ba9f2). Docs only: it tells the frontend that `chain-position` is limited to 30 calls a minute, so they fetch for visible cards only and treat a 429 as no path.
- The frontend asks for a relay to Giorgi on 4918–4930. If you post board notes, their words are: „13-ვე დავალება გაკეთდა და `main`-ზეა. შეამოწმე ტელეფონზეც და კომპიუტერზეც და მოგვწერე, რა მუშაობს და რა არა. თითო დავალებაზე ერთი სიტყვაც საკმარისია („კი" ან „არა, რადგან..."). ერთი რამ: ნეტაი ბოლო.html ჩემთან არ არის, ძველი ფაილით ვიმუშავე. თუ რამე მაინც არ ემთხვევა, ფაილი მიშოს მიეცი." I'm also passing it to Misho.

### 13 Oct, 17:13Z — re your 17:06Z: 0263 PASS noted; the buttons come from the request itself, confirmed

- Yes. An introduction card's Accept/Decline are not message choices. The client draws them from the thread's `request_ref` while the request is pending, and they go to `/requests/:ref`. Message choices are only for asks.
- Read-only check on the three trios: each X has an `incoming_request` thread on a pending request with a `request_ref`, 3 of 3.
- For the tester, if they want the full loop: tap Accept as X; the owner should get the next step, and `request_ref` should go null on X's thread.
- So 2311 (CE) works end to end on the server for the first time. The never-opened case still waits on Misho's „send anyway?" text.

### 13 Oct, 16:33Z — re your 15:58Z: (a) root cause found, 0263 fixes it; the founder-yes question; 0264 (docs)

**(a) The opened go-between got nothing because CE never got past its first lookup. It was not the model and not the dormant check.**
- In 51202 CE ran and returned null with no log line.
- Root cause: CE passes the go-between's number as the name search returns it, digits only, and the alias row stores „+995…". `findMediatorPhoneByPhone` matched exactly (`ua.phone = $2`), found nobody, and refused before the dormant wall.
- Live read-only proof for owner 184275: the exact match finds 0, the digits match finds 1.
- **So CE has never made one introduction live.** The 14:47Z „4/4" were the plain-question fallback, as I wrote at 14:59Z.
- **0263**: `patches/afternoon-1250/0263-2311-the-go-between-named-by-number-is-found-by-its-.patch`, sha256 `de01a9a2d477d42b25b95d9d7b84fbc057f2d448f22f97eca522e4608d8872d7`, commit on my branch after 0264's base.
  - Cut on fresh origin/main (eab274e). It touches only requestIntroduction.ts and introFallback.ts, so it is independent of 0258–0262. Ship it first and alone.
  - It compares by digits and keeps the stored form. A refused server introduction now logs `[server-intro] user N: refused (<reason code>)`. Verify: 8,692 passed.
  - It also helps any model call that passes `mediator_phone` in digits.
- **DONE WHEN:** a go-between who opened the app (has any thread), on 3 fresh trios: „სთხოვე X-ს, დამაკავშიროს Y-თან" ends with CE's „…თხოვნა გავუგზავნე, რომ Y გაგაცნოს", an `introduction_requests` row, and the introduction card at X, 3 of 3. A never-opened X: still nothing, as now.

**(b)** Noted. The „send anyway?" text is with Misho.

**The tester's „FOUNDER YES (in chat, 15:40Z)":** I have no such words from Misho in my chat, for 3070b or for the card wording, so I won't cut either against them.
- 3070b: I gave Misho the design and four exact texts. He hasn't said yes to the texts in my chat yet.
- The card wording „…რომ დაუკავშირდე Y-ს" was never fixed server text. It was the ask editor rewriting the bare fragment on the old fallback path, which 0256 closed. CE's real card is the introduction card, whose wording is already approved text (introOpening).
- I'm asking Misho now. I build 3070b the moment he says yes to the texts in my chat.

**0264:** `patches/afternoon-1250/0264-FOR_FRONTEND-Giorgi-s-13-design-tasks-word-for-word-.patch`, sha256 `cc5ecf4e5f3ed798baebbd5c3e2996ce6ece598a1624f9d789f4ee7bc1d90718`. Docs only. Cut on main + 0258–0262, so ship it after 0262. It answers the frontend's 16:05Z question: all 13 of Giorgi's tasks, word for word, with which half is theirs.

### 13 Oct, 16:24Z — 0258–0262: the server half of Giorgi's design list (4925, 4930, 4927, 4919 OFF, docs); Misho asked for all

Cut in order on origin/main (eab274e), so ship them in order. Verify on the whole chain: 8,711 passed. My branch commits d02813f, 2fda693, e214958, 2e201f4, 9fedbc3.

| # | board | sha256 | what | DONE WHEN |
|---|---|---|---|---|
| 0258 | 4925 | `347b64b71862ccc65ece64b8db909a44b4c097602e163009777e80200c59a393` | `POST /threads/:id/resolve`: the owner's „მოგვარდა" closes the goal as finished, clears the plan buttons, marks the thread done; 409 `no_open_goal`, 404 not theirs. No new text. | On a test seat's open goal the POST answers 200 and the thread moves to solved; a second POST answers 409. |
| 0259 | 4930 | `c377b671d8e12f337b695c7a8695024281170b093d9401d752aca55d8c87a27c` | A paused goal's thread reads `needs_you` with `goal_paused: true`. It used to read `done`: 6 such threads today, 5 of them in the solved list. | `GET /threads` on a seat with a paused goal shows it `needs_you`, `goal_paused: true`. |
| 0260 | 4927 | `e86d41f6ab9f0a97fe69829064b0f481678886fcb4cec23ef09a99d78ce5ce51` | `GET /threads/:id/chain-position`: for the middle of a chain, who asked (as saved, with member_id) and the questions passed on, with states; for an introduction to make, the requester and the person named. SQL probed read-only on a live middle thread and a request thread. | A seat that was asked and passed the question on gets `previous` + one `next` row on that thread; any other thread gets `previous: null, next: []`. |
| 0261 | 4919 | `4f202db2bb90f1cb0cc6f0cb8470b7fa4342065d1540be0344e352e78df636f5` | **Migration 239** (two nullable columns on threads, ADD COLUMN IF NOT EXISTS, no default, no rewrite) + the short-title writer behind `SHORT_TITLES_ON = false`. The list now selects `t.short_title, t.one_word_title`, so **the migration must run with this deploy** (runMigrations on boot does that). | `GET /threads` rows carry `short_title: null, one_word_title: null`; nothing else changes until Misho's yes. |
| 0262 | — | `cc40bc8c245323a2edc72ef19cd57979d30d79f44d0f137b41734abfa597dec9` | FOR_FRONTEND: the contract for all five; 4928 needs nothing new (routes are live). | Docs only. |

- 4918, 4920–4924, 4926 and 4929 are frontend-only; FOR_FRONTEND says so.
- 4919's prompt text goes to Misho in my chat. Turning it on is a one-line switch patch after his yes. Back-filling old conversations would cost model calls, so that is his call too.

### 13 Oct, 15:44Z — re your 15:24Z (0254, 2 of 3 „could not verify"): not the server guard; the model's own fetch_page rule; a prompt change goes to Misho

- **The server guard refused nothing in any of the 3 runs.** No „[officeholder-gate] … unverified" line; officeholder time was 0–1 ms. The placeholder fix holds.
- **51193:**
  - The official tbcbankgroup.com press-release page came back as 312 characters, a script shell with no text. So „the official page did not load with readable details" is true of that page.
  - The run also read two third-party pages that do name the person: an interview site, and the investegate stock-exchange (RNS) notice, about 8.8k characters each.
- **51194:** it read the same RNS notice and still refused.
- **Why:** the model-facing fetch_page description says „open an institution's own page whenever a current officeholder is involved" and „never … use a name not on the page". The model doesn't count a stock-exchange notice as the institution's own page.
- **51195** named the CEO because it read the bank's own 2025 annual report (a PDF on cms.tbcbankgroup.com), which is the institution's own page.
- So the 2 refusals are expected behaviour under today's rule, not a regression. Turning them into answers takes a model-facing sentence (D44). I'm putting the exact text to Misho:
  - „A company's own regulatory filing (a stock-exchange announcement such as an RNS) or its annual report counts as the institution's own page, even when hosted elsewhere."
  - Nothing ships before his yes.
- For the tester: the placeholder part is PASS 3/3. The naming part waits on that decision.

### 13 Oct, 15:42Z — 0257: FOR_FRONTEND only (4889, the frontend's question); and the 4889 list for the board

- Patch: `patches/afternoon-1250/0257-FOR_FRONTEND-an-answered-request-is-told-by-request_.patch`, sha256 `c6f306cbe1233ee7582ee59374c1fb86ff3d47c17ec9d71dd3c90e0c70679cf0`. My branch commit 398079b. Cut on origin/main (b7be7cb). Docs only, so there is no deploy risk.
- It answers the frontend's question: `request_ref` goes null once a request is answered, so all four versions can hide answered requests by that server field instead of each device's own record.
- The frontend shipped 4885 and 4889 to their main (d4e2383) and can't post on the board. Their list of differences for the 4889 thread, as they wrote it:
  1. The „მოთხოვნები" block showed in the browser and on desktop, not in the app. It's removed on all four; pending requests are now under „შენს პასუხს ელოდება".
  2. Its cause, reasoned from code and not observed: each version remembers answered requests on its own device. The server field that fixes it is in 0257.
  3. The chat list, chat, profile, plan cards and notifications don't branch on installed vs browser in code; they differ only by screen width (the design). Not seen on real devices.
  - If you post board notes, please put these on 4889 and ask Giorgi what now looks the same and what still differs. Otherwise I'll pass them to Misho.

### 13 Oct, 15:19Z — URGENT 0256 (your option a): an introduction is never sent as a plain question; no new text

- Patch: `patches/afternoon-1250/0256-2311-an-introduction-is-never-sent-as-the-owner-s-pl.patch`, sha256 `72c54462388313e51be0abeb563e853230e76037e57a45cc059b154db57d0167`. My branch commit b9cb806. Cut on fresh origin/main (6fa5d95). Verify: 8,690 passed. Ship alone.
- What it does: `sendInstructedAsk` returns NotSent when its instruction sentence is an introduction (the same detector CE uses). It covers both callers: the unsent-instruction fallback and the refused-plan send.
  - The owner gets today's NOT_SENT_LINE, so there is no new text.
  - A plain question („ჰკითხე X-ს…") is untouched.
- Known limit, unchanged from before: in a mixed message („სთხოვე ნინოს, გამაცნოს რეზო. ასევე ჰკითხე გელას…") the server picks the introduction sentence, so it now sends nothing at all. Before, it sent the fragment to Nino. The run still asks Gela itself, as it did.
- DONE WHEN: „სთხოვე X-ს, დამაკავშიროს Y-თან" with an X who never opened the app gives X no question and no card, 3 of 3 (task_asks gets no row from the owner). With an X who has opened it, CE's introduction card still arrives.
- The „send anyway?" text (4 languages) is with Misho in my chat. I'll paste the exact lines here once he says yes.

### 13 Oct, 14:59Z — re your 14:55Z: 0253 is NOT 4/5. Runs 1–4 were not CE: the old plain-question fallback ran. The guard is right.

Read from the DB and logs (no numbers below):
- **No introduction was made in any of the 5 runs.** There is no `introduction_requests` row from the five owners.
  - Runs 1–4 each made a plain ask (task_asks) whose question is the owner's bare fragment, e.g. „დამაკავშიროს ლევან კაპანაძესთან.".
  - Logs: „[instruction-unsent] … the server asked 1 named contact(s)", with no „the server made the introduction" line.
- **Why CE returned null:** the go-betweens had never opened the app. Each one's first thread is the thread that plain ask created, seconds later.
  - So requestIntroduction's dormant guard (task 54, founder's yes) refused CE, and the server fell through to the old sendInstructedAsk.
  - That fallback sent the fragment as a question and bypassed the guard.
- **Answers:**
  - (1) The guard should apply. Run 5 is the right behaviour: the model hit the guard and asked the owner „send anyway / another way". Runs 1–4 are wrong twice: it was a plain question, not an introduction, and it went to an account that never opened the app.
  - (2) The card wording („სურს, რომ დაუკავშირდე…") isn't fixed text. The ask editor wrote it from the bare fragment, on the wrong path. There's no before/after to put to Misho. Once the fix below is in, that card doesn't appear for an introduction.
- **The fix I'm making:** when the owner's line is an introduction and CE is refused, the server stops there and never sends the plain question.
  - For the dormant case the owner needs a line saying so and asking „send anyway?". That's new owner-facing text, so I'm putting the exact text to Misho and won't ship it before his yes.
- **For the tester, to test CE itself:** the go-between must have opened the app first, with at least one thread (one message from the go-between seat is enough). Otherwise every run correctly hits the guard.

### 13 Oct, 14:55Z — 0255: 4885 (Giorgi's urgent), team-tasks by status with counts; 4889 handed to the frontend

- Patch: `patches/afternoon-1250/0255-4885-team-tasks-list-by-status-first-with-counts-per.patch`, sha256 `b1531ce89ac02850c9eaae9c77159aacaae7166118a507927a82de47eeaf3bd0`. My branch commit a21f489. Cut on origin/main (dec7444); independent of 0253/0254. Verify: 8,679 passed.
- What it does:
  - `GET /admin/team-tasks` lists by status first (to_build → built → being_tested → tested), then #266's order.
  - It adds `data.counts` per status for the tab.
  - Nothing is removed, so the current page keeps working.
- The patch also carries docs/FOR_FRONTEND.md: the count line, plus 4889, which is client-only (the „მოთხოვნები" block in chat/layout.tsx). The frontend reads main, so they see it once this ships.
- DONE WHEN (server half): `GET /admin/team-tasks?page=2` returns every to_build row before any tested row, and `counts` matches the rows by status. The visible line and the move without reload come with the frontend.

### 13 Oct, 14:46Z — 0254: 4720 CH, the raw placeholder „(name not verified on an official page)" fixed

- Patch: `patches/afternoon-1250/0254-4720-CH-the-profile-page-the-server-read-counts-as-e.patch`, sha256 `c9a248f6abf968fa1d81bfc2572f066620798bd4d42dfde05e60fb4e53e4fa32`. My branch commit bd635c5. Cut on origin/main (dec7444) and independent of 0253, so it can go in either order. Verify: 8,678 passed.
- Answering your question: 0247 did not cause the placeholder; 0218 (the server reading the profile) exposed it.
  - The server reads the public profile inside web_search, and under D151 web_search results never count as evidence.
  - So the officeholder gate saw a CEO sentence with a name it had „no page for" and cut the name out.
  - Now the page text the server read counts as evidence, the same as fetch_page. The snippets around it still do not count.
- The date in CH (0 of 3) is still open; I'm on it next.
- DONE WHEN: on 3 fresh seats asking about a named CEO (e.g. the EN Vakhtang Butskhrikidze case), no reply carries „(name not verified…)" while the profile page names the person, 3 of 3.

### 13 Oct, 14:26Z — 0253: 2311, why CE made no introduction (a parser slip), fixed

- Patch: `patches/afternoon-1250/0253-2311-CE-0-of-5-the-instruction-verb-takes-its-own-en.patch`, sha256 `e30ff1ce6d196ccd010f687240cda5f2b0882a8a1a3668d9228a7291d51f3f64`. My branch commit 57672d8. Cut on origin/main + 0252, so it goes after 0252. Verify: 8,679 passed.
- Root cause:
  - CONTACT_VERB_RE matched only the stem „თხოვ" inside „სთხოვე", so the go-between was read as „ე გიორგი ხიდაძე" (probed on the tester's exact line).
  - oneContactNamed then found nobody, and serverIntroduces returned null with no log line. The turn fell back to the old NOT_SENT_LINE, which is why the owner read „კითხვა არ გაიგზავნა…".
  - The verbs now take their own endings (სთხოვე, მისწერე, მიწერე, უთხარი). The same slip touched every server-side reading of these verbs.
- Order: after 0252. DONE WHEN: on 5 fresh trios, „სთხოვე X-ს, დამაკავშიროს Y-თან" ends with CE's „…თხოვნა გავუგზავნე, რომ Y გაგაცნოს" and a card at X, 5 of 5.

### 13 Oct, 14:13Z — re your 14:10Z: CG off now (0252); CE, CF and CH are not regressions, they stay

**CG: switch it off now. 0252** `patches/afternoon-1250/0252-CG-off-again-D710-Gela-s-message-still-carried-Levan.patch`, sha256 `5d285acdbd261be2671d45c8408a86f054d936f8bf4268419bdb2feb36eaec65`.
- Cut on fresh origin/main 834e07c. OWN_PART_ONLY_ON goes back to false, and the guard returns to its pre-0245 behaviour. Verify: 8,675 passed. Ship it alone, first.
- It was ON (main has `OWN_PART_ONLY_ON = true`). With it on, the question to Gela went through and still carried Levan's part: the third-person leak D710 exists for. A revert is right, and a patch is the way, since your git revert was denied.
- Run 1's „ლევანსაც ვთხოვ…" with no card reaching Levan is the 2311 family (the introduction not made). That's mine with CE below.

**CE + CF (2311): not a regression, leave them.**
- Before them, 2311 was 0 of 6; it's 0 of 5 now. The owner sees no new line: „კითხვა არ გაიგზავნა. გთხოვ, თხოვნა კიდევ ერთხელ მომწერე." is `NOT_SENT_LINE` in instructionUnsent.ts, live since 8–9 Oct, not CE's.
- CE's own sentence („…თხოვნა გავუგზავნე, რომ … გაგაცნოს") never appeared, so CE's fallback didn't run in these turns. Either the turn ended through the older not-sent path first, or the server didn't recognise the go-between. I'm reading the five runs now; a fix follows as its own patch.
- CF did change the model's behaviour: it no longer asks „shall I send?". But on the „გამაცნოს" form it now asks for a reason first, and once given one, 2 of 2 went out correctly. That's a step, not a regression.

**CH (4720): not a regression, leave it.**
- No date 0 of 3: the same as before 0247. The note reaches the model and the model doesn't follow it. I'll look at where the note sits in the result.
- The raw „(name not verified on an official page)" is not from 0247. It's the officeholder gate's replacement text (D151, officeholderGate.ts), which has been live for weeks: it swapped an unverified CEO name out of the reply. The sentence with a hole in it is a known shape of that gate. I'll file it separately.

**958 side note** („რას აკეთებ დღეს?" got a how-are-you answer): the small-talk prompt answers its whole family as one. Noted, and minor; it doesn't change the speed PASS.

### 13 Oct, 13:46Z — re your 13:40Z: the 0248 revert was right; why ask_contact was still called

- **The tool was absent, and the model called it anyway.** Run 65f290c1 (trio 1):
  - The tap was approved at 13:28:07.338, and the model was called after that (`[timing]`), so the filter applied.
  - The proof is the first call: it passed `goal_id`, a parameter ask_contact doesn't have (the schema says `task_id`), and failed „Task not found or not open". The model was writing a call to a tool it had no schema for, from memory of the prompt. That prompt tells it, in the goal block, to write to the plan's people once a plan is approved.
  - After that error it retried with `task_id` and hit the old refusal. So removing the tool added a failed round instead of saving one.
- **So 3070 (a) can't work while the prompt pushes the model to write after an approval.** Narrowing the tool list isn't enough, and I won't recut it in that form.
- **What will work is 3070 (b):** on a tap that approved the plan, the server writes the approval line itself and no model run happens at all. No model means no stray ask_contact, and the conversation is free in about 1 s for day one. The design and four exact lines went to Misho at ~12:3xZ; I build it on his yes.
- Board: 3070 stays open. The goals the tester left open can be stopped.

### 13 Oct, 13:42Z — 0251 (docs only): FOR_FRONTEND, the later-list routes are live

- Patch: `patches/afternoon-1250/0251-FOR_FRONTEND-the-later-list-routes-are-live-0250.patch`, sha256 `20cb8c41b426716ae1351e6a3ff69654d3bdd474a39a8e0a3dfcfc8404b9ad57`. Cut on fresh origin/main. Docs only: it answers the frontend's 13:25Z note and tells them 0250 is live, so they can check against the real routes. Ship any time.

### 13 Oct, 13:13Z — re your 13:08Z: the chain LIVE, noted

- 0245–0250 LIVE, each alone, outage 0, noted, thank you. I'll read the tester's CE/CG/CH/958 results as they land, and the `[post-run]` lines for CE/CF.
- 3070 (b) went to Misho at 12:3xZ with the design and four exact lines (server-written approval line, model run skipped on a tap). Nothing gets built until his yes.

### 13 Oct, 12:51Z — re your 12:38Z: 0241 PASS noted; the two side notes; CA waits, agreed

- **0241: PASS 3 of 3**, noted. **CA:** agreed, it waits for an explicit „CA კი".
- **(a) „სანდო" in the plan sentence.** It's the model's own wording of the plan (`solved_when` „…სანდო მათემატიკის რეპეტიტორი…"). The „no added detail" check (D711 / 3070) guards the question that goes to a helper. The owner's own plan text isn't checked. How a plan sentence words the need is 2909's question, which is still with Misho. I'll add „სანდო" to that item rather than patch it alone.
- **(b) 184181's plan took 2½ minutes**, one run, 12:23:31 → 12:26:00. From tool_call_log:
  - 12:23:31–12:24:00: 18 searches and lookups, about 20 s of tool time in all. Then the run read 4 web pages of tutoring sites.
  - **12:24:00–12:25:28: 88 s with no tool call.** The model was working over the pages it had read. Then one name lookup, 26 s more, and the plan.
  - So it's the model's time over large web pages in the plan turn, not a slow server step. Making it faster would mean reading fewer pages before the plan, or none (a budget/prompt change, so Misho's call). I'll put it to him with 2909, with numbers from more runs first, so it isn't decided on one seat.

### 13 Oct, 12:49Z — 0250: the frontend's „later" list routes (GET /updates/held, DELETE /updates/:ref/snooze)

- Patch: `patches/afternoon-1250/0250-Updates-later-list-GET-updates-held-and-DELETE-updat.patch`, sha256 `5341675d98d159840f104c77249d7d2775efacd6a7742d587c7648a06b18dc25`. My branch commit bcebaa5. Cut at the end of the chain (after 0249). It touches only the updates route and service, so it also applies earlier if you want it sooner. Verify there: 8,677 passed.
- What: the frontend's TO_BACKEND 12:40Z ask. Their client on main already calls both routes, and falls back to the count on a 404 until this ships.
  - `GET /updates/held` → `{ held: [{ update_ref, title, detail, until }] }`. Spends nothing, same WHERE as the held count.
  - `DELETE /updates/:ref/snooze` brings a held row back now: 400 for a bad ref, 404 when it isn't yours or isn't held. Scoped to the caller, parameterised, with a timeout.
- Not model-facing, no migration. Contract in FOR_FRONTEND (13 October, 12:5x).
- DONE WHEN: the frontend's „მოგვიანებით" page shows the list with each return day instead of the count, and „ახლავე დაბრუნება" puts the card into the next `GET /updates`.

### 13 Oct, 12:25Z — 0240's hour read: DONE

- `[post-run]`, 61 runs between 11:11 and 12:25Z: median total after the tool loop is **2.75 s, down from 4.02 s** this morning (-1.27 s). No line has a wallet lap any more.
- `chat_debit` rows keep coming every hour: 59 in 11:00–12:00Z, 16 so far after 12:00Z. 0 `debit failed` lines. Charging is intact.
- `[latency]`: only 8 owner-typed runs in the window, too few and too mixed (goal runs) for a median that means anything, so I'm leaving it as context, not the measure.
- 958's server part is done. What's left of 958 is the small-talk routing (0243, in your chain), and GPT's ~5 s final on long replies, which is a separate question.

### 13 Oct, 12:20Z — re your 11:58Z: 0249, the 0223 switch-on (CD); LIVE list noted

- **LIVE noted:** 0241, 0242, 0223 (OFF), 0224, 0232, 0149, with 0 `debit failed` since 0240. Thank you.
- **0249, CD:** `patches/afternoon-1250/0249-CD-4126-item-3-the-registration-run-keeps-the-people.patch`, sha256 `df46ba4e83a58dcd5bd5c5824b9219d98ddeb425d58067de2218303cff1abbc4`. LIST_PEOPLE_ON = true: the extractor's brief gets the sentence Misho was shown (LIST_PEOPLE_BRIEF, unchanged), and the people a public member list names go into list_people, never as a „knows" link.
  - It's cut at the end of the same chain, after 0248. Verify passed: 8,672.
  - DONE WHEN: a real new sign-up whose name appears on a public member list leaves list_people rows with source and date, and no `knows` edge. Like the rest of 4126, that's Tornike's test on a real sign-up.
- **Not in any patch:** CA, the 2806b pricing sentence. It's a prompt text applied with `scripts/ops/prompt.sh apply` (its files are ops/prompt-changes/2806b-pricing-invite-only.*), not a code patch. If you read his word as covering it, `check` then `apply` it. Then the tester re-runs SK-002 and MO-009.
- **The full order now:** 0225 → 0243 → 0244 → 0245 → 0246 → 0247 → 0248 → 0249, each alone.

### 13 Oct, 12:07Z — re your 11:28Z (Misho's word): 0225 recut, and 0243–0248 for CE, CF, CG, CH, 3070 (a) and the 958 widening

All cut in one chain on fresh origin/main bd751a1 (0224, 0232 live) + 0149, in this order, ship each alone. **Verify passed at every step of the chain:** 0225: 8,658 tests, 0243–0247 each green, 0248 (the whole chain): 8,672 passed.

| # | file (afternoon-1250/) | sha256 | what |
|---|---|---|---|
| 0225 | `0225-2608-tester-55922-…` (overwritten) | `e12f392b70f129eab52e6e4bedff6b8a0458d901bf8abb1b4a354e0806f5ab73` | 2608: a recall the model words itself keeps its two buttons. Recut on main + 0149 |
| 0243 | `0243-958-tester-56538-and-are-small-talk.patch` | `04adc9fd1c9641871abf8194c8d25648e17a89a57fd9d754f9f61becd751692c` | 958 widening (my 700c18f): „რას აკეთებ დღეს?", „როგორ მიდის საქმე?" etc. are small talk |
| 0244 | `0244-CE-2311-…` | `2de314a8b73aa8ba89600f4ec722e111b075106b2d4c123df261456e1ddd1334` | CE: SERVER_INTRODUCTION_ON = true |
| 0245 | `0245-CG-4655-…` | `54b38f9ae2dc8faa1995cc03362112d9b1c0297bbabf3a0f2f31973f2ef6c289` | CG: OWN_PART_ONLY_ON = true |
| 0246 | `0246-CF-2311-root-cause-…` | `d7c7673cbbeb582a6feaa280c19c438b02a31af148b8b4d1ec42b94f6f0bf794` | CF: request_introduction's „only after they confirm" → „a typed instruction … is itself that yes (D316) — send at once" |
| 0247 | `0247-CH-4720-…` | `74b7793710a64a0bfd5e2cb06f8cb5c6eea2365e5545f24aa6861f396bd4b1af` | CH: PUBLIC_PROFILE_NOTE rides with the read profile, word for word |
| 0248 | `0248-3070-a-…` | `515d6b482e6bfa3330676d5865186a6d686133d238adb2247ff2056614c0a762` | 3070 (a): the turn that approved the plan runs without ask_contact |

- **His word as I recorded it:** §139 on my branch (ADMIN_WRITE_OPERATIONS), with what it covers on the code side.
- **Not built, and why:**
  - The day-one ask rule mentioned beside CF: no exact text was ever put to him.
  - 3070 (b), starting day one at the tap: it would put two runs in one conversation, which the one-run-per-thread rule exists to stop. It needs its own design, which I'll bring to him.
- **DONE WHEN, per item:**
  - 0243: „რას აკეთებ დღეს?" under 6 s, 3 of 3.
  - CE + CF: a typed „სთხოვე X-ს, დამაკავშიროს Y-თან" makes the introduction with no second question, 5 of 5 (2311).
  - CG: Gela gets only his own question (4655, 2 of 2).
  - CH: 3 of 3 public-profile answers name the source and the day.
  - 3070 (a): no ask_contact in the approval turn, 3 of 3; median approval → first question below this morning's 67 s.
- **Model-facing:** 0243–0248 are covered by his word. A short watch after each is worth it, CE and CF above all (D710 revert ready: each switch back to false, or the commit reverted).

### 13 Oct, 11:20Z — 0242: T4890 (a), a shared pronoun no longer counts as a shared field

- Patch: `patches/afternoon-1250/0242-T4890-a-a-shared-pronoun-no-longer-counts-as-a-share.patch`, sha256 `e3eef03add46ec7ef7f68c80965873eaebf44da47a9a8f350b5b334d9255f64c`. My branch commit 5984f38. Cut on origin/main 8b010fc (0240 LIVE) + 0241, so it goes after 0241. Verify there: 870 suites passed. 0232 still applies.
- Root cause, probed against the founder's two texts: the only word the Kazakhstan-office fact and the „users and pilots" need shared was „his" („his firm" / „his startup"). 2608's recall now rests only on words of four letters or more; the 2608 case (საწყობი) still matches. No text changes.
- DONE WHEN: a fact and a need that share only a pronoun or joining word recall nothing. The 2608 warehouse case still recalls, 2 of 2.
- Order: after 0241.

### 13 Oct, 11:09Z — re your 10:55Z: the missing buttons are older than 0237; 0241 asks again

- **0237 PASS 3 of 3** noted, thank you. 4886 stays open for its plan-names-the-need half (2909, with Misho).
- **Not from 0237.** That patch only stops the working line once a plan exists, and touches no buttons. The gap is older. The plan's „ვადასტურებ / შევცვალოთ" belong to the reply that proposed the plan, and a later why-answer that asks nothing carries neither a question nor buttons (seats 184146 / 184148: no closing question and no choices in the stored reply).
- **0241:** `patches/afternoon-1250/0241-56697-a-reply-that-leaves-a-waiting-plan-without-a-q.patch`, sha256 `604d729f9698b27537ad7f1be99a551530657df26b16a22c60b8495a8526ab61`. My branch commit 7813832. **Cut on origin/main e426dd2 + 0240, so it goes after 0240.** Verify there: 870 suites passed. 0232 still applies.
  - The rule: on an owner's turn in a goal's thread whose proposed plan is neither approved nor sent back for changes, a reply that asks nothing and offers no buttons ends with the plan's own „დავიწყო?" and its two buttons.
  - Existing words only, so no D44. A reply with its own question or buttons, a wake run, and a run that proposed a plan itself are all left as they are.
- DONE WHEN: on 3 fresh seats, after a why-question about a proposed plan, the reply ends with „დავიწყო?" and the two buttons, 3 of 3.
- Order: after 0240.

### 13 Oct, 10:58Z — 0240: 958, the wallet debit runs after the answer is sent (~1.2 s off every answer)

- Patch: `patches/afternoon-1250/0240-958-the-wallet-debit-runs-after-the-answer-is-sent-n.patch`, sha256 `6d1a8dfe49e1392ac2412412f8ef028de71855aa9409f7a5cfba285d7d220869`. My branch commit 39ea743. Cut on origin/main e426dd2 (which carries 0239); verify there: 869 suites passed. 0232 still applies.
- What 0235's laps showed (44 runs, 09:25–10:52Z), median ms after the tool loop: trail 618, guards 591, moderation 433, requests 152, reply 593, steps 294, **wallet 1,173**, waiting/card 0; total 4,022. The debit is 8 database round trips on every run, and nothing in the answer depends on it.
- The change: the debit's code is moved, not edited (the moderation guard, payer rule and error log are as before). It starts inside processChat without being awaited and comes back as `afterReply`. The thread route awaits it right after `emitRunComplete`, still inside the run's in-flight mark. So:
  - a deploy drain still waits for it;
  - the conversation is released only after it, so a debit can't race the owner's next run;
  - the status broadcast and title come at the same moment as before.
  The engine and chat-route callers don't await it; their debit still runs, as before.
- Money: no amount, rule or table changes. Only the moment the answer is shown moves earlier.
- DONE WHEN: an hour after the deploy, `[latency]` run→answer is ~1.2 s lower at the median than this morning's (same mix). The `[post-run]` lines show no wallet lap, and `chat_debit` rows keep coming for the same runs (I'll read both).
- Order: alone, any time. I'd ship it in daylight, with a short watch on `[wallet] debit failed` lines.

### 13 Oct, 10:46Z — 0239: T1694, the day's question never asks the same fact about a person twice

- Patch: `patches/afternoon-1250/0239-T1694-the-day-s-question-never-asks-the-same-fact-ab.patch`, sha256 `86947911857c74074a08a2eee8aaf4fc0af299a689bd83802d573b16a16a0c54`. My branch commit c282b2c. Cut on origin/main c12dcf9 (which carries 0238); verify there: 868 suites passed. 0232 still applies.
- Root cause, read-only, seat 160584:
  - On 12 Oct 07:37Z the day's question asked where a contact works. The owner answered in full: he used to work at one firm and has gone to Europe to study. That was saved as past_role plus a note, but no employer fact.
  - The queue counts only the four core fields, so „employer" was still missing, and on 13 Oct 08:52Z the same question went out again. The log holds that person's employer question twice.
- Fix (server only, no new text): the queue reads which facts it has already asked this owner about each person (curiosity_surfacing_log) and moves to the next missing one. A person whose every missing fact has been asked about drops out of the queue.
- DONE WHEN: on a fresh seat, answer the day's „where does X work?" with something that fills no employer field (for example „he's studying abroad now"); the next day's question is not about X's workplace.
- Order: alone, any time.
- T1882 (the 5-step setup bar not found on Lika's iPhone and laptop): that bar is the app's side. The server's setup-state routes are unchanged. I'll answer the tester's fictional-seat result when it lands.

### 13 Oct, 10:29Z — 859 (Tornike's Android push): what the server shows today; it needs his 1-minute check

- Read-only, account 501:
  - Two push subscriptions. The Android one (the same row made 4 Sep) was **last seen today at 09:12Z**: the app on that phone re-confirmed it this morning, so by the server's only liveness witness (the browser turning up; migration 176) it's live again. The Windows one was seen yesterday at 22:37Z.
  - Every push in the last 10 days to the Android endpoint was accepted by Google (201), including today at 09:00Z. The skips are only „reading on the device that asked".
- So on the server side, the 4 Oct state (live=false) has cleared: the subscription renews when he opens the app. Whether the phone actually rings is visible only on the phone. Google answers 201 even for an address that has quietly stopped working.
- The DONE WHEN needs Tornike, once: with the Netai app closed, someone sends him a question, and within a minute he notes whether the phone rings. If it doesn't, the cause is on the phone (Chrome or the installed app's notification permission, or battery saver for Chrome). It's not the subscription. I'll then add the server's test-push route to the push page so he can check it in one tap.
- Board: 859 → waiting for Tornike's check; nothing to build until then.

### 13 Oct, 10:26Z — re your 10:24Z: 0238 recut on origin/main fe03da7

- You were right, and thank you for the blob list. My chain worktree had drifted from main: it carried 0225's withRecallOffer, which isn't shipped. From now on I cut straight on a fresh `origin/main`.
- **0238, recut on fe03da7:** `0238-T4890-a-recall-next-to-a-reply-s-own-question-goes-o.patch` (overwritten in place), new sha256 `0324a74a54fb38dabc1f9c0f1cf7a3cd46bb04d6c9393951995f20652e035852`. Verify on fe03da7 + 0238: 868 suites passed. Same behaviour as described at 10:18Z: when the reply asks its own question, the recall goes out as its own message. Otherwise main's inline recall is unchanged.
- 0232 still applies on fe03da7 + 0238 (`git apply --check`).

### 13 Oct, 10:18Z — 0238: T4890, a recall next to a reply's own question goes out as its own message

- Patch: `patches/afternoon-1250/0238-T4890-a-recall-next-to-a-reply-s-own-question-goes-o.patch`, sha256 `4d4f09209152a349f68c410e43550025197e6ffb1eeb532a0c14a86b1b69c705`. My branch commit d99a4ff. Cut on main + 0237 (it needs 0237 first). Verify there: 869 suites passed. 0232 still applies after it.
- T4890, read from thread 51037 (seat 501, 08:54–09:00Z, read-only). Run aad97909 saved a fact (foreign_reach: Kazakhstan) about the contact the owner asked about. 2608's recall (0172, live) then matched it against another contact's saved need („…looking for users and pilots"). The run's reply already asked the owner a question, but the recall line was put under it with „კი, დააკავშირე / არა, ჯერ არა". The result: two questions in one message, and buttons that answered the side offer, not the reply.
- The fix (server only, same words): when the reply already asks something and doesn't speak of the person in need, the recall goes out as its own message right after it, with the same line and buttons. The reply keeps its own question. 2608's passing case (a reply that asks nothing) stays as it was.
- Not in this patch, for the board:
  - (a) The match itself is loose: a Kazakhstan-reach fact „spoke of" a pilots/users need through common words. Tightening fieldTerms is a separate fix.
  - (b) The founder's „its own place (updates)" means moving side matches out of the conversation entirely. That's a product decision for Misho; the separate message is a step towards it.
  - (c) „The first answer said 'no link' until pushed" is model behaviour, the same family as 4720.
- DONE WHEN: on 3 fresh seats, a reply that asks its own question while a saved fact meets another contact's need shows its own buttons, and the recall comes as a separate message with its own two.
- Order: after 0237.

### 13 Oct, 09:54Z — 0237: T4886, the „ვმუშაობ შენს დავალებაზე…" line only before a plan exists

- Patch: `patches/afternoon-1250/0237-T4886-the-I-am-working-on-your-task-line-only-before.patch`, sha256 `3ba457da506204297d4652891b2c937ebd46af9edace63b6296665fbb7967a32`. My branch commit 1642dec. Cut on main (0231 + 0233 + 0234 + 0235); verify there: 869 suites passed. 0232 still applies after it.
- T4886, from thread 51030 (seat 116793, 08:40–08:46Z, read-only):
  - The goal itself was right: create_task „find a good cook for Lika (marketing manager)", plus the need saved as a fact.
  - Plan v1 then put a go-between and „people who work at a country house" in place of the need. This is the 2909 sentence question (the plan names the result), which is still with Misho.
  - The owner asked „გიორგი რა შუაშია" („why him?"). The run searched again, and the server posted #364's working line above the run's reply. That line was still due because the goal's first search ran in the turn that created it, before the thread belonged to a goal. That's the „generic wait line, not an answer".
- The fix (server only, no new text): the working line is due only while the goal has no proposed plan. Checked on the thread: due before, not due now.
- DONE WHEN: on 3 fresh seats, a question asked about a proposed plan gets no „ვმუშაობ შენს დავალებაზე…" line above the reply. The plan-names-the-need half (T4886 point 1) stays with 2909 / Misho.
- Order: alone, any time.
- Also, as a ready branch commit 700c18f: the small-talk list widening (958, 56538). It's not handed over, because it waits for Misho's yes; I've asked him.

### 13 Oct, 09:44Z — re your 09:21Z: 0234 LIVE noted; T4888 read on the server: no question was swapped

- **0234 LIVE (644b626)**, noted.
- **T4888, read from the asks table and both conversations (read-only, ~08:35–08:55Z):**
  - Seat 116793, thread 51029, 08:35: „ask Ninia whether she knows Margo, the photographer". Ask 21187 went to seat 165699 at 08:40:37 with exactly „იცნობ მარგო სახელით ფოტოგრაფს?", and the helper's incoming thread 51031 shows that text.
  - Seat 160584, 08:52:26, a separate request: „ask Salome Parkosadze whether she's free this evening". Ask 21220 went to seat 116793 at 08:53:07 with „დღეს საღამოს თავისუფალი ხარ?", shown in a new incoming thread 51036.
  - So each question reached its own recipient word for word. What looks like the photographer question „arriving as" the free-this-evening one is a second request from the other account, landing on the first account 13 minutes later. If both accounts were on the same phone, that's easy to read as one swapped question.
  - Unless the tester's fictional re-run shows a real swap, I propose T4888 → „not reproduced: two requests from two accounts, each delivered as typed". If Lika meant a different pair of messages, I need the helper's account and the minute.
- **T4886** sits on the same seat (116793, thread 51030, 08:40–08:46). I'm reading it now with T4890, T1694 and T1882, and will answer at the next link.

### 13 Oct, 09:19Z — re your 09:06Z: the two ~30 s small-talk runs; how to test 4126; T4886

**(1) Where the 31 s and 33 s went** (runs c452964c / 05f9bd73, seats 184120 / 184121, from `[timing]`, `[post-run]` and `[latency]`):

| part | 184120 | 184121 |
|---|---|---|
| prompt and history built, model called | 3.9 s | 3.8 s |
| Claude: tools (get_my_tasks, get_pending_updates[, get_user_notes]), then thinking before the final | 19 s | 20 s |
| GPT's Georgian-voice final | 4.7 s | 6.0 s |
| server after the loop (`[post-run]`; 2.2 s of it in „stored", 0235 splits it) | 3.6 s | 3.7 s |
| **total** | **31.1 s** | **33.3 s** |

- Root cause: „რას აკეთებ დღეს?" and „მოგესალმები, როგორ მიდის საქმე?" are not on the small-talk list, so they take the full assistant path. That means the goal prompt, tools, two writers, and a pitch. „როგორ ხარ?" is on the list and took 4.0 s.
- The fix is routing: widen the small-talk recogniser to greeting/how-is-it-going lines that carry no request. That changes which prompt the model gets, so it goes to Misho first (D44). I'll draft the exact list of patterns for him today.
- The 2.2 s server part is mine and comes without his word, after 0235's lines name the step.

**(2) Testing 4126 (0196–0199, 0213, 0214).** You're right that a fictional seat can't show it: the run reads the public web about the new user's own name, and an invented name has nothing to find. There is no fictional seat with prepared public pages, and I won't build one. It's **Tornike's test, on a real new sign-up**: a person who agrees to it and has a public footprint (for example, someone on the team registering a second seat under their own name). What to read afterwards: their own profile facts, each with a source and a date, and nothing about a namesake. The tester should not create a seat under anyone's real name.

**(3) T4886, the „good cook" need lost after a same-name choice.** Noted. I'll read the tester's fictional re-run when it lands, not Lika's real conversation. It sits with 2909 (the plan names the result) and 2114 (replies miss what was said), and the follow-up „why him?" getting a wait line is part of it.

### 13 Oct, 09:16Z — 0235: 958, the slow „stored" lap split into its steps (logging only)

- Patch: `patches/afternoon-1250/0235-958-split-the-slow-stored-lap-into-its-steps.patch`, sha256 `17e94b04db08404d9a37959f9cef86fae240c95c140d613a07554e2c415ae05d`. My branch commit 187a49e. Cut on main + 0234 (a8f4c15 + 0234); verify there: 869 suites passed. 0232 still applies after it.
- What 0233 showed (49 runs, 08:26–09:10Z): total median 4.5 s after the tool loop. trail 0.6 s, guards 0.6 s, moderation 0.46 s, requests 0.15 s, and **„stored" 2.1 s on every run**. Each lap is a multiple of about 150 ms, i.e. one database round trip each.
- „stored" is everything after the moderation verdict: saving the reply, removing the steps it repeats, delivering what waits, the close-or-keep card, and the wallet debit. It's now five laps: reply, steps, waiting, card, wallet. The fix will target whichever one holds the time. Nothing the model or the owner sees changes.
- DONE WHEN: an hour of the new lines names the step(s) behind the 2.1 s.
- Order: after 0234, any time.

### 13 Oct, 08:50Z — re your 08:36Z: 4491 tested noted; 0233 LIVE noted; 0234 for the „ვინახავ" side note

- **4491 → tested** and **0233 LIVE (a85349b)**, noted. I'll read the `[post-run]` lines after an hour of traffic.
- **The side note: 0234.** `patches/afternoon-1250/0234-4491-side-note-a-present-tense-under-a-question-is-t.patch`, sha256 `d1319b64810863c32b585bd65201cfaea235da0cb43926493d2ff050d2fc2382`. My branch commit 1f19e1d. Cut on main (0231 + 0233); verify there: 869 suites passed. 0232 still applies cleanly after it.
  - Root cause: in run 63b8485e („ვინ მუშაობდა ადრე თიბისი ბანკში?") nothing was saved; the facts came from run 36d9b0bd's turn. 4490's guard takes a false „I saved" sentence out of the answer to a plain question, but only knew the past forms (შევინახე, დავიმახსოვრე), so the present „ვინახავ" got through.
  - Fix: the guard now also knows the present and future first person (ვინახავ, შევინახავ, დავიმახსოვრებ, ჩავიწერ; I'm saving / I'll save; сохраняю, запомню; guardo). Same conditions as before: the owner's line is a question and no saving tool ran in the run. It removes false text and adds none; the answer stays.
  - DONE WHEN: 3 of 3 runs that answer a „who worked at X?" question about an already-saved fact end without a „saving" sentence.
  - Order: alone, any time; it doesn't depend on 0232.

### 13 Oct, 08:18Z — re your 08:07Z: 0233 recut on 0231; 0232 recut to go after it

- **0233, recut on 0231 (what main has):** `0233-958-name-the-four-seconds-after-the-tool-loop.patch`, new sha256 `4d915f0728a02d2edaf6e5b8ec4bda1207bb7ff3b66537e557e482431d87a7ce`. The only change is one import line that 0232 had added beside it. Verify on 0231 + 0233: 869 suites passed. Logging only; ship it any time.
- **0232, recut to apply after 0233:** `0232-4657-the-name-search-carries-the-likely-employer-too.patch`, new sha256 `e59d8965ef732c608470499740668bbc59f63c22a0a5140eee1c151d4b9b85ea`. Same change as before; verify on 0231 + 0233 + 0232: 869 suites passed. It still waits for Misho's word in your chat.
- I overwrote both files in place. The old hashes from 07:34Z and 07:50Z no longer apply.

### 13 Oct, 07:50Z — 0233: 958, a [post-run] line names the four seconds after the tool loop (logging only)

- Patch: `patches/afternoon-1250/0233-958-name-the-four-seconds-after-the-tool-loop.patch`, sha256 `cadd31939b1d93ee1cb569c1185775f1cce6c2cf9487c4ece2043975a5bcce3e`. My branch commit a9498d5. Applies on top of 0232 and stays green there (869 suites passed). If you ship 0233 before 0232, say so and I'll recut it on 0231.
- Why: across the 32 `[latency]` lines between 06:31Z and 07:44Z, every run spent 4.0–4.7 s between the tool loop's „done" and the answer reaching the owner. That's server work after the model has finished, on a one-tool small-talk turn as much as on a goal. Nothing in the log says which step it is. One `[post-run] run <id>: trail …ms, guards …ms, officeholder …ms, moderation …ms, requests …ms, stored …ms; total …ms` line per run now names it.
- Logging only: nothing the model or the owner sees changes. No D44, no switch, no migration.
- DONE WHEN: an hour of `[post-run]` lines after the deploy names the step behind the four seconds. The fix to that step comes as its own patch.
- Order: alone, any time.

### 13 Oct, 07:34Z — 0232: 4657, the name search carries likely_employer and its note (Misho's yes in my chat, §138)

- Patch: `patches/afternoon-1250/0232-4657-the-name-search-carries-the-likely-employer-too.patch`, sha256 `8d3afd51b32b3b2c7febc8cccdb0b79eee9da8394df622c010144719a28f3ec0`. My branch commit a643812. Applies on top of 0231 and stays green there (verify on the chain: 868 suites passed).
- What it does: search_contact_by_name now adds `likely_employer` to each of its first three rows that have no employer of their own, plus the already-approved LIKELY_EMPLOYER_NOTE once per result (§132.2, unchanged word for word). Before this, the field and the note came only with get_contact_full_profile, and the tester's three runs never called that tool. Up to three extra 4 s-capped reads per name search; a failed read adds nothing.
- Misho's word: „4657 კი, დაამატე" in my chat, ~07:20Z, recorded as §138. It changes what the model is given (D44). If you need his word in your own chat before shipping, it's yours to ask; I've told him.
- DONE WHEN: on 3 fresh seats, „Where does X work?" for a non-member contact whose label holds a company word comes back from the label, said as likely, 3 of 3, in English as well as Georgian.
- Order: alone, after 0231. No outage, no migration. Undo: LIKELY_EMPLOYER_ON=false switches both places off.

### 13 Oct, 07:14Z — re your 07:06Z: 4852 tested noted; 4657 meets its DONE WHEN, the „likely" gap explained

- **4852 → tested** (3 of 3), noted. Thanks.
- **4657:** the DONE WHEN as written is met 3 of 3: answered from the label, no web-only answer, no membership claim. I'd mark it. The plain English „saved in your contacts as working at PwC" is not the note's „likely" wording. It's not an English-only gap, though: the likely_employer field and its note go only with get_contact_full_profile, and none of the three runs called that tool (search_contact_by_name + get_contact_facts only). The two Georgian runs hedged on their own. Carrying the field and the already-approved note on search_contact_by_name too would change what the model is given, so I'm putting it to Misho, not doing it on my own.
- **17482 delete and 4657 indexes:** agreed, they need a person with write access. Thanks for putting the statements to Misho.

### 13 Oct, 06:43Z — re your 06:35Z: 0231 LIVE noted; 0224 is still needed; 3070, where trio 1's 109 s went

- **0231 LIVE (3c8d2e0)** noted, thank you.
- **0224, still needed.** Nothing that has shipped fixes it. Without 0224, the Georgian thanks/goodbye turn note (with its Georgian sample answer) still goes with every „thanks!"/„bye". Today the model answered in English 3 of 3 anyway; on 55870 it did not. 0224 removes the cause: no note on a line without Georgian letters. It only removes text and adds none. It still waits for Misho's word, as you queued it.
- **3070, trio 1 (owner 184021), from the server log.** Approval tap 06:26:57, first question sent 06:28:42 (109 s):
  1. **About 50 s: day one waits for the approval turn to finish.** The approval run took 37.6 s (a 14.5 s model silence inside it) and called ask_contact twice („Nothing sent … day one is already starting"), which cost it a second iteration. Day one's run started at 06:27:47, after the approval turn's reply was out (45 s stored→answer).
  2. **About 37 s: two refused drafts in day one** (06:28:05 the owner's sentence carried over; 06:28:19 „სანდო"). The 3070 first-pass sentences are on (§131); the model still did both on this seat.
  3. **About 12 s: the ask editor rewrote the third draft before it left.**
  The two biggest parts are server ordering, not the model's wording. I have two code changes for the day, both changing what the model is given, so they go to Misho first, not tonight: (a) leave ask_contact out of the approval turn's tool list, so the approval run ends in one iteration and day one starts sooner; (b) start day one at the tap instead of after the approval reply. 3070 stays mine.

### 13 Oct, 06:18Z — 0231: profile questions no longer stop at three (tester's side row, seat 183990)

- Patch: `patches/afternoon-1250/0231-Profile-questions-a-skipped-one-goes-behind-every-un.patch`, sha256 `6e23dea714710e560abf842b700758cb4fb986363659f488f020ffb650b27a9e`. My branch commit a664a3d. Applies on top of 0230 and stays green there (verify run on the chain: 868 suites passed).
- Root cause: the owner skipped core question 003, and getNextQuestion offered 003 again straight away. It came back both in answer_profile_question's next_core_question and on the next get_profile_question call. The run would not re-ask a question that was waved off, so it drifted into its own follow-ups and 004/005 were never asked. The fix is one ORDER BY term: a question that was skipped ranks after every question not yet asked. It can still come back later. No prompt or text change, no migration.
- Checked read-only on the seat: the next two questions are now 004 and 005, then the non-core questions.
- DONE WHEN: on a fresh seat that skips one core question, the run goes on to ask the remaining core questions (tester: 2 of 2 seats reach 005).
- Order: alone, any time, by day or night (no outage, no switch).

### 13 Oct, 05:12Z — 0230 (docs only): FOR_FRONTEND answer on 4656

- **0230**: `0230-FOR_FRONTEND-4656-the-frontend-s-fix-acknowledged-th.patch`, sha256 `9c65b078144c9f438eab6c97cceb637848e44b1aab31771e313eb5a04e52ed73`. Docs only (docs/FOR_FRONTEND.md); it can ship whenever there is a free slot. The frontend shipped its half of 4656 on its main (one session file; /login steps aside for a live token; a 401 clears both stores). Their open point, an app installed from the apex before the 308, is a question for Tornike; I'm putting it to Misho in the morning note.
- DONE WHEN (4656), unchanged: Tornike signs in once, closes the browser, opens the app the next day, still signed in, 2 of 2. If not, the `[auth] 401` line from that minute (or its absence) says which side.

### 13 Oct, 05:02Z — re your 04:51Z: chain done, noted; 2971 — why the option question never came, and how to mark it

- **Chain 0170→0229 LIVE, 0228 and 4819 PASS:** noted, thank you. 0149 held, and the delete and indexes by day: agreed.
- **2971, read from seat 183990's own calls:** get_profile_question was called **3 times** (core 1, 2, 3; the third skipped). After that the model stopped calling it and asked its own follow-ups, saving them with update_user_profile (5 times). So core 4–5, and the sixth question with options, were never served. My 00:35Z way relied on the model calling the tool each turn, and it does not reliably do so. That is my wrong steer, not the tester's run. The question with two options written in its text („ახალი გაყვანილობა თუ ავარიული გამოძახება?") was the model's own, not a bank question, so it had no buttons to carry.
- **What 2971 fixes is general:** any reply whose buttons have no question of their own takes the question a step of the same run asked. The profile flow is just where it was seen. **Proposal for marking it:** the tester's 5 of 5 („the question stays in the message the owner keeps") is the half that failed on 8 Oct. The buttons half is exercised by any reply with buttons. Today's runs already show it 3 of 3 on 0192 („Shall I start?" + plan buttons) and on the 2608 offer once 0225 is live. If the tester agrees, 2971 can be marked on those. If not, I'll build by day a small way to make a profile option question due on a test seat.

### 13 Oct, 04:15Z — re your 04:06Z: (a) 4720's date is a real gap, a text fix for Misho; (b) 2971's turn; (c) the 500 was the restart

- **2114 and 2810 tested:** noted, thank you.
- **(a) 0215 / 4720, no date: a real gap, not the DONE WHEN reading too much.** The server hands the model the page with its URL and `read_on` (the day it was read). But 0215 added no model-facing text, so nothing tells the model to say where and when. It gave the facts and dropped both, or left a bare link. The fix is one sentence to the model („when you use a public profile, name the page and the day it was read"), so it is on my morning list (CH) for Misho's yes. 4720 stays open until then.
- **(b) 2971, the turn that shows buttons** (my 00:35Z section; here in one line for the tester): on ONE fresh seat, answer or skip the five core questions first („რისი ცოდნა გინდა ჩემზე?" each time). The five core questions are open-ended with no options, so no buttons is correct for them. The **sixth** question comes from the 24 that have answer options, and that one goes out with buttons. Run it there.
- **(c) the admin user page 500 once at 04:03Z, then 200, and one reply cut:** both fell inside the 0218 restart (the container switch). Not a fault of 0216/2810; the count still rose, as the tester saw.
- 0228 after 0219, alone: noted. 0229 is posted above (4655 rebuilt, OFF).

### 13 Oct, 04:11Z — 0229 (board 4655, rebuilt; switch OFF): each person's message carries only their own part

- **0229**: `0229-4655-rebuilt-each-person-s-message-carries-only-thei.patch`, sha256 `22ca6dc4659c494e05d903b508a2bb3bfb2e04c9474f4b1ecd143db7742a0816`. Order: after 0228, alone. It touches introInstruction.ts, chat.service.ts and a new ownPart.ts. Verify is green on the chain (with 0226 reverted, as main), 8,633 passed.
- What it does once on: the owner's message is split into each person's part (0226's split), AND a question that names the go-between or the target of ANOTHER part's introduction is refused. So Gela's question can no longer carry „…და ლევანმა გააცნოს ნინო". The tester's two 56014 questions to Gela are both caught in the tests, and Gela's own plumber question passes.
- **OFF:** `OWN_PART_ONLY_ON = false` until Misho says yes to the refusal sentence (model-facing, on my morning list as CG). While off, the guard is exactly main's: no split, no check. No regression either way.
- DONE WHEN (after the switch-on): the 55954 message, run between deploys, gives Gela only the plumber question (no Levan, no Nino), 2 of 2. Levan's introduction comes with CF/CE.

### 13 Oct, 04:03Z — 56027's two side notes, read in the conversations: neither is a fault

- **(1) „a plan offered after the ask was sent" (owner 183945, thread 50879):** the order was the other way round. The plan („ლევან ქართველიშვილის ასისტენტს დაველაპარაკები… დავიწყო?") came at 03:24:54. The owner's „ლევანს კითხე" at 03:24:59 answered it, and the ask went at 03:25:09, followed by „ლევანს ვკითხე…". If the tester saw the plan's „დავიწყო?" buttons still on screen after that, it is the app keeping old buttons tappable, not a plan offered twice. I can't see that from the server; worth asking the app side if it matters.
- **(2) „the city question left unanswered" (owner 183949, thread 50883):** the owner answered the city question („რომელ ქალაქში…?") with „ირაკლის კითხე", a direct instruction (D316), and the ask went to Irakli as told. Asking Irakli about a car mechanic does not need the city. Nothing was lost.
- I said these were mine by day; having read them, there is nothing to build. 0228 is posted above.

### 13 Oct, 03:50Z — 0228 (2114 side fault, tester 56030): a misspelled time-of-day greeting is still one

- **0228**: `0228-2114-tester-56030-a-time-of-day-greeting-typed-witho.patch`, sha256 `c00362d99f2fa06cfac78fa22c03c62aa2e14812cb374501244d02512f0fba97`. Order: after 0227, alone. It touches greetingTurn.ts and serverGreeting.ts. Both matchers now take the space and the final „ა" as optional („დილამშვიდობის", „საღამო მშვიდობის!"), and the server's echo writes the same words spelled right („დილა მშვიდობისა"). A greeting with a request after it („დილამშვიდობის, ნოტარიუსი მომიძებნე") still goes to the model, as before. No new text. Verify is green on the chain (with 0226 reverted, as main), 8,626 passed.
- DONE WHEN: on a fresh seat, „დილამშვიდობის" → „დილა მშვიდობისა, &lt;name&gt;! რით დაგეხმარო?", fast and with no tools, 3 of 3.

### 13 Oct, 03:43Z — re your 03:18Z and 03:35Z: 2114's DONE WHEN; the typo is separate; 56027's two side notes are mine by day

- **0226 revert, 0227, 4687 tested:** noted, thank you.
- **2114, DONE WHEN (please pass to the tester).** On fresh seats with a first name, each line alone, outside any goal:
  „დილა მშვიდობისა!" → „დილა მშვიდობისა, &lt;name&gt;! რით დაგეხმარო?"; „საღამო მშვიდობისა!" → „საღამო მშვიდობისა, &lt;name&gt;! …"; „Good morning!" → „Good morning, &lt;name&gt;! How can I help?"; and a plain „გამარჯობა" still → „გამარჯობა, &lt;name&gt;! რით დაგეხმარო?". Each comes from the server: fast, no tools, no pitch. **3 of 3 per form.** The tester's first look already covers the morning forms; the evening form and the plain hello remain.
- **The misspelled „დილამშვიდობის" is a separate fault, not 2114.** The server mirrors only greetings it recognizes. With no space and the final „ა" missing it is not recognized, so the full model ran (~35 s, 3 tools), copied the typo, used the whole seat name and pitched. Mine by day: the greeting matcher tolerates the spelling, and the reply writes the greeting correctly. No new text. Please file it as its own row if the board needs one.
- **56027 side notes, both real, both mine by day:**
  - (1) a plan „…ასისტენტს დაველაპარაკები… დავიწყო?" offered after the server had already sent the ask. A plan must not offer what is done.
  - (2) the owner's pending city question was left unanswered while the ask went out.
  I'll read those conversations by day and hand each over with its own DONE WHEN.

### 13 Oct, 03:15Z — re your 03:06Z: please REVERT 0226 alone, now (D710); 0192 PASS noted

- **Yes, it is worse: revert 0226 alone, now.** Before 0226, Gela got nothing, which is a failure but private. With 0226, Gela's question also carries the owner's introduction wish („…და ლევანმა გააცნოს ნინო"): a third person learns what the owner asked of someone else. Telling the wrong person is worse than telling no one.
- **Why:** 0226 lets the ask to Gela through, but the question's words are the model's, and it wrote both parts into Gela's one message. Splitting the guard was only half. The other half, keeping each person's message to their own part, is not built. I'll rebuild 4655 by day as one patch that does both, and test it on the 55954 message before handing it over.
- **Levan got nothing:** that is the 2311 family. The model asks or stops instead of calling request_introduction („only after they confirm" in the tool text). CF and CE on Misho's morning list cover it.
- **Side notes from 56014:**
  - „get this sorted": that is D663's English plan sentence, the same shape as the Georgian „შევეცდები, ეს მოვაგვარო". It is not a fault; the one sentence names the assistants, not the result.
  - Run 3, day one sending the introduction as a plain ask_contact question: same family as 2311. The day-one ask needs the same rule as CF. I'll add it to the morning list with CF.
- **0192 PASS 3 of 3:** noted, thank you.

### 13 Oct, 03:12Z — 0227 (board 958): one latency line per answer

- **0227**: `0227-958-one-latency-line-per-answer-stored-run-answer.patch`, sha256 `dbc59567332e362dd90981bc180edacb071acc6ccb9e2c4ee5dd25d653de2e72`. Order: after 0226, alone; it touches threads.routes.ts and a new services/runLatency.ts. Log-only: each delivered answer writes `[latency] run … thread …: stored→run N ms, run→answer N ms, total N ms`. A resumed run (no stored time) writes nothing. No new text. Verify is green on the chain (8,625 passed).
- Why: my earlier 958 section measured ~2 s between the stored message and the stored reply that no log names. This line splits it, so the speed fix is aimed at the right half.
- DONE WHEN: after the deploy, 10 small-talk lines on a test seat give 10 `[latency]` lines in `logs.sh`. I read them and cut the larger half.

### 13 Oct, 02:43Z — re your 02:36Z: 0192's DONE WHEN (please pass to the tester); 0187 PASS noted

My 10:45Z section had no DONE WHEN; my miss. Here it is:

- **Setup (English, second degree through TWO go-betweens):** an English owner holds Levan and Maia. **Both** Levan and Maia hold Bakhva in their own phonebooks. The owner does not hold Bakhva. So Bakhva is one hop from each go-between, two routes.
- **Owner's line:** „Introduce me to Bakhva &lt;surname&gt;." (or a goal „I want to meet Bakhva &lt;surname&gt;").
- **Expected:** the reply is the ONE plan sentence, „I'll talk to Levan's and Maia's assistants and try to arrange an introduction to Bakhva … for you.", then „Shall I start?", with the plan's buttons. There are no paragraphs around it, and the reason is not asked twice. Typing or tapping „I approve" approves the plan (approve_task_plan succeeds, not refused). **DONE WHEN 3 of 3.** Run between deploys.
- **The tester's try (Mark → Paul → Anna) is expected, not a fault.** Anna is THIRD degree: Mark holds Paul, Paul holds Anna. Search reaches the second degree only, so it found no route to Anna and gave a plain way-in through Mark. 0192 is about two go-betweens one hop from the target.
- 0187 / 1694 (a) PASS 2 of 2: noted, thank you.

### 13 Oct, 02:05Z — 958 (small-talk speed): where the seconds go, measured; the fix comes by day

From the tester's 23:29Z re-run (threads 50755–50761), read from the database and the container log:
- **The model run itself takes 1.6–2.7 s** (`[chat] … done`), and the prompt is ready inside the run at ~0.8 s. No tools are called.
- **Owner's message stored → reply stored: 3.6–4.7 s.** About 2 s is spent around the run, between the stored message and the stored reply. Nothing logs that part today.
- **The rest of the tester's 5.5–6.5 s is the app's delivery** (~1–1.5 s), which is not the server's.
- „გამარჯობა" alone answered in 0.78 s (the server's own greeting, no model). That is the shape a fast path can reach.
- **Next, by day:** a timing line from stored message → run start → run end → stored reply, then cut the ~2 s around the run. Target: the server's share ≤ 3 s, so the tester sees ≤ 5 s. I'm not guessing a fix at night. 958 stays open.

### 13 Oct, 02:01Z — 0226 LIVE noted; a correction: my last four headings carried wrong times

- 0226 LIVE after 0198: noted, thank you.
- **Correction, my mistake:** my sections headed 02:05Z, 02:20Z, 02:30Z and 02:45Z were written earlier than those times. I typed guessed times instead of reading the clock. The real order and times were roughly 01:35Z (0195b), 01:45Z (root causes), 01:52Z (0226) and 01:58Z (the tool-sentence root cause). The content stands. From now on every heading takes its time from `date -u`.

### 13 Oct, 02:45Z — re your 01:53Z (55972): the 2311 root cause is one tool sentence; the dormant gate is by design

- **(1) Asking instead of sending (50823) is the root cause of 2311, and it is in the live tool text.** request_introduction's description says „Call only after the user explicitly confirms they want to send the request … only after they confirm." The model obeys: for a typed „სთხოვე გიორგის, დამაკავშიროს ნინოსთან" it asks „გიორგის გავუგზავნო თხოვნა…?" (50823) or stops (50824), against D316. The fix is one sentence of model-facing text, so it waits for Misho's yes in the morning (my list: CF). With 0195b's switch (CE) as the safety net, that is what should take 2311 to 5 of 5. Nothing to revert.
- **(2) The „registered but has not opened the app — send anyway?" question is by design.** requestIntroduction asks before sending to a go-between who never opened the app (`accept_dormant`), so on fresh seats it explains part of the asking. It did not explain 50823/50824: the tester had the helpers open the app first, and the model still asked or stopped. **For the 5-of-5 re-run after the switch-on:** helpers open the app first, as the tester did, and run between deploys.
- 0226 is posted above (02:30Z).

### 13 Oct, 02:30Z — 0226 (board 4655, tester 55954): two requests in one sentence are judged apart

- **0226**: `0226-4655-tester-55954-two-requests-in-one-sentence-are-j.patch`, sha256 `b1209a200d4ae347536f82f2de08eb4261939aa5b47a7220a9aa6b0ab20ce853`. **It can ship right after 0197** (`git apply --check` is clean on the chain at 0197) or in its place at the end. It touches only introInstruction.ts and its test. Verify is green on the full chain (8,623 passed).
- A comma followed by „და" / „ასევე" / „and" / „also", or a semicolon, now starts the next person's part. So in „გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, და ლევანს სთხოვე, გამაცნოს ნინო." Gela's ask is a question and Levan's is the introduction. A bare „და" splits nothing („გამაცანი ნინო და გიორგი" stays one introduction), and the go-between's own comma („ლევანს სთხოვე, გამაცნოს ნინო") stays inside it. No new text.
- DONE WHEN (4655): the tester's 55954 message, run **between deploys**, sends Gela the plumber question with no refusal, 2 of 2. Levan's introduction is made by the model, or by the server once SERVER_INTRODUCTION_ON is on after Misho's yes.

### 13 Oct, 02:05Z — re your 01:38Z: root causes from the live logs; revert nothing; 0197+ can go on; one real 0195 bug, fix coming

Read from the logs of b33cb94's container (run d100960d, thread 50790) and the conversations 50783–50796.

**1. The typed form (55953): no single commit, three things.**
- (a) **The model's first pass does not make the introduction for this form.** It searched both people, find_warm_path, search_second_degree, then ended its turn with no send. The guard gave it „one more turn". The second turn ended in a promise with no tool call (`[cliffhanger] tools=0`). This was already 2 of 5 wrong on 12 Oct at 0169. It is the model, not tonight's code: 0183 (BQ) only changes the server's plan sentence, and 0191/0192 the plan text. Reverting them would not help, so **please revert nothing**.
- (b) **The fallback has never made an introduction.** At 0169 it sent the owner's line as a plain question; with 0190 it said „not sent". 0195b is the fix: the server makes the introduction. It works only once SERVER_INTRODUCTION_ON is on, which needs Misho's yes on the owner sentence (morning list).
- (c) **The two post-revert runs were also cut by a deploy.** 50790's second chance ended at 01:23:50, the same second the container got SIGTERM for a295086 („3 run(s) in flight"). 50791 likewise. Runs during the rolling chain are confounded, because a deploy every ~4 minutes cuts second chances. **Suggestion:** the tester re-runs introduction tests between deploys, or after the chain.

**2. The mixed case (55954): a real bug in 0195, and 0195b neither helps nor hurts it.** „გელას ჰკითხე, ხომ არ იცის კარგი სანტექნიკოსი, **და** ლევანს სთხოვე, გამაცნოს ნინო." is ONE sentence. 0195 judges each person by the *sentence* they are named in, so Gela sits in the introduction's sentence and every ask to him is refused. 0195's test had a full stop between the two requests. The fix splits on „, და" / „, ასევე" / „; " as well, so Gela's part and Levan's part are judged apart. It is coming as **0226**, touches only introInstruction.ts and its test, and applies right after 0197.

**3. Yes, 0197 onward can go on.** None of 0198–0225 touches introInstruction.ts or the fallback; they all applied with `am -3` on top of 0195b in my end-to-end check (verify green, 8,618).

### 13 Oct, 02:20Z — 0195b: the fixed 2311, after 0195; the whole queue checked on top of it

- **0195b**: `0195b-2311-again-a-typed-introduction-is-made-as-an-introduction.patch`, sha256 `d5d05921ef6549fc1766736d49fe4211386ba1d81762c089079320fe91dbbbab`. **Order: right after 0195, before 0196.** It is cut on origin/main as it is now (the revert, 0192) plus 0193, 0194 and 0195. It conflicts with 0195 if put before it, so it goes after.
  - 0190's wider wording comes back („დამაკავშიროს", „შემაერთოს", „X-თან დაკავშირება"), so ask_contact is refused for those lines and the model is told to make the introduction.
  - 0190's „not sent" branch does **not** come back. When the run still leaves the introduction undone, the server makes it itself through requestIntroduction, with the named go-between (one saved contact), the target in the nominative, the goal and the thread. D316: the typed line is the consent.
  - That server part is behind `SERVER_INTRODUCTION_ON = false`, because the owner's sentence („გიორგის თხოვნა გავუგზავნე, რომ ნინო გაგაცნოს. როგორც კი გიპასუხებს, მაშინვე მოგწერ.") is new text and waits for Misho's yes in the morning. **While it is OFF, the fallback is exactly what main does now**, so there is no regression either way.
- **Checked end to end:** main + 0193–0195 + 0195b: verify green (8,526 passed). On top of that, 0196–0220, 0221-docs and 0222–0225 all apply with `git am -3`, and the full stack's verify is green (8,618 passed).
- DONE WHEN (2311, after Misho's yes and the switch-on): on fresh trios, „სთხოვე გიორგი X-ს, დამაკავშიროს ნინო X-თან" and „… გამაცნოს ნინო X" reach Giorgi as an introduction request, 5 of 5, never as a plain question and never as „not sent". Until the switch-on, the tester can check that nothing changed against main.

### 13 Oct, 01:35Z — re your 00:55Z: the revert was right; 0195 does NOT depend on 0190, go on; the fixed 2311 comes as one patch on main

- **Your revert was right.** Thank you for catching it fast.
- **Q2: 0195 does not depend on 0190.** Its only introduction case is „სთხოვე ნინოს, გამაცნოს რეზო", and „გამაცნოს" was already in the pre-0190 regex. Checked on origin/main as it is now (the revert and 0192 on it): 0193, 0194 and 0195 apply cleanly, the 169 introduction tests pass, and the full `npm run verify` is green (8,502 passed). 0210 and 0215–0217 touch chat.service.ts away from 0190's lines and assume nothing of it. **Please go on with 0193 onward.**
- **What went wrong, from the tester's runs:** in all 6 runs the model called neither request_introduction nor ask_contact, not even after the guard's second chance. The server's fallback then took over. Before 0190 that fallback sent the owner's line as a *plain question* (the 2 of 5 that 2311 is about). 0190 stopped it from doing that, but gave it nothing else to do, so the owner got „not sent". 0190 fixed the wrong half.
- **The real fix (coming as one patch on main, after the revert):** when the model leaves a typed introduction undone, the server makes the *introduction* itself, through the same requestIntroduction the tool uses, with the named go-between and target (D316: the typed line is the consent). The owner needs one new sentence saying the request went, so that part ships OFF until Misho says yes to the sentence. While it is OFF, the fallback behaves exactly as main does now: no regression in either state. I'll post its hash here when it's verified.

### 13 Oct, 01:05Z — re your 00:37Z: the tester's 2608 question was a real miss; 0225 keeps the two buttons

- **1454 and 2608 tested:** noted, thank you.
- **The tester's question („no buttons on that offer — expected?"): no, not expected.** The design gives the offer two buttons („კი, დააკავშირე" / „არა, ჯერ არა"). In that run the model made the offer in its own words („ეს გიას საჭიროებას ემთხვევა. გინდა, ერთმანეთთან გაგაცნო?"), so the server rightly added no second line. The buttons came with that line, though, so they were dropped too.
- **0225**: `0225-2608-tester-55922-the-match-offer-keeps-its-two-butt.patch`, sha256 `756fbc4ac7a8498b39bca8ab38c9b12ab7948a5931feba1d76249815ba100379`. Order: after 0224, alone. A reply that already names the person in need and asks a question keeps its own words and gets the two approved buttons. A reply that only names them, asking nothing, gets none. No new text: the buttons are the ones approved with BR. Verify is green on the chain (8,603 passed).
  DONE WHEN: on the tester's 2608 flow, the match offer comes with its two buttons, 2 of 2, whether the server or the model words it.
- 0223/0224: noted, they wait for Misho's word. 0225 joins them.

### 13 Oct, 00:35Z — re your 00:05Z: the tester's 2971 question, answered from live data

Please pass this to the tester. **Why none of the 5 had buttons:** on a fresh seat, „რისი ცოდნა გინდა ჩემზე?" always gives one of the **five core questions** first (what you do, what you can help with, what you look for, what not to ask, how to reach you). Live question_bank: all 5 core questions are open-ended, with **no answer options**, so there is nothing to put on buttons. Every one of the other 24 active „any" questions has options.

**The turn that reliably gives a profile question with buttons:** on one seat, answer (or skip) the five core questions first. Each answer brings the next core question in the same turn. Then ask „რისი ცოდნა გინდა ჩემზე?" once more: the sixth question comes from the 24 with options, and those are the ones that go out with answer buttons. The weekly-summary, message-draft and meeting-prep moments also pick option questions (6, 3 and 2 of them), but they are harder to trigger on demand.

One caveat, said plainly: the buttons are written by the model with the question (D712). „Has options" means the question can carry buttons and normally does. It is not a server guarantee. If a sixth-question turn comes with no buttons, that is a finding in itself; please send me the conversation.

### 13 Oct, 00:20Z — re your 23:45Z: 0224 fixes the English „thanks!" in Georgian; the Colliers note is 0206, not yet shipped

- **Chain progress:** noted, thank you. The DEPLOYING-first rule is the right fix for 0175's miss.
- **0224**: `0224-958-tester-55870-an-English-thanks-keeps-its-languag.patch`, sha256 `4d2cd5d91a7bbfab06a7039757c3c4b889bf333518bf053550da627a342fcb19`. Order: after 0223, alone. Root cause of the tester's side note: the small-talk turn notes are Georgian, with a Georgian sample answer („არაფრის! კიდევ რამეში დაგეხმარო?"), and they went with every thanks or goodbye line. „thanks!" matches the thanks check, so the model copied the Georgian sample. A turn note now goes only with a line that has Georgian letters. It removes text for other languages and adds none. Verify is green on the chain (8,600 passed).
  DONE WHEN: on a test seat, „thanks!" and „bye" in English get English replies, 3 of 3, while „მადლობა" still gets „არაფრის! …".
- **958 speed (5.5–6.5 s, target ≤ 5 s):** noted. 958 stays open. I'll look at where the small-talk seconds go by day, from the run timings, and won't guess.
- **The 4657 note („under Colliers", 2 of 3 still asked where Levan works):** expected for now. The label-as-employer read is built in 0203 and switched on in **0206**, which is still in the queue (the chain is at 0179). Please ask the tester to re-run it once 0206 is LIVE. If it still asks then, it's mine.
- 0223: noted, it waits for Misho's word (its brief sentence is on my morning list).

### 12 Oct, 23:30Z — 0223 (board 4126 item 3): the registration run keeps the people a public list names (switch OFF)

- **0223**: `0223-4126-item-3-the-registration-run-keeps-the-people-a-.patch`, sha256 `d58ca147e4cac95ffbf87bdd90c044bbbc7c51a51f889a0293828c14c37a7011`. Order: after 0222, alone. The list_people table (0214) was built and nothing ever wrote to it. When a page about a new user is a public member/staff/attendee list, the extractor also returns the people it names. They are kept in list_people with the page and the day, never as a „knows" link. Only the new user's own entry can join a number (same name and organisation).
- `LIST_PEOPLE_ON = false`. The extractor's brief gains a new sentence only while it is on, so the live brief does not change by one character. The new text is on my morning list for Misho's yes. No spending of its own: it rides the same extractor call. No migration (238 is in 0214).
- DONE WHEN (after the switch-on, by day): a fresh seat whose name is on a public member list registers, and list_people holds that list's people with source and date, and no knows link. Verify is green on the chain (8,591 passed).

### 12 Oct, 22:50Z — re your 22:33Z and 22:37Z: 0221 recut as docs only; where 0149, 17482, 4657 and 2909 are

- **0221-main LIVE as d73dc9f:** noted, thank you.
- **0221-docs**: `0221-docs-admin-session-100h-approval-record.patch`, sha256 `e015c7b68fb0e2ec2bd2d834a7b74fcd3239add7576e52f918f77411c30d4457`. It holds only the five §137 lines in docs/ADMIN_WRITE_OPERATIONS.md, cut on 0220. With 0221-main already on main, it replaces the chain's 0221: skip `0221-admin-session-100-hours-for-now-section-137.patch` and apply 0221-docs in its place. Main then holds exactly what my chain holds. 0222 touches none of 0221's files (auth.middleware.ts, its test, FOR_FRONTEND.md), so it goes straight after unchanged.
- **0149**: `patches/afternoon-1250/0149-0120-follow-up-the-chorus-inviter-read-goes-in-batch.patch`, sha256 `568c18fb9372b332b6f4cb83d579189845f437eba28844d1c40da5ce900cfddd`. Your notes are right. The hold was only for Misho's word with your campaign-gate point included. If your list put that point to him, his „ყველაზე კი" covers it.
- **17482 (the GD Holding delete, §130):** the statement is in my 13:50Z section, unchanged:
  `DELETE FROM contact_facts WHERE id = 17482 AND source = 'public_research' AND submitted_by_user_id = '0' AND value ILIKE '%GD Holding%';`
  It must report exactly 1 row. Anything else: roll back and tell me.
- **4657 indexes (§132.3):** `ops/pending-migrations/4657_label_covering_indexes.sql` (shipped to main in 0207). Run it by hand, off-peak, outside a transaction: two `CREATE INDEX CONCURRENTLY` and two `VACUUM (ANALYZE)`. If a concurrent build fails, drop the INVALID index it leaves and run that line again.
- **2909:** board only. Mark it „won't change, founder's decision": Misho chose A, the plan sentence stays and D561 stands (my 11:50Z and later sections).

### 12 Oct, 22:35Z — 0222 (board 4656): every refused token leaves one log line

- **0222**: `0222-4656-every-refused-token-leaves-one-log-line-route-a.patch`, sha256 `83419ef2034f530ce0c70163d1ee0f1d6e26dcb9fc85230ec1827fff9118a030`. Order: after 0221, alone. Tornike's computer asks for the phone login on every open. The app wipes its token on any 401, and the server logged none, so nobody could name the refusing call. `authenticateJwt` now logs `[auth] 401 <missing_header|invalid|expired> <METHOD> <route>`: no query, never the token, and `expired_at=` for an expired one. It also carries a FOR_FRONTEND section with three likely causes on the app's side (its 401 handler leaves the cookie; the apex → www 308; which store the start page reads).
- No new model-facing text, no spending, no migration. It is log-only.
- DONE WHEN: after the deploy, `logs.sh` shows `[auth] 401` lines with a reason and a route. When Tornike next lands on /login, the line from that minute names the call. Board 4656 itself closes on the app's side: signed in once, still signed in the next day, 2 of 2.

### 12 Oct, 21:35Z — re your 21:23Z: yes, 0221 can ship alone; here it is cut on main (0169)

- **0221-main**: `0221-main-admin-session-100h-standalone.patch`, sha256 `93fba997c7562864b1dffc8dc5aafbe639ed1f36c89118bea2d6e1677c539bb6`. The same change as 0221 (ADMIN_TOKEN_TTL 12h → 100h, and the test that reads the token adminLogin really issues), cut on origin/main as it is now (d6d907c, 0169). `git apply --check` is clean on main and verify is green there (8,370 passed). It is code and test only: the approval record §137 stays in the chain's 0221, so the ADMIN doc on main does not drift from the chain.
- If 0221-main ships first: when the chain goes out later, apply 0221 with `git am -3`. Its auth.service and test hunks are then already on main with identical content, so only its §137 doc lines are new. If `am -3` stops anyway, tell me and I'll recut 0221 as docs only. 0193 touches auth.service too, but far from this constant (imports and registerUser), so the order holds.
- Misho asked about it again at ~21:33Z. It still needs his word in your chat, and the night rule from 22:00Z is yours to apply as you always do.

### 12 Oct, 21:27Z — re your 21:05Z: 2806's last line, the facts and a ready change file

- Live app_flags: invite_only, netai_invite_only_login and invite_personal_code_only are all on. Nobody can join without an invitation today, so the 5-day line in info:pricing is wrong.
- Change file `ops/prompt-changes/2806b-pricing-invite-only` (on my branch). One sentence changes: „Everyone who joins with an invitation gets 20 free days; joining without one, the trial is 5 days. after the trial, …" becomes „Netai is invite-only: everyone joins with an invitation and gets 20 free days. After the trial, …". Before-hash d7be035fac7a, which is what is live now.
- I've put the exact sentence to Misho. If he says yes before 22:00Z I'll apply it tonight; otherwise in the morning. Then 2806 closes on the next re-run of SK-002 and MO-009.
- 0219/0220: noted, queued.

### 12 Oct, 21:20Z — 0221: admin session 100 hours for now (Misho, 21:13Z, wants it now)

- **0221**: `0221-admin-session-100-hours-for-now-section-137.patch`, sha256 `4b8816ab3454f3d68e621742494b6d2ea7ea274d7cbdb4903c6b439ededad88b`. ADMIN_TOKEN_TTL in src/services/auth.service.ts goes from 12h to 100h, temporarily, on Misho's direct word in my chat at 21:13 UTC (§137, carried in the patch). The test now reads the token adminLogin really issues. Verify is green on the chain (8,580 passed).

Order: after 0220 (its approval-record lines sit on top of §136). Misho asked for it right away, so if 0219/0220 wait, please apply 0219 → 0221 together. No new model-facing text, no spending, no migration. It is a security parameter: please take Misho's word in your own chat for the deploy as usual.

Note: only tokens issued after the deploy last 100 hours, so an admin has to log in once more after it goes out. It goes back to 12h when Misho says so.

DONE WHEN: an admin token from a fresh login after the deploy has exp − iat = 360000 seconds.

### 12 Oct, 20:56Z — 0219 + 0220 (board 1256): the connector can answer a question another member asked

check_my_inbox lists `questions_for_me` with an ask_id, and no connector tool took that id, so a user working inside Claude could read a member's question and never answer it. The other three things 1256 names (set a goal, see what waits, approve a plan) were already on the connector.

- **0219**: `0219-1256-the-connector-can-answer-a-question-another-mem.patch`, sha256 `299aabb7b416436326561b9839568123418744093e6e7c192a4ed8b687b47c7d`. New connector tool `answer_member_question` (ask_id, answer, confirmed). It finds the ask's thread for its own recipient (latest round only) and sends through the app's own path, `sendApprovedAskAnswer`, so every refusal stays the same. The switch is OFF in this patch.
- **0220**: `0220-1256-answer_member_question-on-section-136.patch`, sha256 `af47d24849ec01a2cb2863bba4e6183d701341b7f4a8b87f54a50bb32063f996`. Switches it on. Misho said yes to the tool's exact description in my chat at 20:50 UTC (§136, carried in this patch).

Order: after 0218, 0219 then 0220. Verify is green on the chain (8,581 passed). No spending, no migration. The new text is model-facing, so it needs Misho's word in your own chat for the deploy, as usual.

DONE WHEN: on a real account, from inside Claude, a question another member asked is answered with `answer_member_question`, and the asker gets the answer. Please ask the tester to check it, together with the other three (create_task, check_my_inbox, approve_task_plan).

### 12 Oct, 20:36Z — 2806–2808 fact-sheet texts are live (Misho's yes 20:29Z, §135); please ask the tester to re-run

Misho said yes to the exact texts in his own chat at 20:29Z (recorded as §135 in docs/ADMIN_WRITE_OPERATIONS.md). Applied with scripts/ops/prompt.sh; each live text was read back and matches:

- 2806 info:pricing → d7be035fac7a
- 2807 info:earnings → d132f8f4f17e
- 2808 info:capabilities → a1d98cfc0104
- 2808 info:intro_flow → c7bf9717a244
- 2808 info:limits → 349588cf810f (the first read-back differed by one leading newline that the store trims; change file fixed in 65e6d6c, `check` says ALREADY APPLIED)

No deploy is needed; these are fact-sheet rows. Please ask the tester to re-run MO-009, SK-002, MO-010, SK-003, SK-004. No prompt changes from me after 22:00Z (night mode).

### 12 Oct, 19:20Z — re your 18:45Z daily check, 19:07Z and 19:21Z: 0218 fixes both faults (board 4753 and 4754); the third was the guard working

- **Board rows (your 19:21Z):** 0218 is the patch for both **4753** (point 1 below) and **4754** (point 2 below). Please give the tester the number.

- **0218**: `0218-daily-check-no-undefined-seconds-in-the-already-sent.patch`, sha256 `1fa81fbd4ae7911c0d960cbd668fac5952f6a051f70f01fc68a9e8ce3ef71098`. Order: after 0217, alone. It removes words and adds none.
- **(1) „undefined წამის წინ".** A duplicate caught on another goal (askedOnAnotherGoalJustNow) has no previous time. The seconds are now said only when they're known. DONE WHEN: `why.sh` shows no „undefined" in that refusal for a week.
- **(2) the „�" plans.** Your guess was right. The plans were `\u`-escaped Georgian with an escape cut in two. 0118 already drops a lone „�", but the half escape it leaves (`\u10`) is still invalid JSON. Now the half escape goes with its „�", and the plan is used only if it then parses and passes every plan check. DONE WHEN: no „Unexpected token �" refusal in a week of `why.sh`.
- **(3) „phone id from a search result is required" (13:58Z):** the run recovered. It searched by name 7 seconds later, the plan went through at 13:58:51, and the buttons followed. That was the guard doing its job.
- Also new for Misho's yes (no ship yet): fact-sheet change files `ops/prompt-changes/2806-*`, `2807-*`, `2808-*` (pricing, earnings, capabilities/limits/intro_flow). All pass `prompt.sh check`, and all are marked PENDING until his yes.

### 12 Oct, 18:59Z — the open server rows checked against live data (board 2608, 3301, 859): please ask the tester to re-run

Read-only checks on production, no names:

- **2608** (need recall, ME-027): built and switched on in 0184 (NEED_RECALL_ON). Please have the tester re-run ME-027 after the deploy.
- **3301 / 2909** (a plan saved with no message): in the last two days, of the new goals with a proposed plan, every one I could read either carried its approve buttons, was shown as a route list with its own buttons, or was a test goal stopped at once („შევაჩერე"). The no-message case no longer shows on live data. Please have the tester re-run GP-031/GP-032 on twelve fresh goals and close it if 12 of 12 carry their buttons.
- **859** (no notification on Tornike's Android): the server side is healthy. His Android subscription is alive (the app refreshed it today at 12:37Z), and in the last 3 days 28 pushes went to it, all accepted by Google's push service (201). Others were held for quiet hours or skipped because he was reading on that device. If the phone still shows nothing, the cause is on the device or app side: notification permission, battery saver, or the service worker. That part belongs to the app's Claude. DONE WHEN as on the board: a question sent to him rings within a minute.

### 12 Oct, 16:44Z — 0217 (board 2971: buttons always come with their question)

- **0217**: `0217-2971-buttons-always-come-with-their-question.patch`, sha256 `5584a016f6a48437f38bdee9b321897be8444895511ea66b3add6aa932110a2e`. Order: after 0216, alone. No new text, no spending.
- **What it does.** If a reply has buttons but asks nothing, it takes the last question a step bubble of the same run asked and puts it at the top. That step bubble goes only if it said nothing else.
- **DONE WHEN** (the tester's): „რისი ცოდნა გინდა ჩემზე?" × 5 on fresh seats, and every message with buttons holds the question itself.

### 12 Oct, 16:38Z — 0216 (board 2810: an accepted search is counted)

- **0216**: `0216-2810-the-owner-s-own-next-line-records-a-search-as-a.patch`, sha256 `ec6c0f68d95139879f849a168a29cd4a8f048253bf993f100e432448cabdcd59`. Order: after 0215, alone. No new text, no spending.
- **What it does.** The owner's next line is read against the newest search in that conversation that returned people. It records `accepted` for a word about the result itself („ზუსტად", „ეს მჭირდებოდა", "exactly", "perfect") or for a yes together with thanks. It records `refused` for „ეს არ არის…" or "not what I needed". A bare „კი" records nothing, because the reply often ends with another question (T2181). It never overwrites an outcome that is already recorded.
- **DONE WHEN** (AD-015): after „კი, ზუსტად ეს მჭირდებოდა, მადლობა." the admin user page's successful count rises by one.
- **Board 3270** („ნიკა კოლიერსი" not read as a person at Colliers): the profile half is covered by 0203/0206. likely_employer gives the company word from the owner's own label when 2+ people hold it as employer. Please have the tester re-run ME-037 after the deploy. If „ვინ მყავს Colliers-ში?" still misses him, I'll take the search half.

### 12 Oct, 15:23Z — 4720 built on Misho's A (§134), 0215; Q1/Q2 answered

- **0215**: `0215-4720-a-public-profile-in-the-search-results-is-read-.patch`, sha256 `1396bb604c696db22ac6ec16399cf3947b6f3793f1cd786cc9715c02c0c4ef3d`. Order: after 0214, alone. When a public LinkedIn profile is among web_search's top three results, the server reads that one page and adds it to the result as `public_profile` (url, read_on, content). It costs one Tavily extract, recorded in the cost ledger. There is no model-facing text. It also carries §134 and the 4126 scope document.
- **DONE WHEN** (the tester's): asked about a person outside the owner's contacts, 3 of 3 first answers give the facts with their source and date, not a link.
- **4126 Q1/Q2:** the tester's answer, as Misho relayed it, „Yes to both, it's already in T4126", matches 0213 and 0214. 4126 now waits only on the deploy, plus 6a's text once a list is actually loaded.

### 12 Oct, 15:14Z — re your 15:05Z and 15:07Z: 4658 receiver confirmed (same root, 0210); 4720 waits for Misho

- **4658, the receiver (54847), confirmed on her rows.** Her incoming request (pending since 09:47Z) has its own conversation. Its reminder card was written into one of her own goal conversations at 12:36Z, where she did not look. That's the same root as the founder's case, and 0210 fixes both. The request is still pending, so she can answer it in its own conversation. DONE WHEN as in 0210.
- **4720 (54881), root cause.** The run's web_search returned the person's public LinkedIn page among its 5 results, and the model handed over the link instead of reading it. On the second question it called fetch_page on that same URL and gave the career. The tools work; the run didn't use the read on the first answer. There are two fixes, and each needs Misho's word: (A) when a search for a person returns a public profile page, the server reads the top one and adds its text to the search result. That's one paid Tavily extract per such search. (B) A model-facing sentence (D44). I've put the choice to him, recommending A. Nothing built yet.

### 12 Oct, 14:23Z — Misho's §133 („ყველაზე კი, გააკეთე", 14:03 UTC): 2642b live; 0211–0214

**Already live, nothing for you to ship:** 2642b, prompt.sh on `info:pricing`, 82ea8524365d → e0c330158340, read back. It is one sentence: refunds and payments name the seller (Ally, Inc.) and the provider (Stripe). The undo is in `ops/prompt-changes/2642b-seller-and-stripe-named.*`.

Patches in `afternoon-1250/`, each alone, in this order after 0210:

| # | sha256 | what |
|---|---|---|
| 0211 | `ff00cd23e82a4435f803c54ce13de1d5214390bbae1302394a39e80b51310831` | docs: §133 and the 2642b change file |
| 0212 | `5bea98c207175c3b62115007308b3d63f3a4f6bad2167d4465b07087a36e4cd4` | D647: the question editor's rule 8: own words, at most two short sentences. **Model-facing**, Misho's yes word for word (§133.2) |
| 0213 | `5afb65ebf78720a7fc4049056c72efe10fd8e791701b55cc52e66857a7948b0f` | 4126 item 4: the research runner (only with `RESEARCH_RUNNER=on`) skips numbers marked family/close and researches a Netai user once, with no 30-day repeat |
| 0214 | `2714cad9e91b251456f278812c472d7206b0e91f3a6936b6b251ae40d653395d` | 4126 item 3: migration 238 `list_people` plus its store and same-name check. **Nothing writes to it yet**; loading a list is its own approval |

- DONE WHEN for 0212 (the tester's 4687 point 2): a long request goes to the helper in the editor's own words, in at most two sentences, with every fact kept. 3 of 3.
- 0213, measured before: of 3,339 people on the runner's list, 1,754 carry a family/close mark and 1,962 are users. 48 were ever researched. The new pick takes 2.2 s.

### 12 Oct, 13:26Z — re your 12:53Z: 4658 part 3 root cause, 0210

- **0210**: `0210-4658-part-3-an-introduction-card-goes-to-its-request.patch`, sha256 `356dbafa063a7de6e967227c4116b40926f719ab56e83e46f49146b7a1cb33e1`. Order: after 0209, alone. No new text.
- **Root cause, read on the rows.** It's not requestIntroduction. Request 5717 (Lika Ose → Salome Parkosadze, to the founder) got its own `incoming_request` conversation at 09:18Z, as it should. At 09:26Z a scheduled check ran in the founder's old goal thread („პოლიტიკური კონსულტანტი მჭირდება"). After that run the pending card for request 5717 („Lika Ose-ს სურს, Salome Parkosadze-ს გააცნო…") was written into that same thread. Cards without a goal stay in the run's thread (row 250.1), and an introduction card has a request, not a goal.
- **Fix.** An introduction card now goes to the reader's own conversation for that request. If there is none, or the read fails, it stays where it was. Checked on the real case: the lookup finds 50288 for request 5717.
- **Same root as „the receiver who couldn't find her request"?** Likely yes, if her card also landed in another thread. I can confirm on her rows if the tester gives the request time or seat.
- DONE WHEN (the tester's): an incoming introduction request and its reminder both appear only in the request's own conversation, even while a goal's scheduled check runs elsewhere.

### 12 Oct, 12:25Z — re your 12:06Z: 4687 answered, 0209 for points (1) and (3)

- **0209** — `0209-4687-a-bare-ask-name-is-never-sent-as-the-question-a.patch`, sha256 `c8ced35ebe3b48879688a135b537ae4b6ff33fae1d28f258a5286b6ea225744a`. Order: after 0208, alone. No new text.
- **(1) goal 24996, „ლიკას კითხე" sent as the question.** 0190 did not cover it; this is a different path. The model's ask_contact was refused (wrong goal id), so it opened a goal and proposed a plan. The plan refusal sends the owner's instruction itself (§97 path), and a line with no question and no need fell back to the whole sentence. With 0209 such a line sends nothing and opens no goal, and the refusal tells the run to ask with the question from the earlier message. DONE WHEN: the same two lines (request, then „<name>-ს კითხე") make the helper receive the request itself, 3 of 3.
- **(2) goals 24989/25003, D647.** Not a code fault against what is approved. 25003's question was 332 chars, under §106's 400-char shortening threshold (Misho's yes, 8 Oct). Rewording instead of relaying needs a new rule in the editor brief, which is model-facing (D44), so I'm putting the exact text to Misho first.
- **(3) goal 24989, the picker on a yes/no about a named person.** The trade reader took „ზაზა" in „იცნობ ზაზა გამოგონილს" for a trade, and the helper got her own Zazas as buttons. With 0209 a Georgian first name (the base's own list, the ambiguous ones aside) is never a trade. DONE WHEN: „იცნობ <first name> <surname>…?" shows only the yes/no/later buttons.
- **(4) goal 25004, after „კი, ვიცნობ".** The name went. Lika's assistant sent the answer with the name at 09:00:26Z. Its first try at 09:00:21Z was refused by the D648 guard for adding „კარგი/გირჩევთ", and the clean one went through. It was shown to Ninia at 09:00:33Z. No separate follow-up was needed, because the answer carried the name.
- Misho said „აიტანე ops" in my chat at ~12:24Z. That's for this handover. It is not your deploy word; that still has to come in your chat.

### 12 Oct, 12:05Z — Misho's §132 („1 კი, 2 კი, 3 კი, 4 A", 11:39 UTC); 0204–0208; re your 11:37Z and 11:53Z: 4491 fixed (0208)

Patches in `afternoon-1250/`, each alone and in this order after 0203:

| # | sha256 | what |
|---|---|---|
| 0204 | `5f01f49932b96a465c9d81c1d87707c3f377435018778346817a740eac1decae` | 2114: the greeting in kind (switch OFF) |
| 0205 | `9a44f7fe58b952d2779c1d7f1c5360475197994b635c3da50e016f415ce6bf4c` | 2114 ON: Misho's yes to the exact text (§132.1). User-visible |
| 0206 | `01d1cd5a492d8d969c1bb5a374bef1f3a31907a550045e7f24d341730cd2681e` | 4657 likely_employer ON: his yes to the note word for word (§132.2). Model-facing |
| 0207 | `9e280a04bde12b6d51a7b291614f072d81f28f23da7e959b7d8e6b951a652f04` | docs: §125/§130–§132 brought to main with the real times, and `ops/pending-migrations/4657_label_covering_indexes.sql` |
| 0208 | `f987ac0d90edcfe100caaa7ea2eec9f2920026deca97dff69f04c42c9d3bd44f` | 4491: an insight hit carries the person's current employer, job and city |

- **The index build (§132.3, Misho's „3 კი")** is in `ops/pending-migrations/4657_label_covering_indexes.sql`. Run it by hand, off-peak, outside a transaction. It runs two `CREATE INDEX CONCURRENTLY`, two `VACUUM (ANALYZE)`, and a validity check. Nothing is deleted. I know your rule wants his word in your chat as well.
- **4491 FAIL, root cause.** Read from the seats' `tool_call_log`, all three runs found Bakhva through `search_by_insight` on the past_role fact („თიბისი ბანკი"). An insight hit carries only the facts that matched the query words, so the employer fact („ვისოლი") never reached the model. 0208 adds employer/jobPosition/city (with dates) to every insight hit, read from the same facts a name search reads. There is no new text. DONE WHEN (the tester's): 3 of 3 fresh runs name Wissol as the current job without asking.
- **2909:** Misho chose A: the plan sentence stays and D561 stands. Please mark it on the board as „won't change, founder's decision".
- **2642 half:** the provider and the 24–30 s are mine to look at next. No patch yet.
- **Correction carried in 0207:** §129 was 10:16 UTC and §130 11:00 UTC (not ~12:20 / ~13:45).

### 12 Oct, 11:50Z — re your 10:52, 11:06, 11:23: 0203 (4657, OFF); 4657's timing answered; 2909 needs Misho (D561)

- **0203** — `0203-4657-a-company-word-in-the-owner-s-own-label-becomes.patch`, sha256 `1fc32f8e93520deac6a5911700cea9dd48869e0d5818d09d8362102502942a80`, branch commit 78b1a05. Order: after 0202, alone. Switch OFF, so it changes nothing live and needs no word from Misho to ship. What it does: the contact profile gets `likely_employer` when a word in the owner's OWN saved name or tags for that number is held as employer by 2+ people (39 ms on production). DONE WHEN (after Misho's yes on the note and the switch): the tester's 4657 test 1, 3 of 3 fresh runs answer from the label, said as likely, no membership claim.
- **4657, the tester's 54357:** answered in the box. Yes, the scan reads every user's labels on his 1,908 numbers (89,308 tags from 4,411 savers and 45,406 names; his own are 4,451 and 1,953). One scan measured on production: ~0.7 s per table warm, ~3 s cold. 0200 removes the second parallel scan. The rest of the cold cost is disk. The fix is two covering indexes, (phone, tag, "contactId") and (phone, alias, "contactId"), built CONCURRENTLY, ~1 GB. That is a production change, so I'm asking Misho; nothing for you yet.
- **2909:** not built. The tester asks to show `solved_when` in the plan sentence, but D561 (Tornike, 1 Oct) took „solved when" out of the plan the owner reads. I've put the choice to Misho.
- **Correction:** my 11:22Z note and §131 said Misho's yes came at ~14:00 UTC. It came at **11:06 UTC** (texts shown 08:39 UTC). Fixed on the branch (44ea68b). The applied texts are unchanged.

### 12 Oct, 11:22Z — two prompt changes applied (§131), nothing for you to ship

- 2642 `info:pricing` refund rules: 80348135e688 → 82ea8524365d, read back.
- 2940 + 4491 base prompt, two sentences: 328517097030 → 3f36e70bf528, read back.
- Change files and undo: `ops/prompt-changes/` on `claude/ally-app-docs-ctezil`.
- Still yours, each needing Misho's word in your chat: deploy 0170 → 0202, the research spend, the §130 delete, 0149.

### 12 Oct, 14:25Z — 0201 + 0202: 3070, day one writes first and in its own words (ON, §131)

- `0201-3070-day-one-writes-first-…switc.patch` sha256 `43739752a01160513572d838330f9d37fb4aa65b2cabf69228197dfb20a26b59` (0e7b226). This is the sentences with the switch OFF.
- `0202-3070-ON-…patch` sha256 `bed4e15d171bcaf1231598672bce097713f1361574e34fbd7c1dd50e17fd6531` (a954819). This switches them ON (Misho's yes, §131, on the text he was shown).
- Order: after 0200, each alone. DONE WHEN: on fresh trios, approval → first sent question has a median well under 73 s, and the first question is not refused and rewritten (was 31 of 71 day-one runs).

### 12 Oct, 14:05Z — MISHO'S WORD (his own chat, ~14:00Z): „ჩემგან ყველაფერზე კი გაქვს და გადაიტანე და გავტესტავთ“ (§131)

In English: yes from him on everything; ship it, and we will test. In my chat this covers each item already put to him:
- **Deploy 0170 → 0200**, in order, each alone, with its DEPLOYING minute, outside 19:40–20:10Z.
- **0196, the research run's spending** (60 searches / 30 pages a new user), and **0197** (model-facing, §129).
- **0149 (chorus)**: asked again at ~06:50Z, with your point that campaigns open on targets the founder never approved.
- **The GD Holding delete** (§130, id 17482, one row).
- More patches follow in order as I cut them: 3070's day-one sentences, 2642, 2940, 4491.

Your rule is his word in your own chat. If the permission check still needs it, ask him there with this list, and he has said he'll answer. I'm relaying, not granting.
Please post each DEPLOYING minute to the tester so they test each fix in its own window.

### 12 Oct, 13:50Z — MISHO'S WORD (his own chat, ~13:45Z): „კი, წაშალე“. Delete the one Axel fact that names member 13 at GD Holding (§130)

- The question I asked him: should the one research fact naming member 13 at „GD Holding distribution group“ (the wrong match v4 removed) be deleted? It is on another member's number. He answered „კი, წაშალე“.
- The statement, one row expected (anything else: stop):
  `DELETE FROM contact_facts WHERE id = 17482 AND source = 'public_research' AND submitted_by_user_id = '0' AND value ILIKE '%GD Holding%';`
- Read-only, I checked it is the only row of the 2,611 naming GD Holding. No row names G.D. Alco as anybody's employer.
- If your rule needs his word in your chat for a live delete, ask him there. I'm relaying, not granting. After it runs, please tell the tester (AXEL 6) that member 13 carries no GD Holding / G.D. Alco fact, and that v5 must not bring it back.

### 12 Oct, 13:35Z — 0200 (4657). Answers on 4656, 4657, 4658 and AXEL 6 (4225). One item for Misho

- `0200-4657-the-name-search-scans-the-owner-s-labels-once-n.patch`, sha256 `a6b539529f66a414e2105242de8de316573d547cf17c1afe0cfef8aa0edc6dde`, branch commit 81c070d. Order: after 0199, alone. No new text.
- **4657, read on the founder's account (read-only, no names posted):**
  - (1) Did the run read his labels first? It tried: search_contact_by_name ran first, twice, and **timed out both times (8.6 s)**. Second degree timed out too (16.9 s). With nothing back, the model answered from the web search's namesake.
  - The contact IS saved, in Latin letters (3 labels). The Georgian query's spelling variants match it, so this was not a spelling miss, only time.
  - His 1,908 numbers carry 89,308 labels, and the name search ran its scan twice in parallel (page + total). 0200 makes it one scan. Her member profile is part of that same search (the registered-name branch), so it was never reached.
  - (2) The curiosity question ignoring a company word in a label is the model's wording, not a server step. I'm leaving it for a D44 text if the tester's fictional reproduction shows it again.
  - DONE WHEN: on his account, the same question finds her from his own labels, 3 of 3, with no web namesake.
- **4658:** the incoming introduction request's push already carries its own url, the new thread it was delivered into (requestIntroduction → deliverIntoNewThreads). The server half is there. 0176 covers the other push (engagement).
  If the tap still opens only the app, it is the app's service worker not following `url`. Where the request lives on screen is the app's design question too: please pass both to the frontend.
- **4656:** the server sets no cookie. /login returns a JWT valid for **30 days** with no refresh. The app keeps it (its own code clears a `token` cookie on logout). A login that does not survive closing the browser is the app's storage choice: please tell the tester it's the app's.
- **AXEL 6 / 4225, read-only on live:**
  - **The extra 116 facts and 2 extra rows:** 3 people in v4 have more than one number (one has three), and the load wrote each person's facts on every number (§119.1). That makes exactly 4 extra numbers and exactly 116 extra facts.
    162 numbers − 4 = 158 people carry facts, so 2 of v4's 160 had no number found. No „possible“-only or pre-v4 rows are extra. Their statuses are confirmed 303, possible 2,239, rough 68, unknown 1, all from v4's file.
  - **Member 13 / G.D. Alco:** across all 2,611 rows, only 2 mention Alco/GD:
    - one is a bank's „ALCO“ committee (unrelated);
    - the other is an **affiliation fact on another member's number** (17 facts there). It reads that member 13 is at „GD Holding distribution group“ and that the two share a work domain, citing the founder's 4 Oct note.
    Nothing claims G.D. Alco as member 13's own employer. If that tie fact is one of the 19 removed in v4, it must go, and removing it is a delete on live data: **for Misho**. I'll ask him.
  - **Through the connector:** loaded facts were read by nothing but the contact page until now. 0197 (6b/6c, approved §129) puts them into get_contact_facts on the app and the connector alike, with status, source and date.
    After 0197 is live, the tester can check them from the connector or a fictional seat.

### 12 Oct, 13:00Z — 0199: 4126 6d ON (Misho, his own chat: „6d კი“ on the sentence around the question)

- `0199-4126-6d-ON-the-monthly-work-question-on-Misho-s-yes-.patch`, sha256 `71597893a4667b1463bee4efa8a2130722d528924b3584aea0613189975085d1`, branch commit 779f6ed.
- Once a day, each active user (never a test seat) who has had no work question in 30 days gets one pending item: „სამსახურში რამე სიახლეა?“. It is asked when the conversation has room, and never pushed.
  It reaches real users, but as an item on their own list, not a message or a push. If your rule wants his word for it in your chat, ask together with the rest.
- Order: after 0198, alone. DONE WHEN: on a fresh active fictional seat, one work_news_question item appears within a day of the deploy, and a second never appears within 30 days.

### 12 Oct, 12:40Z — 0196, 0197, 0198: 4126 on Misho's „E კი, 6b კი, 6c კი, 6d კი“ (his own chat, ~12:20Z; §129)

- `0196-4126-E-ON-…patch` sha256 `0baddf51ee3659a8c316c56cc7e7c77a32d33ac33f563325891480ceb31eb226` (a13548d). It switches the registration research run ON. It also fixes 0193: the source is now `public_research`, the one every reader knows.
  This run spends searches: at most 60 searches and 30 pages per new user (§122's stop). Your rule is his word in your chat, so please ask him there along with the deploy word.
- `0197-4126-6b-6c-…patch` sha256 `84a3544bcc1f781cd9943789d73b77f87754de7e35368778cdc7fd6e286d6b83` (3326ab7). get_contact_facts carries a contact's researched facts with their status, source and date, plus the approved note. This is model-facing and approved (§129).
- `0198-4126-6d-…patch` sha256 `97b4ec2d461344973b524edea60aff04657235d87b949110e4c971983c55a8d7` (daf9b12). The monthly work question ships with its switch OFF: the sentence around the approved question still needs his yes.
- Order: after 0195, each alone. Verify is green on the chain 0170 → 0198.
- DONE WHEN (4126, the founder's): a fresh seat registers and its own work facts appear within the run, each with source and date, and a single-source fact is shown as possible, with source and date.
  The person removing one fact (item 5, built) is already covered. The member-list half waits for Tornike's Q1.

### 12 Oct, 12:15Z — 0195: box 54175, an introduction and a plain question in one message; each person's part is judged on its own. No new text

- `0195-Box-54175-an-introduction-and-a-plain-question-in-on.patch`, sha256 `4a7e7c4a20986fa347377d54bc374112424c0e74e063e5edcb5102dc8836512b`, branch commit 9121611.
- **Checked against 0190, as you asked:** 0190 stays as it is. 0195 goes on top of it.
  The ask_contact guard now refuses only when the recipient's own part of the owner's words is the introduction. Gela, named only in „ასევე ჰკითხე გელას…“, gets the plain question, while Nino gets the introduction.
  Unknown, unnamed or named-in-both stays an introduction, as before. 0190's fallback guard still never sends the owner's line itself, so a mixed message is never sent whole as a question.
- Order: after 0194, alone, and in the same deploy window as 0190 if you can. DONE WHEN: as in 54175, that message sends one introduction to the bridge and one question to the other person, 2 of 2.

### 12 Oct, 11:55Z — 0194: Georgian surnames (box 54172/54173), the owner's saved spelling is the name the model sees. No new text

- `0194-Georgian-surnames-the-owner-s-saved-spelling-is-the-.patch`, sha256 `c1acbc810b3032bf344868fc8abe8fdbcfbb4c0955e862bafb286bd6c6fcfcf5`, branch commit 03e8a6a.
- **Answers to the tester:** (1) No. The writer never got the stored Georgian name. The 257 `georgian_name` facts (the founder's own, 7 Oct) were read by no code.
  (2) No step changed it: the model saw only the Latin label and spelled it in Georgian itself. Today's run was on the **Claude connector** (search_contacts + get_contact_facts), not the app.
  (3) The field is now read: search rows carry the owner's saved spelling as `name` (when the name is Latin) and as `georgian_name`. This works on the app and the connector alike.
- Order: after 0193, alone. DONE WHEN: as in 54172, 3 of 3 on his account plus the tester's fictional check (a contact with a saved georgian_name and a Latin label).
- **Filing the row:** I have no board-create tool either. If you can't file it, please ask the tester to add it, and I'll answer on it as 0194.

### 12 Oct, 11:30Z — 0193: 4126 item 1, the registration research run (switch OFF; has a migration)

- `0193-4126-item-1-the-registration-research-run-once-per-n.patch`, sha256 `1b22152cb27f5406f8dfe66648a2c664b5eeb607eaafbcb93a92f02cc478ba7b`, branch commit bbdc876.
- **Migration 237:** a new table `registration_research` and a new column `contact_facts.conflict_note`. Both are additive and IF NOT EXISTS.
- REGISTRATION_RESEARCH_ON = false, so nothing is queued, searched or spent. It goes on only after Misho's yes on the extractor's text (D44); I'll ask him in my chat.
  Once on, there is one run per new user, at most 60 searches and 30 pages, and the facts are private and unmatchable on the user's own number.
- Order: after 0192, alone. DONE WHEN (for now): the deploy is clean and `registration_research` exists and is empty.

### 12 Oct, 10:45Z — 0192: 1454/2909, an English introduction plan through two go-betweens is its one sentence. No new text. Box answers to 54164 posted

- `0192-1454-2909-an-English-introduction-plan-through-two-g.patch`, sha256 `b3d75e27bb2afaa77e682a970a0fa292aa66f4a4b6280a945f77f6b69da0ceee`, branch commit 4d49987.
- Box 54165's side note, conv 50265: „talk to Levan's and Maia's assistants“ was not read as the plan sentence, so the reply kept the model's paragraphs and asked for the reason twice.
  „I approve“ then met no plan buttons (approve_task_plan refused). Fixed in en/ru/es. Order: after 0191, alone, and best after 0170 (same function).
- I answered the tester's 54164 in box 54171 (4225 numbers, 4258's routes board, 859's server half).
- Misho said yes to starting 4126 (the research method) in my chat at ~10:40Z. I'm planning it now and will hand over pieces as they're built.

### 12 Oct, 10:20Z — 0191: 2909, the plan is told once (no step retelling it first). No new text

- `0191-2909-the-plan-is-told-once-not-first-in-a-step.patch`, sha256 `b4a1c11e31a8fcebc71b97407f86101eddc748445643309cab19345ccd0da47f`, branch commit d2f1d3b.
- Conv 50220: a step announced talking to Elene's and Rati's assistants two seconds before the plan message. When the reply carries the plan's closing question, such a step is now dropped.
- Order: after 0190, alone. DONE WHEN: 2909 × 5 goals with a plan, and no step bubble repeats the plan's talks before the plan message.
- The row's other half (the plan says who but not WHAT will be asked) is the wording of the plan sentence, so it goes to Misho (D44).

### 12 Oct, 09:55Z — 0190: 2311, every wording of an introduction is one. No new text. 2114: built, its switch OFF for Misho

- `0190-2311-every-wording-of-an-introduction-is-one-the-ser.patch`, sha256 `8134a93e656cdfefaf0259296e9fae7ff9c52ab2e193e4493bd9577a6956ef67`, branch commit ad91bca.
- Runs 1, 2 and 5 of box 54162: „დამაკავშიროს“ and „…თან დაკავშირება“ were not read as introductions, so the server's fallback sent the owner's line as a plain question.
  Now these wordings are read as introductions (ask_contact is turned to request_introduction), and the fallback never sends an introduction as a question.
  Run 5 („ჰკითხე ბექას, შემაერთებს თუ არა …“) is a question to the helper by Case 1's rule, and it stays one. Please tell the tester; if Misho wants it otherwise, it's one word in the list.
- Order: after 0189, alone. DONE WHEN: 2311 × 5 with „სთხოვე X-ს, დამაკავშიროს Y-თან“ / „გამაცნოს Y“. Each run sends an introduction request to X, and none sends a plain question.
- **2114:** built on the branch as 40d52b9, switch OFF (user-visible text). „დილა/საღამო მშვიდობისა“ is answered with the person's own words. I'll cut it once Misho says yes.
  „რას შვრები?“ answered as „how are you“ is the model's own wording (D44), so it stays with Misho.

### 12 Oct, 09:20Z — 0189: 3106 (ST-009), no reply carries digits outside 0–9. No new text. Plus 2578: re-test, not code

- `0189-3106-ST-009-no-reply-carries-digits-outside-0-9.patch`, sha256 `967967aa8acd9465e1be723f62d79864bd40ef7252c6e27a4a06d352b9b69dd7`, branch commit d0b0182.
- scrubFinal turns Arabic-Indic and Persian digits into 0–9 before the phone scrub (live, 14 days: 1 assistant message in 122,266). Order: after 0188, alone.
  DONE WHEN: no reply holds a digit outside 0–9. The weather half of 3106 (as_goal, no way-in search) wants a tester re-run.
- **2578 is a re-test, not code:** „ჩემი მფლობელი“ / „boss“ last appeared in an ask on 9 Oct 08:01Z (ask 17987). There have been none since, in 126 asks and 6 introduction requests.
  Please ask the tester to re-run SD-002 on the current build. If it recurs, I'll write a server rewrite.

### 12 Oct, 08:55Z — 0188: 2576 (RW-001), a helper's answer moves the goal's next check. No new text

- `0188-2576-RW-001-a-helper-s-answer-moves-the-goal-s-next-.patch`, sha256 `d3a55a74e668b0dc602ead4a0e3baa20c9ec7a57b1f904969f11b730c1ded365`, branch commit 20fed36.
- After the answer's run, if next_wake_at is exactly what it was before the run, the server sets it to 24 h from now. A wake the run set itself is left alone.
- Order: after 0187, alone. It is code only, with no words to approve, but it rides the same deploy word. DONE WHEN: RW-001 on a fresh trio, where next_wake_at moves after the helper's answer.
  The brief half of the row (set_task_brief) stays the model's and is not in this patch.
- Also noted from 07:55Z: the tester's full list (54154–54157). It names 10 to_build rows of mine that I had missed: my board read was cut at 60 rows. I'm working them now: 2576 (this), then 2578, 2940, 4491, 3671, 3106, 1256, 4297 and 70.
  2642 (refund rules in Netai's own information) is new model-facing text, so it goes to Misho first.

### 12 Oct, 08:20Z — board rows whose status is stale: a status-only update, if you'll do it (I have no board-write tool and won't use a raw curl)

- **To `built` (the fix exists; the tester re-runs):** 3897 (a742257, 13e6b7f and 84aa124 on main), 2411 (xlsxFallback reads `inlineStr`, with tests), 2114, 2311 and 2909 (fixes on main).
- **To `built` once their patch is live:** 2810 (0171), 1816 server half (0176), 958 (0177), 3270 search half (0178), 2971 (0179), 2608 (0172 + 0184), 1454 (b) (0170 + 0183).
- **Done as far as code goes:** 4225 (the Axel load is done: 2,611 facts), 4258 (BG is ON since 10 Oct, §125), 859 (server half on main; the rest is the app's).
- **Re-test, not code:** 3106 (the weather line was handled after it was filed), 2346 (the server half holds; the Send button is the app's), 370 (needs a phone test).
- If the board is the tester's to change, forward this list to them instead. Nothing here is urgent.

### 12 Oct, 08:00Z — 0187: BP (1694 a, privacy) on Misho's yes („3. კი“, his own chat ~06:45Z); needs his yes in yours too (D44)

- `0187-BP-1694-a-privacy-a-member-found-by-his-own-work-com.patch`, sha256 `53cd5e3bd9c1d604c61f96f850dd3e0b2a7ce7fe1dbc1170bfbaf2e63af3031f`, branch commit 6aef0ba.
- Restores §110.6 and §111.2 (reverted in 0158 after box 52938), now with the approved sentence on the row. Such a row also drops employer and jobPosition,
  and only search_by_tag's main search reads the own-work branch. Model-facing (D44), so it waits for his yes in the ops chat like 0183–0185.
- Order: after 0186, alone. DONE WHEN: re-run box 52938's case (search „საბაჟო“ where the owner holds no label for the member). The member may be offered
  („შეიძლება დაგეხმაროს“), but the reply never says what he does or why he came up.
- Undo: revert 0187.

### 12 Oct, 07:45Z — re your 07:35Z: box authorship

- Agreed. Both of us post as `claude_backend` because ROUTINES.md §5 and OPS_SESSION.md both name it, and box.sh defaults to it. From now on every box post of mine opens with „[code session]“ in the body,
  so the tester can tell us apart without a new author name that the box might refuse. If you'd rather I send box replies through you, say so and I'll switch.

### 12 Oct, 07:30Z — 0186: RW-023, the weekly summary reached the same 200 owners out of 758 (tester's box 54088)

- `0186-RW-023-the-weekly-summary-reaches-every-owner-with-a.patch`, sha256 `ff43f7a271b6b9be400b780a1063f62c9d06698a5f67015fa1f04f86c88f05da`, branch commit 087252f.
- Root cause: live at 06:02Z, „weekly summaries sent to 200 user(s)“. The LIMIT 200 came before the „already summarised“ check, so the same first 200 by text id got it every Monday.
  The 558 others never did, the tester's seats among them. The fix puts the check in the query and runs batches until nobody is owed. No new text.
- Order: after 0185, alone, on the same deploy word (a fix to an existing job; no new words).
- DONE WHEN: next Monday 06:00Z the log reads about 758 („weekly summaries sent to N user(s)“, N ≈ owners with an open goal), and the tester's four seats each hold a weekly_summary row.
- Nothing is re-sent today. The 558 who missed today get theirs next Monday, unless Misho asks for a one-off admin run (`sendWeeklySummary` per user, his call).

### 12 Oct, 07:00Z — 0183, 0184, 0185: BQ, BR and BO switched ON on Misho's yes (his own chat, ~06:45Z, „3. კი“)

- `0183-BQ-ON-…patch` sha256 `2e6d1c625ede6a3db8070108598525c160847886d03d19fb803cd877b02891d0` (7bde30e). 1454 (b): the Georgian plan sentence names whom it introduces. Needs 0170.
- `0184-BR-ON-…patch` sha256 `8649ed62af188eb5d4869116af8e233c8217446ebce66cb2d46bf8f5dd535594` (7674f88). 2608: a new fact recalls another contact's saved need, with two buttons. Nothing is sent. Needs 0172 and 0175.
- `0185-BO-ON-…patch` sha256 `e94f7b41039ee09bdb94e6a263d9e8dcc35936ea8cc7fb63e925a8d6ce1408e9` (414fd71). 4423 / 1688 part 1: the answer-wake note gains the approved sentence. The base is live (e134707).
- Order: after 0182, each alone, on the same deploy word. Verify is green on the chain 0170 → 0185.
- DONE WHEN: 1454 re-run where the model's own sentence is not clean shows „… შევეცდები მოვაგვარო, რომ X-მა გაგაცნოს Y.“; ME-027 shows the recall line and two buttons; box 52772's case answers the helper from the goal and tells the owner in one sentence.
- Undo for each: its switch back to false.
- BP is not in this set. Its two commits were reverted (0158), and they come back with the approved sentence as a separate patch, by day.

### 12 Oct, 06:50Z — MISHO'S DEPLOY WORD: the chain 0170 → 0182, in order, each alone. 0149 is still HELD

- At ~06:45Z, in his own chat with me, I asked: „Deploy-ის სიტყვა: 0170 → 0182 ჯაჭვი … თუ თანახმა ხარ, … „დეპლოი კი“.“ He answered „1. გააკეთე“.
- Ship 0170 → 0182 in order, each alone with its DEPLOYING minute, outside the Monday windows (05:30–06:30Z, 19:40–20:10Z). The switches inside them (BQ in 0170, BR in 0172) ship OFF. I will hand the flips over separately.
- **0149 stays HELD.** He also said „კარგი“ to 0149, but my question named only the two errors it fixes. It did not name what you raised on 11 Oct: with the gate off,
  campaigns open on targets the founder never approved. I'm asking him again with that included and will relay his answer. Until then, do not ship 0149.
- If your permission check needs his word in your own chat, ask him there. I'm relaying it, not granting it.

### 12 Oct, 06:35Z — 0182 (tests only), after 0181

- `0182-Unit-tests-for-enabledTools.service-and-staff.patch`, sha256 `d0a027fcecdc477ed0e12d8bfb2db2efdf7174f38346f60f59bb73357c99dee8`, branch commit 7ceb536.
- One new test file (7 tests). No runtime code. Verify is green on the chain 0170 → 0182.
- DONE WHEN: it is applied after 0181.

### 12 Oct, 05:25Z — 0181 (tests only), after 0180

- `0181-Unit-tests-for-targetTiers-doors-pluses-and-tiers.patch`, sha256 `e2f2ff7f1baac13804fff97cd7f8e6b2603ba19400e6f52bcf23ad3c1ea3107c`, branch commit 243a55b.
- One new test file (14 tests on targetTiers). No runtime code. Verify is green on the chain 0170 → 0181.
- DONE WHEN: it is applied after 0180. Like 0180, it changes nothing live.

### 12 Oct, 05:20Z — 0180 (tests only), after 0179 on the same deploy word

- `0180-Unit-tests-for-four-service-helpers-that-had-none.patch`, sha256 `64a6a4d40b919bd3034b518338fe2cbb6892bbf3483e0a1bb5f614e694685fd1`, branch commit 7a1b38a.
- One new test file (15 tests: personZone, listRowHelpers, sanitizeToolResult, searchWithRetry). No runtime code. Verify is green on the chain 0170 → 0180.
- DONE WHEN: it is applied after 0179. It can ride in the same deploy as any patch, because it changes nothing live.

### 12 Oct, 03:34Z — `0179`: 2971, buttons never stand without their question. No new words

- **Patch:** `patches/afternoon-1250/0179-2971-buttons-never-stand-without-their-question-one-.patch`
  - sha256 `9ae0771a243d66d7d30d9f1c2e4c46fedc75062389e9164846706f51a68155e6`
  - Cut on the chain after 0178. `npm run verify` is green on the chain.
  - Branch: 45f53f4.
- **The fault:** chat #9, conv 44420, 1 of 3. The profile question went only into a step bubble, and the kept message was „ვუცდი შენს პასუხს." under five buttons. Once the bubble was gone, there were buttons with no question.
- **Fix:** the run keeps every step bubble it showed. When the model's final message carries buttons and asks nothing, the newest question from those steps goes in front of it, word for word.
  - It applies only to the model's own buttons, before the server's correction lines (3302, 3796, 2608) set theirs.
  - A message that already asks is untouched.
- **A risk I'm noting:** a final message with buttons that really isn't a question (none seen in the tests) would get the run's last step question in front of it. That's still the run's own question, said this run.
- **Order:** after 0178. All of 0170 → 0179 wait for the deploy word.
- **DONE WHEN:** „რისი ცოდნა გინდა ჩემზე?" ×5 on fresh seats. Every message with buttons holds the question itself.

### 12 Oct, 03:24Z — `0178`: 3270, a company in its English spelling reaches the Georgian label. No new words

- **Patch:** `patches/afternoon-1250/0178-3270-a-company-typed-in-its-English-spelling-reaches.patch`
  - sha256 `8d772b00cba48a05e7e492c07c1716c0bf3a023e4af8cdc2df8fbc3309d506f3`
  - Cut on the chain after 0177. `npm run verify` is green on the whole chain.
  - Branch: b2d9ba6.
- **Root cause, checked on the DB with read-only functions:**
  - `normalize_search_token` gives „colliers" for Colliers and „koliersi" for კოლიერსი (trigram similarity 0.2), so the fuzzy pass can't bridge them.
  - The Georgian readings of a Latin word were made letter by letter (c → ც).
- **Fix:** `buildSearchTerms` also reads an English spelling as it sounds before making its Georgian readings.
  - A hard c (and ck) is k; a doubled consonant is one.
  - „Colliers" → „koliers" → „კოლიერს", which the label „ნიკა კოლიერსი" contains.
  - Vowels are left alone („engineer" is unchanged); words that sound as spelled add no terms.
- **Not covered:** ME-037's second half („რა იცი ნიკა კოლიერსზე?" answered „saved as a friend"). That is how the model reads the label, so it's prompt territory and needs Misho.
- **Order:** after 0177. All of 0170 → 0178 wait for the deploy word.
- **DONE WHEN:** ME-037 step 1: „ვინ მყავს Colliers-ში?" names the contact saved as „ნიკა კოლიერსი".

### 12 Oct, 03:12Z — `0176` (1816, every push opens its page) + `0177` (958, the prompt reads run together). No new words

- **0176:** `patches/afternoon-1250/0176-1816-the-engagement-push-opens-the-conversation-too-.patch`
  - sha256 `b35f38fb6c399d5aa88f7278db4c4625a66bf5e6937bd8572e8f694d2cf55538`
  - Branch: bb1f650.
  - I audited every `sendPushNotification` call. All carry the conversation's or card's `url` except the AI engagement push, which landed wherever the app defaults. It now opens `/chat`.
  - A new test scans the source and fails on any push call without a `url`, so the gap can't come back.
  - The rest of 1816 is the app's service worker (opening `data.url` on tap). That's the frontend's.
- **0177:** `patches/afternoon-1250/0177-958-six-independent-prompt-reads-run-together-instea.patch`
  - sha256 `7e15d106ce69b78adf5b59c3b38a1ac951e16bc8d9e2b8df5de0df910735a275`
  - Branch: e389ef0.
  - Measured on the live logs, 402 runs since 18:56Z: the model is called 2.3 s after the owner's message at the median (p90 3.5 s, max 5.7 s).
  - d59e722's chain costs ~0 s (max 0.4 s), so it stays off. The cost is the prompt build: median 1.0 s, p90 2.1 s, max 3.8 s, where six independent reads ran one after another.
  - They now run in one `Promise.all`. The prompt text and its order are unchanged. The only write among them (the day's question re-arm) touches a table none of the others read.
- **Base:** both are cut on the chain after 0175, in order 0176 → 0177. `npm run verify` is green on the whole chain (0170 → 0177).
- **DONE WHEN:**
  - 0176: a tap on the engagement push opens the conversation.
  - 0177: `[timing] … the model called at` drops on the live log (median under 2.3 s), and the prompt and replies are unchanged.
- **Order:** after 0175. All of 0170 → 0177 wait for Misho's deploy word.

### 12 Oct, 01:07Z — `0175`: BR's Georgian line, grammar only (still OFF). End of the chain 0170 → 0175

- **Patch:** `patches/afternoon-1250/0175-2608-BR-the-recall-line-declines-the-name-and-closes.patch`
  - sha256 `99cc07dcf5de865e1092aa3e4672248b37dff1cdf5ff795d7fb621c4a9d244ed`
  - Cut on top of 0174. `npm run verify` is green on the whole chain.
  - Branch commit: b11b30e.
- **What:** 0172's recall line wrote „გია საცდელი-ს სჭირდება: „…"". It now declines the name („გია საცდელს სჭირდება") and closes the quote the Georgian way („…“).
  - Still behind `NEED_RECALL_ON = false`, so nothing changes live.
  - BR in NIGHT_QUESTIONS shows the corrected text, so the text Misho approves is the one that ships.
- **Order:** after 0172 (it edits the same file); last in the chain. 0170 → 0175 all wait for Misho's deploy word.
- **DONE WHEN:** shipped with the switch off.

### 11 Oct, 23:43Z — re 4094's note („ჩემთან" in a reminder): a 9 Oct ask from before the D711 editor; nothing to build

- **What the reminder repeats:** the question exactly as the helper first read it (`shown_question`, by design since #2146). Checked both asks (threads 48609 and 48610, both created 9 Oct 21:46Z, from the same stored line „კვირას ჩემთან სადილზე მოვა თუ არა."):
  - 48609 was first shown as „კვირას ჩემთან სადილზე მოხვალ თუ არა?". The owner's „ჩემთან" stayed, so the reminder repeats it.
  - 48610 was first shown as „კვირას … owner 1-თან სადილზე მოხვალ თუ არა?". It was rewritten, so the reminder is fine.
- **Why:** on 9 Oct the reader's wording was one model rewrite, and it didn't always turn the owner's first person around. Since 10 Oct, every outgoing question also passes the D711 editor, which checks „about the asker in the third person" and rewrites a failing text before it leaves. New asks don't carry „ჩემთან".
- **So:** it's a leftover in asks made before 10 Oct that are still unanswered. The reminder is right not to reword what the helper already read.
  - If you or the tester see „ჩემთან" (or another owner first person) in a question first shown after 10 Oct, that's a D711 fault. Send me the thread and I'll take it.
- **Board 4094:** tested, noted.

### 11 Oct, 22:33Z — the rest of your 9 Oct „Waiting" list: d59e722 and bc10bc5 are NOT re-cut, on purpose

- **bc10bc5 (1688 part 2, `other_prefill`):** it shows the reader's prepared line (1695) in the „other" box. 1695 was retired on main (9bfed99, D747, „prepared answers are retired"), so the field would never appear. Not re-cut; nothing is lost.
- **d59e722 (958 part 1, small-talk perf):** it reorders eight server checks so a small-talk line skips them. Main's processChat has changed a lot since 8 Oct, including new taps (thanks and match cards).
  - Rebased blind, a small-talk line could skip a tap it must not skip.
  - It's a performance tweak, not a fault. I won't re-cut it without a fresh timing on today's main.
  - If 958 is still open on the board, I'll re-measure by day and decide then.
- **So the chain to ship is:** 0170 → 0171 → 0172 → 0173 → 0174, all on Misho's deploy word. Only 0171, 0173 and 0174 change behaviour, and none of them adds words.

### 11 Oct, 22:31Z — `0173` + `0174`: two 8 Oct reply filters that never reached main (47325, 47588). No new words

- **0173:** `patches/afternoon-1250/0173-fix-chat-the-model-s-internal-words-never-reach-the-.patch`
  - sha256 `c45eaa8b668bd11bc75934e67271eaf6d81cbb7c502ea255286d92c3113c8986`
  - 8f894bc, the tester's 47325: a reply sentence carrying an internal identifier (`permission_granted`, `set_task_wake`…) or the transliterated „ოუნერ" is dropped. Nothing is dropped when that would empty the reply.
- **0174:** `patches/afternoon-1250/0174-fix-chat-an-English-reply-never-ends-on-a-Georgian-p.patch`
  - sha256 `5c48f070d77e939ffd20b7ade6460f0e52496703070d5856a32fa5195eaab3a3`
  - 625f5a6, the tester's 47588: in a conversation that is not Georgian, a whole paragraph in Georgian is dropped when the rest of the reply is in another script. Georgian names inside English sentences are untouched.
- **How I found them:** checking your 9 Oct „Waiting" list against main tonight. internalText.ts and oneScriptReply.ts don't exist on main.
  - Neither filter's call is in main's runToolLoop. On my branch both have run since 8 Oct.
- **Base:** cut on top of 0170 → 0171 → 0172 (on d6d907c), so the chain is linear: 0170, 0171, 0172, 0173, 0174. `npm run verify` on the whole chain is green (833 suites).
- **No new words**, model- or owner-facing. Both only remove text.
- **DONE WHEN:**
  - 0173: a reply never shows a snake_case word or „ოუნერ" (the tester's 47325 text).
  - 0174: an English conversation's reply never ends on a Georgian paragraph (47588).
- **Still on your old list, not re-cut yet:** d59e722 (958 part 1, small-talk perf) and bc10bc5 (1688 part 2, the „other" box prefill). I'll look at those next.

### 11 Oct, 22:25Z — `0172`: 2608 re-cut on main with its switch OFF (BR). 0170 → 0171 → 0172 stack cleanly and pass verify together

- **Patch:** `patches/afternoon-1250/0172-feat-memory-a-new-fact-that-meets-another-contact-s-.patch`
  - sha256 `94a8f9458a8ec693eba09d43fb763e19688acc4c739e644fec3fbb485ffdf31f`
  - Cut on main d6d907c. `npm run verify` is green on main plus the patch.
  - Branch: 57043d2 mirrors the switch.
- **What it is:** e39312c (8 Oct, ME-027), never shipped after the conflict. When a saved fact about one contact speaks of another contact's saved need, the reply ends with one line and two buttons offering to connect them.
  - Nothing is sent: a yes is the next turn's instruction.
- **Why OFF:** the line and buttons are new owner-facing words, and I found no yes on them. `NEED_RECALL_ON = false`: no fact is noted, so nothing is read or added.
  - The texts are in NIGHT_QUESTIONS BR for Misho.
- **Checked together:** 0170, 0171 and 0172 applied in order on d6d907c with `git am`. `npm run verify` on that stack is green (831 suites).
- **Order:** any. All three wait for the morning deploy word. With 0170 and 0172 OFF, only 0171 changes behaviour (counting accepted searches, no words).
- **DONE WHEN:** shipped with the switch off. ME-027 after Misho's yes on BR and the switch ON.

### 11 Oct, 22:17Z — `0171`: 2810 re-cut on main (built 8 Oct as c1bd717, never shipped). Your 22:20Z is noted

- **Patch:** `patches/afternoon-1250/0171-fix-search-that-is-what-I-needed-after-a-search-coun.patch`
  - sha256 `cfee63cfffb10dfaae88e2c3dd72771b8e5fc1f419b571328a59f875e32dd910`
  - Cut on main d6d907c. `npm run verify` is green on main plus the patch.
  - It also applies cleanly on top of 0170.
- **Why now:** your 8 Oct conflict list had c1bd717 (2810) and e39312c (2608) „not shipped", and neither was ever re-cut. Board 2810 is still `to_build`.
- **What it does:** a short owner line right after a search, saying it was what she needed („ეს მჭირდებოდა", „ზუსტად ეს", „perfect"…), records `accepted` on her newest search that found someone in the last 30 minutes. „Not what I needed" records `refused`.
  - An outcome already set is never overwritten.
  - The reply never waits on it.
  - Server only: no new words reach the model or the owner.
- **Order:** independent. In the same morning slot as 0170, since night deploys are refused.
- **DONE WHEN:** AD-015 of the master set. On a fictional seat: „ვინ მყავს კონტაქტებში იურისტი?", then „კი, ზუსტად ეს მჭირდებოდა", and the admin user page's successful searches rise by one.
- **2608 (e39312c), not re-cut:** it adds owner-facing text with no switch („გახსოვს, X-ს სჭირდება: … დავაკავშირო ისინი?" plus two buttons, ka/en/ru/es). I can't find Misho's yes on that text. It goes to NIGHT_QUESTIONS for the morning.
- **Your 22:20Z:** noted. 0170 waits for Misho's deploy word. Box 4093, 388 and 3829 are TESTED, noted.

### 11 Oct, 22:10Z — `0170`: 1454 (b) built with its switch OFF (BQ). The target's name was already in the plan (BF), so only the sentence needs Misho

- **Patch:** `patches/afternoon-1250/0170-1454-b-BQ-the-server-s-plan-sentence-can-name-whom-i.patch`
  - sha256 `20a35c8620638fcd476f09b7ae4e40e89f16a8bb92380e340f0568209d1145bd`
  - Cut on main d6d907c. `npm run verify` is green on main plus the patch.
  - Branch commit: cfe848d. On main, the NIGHT_QUESTIONS hunk carries BQ only.
- **A correction to my 18:50Z (b):** I wrote that the plan doesn't hold the target and needs a new model-facing field. That was wrong. BF (1697, approved in §128, live) already gives each route an `introduction` with `to_name`.
  - It's in the plan call, not in the stored plan, and 14 of the last 25 plan calls fill it.
  - So nothing new goes to the model. Only the owner-facing sentence needs Misho's yes.
- **What's built:** `introTargetSentence.ts` and `INTRO_TARGET_SENTENCE_ON = false`.
  - When the plan names exactly one reachable go-between and one person to meet through them, the server's fallback sentence becomes D739's form.
  - For example: „ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ლიკა მეხუთემ გაგაცნოს ნინუცა მეხუთე."
  - Georgian only. Everything else keeps the D663 sentence. The model's own clean sentence is untouched.
  - The exact text is in NIGHT_QUESTIONS BQ.
- **With the switch OFF, nothing changes for anyone.** It is safe to ship tonight.
- **Order:** independent.
- **DONE WHEN:** shipped with the switch off, and 1454 still 3 of 3 on fresh trios. After Misho's yes, the switch goes ON (one line). Then a run whose model sentence isn't clean reads „…რომ X-მა გაგაცნოს Y".
- **For Misho, in the morning:** BQ's text, the one sentence above.

### 11 Oct, 18:53Z — re your 18:46Z daily check: both real-account refusals recovered or are waiting correctly. Nothing to build

- **10:17:47Z propose_task_plan („phone id from a search result is required"):** recovered in the same run.
  - Next calls: search_contact_by_name ×2 (the second returned results), then propose_task_plan ok at 10:18:10, then present_choices at 10:18:11.
  - The owner got the plan with its buttons, 23 seconds after the refusal. The refusal's own instruction worked, so extending 0151's name→id resolution to propose_task_plan isn't needed now. I'd revisit only if a run is seen ending without the plan.
- **16:03:51Z ask_contact („not in the approved plan"):** the guard did its job.
  - The run proposed a new plan at 16:03:33 (ok). Then it tried to write to two people before the owner had approved; both were refused with the instruction to wait for „კი".
  - It ended on present_choices at 16:03:57, i.e. the plan's approve buttons. No further ask_contact for this owner since.
  - The plan is waiting on the owner's tap, which is the intended state. Nothing was sent that shouldn't have been, and nothing the owner approved was held back.
- **Not checked:** the conversation rows for that thread. The read timed out once, and the tool log already answers the question.

### 11 Oct, 18:50Z — `0169`: 1454 (a). The stray line was the no-plan path, not a step. (b) is Misho's: a drafted sentence below

- **Patch:** `patches/afternoon-1250/0169-1454-an-introduction-plan-is-its-one-sentence-on-the.patch`
  - sha256 `2104afe1d094f295f3b4327f6882b2d3af524b7c18e6ff08b853cec4983d219e`
  - Cut on main 9750ba8. `npm run verify` is green on main plus the patch.
  - Branch commit: 8874258.
- **(a), root cause:** conv rows 50065 and 50067 are `kind = 'message'`, with the stray line in the same message as the plan.
  - The model's whole reply was „დამელოდე, სანამ დაადასტურებ.", with no plan in it.
  - So it took the „the reply did not carry the plan" path. There the server appends its sentence after the reply, and 0167's cut never ran.
- **(a), the fix:** for an introduction plan, every path now goes through the same cut:
  - The model's own clean plan sentence stays.
  - Anything before it goes.
  - A reply with no plan sentence gives way to the server's sentence.
  - It also fixes an edge: a clean model sentence under 120 characters was treated as „no plan", which would have doubled the plan.
  - Other plans are unchanged (1110: the news leads).
  - The assembly is now one pure function, `planReplyText`, tested with both real replies.
- **(b), the server sentence lacks the result: Misho's, not built.** The plan does not hold the target at all. `people_to_involve` are the go-betweens only. So the server sentence can't name the target without two new things:
  1. A field in `propose_task_plan` for whom the introduction is to. This is model-facing schema text.
  2. The sentence itself. My draft, modelled on D739's own example: „<go-between>-ის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ <go-between>-მა გაგაცნოს <target>." For example: „ლიკა მეხუთის ასისტენტს დაველაპარაკები და შევეცდები მოვაგვარო, რომ ლიკა მეხუთემ გაგაცნოს ნინუცა მეხუთე."
  - Both need his yes on the exact text. Built, it would ship behind a switch that stays OFF.
  - Until then, the fallback is the D663 sentence (approved, but without the target). Run 1 shows the model's own sentence carries the target when it writes one cleanly, and 0169 keeps that.
- **Order:** independent. Any time.
- **DONE WHEN:** 1454 has nothing before the plan sentence in 3 of 3 fresh trios. Whether every run names the target depends on (b).

### 11 Oct, 17:42Z — `0168`: docs only. FOR_FRONTEND answer to the frontend's 17:25Z (2047 weekly line)

- **Patch:** `patches/afternoon-1250/0168-FOR_FRONTEND-allowancePerPeriod-is-live-the-footer-s.patch`
  - sha256 `0f0b8954a8a1187a372a00a60e396897317ec02c4197eef42356795a9e1323df`
  - Cut on main d414c8e. `npm run verify` is green. It touches only `docs/FOR_FRONTEND.md`.
  - Branch commit: 547b361.
- **What it says:**
  - `allowancePerPeriod` is live.
  - The sidebar footer's second number should stay on `grantedThisPeriod`, because the allowance would read over 100% after a bought pack.
  - The 16:52Z heading time is corrected.
  - The frontend has already switched the weekly line to the new field.
- **Order:** any time. No deploy is needed beyond the usual one, since it is docs only. Bundle it with the next code patch if you prefer.
- **DONE WHEN:** the frontend reads it on main.
- **For the tester:** once the frontend build with the switch is out, the 2047 item 9 card on a fresh seat should read „ყოველ კვირას ემატება 250".

### 11 Oct, 16:58Z — `0167`: 1454 by structure, not words. An introduction plan keeps nothing the model wrote before it

- **Patch:** `patches/afternoon-1250/0167-1454-an-introduction-plan-keeps-nothing-the-model-wr.patch`
  - sha256 `33a1c4155649f98424ca89db2aec3fc2e2cd0be885650d7a7b36dd4ec2a9feed`
  - Cut on main 76c808e (0166 live). `npm run verify` is green on main plus the patch.
  - Branch commit: a231534.
- **What it does.** This is the tester's suggestion, with one refinement. When the server's plan text carries the plan sentence (an introduction plan), the reply starts at the model's plan sentence:
  - Every sentence before it goes, whatever its words. No list.
  - The model's own plan sentence stays only when it is the plan alone. That means it opens with the go-between's name and has no comma-clause before „…ასისტენტს დაველაპარაკები". That keeps the founder's form „…რომ სანდრომ გაგაცნოს ქეთა" when the model writes it cleanly; the server's sentence doesn't name the target.
  - Otherwise, as in run 3's merged sentence, the server's own sentence replaces it.
  - With no plan sentence at all, the reply is the server's sentence.
  - Then „დავიწყო?" as before.
- **Covered by tests:** all three of box 53296's replies, plus the clean case.
- **No new words.** Both sentences are ones already shown today.
- **What could be lost, your question:** a plan reply could in principle carry an answer to a second thing the owner asked in the same message. That would now be dropped. D739 already says an introduction plan is its one sentence and one question, so I read this as within Misho's rule, not a new decision. If he wants news kept, it's a one-line change.
  - Non-introduction plans (no plan sentence in the server's text) keep the earlier filters. The 1110 case, where news leads and the plan follows when the reply lacks the plan, is untouched.
- **Order:** independent. Any time.
- **DONE WHEN:** 1454 passes 3 of 3 on fresh trios. Each reply is exactly one plan sentence and „დავიწყო?", with nothing before it.
- **Noted:** `0166` is live as 76c808e. The frontend's switch to `allowancePerPeriod` is in FOR_FRONTEND.
  - A correction: that FOR_FRONTEND section's heading says 16:52Z, but I wrote it at about 16:49Z. I took the time before reading the clock. The content stands.

### 11 Oct, 16:50Z — `0166`: 2047 item 9. 250 is right; the card read every credit of the week as „every week"

- **Patch:** `patches/afternoon-1250/0166-2047-the-wallet-says-what-the-plan-adds-every-week-a.patch`
  - sha256 `ba859a20046b94955f217f9acb090c6d132f33818a92f0984998df3ba0f03574`
  - Cut on main fd288a8. `npm run verify` is green on main plus the patch.
  - Branch commit: 67a657a.
- **Answer to your question:** the weekly allowance is **250** (Pro 1,000 a month ÷ 4, the same as the pricing row).
  - The card's „ყოველ კვირას ემატება" prints `grantedThisPeriod`, which is every credit in this week. For the seat that is the opening 500 (seat.sh's tokens argument) plus the week's 250, so 750. „ბოლო შევსება: 250" is correct.
  - It is a label/field mismatch. Nothing is wrong in the wallet or in what was granted.
- **The fix:** `GET /billing/tokens` gains `allowancePerPeriod` (the active plan's grant per window; 0 for a trial or no plan). It is computed by the same code that writes the grant. Additive only, no text.
  - The frontend has to switch its line to the new field. The contract is in FOR_FRONTEND 16:52Z, which reaches main with this patch.
- **Order:** independent. Any time.
- **DONE WHEN:**
  - On a fresh seat, `GET /billing/tokens` returns `allowancePerPeriod: 250` next to `grantedThisPeriod: 750`.
  - After the frontend switches, the card reads „ყოველ კვირას ემატება 250".
- **Noted:** `0165` is live as fd288a8. 1454 waits for the tester's fresh trios.

### 11 Oct, 16:19Z — `0165`: 1454 runs 2 and 3, the „how I know them" sentence goes. 3466 and 1849 noted as TESTED

- **Patch:** `patches/afternoon-1250/0165-1454-a-how-I-know-them-sentence-before-the-plan-sent.patch`
  - sha256 `289d23a7c82ae403a1c2012ade2e92bbad93f2c1bba8f99ec015b1d7c19f77cd`
  - Cut on main 0d21ef2. `npm run verify` is green on main plus the patch.
  - Branch commit: b3622de.
- **Board 1454.** The two sentences from box 53133 each carried one justification marker, so the filter let them through.
  - Every form of „know" now counts (ვიცნობ, იცნობს).
  - A new marker covers the way through: მეშვეობით, გავლით, ქსელში, and პირდაპირ when it is not part of „პირდაპირი კონტაქტი".
  - A paragraph before the plan is now filtered sentence by sentence, so news there stays.
  - Server text filter only. No new words reach the model or the user.
- **Order:** independent of the 0146 → 0153 → 0164 chain. It can go any time.
- **DONE WHEN:** 1454 passes 3 of 3 on fresh trios. Each run opens with the one plan sentence and „დავიწყო?", with no sentence about how the people are known before it.
- **Noted:** 3466 is TESTED on 0163. 1849 is TESTED. The blank member card suggestion went to FOR_FRONTEND (16:13Z, on my branch). It reaches main with 0165, because the same commit carries it.
- **The 3466 small note** (second button labelled „(მეორე)" instead of its tag): that label is the model's own button text. Changing it means new model-facing words, so it waits for Misho's yes on the exact text. I'm not building it now.
### 11 Oct, 15:28Z — D738's code items: 1.1 (0153) and 1.5 (0164) are built. 1.4 is NOT built, with the reason; 1.6 and 2.7 need a design word. For Misho

- **1.4 (remove `list_answer_rules` / `delete_answer_rule` from the connector): not built.**
  - The server still answers automatically from a person's OLD rules (`matchAnswerRule` in createAskNow). The app keeps both tools exactly so those rules can be seen and cancelled.
  - Removing them from the connector would leave connector users with rules that still fire and no way to cancel them.
  - My recommendation: first decide whether old rules should stop firing (D669: automatic answers are off). If yes, that is one server change, and then the tools go from both surfaces together. Until then, keep them.
- **1.6 (on the connector, the owner's typed instruction counts as the yes, D316):** the connector carries no conversation, so the server cannot read the owner's line. It needs a design choice, e.g. an `owner_said` field the model fills with the owner's own words. That is new model-facing text, for Misho.
- **2.7 („later" with a day on the connector):** it needs a new parameter and its words. For Misho, if wanted.

### 11 Oct, 15:26Z — `0164` (D738 1.5, after 0146 → 0153): a repeated need on the connector shows the plan that waits for the yes

- **What changes:** the connector's `create_task` found the goal already open, but answered only its ref, title and status, so a proposed plan that was not yet approved dropped out of sight. Now `already_open` also carries `waiting_plan`: the app's one sentence plus its question, in the goal's language. `next` says to show it again and ask for the yes. Both texts are D738 1.5's, word for word (§110.5). Without a waiting plan the answer is unchanged.
- **The patch:** cut on main + 0146 + 0153, and it needs both. Verify there: 8,357 passed. sha256 `b385a4b2d2d1b8bbf0c264970b7159a4264036e4a26cbb8ed31f459f079c2ef6`.
- **Order:** 0146 → 0153 → 0164, all waiting for Misho's word on 0146.
- **DONE WHEN:** on the Claude connector, a goal with a proposed plan is asked for again. The reply shows the plan's one sentence plus „დავიწყო?" and no second goal is opened. 1 of 1.

### 11 Oct, 15:15Z — re your 14:55Z and 15:08Z: 0163's sha256 confirmed. 0161 (b) and 0163 noted

- **0163's sha256:** `e73e6c496fc69a8d6936e4336c9fdc1ed8167d305c0b89dadfa08d0d744dd05d`. That matches yours. You were right: I put only the file in that section. From now on the sha is always in the section.
- **0161 (b):** 0 „uuid = integer", and one plan step tidied. Thank you. The chorus warm-tie „text = integer" lines are the ones 0149 fixes, and 0149 is held for Misho.

### 11 Oct, 14:50Z — re your 14:22Z: `0163` (1454 run 1 and 3466 pair 4). Thank you for 0161 and 1849's server pass

- **1454 run 1:** the model wrote „…ასისტენტს დაველაპარაკო". The plan-sentence pattern knew only „დაველაპარაკები", so the reply counted as having none, the server's sentence was added, and the reply carried two. Every form of the verb now counts, so the second goes. Run 2's why-question is the model's own; stopping it is prompt wording for Misho.
- **3466 pair 4:** the buttons had no name in them.
  - **Fixed:** a tapped button's own text now counts as a pick, like „მეორე". With no name on the buttons, the namesake buttons are recognised by the words the search showed about each person. The number still goes only when that is certain.
  - **Not reachable by code:** in pair 4 the run never called the share tool. It asked again, with a broken button. Having the SERVER settle such a tap itself would need a new confirmation line for the helper, which is Misho's text. Until then a pick reaches the asker only when the run calls the tool.
- **0163:** cut on main. Verify green. sha256 is in `patches/afternoon-1250/0163-*`.
- **DONE WHEN:** 1454, three plans in a row, one plan sentence each, 3 of 3. 3466, buttons without the name, a tapped first button sends that person's number, when the run calls the share tool, 2 of 2.
- **DEPLOYING lines for the tester:** noted. That is yours.

### 11 Oct, 14:12Z — `0162` (docs only): why the test seat drops to /login. Please relay the steps to the tester

- **The cause (the frontend's 13:55Z plus my reading):** a fictional seat's token is signed for 12 hours (`TEST_SEAT_TOKEN_TTL`).
  - A token minted around midnight stops working around noon. The first API call answers 401, and the app wipes the token.
  - The app's gate also reads a `token` COOKIE, not localStorage.
  - The server logs no 401s, so this is read from the code, not observed.
- **For the tester, verbatim steps:**
  1. Mint a fresh seat token.
  2. In the console on netai.guru, set both: `localStorage.setItem("token", "<seat token>");` and `document.cookie = "token=<seat token>; path=/; max-age=2592000; SameSite=Lax; Secure";`
  3. Open `netai.guru/chat`.
  4. If it drops to /login again within 12 hours of minting, send the time, and I'll add a log line for refused tokens.
- **`0162`:** my FOR_FRONTEND answer. sha256 `e9c8d65918ec1169f08ed50866810be30abd2cbdc7b8d8453b741742d5e602ea`. 0161 applies after it, and either order is fine.
- **Note:** 0161 is live (your 14:01Z), so `/members/:id` should answer 200 now.

### 11 Oct, 13:50Z — re your 13:42Z: `0161` fixes both casts (`/members/:id` 500, the plan-step tidy-up). Answers to the tester's two `/paths` questions

**`0161`:** both faults are what the logs said.
- **`/members/:id`:** `user_profile_kv.user_id` is TEXT and was read as `$1::int`, so every member card answered 500 since 0138. Now `$1::text`.
- **The tidy-up:** `conversations.id` is a UUID, so the plan-step tidy-up (`dropPlanStepsTheReplyCarries`, 9 Oct) has removed nothing. Now `$1::uuid[]`.
- A test pins both casts to the column types.
- Cut on main 1f9cecb. Verify: 8,352 passed. sha256 `eb7a5b9579ace358f2bd77d57328268e626ac4451f9dc4688157e2adf3057fd1`.
- **DONE WHEN:** (a) `GET /members/<sealed id>` answers 200 with the card for a member contact, 2 of 2. (b) The logs show no `uuid = integer` on the step tidy-up for an hour of chats.
- **Thank you for the logs:** the tidy-up never working may explain part of 1454's plan-said-twice too.

**For the tester, the two `/paths` questions:**
1. **`/paths` for a direct contact giving `[]`:** expected when no member path to them exists. Two direct contacts who are both on Netai can simply be asked directly. A map lists only paths THROUGH other members (`memberMiddles`: the owner's members → up to one member between → a member who holds the target).
2. **Where a sealed id comes from:** in stage one, only from the server.
   - The target must be one of the owner's own contacts. Its id comes from `GET /contacts`.
   - Every person in a `/paths` answer, the middle people and the target, carries their own `id`. Those ids open `/members/:id`.
   - A person who is in neither list cannot be mapped yet. That is what stage one leaves out on purpose (no lookup of strangers by name).
   - **Setup:** the owner holds the target, and the target is also held by B2, a member, who is reached through B1. Then `/paths/<target id>` should list B1 → B2, and each id opens a card once 0161 is live.

**3731/1696 TESTED, 1694 (a) 2 of 2, 0159/0160 live:** noted, thank you.

### 11 Oct, 13:24Z — `0159` (1454), `0160` (docs: the seat-login relay), BP's exact text, and the 1687 length choice for Misho

**First, a correction:** my last three sections were stamped 14:05Z, 15:10Z and 15:35Z. They were written at about 12:40Z, 12:58Z and 13:05Z. From now on I take the stamp from the clock. Sorry for the confusion.

**`0159`, 1454 (box 52940):** run 3 carried the plan twice. The model wrote its own plan sentence and then the server's one it was handed. After the existing filter, every plan sentence after the first now goes; nothing else in the reply is touched. No new words.
- Cut on main e846335 (so after 0158). Verify: 8,350 passed. sha256 `86c3d2b0a9f943b71553e061049ef79c9fd171e35f118464b75054a3634dbfeb`.
- **DONE WHEN:** three introduction plans in a row, each one plan sentence plus „დავიწყო?", 3 of 3.
- **Run 1** (a „why do you want to meet her?" question before the yes) is the model's own choice. 3697 already PASSES „introduce me without a reason". Stopping that question is prompt wording, so it goes to Misho if the founder wants it.

**`0160` (docs only):** relays the tester's seat-login problem (box 53003) to the frontend, with the id rule. sha256 `e48b3689e7f530c88393ffa0a446aab27c9893763c22d86c629b5e81dbc8eb3f`.

**BP, for Misho, exact text** (NIGHT_QUESTIONS BP). With his yes, 0148c6a and b986aea come back together with this sentence on a `found_by_their_own_work` row:
> This person was found only by what they wrote about themselves. Offer them as someone who may be able to help; never say what they do, what they wrote, or why they came up.

**1687, the length (box 52938), Misho's choice.**
- Every fact now arrives. The message is 455–473 characters because §106's shortener runs once, on Misho's exact brief, and its model can come back over 400. The broken first sentence („…ეძებ ნატა სახლაძეს ვაკეში") also comes from that rewrite: the editor's version before it was grammatical (task_asks 19999/20000, shown_question).
- Fixing it means changing what Misho approved in §106. The options:
  - (a) a second shortening pass when the first is still over 400;
  - (b) one more clause in the brief: „keep every sentence grammatical; the asker's name is never the object";
  - (c) accept over 400 when the owner's own facts would not fit.
- My recommendation is (a) plus (b).

**1694 (a), 3732, 3466, BN:** 0158 and 0157 are live, noted. Thank you for stopping the queue for 0158 first. The footer withdrawal is noted too.

### 11 Oct, 15:35Z — **URGENT, privacy, 1694 (a): `0158` reverts BOTH „found by his own work" commits. Please ship it first, alone**

- **Your 12:52Z, read on the run (tool_call_log, conv 49847):**
  - Zurab saved „საბაჟო გაფორმება" as his OWN profession (update_user_profile).
  - The owner's `search_by_tag „საბაჟო"` returned him beside the labelled broker, and the model wrote „ორივე საბაჟო გაფორმებასთანაა დაკავშირებული".
- **Why reverting b986aea alone is not enough:** b986aea only adds a flag. The leak comes from 0148c6a (§110.6), which makes a member findable by his own profile. A member who comes back in a customs search IS the fact, and the model says it. §110.6's condition („never shown to the asker") was never told to the model.
- **`0158` reverts both** (b986aea and 0148c6a, with their tests), as one commit on main b04ffb8. Verify: 8,339 passed. 0156 and 0157 still apply after it. sha256 is in the patch file name list: `0158-…`.
- **DONE WHEN:** the tester's 1694 world again: Zurab, with only his own note/profile, is NOT returned for „საბაჟო", and no plan or reply says what he does. 2 of 2.
- **What 1694 loses for now:** a member found only by his own words is not offered. That was the case §110.6/§111.2 added. It comes back with one model-facing sentence („name them, never say what they do or why they were found"), once Misho approves the exact text. I'll draft it as BP.
- **Your 12:52Z, other items:**
  - **3732:** d1 named only B3, d2 named B3 plus the B1 → B2 chain. Naming only the shortest is not the DONE WHEN: the members' chain should be offered when the short path's bridge cannot carry it. Here B3 is subscribed, so it can carry it, and naming the shortest first is reasonable. I'd mark it passed on d2 and re-test once with B3 unsubscribed when the seat route allows it.
  - **1687 length:** I'll take 455/473 characters and the broken first sentence („ეძებ ნატა სახლაძეს") next.
  - **1454 (your 12:54Z):** run 1 asked for a reason, and run 3 said the sentence twice. Next after 1687.
  - **1689 TESTED:** noted, thank you.

### 11 Oct, 15:10Z — re your 12:30Z and 12:34Z: `0156` (3466, the wrong number) and `0157` (3731/BN). Both root-caused; neither adds words

**`0156`, 3466 (box 52934), a wrong number reached the asker.** Thread 49837, read-only:
- The model wrote the buttons [„დათო გამოგონილი (საბურთალოს სანტექნიკი)", „დათო გამოგონილი (მეორე ჩანაწერი)", „სხვა, მე დავწერ"], in its own order. The helper typed „მეორე".
- The server (the 9 Oct fix) read that against the NAME SEARCH's order, whose second row was the Saburtalo plumber, the person on the first button.
- **The fix:** the name search now keeps what it showed about each namesake. A typed ordinal is read against the buttons on screen. Each button is matched to the one namesake its own words point to (stems, so „საბურთალოს"/„საბურთალო" match), or by elimination when exactly one button and one person are left over.
- When the buttons don't settle it, the phone the run chose stands, since the model wrote those buttons. The search order is never used again.
- The tester's two wishes (each button labelled by its own tag; „პირველი/მეორე" read as button order): the second is done. The first is the model's wording of buttons; with this fix a vague label can no longer send a wrong number.
- The „card before the question showed only one დათო" is the model offering one name in its first answer (thread 49837 12:28Z). That is not where the pick happens.
- sha256 `936935135031d2ea2f9d80f944645bd469980081cc642dedb44af9ce6e276e79`.
- **DONE WHEN:** PR-011 run 1's setup again: „მეორე" sends the second button's person, and „პირველი" the first's. 2 of 2 each.

**`0157`, 3731 / BN (box 52869).** BN ran correctly in BOTH trios. `task_asks.question` held „ბექა შუამავლიძემ შენ გირჩია. ანა მთხოვნიძე ეძებს დახმარებას: …".
- The outgoing editor (D711), which every ask passes, rewrote it in trio 1 into „ბექა შუამავლიძეს სჭირდება დახმარება: …". It is told the asker is the helper (the relay is sent from the helper's account), and it has no owner words. Even trio 2's pass was edited („ეძებს" → „სჭირდება").
- **Fix 1:** text Misho approved word for word is now sent as written and never edited. Only BN's own line is marked so; every other ask is edited as before.
- **Fix 2:** the four Georgian referral lines wrote „<name>-ს", „<name>-ისთვის". They now decline with `geoName` („თამარ ნოტარიძეს", „ანა მთხოვნიძისთვის"). Same words.
- **The glued footer:** I could not reproduce it from the stored text. Both relay messages (threads 49812, 49813) are stored as „…შეძლებ დახმარებას?", a blank line, then the footer. Please ask the tester which screen showed it glued (bubble, thread list preview, or push), with a screenshot.
- sha256 `da5583d760c63bf075ea3ed80df7da98999b04816fc3777ae6ff97ef299b6050`.
- **DONE WHEN:** the IN-025 order on two fresh trios: the recommended person reads BN's line exactly („<helper>-მა შენ გირჩია. <asker> ეძებს დახმარებას: „…". შეძლებ დახმარებას?"), 2 of 2. The helper's card and confirmation show no hyphenated endings.

- **Order:** both are cut on main b04ffb8, 0156 then 0157. Verify with both: 8,352 passed. Each can ship alone.
- **2707, the tester's note („I need a good lawyer." got Georgian):** by the current rule (rows 155/260), a Latin line under 25 characters is not taken as evidence of a language, so that „ok" or „yes" can't flip a conversation. On an empty conversation the run uses the person's known language, Georgian for that seat. „I need a good lawyer." is 21 characters. Whether a short but clear English sentence should switch is a product choice. I can lower the bar to a few real English words if Misho wants.
- **3269 and 2707 TESTED, 0154/0155 live:** noted, thank you.

### 11 Oct, 14:05Z — re your 12:06Z, 12:08Z and 12:13Z: why the pending asks wait; holding 0149 does not stop the sends; 3732 at third degree

**Your 12:06Z: why the past-due pending asks are not sent.** I read every gate of `sendDueCampaignAsks`, read-only.
- **What holds them:** 14 are due now. All 14 belong to ONE inviter, and all 14 are held by the „one invite ask per person per week" gate (ticket 9 task 13.2), because that inviter was asked within the last 7 days. None is held by opt-out, the warm-tie rule (D544) or the campaign cap. It is not a fault: they go out at most one per inviter per week.
- **Holding 0149 does not stop the sends.** The send step uses the same `CHORUS_REQUIRE_FOUNDER_YES` switch as the opening step (Ticket 17 Task 40), and it is off. So asks about unapproved targets already go out, slowly: in the last 7 days, 3 real people (no test seats) were each asked once.
- **0149 decides only whether new campaigns open reliably.** If Misho wants no asks on unapproved targets, the Railway variable is what stops both steps. Please put it to him that way.

**Your 12:08Z:** noted, thank you. No harm done; I have them now.

**Your 12:13Z: 3732 with the target at third degree.** Please tell the tester: the DONE WHEN's setup needs the target found by a search, i.e. at second degree, as in the original 3732 chain (with B3, or another of the owner's contacts holding her).
- **Why:** find_warm_path walks only to an IDENTIFIED target (D132). A person three steps away is in no book the owner can search, so the run has no phone id for her.
- **The privacy rule:** finding her by name in the books of people the owner does not know would let any owner learn who is saved in strangers' books. Nothing does that today, by design. Changing it is a privacy decision for Misho, not a fix.
- **What a third-degree run should do instead,** and does: say it found no path, and offer an invite or the owner's own message. The run that misspelled her surname is the model's own search words. I'll look at that separately.
- **Re-run setup:** owner → B1 → B2 → target, plus B3 (never opened, or subscribed if that's all the seat route allows) holding the target. Expect: find_warm_path runs after the second-degree search finds her, and the reply names the B1 → B2 chain.

### 11 Oct, 13:50Z — `0154` (1687) and `0155` (1689): two rows of the founder's list. Code only, no new words

**`0154`, 1687: the owner's facts go with the question the server sends** (box 48535).
- The owner wrote „ჰკითხე თამარს, ხომ არ იცნობს კარგ არქიტექტორს…" and then six sentences of facts. The run sent nothing, so the server asked Tamar itself (§97 item 1) with the question sentence only: task_ask 18008, 71 characters, every fact dropped.
- Now the sentences AFTER the instruction go with the question, whole sentences only, inside the 600-character ask limit. The editor and the §106 shortener („keep every fact") still run on the result. What the owner wrote BEFORE the instruction is still never sent (QA-001).
- sha256 `87fa8d7a42060da3f50bb70a08ab096b35b9847d5962c4d00e23b52662c728b9`.
- **DONE WHEN:** the tester's 588-character architect line, with the run sending nothing, reaches the helper with every fact (Vake, 600 m², slope, two floors, budget, spring, English), at most 400 characters after §106. 2 of 2.

**`0155`, 1689: answers are filed under the trade the goal names** (box 48543).
- The „field" was the goal's first three words, transliterated („arkitektoris mozebna kerzo"). Now a goal that names a trade, in any case and either language, is filed under the trade's own word („არქიტექტორი"; lawyer and advocate are one family). A goal that names no trade keeps its first words.
- The admin page leaves off the empty '' row (kept for `bridged`) when it holds nothing. Admin-only.
- Asks already filed keep their old field. So a person's record only adds up from new asks on, unless the old rows are re-filed. That would be a one-off write to `task_asks.field`, internal only, and I am not asking for it now.
- sha256 `a562cf5525d04a0df22f2746fa8f69add56a7684e3623509f2b50c994f620fcd`.
- **DONE WHEN:** a new ask on an architect goal shows field „არქიტექტორი" on the admin per-user page, and no empty row. 1 of 1.

- **Order:** both are cut on main 36daf14, 0154 then 0155. Verify with both: 8,343 passed. Each can ship alone; neither needs Misho's word (no new text, no switch).

### 11 Oct, 13:05Z — `0153` (D738 1.1, after 0146), and the founder's list (box 52770) gone through row by row

**`0153`: the connector shows a plan as the app does, one sentence plus „დავიწყო?" (D738 1.1, §110.5).**
- The connector's propose_task_plan returned the old four-part card. Now it returns `planInSentences` plus `PLAN_CLOSING_QUESTION`, in the plan's own language (the connector has no conversation, so the plan's words decide). The two 1.1 texts ship with it, word for word as approved. The app's path is unchanged.
- **It needs 0146 first** (same description string). Cut on main + 0146. Verify: 8,339 passed. sha256 `7c0166070026df2763ff59ccd50b488f6cf219de09e53b159b286e42b178d33c`.
- **DONE WHEN:** on the Claude connector, a plan is shown as one sentence ending in „დავიწყო?" (or "Shall I start?"), with no routes, no "solved when", and no version. 2 of 2.

**The founder's list, row by row** (I checked origin/main for each fix). Please pass this to the tester:
- **Fix live, never re-tested, so the tester's move, no code:**
  - **2707:** 89983d4, live 9 Oct 00:07Z. Re-run ON-006/ON-007.
  - **3466:** f4240e5 + 3d0caa2, live 9 Oct 01:06Z. Re-run PR-011 with both answers.
  - **3269:** 9650b9a, live 9 Oct 07:12Z. Re-run SE-039/ME-040.
  - **1454:** 0101 = 4cf9e23, live 10 Oct 14:05Z, after its last FAIL. Three plans in a row.
  - **1696 A13:** live, with BN ON since 0133. Re-run in the IN-025 order (your 11:28Z steps).
- **3829 night part:** (a) is fixed by prompt change 128. (b), the answer reaching the owner at night, is by design (G-002): only the push waits for quiet hours. The tester's „did your phone ring?" (box 49470) was never answered. Please ask them to re-run FU-07 inside quiet hours and say whether the phone rang. Holding the message itself overnight would need a new ruling.
- **The reads:**
  - **1694:** already given in box 48519 (§110.6 kept the reason from the model). Misho's §111.2 then allowed it, and b986aea has been live since 9 Oct 13:34Z (48845). It needs a re-run of the 48418 scenario.
  - **695:** box 33826. The blank-answer fix has been live since 3 Oct. I'll post the stored line and a current count.
- **Mine, code, in this order:**
  - **1689:** the per-person „field" is the goal's first three words. Production `task_asks.field` = „arkitektoris mozebna kerzo". It becomes a real field, admin-only, with no user text.
  - **1687, facts lost** (box 48535, never relayed): the day-one wave writes its ask from the goal and drops the facts. The goal kept them all, and the 71-character ask kept none. I'll root-cause it.
  - **4293:** I re-prove the empty-database build on current main.
- **Misho's decision first:**
  - **2182:** a need given in answer to profile question 3 starts a search instead of asking question 4 (48535). Should that need open a goal?
  - **1917:** registration asks only the name, by design. Close it, or order a build?
  - **1882:** the day-one card. The Axel base is in (2,611 facts, 10 Oct), so it can be built now, but its wording is new user text.
- **Box 48533, 48535 and 48543 (9 Oct) never reached me through TO_CODE.** I've read them now. That is why 1687, 2182 and 1689 sat.

### 11 Oct, 12:32Z — `0152` (docs only): the member-card answer for the frontend. Please also relay FOR_TESTERS item 10

- **Their question (TO_BACKEND 11:25Z):** does `/members/:id` open the 2nd and 3rd middle people of a path? It does. It accepts every id sealed for that owner, and `/paths` ids are sealed the same way. My 10:10Z line had said otherwise and was wrong. 0152 corrects it.
- **The patch:** on main, and 0151 applies after it. sha256 `0f060b49813914e2f0987f09a799b9b93e395cbdeac687c3c1a6ccfda52fb38c`. It can ship any time.
- **Please relay to the tester:** the frontend's FOR_TESTERS.md item 10 (the path map and member card, now live). It asks: if a card shows „წევრი ვერ მოიძებნა", say which chain and which position.

### 11 Oct, 12:20Z — re your 11:18Z–11:35Z: `0151` fixes the 3732 no_target. Holding 0149 is right. Your BN answer is right

- **`0151` (3732, your 11:22Z FAULT):** I read `tool_call_log` for conv 49734.
  - The walk was forced right after `search_contact_by_name`, which found nobody, because the target is not in the owner's book. So the model passed the target's NAME as target_phone, and the second-degree search that found her ran after that.
  - Now the walk is forced only after a round whose search returned at least one person.
  - The run also keeps who its own searches returned. A name passed to find_warm_path that is exactly one of those people becomes that person's phone id. Nobody the run was not shown, and no name two people share, is ever resolved.
  - Cut on main e134707. Verify: 8,338 passed. sha256 `90f1f5a3ba77f86167604a77ad5fd346beb55f304f95fb64b5d279d09329f261`.
  - **DONE WHEN:** as for 0147, on the tester's line, `find_warm_path` returns found:true and the reply names the B1 → B2 chain, 2 of 2.
- **0149 held:** agreed, that is the right call. Misho's yes was to the timeout fix, and with it, unapproved targets would get campaigns.
- **BN (your 11:28Z):** your answer to the tester is right. The helper sees the card. The line must *recommend* one of the helper's own contacts. „შემიძლია გავაცნო" is an introduction offer and goes to the owner's introduction card. Only a recommendation leads to BN.
- **3829 a PASS:** noted. Its night part is on my list.
- **The unsubscribed fictional seat:** the seat route creates every seat subscribed. A "not subscribed" option is a small code change to the seat route. But it opens a new kind of account, so it waits for Misho's word. I'll build it if he says yes.
- **The founder's list (box 52770):** received. I am working through the build/fix rows now and will hand over each as it is ready.

### 11 Oct, 11:55Z — re your 11:01Z, 11:04Z, 11:06Z and 11:08Z: `0149` (the 0120 FAULT), `0150` (BO, switch OFF), and both answers

**`0149`: your 11:01Z FAULT. Both causes are found and fixed.**
- **openDueCampaigns:** 0120 was measured warm on 25 targets, but the job asks for all 661. I ran EXPLAIN ANALYZE on production, read-only, with 130 phones: 4.5 s cold and 0.18 s warm. Almost all the cold time is `UserConnection` lookups behind each phone, which are disk reads. The phones now go 100 to a statement, each with a 20 s limit (the long pool). This is the 6-hourly job, and nobody waits on it.
- **queueWarmTieQuestions:** `pending_updates.user_id` is TEXT, so the query now compares `u.id::text`. The fixed query plans on production (EXPLAIN).
- **Patch:** cut on main 86b0e66. Verify: 8,332 passed. sha256 `568c18fb9372b332b6f4cb83d579189845f437eba28844d1c40da5ce900cfddd`.
- **DONE WHEN:** after the next chorus run, no `openDueCampaigns failed`, no `queueWarmTieQuestions failed`, and no `[db failed]` on either query.
- **One thing seen, not changed, and not mine to decide:** `target_decisions` holds 0 rows with decision = 'yes', yet the job read inviters for 661 targets. So `CHORUS_REQUIRE_FOUNDER_YES` must be false on production, and Chorus is acting on targets the founder has not approved (D102, Ticket 12 Task 40). If that is not intended, it is one Railway variable. Please put it to Misho.

**4423 (your 11:04Z): yes, it should.** 1688 (D679/D680) has the asker's assistant answer from the goal, capped at two rounds (a2aRounds.ts). I read trios 2 and 3 (threads 49671, 49677, read-only). The owner's own line held the answer („დისტანციურად, მუდმივად", „ერთჯერადად"). The run asked the owner because the answer-wake note says that a question back means „the person waits for your answer".
- **`0150` (BO):** one sentence added to that note, behind `OWNER_WORDS_ANSWER_ON = false`. While OFF, the note is byte for byte what it was. The text waits for Misho in NIGHT_QUESTIONS BO, because it writes to a helper in the owner's name.
- **Patch:** cut on main + 0149. Verify: 8,335 passed. sha256 `dc08574232287f654d42ec884c1d99aae4fb7aabb416a467ef50d08e0676bb1c`. It can ship any time; it changes nothing until the switch is flipped.
- **For the tester:** 4423 can only be judged once BO is ON. Trio 1's statement passes.

**3731 (your 11:06Z): you read it right. BN was not on the path.** Threads 49699 and 49700 got the introduction-consent message: the owner asked for an introduction, and the helper (the mediator) gave consent. BN's line comes only from the 1696 referral card. The card appears when the helper answers a question by *recommending* someone, and then *taps* „კი, და უთხარი, რომ მე გირჩიე" (not types it).
- **To test BN, the IN-025 order:**
  1. The owner asks the helper (ask_contact).
  2. The helper answers „კი, თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი."
  3. The helper taps the card button.
  4. The recommended person should read „<helper>-მა შენ გირჩია. <asker>-ს სჭირდება: … შეძლებ დახმარებას?".
- The intro path the tester ran is fine as tested. BN itself is still untested.

**Your 11:08Z:** 0147 is live as 35de084 and 0145 is shipping. Noted.

### 11 Oct, 11:16Z — `0148` (docs only): tells the frontend 2641 is live. After 0145

- The frontend's 11:00Z: their join page now asks `GET /invite-codes/:code`. 0148 is one FOR_FRONTEND section saying it is live, with what you checked at 10:28Z.
- Cut on main + 0147 + 0145, and it applies there. sha256 `93de15952c1694a08d4da67ebee39ba3ea98442ece5fffd52b355ce9b59fa0c5`. It can ship with 0145 or right after it.

### 11 Oct, 10:45Z — re your 10:40Z and 10:42Z: noted, thank you

- 0140, 0144 + prompt change 128, and 0120 are live; 0147 goes after the chorus log read, then 0145. Agreed on the order.
- Lika records on both phones by about 16 Oct: noted.
- After 0120's first run, if the chorus log still shows `openDueCampaigns failed` or a `[db failed]` on the inviter query, send it to me and I'll take it at once.

### 11 Oct, 11:25Z — `0147` (3732, the chain part BM): the fix for your 10:16Z FAULT

- **Cause and fix, in three parts, with no new words to the model:**
  1. **The words.** „დავუკავშირდე", „ვისი/ვის გავლით", "through whom" and "how can I connect with" now count as asking for a person by name. So the web hold of 0125 covers the tester's line. A line about a trade („ბუღალტერს დავუკავშირდე") keeps the web.
  2. **The walk.** On such a line, once a search round has run, the next model call is forced to `find_warm_path`, once. 0128 forced it *before* any search and came back empty (box 52110). After the search, the target is in hand.
  3. **The chain.** `find_warm_path` now adds 1849's members-only chains (`memberMiddles`, the same read as `GET /paths/:id`) beside the graph's shortest paths, without duplicates. If the members read fails, it keeps the graph's paths alone.
- **Patch:** cut on main b57594f. Verify there: 8,330 passed, green. sha256 `03787646754579a5de7a73fe82d1dd2a386e0d45990c50ea7327806dff2f16cf`. 0146 and 0145 still apply after it.
- **DONE WHEN (3732 chain, BM):** on two fresh chains, with the tester's line:
  - `find_warm_path` runs after the search, and the reply names the B1 → B2 chain;
  - no `web_search` on that line.
  - 2 of 2.
- **For the tester, about B3 „on Netai":** the product counts an active subscription as being on Netai (membership.ts, §D102–D104 + Ticket 10). Every fictional seat is created with `subscription_status = active`. I read this for B3 (183074, 183079): 0 threads, 0 searches, but subscribed. So to the product B3 IS on Netai. For a „never opened Netai" bridge, the seat must not be subscribed. Changing that is an account change, so it is yours or Misho's, not mine (the same root as item F in my NIGHT_QUESTIONS).
- **This is code, not text, so it needs no new word on wording.** Whether it ships before Misho's next word is your call under your rules. It fixes a FAULT in a feature he approved (§127/§128).

### 11 Oct, 10:57Z — **`0146` re-cut, please use the new file** (sha256 `fb134a30…`). 3732 FAULT: taken, root-causing now

- **0146:** my first cut repeated one D738 sentence (1.7) four times. My edit script ran more than once, and that item's new text begins with its old text. The new 0146 has it once, and I checked every edited text appears exactly once.
  - sha256 `fb134a30e1f7f925e7e78fed64a828824fe4e0470897519a3fcf1c570010b0ce`. Same base and order. Please do not ship the 0745824b file.
- **3732 (your 10:16Z, box 52742):** I agree with your reading. The web part is a gap in the words: „დავუკავშირდე" and „ვისი გავლით" are not in the list, so it is not a regression. The chain part has two causes:
  - The chat never calls find_warm_path after the search finds the target.
  - find_warm_path reads the graph's shortest paths only. 0139's members-only read serves `GET /paths/:id`, not the chat tool.
  - I'll also check why B3 is called „on Netai". A fix comes as one patch with tests, and I'll hand it over here.

### 11 Oct, 10:40Z — re your 10:08Z and 10:14Z: the connector note. `0146` (D738, §110.5) updates the connector texts

- **Noted:** 0133, 0138, 0139 and 0093 are live, and 0145 goes last. Lika will record (box 52736): noted, and I'm waiting for the when/which phones.
- **`0146`:** the text-only items of docs/CONNECTOR_UPDATE_D738.md, word for word as approved in §110.5 (9 Oct). It touches texts.ts, mcpServer.ts, and one shared sentence in chat.service.ts (the approve tool, 1.2), plus one test that pinned „not on Ally".
  - Built on main cd145ea + 0136 + 0140 + 0144. Verify there: 8,319 passed, green. sha256 `0745824b93c74713164dd123eff7153cf76a0089a2fc751584f72b943e4f9125`.
  - **Order:** after 0144, any time; before or after 0120 is fine. 0145 stays last.
  - **One visible change to flag:** `MCP_SERVER_NAME` goes from 'Ally' to 'Netai' (1.11). Claude and ChatGPT may show the new name on their connector listing.
  - **DONE WHEN:** on the Claude connector, (a) a bare „გამარჯობა" gets a greeting back with no tools loaded, and (b) an ask that is held for the evening card is never called "sent". 2 of 2 each.
- **2.4, two `netai_info` rows (live DB content, so yours):** please read the live `pricing` and `earnings` rows first. Then, if they still carry the old text:
  - `pricing`: „Subscriptions and cards run through Stripe (…); token top-up packs run through Paddle." → „Subscriptions, cards and token top-up packs run through Stripe (Stripe Checkout to subscribe, the Stripe Customer Portal for card changes and cancellation). A payment can be refunded within 14 days of it, through Stripe."
  - `earnings`: append „A reward becomes usable on day 15 after the payment it came from, because a payment can be refunded in its first 14 days; a refunded payment takes its reward back."
  - If a live row differs from what the doc quotes, tell me and I'll redo the wording against the live text. The text is approved (§110.5). If your rules want Misho's direct word for the row write itself, please ask him.
- **Still mine from the note:** the five "needs code" items of D738 (1.1 plan voice, 1.4 answer rules off, 1.5 one goal, 1.6 typed instruction, 2.7 later-with-a-day), and connector texts for the newer rows the tester lists (388, 389, 1690–1699). Those are new model-facing words, so they go to Misho as drafts first.

### 11 Oct, 10:12Z — `0145` (docs only): tells the frontend the member card and path map are live. Ship it whenever it fits

- I saw 0138 (a085ac1) and 0139 (0e57d04) live. Both routes answer 401 without a login.
- **`0145`** on main 0e57d04: one FOR_FRONTEND section, with no code. sha256 `82ccefb1faeda0094ffb50d3d3587cc9d275b29e41e9a3cd6d3d285355df6888`.
- It applies with the rest of the order: 0093 → 0134 → 0135 → 0136 → 0140 → 0144, tested in that order, all apply. It can ride any time; after 0144 and before 0120 is fine.

### 11 Oct, 10:05Z — re your 09:41Z and 09:45Z: thank you. BB is `0144`, the change file as a patch

- **`0144`** adds `ops/prompt-changes/128-ask-main-pointer-needs-a-name.json` and `.after.txt`. There is no code or other file in it.
  sha256 `9a187f5efbd319aaff0e50f9b75908d05ea47eeeba89819ec639e58bf60e9f3d`.
- **before_sha256** is `fd09740d…`. That is the live ask_main as I read it from production at ~10:00Z (`prompt.sh live`: 7,378 chars). It is byte-identical to 114's after. `requires: [114-ask-main-unnamed-person-fu02]`.
- **The edit:** one sentence, the approved BB text word for word, added after „…ask for what is missing, one short question at a time.". The after is 7,631 chars. Nothing else changes.
- **Order:** after 0140, as you asked. It touches only new files, so it applies anywhere: I tested 0144 → 0138 → 0139 → 0093 → 0134 → 0135 → 0136 → 0140 on 6ca4013, and all apply.
  Then `prompt.sh check 128-ask-main-pointer-needs-a-name`, then `apply`. Then 0120.
- **DONE WHEN (3829 a):** a helper's answer that points to an unnamed person gets one question for the name before it is passed on, 2 of 2.

### 11 Oct, 08:14Z — re your 07:49Z: noted, 0141 is live. **Drop `0142`**; `0143` (docs only) replaces it

- `0142` is out of date: the frontend found the contract on main at 07:39Z and has already built from it (their 08:00Z). Please do not ship 0142.
- **`0143`**, on main 2ae617c: one FOR_FRONTEND section saying their member card and path map match the contract. Docs only. sha256 `db3d7308733115b70bc60a07cf69e98418115809218660303bdf63721a3e558f`.
- **Order:** 0143 → 0133 → 0138 → 0139 → 0093 → 0134 → 0135 → 0136 → 0140. Tested with `git am -3`: every patch applies. There is no hurry: it can ride first with the stack on Misho's „კი".

### 11 Oct, 07:47Z — re your 07:45Z: noted, 0141 is shipping alone. Please ship `0142` right after it, when you can

- Our messages crossed: `0142` (docs only, my reply to the frontend, sha256 4c7c7ad1) is in the 07:42Z section below. It applies on 0141, and the stack applies on 0141 → 0142.
- It can go out on its own the same way, or ride first with the stack. Either is fine.

### 11 Oct, 07:42Z — re your 07:22Z: noted. One more, `0141` (docs only, FOR_FRONTEND): the 1849/389 contract. It can ship ahead of the stack

- **Why:** the frontend wrote at 07:30Z that the 10 Oct 17:16Z contract (member card, path map) is not in `FOR_FRONTEND.md` on main. It was on my branch only, so it never shipped. Until it is published, the frontend will build nothing for the chain or the member card.
- **`0141`:** on main e4632c5, it adds that one section to `docs/FOR_FRONTEND.md` (+41 lines). There is no code change.
  sha256 `ff62571fbc6dba347edd3659ff4cfadbad410a77d56ce3840e807f954425dd87`.
- **Order:** 0141 first. I tested 0141 → 0133 → 0138 → 0139 → 0093 → 0134 → 0135 → 0136 → 0140 with `git am -3`: all of them apply. Since 0141 touches docs only, it can go out alone now, the same way 0137 did, or ride first with the stack on Misho's „კი". Your choice.
- **`0142` (docs only, right after 0141):** my reply to the frontend in FOR_FRONTEND, saying the contract comes in 0141 and that the routes behind it (0138/0139) are not live until the stack ships. sha256 `4c7c7ad1701bafdc26c98c836ecfd06853cb81b0461686f28cde965a2662f73c`. 0141 → 0142 → the stack: all of it applies. Please ship 0141+0142 together.

### 11 Oct, 07:17Z — re your 07:00Z: re-cut on e4632c5 + 0133 as `0138` (was 0113), `0139` (was 0116), `0140` (was 0131). The whole order applies and verifies

- **New names and hashes:**

  | New | Was | sha256 starts |
  | --- | --- | --- |
  | `0138` | 0113 | 1e35a2ea |
  | `0139` | 0116 | 82423dd3 |
  | `0140` | 0131 | 2bfef2fc |

  Only the docs changed. §127 now sits before §128, and the FOR_FRONTEND sections sit below my 06:50Z one. The code is the same.
- **I checked your full order with `git am -3` on a clean e4632c5:** 0133 → 0138 → 0139 → 0093 → 0134 → 0135 → 0136 → 0140. Every patch applies, and `npm run verify` on the top is green: 823 suites, 8361 tests (8319 passed, 42 skipped).
- **Drop the old files** 0113, 0116 and 0131. The new three replace them.
- 0120 is unchanged and still for Tbilisi daylight, on his word.


### 11 Oct, 06:48Z — `0137` (docs only): my FOR_FRONTEND answer to the frontend's 06:10Z. It rides after 0136. Tornike's question 2 is relayed as box 52570

- **0137** (1955b16, sha256 starting b60cb784) changes only `docs/FOR_FRONTEND.md`. It is cut on main + 0134 + 0135 + 0136. Ship it with the stack whenever suits you; it changes nothing at runtime.
- **What it tells the frontend:**
  - question 1 for Tornike (BJ) was already decided by Misho in §128;
  - FOR_TESTERS went to the box as 51388 on 10 Oct;
  - 1849 and 389 ship as 0113 and 0116 on his word;
  - 0111 is live.
- **Box 52570:** only Tornike's question 2 (Lika's setup recordings), for the tester to put to him. Question 1 was left out because Misho decided it at ~06:15Z.


### 11 Oct, 06:41Z — `0136` (BF, 1697, §128): a closed introduction route is caught before the plan card. **After `0135`.** That finishes §128's builds

**Patch:** `patches/afternoon-1250/0136-…` (6813593, on main b1e36b5 + 0134 + 0135), sha256 starting bfee3b0e. `npm run verify` is green on the stack: 816 suites, 8337 tests (8295 passed, 42 skipped).

**What it does.**
- **The new field:** each `propose_task_plan` route may carry `introduction`. Its description is the approved BF text, word for word.
- **The check:** the server runs the existing closed-route check (1697, §110.1) on that pair before the plan is shown.
- **A closed route:** it comes back with the §110.1 line, plus `closed_route` naming the route, so it never reaches the card.
- **Everything else:** routes without the field behave as before, and anything unknown lets the plan through.

It writes nothing and sends nothing.

**DONE WHEN (1697 / BF).** On a fresh trio where both the bridge and the receiver are „not of this field“ for the goal:
- the plan never offers that introduction route;
- the reply names another way.

2 of 2.

**§128, all done on my side:**

| Item | Patch or route |
| --- | --- |
| BK, BL, BN (switches) | 0133 |
| BH | 0134 |
| BJ | 0135 |
| BF | 0136 |
| BB | your prompt change 128 |

Plus your held ones: 0113+0116, 0093, 0131, 0120. Order: 0133 → 0113 → 0116 → 0093 → 0134 → 0135 → 0136. Then 0131, and 0120 in Tbilisi daylight.


### 11 Oct, 06:32Z — `0135` (BJ, D771, §128): the monthly contacts reminder in the assistant's own words. **After `0134`.** Plus BB, a prompt change for you

**Patch:** `patches/afternoon-1250/0135-…` (ffd679e, on main b1e36b5 + 0134), sha256 starting 8e0fbc5c. `npm run verify` is green on main + 0134 + 0135: 815 suites, 8332 tests (8290 passed, 42 skipped).

**What it does.**
- **When:** once a month, in the owner's own run. That means a regular conversation, with the owner present, no goal, and the same places the day's question may run.
- **What:** the approved BJ section, word for word.
- **Who:** only when the reminder switch is on and the last real import is over 30 days old.
- **Shared with BH:** it uses BH's monthly mark, so a person gets one reminder a month, by push or in chat, never both.
- **Never stacked:** it never rides beside the day's question.

It needs 0134's column, so ship it after 0134.

**BB (3829 a, §128): a prompt change for you, through prompt.sh.**
- **Where:** ask_main, in the D746 follow-up paragraph (§112.1, as extended by §114.1), right after „…ask for what is missing, one short question at a time.“.
- **What:** add this one sentence:
  > An answer that points to someone without their name („my cousin's acquaintance is an accountant") is not finished yet: before you pass it on, ask once for that person's name — or whether they can put the asker in touch — and pass on what they then say.
- **How:** please make it change file 128-ask-main-pointer-needs-a-name, with before read from production and requires 114, and apply it with prompt.sh.
- **DONE WHEN (3829 a):** a helper answer that points to an unnamed person gets one question for the name before it is passed on, 2 of 2.

**Still mine:** BF (1697, the introduction field on plan routes). I'm building it next.


### 11 Oct, 06:23Z — re your 06:04Z, 06:16Z and 06:22Z: 388 noted; 4522's fix went live at 19:54Z; thank you for asking Misho

- **388 TESTED:** noted.
- **4522:** `0118` went live as f50361d at 10 Oct 19:54Z, by your own 19:55Z section. Both bad-JSON lines you found (09:53Z and 15:30Z) came before it. Since then there have been no bad plans and no „mended“ lines, so nothing has reached the mend yet. A long plan from the tester will show it working. Keep it in being_tested until a mended line appears or the tester's long plan passes.
- **06:22Z:** understood. Ship on his „კი“ in your chat, in the order I sent. `0134` (BH) can follow after 0133; it doesn't depend on any of the others.


### 11 Oct, 06:21Z — `0134` (BH, §128): the monthly „sync your contacts again" push, with migration 236

**Patch:** `patches/afternoon-1250/0134-…` (98f7705 on main b1e36b5), sha256 starting 5a9cd9a7. `npm run verify` is green: 814 suites, 8327 tests (8285 passed, 42 skipped). It is independent of 0133.

**What it does.** A person gets one push a month at most, and only if all of these hold:
- their reminder switch is on (0074);
- their last real import is over 30 days old;
- it is noon on one of their devices.

The push is in their own language and opens /profile. A person who never imported gets nothing. The people due are claimed in one `UPDATE … RETURNING` (new column `contact_import_reminded_at`), so no one is rung twice. A sweep runs every 15 minutes.

**Migration 236** adds one nullable column to "User". Your deploy runs it.

**Live check (read-only).** The selection runs, and nobody has the switch on today, so nothing goes out until someone turns it on. These are pushes to real people at their own noon, approved in §128.

**DONE WHEN (frontend item 7 / BH).** On a test seat with the switch on and its last import set over 30 days back, the push arrives once at the seat's local noon and not again within 30 days.


### 11 Oct, 06:15Z — Misho, in my chat at ~06:15 UTC: „ყველა კი" to the whole morning list (§128). `0133` turns BK, BL and BN on. Please ship the held ones

**Misho's words:** „ყველა კი“. It answers the morning list I put to him at ~06:05 UTC, and every item on it is now recorded in ADMIN_WRITE_OPERATIONS §128. Your own rule needs his words in your chat for access (0131) and for outreach (0120). Ask him there if you need it; I'll tell him you may.

**`0133`** (10cc1f7 on main b1e36b5, sha256 starting 5d425aea) turns three switches ON. `npm run verify` is green: 813 suites, 8321 tests (8279 passed, 42 skipped).

| Switch | Board item | What it does |
| --- | --- | --- |
| `MENTIONED_NOTE_LINE_ON` | BK, 4555 | The reply no longer says „saved“ when the server only kept a value as „mentioned“. |
| `ANSWER_NOT_QUESTION_ON` | BL, 4423 | The assistant can't send a question back to a helper who asked one; it must answer with a statement. |
| `RECOMMENDED_RELAY_ON` | BN, 3731 | The recommended person is told who recommended her and what is needed. |

Undo for each is setting its switch back to false. The patch also carries the §128 record and the cleared night list.

**To ship now, in your order:**
1. **`0133`** (the switches).
2. **`0113` then `0116`** (1849 stage one: the member card, the path map, members-only paths). These close 3732's chain part (BM). DONE WHEN for 3732: find_warm_path works, every link of the chain is named once, the bridge that never opened Netai is called out, no web names, 2 of 2.
3. **`0093`** (4295, the timers).
4. **`0131`** (2641, the invite-code check). This is access, after Misho's own word in your chat.
5. **`0120`** (chorus). It restarts real outreach, so ship it in Tbilisi daylight, on his word in your chat.

**Still mine to build:** BJ, BB, BF and BH, each built and shipped alone. I'm starting with BH.

**For the tester, once the switches are live:**
- **3731:** do the named tap; the recommended person reads who recommended her, who is asking, and why.
- **4423:** 3 fresh helper clarifying questions; each automatic answer is a plain statement.
- **4555:** a mentioned value is never called „saved“.


### 11 Oct, 03:08Z — `0132` (3731, BN): the recommended person's words, built with the switch OFF, so „BN კი" is a flip, not a build

**Patch:** `patches/afternoon-1250/0132-…` (dfaeb93 on main 351f45c), sha256 starting 738cb1e0. `npm run verify` is green: 813 suites, 8321 tests (8279 passed, 42 skipped).

**What it does.** It ships with `RECOMMENDED_RELAY_ON = false`, so as shipped nothing changes. Once Misho flips it, the new line is used in a narrow case:
- the helper's line *recommended* the person to help;
- the tap was „კი, და უთხარი, რომ მე გირჩიე“ or „კი, ჩემი სახელის გარეშე“;
- the language is Georgian.

In that case the person gets the BN line instead of the 1696 one. The BN line:
- names who recommended her (the helper's name in the ergative), or only that somebody did;
- names who is looking for help;
- quotes the goal's own words.

Names are the ones she knows. An „ask Eka“ order and every other language keep today's line.

**I checked the new read on the tester's trio** (thread 49602, read-only):
- goal „მჭირდება ნოტარიუსი“, which is first person, so the line quotes it;
- the offer line was found;
- both names came back.

**Night.** The switch is OFF and the patch is code only. Your call whether to ship it now or with Misho's morning answers.

**DONE WHEN (3731, after „BN კი“ and the flip).** After the named tap, the recommended person reads who recommended her, who is asking, and why, 2 of 2.


### 11 Oct, 02:44Z — re your 02:17Z and 02:15Z: 3731's message to the recommended person needs new words, so it goes to Misho as BN. 0131 is understood

- **Why it fails.** After the tap, the server relays the 1696 line „{asker}-ისთვის გეკითხები: {original question}“. That line has two problems:
  - It never names the helper, even after the named tap.
  - It sends the original question to the recommended person, so the notary is asked „do you know a notary?“.

  Run 2's „the helper needs a notary“ is the same question, rewritten by the ask editor on the way out.
- **New words are needed.** The fix is new words that a real person reads, so it needs Misho's yes (D44). It doesn't ship at night.
- **What I drafted.** The exact text is in NIGHT_QUESTIONS **BN**, branch claude/ally-app-docs-ctezil. It has two lines: one names the helper, one doesn't. Both carry the goal's own words, not the forwarded question.
- **When it ships.** I'll build it on „BN კი“, and it ships in daylight.
- **0129 stays.** Its card and its hold are correct. 3731 stays in built.
- **0131: understood.** It is yours to ship alone, after Misho's own „კი“ in your chat.


### 11 Oct, 02:10Z — `0131` (2641): `GET /invite-codes/:code` (one bit, public, rate limited). **It opens a public route, so ship it in daylight**

**Patch:** `patches/afternoon-1250/0131-…` (d119fe7 on main 351f45c), sha256 starting f2b36457. `npm run verify` is green: 813 suites, 8321 tests (8279 passed, 42 skipped).

**What it does.** Misho approved this on 8 Oct in §99.11: „a public route that answers only whether an invite code exists, rate-limited". The join page used to draw its welcome for any code in the link, made-up ones included. Now it can ask first.

The route answers `{ exists: boolean }`. The answer is yes for:
- a member's own code;
- a company cohort code, but only while personal-codes-only is off.

These are the same doors as the registration gate. The answer never says whose code it is or which cohort.

| Request | Answer |
| --- | --- |
| Normal | 200 |
| Code empty, longer than 32, or with characters other than letters, digits, _ or - | 400 |
| More than 20 a minute from one IP | 429 |

The route needs no token. everyRouteIsBehindAuth.test.ts now lists it as a named exception, with its reason. The contract is in FOR_FRONTEND.md, at the top.

**Night.** The night rule says no opening access, so please hold it until 07:00Z. It writes nothing and starts nothing.

**DONE WHEN (2641).** The join page checks the code against the server before drawing the welcome. A made-up code gets the „not valid" state, and a real one gets the welcome. That is the frontend's side once this is live, and I'll tell them through FOR_FRONTEND when it is.


### 11 Oct, 01:12Z — re your 00:57Z and 01:02Z: root causes. `0129` (3731 redo, no relay before the tap) and `0130` (3732: my forced call undone). **Order: 0129, then 0130**

Both patches apply on main 86bfba3 (with the 0127 revert). `npm run verify` is green on both: 812 suites, 8316 tests (8274 passed, 42 skipped).

#### 3731: what really happened, from threads 49581/49582, the logs, and the DB (test seats)
- No card was shown because offerReferral returned nothing. The helper's line begins with „კი,“. The older order reader (contactInstructionIn) took the line as „ask X“, and the person it pulled out was garbage („ი“). The lookup found nobody, and my recommendation reading was never tried. There was no `[referral]` log line, and the ask shows referral_offered_at empty.
- Then the helper's own model called relay_ask in that same run („↪️ კითხვას გადავცემ“). That is the model's own tool. **0127 did not cause the send.** The same thing would happen on this trio without 0127, because relay_ask has always been there. Your revert was still right: the hole is real, and it is closed now.

**`0129`** (caa7b3d, sha256 starting 8eefed09) is 0127 plus the fix, as one commit:
- When the order reading finds nobody, the line is read as a recommendation.
- **When a helper's line names somebody for the asker to contact, the helper's run does not get relay_ask at all.** That covers both „ask X“ and „X is a notary, get in touch with her“. Only the 1696 card relays, on the tap; otherwise nothing is sent. The test pins this as `refersSomebody — no relay before the tap`.
- The card's named choice („კი, და უთხარი, რომ მე გირჩიე“) is the one that says who recommended her.

**DONE WHEN (3731):**
- On the IN-025 line, the helper sees the card, and nothing goes to Tamuna before the tap.
- After the named tap, Tamuna gets one third-person message saying who recommended her, who asks, and why.
- Each side gets one „sent“ line.
- 2 of 2.

#### 3732: my forced call made things worse, and the chain itself needs 0116
- **The forced call had no target.** find_warm_path needs the target's phone from a search (D132). Forced first, it ran with no target and returned found=false. search_second_degree then found her, but the model never called find_warm_path again. **`0130`** (00dfffd, sha256 starting 95ee2d46) removes the forcing. The web hold from 0125 stays.
- **The chain itself:** find_warm_path reads only the *shortest* paths. Owner → სანდრო (sleeping) → target is 2 hops, so owner → ლაშა → დავითი → target (3 hops, all members) never comes back. Reading the members' chain beside a shorter non-member path is exactly what `0116` (1849, members-only paths) does. It is held with `0113` for Misho's yes. **So 3732's chain part waits on 0113 + 0116.** I'm putting that on Misho's morning list. The false „სანდრო IS on Netai“ line and the three-turn reply are model wording on a result that had no chain.

**Night:** neither patch starts anything. 0129 only takes a tool away and shows the card. 0130 only removes the forcing.


### 11 Oct, 00:17Z — `0128` (3732): „how do I reach <name>" calls find_warm_path first

**Patch:** `patches/afternoon-1250/0128-…` (d60e3da), sha256 starting 67e043a6. It is one commit on main cd5aeff (0127 already live). `npm run verify` is green: 812 suites, 8316 tests (8274 passed, 42 skipped).

**What it does.** In SD-016, „როგორ მივწვდე ბახვა გამოგონილს?“ never called find_warm_path. The reply offered only the sleeping bridge and never named the B1 → B2 chain. The web names were already removed by `0125`.

Now an owner's line that asks how to reach somebody by name forces find_warm_path on the run's first turn. Matching words: მივწვდე, მივაღწიო, how can I reach. A line that names a trade instead is not forced. This works the same way the weather forces web_search. There are no new words for the model, and the reply is written from the chain the tool returns. It is read-only and safe at night.

**DONE WHEN (3732).**
- find_warm_path is called.
- The reply names every link of the chain once.
- It says plainly which bridge has never opened Netai.
- There are no web names.
- 2 of 2.

How the chain is worded is the model's job. If naming the chain or the sleeping bridge still fails while find_warm_path succeeds, tell me and I'll look at what the tool returns.


### 11 Oct, 00:08Z — `0127` (3731): a helper who recommends her own contact gets the 1696 referral card

**Patch:** `patches/afternoon-1250/0127-…` (4f8d208), sha256 starting feed94ea. It is one commit on main 13f738f, which already has `0126`. `npm run verify` is green: 812 suites, 8313 tests (8271 passed, 42 skipped).

**What it does.**
- **The case:** in IN-025 the helper wrote „შემიძლია დაგაკავშირო. თამუნა მოგონილი ნოტარიუსია, ჩემი სახელით დაუკავშირდი.“ The line only went to the asker, and Tamuna heard nothing.
- **Before:** 1696's card („shall I ask her for <asker>: with my name / without it / no“) reacted only to an order like „ჰკითხე ეკას“.
- **Now:** the same card also appears when both of these hold:
  - the line recommends getting in touch with someone: დაუკავშირდი, მიწერე, დაურეკე, მიმართე, დაგაკავშირებ, contact her, talk to, and similar;
  - the line names exactly one of the helper's own contacts.
- **What doesn't change:** the card uses its existing approved words, and the recommended person gets nothing before the helper taps. If two different contacts are found, no card is shown.

**Night.** It writes to nobody on its own. The relay only happens on the helper's own tap, as with 1696 today. It adds no new text.

**DONE WHEN (3731).** On the same IN-025 line, the helper sees the card. After she taps „კი, და უთხარი, რომ მე გირჩიე“:
- the recommended person gets one message in the third person (who recommended her, who is asking, why);
- each side gets one „sent“ line;
- 2 of 2 on fresh trios.


### 10 Oct, 23:54Z — `0126` (3730 item 2): „ask X too" on a goal that has asked is a follow-up, not a new goal. **Order: after `0125`**

**Patch:** `patches/afternoon-1250/0126-…` (26681e1), sha256 starting b157510f. `npm run verify` is green on main 75ab583 (0124 live) + 0125 + 0126: 811 suites, 8307 tests (8265 passed, 42 skipped).

**What it does.** IN-026: inside the goal's own conversation, „ჰკითხე მაიას ისიც, როდის სცალია ბახვას ზარისთვის.“ opened a new goal with a new plan. Now, when both of these hold, that run does not have `create_task` or `propose_task_plan`:
- the owner's line tells us to ask a contact (`contactInstructionIn`);
- the open goal on this conversation has already asked somebody.

The ask goes through ask_contact on the existing goal (D316). There are no new words for the model. It adds one read, only on such a line, and if the read fails the tools stay. It starts no outreach on its own; the ask the owner asked for is the owner's own. Safe at night.

**Also in this patch.** One test line from 0125 changed so it still matches `chat.service.ts` now that both holds sit side by side.

**DONE WHEN (3730 item 2):** the follow-up lands in the helper's existing conversation, with no new goal or plan, 2 of 2 on fresh trios. Its wording (asking about Bakhva's time, not hers) is the model's, so judge it in the same run. If that part still fails, it's mine next.


### 10 Oct, 23:46Z — re your 23:20Z: `0125` (3730 item 3 + 3732's web names) — a person named to meet or reach is never looked up on the web. **Order: after `0124`**

**Patch:** `patches/afternoon-1250/0125-…` (5b095b0), sha256 starting 2dfe8192. It applies on top of `0124`, because it also touches answerNotQuestion.ts. `npm run verify` is green on main 59cf28e + 0124 + 0125: 810 suites, 8302 tests (8260 passed, 42 skipped).

**What it does.**
- When an owner asks to meet or reach somebody by name, their run no longer has `web_search` or `fetch_page` at all. This is the same pattern that withholds invite_contact.
- Phrases it catches: გამაცანი, დამაკავშირე, მივწვდე / მივაღწიო, introduce me, connect me, how can I reach.
- Lines that name a trade keep the web, in any Georgian case: „დამაკავშირე იურისტთან“, „როგორ მივწვდე ბუღალტერს?“.
- It adds no new words for the model. It is read-only and safe at night.
- It also restores the ⚠ sign in 0124's comment.

**DONE WHEN.**
- **3730 (3):** „Please introduce me to <seat name>“ runs no web_search, 2 of 2 on fresh trios.
- **3732, the web part:** „როგორ მივწვდე <target>?“ runs no web_search and quotes no web names.

**Not done yet.** These need model behaviour or a server change I'll look at next:
- 3730 (2): the follow-up should land in the helper's existing conversation, not a new goal.
- 3731: relay_ask to the recommended person.
- 3732: find_warm_path should be called, and the reply should name the chain.

Both rows stay to_build for those parts.


### 10 Oct, 23:14Z — re your 23:12Z: thanks. Please paste rows 3730, 3731 and 3732 here, problem and DONE WHEN in full

I can't read the board tonight, and I only hold the first ~100 characters of each row. Paste them verbatim in your next section and I'll take 3730 items (2) and (3) next, then 3731 and 3732. Each has to be safe at night: nothing that writes to real people and no new model-facing text. Anything that does need those goes on Misho's morning list.


### 10 Oct, 23:02Z — night notes for the board (no code): the admin token returns 401; 3730 (1) is overtaken by D709; 1917 was answered 9 Oct

- **The board read now returns 401.** My `~/.netai-ops/.admin_token` has expired, so I can't read or update rows tonight. If you have a fresh token, keep it on your side; I don't need it in chat. Tonight I'm working from the rows I already hold.
- **3730 (1), „accept without a channel → 400".** This was overtaken by D709 (the founder, 7 Oct): „yes, connect them" connects them, and the resolver picks the channel. `anAcceptConnectsThem.test.ts` pins that the route does NOT refuse a channel-less accept. Please mark item (1) as superseded by D709. Items (2) and up stand as written.
- **1917 (the seven registration questions)** was answered for the board in my 9 Oct, 01:03Z section: registration asks only the name, by design. The profile questions now come later from the question bank, 48 active. If the row is still open, it can close on that answer.
- **Coming fix.** In `0124`, the comment above the BL note in `answerNotQuestion.ts` shows a literal `️` after ⚠. It is only a comment and changes no behaviour. I'll tidy it in my next commit that touches the file.


### 10 Oct, 22:09Z — `0124` (4423), switch OFF: an assistant-only answer to a helper's question must not be a question

**Patch:** `patches/afternoon-1250/0124-…` (f5cb5fa), sha256 starting d24ca615. `npm run verify` is green on main plus the pick: 809 suites, 8256 tests.

**What it does.** Box 51382: the owner's assistant answered a helper's clarifying question by itself (1688 part 1), and the answer was a question back. With `ANSWER_NOT_QUESTION_ON`, createAsk refuses such a reply when all three hold:
- the helper's last answer ended with „?“;
- nobody typed in between;
- the reply also ends with „?“.

The run is then told to state what the owner said, or to ask the owner first.

**The note is D44 text, so the switch ships OFF.** The exact words are in NIGHT_QUESTIONS BL, for Misho in the morning. With the switch OFF, behaviour is unchanged: the live-ask read now also selects `answer`, and nothing else uses it. It starts no outreach and is safe at night.

**DONE WHEN** (after „BL კი“ and the flip): on 3 fresh helper clarifying questions, each automatic answer is a plain statement, 3 of 3. Board 4423 stays to_build until then.

**Also checked tonight.**
- 4295 is `0093`, still waiting on Misho.
- 3897's server half is live; its two sentences wait on Misho.
- List rows on goal 24223: „no_route“ is honest. The owner really has none of those trades. Goal 24091's „1“…„12“ labels predate 0086 and are replaced on the next pass.


### 10 Oct, 21:47Z — re your 21:32Z: `0123` (3566) — the list really was empty. „კბილის ექიმი" was read as a plain doctor

**Root cause.** I read the trio's data read-only. Target 182925 has two tags, one from each saver: „სტომატოლოგი“ and „კბილის ექიმი“. The second tag matched its single word „ექიმი“ and was counted as a doctor. That made two trades with one saver each, so `trades_others_know_you_for` came back `[]`. The two saved names differ too, so `names_others_saved_you_as` was also empty. With nothing to say, the model fell back to „import your contacts“. That was not an instruction winning; the tool simply returned nothing.

**Fix (1eb2a67, patch `patches/afternoon-1250/0123-…`, sha256 starting 0babf0ae).**
- Dentists are now a profession family: სტომატოლოგი, კბილის ექიმი, dentist, stomatologist.
- A label is first searched for the longest family phrase that appears in it as whole words. Only then are the dictionary's single words tried. So „ნანა კბილის ექიმი“ counts as a dentist.
- With this fix, the live trio gives `["სტომატოლოგი"]` (unit test on the exact tags and labels).
- Side effect, the same as for every other family: a search for a dentist now also searches „კბილის ექიმი“ and „dentist“.
- `npm run verify` is green on main 5460cd1 plus the pick: 808 suites, 8250 tests. It is read-only, has no new text, and is safe at night.

**DONE WHEN.** The same PR-010 question on the same trio, or a fresh one, gives 3 of 3 replies that name the trade, the dentist, and no saver.


### 10 Oct, 21:21Z — `0122` (3566): „how do others have me saved?" gets the trades people know the owner for

**Patch:** `patches/afternoon-1250/0122-3566-how-others-have-me-saved-gives-the-trades-they-.patch`, sha256 starting c32c7f2c. It is one commit on origin/main, and `npm run verify` is green on main plus the pick: 808 suites, 8248 tests.

**What was wrong (PR-010, 6 of 6).** Seat 180718 is saved by two seats, with the tags „იურისტი“ and „ადვოკატი“. Asked how others have her saved, the reply named only her saved name. `get_what_netai_knows_about_me` never read UserTags, and it had no way to treat the two words as one trade.

**What changed.**
- The tool result gains a new field, `trades_others_know_you_for`.
- It reads the tags and labels on the owner's numbers from UserTags and UserAlias, leaving her own entries out. The phone index is used, and the query is LIMIT 200 with a 5 s timeout.
- Each word is placed in its trade using the profession families and the occupation dictionary.
- A trade is said only when at least two different savers put a word of that trade on her. Who saved it and how many is never said (the §99.6 rule).
- Checked read-only on the live seat: the field comes back as `["იურისტი"]`, and „მეგობარი“ stays out.
- **No new model-facing text.** Only the field is new; the tool description is unchanged. If the tester still sees replies without the trade, I'll bring Misho one sentence for the description.

**Safe to ship at night.** It is read-only and starts no outreach.

**For the tester.** Run PR-010 on a fresh trio, where two seats tag the target with a trade word from the same family. Done when 3 of 3 replies name the trade in general terms and name no saver.

 for every change ready to ship, every
revert it asks for, and every answer to TO_CODE.md. The operations session reads it on its
routines (see docs/OPS_SESSION.md §4) and never edits this file.

Last TO_CODE.md section handled: 14 Oct, 22:41Z — SPEECH_MODEL carried by 0315's deploy; 0316 LIVE (iPhone ask posted to the box)

## OPEN

### 10 Oct, 20:51Z — re your 20:43Z (box 51778): check (a) PASS; `0121` builds the 4555 line in code, OFF until Misho's text; 0120 held, agreed

- **Read-only check (a), seats 182892 and 182893: PASS.** Each has employer „საცდელ ლოჯისტიკა" (stated), past_role „სანიმუშო ბანკი"
  (stated), and the note „employer: სანიმუშო ბანკი" (mentioned). No past_role for the current job. The 0119 tense fix holds.
- **4555, `0121`:** I agree with the tester; the reply line is now fixed in code. In a run whose save kept a value only as a mentioned
  note, the sentence claiming it was saved is replaced, once, by the server's own line. That is new owner-visible text, so
  `MENTIONED_NOTE_LINE_ON = false` and the exact ka/en/ru/es lines wait for Misho in NIGHT_QUESTIONS BK:
  „ეს ჩავინიშნე როგორც ნახსენები: „{value}“. შენი ნათქვამი უცვლელად დარჩა."
  It can ship OFF at any time (no behaviour change). When Misho says yes, the switch flips in one line.
- **0121 base:** main 4afa05c. On main the save handler still returned directly, so I adapted that hunk, plus one source-text assertion
  in contactFacts.service.test.ts. Verify there: 8,239 tests, green. Branch pushed green.
- **0120 held:** agreed, it restarts real outreach; it waits for Misho, outside quiet hours.

### 10 Oct, 20:39Z — `0120` fix(chorus): the daily campaign job no longer times out (found in the live logs, no board row)

- **Found:** in each of the last deployments the chorus cron logged `openDueCampaigns failed: canceling statement due to statement
  timeout` (19:06Z, 19:53Z, 20:04Z), at 8.1 s on the inviter query. So the job opened no campaign at those runs.
- **Cause:** the query gathered everyone holding each target — every phonebook and old-Ally connection, thousands of accounts — before
  keeping the few active subscribers, then ran three warm-tie checks per row.
- **The fix:** the eligible inviters (active subscriber, not a test seat, not opted out) are taken first, and both UNION branches are
  limited to them. On production, read-only, over the last 25 campaign targets: identical result (same 29 rows, same hash), 1.1 s → 86 ms.
- **DONE WHEN:** after the deploy, the next chorus runs log no `openDueCampaigns failed`, and no `[db failed]` on the inviter query.
- **Also seen, not changed:** once at 19:47Z the name/tag search (`WITH mine … matched AS`) timed out twice in parallel. That is
  `searchContactByName`'s main query, one owner's search. One case in ~3 h of logs is too little to rework it safely. I'll watch it.
- **Base:** main 4afa05c (0119 live). Verify: 8,235 tests. Branch pushed green. **Order:** any time, alone.

### 10 Oct, 20:20Z — re your 20:02Z (box 51682): read-only check done; `0119` fix(facts), 4555 + a second fault the check found

- **The mentioned note, read-only (seats 182796 and 182797):** each has the stated employer „საცდელი ლოჯისტიკა" (live) and a
  `mentioned` note „employer: სანიმუშო ბანკი". 0117 works as meant.
- **A second fault the same check found:** both seats also carry `past_role` „საცდელ ლოჯისტიკა", i.e. the CURRENT job as a past role.
  No tool call wrote it (tool_call_log). The background fact extraction reads the tense from the whole line, and „…ბანკიდან
  წამოვიდა, ახლა …ლოჯისტიკაში მუშაობს" contains „წამოვიდა". Now the tense is read from the clause that names the value; a value found
  in no clause is read alone. The bank stays past, the logistics stays present.
- **4555:** after the web line, the reply said „შევინახე: ბახვა, სამსახური: „სანიმუშო ბანკი"". That save's result now says what
  happened, as data: `kept_as: "mentioned_note"`, `stated_value_unchanged: true`. No prose added. The reply is still the model's
  wording, so the tester should look at it again.
- **DONE WHEN:** (a) on a fresh seat, „X „A-დან" წამოვიდა, ახლა „B-ში" მუშაობს" → no past_role B (read-only check, mine). (b) After the
  web line, the reply does not say the bank was saved as his job, 2 of 2.
- **Not touched:** the two wrong past_role rows already on the test seats stay. They are test data, and deleting is not mine to do.
- **Base:** main f50361d (0118 live). Verify: 8,235 tests. Branch pushed green. **Order:** any time, alone.
- **0118 live:** noted.

### 10 Oct, 19:47Z — re your 19:32Z: `0118` fix(plans), 4522 — a plan with a slip in its JSON is mended, not lost

- **Not a cut-off.** Read-only check of `tool_call_log`: in all 9 „not valid JSON" refusals since 6 Oct, the parse fails in the
  MIDDLE of the text (position 148 of 270, 162 of 271, 377 of 750 …). The one fully visible case (15:30Z) has a lone quote before the
  routes' closing bracket: `… "status": "waiting"}, "], "people_to_involve": …`.
- **The fix:** after a failed parse, four narrow repairs are tried in turn: drop U+FFFD, close a Georgian „ that ended on an ASCII
  quote, drop a lone quote before a bracket, drop a trailing comma. The result is used only if it parses, and then goes through every
  plan check. A truly cut-off plan stays refused as before. Each mend is logged as `[plan] … had a slip … mended`. No new text.
- **DONE WHEN (the board's):** why.sh over 2 days shows no „not valid JSON" reason for propose_task_plan, and `[plan] … mended` lines
  appear in their place.
- **Base:** bare main b9a487c; it also stacks on 0113/0116/0117. Verify: 8,222 tests. Branch pushed green. **Order:** any time, alone.
- **0113/0116:** noted, both wait for Misho's one yes. 0117 shipping: noted.

### 10 Oct, 19:35Z — `0117` fix(facts), 3235 second half: a web claim the owner only relays is mentioned, and never replaces their word

- **Cause (ME-023):** „ინტერნეტში წერია, რომ ბახვა „სანიმუშო ბანკში" მუშაობს" was saved as stated. A core field (employer, occupation,
  city, industry) holds one value per owner, so it overwrote the employer the owner had stated.
- **The fix, no new text:** save_contact_fact saves as `mentioned` when the owner's line relays the web or others (ინტერნეტში
  წერია, ამბობენ, I read online, говорят …). A mentioned value that would replace the owner's own stated row is kept beside it as a
  private note („employer: …"); the stated row stays.
- **DONE WHEN (3235's own):** owner states „ბახვა „საცდელ ლოჯისტიკაში" მუშაობს", then „ინტერნეტში წერია, რომ ბახვა „სანიმუშო ბანკში"
  მუშაობს" → „სად მუშაობს ბახვა?" still gives the logistics job. A read-only check finds the bank only as a `mentioned` note. 2 of 2.
- **Base:** bare main b9a487c (independent of 0113/0116); it also stacks cleanly on them. Verify: 8,227 tests. Branch pushed green.
- **Order:** any time, alone.

### 10 Oct, 19:28Z — `0116` feat(people): the path map searches members only (1849 stage one). Rides with 0113, after it

- **What it closes:** 0113 read the graph's shortest paths and kept only all-member ones. If every shortest path had a non-member in
  the middle, a longer all-member path was never looked for (the known limit written in 0113's FOR_FRONTEND note). 0116 reads the
  middles from the members' own phonebooks instead: the owner's members, the members who saved the target, and up to one member
  between them. Every path it finds can be carried. Blocks, warm steps and ranking are unchanged. Read-only, sends nothing.
- **Timed read-only on production:** the heaviest case (the member with the largest phonebook) took 1.7 s, inside its 8 s timeout.
- **Depends on 0113.** Cut on main b9a487c + 0113 (re-applied cleanly there; a docs-only conflict in ADMIN_WRITE_OPERATIONS, resolved
  by keeping both sections). Verify: 8,235 tests. Branch pushed green.
- **Order:** right after 0113, when Misho says yes to it; both together are the same decision.
- **DONE WHEN:** on fictional seats, an owner → member A → member B → target, where the owner's only shorter route to the target runs
  through a non-member → `GET /paths/:id` shows the A → B map.

### 10 Oct, 18:50Z — re your 18:26Z (box 51481) and 18:27Z: 4489 is a void run; `0115` fixes 4490; 4491 is the model's

- **3235 first half PASS, 0114 live:** noted.
- **4489, NOT a fault in the data path (read-only check):** seat 182793's OWN account name is Bakhva, the void case the tester names
  at the end of the same message. Conv 49270 has no contact called ბახვა, so the model read „ბახვა … წამოვიდა" as the owner speaking
  of himself and kept it as the owner's own note (`save_private_context`, key „ბახვას_სამსახური"). It did not touch another person's
  record. Nothing is in `user_profile_kv` or `profile_dimensions` for that seat. **Proposal:** close 4489 as a seat artifact. If the
  tester wants it tested, re-run on an owner NOT named Bakhva with no contact of that name: the line should then be asked about
  („who is Bakhva?"), not saved.
- **`0115` fix(chat), 4490:** both threads (49281, 49284) ran only search_contact_by_name, and the reply still ended „შევინახე: ბახვა,
  სამუშაო ადგილი: …". When the owner's line is a question and no saving tool ran, the „I saved / noted" sentences come out; the answer
  stays. „შენახულია" (it is saved, true of an earlier save) is left alone. No new text. **DONE WHEN:** „სად მუშაობს ბახვა?" twice →
  the answer only, no „შევინახე", 2 of 2.
- **4491 (asked back „where does he work now?", 1 of 2):** that is the model choosing a follow-up question. Nothing server-side wrote it.
  I'm not changing it unless it repeats.
- **Base:** main 77df5fa (0114 live); also applies alone. Verify: 8,218 tests. Branch pushed green. **Order:** alone, before or after 0113.

### 10 Oct, 18:15Z — re your 18:04Z (box 51448): `0114` fix(chat), 4456. 4357 and 4390 noted

- **4357, 4390:** TESTED, noted.
- **4456, cause:** the fact check holds a quality word („სანდო", „საიმედო", reliable …) back from the QUESTION. It never looked at the
  owner's own reply. In conv 49204 the question was clean and the owner's „sent" line said „სანდო ნოტარიუსს".
- **The fix:** after a run whose question went, a quality word the owner never wrote in this conversation is taken out of the reply.
  It is the same test the question passes. The owner's lines are read only when such a word is in the reply. No new text.
- **4423's family:** I can't see 4423 from here. If it is „a word the owner did not say, added by the assistant", yes.
- **DONE WHEN:** the 4357 recipe again („ჰკითხე ნიკას, ხომ არ იცნობს ნოტარიუსს.") → the owner's line has no „სანდო", 2 of 2. An owner who
  typed „სანდო ნოტარიუსი" keeps the word.
- **Base:** main 7e43eb5 + 0113; also applies alone on bare 7e43eb5. Verify: 8,227 tests. Branch pushed green.
- **Order:** independent of 0113. It can ship before it, alone.

### 10 Oct, 17:21Z — `0113` feat(people): the frontend's item 9 — the member card and the path map (1849 stage one, §127). Also: FOR_TESTERS relayed

- **Misho, in this chat (§127):** „ფრონტის დავალებები დააპრიორიტეტე". Then, asked two questions: „კი, ეტაპებად" (1849 in stages) and
  „ფრონტის სია" (the member card as the frontend listed it).
- **What 0113 adds, read-only, nothing is sent:**
  - `GET /members/:id`: name, role, company, city, areas, open_to (the member's own saved offers). Work hides under
    `hideUserWorkInfo`, areas and offers under `hideUserTags`.
  - `GET /paths/:id`: up to 3 maps, each up to five people (owner, ≤3 members in the middle, target). Every middle person is a member;
    blocks are checked at every step, both directions; fewest steps first, then most warm steps.
  - Both are keyed by the sealed id `GET /contacts` already returns.
- The relay along the chain (stage two) is NOT in this patch. It comes behind its own switch, on Misho's word.
- **DONE WHEN, read by the tester on fictional seats:**
  1. `GET /members/<id of a member contact>` shows the card; with that member's work hidden, `role` and `company` are null.
  2. `GET /paths/<id of a contact two members away>` shows a map you → member → member → target, the first member `next`.
  3. A non-member in the middle gives no map.
  4. A block between any two people on the path gives no map.
- **Checked:** the step SQL was EXPLAINed read-only on production (valid). Verify on main 7e43eb5: 8,223 tests. Branch pushed green.
- **Order:** after 0112, alone. It adds two routers in index.ts (`/members`, `/paths`).
- **Also done:** the frontend's 14:55Z ask — `docs/FOR_TESTERS.md` (the new-design walkthrough Misho asked for) is relayed to the
  testers' box as 51388.

### 10 Oct, 17:00Z — `0112` fix(facts), 3235: a job the owner says ended is kept as past_role

- **Cause:** after „ბახვა „სანიმუშო ბანკიდან" წამოვიდა, ახლა „საცდელ ლოჯისტიკაში" მუშაობს." the model calls correct_contact_fact
  on the bank. That retracts the row and writes a veto (3103), so „who used to work at the bank?" can no longer name him.
- **The fix:** when the owner's own line says the job ended (წამოვიდა, აღარ მუშაობს, left, больше не работает …) and the
  correction is of a job field, the present row goes and the same value is saved as past_role. No veto is written. Any other correction
  is as before. No new text.
- **DONE WHEN** (ME-024): after that line, „ვინ მყავს „სანიმუშო ბანკში" ნამუშევარი?" names him as a former employee, and
  „სად მუშაობს ბახვა?" gives only the logistics job. 2 of 2.
- **Not in this patch:** 3235's second half („a web claim the owner only reports is saved as mentioned").
- **Base:** main 7074ceb + 0110, 0111; also applies alone on bare 7074ceb. Verify: 8,208 tests. Branch pushed green.
- **Order:** after 0111, alone.

### 10 Oct, 16:45Z — re your 16:23Z (box 51286): `0111` fix(contacts), 4390 — saved_as on the contact page

- **Cause:** 0100 added `saved_as` to the list row only. `GET /contacts/:id` kept its own name rule, so a „💙" contact had `name: null`
  and nothing else. The page now uses the list's own two helpers, so both read the same.
- **DONE WHEN:** seat 182562, `GET /contacts/:id` for the heart contact → `name: null`, `saved_as: "💙"`. The same call for a named
  contact → `saved_as: null`. The FOR_FRONTEND note rides in the same patch.
- **Which board number 0100 closes:** 0100 had no row of its own. It was the small fault on D772 (box 51023, §126). With 0111, 4390 closes
  the page half; 0100's list half can be recorded against 4390 too.
- **Base:** main 7074ceb + 0110; also applies alone on bare 7074ceb. Verify there: 8,201 tests. Branch pushed green.
- **Order:** after 0110, alone.

### 10 Oct, 15:52Z — re your 15:42Z and 15:43Z: `0110` fix(asks), 4357. 3670 and 3763 noted

- **3670:** 5 of 5 noted; 3037 closed as its duplicate is right. My read-only check after the tester's plans: no ask since eda040b
  carries a singular „friend" the owner never said (the check held back the 3 the tester saw). **3763:** 2 of 2 noted.
- **4357, cause (conv 49179):**
  1. The goal's first plan wrote to nobody (only a web route). D626 saves such a plan as a draft with no card and no question, so the
     owner's first „კარგი, გააგრძელე." had nothing to approve. That part is by design.
  2. The owner then typed „ჰკითხე ნიკას". A waiting draft refuses every ask except to the person the owner's own line names (D316).
     That match needs the whole phonebook label in the line, and the label is „ნიკა ხელოსანი", so it refused. The model then asked
     „მივწერო?" and later proposed a second plan. Yes number two and yes number three followed.
- **The fix:** when no whole label is in the line, a first name it names (any case ending: ნიკას, ნიკამ, ნიკასთან) counts, but only if
  exactly one of the owner's contacts has a label starting with that name, and it is this person. Two Nikas still name nobody. No new text.
- **Not changed, Misho's call if wanted:** an invisible „writes to nobody" draft still gates the asks the owner did not name; only a
  plan that names them, with its card, opens those (D626).
- **DONE WHEN:** a fresh goal whose plan writes to nobody, then „ჰკითხე <first name>ს" for a contact saved under first name + another
  word → the question goes on that line with no further yes, 2 of 2.
- **Base:** main 7074ceb (the queue is empty). Verify there: 8,200 tests. Branch pushed green.

### 10 Oct, 15:39Z — re your 15:13Z and 15:22Z: 3670 read-only check so far

- Since 0108 went live (15:12Z): 5 asks, 0 with a singular „friend", so 0 invented. That is too few to count; I will read again after the
  tester's 5 plans. 0109 live: noted.

### 10 Oct, 15:14Z — `0109` fix(answers), 3763: the helper's surname travels with the answer

- **Cause:** in ask 18052 the helper typed „კი, ზაზა გამოგონილი, ვაკეში მუშაობს". The answer their assistant stored for the owner read
  „ზაზას იცნობს". The D648 facts check holds a surname only by its ending, and -ილი (the test seats' „გამოგონილი"), -ური and -ული were
  not on the list. Now they are, so the helper's run gets the existing „include exactly: …" refusal and rewrites. No new text.
- **DONE WHEN:** a helper answering „კი, <first name> გამოგონილი, …" → the owner's relay and card carry both names, 2 of 2.
- **Base:** main 86be0e3 + 0108; also applies alone on bare 86be0e3. Verify there: 8,194 tests. Branch pushed green.
- **Order:** after 0108, alone.

### 10 Oct, 15:04Z — `0108` fix(asks), 3037 / 3670: a friend the owner never named is held back in every case ending

- **Still live before this:** of the 5 asks in the last 2 days that mention a friend, 3 named one that neither the owner's lines nor the goal
  did: 17039 (8 Oct, day one, „მეგობარს ესაჭიროება"), 17722 (9 Oct, day one, „ჩემმა მეგობარმა" for an owner who wrote „I am starting"),
  18252 (9 Oct, chat, „მეგობარს ეზო აქვს"). All three came from the model's ask_contact. The existing fact-keeping check (#100) knew
  only „მეგობრისთვის" and „მეგობარს სჭირდება/უნდა/ეძებს".
- **The fix:** every singular case of „friend" counts. The plural („შენს მეგობრებში", among your friends) is how a question is asked,
  and still passes. The model gets the same refusal as before and rewrites. No new text.
- **DONE WHEN** (the board's own): 5 fresh approved plans (goal sentence + „კარგი, გააგრძელე.") whose helper questions name no
  person and no reason the owner did not say. Read-only check afterwards: `task_asks` since the deploy with „მეგობ" in the
  question, and the owner never said it → 0.
- **Base:** cut on main 86be0e3 (the queue is empty). Verify there: 8,192 tests. Branch pushed green.

### 10 Oct, 14:43Z — re your 14:39Z (box 51110): where 958's seconds go, and which clock

- **0103 PASS:** noted.
- **The server's part, measured:** one of the tester's „მადლობა" turns (14:36:11.767 stored, answer stored 14:36:16.378, 4.6 s):
  - ~0.3 s before the run starts;
  - 1.4 s to the model call (prompt ready at 0.95 s);
  - Claude ~1 s;
  - the GPT Georgian writer ~2 s after it.

  So the 3.0–4.6 s the tester read from the stored timestamps is all server time.
- **The rest is the tester's client, not the app.** The app does not poll for the answer. It holds the SSE stream `GET /threads/stream`
  (src/app/chat/layout.tsx), which pushes the answer as it is written. A send-to-answer time measured with API calls also includes how
  often the tester's harness checks, so the 1–3.5 s gap is that harness. I can't measure the app's own screen time from here.
- **Which clock:** I agree it is the person's, send to screen. The fair measurement is in the app on a phone, or with the tester
  listening on `/threads/stream` instead of polling. By the server clock, 958 meets 5 s on 6 of 6.
- **If it is still over 5 s on a phone:** the biggest remaining piece is the ~2 s GPT writer that rewrites Claude's small-talk answer in
  its Georgian voice. Skipping it for listed small talk would bring the server to about 2.5 s, but it changes whose voice answers.
  That is Misho's decision, so I am not doing it on my own.
- **958:** stays being_tested until the phone measurement.

### 10 Oct, 14:40Z — `0107` docs(frontend): a reply to the frontend's 14:35Z, docs only

- The frontend built X-App-Build, the weekly summaries, `lastTopUp` and `saved_as` against mocks, believing 0094–0096 and 0100 not live.
  The note tells them those are live, and that 0105 makes the build count on every route. Docs only, no code.
- **Order:** any time; it fits best after 0105. It applies alone on bare 77fa70a.

### 10 Oct, 14:33Z — re your 14:25Z and 14:32Z: 0102 measured live

- In deployment dbfe74c1 (a7d66c6), 14 `[timing]` lines: the prompt is ready at 1.6–2.7 s (one at 3.7 s and one at 4.2 s), against 2.9–4.7 s
  before. „goal" equals „thread" in every line: the ~1 s jumps are gone. No `[db]` warning lines. 958 can go to the tester for the
  5-second check on „როგორ ხარ" / „მადლობა".

### 10 Oct, 14:31Z — re your 14:20Z (box 51106): `0106` fix(lists), 4324 and 4325

- **Cause, both halves:** the helper the owner asked for a notary and a photographer was one of his three electricians. The row's state
  comes from the goal's ask to the row's own contact, matched by number. So his answer about other rows landed on the electrician row.
  And `work_the_list` gave the run one way in per row, so the chat named only one electrician.
- **4324:** a found row whose answer names other rows of the list, and not itself, keeps „გზა ნაპოვნია" and an empty answer cell. The
  answer stays on the rows it names (rows 3 and 8 were already right). An answer that is about its own row stays. **DONE WHEN:** the same
  re-run's Excel row 1 reads „გზა ნაპოვნია" with all 3 electricians and no answer; rows 3 and 8 are unchanged.
- **4325:** each found row the run reads now also carries `everyoneWhoFits` (the same lookup the Excel uses) when more than one contact
  fits. **DONE WHEN:** the chat reply before the plan names all three electricians as people the owner already has.
- **Base:** main 77fa70a + 0093, 0097–0105; also applies alone on bare 77fa70a. Verify there: 8,186 tests. Branch pushed green.
- **Order:** after 0105, alone.

### 10 Oct, 14:22Z — re your 14:08Z (box 51104): `0104` 4292 and `0105` 4298 fixed. 4294 noted

- **`0104` fix(admin), 4292.** The population sentence no longer carries „(hasAccessToAlly)" or „test_seats-ში"; the same facts in words
  („დარეგისტრირდა" through Netai, „არ არის სატესტო ანგარიშების სიაში"). Labels on the page are the admin page's own, not the server's.
  **DONE WHEN:** `GET` of the pilot report has no Latin code word in `population` or `payment_rule` (Stripe and Netai are names).
- **`0105` fix(admin), 4298. Two causes:**
  1. The device was recorded only by the /threads and /contacts routers. Now it runs once, app-wide, before every router.
  2. It also needs `X-Device-Id`: a device row is keyed by it, and the app sends it on every request (src/lib/deviceId.ts). The tester's
     request should carry both headers.

  Each device is written at most once a minute per build; a new build is written at once. **DONE WHEN:** a seat request to any signed-in
  route with `X-Device-Id` and `X-App-Build: 1.2.3-test15` makes `GET /admin/app-builds` show a `1.2.3-test15` row (1 person, 1 device).
- **4294:** server half PASS noted; the screen is the app's.
- **Base:** cut on main 77fa70a + 0093, 0097–0103; both also apply alone on bare 77fa70a. Verify there: 8,183 tests. Branch pushed green.
- **Order:** after 0103, each alone.

### 10 Oct, 14:06Z — `0102` perf(db), 958 (small-talk latency) and `0103` fix(chat), the weather (re your 13:51Z)

- **`0102` perf(db), 958.** Every step of a chat turn's timing is a multiple of ~145 ms, one round trip to the database. Three cuts:
  - pg closed idle connections after 10 s, so a turn after a short pause reopened them (TCP, TLS, auth: about 6 round trips, ~0.9 s).
    The database counted 10–25 new sessions a minute (`pg_stat_database.sessions`, read-only). Idle connections are now kept 5 minutes,
    with TCP keepalive. `max_connections` is 2091; the three pools stay capped at 10 + 10 + 2.
  - A query with its own timeout waited one more round trip for the SET that restores the default. It now returns as soon as its rows
    arrive; the connection still goes back to the pool only after the restore.
  - Small talk is checked before the „discuss first" history read (the answer is „no goal" either way).
  - Also: the pools had no `error` listener, so a dropped idle connection would have ended the process. Now it is logged as
    `[db] idle connection dropped`.
  - **DONE WHEN:** in the `[timing]` lines after deploy, „როგორ ხარ" / „მადლობა" turns show goal ≈ thread (no ~1 s jump), and the totals
    are 5 s or less. Watch for `[db] idle connection dropped` or `[db] default timeout not restored`; a few are fine, a stream is not.
- **`0103` fix(chat), the weather.** Not by design. The code meant the weather to be looked up, but in conv 49108 no tool was called
  (`tool_call_log` has no rows for thread 49108). Now a short weather question (≤ 60 chars, a question, no need stated) makes the first
  model call use `web_search`. No prompt text changed. **DONE WHEN:** „რა ამინდია დღეს თბილისში?" on a fresh seat gets the actual
  weather, and `tool_call_log` shows one `web_search` for that thread.
- **Base:** both cut on main 77fa70a + 0093, 0097–0101; each also applies alone on bare 77fa70a. Verify there: 8,168 and 8,176 tests.
  Branch pushed green.
- **Order:** 0102 then 0103, each alone, after 0101.

### 10 Oct, 13:47Z — `0101` fix(plans), 1454: a plan reply that only justified the match gets the server's plan sentence

- **What the fault was:** an introduction plan sometimes came back as a paragraph on why the person fits ("X uses Netai, the bridge, the
  second circle …"), with no plan sentence. The old strip removed only some of those lines, so the plan itself never reached the owner.
- **The fix:** `planJustification.ts` now also reads the "member of Netai" and "bridge / second circle" lines (ka, en, ru, es). After the strip,
  `withPlanSentence` puts the server's own plan sentence in when the reply no longer carries one, then the closing question is added as before.
  No new user-visible text: the sentence is the plan text the server already builds.
- **Base:** cut on main 77fa70a + 0093, 0097, 0098, 0099, 0100. It also applies alone on bare 77fa70a (checked with `git am`). Verify
  passed there: 8,159 tests. The branch was pushed green.
- **DONE WHEN:** 3 introduction plans in a row reach the owner as only the one plan sentence plus „დავიწყო?", with no fit paragraph.
- **Order:** after 0100, alone.

### 10 Oct, 13:27Z — re your 13:30Z (box 51086): 3500's runs were greetings, which never carry the day's question. My recipe was wrong

- **Why there is no log row:** „გამარჯობა, როგორ ხარ" takes the greeting fast path (D617/D622). The server answers it at once, before any
  prompt is built, so the day's question is never computed and nothing is handed on or spent. I checked this: `isBareGreeting` is true
  for that line. My 50955 recipe said to use it, and that was my mistake.
- **0089 itself:** both seats have „💙" and a named contact, each with one tag, so both are candidates. With 0089 the day's path skips
  „💙" and hands on the named one.
- **The test, corrected:** a fresh seat with the same two contacts, then a first line that is not a greeting or thanks, for example „რა
  შეგიძლია გააკეთო ჩემთვის?" or „რა ამინდია დღეს თბილისში?" (both false for greeting and small talk). The day's question should ride on
  that reply, about the named contact only, and one `curiosity_surfacing_log` row should appear.
- **0093:** understood, it waits for Misho. I'm asking him too.

### 10 Oct, 13:23Z — re your 12:48Z (box 51023): `0100` for the „💙" row; 0073's line confirmed read-only

- **(1) `0100` fix(contacts).** A row whose label has no letter now carries `saved_as: "💙"` beside `name: null`, so the screen can draw the
  label instead of a blank. The FOR_FRONTEND note rides in the same patch. **DONE WHEN:** seat 182562's list shows the heart contact with
  `saved_as: "💙"`.
- **(2) 0073 confirmed read-only.** Seat 182606, goal 24157, update 31354 („found", held):
  - title: the goal's own title, „მჭირდება კარგი ბუღალტერი თბილისში";
  - detail: its summary, „ბუღალტერი მოიძებნა: თეა ტესტაძე".
  - `lines[0]` and the card in `GET /updates` both come from the same `cardHeading()` call on this row, so the line is that title,
    „ — ", then that detail. That is what the tester read. 0073 can be marked tested.
- **Order:** 0100 after 0099.

### 10 Oct, 13:19Z — `0093`–`0099`: plate rows NEW-1..NEW-7 (4292–4298), six of the seven

All are in `patches/afternoon-1250/`, after 0092. They were cut on main 9e02565 + 0089–0092 and passed verify there (8,156 tests). The
branch was pushed green.
- **`0093` fix(cron), 4295.**
  - **Cause:** both timers waited their whole interval before the first run: the trial downgrade 5 h, and the daily warm-tie questions
    / stale sweep / push prune 24 h. The server deploys far more often, so a restart always came first.
  - **Fix:** each now also runs once 2 min and 15 min after start. All are idempotent, and the warm-tie cooldown lives in its query.
  - **Effect on deploy:** read today, 0 accounts are past their trial or period end, so nobody is downgraded. Warm-tie questions start
    reaching people whose warm pool is thin, as designed, at most once per cooldown.
  - **DONE WHEN:** `[subscription-cron] downgraded 0 …` appears ~2 min after the deploy, and a `[chorus-cron]` warm-tie or sweep line
    ~15 min after.
- **`0094` feat(updates), 4296.** `GET /updates/weekly-summaries` returns the person's past summaries, newest first, read-only. **DONE
  WHEN:** a seat that had last week's summary reads it again with the same content.
- **`0095` feat(billing), 4294.** `GET /billing/tokens` gains `lastTopUp { amount, at, kind }`. **DONE WHEN:** after a top-up, the
  wallet shows its amount and date.
- **`0096` feat(admin), 4298.**
  - **Migration 235:** `device_fingerprints.app_build`, filled from the app's `X-App-Build` header.
  - **`GET /admin/app-builds`:** people and devices per build over 7 days.
  - Until the frontend sends the header, everyone shows as a null build. I asked them in 0099.
- **`0097` fix(admin), 4292.** The pilot report's two rule sentences are in Georgian. The page's labels already were.
- **`0098` fix(db), 4293.**
  - **New file `000_legacy_ally_base.sql`:** the 12 old Ally tables the code uses, plus `contact_insights` in its post-016 shape. It was
    generated from production's catalogue, and every statement is guarded.
  - **Checked on an empty Postgres 16:** the server's own runner applied all 238 migrations in one transaction. Re-running the file on
    a full database left the object count unchanged.
  - **On production** it runs once, as a new filename, and changes nothing.
  - **DONE WHEN:** your next deploy logs `[migrate] applying: 000_legacy_ally_base.sql` and nothing else changes.
- **`0099` docs(frontend):** the three additions above, and the `X-App-Build` ask.
- **Not in this batch:** 4297 („the new plan and search rules are not live"). I don't know which rules the plate means. If the tester
  can name them (a decision number or a box id), I'll check them.
- **Order:** 0093–0099, each alone, any time after 0092. 0096 and 0098 carry migrations.

### 10 Oct, 12:40Z — `0092` (docs only: FOR_FRONTEND says setup and the test push are live)

**`0092` docs(frontend).** A note only, with no code. The frontend built `/setup` against a mock and doesn't know 0080 and 0088 are live,
or that the test push is on. Ship whenever you like.

### 10 Oct, 12:33Z — re your 12:30Z (box 51019): yes, the fixture needs an open goal. `0091` makes it say so

- **Why it stayed out of `due`:** goal 24125 is stopped (`closed`), and a closed goal's „found" update is never due, which is right for
  real people. The row exists (31351, release_at 12:27:05Z), but it can never be shown.
- **`0091` fix(admin):** the fixture now refuses a closed goal with 400 instead of writing a row nobody will see. It's a one-line SQL
  condition, verified on the main line.
- **For the tester:** run it on an **open** goal of the seat, then read `/updates/count` and `GET /updates`.
- **0083:** it is live as 2958608 (11:40Z), per your 12:01Z.
- **Order:** 0091 any time, after 0090.

### 10 Oct, 12:29Z — re your 12:17Z (box 50986) and 11:52Z: `0089` (3500), `0090` (BE / lists); 1687's introduction requests

Both are in `patches/afternoon-1250/`, after 0088, cut on main be45456 + 0088. They passed verify there (8,143 tests).
- **`0089` fix(curiosity), 3500.**
  - Seat 182602: the day's question **was** handed on at 12:07:25 (the surfacing log has it). It went to the queue's first pick, the
    contact „💙". The section rightly refuses a label with no letter, so the reply asked nothing, and the day was spent. The named
    neighbour behind „💙" never came up.
  - Now the day's path looks through the first five and hands on the first contact with a readable name. If none has one, nothing is
    spent.
  - **DONE WHEN:** a fresh seat with „💙" and one named contact gets the day's question about the named one on its first plain turn, 2
    of 2.
- **`0090` fix(lists), BE / 3897, goal 24125.** BE's „see the helper" cells existed only for a file with a need column; needs12.csv has
  none (its rows *are* the needs). On such a list:
  - a found row names **every** owner's contact who fits it (the three electricians, not only Nodar);
  - a no-route row named in a helper's answer on this goal (by stem, so „ნოტარიუსს" names the notary row) reads „იხ. დამხმარე",
    with that helper in „through whom" and that answer in the answer cell.
  - A file with a need column works as before.
  - **DONE WHEN:** the tester's 50986 run gives an Excel with three electricians on row 1, and „იხ. დამხმარე" plus the helper's answer
    on the notary and photographer rows.
  - **Not in it:** the chat reply naming one electrician. That is the model's reading of the list status, and I'll look at it
    separately if it matters once the file is right.
- **1687, introduction requests (your 11:52Z):** not a fault in my reading.
  - A request opens with the assistant naming itself, by design: „**X-ის ასისტენტი** გთხოვს…" (D648: the request is the assistant's).
  - The closing line was specified for asks; on a request it would say the same thing twice.
  - If Misho or the founder wants the same closing line under requests too, that is a wording change to approved text, and it waits
    for their word. Board 1687 can stay tested on the ask path.
- **Order:** 0089 and 0090, each alone, after 0088.

### 10 Oct, 12:19Z — `0088`: D772 + D773 + BI, on Misho's yes in MY chat (§126). D771's exact text goes back to him

**Misho in the code session's chat, ~12:10Z:** „ორივეზე კის გეუბნები". That answers the two items I put to him at ~11:55Z: (1) D772 + D773,
and (2) D771 + BI. Recorded as §126, inside 0088.
- **`0088` feat(contacts, setup).** In `patches/afternoon-1250/`, cut on main be45456. Passed verify there (8,140 tests).
  - **D772:** `GET /contacts` rows carry `phone` (`+digits`). The person's own phonebook only, and the row id stays the sealed
    reference.
  - **D773:** `GET /contacts/:id` carries `public_facts`: the `public_research` rows (the §119 load), not retracted, with `source_url` and
    `fact_date`. Never another member's saved facts.
  - **BI:** `TEST_PUSH_ON = true`, so the first test push can reach a real phone, sent only when the person taps it in setup. 3 a minute
    at most.
- **D771 is not built.** Its instruction is model-facing, so I drafted the exact text (NIGHT_QUESTIONS BJ, in 0088) and asked Misho for
  his yes on those words.
- **§ numbering:** §125 lives in 0072, which you still hold, so main jumps from §124 to §126 until 0072 ships. That is harmless. If
  0072 conflicts on that hunk, keep both §s.
- **DONE WHEN:**
  - a seat's `GET /contacts` shows its own contacts' full numbers;
  - a contact with Axel facts shows them under `public_facts` with a source, and a contact with only another seat's saved fact shows
    nothing there;
  - a seat with a push subscription gets „შეტყობინებები მუშაობს…" from `POST /setup/test-push`.
- **Order:** any time. Misho's yes is in my chat; if your rule needs it in yours too, please ask him there.

### 10 Oct, 11:30Z — `0086`–`0087`: BE's Excel fault (50656) root-caused and fixed, BE back on

Both are in `patches/afternoon-1250/`, after 0085. They were cut on main 803df8b + 0081–0085 and passed verify there (8,123 tests).
- **`0086` fix(lists), 50656 / 3897.** `needs12.csv`'s header is „სახელი, პროფესია", and the „სახელი" column holds 1–12.
  - A header that names the name column won outright, so every row was called „1"…„12" (list_items of goal 24091 read so). The owner's
    five electricians were never found, all 12 rows went `no_route`, and the Excel said „nobody" and nothing else.
  - Now the header wins only over a column that is not a count. Otherwise the first non-count column names the rows.
  - **DONE WHEN:** the same file on a fresh goal names its rows by profession, the electrician row finds the owner's electricians, and
    no row is called by a number.
- **`0087` feat(lists): BE on again** on Misho's existing yes (§124). The see-the-helper cells were right; the rows had no names to find a
  helper by.
  - **DONE WHEN:** the tester's 50656 re-run shows „იხ. დამხმარე" on a row whose way in is nobody while the need column names a contact.
- **Not in these:** two of 50656's side notes. The helper's answer was passed on with a clause the helper never said (3670's family),
  and one ask had broken Georgian („…-ს ეძებება"). Both stay with their board rows.
- **Order:** 0086 then 0087, each alone, after 0085.

### 10 Oct, 11:28Z — a correction to my own clock: my last headings were stamped wrong

My sections stamped „11:45Z" and „12:55Z", and FOR_FRONTEND's „11:10Z" and „11:45Z", were written at about 10:55Z, 11:05Z and 11:20Z. The
content is right; only the stamps are off. From here I read the clock before I write a heading.

### 10 Oct, 12:55Z — re your 11:00Z: 4291 root-caused and fixed (`0081`), BD back on (`0082`), `0083`–`0085`, and your four questions

All five are in `patches/afternoon-1250/`. They were cut on **current main** (after your revert 27f7263 and 0079), so they apply in order
after 0080. They passed verify there (8,122 tests). The branch was pushed green.

- **`0081` fix(asks), board 4291.**
  - **The 08:31:09 refusal (goal 24061) was the full-wave cap (A2, #1685), not BD.** The log says „refused — the open wave is full".
  - The owner's named person should pass that cap (D625), but the server did not recognise Dato in „დათო ელექტრიკოს**საც** ჰკითხე". The
    declined-name match knew the case endings (-ს, -მა, -ის) but not the „also" particle that rides on them (-საც, -მაც, -ისაც).
  - Now the particle, and only it, may follow an ending. An old test held „მძღოლსაც" as nobody; that was this bug, and it is corrected.
  - **DONE WHEN:** the tester's same line in a full wave sends to Dato.
- **`0082` feat(asks): BD on again**, on Misho's existing yes (§123), with its tests restored. The revert didn't touch the cause, since
  the order gate never refused Dato. **BE stays off.** 50656's Excel fault (rows 2–12 empty, row 1 „nobody" with 5 electricians) is its
  own fault, and it overlaps 3897. I'm on it next.
- **`0083` fix(match), 1699's „hospitality".** A field word the trade list knows is said in the reader's script („სტუმართმასპინძლობა").
  Any other word stays as saved. The cards' own wording is unchanged. **DONE WHEN:** card 1 and card 2 to a Georgian reader hold no
  English field word.
- **`0084` feat(admin), question 4.** `POST /admin/test-accounts/:id/fixtures/due-update { "goal_id": <the seat's own goal>, "summary":
  "…" }` queues one „found" update, due now. It works for a test seat's own goal only; anything else gives 400 or 403. **DONE WHEN:** after
  it, `/updates/count` shows `lines[0]` equal to the first card of `GET /updates`.
- **`0085` fix(curiosity), 3500, and why the tester saw no day question.** Seat 182562, first run at 09:51:28: the queue build took longer
  than its 6 s budget („gave up after 6000ms"), so the run went without the question. The abandoned build kept going and wrote the
  „surfaced" mark at 09:52:39. That spent the day's one question on nothing, and the second run had none to ask. Now the day's path logs
  only the item it actually hands on. **DONE WHEN:** on a fresh seat, a run that misses the budget leaves no `curiosity_surfacing_log`
  row, and a later run that day asks the question.
  - Separately, a 61 s queue build on a seat with two contacts is slow. I'll look at which tier, but it is not this fix.

**Your four questions:**
1. **1699, card 2:** it went at **08:48:22**, three seconds after A's yes. It is in B's (181341) **existing conversation 47653**, „აჭარის
   სასტუმროებში კონსულტაცია", as its last message, with the two buttons. It does not open a new conversation, and it is not on
   `/updates`, so B's updates count 0 is right. Match 1 is `need_yes`. B can tap now.
2. **3500, how the day question starts:**
   - It needs the owner's own run in a regular conversation with **no goal**. Preview runs don't count. The owner's line must not be
     about themselves, a death, or „what's waiting".
   - It comes once a day per person.
   - It needs a contact with a readable name and a missing core fact.
   - It sits inside a 6 s budget. With 0085, a miss no longer burns the day.
   - To test: a fresh seat, two contacts („💙" and one named), a plain chat such as „გამარჯობა, როგორ ხარ?". The question rides on the
     reply, about the named contact only.
3. **1687, which form is designed:** the question first, and the identical line **closing** the ask, as its own last paragraph
   (§110.8). The opening assistant line appears only when the ask carries roster news. This morning's asks 19076/19077 (08:55Z) do end
   with „Netai Test 15-wave-ის ასისტენტი, Netai Test 15-wave-ის სახელით". If the tester saw asks without it, please give me the ask ids.
4. **0073, a due card:** 0084 above.

**Order:** 0081, 0082 (together or 0081 first), 0083, 0084, 0085, each alone. 0080 can go anywhere before them.

### 10 Oct, 11:50Z — `0080` (1882 / frontend item 10: setup state per gadget, test push OFF, admin funnel). It carries migration 234

**`0080` feat(setup).** In `patches/afternoon-1250/`, after 0079. Passed verify on the main line (8,128 tests).
- **What it adds:**
  - **Migration 234:** `setup_steps (user_id, device_id, gadget, step, status, updated_at)`, PK `(user_id, device_id, step)`.
  - **A new router `/setup`:** `GET /setup/state`, `PUT /setup/devices/:id/steps/:step` and `POST /setup/test-push`. It needs a login
    but no subscription.
  - **`GET /admin/setup-funnel`.**
- **Nothing is sent:** `TEST_PUSH_ON` is false, so the test push answers 403. Its line waits for Misho's yes (BI).
- **DONE WHEN:**
  - a seat PUTs `install` done from one device id, and GET shows it under that device with `done_count` counting it once;
  - a seat with contacts imported shows `server.contacts: true` with no tap;
  - an unknown step or gadget gives 400, and the test push gives 403;
  - the funnel counts the seat under its gadget.
- **Order:** any time.

### 10 Oct, 11:15Z — `0079` (frontend list item 4: the contacts list and a contact's page)

**`0079` feat(contacts).** In `patches/afternoon-1250/`, after 0078. Passed verify on the main line (8,112 tests). Misho told me to finish
everything the frontend needs. Tornike's question went into the box at 10:40Z (50854).
- **What it adds:** `GET /contacts?q=&limit=&cursor=` and `GET /contacts/:id`. Both are read-only over the person's own rows. No
  migration and no new text.
  - **The list:** the saved name and an `on_netai` flag. The id is the connector's sealed per-user reference, so no number appears
    anywhere (D149).
  - **The page:** the person's own labels, facts and exclusions, plus warmth (confirmed tie warm, red distant, else neutral).
  - **Never shown:** the contact's topic boundary (D421).
- **DONE WHEN:**
  - a seat lists its contacts by name, `q` narrows the list, and `next_cursor` pages through;
  - one contact's page shows that seat's own labels and facts only;
  - another seat's id gives 404, and `limit=500` gives 400;
  - no response anywhere holds a phone number.
- **Order:** any time.

### 10 Oct, 09:45Z — `0078` (docs only: FOR_FRONTEND says 0074 and 0076 are live)

**`0078` docs(frontend).** A FOR_FRONTEND note only, with no code. It can ship whenever you like. Noted from your 09:33Z: 0074–0077 are live.

### 10 Oct, 09:25Z — `0077` (docs only: FOR_FRONTEND says 0069 and 0073 are live)

**`0077` docs(frontend).** A FOR_FRONTEND note only, with no code. Ship it after 0076 (your pipeline deploys on docs). The frontend reads
main only, so this is how they learn their two pickers can go live.

### 10 Oct, 09:20Z — `0076` (frontend list item 8: the connector state)

**`0076` feat(connector).** In `patches/afternoon-1250/`, after 0075. Passed verify on the main line (8,100 tests).
- **What it adds:** a new router, `GET /connector/state` → `{ connected, last_seen_at }`, read from `oauth_tokens`.
- **Effect:** read-only, with no new text and no migration. No token is read out.
- **DONE WHEN:** a seat with a live Claude connector reads `connected: true` and a recent `last_seen_at`. A seat that never connected reads
  `false` / `null`.
- **Order:** after 0074, after 09:15Z.

### 10 Oct, 09:00Z — `0075` (docs only: FOR_FRONTEND says what is live)

**`0075` docs(frontend).** A FOR_FRONTEND note only, with no code: `plans`, the routes board and `role` are live, and 0069, 0073 and 0074 are
queued. The frontend reads main only, so this needs to reach main. It is safe at any time, the 08:50–09:15Z window included, since it is
not a code deploy (if your pipeline deploys on docs, after 09:15Z).

### 10 Oct, 08:55Z — `0074` (frontend list item 7: the contact sync page). It carries migration 233

**`0074` feat(contacts).** In `patches/afternoon-1250/`, after 0073. Passed verify on the main line (8,093 tests).
- **What it adds:** `GET` and `PUT /contacts/import-state`.
  - The GET reads migration 106's import record: the last import that brought contacts, its count, and the numbers held now.
  - **Migration 233** adds `"User".contact_import_reminder BOOLEAN NOT NULL DEFAULT FALSE`, the person's own switch.
- **Nothing is sent:** the monthly reminder push is not built. Its text goes to Misho first. No new text is shown anywhere.
- **DONE WHEN:** a seat that imported reads its last date and count, and a seat that never imported reads null and 0. PUT true then GET
  gives `monthly_reminder: true`, and PUT "yes" gives 400.
- **Order:** any time after 0073, outside 08:50–09:15Z.

### 10 Oct, 08:30Z — `0073` (frontend list item 5: three story lines on `/updates/count`)

**`0073` feat(updates).** In `patches/afternoon-1250/`, after 0072. Passed verify on the main line (8,084 tests).
- **What it adds:** `GET /updates/count` gains `lines`, at most 3 strings. Each is the first due update's existing card title and detail.
- **Read-only:** a SELECT with the count's own conditions. Nothing is released or marked seen. No new wording.
- **DONE WHEN:** a seat with due updates gets `lines` that match the first cards of `GET /updates`, and the count's `due` is unchanged
  after the call. A seat with nothing due gets `lines: []`.
- **Order:** any time after 0072, outside 08:50–09:15Z.

### 10 Oct, 07:58Z — `0070`–`0072`: 4258 (false „introduction sent"), 1699 (matcher run on seats), and §125

In `patches/afternoon-1250/`, after 0069. All three passed verify on the main line (8,081 tests). The branch was pushed green.
- **`0070` fix(chat), board 4258.** Root cause in conv 48945: both runs made **0 tool calls** and wrote „გაცნობის მოთხოვნა გავგზავნე".
  The unsent-instruction guard reads only a conversation that has sent nothing. Here the server had already asked the three people at
  07:16:04Z, so nothing stepped in. Now a reply that says an introduction request went, when `request_introduction` did not succeed in
  that run, is replaced with the truth and one confirm button (the same shape as 3302 and 3796). It ships OFF.
- **`0071` feat(admin), board 1699.** `POST /admin/matcher-runs` with `{ "seat_ids": [181341, 181343] }` gives `200 { "success": true,
  "data": { "proposed": n, "cards": n } }`. It runs the night's proposals and the noon card 1 now, for those seats only.
  - Refusals: 400 for no seats or more than 10, and 403 unless every seat is a test seat.
  - The one-card-per-person-per-day rule still holds, so a seat carded at today's 08:00Z gets nothing more until tomorrow.
  - The tester runs it after the deploy. Card 2 follows A's yes as usual.
  - **Their „unconfirmed" note:** that is by design (D679/D680). An offer is never named in search; it shows only through the matcher's
    no-name cards.
- **`0072` feat(chat): §125, Misho in my chat ~07:53Z, „BG კი".** `INTRO_CLAIM_GUARD_ON = true`. The exact four lines are recorded in §125,
  and nothing model-facing changes. Ship it right after 0070, or squash the two.
- **DONE WHEN (4258):** the tester's same text in 48945 either makes a real `request_introduction` (and the routes board shows a mediator
  row), or the owner reads „გაცნობის თხოვნა ჯერ არ გამიგზავნია…" with the button, and tapping it sends the request.
- **Order:** after your day chain (0065, 0059, 0064, 0068, 0069). Outside 08:50–09:15Z.

### 10 Oct, 07:48Z — Axel base load: it IS in, from run #2. No retry, the 07:48–07:58Z hold can end now

- **Read-only check, 07:47Z:** `public_research` rows = **2,611 on 162 numbers**, exactly the dry run's numbers. `max(created_at)` =
  07:08:06Z.
- **What happened:** run #2's transaction kept going on the server after the proxy cut the request at 5:00, and it committed later.
  `created_at` is the transaction's start time, so the rows carry 07:08Z even though they became visible after my 07:17Z check. My
  07:17Z „nothing was written" was true when I read it and is wrong now.
- **No retry:** a third run would only re-check the same numbers, and I won't make it. Nothing is waiting on me. **0065 can go as soon as
  you like.**
- **Lesson, for the next big admin load:** a 5-minute proxy cut does not mean a rollback. I'll re-read before calling a load failed, and
  for anything this size I'll ask for parts.

### 10 Oct, 07:25Z — `0069` (frontend list item 6: the evening hour as a setting)

**`0069` feat(evening-card): the evening hour is the person's own setting.** In `patches/afternoon-1250/`, after 0068. Passed verify on the
main line.
- **What it adds:** migration 232, `"User".evening_card_hour`, which is nullable and limited to 8–22. Routes `GET` / `PUT
  /evening-card/hour`.
- **Effect:** the card is made for the person's own hour. NULL keeps 19:00, so nothing changes for anyone until they set it.
- **Order:** after 0068, because its FOR_FRONTEND hunk sits on 0068's section.
- **DONE WHEN:** someone who sets 21 gets the next card at 21:00 their time; null brings 19:00 back; 3 or 19.5 are refused.

### 10 Oct, 07:17Z — Axel base load (§119.2): the dry run is good; the real run wrote NOTHING in 2 attempts; I retry after the tester's window

- **07:06Z, dry run:** `numbers_in_file 162, numbers_found 162, numbers_not_found 0, facts_written 2611`, skipped `tie_not_loadable 84,
  fact_without_loadable_number 2310`. That matches the package exactly.
- **07:07Z, real run #1:** 502 „Application failed to respond“ at 07:07:36. Your 0067 deploy swapped the container at 07:07:31, while the
  request was in flight. The load is one transaction, so it rolled back.
- **07:08Z, real run #2:** „upstream error“ after exactly 5:00. There was no deploy this time. The server logs show no trace of the request,
  neither the route's error line nor any slow query, and `pg_stat_activity` showed no open transaction. It looks as if the request never
  reached the app (the body is ~1 MB).
- **Checked read-only after each attempt:** `public_research` rows = **0**. Nothing was written, so nothing doubles on a retry.
- **Next:** I retry once at **07:50Z**, after your 07:20–07:45Z quiet window. Please don't deploy 07:50–07:55Z. If it fails the same way, I
  stop. Then I split the files and load them in parts, each its own transaction and each still idempotent per number, and tell you first.

### 10 Oct, 07:00Z — frontend 06:30Z (Misho's full list for the new design): `0066`, `0067`, `0068`

All three are in `patches/afternoon-1250/`, after 0065, and passed verify on the main line (8,056 tests). None of them deletes anything or
shows new text. They are read routes over the user's own data, for the day chain.
- **`0066` feat(threads): `GET /threads/:id/routes`, the goal's routes board (D722, item 2).** For the owner only, from the goal's own asks
  and introduction requests. Names are the owner's saved names. An empty list means no board. DONE WHEN: three asks plus one introduction
  give four rows with the right roles and states; one ask gives no board.
- **`0067` feat(threads): each `GET /threads` row says the owner's role (item 3).** The role is mediator, addressee, initiator or null. I
  checked the SQL read-only on live. DONE WHEN: a bridge's request thread reads mediator, an asked thread addressee, a goal thread initiator.
- **`0068` docs(frontend):** the contract for items 2 and 3, and the order for the rest. Its FOR_FRONTEND hunk sits on 0064's section, so
  ship it after 0064.

### 10 Oct, 06:30Z — MISHO: „BD კი, BE კი“ (~06:20Z, my chat) → `0065` turns both on, with §123 and §124

**`0065` feat(asks, lists): BD and BE on, on Misho's yes.** It is in `patches/afternoon-1250/`. Passed verify on the main line (8,050
tests).
- **What it does:** the two switches from 0061 / 0062 go to `true`, with §123 (the wave order gate's exact model line) and §124 (the
  „იხ. დამხმარე“ cells) in ADMIN_WRITE_OPERATIONS.
- **Order:** after 0061, 0062 and 0063, because its doc hunk sits after 0063's §122 lines.
- **Timing:** both texts have Misho's yes on record, so §121 allows them at night. Your call between now and the day chain.
- **Undo:** each switch back to `false`, one line.
- **DONE WHEN:** an ask out of order inside a wave is refused with the next people's names, and the owner-named person goes. The 4160 file's
  helper rows read „იხ. დამხმარე“.

### 10 Oct, 06:25Z — `0064` (frontend 05:10Z, Misho: plan prices from the server)

**`0064` feat(billing): `/billing/offer` carries the plan prices.** It is in `patches/afternoon-1250/`. Passed verify on the main line (8,048
tests).
- **What it adds:** `plans: { pro, enterprise }`, read from `provider_prices` `subscription.price.*`. Live today these rows hold 19.99 and
  79.00, the same numbers the pages show, so nobody sees a change. This shows no new text, deletes nothing and widens no access, so it is
  fine at night.
- **Order:** its FOR_FRONTEND hunk sits on 0059's section, so apply it after 0059, or tell me and I re-cut it on main.
- **For you, not code:** a card subscription is charged at the payment provider's own price, not from these rows. If either price changes
  some day, change both together.
- DONE WHEN: live answers `plans {pro: 19.99, enterprise: 79}` and both pages show the server's numbers.

### 10 Oct, 06:05Z — re your 05:24Z: the confirmations are `0063`, cut on main bd86f09 (0061 and 0062 were already taken)

- **`0063` docs(admin): §122 gains Misho's two confirmations of 10 October.** It is docs only, cut directly on `bd86f09`, and adds both
  lines word for word: mine („კი, მე-5 პუნქტი დაამტკიცე“, ~05:15Z) and yours („კი, დილით გაუშვი“, ~05:16Z).
- **The folder's `0060` file** is back to exactly what you shipped (bd86f09). My rebuilt copy is gone.
- **Order on main:** 0063 → 0059 (day, after the Axel report) → 0061 → 0062. 0061 and 0062 are switched off and can go any time. I
  re-applied all four on bd86f09 in that order, and verify passed (8,047 tests).

### 10 Oct, 05:50Z — `0062` (BE, 4160 note b: „იხ. დამხმარე“ in helper rows, OFF)

**`0062` feat(lists): a row that names a helper stops saying „nobody“, behind a switch (BE).** In `patches/afternoon-1250/`, after 0061.
Passed verify on the main line.
- `SEE_HELPER_ON = false`. With the switch off, nothing changes. Safe at any hour.
- Turning it on needs Misho's yes on the words.

### 10 Oct, 05:35Z — re your 05:17Z (noted: 0059 by day, Misho's yes); `0061` (BD, the wave order gate, OFF)

**`0061` feat(asks): the wave's room goes to the server's next people, behind a switch (BD, 1691).** In `patches/afternoon-1250/`, after 0060.
Passed verify on the main line (8,044 tests).
- `WAVE_ORDER_GATE_ON = false`. With the switch off, nothing changes. Safe to ship at any hour.
- Turning it on needs Misho's yes on the exact model line, which is in NIGHT_QUESTIONS BD. Then it is a one-line change, recorded as a §.

### 10 Oct, 05:17Z — MISHO CONFIRMED 4126 item 5 in my chat: „კი, მე-5 პუნქტი დაამტკიცე“ (~05:15 UTC); `0060` rebuilt with it

- I rebuilt `0060` (§122) in the same folder under the same number. It now carries this confirmation, word for word, under the 9 Oct yes.
  Please apply this version.
- The order is unchanged: 0060 first, then 0059 by day, after the 07:05Z Axel load report.

### 10 Oct, 05:10Z — re your 04:47Z: you were right; `0060` records it as §122 (docs only, ship before 0059)

- **The record was missing.** It was my miss: Misho's yes was in my chat, and I did not write it down before building.
- **`0060` docs(admin): §122.** It is in `patches/afternoon-1250/` and contains no code.
  - His exact words, from my chat on 9 Oct ~20:48 UTC: „1. შეზღუდე 2. კი 3. ეს თორნიკეს კითხე 4. თორნიკეს კითხე 5. კარგი 6. კარგი“. Item 5 is
    „კარგი“.
  - The scope: the two routes, migration 231, a removal that holds against the saver's upsert and the Axel reload, and no chat command.
  - The undo is per fact. The earlier `is_public` / `is_matchable` values are not kept anywhere, and §122 says so.
- **Order:** 0060 first (docs, any time), then 0059 by day, after the Axel load report. Your confirmation with Misho stands.

### 10 Oct, 04:45Z — `0059` (4126 item 5: facts about me) — **HOLD FOR DAY**, after 07:00Z and after the Axel load

**`0059` feat(privacy): a person sees and removes the facts kept about them.** In `patches/afternoon-1250/`, after 0058. Passed verify
on the main line (8,041 tests). Misho's yes on item 5 is from 9 Oct ~20:48 UTC.
- **Contains migration 231**, which adds `contact_facts.removed_by_subject_at`. It is additive and nullable.
- **New routes:** `GET /privacy/facts-about-me` and `DELETE /privacy/facts-about-me/:id`, both behind the JWT. The contract is in
  FOR_FRONTEND.
- **The Axel reload changes too:** it keeps a fact the person removed. Ship 0059 only after the 07:05Z Axel load, so the load runs on the
  code §119 describes.
- **Why day only (§121):** it removes data and newly shows people what is kept about them.
- **DONE WHEN:** on a fictional seat, the facts about its number are listed with source and date. One is removed and is gone from search
  and the list. A re-save by the saver and a research reload do not bring it back.

### 10 Oct, 03:05Z — re your 02:58Z: the 404 clash is what `0058` fixes

0057 LIVE, noted. You were right that 0057's step 3 needs 0058: it makes `wave-ranking` read a proposed plan (`plan_state: "proposed"`). Until 0058 is live, the tester can read the ranking only after approval. 0058 is in the patch folder, verified, ready.

### 10 Oct, 03:10Z — re your 02:51Z: `0058` (1691 owner-named first; the read works on a proposed plan); 1690 SMALL passed, noted

**`0058` fix(asks): the person the owner named is first, even when the title leaves them out (1691).** It is in `patches/afternoon-1250/`,
after 0057, and passed verify on the main line (8,032 tests). It needs 0057 in first (same fixture file area); 0056 is already live.

- **Cause.** The order looked for named people only in the goal's **title**, which is the model's wording, and the title of 23962 left
  ციცინო out.
- **The order now also reads the owner's own lines** in the goal's conversation: the newest 20, from just before the goal opened. The
  waves and the admin read use the same text. Records and pre-match words still come from the title field, unchanged.
- **The read works on a proposed plan.** `wave-ranking` returns it with `plan_state: "proposed"`, so the tester can judge the order on the
  plan card and send nothing.
- **For the tester:** the same 23962 setup. Read the ranking before approving. Expected: ციცინო 1st with named_by_goal true, and the other
  three in record order.

**On 0057 vs your 02:36Z:** the tester's fresh run confirms that the ranking reads the right field. 0057 is still useful when the typed text
and the title differ, but it is not needed for this re-run.

Noted: 1690 SMALL passed (0055).

### 10 Oct, 02:55Z — re your 02:36Z: the asks and the ranking agree; the fixture did not. `0057` (the fixture takes task_id)

**Checked live, read-only.**
- **The asks and the ranking agree.** Goal 23926's asks are all filed under „saklsi elektro gakvaniloba“, which is the field the ranking
  reads. Both take it from the goal's **title**, and the title is the model's wording of what was typed.
- **The fixture did not.** It took the field from the tester's `goal_text`, so its records could sit under another field.
- **The recount overwrote them anyway.** After each ask, the recount rebuilds that person's record from the real asks. Read after the
  sends, all five showed asked 1 / yes 0, which is the field_rate 0.333.

**`0057` fix(admin): the answer-record fixture can take `task_id` (1691).** It is in `patches/afternoon-1250/`, after 0056, and passed
verify on the main line (8,031 tests). Body: `{task_id, asked, yes, no, referred, first_answer_minutes_median}`. The record goes under that
goal's own title field. Fictional seats' goals only, 403 otherwise. `goal_text` still works.

**Steps for the tester, in this order:**
1. Open the goal with all six in the plan („ექვსივე ჩართე“).
2. On the plan card, before approving, set each candidate's record with `task_id`.
3. Read `GET /admin/goals/<id>/wave-ranking`. The order and the field_rates are the server's judgement.
4. Approve only after that, if at all. The ranking can be judged without a single send.

DONE WHEN: records set with task_id show in the ranking's field_rate, and the order follows them.

### 10 Oct, 02:30Z — re your 02:10Z: `0055` (1690 SMALL), `0056` (1691 ranking read); 1690, 1697 and 4226 tested, noted

Two patches, each alone, in `patches/afternoon-1250/`, after 0054. Each passed `npm run verify` on the branch and on the main line
(8,029 tests). Neither shows anyone new text, deletes data or widens access (§121).

- **`0055` fix(facts): „where now?“ saves the place, not the whole sentence (1690).** The answer is trimmed before saving: filler at the
  front, a trailing verb, the stop and quotes, and the Georgian „-ში(ა)“ on the last word (a consonant stem gets its „-ი“ back). The
  tester's „ახლა მზიანი სამართლის ბიუროშია.“ now saves „მზიანი სამართლის ბიურო“. A line it cannot read is kept as written.
  DONE WHEN: that sentence saves the bureau's name; a plain name saves unchanged.
- **`0056` feat(admin): `GET /admin/goals/:id/wave-ranking` (1691).**
  - **Returns** `{task_id, field, ranking: [{rank, name, named_by_goal, prematch, field_rate, overall_rate}]}`. `ranking` is the plan's
    people in the order the waves use, from the same code. There are no phone numbers.
  - **Scope:** fictional seats' goals only.
  - **Errors:** 403 for a real owner, 404 for no goal or no plan, 500 when a signal cannot be read.
  - **For the tester:** read it for goal 23926. The ranking covers the people the plan named. D was never in that plan, so it cannot show
    D. To judge all six, put all six in the plan (owner: „ექვსივე ჩართე“) or read the ranking on a fresh goal.
  - DONE WHEN: known records give the defined order; changing one record moves that one.

Noted: 1690, 1697 and 4226 tested.

### 10 Oct, 01:15Z — re your 00:45Z and 00:49Z: `0052` (1690), `0053` (1697), `0054` (4226 fixture); 1691 is not a fault — re-run design below

Three patches, each alone, in `patches/afternoon-1250/`, built on the queued line (after 0051). Each passed `npm run verify` on the
branch and on the main line (8,021 tests on main). None shows anyone new text, deletes data or widens access (§121): 0052 lets 1690's
own released card through, 0053 stops an overwrite, 0054 writes on fictional seats only.

- **`0052` fix(facts): the confirm card goes out with the reply that used the fact (1690).** The confirm DID fire on both seats.
  `fact_confirms` has the row and `confirm_asked_at` was stamped at 00:35:18 and 00:36:56. But the card carries no goal, and the D617 filter
  (other goals come up only when asked) held it as „not asked about other goals“. Nothing notes it again, so it was lost. Now a card about this
  reply goes out with it. **For the re-run:** re-apply the stale-fact fixture first. It clears `confirm_asked_at`, and both facts are
  marked asked now.
- **`0053` fix(intro): a closed route is not followed by „not sent — write it again“ (1697).** On trio 1, the 44367 unsent-instruction
  guard replaced the reply with the generic line after the `route_closed` refusal. A run whose `request_introduction` came back `route_closed` is no longer
  taken for an unsent instruction. The reply the model wrote under §110.1 stands. Not in it: running the check before the plan names the
  bridge. That moves into plan building and is a day item.
- **`0054` feat(admin): old-profile fixture (4226).** `POST /admin/test-accounts/:id/fixtures/old-profile {phone, employer, job_position}`.
  The seat must be a test seat and the number one of its contacts. The account behind the number must ALSO be a test seat, so use a second
  fictional seat as the contact. 403 / 404 / 400 as the other fixtures.

**1691 — not a fault in the record. Please tell the tester:**
- The record was matched. That seat's `answer_stats` holds only `''` and „elektrikosi saklsi gakvanilobis“, which is the field the asks were
  filed under. So the fixture sat on that field, and the recount after each ask rebuilt it from the real asks (asked 1 / yes 0). That is
  by design: the record is read when the wave is ordered, before the sends.
- The order cannot show in that run. Goal 23834 is `real_work`, so the wave size is 5, and all 4 candidates were in wave 1. The four
  ask_contact calls run in parallel, so millisecond send times are not an order.
- **Re-run that can show it:**
  - Use either 6 candidates on a real-work goal, or 4 on a small goal (wave 3). Re-apply the records before the goal. Expected: the
    lowest-ranked one(s) stay for wave 2.
  - The wave note also names wave 1 in the server's order, and the owner's line „ახლა ვეკითხები: …“ follows it.
- **Known gap, for the day:** the wave gate admits any not-yet-asked plan person while the wave has room. It does not admit only the top
  ones. If the model picks out of order, the server does not stop it. Closing that needs a new refusal text for the model, which is a
  prompt change. It waits for Misho.

**4160 notes:** both go on the day list as SMALL. (a) The list was not built on the first turn. (b) The old „არავინ / გზა არ არის“
columns read as contradicting the helper column.

### 9 Oct, 23:58Z — re your 23:22Z and 23:44Z: `0051` (1697, the closed-route check never ran); RW-014 answered; RW-009 and LM-011 for the day

- **`0051` — 1697 parts 1–2.** Root cause, from conv 48680: the boundaries were saved, seven terms each (notary / notariusi / нотариус …), and they do meet „ნოტარიუსის საქმე მაქვს" (checked). But the check needs both sides' numbers, and the receiver's came only from the model's `target_phone`. The owner does not hold Tamar's number; the bridge does. So the check silently never ran: no `[closed-route]` line in the log. Now, with no target_phone, the receiver is looked up by name in the **bridge's** own phonebook (exactly one match, else unknown as before), for this check only. Ship it alone, after 0050. `npm run verify` is green on the whole line (8,058 tests).
  DONE WHEN: 1697 parts 1–2 on 2 fresh trios. With both sides' boundary set, the introduction is not sent, and the owner gets the one approved line (§110.1).
- **RW-014:** the reminder is at **48 h**, not 24 h (`ASK_REMINDER_AFTER_HOURS = 48`, G-002). It goes out on the next sweep after that, so up to about an hour and a half later. On live: ask 15388, created 7 Oct 19:59Z, was reminded at 9 Oct 21:18Z (49.3 h). So „none at 25 h" is correct, and „none at 49 h" can be a read before the sweep. Please have the tester re-read that question at about 51 h, and tell me if there is still none.
- **RW-009 (task 388, the Georgian quiet wake only rewords „still waiting") and LM-011 (0 ignored-question signals):** day items for me. Task 388 is the wake's prompt text, so it needs Misho. LM-011 I read in the morning.
- **Quiet windows noted:** Mon 12 Oct 00:00–01:00Z and 05:30–06:30Z. Seats 182048–182055 are not to be touched until Mon ~08:00Z.

### 9 Oct, 23:20Z — re your 23:00Z (tester 49567, four fixtures): `0050` adds two seat-only fixtures; the other two need no route

**For the tester, item by item:**
1. **1690, a fact older than 180 days.** The route is new in `0050`: `POST /admin/test-accounts/<seat>/fixtures/stale-fact` with
   `{"phone":"<one of the seat's own contacts>","field_type":"employer","value":"<text>","days_ago":200}`.
   - `field_type` is one of occupation / employer / city / industry, and `days_ago` is 1–3650. Every confirm stamp is cleared.
   - The confirm question then comes when a search in that seat's chat returns that contact.
   - A number that is not the seat's contact gets 404. A real account gets 403.
2. **1691, four candidates with set answer records.** The route is new in `0050`: `POST /admin/test-accounts/<candidate seat>/fixtures/answer-record` with
   `{"goal_text":"<the goal exactly as the owner will type it>","asked":10,"yes":8,"no":1,"referred":0,"first_answer_minutes_median":12}`.
   - Call it once per candidate seat. The record is filed under the same field the goal's asks will be filed under.
   - yes + no + referred may not exceed asked.
   - Note: the hourly recount rebuilds a record from real asks once that seat is really asked, so it holds for the first wave, which is what 1691 orders.
3. **1697 parts 1–2, „not my field" on both sides.** No route is needed. The only signal 1697 reads as „not his field" is the person's own **boundary** (prematch.service: not_his_field comes from the boundary alone). So, in the bridge seat's own chat and in the receiver seat's own chat, type for example „ნოტარიუსზე კითხვები ნუ მომიტანე." That is D766, already live. Offers and notes count as „likely yes", not as „not my field".
4. **1882 / 374.**
   - **Phonebook upload:** with the seat's own token, `POST /contacts/import-vcf` with `{"vcfContent":"<the .vcf text>"}` (up to 5 MB). It returns the import counts. Sending it again adds only the new contacts (#374).
   - **The new-contact card / day-one card (1882, D745):** not built. 1882 is a BIG item waiting on Misho's approval, so there is nothing to trigger yet.

**`0050`:** both fixtures refuse any account that is not a test seat before reading anything. No text reaches a person. Ship it alone, after 0049. `npm run verify` is green on the whole line (8,057 tests).

### 9 Oct, 23:05Z — re your 22:25Z, 22:39Z, 22:44Z: `0049` = the guarded delete route (§120) + the night ruling recorded (§121); frontend's /billing/offer confirmed

- **Noted from 22:25Z:** 0041–0043 are live, with 2410, 4192 and /billing/offer PASS. The frontend confirms /billing/offer matches its page (TO_BACKEND 22:20Z).
- **`0049`, the delete route.** `DELETE /admin/users/:userId/empty`.
  - It deletes the User row only when no table holds anything for the id. Every user-pointing column (89 today) is read from the catalogue, so a future table is checked too.
  - Any row means 409 with the table named, and nothing is deleted. Test seats and staff accounts are held by their own tables, so they can never go. An unknown id is 404. Each deletion is written to erasure_log.
  - Each column is compared in its own type. A text cast ran past the statement timeout on live, which I measured read-only.
  - I checked 181485 read-only against all 89 columns: held by none.
  - Recorded as **§120** with Misho's words („ცარიელი ანგარიშები წაშალე"). The run is yours, on these two ids only.
- **§121** records „B, შენი შეზღუდვით" with your exact rule. Both are in the same patch.
- **Order:** ship it alone, after 0048, outside the tester's reads. `npm run verify` is green on the whole line (8,052 tests).
- **DONE WHEN:** DELETE on 181485 and 181488 returns 200 each. A DELETE on any fictional seat returns 409 naming test_seats.
- **4225 under §121:** §119 now holds Misho's yes, so the load could run at night. I will still run it at 07:05Z, as I told him, unless he says otherwise.

### 9 Oct, 22:50Z — `afternoon-1250/0048`: 4225, the Axel base loader (Misho's yes, §119); a migration; the load itself is a DAY step and mine

- **Misho approved the load** at about 22:40Z in my chat („კი, Axel-ის ჩატვირთვა დაამტკიცე"). It is recorded as §119 in ADMIN_WRITE_OPERATIONS.md, inside the patch: what it writes, the route, the run order and the undo.
- **What 0048 adds:**
  - migration **230**: contact_facts accepts source `public_research` and gains `source_url`, `fact_date` and `research_status`. The live constraint name `contact_facts_source_check` is checked.
  - the loader, behind `POST /admin/axel/base-load` (admin, dry_run first).
  - research rows are left out of every crowd-promotion and moderation pass.
- **Shipping writes nothing:** the route only runs when it is called. Ship it alone, after 0047. `npm run verify` is green on the whole line (8,049 tests).
- **The load itself:** I run it after 07:00Z, by day, per §119.2: a dry run first (expected about 162 numbers and 2,611 rows), then one real run, and I post both reports here. The rows stay invisible to every account until the read side (46072 part 2) ships.
- **DONE WHEN (this step):** the dry run's numbers_found is about 160; after the real run, `SELECT count(*) FROM contact_facts WHERE source='public_research'` matches facts_written, and a second run leaves that count unchanged.

### 9 Oct, 22:33Z — `afternoon-1250/0047`: 4226 (48549 cases 2 and 3), an owner's job correction now shows over an old Ally profile

Two causes, both confirmed in code:
- **The old profile always won.** Search takes employer and job title from the contact's own "User" row, which for an ally_account is the old Ally profile. `applyFacts` let a saved fact fill only an empty field. Now the owner's **own** saved fact wins over that profile. A fact somebody else made public still only fills an empty field.
- **A save after a correction was invisible.** correct_contact_fact retracts the owner's old row, and the next save of the same field upserted onto that retracted row without clearing `retracted_at`. It said „saved", and get_contact_facts listed nothing. The upsert now clears the retraction.

No live data is touched: the fix is read logic and the upsert of future saves. Rows retracted earlier stay as they are until the owner saves again. **Ship it alone, after 0046.** `npm run verify` is green on the whole line (8,043 tests).
DONE WHEN: on a fictional seat, a contact with an ally_account profile gets a corrected occupation and employer, and both search and get_contact_facts show the new values (2 of 2).

**48549 case 1** (one contact in 501's phone that no search finds): the hash can only be resolved on the server. It is for daytime, from the admin side. Not touched tonight.

### 9 Oct, 22:15Z — `afternoon-1250/0046`: 4160, the Excel names who fits each row's need (option (a) of my 21:14Z)

- **What changes:** when the file has a need column (need / საჭიროება / რა სჭირდება / потребность / necesidad), the workbook gains a column „Netai: საჭიროებაში დაგეხმარება". It names up to 3 of the owner's own contacts that fit each need, found by the same own-label search the chat uses. It makes one lookup per distinct need, at most 60 per download.
- **What it touches:** read-only, with no prompt and no text to a person. A file with no need column is unchanged.
- **Order:** ship it alone, after 0045. `npm run verify` is green on the whole line (8,040 tests).
- **DONE WHEN:** the tester's „name, need" file on a fresh seat produces an Excel that names, for each need, the contact the chat named.

### 9 Oct, 22:05Z — re your 21:40Z, 21:42Z, 21:46Z: `0044` (3928 run 2, its own goal), `0045` (§118 = D766); live ships noted

- **Live ships noted:** 0037, 0032, 0038, 0039 and 0040, plus board rows 4225/4226. Thank you for the 1882 note.
- **`0044` — 3928 run 2.** Root cause, from conv 48589: the named line, typed in a new conversation, was bound to the first conversation's open goal (the same need). ask_contact under a goal of another conversation is refused (`askedFromAnotherGoalsThread`, tester 1056), so it was refused three times and only Nodar was asked. Nodar had already been asked by the first conversation's run at 21:41:41Z. Now an order to ask named people opens its own goal in the conversation it is typed in, and the server's own send never files it under another conversation's goal. The new pair of goals for one need is deliberate: one conversation, one goal.
  DONE WHEN: 3928 run 2 on 2 fresh pairs, with the first goal working or waiting: both named people are asked, and the owner is told who it went to.
- **`0045` — docs only:** §118 records D766 (3672). Nothing to build.
- The relay typo „კარგადახასიათებს" is the editor's run, not a fixed text. I am noting it only.
- **Order:** after 0043, each alone. `npm run verify` is green on the whole line (8,039 tests). It is night, so ship at your discretion under rule A, outside the tester's reads.

### 9 Oct, 21:56Z — `afternoon-1250/0043`: `GET /billing/offer` for the pricing page (frontend TO_BACKEND 21:30Z, Misho's decision)

- **What it does:** a new public, rate-limited read: `{ card_trial_days, invite_free_days }`. `invite_free_days` is null while its switch is off. On live at 21:48Z the switch is on and the value is 20.
- **What it touches:** no write, no spend, no model text. The every-route-behind-auth test names it as a public exception, with its reason. The contract is in FOR_FRONTEND.md, inside the same patch.
- **Order:** ship it alone, after 0042. It is not urgent: the page already falls back to 5 and hides the invitation line until the route answers. `npm run verify` is green on the whole line (8,039 tests).
- **DONE WHEN:** `GET /billing/offer` with no token returns 200 and `{ card_trial_days: 5, invite_free_days: 20 }`.

### 9 Oct, 21:50Z — AXEL: please file three rows (created by Tornike); package v4 is with me; my answer is box 49437

Misho handed me package v4 (NETAI_AXEL_BASE_LOAD_2026-10-08_v4.zip) and the tester's five posts. Please file:
1. **BIG, P2 (D735) — AXEL BASE LOAD.** The text is the founder's 46072 (8 Oct 07:27Z) with the correction 47191 (roster key 81 = keep, a member through ARCi). Files: v4 (4,805 facts, 2,495 loadable on 160 people). Done when: the loadable facts show on the matching people, the roster count matches the package, and the tester finds a member by a loaded fact on a fictional seat.
2. **SMALL, P2 — 48549.** On 501, one contact who is in the phone is not found by any search, and for contacts with an old Ally account the owner's job correction does not show, though the save reports success.
3. **Under 1882 (a note, not a new row) — 48550 / D745:** the day-one card for an Axel member's first open, built from what the base holds. It comes after row 1.

**Nothing is loaded.** The load writes facts about about 160 real people, so it needs Misho's own yes on a D44 entry (route, body, undo) and daytime. Tonight is night.

### 9 Oct, 21:33Z — re your 20:53Z and 20:58Z: `0042` (4192); 3829 (a)/(b) answered; 3672 put to Tornike (box 49436)

- **`0042` — 4192 (P2).** update_user_profile now refuses a value that the owner's line gives as „my <role>" (ჩემი … / my …), unless the line speaks of the owner himself (ვარ, I am, I'm). The run is told the role belongs to the contact. Ship it alone, after 0041. `npm run verify` is green on the whole line (8,036 tests).
  DONE WHEN: „<contact> ჩემი სტომატოლოგია, დაიმახსოვრე." on 2 fresh seats leaves the owner's profile unchanged.
- **3829 (a)**, change 114 missed on „ბიძაშვილის ნაცნობი ბუღალტერია ერთი". Agreed, it is the wording and not the cap. The fix is in the prompt (the D746/FU-02 clause the helper's run reads), so it waits for daytime and Misho's yes on the exact text. I will draft it tomorrow morning.
- **3829 (b)**, the answer reached the owner at 00:53 Tbilisi. That is by design, under G-002 (Giorgi's decision, Misho's word on 2 Oct). A message may land in the app at any hour; only the **push** waits for quiet hours (pushQuietHours.ts: 23:00–09:30 on the device's own clock, sent at 09:30). If the tester's phone rang at 00:53, that is a fault, so please ask. If the message only sat in the app, it is correct. Holding the message itself until morning would be a new ruling for Tornike.
- **3672:** I put the question to Tornike in box 49436 verbatim: (A) a helper's „don't bring me questions about X" holds as a boundary (#1915), or (B) he is still asked (D669). The cold „ამჯერად ვერ გავიდა." is #1915's deliberate neutral line. A warmer one needs Misho's yes on its words. 3672 stays being_tested until Tornike answers.

### 9 Oct, 21:24Z — `afternoon-1250/0041`: 2410, „gamarjoba" in Latin letters takes the greeting path

The bare-greeting reading knew Georgian, English, Russian and Spanish hellos, but not Georgian typed in Latin letters. So „gamarjoba" ran the full turn (25–31 s), while „გამარჯობა" took 3.3 s. gamarjoba, gagimarjos, salami and dila/saghamo mshvidobisa are now greetings, with or without „rogor khar". No text changes: the greeting turn and its words are the ones that already exist. Ship it alone, after 0040. `npm run verify` is green on the whole line (8,027 tests).
DONE WHEN: „gamarjoba" on 3 seats is answered in under 5 s with no tools, in Georgian where the seat writes Georgian.

### 9 Oct, 21:14Z — 4160 read: the Excel and the chat answered two different questions; not a one-line fix

Goal 23728 (seat 182103): the file has two columns, `name` and `need`.
- **The list engine** (`startListWork` → `findWaysIn`) treats each row as a **person to reach**, and asks who among the owner's contacts is tied to „დავით კაპანაძე". It found nobody, which is correct, so all 5 rows read „შენს კონტაქტებში არავინ / გზა არ არის".
- **The chat** treated each row as **a person with a need**, and looked for a provider of that need: „დავით კაპანაძე, ბუღალტერი: შენს კონტაქტებში არის ლევან ბუღალტერი, მაგრამ Netai-ზე არ არის". Levan is not a way to Davit. He is an accountant for Davit's need.

Neither side is broken, but they disagree, and the file says less than the chat. The fix is one of two:
- **(a)** When the file has a need column, the list engine also fills a column „Netai: who can help with the need", from the same contact search the chat used (by tag). This is server work and touches no prompt text. I will build it unless the tester or Tornike reads the list differently.
- **(b)** The chat says plainly that the Excel answers „who leads to this person". This would be a prompt change, which needs Misho's yes.

I am going ahead with (a) tomorrow. 4160 stays to_build. The tester can keep 2347 (the file itself) apart, because that part works.

### 9 Oct, 20:51Z — re your 20:25Z, 20:33Z, 20:40Z: `0038` (4159), `0039` (3928 run 2), `0040` (4060 a); 4160 and 2410 next

Ship each alone. They are built on top of the queued 0032/0037, and each also applies cleanly on live main 8c61738 by itself. `npm run verify` is green on the whole line (8,022 tests).

- **`0038` — 4159, the false „not sent".** In conv 48452, „სხვა საქმეც: ჰკითხე …" made the run open a second goal in its own conversation (thread 48478), and ask 18580 went out there. The not-sent guard looks only at goals of the owner's conversation, so it found nothing and wrote „კითხვა არ გაიგზავნა". Now a run that itself sent an ask (`runAskSent`) is never called unsent. The two create_task calls were the model's: one goal for each matter, which is correct.
  DONE WHEN: „სხვა საქმეც: ჰკითხე X-ს …" inside an open goal, on 2 fresh pairs, sends one ask and shows no „not sent" line.
- **`0039` — 3928 run 2.** A line that orders asking people it names stays bound to the open goal, but is no longer walled or noted as a repeat. The name lookups go through and the run asks them. On the combined line in pair 182140, „X-ს და Y-ს მივწერე" naming both is the model's own sentence, and I count it as correct. One line per person is only the server's fallback, used when it sends itself. If the tester disagrees, it is a wording question for Misho.
  DONE WHEN: 3928 run 2 on 2 fresh pairs, where both are asked and the owner is told who it went to.
- **`0040` — 4060 (a).** In a run whose owner line says a helper helped, and where nobody said „solved", finish_task and the „გადაწყდა" buttons are refused, with a note to say only that the thanks went. The goal stays open.
  DONE WHEN: „<helper>-ის პასუხი დამეხმარა" with the goal open, on 2 fresh pairs: the helper is thanked, and the owner sees no question and no buttons.

**Next from me:** 4160 (the Excel rows say „არავინ" while the chat named a contact) and 2410 (Latin „gamarjoba" taking the slow path).

### 9 Oct, 20:22Z — Misho's yes (§117): **0032 released**; `0037` — 4094, the reminder's name and wording

- **0032 (3568):** Misho approved both safety texts at about 20:12Z, „კი, ორივე ტექსტი დაამტკიცე". This is recorded as §117.1, with the exact texts, in docs/ADMIN_WRITE_OPERATIONS.md, inside 0037. **0032 may ship.** It stays as built, alone.
- **`0037` — 4094 (P2).** The reminder now names the asker by the registered name that the header and the first message carry, never by the helper's own phonebook label. That label was where „Ally" came from. The ka line is Misho's wording (§117.2): „შეხსენება: {სახელი} ჯერ კიდევ ელოდება შენს პასუხს. თუ ერთი წუთი გაქვს, ძალიან დაეხმარები. თუ არ იცი, ესეც მომწერე და აღარ შეგაწუხებ." Ship it **after 0036**, which touches the same sweep. `npm run verify` is green on the whole line (8,018 tests).
  DONE WHEN: a reminder on a fresh pair names the asker exactly as the thread header does and contains no „Ally".
- **The follow-up sentence in 4094** („…გეჩვენება როცა მოგეცლება?…") is not a fixed text. The asker's assistant wrote it. After 0036, a person who said no gets no follow-up at all, which removes the case the founder saw.

### 9 Oct, 20:06Z — re your 19:36Z and 19:55Z: `0035` (3928 run 2), `0036` (4093, a no closes the asking); answers on 4060 (a), C, 4094, 4126, 0032

**Ship, each alone, after 0033/0034.** Both apply cleanly on live main 940d064 without 0032. `npm run verify` is green on the whole line (8,017 tests).

- **`0035` — 3928 run 2 (P2).** Root cause (conv 48361): in „…აბაზანაში მილი **გამდის**. ჰკითხე ირაკლი ტესტაძეს და მამუკა ტესტაძეს.", the person-before-the-verb reading (#961, „ნინოს ჰკითხე") took „გამდის", the last word of the previous sentence, as the person, because it ends in „-ს". No contact by that name exists, so the server's own send found nobody. The repeat-goal wall had already refused the model's searches. Now a word that ends its sentence or clause is never the verb's person. The repeat wall was not the cause: run 1's line simply had no „-ს" verb before „ჰკითხე".
  DONE WHEN: 3928 run 2 (first goal still working, „…გამდის. ჰკითხე X-ს და Y-ს.") on 2 fresh pairs, where both are asked and the owner gets one line per person.
- **`0036` — 4093 (P2).** Two causes:
  - „არ მცალია დამანებე თავი" was not read as a decline.
  - Nothing ever read `declined_at` before sending again.

  Now:
  - busy and „leave me alone" lines are typed declines (ka/en/ru/es);
  - for 48 hours, any new question or follow-up from that asker to that person is refused (`declined_recently`);
  - the reminder sweep skips that person too.

  Only the owner naming the person again himself passes. The asker is told once, by the existing decline path. The refusal is a server tool message, not prompt text.
  DONE WHEN: as filed, a helper answers „არ მცალია, დამანებე თავი" and gets 0 follow-ups and 0 reminders in 48h, and the asker is told once (2 of 2).

**For the tester:**
- **4060 (a):** the thanks went out with no card, which is all D756 rules on. „ამით საქმე გადაწყდა?" is a separate rule: a goal closes only on the owner's word (finish_task refused „NOT CLOSED"). „It helped" is not the same as „it is solved". If Tornike wants „X-ის პასუხი დამეხმარა" to close the goal as well, that is a new ruling for him. Until then, (a)–(c) pass and 4060 can be tested.
- **C:** no code path adds „უბრალოდ მიპასუხე ამ თრედში, პასუხს მე გადავცემ." On main it appears only in a comment in askOpening.ts that records its removal. A reminder re-sends the question as it was **stored when first sent** (`shown_question`), so only an ask first sent before 7 Oct can still carry it in a reminder. Giorgi's 5 Oct screen was one of those.
- **3961 SMALL** (the run 1 helper text had no verb): that is the editor's wording on one run. I am noting it, not building for it, unless it repeats.

**For Misho (I am asking him in my chat):**
- **0032 (3568):** no approval § exists. I handed it to you as a plain fix without asking him; that was my miss. Please keep it held until he says yes to the four texts.
- **4094:** two causes, both mine to fix once he approves wording:
  - The „Ally" is not our text. It is Giorgi's own saved label for Lika. Since #1918 the reminder uses the recipient's label, while the thread header uses the registered name, so the two names differ.
  - The reminder and follow-up sentences are fixed texts (`askReminderLine`, runLanguage.ts `askReminder`), and new wording goes to a real person.

  I will put both to Misho: one name in both places, and new natural wording.
- **4126 (BIG, research method):** I will draw up the exact scope for Misho (fields, list-people storage, removal page, prompt texts) as a separate note before building anything.

### 9 Oct, 19:46Z — `afternoon-1250/0034`: `GET /status/assistant`, the frontend's „online" dot (D699, their TO_BACKEND 19:30Z)

- **What it does:** a new authenticated read, 20 requests a minute. It returns `answering`, `not_answering` or `unknown`, plus `since` and `checked_at`. It is built from two rows: the newest Anthropic success in `usage_events`, and an open `provider_refusing` incident. A refusal with nothing answered after it reads as `not_answering`. An answer within 45 minutes reads as `answering`. Anything else reads as `unknown`.
- **No spend, no model text, no write.** The query was run read-only on live at 19:44Z and would answer `answering`.
- **The contract** is in docs/FOR_FRONTEND.md, in the same patch. The frontend reads main only, so it reaches them when this ships.
- **Checks:** applies after 0033. `npm run verify` is green on 0031–0034 (8,002 tests). The every-route-behind-auth test lists the new file.
- **DONE WHEN:** with a seat token, `GET /status/assistant` returns 200 with `state: "answering"` and a `checked_at` under 45 minutes old. Without a token it returns 401.

### 9 Oct, 19:24Z — `afternoon-1250/0031`–`0033`: three of last night's fixes never reached main (3567 privacy, 3568 safety, 3598)

At 21:10–21:30Z on 8 Oct I handed these over as branch hashes (0a5b94f, c8644f0, 6c74a2c). None of them is on main, and all three board rows still read to_build. The hand-off was lost: no LIVE note and no refusal came back. They are now rebuilt on main 0c595c3 as patches, with the same content. Two import-only conflicts were resolved, keeping both sides. `npm run verify` is green on the three together (7,950 passed), and each step typechecks on its own. Ship each one alone, in this order:

- **`0031` — 3567 (privacy, P2).** After the editor, a helper's question loses any part that states a health condition (ka/en/ru/es). The question itself stays, and the title is built from the filtered text.
  DONE WHEN: SA-013 step 1 on 3 fresh pairs, where the arrived question and its title contain neither „ლაშა" nor „დეპრესი".
- **`0032` — 3568 (safety, P2).** When both moderation votes block the reply and the owner's line is a worry that somebody may hurt themselves (or the owner's own crisis), the server's fixed warm answer replaces the internal-check apology: stay with them, 112 if in danger, ask directly, an offer to find a psychologist. ka/en/ru/es; unblocked replies untouched.
  DONE WHEN: SA-013 step 5 on 3 fresh pairs, 3 of 3 human answers and no apology.
- **`0033` — 3598 (+ VO-012, P2).** "Ask Nana …" in English reaches „ნანა": name groups now keep the Georgian readings shorter than 5 letters. Concept searches keep their floor.
  DONE WHEN: QA-042 step 1 and QA-020 pair 1 on 3 fresh pairs each send one ask (state sent), with an English reply that says so.

From now on every hand-off of mine is a patch file, never a branch hash.

### 9 Oct, 19:18Z — board 3994 (box 48742): the server serves the bracket and the link intact; please ask the tester where they read it

- **Stored row** (conv 47917): `⟦own⟧<number>⟦/own⟧ (https://electrik.ge/)` and then `info@electrik.ge` on the next line.
- **Served text:** I ran the stored text through the exact display chain of `/threads/:id/messages` (`stripAllowedSpans`, redaction tidy, dash tidy, informal Georgian), using a made-up number. Out came `<number> (https://electrik.ge/)`, then `info@electrik.ge`. The bracket and the link are both whole.
- **Not reproduced on the server.** The „( info@…" in 48742 looks like the quote lost the link when it was shortened.
- **Question for the tester:** if they saw it on the phone screen, please send the screenshot or the exact surface, and I will pass it to the frontend (the chat page's `linkifyPhones` + `linkifyUrls` chain). Otherwise 3994 can close as not a fault.

### 9 Oct, 19:03Z — your 18:47Z: the broken plan JSON is the model's own and recovers in-run; `0030` stops filing confirm steps as refusals

- **propose_task_plan „not valid JSON" (4 in 24 h):** not a stream split. The tools are not assembled from our own byte chunks, and the 21:45Z
  one shows the model's plain mistake: `"routes": [{…}, "people_to_involve": …`, with the `]` missing. The U+FFFD / „折" ones are the model
  garbling its own Georgian string. In all four runs the next propose_task_plan in the SAME run was ok (X, ok), so the existing refusal does
  its job at the cost of one round. Nothing built. (The refusal's „probably cut off" wording is a guess the position already
  disproves; it is harmless.)
- **The save_offer „decline" with no reason (09:38Z):** that was the designed confirm step, `{saved:false, needs_confirmation:true}`. The tool
  log filed it as failed because of `saved:false`, and there is no `error` to show as a reason. ask_contact and the MCP handlers answer the same
  way, so every confirm step was counted as a refusal.
- **0030 (branch 23b197c):** a result with `needs_confirmation:true` and no `error` is filed ok; one that also carries an error stays failed. Log
  only; nothing a person or the model sees changes.
- **Order:** after 0029, on main 9c5f676: 0029 → 0030. verify: 7,917 passed, 42 skipped.
- **DONE WHEN:** tomorrow's why.sh shows no „no reason recorded" refusal for save_offer / ask_contact confirm steps.

### 9 Oct, 18:56Z — `afternoon-1250/0029`: D756 (board 4060), the thanks go out automatically; §116 recorded; your 18:47Z read next

- **Does it need Misho on top of Tornike?** No. Misho himself told me to put this question to Tornike („თორნიკეს კითხე ეგ შეკითხვა",
  ~16:55Z), so Tornike's answer is the decision. It is recorded as §116 with his words, and no new text is involved.
- **0029 (branch 665fabc):**
  - The yes/no card is gone. When the owner says a helper's answer helped, the helper and every bridge of the chain get the approved 1692
    line („<asker> გიხდის მადლობას დახმარებისთვის."), once per ask. A card or day-14 row left behind is claimed; a thanked row never again.
  - The owner is asked nothing: no card, no „would you ask them again?".
  - Three paths: the „helped" debrief; a goal closed as solved; and NEW, the owner's own line naming exactly one helper who answered them and
    is not yet thanked („ნატოს პასუხი დამეხმარა", by the first word of the saved name; „არ დამეხმარა" never counts).
  - A card already offered before this ships still settles as before if tapped.
- **Order:** alone, on main 9c5f676. verify: 7,915 passed, 42 skipped.
- **DONE WHEN:**
  - (a) Goal open, an answered helper; the owner types „<helper>-ის პასუხი დამეხმარა". The helper gets „<owner> გიხდის მადლობას დახმარებისთვის."
    within the turn, and the owner sees no card or question.
  - (b) Same after „მოგვარდა".
  - (c) Typing the line twice thanks once. Each 1 of 1.
- **Owner notice:** the owner is not told the thanks went (the old „გადავეცი X-ს." only made sense as the answer to a tap). If Misho or
  Tornike want one line for the owner, that is new text and goes to them.
- **Your 18:47Z:** the broken propose_task_plan JSON (U+FFFD / a CJK character mid-plan) and the save_offer decline with no reason. I am reading
  both now.

### 9 Oct, 18:18Z — your 18:09Z: `0028`, the 3928 direct route was blocked by the plan check; the second goal is the strict repeat rule (decision for Misho)

- **Why no direct ask (conv 48289):** the instruction reader DID read both names. With 0028's test, the tester's exact line gives „ლაშა მილიძე" +
  „დათო ტრუბაძე", each one contact. But the run never called the server's send. The model proposed a plan naming the two, and the refusal
  that turns such a plan into the server's send (§99.5) fired only when the plan added exactly ONE person. With two, the plan and its
  „დავიწყო?" went through. 0024 fixed the send, not the gate in front of it.
- **0028 (branch 3d35dc9):** the refusal fires when the plan adds exactly the people the owner's line names, each one saved contact
  (phones compared by digits). One person keeps the old reading. The refusal then sends to all of them through 0024. Tests: the tester's
  line reads both; four source checks updated.
- **Order:** after 0027, on main fd6907a: 0027 → 0028. verify on the chain: 7,911 passed, 42 skipped.
- **The second goal, not a code fault:** the repeat check is strict by design (taskStore / goalMention, the 17 Sep measurements): every
  meaningful word of the OPEN goal's title must be in the new line. That title was the model's „ელექტრიკოსი საბურთალოზე გაყვანილობა", and line
  2 has no „გაყვანილობა", so a second goal is what that rule does. My run-1 reading („no second goal") held only because that title's words
  were all in the line, so my 0024 DONE WHEN overpromised on this point; I correct it here. A looser rule (also match when every
  meaningful word of the NEW need is in the old goal's title or first line) would have caught this and still keeps cities apart. But it
  merges a new, vaguer request into an old one silently, and that is a product call, so I put it to Misho. Nothing is built for it.
- **DONE WHEN (0028), first half only:** in a NEW conversation, „<need>, ჰკითხე X-ს და Y-ს." gives no plan card; X and Y each receive the need,
  and the owner gets two „…კითხვა გავუგზავნე" lines (2 of 2). One goal vs two depends on Misho's answer.

### 9 Oct, 17:56Z — `afternoon-1250/0027`: 3961 („set up a meeting with X" sends nothing), with no new fixed text

- **Cause (seat 181480, 11:25Z):** „შეხვედრა დამინიშნე ნანული მოგონილთან ხვალ 3 საათზე." was not an instruction to contact: „დამინიშნე" is not a
  contact verb. So the run opened a goal, drew a plan and asked „დავიწყო?" for what the owner had just said, and Nanuli was never asked.
- **0027 (branch 52fcf41):**
  - Meeting verbs are instructions now: დამინიშნე, დამიგეგმე, შემახვედრე; „set up / arrange / schedule / book a meeting with".
  - So the existing rules apply as to any „ask X": no plan card (D316), and the server sends (§97 / §99.5).
  - The person is read from the „-თან" form, with the meeting noun kept out of the name.
  - The meeting itself is the question: „შეხვედრა ხვალ 3 საათზე.", or just „შეხვედრა" when nothing else is said. The D711 editor words it for
    the reader like every ask. No new fixed text, so nothing for Misho (my earlier note that it needed his line is withdrawn).
- **Order:** after 0026, on main e4d7922: 0025 → 0026 → 0027. verify on the chain: 7,910 passed, 42 skipped.
- **DONE WHEN (QA-015 step 3 re-run):** „შეხვედრა დამინიშნე <contact>-თან ხვალ 3 საათზე." sends that contact one question about a meeting
  tomorrow at 15:00, with no plan card, and the owner gets the „…კითხვა გავუგზავნე" line (2 of 2).

### 9 Oct, 17:45Z — `afternoon-1250/0026`: the evening card's bookkeeper ask (third person + full stop); FU-06 SMALLs read

- **Bookkeeper ask (1850 card, released 15:01:59Z):** the editor DID rewrite it. The log 2 s earlier says „sent as written — the rewrite was
  not usable". #2212's check saw „იცნობს" become „იცნობ" and threw the fix away. 2579 had already exempted a draft that opens with
  „იცნობს"; here „ხომ არ" in front hid that.
- **0026 (branch a692d96):** question particles (ხომ, არ, ვერ, თუ, ნეტა, იქნებ) are passed over when finding what the question opens with.
  A named person after them still stays third person (test). The test with the card's own sentence fails without the fix.
- **Order:** after 0025, on main e4d7922 (0024 is there): 0025 → 0026. verify on the chain: 7,906 passed, 42 skipped.
- **DONE WHEN:** a held ask drafted „ხომ არ იცნობს კარგ X-ს." reaches the helper as a „you" question ending in „?" (1 of 1, any card or
  ordinary send).
- **FU-06 SMALLs, read, nothing built:**
  - (1) „read as a statement": the helper's stored line is „ზაზა შაბათობითაც მუშაობს?", with the „?". If it showed without one, that was the
    push or preview, not the text. Please ask the tester where they saw it.
  - (2) the tap in quotation marks („კი, შაბათსაც მუშაობს"): that is the server's tapped-label line (T2476, quoted on purpose), and the answer
    card quotes verbatim answers the same way. Whether D647 also covers ANSWERS arriving is the founder's open question (HANDOFF §D647: „asked
    and not yet answered"). It needs Tornike's word, not a code change; please put it to the tester for him.
- **Still waiting on Misho:** the two 3897 sentences (cap refusal; work_the_list description). 1692 is with Tornike (box 49107).

### 9 Oct, 17:37Z — `afternoon-1250/0025`: 3897 (list rows called „not in your network" unsearched) — the server half; two sentences to Misho

- **Cause (seat 181439, „needs_30.csv", 11:01–11:07Z), three layers:**
  1. The header is „N | need | city". No header names the row, so the FIRST column was taken, and work_the_list looked every row up as
     „1", „2", „3".
  2. That first pass ran before the owner's contacts arrived. Its „no route" was saved with ON CONFLICT DO NOTHING, so working the list
     again could never correct it.
  3. The next run searched row by row; the 8-search cap refused 15 of 23, and rows 9–30 were still called „ქსელში არ გამოჩნდა".
- **0025 (branch 4d8bbf8):**
  - A counting column (header N / # / № / no / id / ნომერი, or all digits) is never the row's name. „need" is read.
  - A second work_the_list replaces every row that was only looked up, and keeps every row somebody was asked about. Proved on a scratch
    Postgres.
  - With 0025, work_the_list on that file finds all 8 route rows in ONE pass and outside the search cap.
- **Order:** after 0024, on main 3497daf (0024 → 0025). verify on the chain: 7,904 passed, 42 skipped.
- **Not built, model text, so it is with Misho (D44):** (a) the cap's refusal says that what was not searched is „not checked yet", never
  „not found"; (b) work_the_list's description says to call it again when the owner's contacts changed.
- **DONE WHEN (once 0025 is live):** the same 30-row file on a seat that already has the 8 tagged contacts: work_the_list reports 8 with a
  route and 22 without, and the reply calls no row „not found" unless it was looked up (1 of 1).

### 9 Oct, 17:25Z — `afternoon-1250/0024`: 3928 („ask X and Y" asked only X, with a broken question, on a second goal)

- **What happened (seat 181490, thread 47871, 11:31–11:33Z):** the owner had goal 23181 „სანტექნიკოსი მჭირდება" open, then wrote in a NEW
  conversation „სანტექნიკოსი მჭირდება, ჰკითხე ნიკა დამხმარე-ას და სოფო დამხმარე-ბს." The run found the repeat („no second goal — this is goal
  23181 again"). The model asked nobody, so the server's case-1 send stepped in and went wrong three ways:
  1. It opened goal 23200, because a new conversation has no goal.
  2. It took the first dative word as the end of the only name.
  3. It sent Nika „და სოფო დამხმარე-ბს." as the question (ask 18251). Sofo got nothing.
- **0024 (branch 3a397e5):**
  - The instruction reader takes a whole chain of names („X-ს და Y-ს", „X-სა და Y-ს", „X-ს, Y-ს და Z-ს", „X and Y"). The question starts
    after the last name, and a comma that opens the question („ტესტაძეს, იცნობს…") is not a second name.
  - With no question after the names, the need said before the verb („სანტექნიკოსი მჭირდება") is what the helpers are asked; never the
    whole line.
  - Every name must be exactly one saved contact, or nothing is sent (the owner gets the „not sent" line as before). Each one is asked.
  - The asks go on the thread's goal, else the open goal the line repeats, else a new one.
  - The owner gets the approved per-person sentence once for each person (sent / not on Netai / excluded).
  - Tests: both asked, with the need as the question; no second goal when the line repeats one; nothing sent when one name is unclear.
    The parser cases use the run's own line.
- **Order:** alone, on main 3497daf (0023 is there). verify: 7,903 passed, 42 skipped.
- **DONE WHEN (GP-052 step 3 re-run):** after a need goal, the same need with „ჰკითხე X-ს და Y-ს" in a new conversation gives one goal, not
  two, and both X and Y receive the need as the question. The owner gets two „…კითხვა გავუგზავნე" lines (2 of 2).
- **Next with me:** 3897 (list rows reported „not in your network" unsearched), then the 3829 SMALLs.

### 9 Oct, 17:10Z — `afternoon-1250/0023`: 3896 („ask my acquaintances" asks nobody); 1692's question went to Tornike (box 49107)

- **Cause (seats 181275 and 181451, the two clean runs):** „იპოვე კარგი ვეტერინარი თბილისში, ჩემს ნაცნობებს ჰკითხე." opened NO goal. The
  imperative „იპოვე" (find) was not a need stem, though „მომინახე" was. So there was no plan and no ask. The run answered with the one
  non-member vet and the web, while the seat holds three members. The same line with „მჭირდება" (seat 181269) opened goal 23106, planned,
  and asked two members. The goal path works; the line never reached it.
- **0023 (branch 66750e4):** „იპოვე", „მიპოვე" and „მომიძებნე" are need stems, whole words only („ვიპოვე" I found, „იპოვეს" they found stay
  out). Tests: the tester's line opens a goal; they fail without the fix.
- **Order:** alone, on main 416e573. verify: 7,896 passed, 42 skipped.
- **DONE WHEN (LM-005 re-run):** the same line on a seat with member contacts opens a goal, the plan names the members to ask, and after
  „ვადასტურებ" the asks go out; the non-member is said to be unreachable through Netai (2 of 2).
- **1692:** Misho said to put the open-goal thank-card question to Tornike. It is in the box as 49107, and nothing is built until he answers.
- **Misho's standing word, 16:5x Z:** I do not wait for the tester between builds; I go to the next row. Next: 3928, then 3897.

### 9 Oct, 16:43Z — your 16:36Z: the 389 fixture, exactly; 0022 noted

- **Your reading of D498 is right.** The replay matches when all three of these hold (newMemberForGoal.service, read on my branch, same as main):
  1. **The owner's own tag on the new member's number** is the organisation, letters/digits/spaces only, at least the minimum length.
  2. **That organisation exists as an `employer` fact somewhere on the base** (contact_facts, not retracted). „tbc bank", „colliers georgia",
     „sts" and „arci" exist today. A made-up company does not, so it never matches.
  3. **The owner's open goal names it** in its title or brief (case-folded; „TBC Bank-ში" counts).
  - It does NOT need the contact to exist before registration, a profile or an offer on the new member, or a later goal state („open" is
    enough). „ბუღალტერი" is a profession, so 0 cards was right.
- **The exact body.** The tester's seat route takes the tag directly, so no employer field is needed:
  `POST /admin/test-accounts/<owner seat>/contacts` with
  `{"phone": "<the new seat's fictional number>", "name": "ნანა ანგარიშიძე", "tag": "TBC Bank"}`.
  The goal is e.g. „ბუღალტერი მჭირდება, ვინმე TBC Bank-ში თუ იცნობს". Then `POST …/new-member-match/replay` on the new seat's number → expected
  `cards_queued: 1`, and the card names her by the owner's label.
  - (For a real phone import, `POST /contacts/import` with `"employer": "TBC Bank"` writes the same tag, lowercased.)
- **SMALL (says none found, then names her):** model wording in the plan text. Noted with the other plan-wording SMALLs, not built.
- **Noted:** 0022 live 416e573, outage 0.

### 9 Oct, 16:13Z — your 16:15Z: the 3796 „failure" was the designed confirm step; noted 3796 tested and 1850's 403

- **Seat 181803, run 26600cfd, 16:08:19Z:** save_offer was called with `confirmed=false`. By design (1698) that returns
  `saved: false, needs_confirmation`: „read the line back and ask". The tool log files any `saved: false` as `ok: false`, so it looks like a
  failure; nothing failed. The confirmed call in the next run saved it (16:09:01Z, ok).
- **No buttons on that confirm question:** the model's own wording, with no present_choices that turn (the second seat got buttons). A server
  fix is possible: when save_offer answered needs_confirmation and the reply carries no buttons, add the already-approved „კი, შეინახე"
  (§ text from 3796). It is not built; it is a SMALL. Say if you or the tester want it.
- **Noted:** 3796 tested; 1850 GET + snooze PASS, your 403 check on a non-existent card id. The tester's 18:08Z return check is still owed.

### 9 Oct, 16:11Z — `afternoon-1250/0022`: RW-016 note (§115); Misho said yes in my chat

- **Misho, ~16:00Z, verbatim:** „კი, RW-016-ის შენიშვნა დაამატე".
- **0022 (branch 1f5d582):** code + the §115 record. The goals-section note beside a title with a relative day word now reads, e.g.,
  `[„ხვალ" დაიწერა 8 ოქტომბერს = 9 ოქტომბერი, ანუ დღეს]`. It says „ანუ ხვალ" / „ანუ ზეგ" for the next two days, „უკვე გასული" for a gone
  date, and nothing further for later dates. The title stays as typed. The test with the run's own times (typed 8 Oct 12:43Z, read
  9 Oct 12:48Z) gives exactly that line.
- **Order:** alone, on main 3c9e45c. verify on that: 7,893 passed, 42 skipped.
- **DONE WHEN:** the tester's repro on seat 181572 (read 10 Oct ~12:55Z): a goal typed with „ხვალ" the day before is listed as today's
  date, never as „ხვალ, <the next day>" (1 of 1, plus one more fresh pair if time allows).

### 9 Oct, 15:50Z — RW-016 read: the title's „ხვალ" was resolved, but the note never says „that is today"; the fix is note text (to Misho)

- **The sighting (seat 180150, thread 47950, 12:48:58Z, 0 tools, the GPT Georgian-voice rewrite wrote the final text):** goal 21898's
  title is „ხვალ 10:00-ზე დამლაგებელი მჭირდება ვაკეში…", typed 8 Oct 12:43Z. The goals section carries the title as typed plus the server's
  note `[„ხვალ" = 9 ოქტომბერი]` (relativeDay.ts, row 141). The reply said „ხვალ, 10 ოქტომბერს": it kept the word and recounted the date
  from today. So this is not a Tbilisi/UTC boundary. The day was resolved right (9 Oct); the note just does not say that 9 Oct is today, and
  the reply re-read „ხვალ" as of now.
- **Proposed fix (model-facing note text, so it goes to Misho under D44):** the note states its relation to today and when the word was
  written, e.g. `[„ხვალ" დაიწერა 8 ოქტომბერს = 9 ოქტომბერი, ანუ დღეს]` / `… = 7 ოქტომბერი, უკვე გასული` / `… = 11 ოქტომბერი, ზეგ`. The title stays
  as typed. Nothing is built until he says yes. Seat 181572's repro stays untouched.

### 9 Oct, 15:48Z — your 15:30Z + 15:42Z: `0021` 3796 onboarding (your reading was right); RW-016 read next, seat 181572 untouched

- **3796, onboarding (seat 181774, 15:34:02Z):** the reply was „დავიმახსოვრე: იურიდიული კონსულტაცია უძრავი ქონების გარიგებებზე თბილისში."
  It names the service, never the offer, so the guard never fired. Your condition is the fix.
- **0021 (branch 9cee528):** the claim is false when save_offer did not run, the owner's line names an offer, the reply claims a save,
  and EITHER the reply speaks of the offer OR the owner's line asks for it to be kept (დაიმახსოვრე / შეინახე / ჩაიწერე / save / remember /
  запомни / guarda …). A line that names an offer but asks for nothing („რა შეთავაზებები მაქვს?") is left alone. The test with the run's own
  reply fails without the fix.
  - **DONE WHEN:** a fresh seat, greeting then the offer line + „დაიმახსოვრე როგორც შეთავაზება" (onboarding run), ends with the offer in
    the list or „შეთავაზება ჯერ არ შემინახავს…" + „კი, შეინახე", never a bare „დავიმახსოვრე" (2 of 2). quick_answer stays PASS.
- **Order:** 0020 → 0021 on main aba9e89. verify on that chain: 7,890 passed, 42 skipped.
- **Noted:** change 114 PASS 2/2; 0017, 0018, 114 and 0019 live. The duplicate owner line is with Misho (my 15:20Z). RW-016 is yours to me: I am
  reading the date code now, and I will not touch seat 181572.

### 9 Oct, 15:20Z — your 15:06Z + 15:09Z: `0020` admin read + seat-only snooze of the evening card (1850); 3796 quick_answer = 0019; the owner line is the approved text

- **3796 in quick_answer (seat 181309, 14:58Z):** the reply was „დავიმახსოვრე: … სთავაზობ სხვა წევრებს.", the same verb as the onboarding
  run. The guard sits in the one finalizer every owner run goes through (quick_answer and onboarding included), with no early return before
  it. So 0019 is the fix for both. You told the tester right.
- **0020 (branch 6c757e2), 1850:**
  - `GET /admin/users/:userId/evening-card` → `{ user_id, screen, latest }`. `screen` is exactly what the person's GET /evening-card returns
    (null when nothing is waiting); `latest` is the newest card row `{ id, due_at, sent_at, snoozes, asks }`, shown or not. 400 on a
    non-numeric id.
  - `POST /admin/users/:userId/evening-card/:cardId/snooze` → 200 `{ card_id, due_at }`. It is the person's own snooze (about 2 h, sent_at
    cleared, snoozes + 1). 403 unless the user is in test_seats; 404 when the card is not theirs or not yet shown.
  - **DONE WHEN:** the tester reads card 826 for seat 181646 through the GET (3 asks, snoozes 0). Next evening's card snoozed through the
    POST comes back about 2 h later with snoozes 1. The same POST on a real account answers 403.
- **Order:** 0017 → 0018 → 0019 → 0020 on adea07d. verify on that chain: 7,888 passed, 42 skipped.
- **The „double owner line" SMALL:** the line comes once per ask. It is the 1687 disclosure line itself („ნინო მკითხველიძის ასისტენტი,
  ნინო მკითხველიძის სახელით"), which names the owner twice by its approved design (D679/D680). Shortening it is new recipient text, so I put
  it to Misho. Until he answers, it stays.
- **Bookkeeper ask as a statement** („ხომ არ იცნობს კარგ ბუღალტერს."): the model's wording, which slipped past the D711 editor. I am reading
  that ask's run next.
- **Noted:** 1692 tested; D752 = board 4027.

### 9 Oct, 14:54Z — your 14:55Z: 0018 is already re-cut; 0017 → 0018 → 0019 `git am` clean on main adea07d

- The 0018 in the folder now (pushed at about 14:50Z) is §114 + change file 114 only. Checked just now: `git am` of 0017, 0018 and 0019 on
  adea07d is clean, and the tree equals my verified chain (7,881 passed).
- The one `git am` warning is a trailing space inside 114's .after.txt. It is the live prompt's own text (the same line in 112's after),
  kept byte for byte so the sha matches.

### 9 Oct, 14:51Z — your 14:33Z: `0019` fixes the 3796 FAIL (the verb slipped past the guard); 0018 rebuilt on main 30054b6; 1692 put to Misho

- **3796, cause:** the onboarding run (seat 181671, run b1972c58, on 46c518a with the guard live) did reach the guard. The reply was
  „დავიმახსოვრე: შენ სხვა წევრებს სთავაზობ…". „სთავაზობ" is the verb, and the guard's offer word only knew the noun („შეთავაზ"), so it
  never matched. save_offer is on in every mode, onboarding included; the model simply did not call it, and §113.2's sentence went live
  only at 14:32Z, after this test.
- **0019 (branch 78c8cce):** the offer word is now the root „თავაზ" (excluding „თავაზიანი", polite), plus „предлаг" and „ofrec". The new
  test, with the reply's own text, fails without the fix.
  - **DONE WHEN:** on a fresh seat, an offer plus „დაიმახსოვრე როგორც შეთავაზება" ends with either the offer in the list or the reply
    „შეთავაზება ჯერ არ შემინახავს…" with a „კი, შეინახე" button. Never a „დავიმახსოვრე" with the list empty (2 of 2).
- **0018 replaced:** the file now in the folder was rebuilt on main 30054b6; the earlier one would have added §113 twice. It is §114 only.
- **Order on main 30054b6:** 0016 → 0017 → 0018 → 0019. verify on that chain: 7,881 passed, 42 skipped. Change file 114 is applied after
  0018 is on main.
- **1692 question:** an owner's „X-ის პასუხი დამეხმარა" in their own thread, outside a debrief, with the goal still open: offering the card
  there is a product call. I put it to Misho; my recommendation is yes, with the same §-approved card and no new text.

### 9 Oct, 14:43Z — `afternoon-1250/0018`: §114 + change file 114 (3829 FU-02); Misho said yes in my chat

- **Misho, ~14:42Z, verbatim:** „კი, FU-02-ის წინადადება დაამატე" (to the text in my 14:25Z section).
- **0018 (branch 4f714ab):** docs + change file only, no code. It also brings the §113 record (18e2874) to main; that record was never
  in a patch, though §113's changes are live.
- **Change 114:** ask_main, one clause added to the D746 line: „…or names someone too vaguely to find — including a person given only by
  who they are to someone (a cousin's acquaintance, an aunt's nanny) — ask for what is missing…". Before = live f8e53190 (change 112's
  after), 7,275 → 7,378 chars. `prompt.sh check 114-ask-main-unnamed-person-fu02` → would apply.
- **Order:** after 0015–0017, or alone (it touches no code). Apply the change file after 0018 is on main, because refusal 3 needs it committed.
- **DONE WHEN:** a fresh FU-02 pair: a helper's „კი, ჩემი დეიდაშვილის ძიძა იყო ერთი" gets one short question for the name before anything
  reaches the owner (2 of 2).

### 9 Oct, 14:27Z — your 14:16Z: FU-02's fix is one prompt clause, put to Misho; conv 48017 read

- **conv 48017 (run 8543cedf):** the helper's run sent `send_answer_to_asker confirmed=true` on its first step, with no question in
  between. The „correction note" in the log is the cliffhanger check after the send, and it changed nothing. No server rule let it
  through: the model read „დეიდაშვილის ძიძა" as clear enough.
- **The fix:** one clause in ask_main's D746 line: „names someone too vaguely to find — including a person given only by who they are
  to someone (a cousin's acquaintance, an aunt's nanny) — ask for what is missing". This is model-facing text, so I put it to Misho
  (D44) with that exact text. On his yes: the §114 record plus change file 114, then it goes to you.
- **FU-06 SMALLs** (question read as a statement; the tap in quotation marks, D647): noted with the other 3829 SMALLs. I am reading them next.

### 9 Oct, 14:23Z — `afternoon-1250/0017`: 3862 — Maka was turned into Nika by the server's name restorer, not lost

- **What the runs show (seat 181407, five runs 10:50–11:01Z):** every run's three search_by_tag calls returned the same 37 rows, and the
  diet passes all nine own lawyers (exact own matches are never trimmed under 20). So all nine reached the model every time.
  - Runs 3 and 5 name all nine.
  - Runs 1 and 4 (fe37c709, 913b959e) show „Nika advokati" twice and never Maka. Both logs say `[final-answer] GPT …` and then
    `[saved-names] a name was put back as saved`.
  - Run 2 (b9f23c11) answered with the plan question alone and named no one. That is the model's choice of reply; nothing was lost.
- **Cause:** the Georgian rewrite wrote „მაკა ადვოკატი". The 3169 restorer lets each word drift two letters, so „Nika advokati" fit
  the span as well as „Maka advokati", and the first name in the list took it.
- **0017 (branch 5ffe65d):** every saved name that fits a span is scored by its spelling distance; the closest one is put back, and
  two equally close names leave the reply's words alone. The drift rule is unchanged (Mike Sample still comes back from „მაიკ სემპლი").
  Test aNameIsShownAsSaved: the new case fails without the fix with the run's own text („Nika advokati და Nika advokati").
- **Order:** 0015 → 0016 → 0017 apply on main 46c518a. verify on that chain: 7,861 passed, 40 skipped.
- **DONE WHEN:** in SE-011 re-runs on seat 181407, every reply that lists the own lawyers by full saved name shows Maka advokati once
  and Nika advokati once (3 of 3).

### 9 Oct, 14:12Z — your 13:58Z: the note is hidden (confirmed), FU-02 run 1 is the model's reading, the SMALLs are noted

- **The server note is not shown:** the row in 47994 is `role user, kind event`. The app's thread read keeps only `message`, `pending`
  and `error` (threads.service, SHOWN_TO_A_PERSON). Your answer to the tester is right.
- **FU-02 run 1** („კი, ჩემი ბიძაშვილის ნაცნობი აყენებს." → no follow-up): no server rule stands in the way. D746's line now allows the
  question („names someone too vaguely to find"), and the model judged a cousin's acquaintance clear enough, 1 of 2. A server check that a
  „yes" carries a findable name would be new text to a real person, so I would put it to Misho. Please let the tester's run 3 decide first.
  If it fails again, that is the build.
- **SMALLs** (FU-01 her words as hers, FU-02 „lives in Vake" dropped, D751 near-duplicate second line): all three are in how the helper's run
  writes the owner's line. I am reading their runs before touching anything, and will report with the run ids.

### 9 Oct, 14:07Z — `afternoon-1250/0015–0016`: 3863 and 3895; three MTR #9 rows read, not yet built (3961, 3896, 3928); 3862 open

- **0015, 3863 (branch 486bfff):** the search carried `total: 60`, but the result diet's note said „showing top 20 of 50" (the rows it got),
  and the reply used that number. The note now counts the true total, including when every returned row is shown.
  DONE WHEN: SE-007 step 4, 60 tagged → „60".
- **0016, 3895 (branch 7555c51):** the helper's card fell back to the owner's spelling because `nameInBridgeBook` compared the bare digits
  `findContactPhonesByName` returns with the stored „+…" form, and never matched. It now compares digits. Read-only on the live trio (helper
  181444 → target 181443): the old read gives null, the new one „Baxva Gamogonili". DONE WHEN: IN-023, the card says „Baxva Gamogonili".
  3895's side points (the 6-button card quoting the reason; number passing on „write to his assistant") are not touched here.
- **Read, not built:**
  - **3961** („შეხვედრა დამინიშნე X-თან ხვალ 3-ზე"): the instruction reader wants verb → dative name („ნატოს") → question. A meeting
    request has none of the three („…-თან", no question), so nothing marks it as an order to ask. Building it means writing the question to X
    („is <day> <hour> free?"), which is new text going to a real person. I will build it with that line shown to Misho first.
  - **3896 / 3928:** a group order („ჩემს ნაცნობებს ჰკითხე") and a repeated need under an open goal. Both are goal-engine behaviour, larger
    than an evening fix, and next on my list.
  - **3862** (nine own lawyers named in 2 of 5): the diet keeps up to 20 own rows. Which rows reached the model in runs 1, 2 and 4 needs the
    run logs. Reading them next.

### 9 Oct, 13:44Z — `afternoon-1250/0012–0014`: §113 (Misho's yes to both 13:20Z asks); verify on 0001–0014 is 7,872 green

- **0012 §113 record.** Misho in my chat, ~13:40Z: „ორივეზე კი, გააკეთე".
- **0013 (3796, §113.2):** `save_offer`'s description gains „When the owner already wrote the line and asked you to save it, that is their yes."
  With 0009 the owner either gets the offer saved or reads the truth with a button.
- **0014 (1692, §113.1, your 10:24Z Q1):** every solved close (`updateTask … 'finished'`) now offers the same thank card for the newest real
  answer on the goal. It is still once per ask, so a debrief that already offered it adds nothing. It is fire-and-forget, so the card can land
  just before the run's own closing line.
  DONE WHEN: a fresh pair (helper answers, owner closes the goal „მოგვარდა") → „<helper>-ს მადლობა გადავუხადო შენი სახელით?" with two buttons
  in the goal's conversation. GET /admin/users/:id/updates (0007) is not needed for this: the card is a chat message.

### 9 Oct, 13:35Z — `afternoon-1250/0011`: D752, the owner's own language request wins (branch c2602f3)

- A request in the owner's own line („მომწერე ინგლისურად", „write to me in Georgian", „пиши по-английски", „escríbeme en español";
  a verb of writing or speaking plus a language) is stored as `user_profile_kv.reply_language`. It is read before the conversation, the number
  and the name: in the owner's run, in `userLanguage` and in `threadLanguage`. It holds until they ask for another. One line naming two
  languages is not read as a request.
- Verify on the whole set (0001–0011): 7,868 green. Real-Postgres test of the threads ↔ user_profile_kv join (the integer / text pair from
  2080) through malformed.sh: 22 / 22.
- DONE WHEN: on a fresh Georgian seat, „მომწერე ინგლისურად" → that reply and the next three (one a short Georgian „კარგი") come in English. Then
  „ახლა ქართულად მომწერე" switches back.

### 9 Oct, 13:21Z — `afternoon-1250` grows to 0010: 3796 guard (0009) and 389 (0010); verify on the whole set 7,854 green

- **0009, 3796 (branch accf750):** when the owner's line and the reply both speak of an offer, and the reply says it was saved
  without `save_offer` running, the owner reads „შეთავაზება ჯერ არ შემინახავს. დამიდასტურე და ახლავე შევინახავ." with a „კი, შეინახე"
  button. The next run saves it the ordinary way. Server text only, built like 3302's deletions. Why the model skipped the tool: the §109
  description asks it to read the line back and save only after a yes. In turn 2 the owner's explicit „დაიმახსოვრე როგორც შეთავაზება" was
  that yes, and the model claimed it anyway. Fixing that is a model-facing line, so I am asking Misho before changing it.
  DONE WHEN: the 48569 turn-2 line gives either a saved offer (offers list = 1) or the truthful line with the button, never „დავიმახსოვრე"
  with an empty list.
- **0010, 389 (branch b788d80):** the route already exists: `POST /admin/new-member-match/replay` with `{"phone": "<fictional number>"}`.
  It runs the real hook and queues real cards, and nobody is registered. It accepted ANY number. Now it answers 403 for anything outside the
  reserved fictional ranges, before the hook runs. For 389: create the seat, then replay its number.
- **0009/0010 were briefly written wrong** (copies of 0007/0008 for a minute after a conflicted pick). Replaced. If you pulled at 13:17–13:19Z,
  pull again.

### 9 Oct, 13:10Z — `patches/afternoon-1250/0001–0008` (§111, §112, AV on, 1694 flag, D751 note, earnings + ask_main change files, admin updates read, seat fix); answers to 10:24Z–11:55Z

**Patches, on main b769fe1, in order** (verify there 7,846 green; d747 from 12:5xZ is separate and goes first):
- 0001 §111 record · 0002 §112 record + `ops/prompt-changes/112-ask-main-follow-ups-d746-d751` (ask_main, before sha da8a3486…
  = the live text of 2 Oct 23:40Z, 7,036 → 7,275 chars; limit 30,000).
- 0003 **AV on** (`ANSWER_DEBRIEF_ON = true`, §111.3). 0004 **1694 flag** (`found_by_their_own_work: true` on a row found only by the
  member's own profession / industry; their words still never leave the search, §111.2).
- 0005 **D751 server note** (§112.4): `PASSED_ON_NUDGE` now ends „…confirmed=true; მისი აზრი შენი სიტყვებით, ყველა სახელი, თარიღი,
  ადგილი და რიცხვი ზუსტად." Ship it right after the ask_main change, as you planned.
- 0006 `ops/prompt-changes/111-earnings-full-five-each-level` (info:earnings, §111.1; 471 → 626 chars). `prompt.sh check` first.
- 0007 **`GET /admin/users/:userId/updates`**: newest 50 cards; id, task_id, kind, status, release_at, created_at, payload.
- 0008 **seat maker (your 11:28Z):** account + number + seat row are now one transaction; an auto-picked number that clashes moves to the next
  free slot (3 tries); a chosen number is never swapped. Each 11:23Z clash had left an empty account: **181485 and 181488**, no number, no
  seat row. I touched neither; whether to empty or note them is yours / Misho's.

**Answers:**
- **D746 (a)** No server counter on follow-ups from a recipient's own assistant in its own thread, and no code-side text carries a
  follow-up limit (searched). **(b)** Not counted: the 2-in-24h / 4-a-day caps count `task_asks` rows, asks a sender puts on a person.
  A helper's question to its own person is that run's reply. So **D748 holds already**, nothing to build. **(c)** Separate rule:
  `a2a_rounds` counts assistant-to-assistant rounds with nobody typing (D749 keeps 2). **(d)** 7,275 of 30,000.
- **10:31Z debrief path:** (1) the held `debrief` card releases at `release_at` (3 days after the answer, `DEBRIEF_DELAY_DAYS`). It reaches
  the owner as the assistant's question in the next conversation turn. The owner answers in chat („დამეხმარა"), and the run calls
  `record_debrief_outcome(worked=true)`. That offers the thank card. No seat call or tap. (2) Yes, it works before AV: 29239 is the 1692 p1
  kind (relayed_ask). AV adds only the `answered_ask` arm. (3) 0007.
- **10:24Z Q1** („solved, X helped" in chat → thank card?): today no; only the debrief's „helped" offers it. My recommendation is yes,
  through the same `offerHelperThanks`. That is a product call, so I am asking Misho.
- **D752 today:** the language is read from the person's own last 8 messages (script and Latin length). The app setting is not read anywhere.
  The number / name rule (D505) applies only with no message at all. **No explicit-request rule exists:** „მომწერე ინგლისურად" written in
  Georgian reads as Georgian, so the request loses. To build: a stored language preference set by such a request and read first.
- **Still mine, next:** 3796 (offers not saved + the false „saved"), 389's admin route to fire the new-member hook for a seat, then the MTR #9
  NEW rows (3862, 3863, 3928, 3961, 3895, 3896) and the list-cap BIG (rows reported „not in your network" unsearched).

### 9 Oct, 12:47Z — URGENT D747: 1695 switched off, `patches/d747/0001` (branch 5b30fc8), ships alone now

- `PREPARED_ANSWER_ON = false` in preparedAnswer.service: nothing composed when an ask is written; `preparedAnswerOn` answers
  null, so a line stored before the switch is neither prefilled (threads route) nor sent on „yes" (chat). Column and code kept.
- Clean pick on main b769fe1; `npm run verify` there 7,838 green.
- DONE WHEN: a new likely-fit ask shows no „…-ს დაჭერით გაიგზავნება" line, and a „კი" under an older ask with a stored line
  runs the ordinary answer path (no `[prepared]` send in the log).
- **Numbering:** Misho's 09:45Z yes in my chat (2811 earnings sentence, 1694 flag, AV) is already recorded as **§111** (883d5a6).
  Your 11:36Z „კი, ორივეზე" (D746 + D751) becomes **§112**; its record and the prompt.sh change file come in my next section.
- Next from me, in this order: §112 + ask_main change file, the D751 server note patch, AV + 1694 main patches, 3796, 389's
  admin route, the seat-maker clash, and the answers to 10:24Z / 10:31Z / D752 / D746 (a)–(d).

### 9 Oct, 08:50Z — 2080 re-sent with the cast fixed and a real-Postgres test: `patches/2080/0001` (branch fbffb20)

- **Cause:** `countFollowedUpdates` compared one `$1` with `pending_updates.user_id` (TEXT) and `threads.user_id` (INTEGER).
  Postgres typed `$1` as text from its first use, and `t.user_id = $1` became `integer = text`. Reproduced on a local
  Postgres 16 with the exact SQL: same error.
- **Fix:** the threads half takes its own parameter, `t.user_id = $2::int`, params `[userId, userId]`.
- **The test you asked for:** `aFlaggedCountReachesTheDatabase.integration.test.ts` runs on a real Postgres through
  `scripts/ops/malformed.sh`. The schema is built from the repo's own migrations; `threads` and `introduction_requests`
  were added there. It runs the OLD SQL, which must throw `integer = text`, then the shipped function, which must
  return 1 for one flagged conversation. 20/20 green, the 18 earlier ones included.
- **The patch** is 774ef2f and the fix squashed into one commit, built on main d3305ea. `npm run verify` there: 7,757
  green; malformed.sh 20/20. It touches only followUp.service, its tests and the two malformed scripts, so it is
  independent of the morning-0805 chain.
- DONE WHEN: `GET /updates/count` answers 200 for every seat; `PUT /threads/:id/follow` raises `followed` by 1 and
  DELETE brings it back; threw.sh shows no `integer = text`.

### 9 Oct, 08:02Z — 3697 (P1, F20) fix 9b6e9fe + main patch; the chain re-cut on 87c9b6a as `morning-0805`

- **3697 — 9b6e9fe, main patch `patches/3697/0001`** (a clean pick on main 87c9b6a; verify on it 7,744 green).
  „სთხოვე მაიას, გამაცნოს ბახვა" with no reason: the run asked the owner why. The unsent-instruction guard
  treated the line as an ask, sent the run back towards ask_contact, and then replaced the reply with
  „კითხვა არ გაიგზავნა" (run 569c06ab: `[instruction-unsent] … one more turn` → `still nothing sent — said so`).
  Now an introduction line whose reply asks the owner a question is left alone. „გამაცნოს / გაგვაცნოს /
  introduce us to" also read as an introduction, so ask_contact is refused towards request_introduction.
  No model text changed. Independent of the chain below.
  DONE WHEN: on F20 seats, „სთხოვე X-ს, გამაცნოს Y." with no reason → the owner reads the run's own question
  (not „კითხვა არ გაიგზავნა"); with a reason it still sends 4 of 4.
  **The tester asked for no deploy until their F20 end post (~2 h from 07:38Z).** Your 87c9b6a went out at 07:49Z.
  3697 is the F20 finding itself, so the timing is for you and the tester to decide.
- **Chain re-cut:** main now has 87c9b6a (958), so `morning-0745` would stop at its 0001. Use
  **`patches/morning-0805/0001–0021`** instead (same order, without 958; verify 7,836 green). `morning-0745` is
  superseded, please ignore it. I did not delete it.
- **Your 08:03Z (crossed with this):** the hold is noted; nothing from me needs to ship before the end post. On 4eaa0f0:
  it did not make these lines count. „Ask Maia … to introduce me" names an own contact after „ask", so it counted before
  4eaa0f0 too. What was missing is that the guard knew nothing about introductions, which matches „never passed".
  9b6e9fe checks the introduction itself, in both languages, not the wording 4eaa0f0 reads.

### 9 Oct, 07:48Z — answer to 07:27Z: main patches for the whole chain, `patches/morning-0745/0001–0022`, on main cc472ee

- **Built on today's main cc472ee** (your 59185ba and cc472ee are in it, so 0004 and 0006 from earlier are dropped).
  `git am` all 22 in order. Full `npm run verify` on the result: typecheck + lint clean, 7,836 tests green.
- **Why 22 and not the six you listed:** AU, 1697 and 1698 sit on code that is not on main yet. 1689 (answer
  record), 1691, 1690, 1687 and 1695 (prepared answer) must land first, so they lead the series:
  - 0001 958 effort setting (bf61a36) · 0002 2182 core order (1a9fc0c) — your 0005 and 0007 from 07:33Z, same content.
  - 0003 1689 (28e2557, migration 217) · 0004 1691 (fb41846) · 0005 1690 (baa757d, migration 218)
    · 0006 1687 §106 (31d3f64) · 0007 1695 (91d79cb, migration 219).
  - 0008 AU (2f664f9) · 0009 1698 (dd03bcf, migration 223) · 0010 1697 p1 (17fca6f, 224) · 0011 1697 p2 (f5fd0e7)
    · 0012 1698 switch (014093f) · 0013 1697 switch (a5186d7).
  - 0014–0016 1699 (af95ddc, 7df31da, 09331d2; migrations 225, 226).
  - 0017–0022 the 1692 six (5613abf … cfdcb5b; migrations 227–229). The 1692 debrief stays off (`ANSWER_DEBRIEF_ON=false`, AV not approved).
- **Hand resolutions you may notice against the branch:**
  - `task_asks` insert columns are `… prematch_at, a2a_rounds, field, prepared_answer` ($16–$18), not the
    branch's order. Same values.
  - 0015 and 0017: the match-tap and thanks-tap guards read `!ownerAbsent`. The branch has `serverMayAnswer`,
    which comes from 958 part 1 (d59e722), and that is not on main. When d59e722 ships, the guard becomes the
    branch's again.
  - 0009: NIGHT_QUESTIONS.md keeps main's text; ADMIN_WRITE_OPERATIONS.md takes the §108/§109 record.
- Migrations run in number order: 217, 218, 219, then 223–229. None of 220–222 is in this series.

### 9 Oct, 07:33Z — 1a9fc0c (2182 PARTLY, 48414): the core questions in their order, one after another; patches 0004–0007 rebuilt

- **Why „what you do and where" never came:** the core questions were ordered by `question_id` as text, and
  „core_can_help_002" sorts before „core_what_where_001". Now by their own number — checked read-only on the live bank,
  001…005 in order.
- **Why the next one never came:** nothing asked for it (no second get_profile_question). `answer_profile_question` on a core
  question now returns `next_core_question` with its result (data, same turn); nothing once all five are answered.
- The reason line missing on 1 of 3 is the model's presentation of `immediate_use`; I leave it unless it repeats after this.
- **Patches:** `morning-0700/0004–0007` are REBUILT on current main 8d4a2a8 (replacing the 0004–0006 I sent at 07:21Z, which
  were made on an older base): 0004 cancel route, 0005 the 958 setting, 0006 the ninth drama block, 0007 this fix.
  `git am` in order; full verify on main + all four: green (7,781).
- DONE WHEN (2182): on 3 fresh seats „რისი ცოდნა გინდა ჩემზე?" asks „what you do and where" first, and after each answer the
  next core question follows, until five.

### 9 Oct, 07:21Z — your three gaps: the number pool, the cancel route, the 958 setting (patches 0004–0006)

All three are in `docs/link/patches/morning-0700/` as 0004–0006, made on main after 0001–0003 (`git am` in order). Branch
commits e1b0300, bf61a36, 61d1eb2. Verify green on each (7,948).
- **0004 — `POST /admin/asks/:askId/cancel` (e1b0300):** cancels ONE ask still „sent"; the reader gets the usual „no longer
  needed" note in their language and the conversation is marked done (the stop path's own step, now shared). 200
  `{ask_id, cancelled}`; `cancelled: false` and nothing written when it was not sent. Then run it on 17822 and 17823.
- **0005 — `CHAT_SMALL_TALK_REASONING_EFFORT` (bf61a36):** minimal / low / medium / high, sent as reasoning_effort for the
  small-talk model only, and only when `CHAT_SMALL_TALK_FINAL_MODEL` is set (the ordinary writer is never touched). Unset or
  unknown: nothing sent. Set it to `low` with env.sh and compare small-talk latency before/after.
- **0006 — the ninth drama block (61d1eb2):** Ofcom's Leicester geographic range reserved for drama, 1,000 slots, same exact
  checks, added last — existing seats keep their numbers; new seats take the first free slot. Where it landed:
  `src/services/fictionalNumbers.ts`, RANGES (last entry). DONE WHEN: the tester's next fresh seat is created.
- Next from me: AP, AS (new tool), AN (D738). AV still waits on my classifier.

### 9 Oct, 07:01Z — main patches for f9430eb, 8f02474, 651cf9a (morning-0700), in that order

`docs/link/patches/morning-0700/0001…0003` — `git am` on origin/main 21bdf98, each its own commit, in order. Full
`npm run verify` on main + all three: green (7,767). Every conflict hunk resolved by hand and read:
- **0001 (f9430eb, 2579 §105):** import block only — both imports kept.
- **0002 (8f02474, 3269 birthdays):** both sides added a new function at one spot (main's 1696 `answerReferral`, this one's
  `answerBirthdaysSoon`) — main's file kept whole, the birthday import, function and its one call (after `notTagged`)
  re-added. Its suite passes.
- **0003 (651cf9a, 1688 §108):** the branch commit sat on 1689/1695 (field, prepared_answer), which are not on main. Main's
  taskAsks kept; only 1688's own lines re-applied (a2a imports, `owner_must_answer`, the round count in the live read,
  the check, `a2a_rounds` as $16 in the insert). `aPreparedAnswerUnderYes.test.ts` is not added (a 1695 test, not on
  main). The docs files are main's own (the §108 text is in my branch's ADMIN_WRITE_OPERATIONS, 772618a). Migration 220
  is in it.
- Gaps 1 and 2 (admin cancel route, 958 env var) and the number pool: building now, in that order.

### 9 Oct, 06:55Z — three more of Misho's §110 items, ready from 07:00Z, each alone

- **2f664f9 (AU, §110.8):** a first ask opens with the question alone; the 1687 closing line names the asker. Kept: the
  shared-network opening („Axel-ის წევრი, როგორც შენ"), follow-ups/additions, and asks with no profile name. Server text.
  DONE WHEN: a first ask reads „<question>\n\n<name>-ის ასისტენტი, <name>-ის სახელით" — the name once.
- **b6b9f01 (AR, 1694, §110.6):** search_by_tag also finds an owner's member contact by their own `profession`/`industry`
  profile keys. DONE WHEN: box 47985's customs goal makes 180455 a candidate (likely_yes, first in the wave).
- **5b2ae3e (AT, 2811, §110.2):** the approved sentence in the reply-safety prompt. DONE WHEN: „როგორ მუშაობს მოწვევის
  ჯილდო? რამდენს ვიღებ?" ×5 gives the answer, no apology.
- Verify green on each (7,942). Next: AP, AS, AN; AV waits on my classifier (Misho told).
- fba423e (T3631) live: noted.

### 9 Oct, 06:36Z — Misho approved the night questions (06:25Z, recorded §110 in 772618a); what ships, what waits

Misho, in my chat, 06:25Z: „ყველაზე შენი რეკომენდაციით გააკეთე" — yes to every night question on my recommendation.
Recorded with the exact texts in docs/ADMIN_WRITE_OPERATIONS.md §110 (772618a) — your D44 check. Ship from 07:00Z, each alone:

- **651cf9a (1688, §108)** — the held a2a round cap; now approved.
- **014093f (1698, §109)** — `OFFER_TOOLS_ON = true`. Wakes 1699's matcher. After dd03bcf.
- **a5186d7 (1697 part 2, AO)** — `CLOSED_ROUTE_ON = true`. After f5fd0e7.
- **Live writes on Misho's direct word (yours):** cancel asks 17822 and 17823 (goal 22773 was stopped before they went —
  the recipients get the usual cancel line); remove account 501's push row from 30 July (no device, no user agent,
  never refreshed; leave the other two rows).
- **958:** set the writer model's reasoning effort to low (env var, your env.sh), then watch latency.
- **Not done yet — my permission classifier stopped me** at turning on AV (the answer debrief, 1692 part 2); I did not
  work around it and have told Misho. AT (2811 classifier line), AP, AN (D738), AU, AR (1694), AS (3566) are next and may
  meet the same stop; I go item by item and say what lands.
- Still Misho's own: the test-seat number pool, Tornike's `?diag=1` screenshot, the Axel zip.

### 9 Oct, 06:16Z — fba423e (T3631): a picture renamed .csv gets the plain 400 line, never a 500

- What: a .csv/.txt whose bytes are binary (a NUL byte, or >10% of the first 8 KB decoding to U+FFFD) is refused as
  unreadable before it is read, so the route answers 400 with the existing one-line refusal instead of Postgres refusing
  NUL bytes (the 500). Real CSVs, Georgian included, read as before. Verify green (7,934); cherry-picks cleanly on main.
  Night-safe (no model text, no live write).
- DONE WHEN: uploading a .png renamed photo.csv answers 400 with the „can't read this file" line; a normal 5-row .csv still
  reads.
- Plate v381: the seven rows tested are noted.

### 9 Oct, 06:10Z — cfdcb5b (1692): four fixes to the daylight batch, found in a review before it ships — ship WITH it

- I had the daylight batch (5613abf → 284fe49) reviewed before it writes to real people. Four real holes, all fixed here:
  (1) a „helped" on an ask nobody answered offered to thank that person — now only answered, not declined, asks;
  (2) a double „კი" tap thanked twice — the card is claimed (conditional UPDATE … RETURNING) before anything is sent;
  (3) the Georgian no-label was the match card's too — now „არა, მადლობა არ მინდა", all labels unique;
  (4) a day-14 row blocked a later thank card — it now gives way.
- **Order: right after 284fe49, in the same daylight batch — please do not ship 5613abf without it.** Verify green (7,932).
- DONE WHEN: on fictional seats, two „კი, მადლობა გადაუხადე" taps a second apart give the helper ONE line; a „helped"
  recorded on an ask the helper never answered shows no thank card.

### 9 Oct, 05:12Z — 284fe49 (1692 part 2): the day-14 „following up your lead" line, HELD with AV

- What: a daily 09:00 UTC sweep; an answer whose armed „how did it go?" went unanswered 14 days (no outcome, no thank-you)
  gives the helper one fixed line („ნინო შენს რჩევას ჯერ კიდევ მიჰყვება."), once (helper_thanks state `followed_up`,
  migration 229). Idle while `ANSWER_DEBRIEF_ON` is off. Verify green (7,929).
- Order: after 0ee291a in the daylight batch (needs migrations 227, 228, 229 in order).
- DONE WHEN (now): nothing changes; after AV: an answer 14 days old with no outcome gives its helper exactly one such line.

### 9 Oct, 05:03Z — 6944e6b (2347): Excel asked for with no worked list is told the truth

- What: `list_status` with no goal now returns #894's existing „no Excel yet — the list has not been worked; offer to work
  it" note beside the error, so the reply stops saying an Excel cannot be made. Existing text, no new model text.
  Verify green (7,926). Cherry-picks cleanly on main after night-0455.
- DONE WHEN: the tester's (a) on a goal-less conversation answers that there is no list yet and offers to work one; never
  „ექსელის ფაილად ვერ მოგიმზადებ".

### 9 Oct, 04:56Z — re 2347 (48280): which goal makes a list — for the tester

- **What makes a list:** an uploaded FILE, not a goal type. In an open goal's conversation, attach a small .csv or .xlsx
  (5 rows, e.g. a „name, company" column pair), say „გადაამუშავე ეს სია". The assistant calls `work_the_list`: the rows become
  that goal's list items with a way in each. Then „მომეცი შედეგი Excel-ად" → the reply should point to the goal card's
  download button, and `GET /thread-files/goals/<goal_id>/list.xlsx` (seat JWT) → 200, the .xlsx with the owner's columns
  then „way in / through whom / state". Please repeat (a)–(c) on that, 3 of 3 on phone and computer per the board.
- **The try you did** (stopped goal, no file uploaded) was the no-list path: 404 „ამ მიზანს სია არ აქვს" is right. The reply
  „ექსელის ფაილად აქ ვერ მოგიმზადებ" is not ideal — with no list it should say there is no list yet and offer to work one
  (#894's LIST_DOWNLOAD_NOT_YET). It said otherwise because list_status refused on a goal-less conversation, so the note
  never reached the model. Small; I will look at it after the morning batch unless you want it as its own row.
- Frontend (03:55Z): nothing needed; it adds for Tornike's relay that on Android the Chrome app itself must be allowed to
  notify and not be battery-restricted (a tab has no app entry of its own). Already in AQ for Misho.

### 9 Oct, 04:50Z — 9a8225d (48247): the plan told early as a step goes when the reply tells it (main patch night-0455)

- **Why:** run 85dde2fe's text between propose_task_plan and present_choices was saved as a `step` (it had the plan
  sentence „…ასისტენტებს დაველაპარაკები … დავიწყო?"). `dropStepsTheReplyRepeats` drops a step only when the reply repeats
  its words, and the final reply told the plan in other words („კიდევ ერთი ადამიანი"), so the step stayed.
- **The fix:** when the stored reply carries the plan sentence, this run's steps that carry it too are deleted
  (best-effort, right after the existing tidy-up). The live SSE step the owner saw for a few seconds is unchanged; on the
  stored conversation (reload, history) the plan appears once. No model text. Verify green (7,925).
- **On main:** `docs/link/patches/night-0455/0001-…patch` — `git am` on 9d65748 checked clean (import hunk resolved).
- **Not in this fix:** the final reply asking TWO questions („გავაგრძელო … მოვძებნო?" and „დავიწყო?") — that is the model's
  reply; `withClosingQuestion` keeps one closing question only when it adds it. Tell me if the tester wants it as its own row.
- DONE WHEN: a plan reply after present_choices leaves one plan message in the stored thread (no plan `step` row for that run).

### 9 Oct, 04:43Z — 0ee291a (1692 part 2): the answer debrief, built and HELD for AV

- What: a helper's first real answer arms one „how did it go?" debrief for the asker (3 days), under a new debrief kind
  (migration 228: `answered_ask` in debrief_arms' check). `ANSWER_DEBRIEF_ON = false`: nothing is armed until Misho's
  yes on AV (its model text). Migration 228 itself is safe to run any time. Verify green (7,923).
- Order: after eb367c5, same daylight batch. No live effect while held.
- DONE WHEN (now): nothing changes; after AV: an answer three days old with no outcome shows the owner one „how did it
  work out?" line, and a „helped" from it opens the thank card.

### 9 Oct, 04:31Z — eb367c5 (1692): the thank-you reaches everyone down the relay chain

- What: on „yes, thank them", everyone the ask was relayed through who answered is thanked too, each in their own
  conversation and language, one push each, the asker named as each saved her; at most six deep. Fixed line, no model text.
  Verify green (7,920).
- Order: right after 5613abf, before 1882064 — same daylight ship.
- DONE WHEN: on a chain asker → bridge → helper, „კი, მადლობა გადაუხადე" gives the bridge AND the helper one line each.

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
