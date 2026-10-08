# Connector update D738: proposed texts for review

**Date:** 8 Oct 2026
**Purpose:** bring the Netai MCP connector's model-facing texts in line with the app, per the founder's D738 and the tester's update notes of 5 Oct (Note 1) and 7 Oct (Note 2).
**Status: draft only. None of this ships until the product owner says yes to the exact text.** No source file has been edited.

Files referred to:
- `src/services/mcp/texts.ts` (`MCP_SERVER_INSTRUCTIONS`, `TOOL_TEXTS`, `PARAM_TEXTS`, `PROMPT_TEXTS`, `NOTE_*`)
- `src/services/mcp/mcpServer.ts` (tool wiring, inline `.describe()` strings, `GENERIC_TOOL_ERROR`)
- `src/services/mcp/handlers.ts` (behaviour, inline `next`/`error` strings)
- `src/services/chat.service.ts` → `APPROVE_PLAN_DESCRIPTION`. **This constant is shared with the in-app tool** (texts.ts imports it), so changing it changes the app too.
- `netai_info` table (the rows `get_netai_info` returns). This is DB content the prompt team edits in the admin console, and the live rows may differ from the migrations quoted below.

Each CURRENT quote is copied from the file. Where the source is a string split across `+` lines, it is quoted as the joined text. Line numbers are from branch `claude/ally-app-docs-ctezil` @ `625f5a6`.

---

## Note 1 (5 Oct)

### 1.1 Plan voice (D663): needs code, separate task

**Behaviour:** `mcpProposeTaskPlan` (handlers.ts ~1173) calls `proposeTaskPlan(...)` with no language, and that returns `renderPlan(...)` (taskPlans.service.ts ~1145). It is still the old card: title + version, "solved when", routes list, people list, never-ask list. The app's one-sentence version is `planInSentences(plan, language)` plus `PLAN_CLOSING_QUESTION` („დავიწყო?" / "Shall I start?"). The connector's `summary` has to come from those two. **Needs code, separate task.** The text below should ship only together with that change.

**texts.ts:419, `TOOL_TEXTS.propose_task_plan.description`**
CURRENT:
> Show the returned summary verbatim and ask for their yes; then call approve_task_plan.

PROPOSED:
> Show the returned summary as it is: one sentence naming whose assistant you will talk to and the result. No routes, no „signal", no „counted as solved", never the text you will send. End on its one question and wait for their yes; then call approve_task_plan.

**mcpServer.ts:579, `propose_task_plan` input `plan` `.describe()`**
CURRENT:
> The plan, in the four parts the user approves.

PROPOSED:
> The plan the user approves. He reads only the one sentence the server makes of it.

### 1.2 Approve word „ვადასტურებ" (D661): text-only. Note 2.15 is merged here.

**Behaviour:** none needed. `mcpApproveTaskPlan` takes `confirmed: true` and does not match a word, so the word lives only in the text.

**chat.service.ts:3099–3100, `APPROVE_PLAN_DESCRIPTION`** (shared with the in-app tool; the existing test substrings in `consentState.test.ts` are kept)
CURRENT:
> Call ONLY after the user has said yes IN THIS TURN — their tap on the approve button, or a short go-ahead they typed.

PROPOSED:
> Call ONLY after the user has said yes IN THIS TURN — their tap on the approve button („ვადასტურებ"), or a short go-ahead they typed; the first „კი" is enough.

*(If the owner wants the app's tool text left untouched, the alternative is to give the connector its own copy. That breaks the "one wall, one text" choice recorded at texts.ts:425–426.)*

### 1.3 No word-for-word relay (D647/D648/D653): text-only

**texts.ts:813–815, `PARAM_TEXTS.askQuestion`** (the `ask_contact` `question` field)
CURRENT:
> The question for the contact, written out ready to send — polite, one ask, in the user's voice. The recipient sees it verbatim.

PROPOSED:
> The question for the contact, ready to send, in your own words as the user's assistant — polite, one ask, every fact exact. Never the user's own typed words.

**texts.ts:745–747, `PARAM_TEXTS.introMessage`** (the `request_introduction` `message` field)
CURRENT:
> One plain line of why the user wants the intro, in the user's words, saved verbatim so the reply keeps its context. Shown to no one until the user confirms.

PROPOSED:
> One plain line of why the user wants the intro, in your own words with the facts exact — never the user's typed words — so the reply keeps its context. Shown to no one until the user confirms.

**texts.ts:155, `TOOL_TEXTS.request_introduction.description`**
CURRENT:
> Save the user's reason verbatim so the eventual reply keeps its context.

PROPOSED:
> Save the user's reason — its meaning in your own words, facts exact — so the eventual reply keeps its context.

Answers that come back are covered under 2.8.

### 1.4 Automatic answers are off (D669): needs code, separate task

**Behaviour:** taking `list_answer_rules` and `delete_answer_rule` off the connector means removing two registrations in mcpServer.ts (~636–656), their handlers, and their rows in the registry-parity test. **Needs code, separate task.**

**Watch out:** in this branch the server still answers automatically. `createAskNow` calls `matchAnswerRule(...)` and returns `answered_automatically: true` (taskAsks.service.ts ~1793–1801). The app also still registers both tools (chat.service.ts ~1942–1955). Until the server stops, a "switched off" text would be false. That is why only the removal is proposed. For the record, the sentence that goes with the tools:

**texts.ts:476–478, `TOOL_TEXTS.list_answer_rules.description`**
CURRENT:
> A rule is created only in the app, on the user’s yes to "answer similar questions this way in future".

PROPOSED: removed together with the tool (no replacement text).

### 1.5 One goal for a repeated need (D667): needs code, separate task

**Behaviour:** the `already_open` answer in `mcpCreateTask` (handlers.ts ~1036–1050) returns only `task_ref`, `title` and `status`. It has to add the waiting plan (its one sentence plus the closing question) when the goal has a proposed, unapproved plan. **Needs code, separate task.** These texts ship with it:

**texts.ts:393–395, `TOOL_TEXTS.create_task.description`**
CURRENT:
> If they already have this goal open it is NOT created again: the answer names the one that exists, and you tell them where it stands.

PROPOSED:
> If they already have this goal open it is NOT created again: the answer names the one that exists, and you tell them where it stands. If it carries a plan waiting for their yes, show that plan again and ask for the yes.

**handlers.ts:1044–1046, `already_open` `next` string**
CURRENT:
> They already have this goal open. Tell them where it stands rather than opening a second one.

PROPOSED (only when a waiting plan is attached):
> They already have this goal open, with a plan waiting for their yes. Show waiting_plan again and ask for the yes, rather than opening a second one.

### 1.6 A typed instruction is the yes (D316, D625): needs code, separate task

**Behaviour:** the server's D316 exception (`ownerNamedThemOutsidePlan`, taskAsks.service.ts ~768) reads the owner's latest typed line from the app conversation by `threadId`. The connector passes no thread (handlers.ts ~1255, "T10: threadId omitted"), so on the connector a person the owner names after approval is refused as "outside the plan". **Needs code, separate task:** the connector needs some other way to show that the owner named the person. These texts ship with it:

**texts.ts:637–638, `TOOL_TEXTS.ask_contact.description`**
CURRENT:
> a person the plan does not name needs a plan change and the user’s yes to THAT.

PROPOSED:
> a person the plan does not name needs a plan change and the user’s yes to THAT — unless the USER himself just named that one person to ask: his line is the yes (D316, D625). A person YOU propose still needs it.

**texts.ts:420–421, `TOOL_TEXTS.propose_task_plan.description`**
CURRENT:
> a person outside the plan is refused until the plan is changed.

PROPOSED:
> a person outside the plan is refused until the plan is changed, unless the user himself just named that person to ask.

### 1.7 Approve card only when something goes out (D626): text-only

**texts.ts:417–418, `TOOL_TEXTS.propose_task_plan.description`**
CURRENT:
> Call it as soon as the problem is understood — before any ask goes out — and again for any CHANGE (a new person, a new route): the change waits for a yes while everything already approved keeps running.

PROPOSED:
> Call it as soon as the problem is understood — before any ask goes out — and again for any CHANGE (a new person, a new route): the change waits for a yes while everything already approved keeps running. When nothing will be sent to a person, there is no plan and no approval — just the answer (D626).

### 1.8 Number sharing (task 991): text-only (interim). A connector tool would need code.

**Behaviour:** the app's `share_contact_number_with_asker` works only inside a live incoming-question thread. The connector has no such thread, by the same design that keeps `relay_ask` app-only (handlers.ts ~1236–1238). The minimal change is to stop the connector saying the only route is an introduction, and to point number sharing to the app. A connector tool would be **code, separate task**, and is not proposed here.

**texts.ts:35, `MCP_SERVER_INSTRUCTIONS` (Privacy)**
CURRENT:
> **Privacy.** Numbers never reach you — stripped. A third person's vulnerability guides who you suggest but is never said aloud. Connect only via **request_introduction**; confirm first.

PROPOSED:
> **Privacy.** Numbers never reach you — stripped. A third person's vulnerability guides who you suggest but is never said aloud. Connect via **request_introduction**; confirm first. Giving a contact's number to someone who asked the user is done in the Netai app, inside that question.

**texts.ts:121–122, `TOOL_TEXTS.get_contact_profile.description`**
CURRENT:
> The profile shows no phone number — numbers never reach you; a connection is made only through request_introduction.

PROPOSED:
> The profile shows no phone number — numbers never reach you; here a connection is made only through request_introduction.

### 1.9 Files (tasks 892–895): text-only. File tools would need code.

No connector text mentions files today. Proposed **new line** in `MCP_SERVER_INSTRUCTIONS` (texts.ts, after the Growth paragraph at line 39):

PROPOSED:
> **Lists.** No files here: an xlsx/csv list is uploaded and worked in the Netai app, which returns the file.

### 1.10 Tone / small talk (D659/D660, D617): text-only

**texts.ts:25, `MCP_SERVER_INSTRUCTIONS`**
CURRENT:
> **At the start of a conversation** load their open goals (get_my_tasks), notes (get_user_notes), due results (get_pending_updates) + waiting requests (check_my_inbox), and weave in warmly; requests last, never first; never invent an update.

PROPOSED:
> **A hello gets a hello** — nothing loaded, nothing listed. When they bring something to work on, load their open goals (get_my_tasks), notes (get_user_notes), due results (get_pending_updates) + waiting requests (check_my_inbox), and weave in warmly; requests last, never first; never invent an update.

**texts.ts:41, `MCP_SERVER_INSTRUCTIONS` (Voice).** This also carries 2.1. The 1355 part goes under 2.12.
CURRENT:
> **Voice.** Reply in the language they wrote, never default. Warm, plain, brief; fullest name (first + surname); name the one bridge, not a list.

PROPOSED:
> **Voice.** Reply in the language they wrote, never default. Warm, human, short; fullest name (first + surname); name the one bridge, not a list. In Georgian a goal is „დავალება", never „მიზანი".

**texts.ts:400–401, `TOOL_TEXTS.get_my_tasks.description`**
CURRENT:
> Call this at the START of a conversation to read their saved goals for them, and refer back to it naturally.

PROPOSED:
> Call this when they bring something to work on — never on a bare hello — to read their saved goals for them, and refer back to it naturally.

**texts.ts:500, `TOOL_TEXTS.get_user_notes.description`**
CURRENT:
> Call this at the start of a conversation alongside get_my_tasks so you do not re-ask what they have already said.

PROPOSED:
> Call this alongside get_my_tasks so you do not re-ask what they have already said.

**texts.ts:169, `TOOL_TEXTS.check_my_inbox.description`**
CURRENT:
> Call it once at the start of a conversation.

PROPOSED:
> Call it once when they bring something to work on — never on a bare hello.

**texts.ts:548, `TOOL_TEXTS.get_pending_updates.description`**
CURRENT:
> Call once at the start of a conversation, alongside check_my_inbox;

PROPOSED:
> Call once alongside check_my_inbox (never on a bare hello);

### 1.11 Name: Ally → Netai: text-only

These are kept as they are, because they mean the real old-account state: texts.ts:39 ("An **old Ally account** (account_state "ally_account")…") and texts.ts:62–63 ("…"ally_account" (an old Ally account that has never opened Netai)…"). Constant names (`NOTE_NOT_ON_ALLY`) and the internal `MCP_USAGE_PROVIDER = 'ally'` are code identifiers and are not model-facing.

| Where | CURRENT | PROPOSED |
|---|---|---|
| texts.ts:20 `MCP_SERVER_NAME` | `'Ally'` | `'Netai'` *(this is the server name clients display; ask whether claude.ai/ChatGPT listings need updating at the same time)* |
| texts.ts:23 `MCP_SERVER_INSTRUCTIONS` | You are the user's own assistant inside **Ally** — … Rules for every Ally tool: | You are the user's own assistant inside **Netai** — … Rules for every Netai tool: |
| texts.ts:156–157 `request_introduction` | Route by Ally membership (shown on each profile): if the target is on Ally, connect through their assistant — a warm intro, no number; if the target is NOT on Ally, | Route by Netai membership (shown on each profile): if the target is on Netai, connect through their assistant — a warm intro, no number; if the target is NOT on Netai, |
| texts.ts:919 `NOTE_NOT_ON_ALLY` | They're not on Ally yet — say so plainly, | They're not on Netai yet — say so plainly, |
| texts.ts:954 `NOTE_INTRO_SENT` | Introduction request sent. Tell the user they'll get the reply inside Ally; | Introduction request sent. Tell the user they'll get the reply inside Netai; |
| texts.ts:877 `PROMPT_TEXTS.build_target_list` | ვინც უკვე Ally-ზეა — გაააქტიურე, არ მიჰყიდო. | ვინც უკვე Netai-ზეა — გაააქტიურე, არ მიჰყიდო. |
| texts.ts:881 `PROMPT_TEXTS.invite_people.title` | ვინ მოვიწვიო Ally-ზე | ვინ მოვიწვიო Netai-ზე |
| texts.ts:885 `PROMPT_TEXTS.invite_people.build` | ვინ მოვიწვიო Ally-ზე${who …}? | ვინ მოვიწვიო Netai-ზე${who …}? |
| mcpServer.ts:86 `GENERIC_TOOL_ERROR` | Tell the user something went wrong on Ally's end; | Tell the user something went wrong on Netai's end; |

---

## Note 2 (7 Oct)

### 2.1 „დავალება", not „მიზანი" (D697): text-only

English "goal" stays. The only Georgian „მიზანი" in connector text:

**texts.ts:857, `PROMPT_TEXTS.request_intro.build`**
CURRENT:
> მინდა გამაცნო ${who} — მიზანი: ${purpose}.

PROPOSED:
> მინდა გამაცნო ${who} — რისთვის: ${purpose}.

*(Here „მიზანი" means "purpose", not a list item. It is still replaced, because the rule says it leaves all Georgian text.)* The Voice line under 1.10 tells the model which Georgian word to use for a goal.

### 2.2 Never claim a send that did not happen (2014); first-person status (2115): text-only
### 2.3 A question held for the evening card is not "sent" (2113): text-only

**Behaviour:** none needed. When the recipient's limit is reached, `createAskNow` already returns `sent: false, reason: 'recipient_daily_limit_reached', reopens_at`, with the server's own Georgian reply rule.

**texts.ts:643, `TOOL_TEXTS.ask_contact.description`**
CURRENT:
> Never promise to pass something on before you have sent it.

PROPOSED:
> Never promise to pass something on before you have sent it, and never say you wrote unless the result says sent: true. sent: false with reopens_at means it waits for their evening card — say that, never "sent". In Georgian the status is first person: „ვკითხე", „მივწერე", never „ჰკითხე".

### 2.4 Refund: 14 days, Stripe; reward unlocks on day 15 (D677/D678): text-only (description + `netai_info` rows)

**texts.ts:352–353, `TOOL_TEXTS.get_netai_info.description`**
CURRENT:
> The user asks what Netai is, what it costs, how referral earning/withdrawal works,

PROPOSED:
> The user asks what Netai is, what it costs, how refunds work, how referral earning/withdrawal works,

**`netai_info` row `pricing`** (latest text in migrations: 132, with 154 removing "(the Georgian tier)"). The live row must be read before editing.
CURRENT:
> Subscriptions and cards run through Stripe (Stripe Checkout to subscribe, the Stripe Customer Portal for card changes and cancellation); token top-up packs run through Paddle.

PROPOSED:
> Subscriptions, cards and token top-up packs run through Stripe (Stripe Checkout to subscribe, the Stripe Customer Portal for card changes and cancellation). A payment can be refunded within 14 days of it, through Stripe.

*(Token packs now use Stripe Checkout: `stripeTopup.service.ts`, `aTokenPackIsPaidThroughStripe.test.ts`. So "Paddle" is out of date as well.)*

**`netai_info` row `earnings`** (migration 060). The live row must be read before editing.
CURRENT:
> Your balance can be withdrawn from $10, or spent on tokens or on a month of subscription.

PROPOSED:
> Your balance can be withdrawn from $10, or spent on tokens or on a month of subscription. A reward becomes usable on day 15 after the payment it came from, because a payment can be refunded in its first 14 days; a refunded payment takes its reward back.

### 2.5 Adding contacts only by .vcf (D690)

**No connector text found.** No connector text describes how contacts get in, and none offers an Ally-app route. The `netai_info` migrations mention no import route either; the live rows are unverified. No change.

### 2.6 Incoming questions: 2 a day at once, the rest in the 19:00 evening card (D685/D687): text-only

**texts.ts:629–630, `TOOL_TEXTS.ask_contact.description`**
CURRENT:
> Sends a question to one of the user's MEMBER contacts on an open task's behalf — they get it as a message in their own app and their reply comes back to the task.

PROPOSED:
> Sends a question to one of the user's MEMBER contacts on an open task's behalf — they get it in their own app (two a day reach a person at once; the rest wait for that person's evening card) and their reply comes back to the task.

*(19:00 is left out on purpose. The server's held-question rule, `heldForEveningCardNote`, tells the model not to name the hour or the day.)* `check_my_inbox`: no current sentence promises an instant answer, so no change.

### 2.7 "Later" has a day: tomorrow / in 3 days / next week; bare "later" = 3 days; asker told the date (1981): needs code, separate task

**Behaviour:** `respond_to_request` takes only `accept: true|false` (mcpServer.ts ~284–288, handlers.ts ~593). A "later" choice with 1/3/7 days, which tells the asker the date, needs a new parameter and server support. **Needs code, separate task.** Once that exists, the text change would go on `TOOL_TEXTS.respond_to_request.description` (texts.ts:198–199, "Accepts or declines a waiting introduction request"). Not drafted until the code shape is known.
`snooze_update` (default 1 day) concerns the owner's own updates, not questions to him. It is left alone. The owner should confirm 1981 is not meant to cover it.

### 2.8 No word-for-word relay on more paths (1750, 1717, 1488, 1552, 1618): text-only

**texts.ts:756, `PARAM_TEXTS.responseNote`** (`respond_to_request` `response` field)
CURRENT:
> Optional short note from the user to pass back with the answer.

PROPOSED:
> Optional short note to pass back with the answer — the user's meaning in your own words, facts exact, never their typed words.

**texts.ts:208, `TOOL_TEXTS.get_intro_status.description`**
CURRENT:
> Every introduction the user has requested — pending and answered in the last week, who answered, their words, timestamps.

PROPOSED:
> Every introduction the user has requested — pending and answered in the last week, who answered, what they answered, timestamps. Pass an answer on as its meaning in your words, never as a quotation.

**texts.ts:180–181, `TOOL_TEXTS.check_my_inbox.description`.** The 2.14 sentence is added here too.
CURRENT:
> never a bare "accepted" ("[Mediator] agreed to introduce you to [Target] — about [reason]").

PROPOSED:
> never a bare "accepted" ("[Mediator] agreed to introduce you to [Target] — about [reason]"); a mediator's note is passed as its meaning in your words, never quoted. A decline is one message naming who declined and the next step.

Left unchanged on purpose: `save_goal_feedback` ("Save what they ACTUALLY SAID") and its `answer` field, and `answer_goal_question` ("answer is what the user actually said, in their words"). Both go to the owner's own goal or to Netai, not to another person.

### 2.9 Number sharing: same turn, one line why, no intro offer after (1519/1553/1554)

**No connector text found.** Number sharing is app-only (see 1.8), so these rules apply in the app. No change beyond 1.8.

### 2.10 "Do not ask me about X" holds for every asker (1915): text-only

**Behaviour:** none needed. The connector's `save_user_note` already returns `boundary_topic` with a flipped `reply_rule` when the note is a topic boundary (handlers.ts ~1409–1417), and plans/asks already apply it (`withoutAskBoundaries`). The tool description still says the opposite:

**texts.ts:442–446, `TOOL_TEXTS.save_user_note.description`**
CURRENT:
> A note steers YOUR OWN replies to this user and nothing else: it does not stop other people's assistants asking them anything. So NEITHER your narration before the call NOR your reply after it may say that questions will stop, that they will not be asked, or that nothing will reach them — say only that the note is saved, in one short line. Obey `reply_rule` in the result.

PROPOSED:
> A note steers YOUR OWN replies to this user. Before the call, never say that questions will stop. After it, say only what the result says, in one short line: a result with boundary_topic means no one will ask them about that topic; without it, only that the note is saved. Obey `reply_rule` in the result.

### 2.11 One number, two owners, two labels: each sees only her own (1918)

**No change needed (already true in the text).** `get_contact_profile` already says the user's own label comes only from `search_contacts`' `saved_as` and keeps it apart from crowd tags (texts.ts:132–138). Which label is returned is decided on the server.

### 2.12 Lookups: facts not links (1357), one clean answer (1356), registered surname (1355), no double-bracket notes (2117): text-only

**texts.ts:33, `MCP_SERVER_INSTRUCTIONS` (One person = one ID)**
CURRENT:
> **One person = one ID.** Every label aggregates onto one phone id; confirm via **get_contact_profile**'s tags; never split one person in two or invent a surname.

PROPOSED:
> **One person = one ID.** Every label aggregates onto one phone id; confirm via **get_contact_profile**'s tags; never split one person in two or invent a surname; a member's surname is the spelling they registered.

Proposed **new line** in `MCP_SERVER_INSTRUCTIONS`, after "Verify live facts" (texts.ts:29):
> **Lookups.** Give the facts yourself — never send them to a link. „Find everything on X" is one clean answer. No [[double-bracket]] notes.

### 2.13 Reply buttons read as natural answers in the receiver's language (1948)

**No connector text found.** The connector's `ask_contact` has no buttons/choices parameter. No change.

### 2.14 A mediator refusing an introduction: one message, who refused, next step (1651): text-only

Merged into the `check_my_inbox` change under 2.8 ("A decline is one message naming who declined and the next step.").

### 2.15 A plan is approved on the first „კი" (961): text-only

Merged into 1.2 ("the first „კი" is enough").

### 2.16–2.19 Not finished (follow-up flag, reach to 5th connection, Georgian small talk, reminders at a set time)

**No change.** None of the proposed texts above promises any of them. Existing texts checked: `find_warm_path` says "up to 3 hops", `get_netai_info`'s `limits` row says it "sets no arbitrary alarms", and `set_task_wake` is the goal's own wake-up, not a reminder to the user. One sentence for the owner to check against item 16: `ask_contact` ends "Expect the answer hours or days later — tell the user you will follow up." It is left unchanged.

---

## Summary table

| Item | Verdict | Reason |
|---|---|---|
| 1.1 Plan voice | needs code | Connector summary is `renderPlan`'s four-part card; it must become `planInSentences` + closing question. Text ships with it. |
| 1.2 Approve word | text-only | `APPROVE_PLAN_DESCRIPTION` (shared with app); handler takes `confirmed` and matches no word. |
| 1.3 No verbatim relay | text-only | `askQuestion`, `introMessage`, `request_introduction` sentence. |
| 1.4 Answer rules off | needs code | Remove two tool registrations; server still auto-answers in this branch, so a "switched off" text would be false. |
| 1.5 Repeated need | needs code | `already_open` must carry the waiting plan; description + `next` ship with it. |
| 1.6 Typed instruction = yes | needs code | Connector passes no thread, so the D316 check cannot see the owner's line. |
| 1.7 No card when nothing goes out | text-only | One sentence on `propose_task_plan`. |
| 1.8 Number sharing | text-only | Instructions + profile: point to the app; a connector tool would be separate code. |
| 1.9 Files | text-only | New "Lists" line; file tools would be separate code. |
| 1.10 Hello rule, voice | text-only | Instructions + four "at the start" tool sentences. |
| 1.11 Ally → Netai | text-only | 9 strings; "old Ally account"/"ally_account" kept. |
| 2.1 დავალება | text-only | One prompt string + Voice line. |
| 2.2 No false "wrote"; first person | text-only | `ask_contact` sentence. |
| 2.3 Evening-card hold | text-only | Same sentence; server already returns `sent: false` + `reopens_at`. |
| 2.4 Refund / day 15 | text-only | Description + two `netai_info` rows (DB content; read the live rows first). |
| 2.5 .vcf only | no connector text found | Nothing on the connector describes adding contacts. |
| 2.6 2/day + evening card | text-only | `ask_contact` delivery clause; inbox makes no instant promise. |
| 2.7 Later with a day | needs code | `respond_to_request` has only accept/decline. |
| 2.8 More no-verbatim paths | text-only | `responseNote`, `get_intro_status`, `check_my_inbox`. |
| 2.9 Number details | no connector text found | App-only path (see 1.8). |
| 2.10 Boundary for every asker | text-only | `save_user_note` description contradicts its own result; server already enforces it. |
| 2.11 Own label only | no change needed | Text already separates `saved_as` from crowd tags. |
| 2.12 Lookups | text-only | Surname clause + new "Lookups" line. |
| 2.13 Reply buttons | no connector text found | Connector has no buttons. |
| 2.14 Refused intro | text-only | Merged into `check_my_inbox` (2.8). |
| 2.15 First „კი" | text-only | Merged into 1.2. |
| 2.16–19 Unfinished | no change needed | Nothing proposed promises them; one existing "follow up" sentence flagged. |
