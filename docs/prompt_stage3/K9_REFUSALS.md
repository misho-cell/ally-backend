# K9 — server refusals and notes that send the model back to the owner

Read-only audit of `src/` on `claude/autonomy-stage3` at the merge of
`origin/claude/wizardly-johnson-a6orxq` (line numbers are at that tree; stage 2's
`planAdvance.ts` / `whereWeAre.ts` are not on this branch and are not counted).

Question asked of every site: **when a plan is already approved, can this text stop one of its
steps by sending the model to the owner?** Sites that only fire with no plan in force (the plan
is not yet proposed or not yet approved), or that answer a helper rather than the owner, are listed
at the end as checked and out of scope.

Groups:

- **A — keep.** It guards another person's own yes (a target, a mediator, a member's opt-out).
  No plan of the owner's can give that.
- **B — change.** It guards only the owner's yes, which the approved plan already gave. The
  replacement gives the next step instead.
- **C — keep, a true question.** The owner's own word really is needed (his data, his own
  knowledge, closing the goal, which goal), matching WHEN A QUESTION IS RIGHT (b)/(c) in the
  stage-3 prompt. It does not stop the plan's other steps.

`chat.service.ts` rows are for the lead to apply; I did not edit that file for K9.

---

## B — change (11)

| # | file:line | current text (Georgian quoted as written) | replacement |
| --- | --- | --- | --- |
| B1 | `chat.service.ts:5773` (`autonomyLine`, every goal run) | „ჯერ-კითხვა — ვინმესთვის მიწერამდე ამ თრედში დაეკითხე მფლობელს და დაელოდე თანხმობას.“ — printed for every goal whose `autonomy` is not `autonomous`, **also when a plan is approved**, right above the plan block that says the opposite. | When `planInForce(task)` is set: „დამტკიცებული გეგმა — მისი ნაბიჯები და წესები უკვე თანხმობაა: აკეთებ და მფლობელს ერთი ხაზით აცნობებ. მის სიტყვას ითხოვ მხოლოდ მონიშნულ ნაბიჯზე.“ Keep the current line only when no plan is in force. |
| B2 | `chat.service.ts:3861-3866` (`APPROVE_PLAN_DESCRIPTION`) | „…From then on, an ask to a person the plan names goes without asking again; a person outside the plan needs a plan change first.“ | „…From then on every step of the plan and every rule written in it goes without asking again — including the introduction or ask its on_named rule calls for. Only a person no step or rule brings in needs a plan change first.“ |
| B3 | `chat.service.ts:3436` (`PLAN_ANSWER_IN_WORDS`, ka; en/ru/es the same) | „approve_task_plan გამოიძახე მხოლოდ მაშინ, როცა მფლობელი გეგმას მკაფიოდ დაეთანხმება („კი", „დავიწყოთ").“ | „approve_task_plan გამოიძახე, როცა მფლობელის სიტყვები გეგმაზე თანხმობას ნიშნავს — ნებისმიერი სიტყვებით, მათ შორის როცა გადაწყვეტილებას შენ განდობს („შენ გადაწყვიტე").“ (Not a refusal, but it is the gate before the plan exists; „მკაფიოდ“ + two quoted words reads as a list, #8779.) |
| B4 | `taskAsks.service.ts:1925` (`outside_plan`) | „${toName} დამტკიცებულ გეგმაში არ არის. ეს გეგმის ცვლილებაა: propose_task_plan-ით შესთავაზე მფლობელს განახლებული სია (…), დაელოდე „კი"-ს და მხოლოდ მერე მისწერე. სიაში მყოფ ადამიანებს ახლავე შეგიძლია მისწერო.“ | „${toName} გეგმის სიაში არ არის. თუ ის გეგმის ადამიანმა დაასახელა, გაცნობა მისი გავლით ითხოვე (request_introduction) — ეს გეგმაშია. სხვა შემთხვევაში გეგმის შემდეგი ნაბიჯი გააგრძელე და მფლობელს ერთი წინადადებით ჰკითხე, დავამატოთ თუ არა ${toName}.“ Structural follow-up for the server sessions: a step with `on_named: ask` cannot pass this wall today (the named person is not in `people_to_involve`); either K3 records the name the answer gave and `planAllows` admits it for that step, or the prompt keeps on_named to `introduce`. |
| B5 | `introYesGate.ts:58` (`INTRODUCTION_WAITS_FOR_THE_YES`) | „Not sent: the owner has not said yes to being introduced to this person. Tell them in a line who was found and through whom, and ask whether to ask for the introduction; send it only after their yes. Do not tell them it went.“ | It fires under an approved plan only when the go-between is outside the plan (a second hop). Keep the refusal; the text gives the next step: „Not sent: <mediator> is not in the approved plan, so this introduction is outside it. Go on with the plan's next step now; tell the owner in one line who was found and through whom, and ask once whether to add the introduction. Do not tell them it went.“ |
| B6 | `taskEngine.events.ts:282` (mediator suggested someone else; ka/en/ru/es) | „…ეს რჩევაა და არა უარი: მფლობელს უთხარი, ვინ ურჩია და რატომ, და ჰკითხე, მივყვეთ თუ არა — მის „კი"-მდე ამ რჩევით არაფერი გააკეთო.“ | When the plan is approved and the mediator is in it: „…ეს რჩევაა და არა უარი, და გეგმის ფარგლებშია: ითხოვე გაცნობა ${mediatorName}-ის გავლით, ან, თუ ის არ სთავაზობს, შემდეგი ნაბიჯი გააგრძელე. მფლობელს ერთი ხაზით უთხარი, ვინ ურჩია და რა გააკეთე.“ No plan: keep as is. |
| B7 | `tools/requestIntroduction.ts:408` (`dormant_account`) | „…აპლიკაცია ჯერ არასდროს გაუხსნია — მოთხოვნას ვერ ნახავს, სანამ არ შემოვა. უთხარი ეს მომხმარებელს და ჰკითხე, მაინც გავგზავნო თუ სხვა გზა ვცადოთ; დასტურზე გაიმეორე accept_dormant=true-თი.“ | „…მოთხოვნას ვერ ნახავს, სანამ არ შემოვა. დამტკიცებული გეგმისას გეგმის შემდეგი ნაბიჯი გააგრძელე და მფლობელს ერთი ხაზით უთხარი, რომ ${mediatorName} Netai-ს ჯერ არ ხსნის. გეგმის გარეშე — ჰკითხე, მაინც გავგზავნო თუ სხვა გზა ვცადოთ; დასტურზე accept_dormant=true.“ |
| B8 | `tools/requestIntroduction.ts:550` (`already_accepted`) | „${mediatorName} უკვე დათანხმდა ${targetName}-თან დაკავშირებას — … უთხარი მომხმარებელს, რომ თანხმობა უკვე მიღებულია, და ჰკითხე, პირდაპირ დავუკავშირდეთ თუ რამე დასაზუსტებელია. დეტალებისთვის get_intro_status.“ | „… თანხმობა უკვე მიღებულია: get_intro_status-ით ნახე, როგორ მივწეროთ ${targetName}-ს, და გეგმის შემდეგი ნაბიჯი ახლავე გააკეთე. მფლობელს ერთი ხაზით უთხარი.“ |
| B9 | `tools/requestIntroduction.ts:556` (`already_pending`, long ignored) | „…${daysWaiting} დღეა უპასუხოდ დგას. ახალს ვერ გავგზავნი. უთხარი მომხმარებელს რამდენი ხანია და ჰკითხე, სხვა შუამავალი ვცადოთ თუ პირდაპირ მიწეროს — ნუ დატოვებ ისე, თითქოს პასუხი გზაშია.“ | „…${daysWaiting} დღეა უპასუხოდ დგას. ახალს ვერ გავგზავნი. დამტკიცებული გეგმისას გეგმის შემდეგი ნაბიჯი (სხვა შუამავალი) ახლავე დაიწყე და მფლობელს ერთი ხაზით უთხარი. გეგმის გარეშე — ჰკითხე, სხვა შუამავალი ვცადოთ თუ არა.“ (Never „პირდაპირ მიწეროს“: that is a task for the owner — RULE in task_rules STEP 6.) |
| B10 | `taskEngine.service.ts:2068` and `:2096` (silent-day wake; nightly review) | „თუ სიაში ყველას უკვე მისწერე — ეს მეთოდის შეცვლის დროა: propose_task_plan-ით შესთავაზე ახალი წრე ან ახალი გზა.“ / „თუ სამი დღეა პასუხი არ არის — მეთოდი შეცვალე: propose_task_plan-ით შესთავაზე ახალი გზა ან ახალი წრე“; both end with the fixed line „როგორც კი ვინმე გიპასუხებს, მაშინვე გეტყვი.“ | For a plan with steps (K10/K12): „თუ გეგმას შემდეგი ნაბიჯი აქვს — ის ახლავე გააკეთე. ახალი გეგმა მხოლოდ მაშინ, როცა ნაბიჯები ამოიწურა: მფლობელს ერთი ხაზით უთხარი, რა ვცადეთ, და ერთი ახალი გზა შესთავაზე.“ Closing line: „ბოლოს ერთი ხაზი: რა მოხდა და რა არის შემდეგი (გეგმის დღეებით).“ Plans without steps: keep. |
| B11 | `idleWakes.service.ts:119` (`CLOSE_QUESTION_NOTE`, five-day wake) | „ამ მიზანში ერთი კვირაა არავის არაფერი დაუწერია. მფლობელს ერთხელ, მოკლედ ჰკითხე: გავაგრძელოთ, შევცვალოთ თუ დავხუროთ — და მეტი შეხსენება აღარ გააკეთო, სანამ არ გიპასუხებს.“ | „ამ მიზანში ერთი კვირაა არავის არაფერი დაუწერია. თუ დამტკიცებულ გეგმას შემდეგი ნაბიჯი აქვს — ის ახლავე გააკეთე და მფლობელს ერთი ხაზით უთხარი. მხოლოდ თუ ნაბიჯები ამოიწურა, ჰკითხე ერთხელ: გავაგრძელოთ ახალი გზით თუ დავხუროთ.“ |

Also worth changing, wording only (soft, not a stop): `askExpiry.service.ts:60` „…ხელახლა მათ არ მისწერო ცალკე თანხმობის გარეშე.“ → „…იმავე ადამიანებს ხელახლა არ მისწერო; გეგმის შემდეგი ნაბიჯი გააგრძელე.“ and `lastReplyNote.ts:36` „…ან ერთხელ, სხვა სიტყვებით ჰკითხე…“ → „…ან გეგმის შემდეგი ნაბიჯი გააკეთე…“. Counted in B as notes, not refusals: **B = 11 + 2 soft = 13 sites.**

## A — keep: another person's own yes (7)

| # | file:line | what it guards |
| --- | --- | --- |
| A1 | `taskEngine.events.ts:489` (`awaiting_target`) „…მისი კონტაქტი ჯერ არავის გადასცემია და მხოლოდ მისი თანხმობის შემდეგ გადაეცემა…“ | the target's own yes (#8945) |
| A2 | `targetConsent.ts:52, :84, :177` | the target's yes / decline after the mediator agreed |
| A3 | `taskAsks.service.ts:1730` (`recipient_opted_out`) | the member's own stop; already gives „offer another person“ |
| A4 | `tools/requestIntroduction.ts:446` (mediator opted out) | the mediator's own stop; already gives „offer another mediator“ |
| A5 | `taskAsks.service.ts:1807` (`declined_recently`) | the recipient's recent no to this asker |
| A6 | `matchFlow.service.ts:122, :208` | both sides of a member match say yes before a name moves |
| A7 | `oneBridgeAtATime.ts:77` „…შემდეგ შუამავალს ვკითხავ, თუ ეს უარს იტყვის ან … საათში არ უპასუხებს. მომხმარებელს ეს ერთი ხაზით უთხარი; გეგმა არ იცვლება.“ | protects the target from two go-betweens at once; already gives the next step, no owner question |

## C — keep: the owner's word is truly needed (8)

| # | file:line | why it stays |
| --- | --- | --- |
| C1 | `taskAsks.service.ts:1911` (`never_contact`) | the owner's own „never“ |
| C2 | `a2aRounds.ts:51` (`ownerMustAnswerNote`) | a helper's assistant asks what only the owner knows; the third assistant-only round is his words |
| C3 | `answerNotQuestion.ts:18` | an answer in the owner's name that the model does not know |
| C4 | `chat.service.ts:12050` (wrong goal) „…თუ სხვა მიზანი უნდა, ჯერ ჰკითხე რომელი.“ | another goal — outside the plan (P4 b) |
| C5 | `chat.service.ts:2211` (`finish_task`) | only the owner closes a goal (RULE 7, P5) |
| C6 | `chat.service.ts:9440` (`THANKS_NOT_SENT`) | which helper — essential, no plan step involved |
| C7 | `debrief.service.ts:136` | after a result; asks how it worked out, stops nothing |
| C8 | `taskEngine.service.ts:2099` „თუ წინსვლა მფლობელის პასუხზეა ჩამოკიდებული — გამოიძახე ask_owner_decision…“ | keep, with one word added so it means a marked point: „…ჩამოკიდებული (გეგმის მონიშნული ნაბიჯი, ან რამე გეგმის გარეთ)…“ |

## Checked, out of scope (no approved plan in force, or not the owner)

- `taskAsks.service.ts:1569` (`consent_pending`) and `:1652` (draft waiting) — fire only while no
  plan is in force. Note for the prompt, not a change: case (2) of `:1569` says the approval
  itself starts the plan's first round, so the run must not send again — the stage-3 P2 text was
  corrected to match.
- `replyGuards.ts:407, :455-:466, :475, :491-:500` — nudges for goals with no plan / no goal yet.
- `chat.service.ts:5784` — „plan proposed, waiting for the yes“, no plan in force; `:5781` already
  says the approved plan keeps running while a change waits.
- `taskEngine.events.ts:709-:790` — the plan-proposal turn, before approval.
- `taskAsks.service.ts:4587, :4662` and the other relay texts — the helper's side.
- `requestInConversation.ts:93, :97`, `campaignInvite`, `joinerFirstMessage` — other people's
  requests to the owner, not his plan.
- `taskEngine.service.ts:2009` — already the right shape („მუშაობა მასზე არ ჩერდება … გააგრძელე
  დამტკიცებული გზები“).
- `askWaves.service.ts:292-:300`, `heldAskSend.service.ts:100`, `askWaves.service.ts:323, :352` —
  wave order and held sends; they already say the plan is the consent and ask nothing.

## Totals

| group | count |
| --- | ---: |
| B — change (owner's yes only) | 11 refusals/notes + 2 soft notes |
| A — keep (another person's yes) | 7 |
| C — keep (a true owner question) | 8 |
| checked, out of scope | 9 groups |

Of the B rows, 3 are in `chat.service.ts` (B1–B3) for the lead; B4–B11 are in other files.
