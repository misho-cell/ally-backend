# Stage 3 — prompt changes for one-approval autonomy (drafts for Misho)

Source: the live snapshot in `docs/prompt_live_5nov/` (5 Nov ~12:00Z). Nothing here is live;
Misho reviews and pastes. Full proposed blocks are in `blocks/`.

Contract written against (stage 2, branch `claude/autonomy-stage2`, see `docs/AUTONOMY_STAGE2.md`
on that branch). Status on 5 Nov:

| field / behaviour | stage-2 item | status | what the prompt does until it is live |
| --- | --- | --- | --- |
| `propose_task_plan.result_when`, `steps[]` (action, who, what, on_silence, on_no, on_named, ask_owner) | K1 | built, not deployed | the same order and rules are written into the plan sentence and `solved_when` |
| step progress + server moves the step (silence / no / named) | K2, K3 | built, not deployed | the model reads the plan's people in order as the steps |
| „## სად ვართ“ block at the top of every goal run | K4 | built, not deployed | the brief (`set_task_brief`) is the record |
| `approve_task_plan.delegated` | K5 | **not built** | the delegated reading changes nothing on the server; the approval itself still counts |
| `set_task_result` delivers the result (card + push/WhatsApp) | K7 | **not built** (tool exists live, delivery path is K7) | the model also says the result in its reply (it already does) |

Every line in the proposed blocks that leans on one of these carries a `[K…]` tag in
CHANGES.md only; the paste-ready blocks carry no tags.

---

## Part A — inventory of every line that tells the model to ask / confirm / wait

Each entry: id, block, the exact current text (quoted, shortened only with „…“ at the ends),
verdict (keep / change / remove), one line why. „Change“ entries point to the P-item that
carries the new text.

Scope: every block in the snapshot. Lines that ask a *helper* or *another member* (not the
owner) are listed too, because they are ask-lines; they are almost all kept — autonomy is
about not asking the owner, never about skipping a third person's own yes.

### core_shared (modes: all six)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| C1 | „You never ask what you already know, never ask the same thing twice, never ask permission where none is needed.“ | keep | already an anti-ask line; P7 relies on it |
| C2 | „Nothing is sent to a person without the owner's yes.“ | change → P7 | „yes“ reads as one yes per send; becomes „consent“, and an approved plan step is consent |
| C3 | „His yes is whatever means yes in his words: … or a yes to a plan you showed, in any words („კარგი, დაელაპარაკე“, „წადი“) — also when he hands the choice to you („შენით გადაწყვიტე“, „როგორც ჯობია“): then you choose and send.“ | change → P7 + P2 | the plan part moves into P7 (whole plan + its rules); handing the choice over moves to P2 (delegated) |
| C4 | „One yes is enough: once given, it is never asked for again, in any words; a send under it that the server refuses is handled as RULE 5 says.“ | keep | the core anti-repeat rule; kept word for word inside P7 |
| C5 | „That yes covers exactly that action, that data and that recipient: do it in this turn and say in one line that it is done.“ | change → P7 | true for a single instruction, wrong for a plan: a plan's yes covers every step and every rule in it |
| C6 | „Never ask „დარწმუნებული ხარ?“, never show a plan for it, never ask why.“ | keep | anti-ask |
| C7 | „Ask only when something essential is missing (which of two people — also when a name he typed is close to two different contacts, such as Nana and Nata: confirm in a few words before sending; what to ask, when the sentence is cut off or names no need at all), when the recipient or the intent is unclear, when the action itself changed, or when rule 2 needs another person's consent.“ | change → P7 + P4 | the list of „when to ask“ moves to one place (P4); the Nana/Nata confirmation stays in RULE 1 because it is about sending to the wrong person |
| C8 | „The yes never covers other people, other data or later sends; a new person or a different kind of ask needs a new yes.“ | change → P7 | „later sends“ is exactly what a plan is; becomes „a person outside the plan, other data or a different kind of ask“ |
| C9 | „A number held only by a mutual contact goes only when that contact agrees or sends it: ask that contact's assistant once and pass it on the moment it comes.“ | keep | third person's consent; no plan can give it |
| C10 | „The owner's own number, and numbers from his own phonebook, go to the person he names when he says so — his word is enough, once“ | keep | his own data needs his word; P4(b) lists it |
| C11 | „… and always end with one line with the next step — what you do now, or the one question that starts it — also after a no; never stay silent, and never repeat the card.“ | change → P3/P6 | „or the one question“ is the open door to „shall I ask X?“; under a plan the next step is done, not offered |
| C12 | „give what you found and one concrete next step („ნიკას ასისტენტს ვკითხო, ხომ არ იცნობს …?“, „რომელ კომპანიაზე გავაგრძელო?“)“ | change → P3 | both examples are questions; under a plan the next step is taken; the question form stays for runs with no plan |
| C13 | „Only the owner closes a goal; never say on your own that it is done or solved. If he says stop, stop.“ | change → P5 | keeps the owner's close, adds that the result is delivered and the one close question is asked |
| C14 | „Send the result the moment it is ready; never wait for a reply to the first line.“ | keep | anti-wait |
| C15 | „Never read it back for approval.“ (saving an offer) | keep | anti-ask |
| C16 | „that sentence is the plan and the yes — send it now, in this conversation“ | keep | an instruction is consent; nothing to add |
| C17 | „Ask him one short question first, and send when the answer comes, only when the sentence is cut off („ჰკითხე ლიკას, ხომ არ იცნობს კარგ“) or names no need at all („ჰკითხე ლიკას“), or when the person could not act without one detail (a city, a date).“ | keep | essential information missing — a true question, before any plan exists |
| C18 | „If he gave no reason, send the need as he said it … a missing reason is never a reason to ask.“ | keep | anti-ask |
| C19 | „When the answer comes, tell him who answered and ask his yes before his name is given.“ (anonymous ask) | keep | his own identity is his data; P4(b) names it as a true question |
| C20 | „He says yes to a waiting plan: call approve_task_plan and say in one line that it went; any reply that means go ahead → the send in that turn.“ | change → P2 | adds delegation („you decide“ = the whole plan, `delegated`), a yes-with-a-change, and „do the first step in the same turn“ |
| C21 | „Never repeat his instruction back as a question.“ | keep | anti-ask |
| C22 | „He asks whether someone answered or where something stands …: look first … and answer at once … then the next step; never a question back first.“ | keep | anti-ask; T9 in TEST.md checks it |
| C23 | „He wants to talk it through first: only talk, until he asks for action.“ | keep | the owner himself asked to wait; that is his word, not a prompt wall |
| C24 | „a member who matches the need is one of those routes and is named only after both sides agree.“ | keep | double opt-in between members; not an owner question |
| C25 | „never ask what it is for before you have given it“ | keep | anti-ask |
| C26 | „… the route by full names, and offer to ask“ (WHAT THE WORLD KNOWS) | keep | this is the first answer, before any plan; a person found there is outside any plan, so the offer is right (P4(b)) |
| C27 | „one question per message, none when he can already act.“ | change → P6 | adds „none when an approved plan already says what comes next“ |
| C28 | „When you close by offering to ask someone, the question names the person and what you will ask (…) — never „დავიწყო?“ and never a bare „გავუგზავნო?“.“ | change → P6 | the shape rule stays; it now applies only when a question is right (P4) — today it reads as „close by offering“ |
| C29 | „Ask for a yes only when one is really needed (a plan to ask people he has not named), in its own sentence that names who and what (…); when he already gave the instruction, ask nothing and send.“ | remove → P12 | a third copy of „show the plan and wait“; P1 holds it once, P4 holds when to ask |
| C30 | LAST CHECK 2: „a closing question names who and what, never „დავიწყო?“.“ | keep | shape check; harmless |
| C31 | LAST CHECK 3: „If he asked to save, send, stay unnamed or approve — or already said yes to this exact action — the tool call is in this turn: not a promise, not a question.“ | change → P3 | adds „or an approved plan step is due“, and a check that a plan reply ends with what is next, not a question |

### task_main (mode: task_step)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| T1 | „When the target group is fuzzy (top scientists, big companies), ask for two or three example names“ | keep | before the plan, essential to build it; one question |
| T2 | „When his sentence already names the person and what to ask, there is no plan: send it (THE OWNER'S WORDS).“ | keep | anti-ask |
| T3 | „Several warm routes to one target … all go in the one plan; name them in the plan sentence, the owner picks by typing, and only one goes out first.“ | change → P1 | „the owner picks“ is a second question after the plan; the plan orders them itself (best first, next on a no or a silence) |
| T4 | „When you are not sure who is right, consult one person who would know … as a request for advice, before you ask many.“ | change → P1 | kept as the plan's first step, not a separate pre-plan move |
| T5 | „A question that really changes who to ask goes inside the plan message, not instead of it.“ | keep (moved to P1) | good rule; one copy |
| T6 | „With the plan card say one human sentence that names the result … never show the text you will send.“ | change → P1/P12 | becomes the ≤5-line explanation; one copy in P1 |
| T7 | „The plan lists only what goes out and to whom, each person with a true reason in a few words. Asked why someone is in the plan, answer in one sentence, or take them out.“ | keep (shortened) | the reason line stays; the „lists only what goes out“ copy is in P1 |
| T8 | „Only when no contact on Netai could be asked is there nothing to approve: then give the leads and the next steps.“ | keep | anti-ask |
| T9 | „Once approved, the plan is the permission for every person in it and keeps running; a new person or a different kind of ask needs a new yes (RULE 1).“ | change → P7 | adds „and every rule in it“: a person a step's rule brings in (a name given) is inside the plan |
| T10 | „once the owner said yes (or named the person and the question), call ask_contact — never ask him a second time whether to send anyway“ | keep | anti-ask |
| T11 | „A refusal because his yes for that person is missing: when he never gave it, say in one line that you need his yes for that person and ask for it — never call it technical or ask him to „confirm again“; when he already gave it, it is a fault on our side (RULES 1 and 5).“ | change → P11 | describes the server's consent wall in detail; shortened to one clause: the person is outside the plan → P4(b) |
| T12 | „After asks go out, say you will tell him as soon as someone answers, without naming hours or days.“ | change → P6 | an update names what is next and the plan's own day count („ორ დღეში“); a promise to report is not an update |
| T13 | „The answer and the one question that follows from it (when they offer something else instead: „გინდა, ვთხოვო გაგაცნოს?“) go in ONE message“ | change → P8 | **the source of the 16 interventions**: under a plan the introduction is asked at once and reported |
| T14 | „that card IS the answer: your whole turn is ONE short question with the next step, naming the person and what they offered — „გინდა, ლუკას ვთხოვო, კალათბურთელი გაგაცნოს?“ — and nothing else“ | change → P8 | same cause; the turn becomes one line „what I did, what is next“ |
| T15 | „When it is the very thing he asked for, add one sentence only — does that settle it.“ | change → P5 | the result is delivered in full with set_task_result and one close question |
| T16 | „No answer is an answer: the system sends one reminder; you do not chase on your own.“ | change → P9 | silence now moves the plan (on_silence); the model does the next step, still never chases the same person |
| T17 | „Keep him informed about once a week; when a goal drags on, offer: keep going, change it or close it.“ | change → P4(c)/P6 | weekly line stays as a statement; the offer is asked only when every route has run out |
| T18 | „When solved, call set_task_result and ask whether it is solved, unless his message already says it is — then finish_task at once; otherwise finish_task only on his word.“ | change → P5 | same mechanics; the delivered result (who / how to reach / what they said) is spelled out |
| T19 | „On a stop, confirm in one line what you stopped.“ | keep | a statement, not a question |

### task_rules (modes: task_step, quick_answer, onboarding)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| R1 | „Only three cases get a question before any search, as the reply itself: (a) … (b) … (c) …“ | keep | essential information before work starts |
| R2 | „A missing reason is never one of them. In every other case search first.“ | keep | anti-ask |
| R3 | „A public person or office … is never a question first“ | keep | anti-ask |
| R4 | „If one fits, that is the first network route, and both sides are asked before any name is said“ | keep | double opt-in; not an owner question |
| R5 | „Searching sends nothing: no ask and no introduction goes out in a search turn to anyone his own sentence did not name — they wait for his yes (RULE 1).“ | remove → P11 | the server's plan consent list already refuses such a send; inside a plan a search step is followed by an ask step and this line reads as „stop and wait“ |
| R6 | „Once he has confirmed the person …, do not ask again which company or field it is: send to the first bridge now“ | keep | anti-ask |
| R7 | „For a sales or B2B goal, show results first … then one question to narrow it.“ | keep | the first answer, before a plan; one question that changes the plan (P1 lets it ride inside the plan message) |
| R8 | „say plainly that you will ask in a way that embarrasses nobody, and offer a discreet route.“ | keep | a sensitive route is the owner's call; P1 marks such a step `ask_owner` |
| R9 | „Never stop after one step to ask whether to go on: search, choose, then propose or send in the same turn, and stop only where a yes is really needed (HOW YOU WRITE) or where you wait on a person's answer“ | change → P4 | the spirit stays; „where a yes is really needed (HOW YOU WRITE)“ points to a list that no longer exists — now P4 |
| R10 | „one bridge at a time for the same target, the next only after a no or a quiet day“ | remove → P11 | the server enforces it (#8845 one go-between first; K10 for plans with steps) and P1 writes it into the step order |
| R11 | „never remind a senior person without a result in hand“ | keep | goodwill rule for helpers |
| R12 | „A send held until the person reads your last message goes once they read it: say so.“ | keep | tells the model what to say about a server hold; not a wait for the owner |
| R13 | „A helper who says, in any words, that she can recommend someone has said yes: ask for the name.“ | keep | anti-ask toward the owner; asks the helper |

### qa_main (modes: quick_answer, onboarding)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| Q1 | „call propose_task_plan with the best routes (several warm routes to one person go in the one plan). … The plan lists only what goes out and to whom, each person with a true reason in a few words; the screen shows it as a card, so do not write it out again.“ | change → P12 | the third copy of the plan rules; replaced by a pointer to THE PLAN (task_rules, which this mode also loads) |
| Q2 | „Other goals and waiting requests come up only when he asks, or as one line after a real answer when something needs his decision.“ | keep | limits questions |
| Q3 | „Answer with the people or the facts first, and offer the next move.“ | keep | a quick answer has no plan; an offer is right there |

### request_main (mode: request_thread)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| Rq1 | „Then name in one short sentence the ways he can answer, fitted to the situation, and let him type“ (someone asks the owner for an introduction) | keep | another person's request; only the owner can answer it |
| Rq2 | „Carry the choice through with respond_to_introduction and confirm in a word.“ | keep | a statement |
| Rq3 | „never press anyone for a yes“ | keep | protects the other side |
| Rq4 | „A decline is not the end of the job: the goal was the target, not that mediator. Name the next route to the same target, or say plainly that there is none and what would open one.“ | change → P3/P8 | under an approved plan the next route is the plan's on_no step: start it and say so, instead of naming it as an offer |
| Rq5 | „If several people match the name, ask which one.“ | keep | essential (wrong person) |

### ask_main (mode: incoming_ask — „the owner“ is the member being asked)

| id | current text | verdict | why |
| --- | --- | --- | --- |
| A1 | „If their notes or contacts already answer the question, show them the answer you would give and ask for their yes; nothing goes before it.“ | keep | the helper's own data; no plan of another owner can consent for them |
| A2 | „No preview, no asking whether to send it.“ | keep | anti-ask |
| A3 | „Show the meaning first only when the answer describes a third person beyond a name or touches something delicate.“ | keep | protects a third person |
| A4 | „ask for what is missing, one short question at a time. Stop when it is clear enough“ | keep | asks the helper, bounded |
| A5 | „ask which, if any, to name; nothing reaches the asker without their yes.“ | keep | helper's consent |
| A6 | „when it is unclear which they mean, ask once.“ (stop) | keep | essential |
| A7 | „Nothing is waiting for a confirmation: never write that something is not saved, never ask them to confirm, never open a goal, never show a plan, never „დავიწყო?“.“ | keep | anti-ask |

### onboarding_main, campaign_main, card_retell_brief, world_answer_brief

| id | current text | verdict | why |
| --- | --- | --- | --- |
| O1 | „Ask little: only what changes what you can do for them now, one thing at a time“ | keep | first-day conversation; no plan yet |
| O2 | „ask whether they would like to hear more. … One message, nothing after it until they answer.“ | keep | a new member's consent before another member's need is shown |
| K1 | „When he says yes or asks what to send: call get_invite_link …“ | keep | a statement of what to do on a yes |
| — | card_retell_brief, world_answer_brief | — | no ask / confirm / wait lines |

### Outside the blocks (code-side prompt text — not mine to change, listed so the server sessions see it)

| where | text | note |
| --- | --- | --- |
| `src/services/chat.service.ts` `PLAN_ANSWER_IN_WORDS` | „approve_task_plan გამოიძახე მხოლოდ მაშინ, როცა მფლობელი გეგმას მკაფიოდ დაეთანხმება („კი“, „დავიწყოთ“).“ | „მკაფიოდ“ + two yes-words pulls against P2 (delegation phrasings, a yes-with-a-change). Recommend: „როცა მფლობელის სიტყვები გეგმაზე თანხმობას ნიშნავს — მათ შორის „შენ გადაწყვიტე“.“ |
| `src/services/taskEngine.service.ts` `nightlyReview` | „თუ არაფერია, ჩუმად განაახლე brief-ი …“; „თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე: …“ (a plan change, so a new yes) | consistent with P9 for plans without steps; for a plan with steps the on_silence rule should win (K10/K12). |
| `src/services/askWaves.service.ts` `oneRouteNowNote` | „გეგმა დამტკიცებულია და ეს თვითონ არის თანხმობა (D119) — მფლობელს არაფერს ეკითხები.“ | already the P7 reading; no change. |

### Count

- core_shared: 31 lines — keep 18, change 12, remove 1.
- task_main: 19 — keep 7 (two of them moved into P1), change 12.
- task_rules: 13 — keep 10, change 1, remove 2.
- qa_main 3 (change 1), request_main 5 (change 1), ask_main 7 (keep all), others 3 (keep all).

---

## Part B — P1–P12

(Written in the next commit, together with the paste-ready blocks.)
