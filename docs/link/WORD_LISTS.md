# Fixed word lists on the server: every place the server reads meaning from set words

This file answers #8779 (Misho, 4 Nov) and Misho's own question in his chat the same day.
Written by the code session on 4 Nov at 13:35Z.

Paths are under `src/services/`. "chat" means `chat.service.ts`. Line numbers are as of commit 8417eb99 and will drift.

**Categories:**
- **A:** reads the owner's or a helper's words and decides.
- **B:** rewrites or drops the model's text.
- **C:** a fixed server note or tool refusal that dictates what the model must do.
- **D:** forces a tool, no tool, or a model path from keywords.

**Risk** is the risk of removing the rule without a replacement. **High** means consent to message real people, or privacy.

## 1. Consent: who gets messaged (all A or C, high risk)

| # | Rule | Where | What it decides |
|---|---|---|---|
| 1 | `APPROVE_LIKE_RE`, `isApproveLabel`, `canonicalChoiceLabel` | chat ~7099–7188 | A word stem (დამტკიც, ვეთანხმ, approve…) counts as approving a plan |
| 2 | `PLAN_YES` | chat ~7350 | A bare კი / ხო / კარგი / ok counts as a yes, while a plan card is on screen |
| 3 | `GO_AHEAD`, `saysGoAhead` | chat ~7499–7590 | Verbs (მიწერე, დაუკავშირდი, დაელაპარაკე…) of at most 6 words with no "?" count as a go-ahead. This is the „კარგი დაელაპარაკე" case |
| 4 | `TAKES_IT_BACK` | chat ~7381 | არა / ნუ / მაგრამ / თუ / but / if anywhere in the line cancels a yes |
| 5 | `ASKS_FOR_A_CHANGE`, `withdrawsTheApproval` | chat ~7419–7477 | შეცვალ… / instead / redo cancels a yes |
| 6 | `approvalBelongsToThePlan` | chat ~7614 | Combines 1–5. This is the core plan-approval gate |
| 7 | `planApprovalRefusal` | chat ~7905 | The "Not recorded…" refusals and which one the model gets (C) |
| 8 | `ownerWordsGrantPermission`, `grantPermissionRefusal` | chat ~8036 | The yes lists or a contact instruction grant permission for the goal |
| 9 | `grantFromTheOwnersInstruction` | chat ~8148 | The server grants permission itself from a regex |
| 10 | `isApproveTap`, `approvedOnTap` | chat ~8241 | A message equal to the button text approves the plan and starts day one (exact match, medium risk) |
| 11 | `looksLikeContactInstruction` (`CONTACT_VERB_RE`, `NEGATED_CONTACT_RE`) | goalIntent.ts ~459, ~813 | „ჰკითხე / მისწერე / უთხარი X" counts as consent (D316) |
| 12 | `refusedPlanOrSentAsk`, `sendInstructedAsk` | chat ~3074, instructedAsk.ts ~259, instructionUnsent.ts | On 11, the server refuses the plan and sends the question to the person itself |
| 13 | `ownerJustNamedPerson` (`BARE_YES_RE`, `YES_GO_RE`, `OFFER_TO_CONTACT_RE`) | taskAsks.service.ts ~861–950, goalIntent ~792 | „კი" to the model's „მივწერო X-ს?" counts as consent for X |
| 14 | `TAKEN_BACK_RE` | taskAsks ~917 | არა / ნუ / მოიცა / stop cancels an instruction |
| 15 | `asksToWriteToEveryone` | taskAsks ~1040 | ყველა plus a send verb lifts the 3-at-once limit |
| 16 | `DELEGATES_THE_CHOICE_RE` | delegatedChoice.ts ~8 | „შენით გადაწყვიტე / up to you" approves the plan. Missed Misho's 15:55 line |
| 17 | `instructionAwaitingItsDetail`, `answersAClarifyingQuestion` | chat ~7765 | A short answer is treated as the missing detail of the previous instruction, which then counts as consent |
| 18 | `bookingWithoutAWhen` | replyGuards.ts ~860 | A booking with no day word blocks the send |
| 19 | `asksForAPreview` (`PREVIEW_RE`) | goalIntent ~777 | მაჩვენე / show me first counts as not an instruction |
| 20 | `PLAIN_YES_RE` | introYes.ts ~12 | A go-between's bare „კი" accepts an introduction and connects two people |
| 21 | `TYPED_YES_RE`, `TYPED_NO_RE`, `HEDGED_RE` | matchCards.ts ~135 | A typed yes / no settles a match card, which asks or reveals names |
| 22 | `introductionThroughNamedBridge`, `serverIntroduces` | introFallback.ts ~105, ~167 | „ლიკას სთხოვე" makes the server send an introduction request before the model runs |
| 23 | `askOnAReachGoalAsIntroduction` | chat ~18155 | The model's ask on a "reach" goal is rewritten into an introduction |
| 24 | `askIsTheIntroduction`, `ownerWantsNoGoBetween` | introInstruction.ts ~121, ~150 | გამაცანი… refuses ask_contact, so the model uses the introduction instead (C) |
| 25 | `asksLeaveToSend`, `INSTRUCTION_UNSENT_NUDGE` | introInstruction ~34, replyGuards ~497 | Tells the model "the instruction is the consent, send now" (C) |
| 26 | `helperAskedAQuestion`, `HELPER_QUESTION_NUDGE` | replyGuards ~306 | A helper's line ending in „?" counts as consent to relay it (C) |
| 27 | `ownerLinesShareNumber`, `GIVE_WORD_RE`, `ordinalPicked` | shareNumber.service.ts ~76–258 | A helper's „ნომერი მიეცი / მეორე" sends a third person's number to the asker |
| 28 | `NEEDS_CONFIRMATION_NOTE` | chat ~2519 | Tells the model when it may send a helper's answer without asking (C) |
| 29 | `anonymousAsk` (`UNNAMED_SUBJECT_RE`, `DO_NOT_NAME_RE`) | anonymousAsk.ts ~112 | „ჩემი სახელი არ თქვა" hides the owner's name. Privacy, works with 12 |

## 2. Closing, stopping, forgetting (A, medium to high risk)

| # | Rule | Where | What it decides |
|---|---|---|---|
| 30 | `looksLikeStopRequest` (`STOP_VERB`, …) | stopIntent.ts ~39–186 | Stop words make the server stop the goal before the model runs |
| 31 | `asksToEndSomething`, `SAYS_IT_STOPPED` | stopIntent ~209–221, chat ~4818 | A goal close is refused without end words; the server forces a close on end words |
| 32 | `REOPEN_RE` | reopenIntent.ts ~6 | A goal reopen is refused without „გააგრძელე" |
| 33 | `SOLVED_WORDS`, `ownerSaysSolved` | chat ~2069 | „მოგვარდა / done" closes the goal. finish_task is refused without them |
| 34 | `HELPED_RE` | helperThanks.service.ts ~119 | „X-ის პასუხი დამეხმარა" makes the server thank X |
| 35 | `REFUSAL_WORDS`, `NEVER_WORDS` (`keepRuledOutBridges`, `keepNeverInvolved`) | ruledOutBridges.ts ~29–338 | „არასდროს X" excludes X for good |
| 36 | `ownerLineOrdersTheForget` | forgetOnTheOwnersWord.ts ~8 | „დაივიწყე" deletes without confirmation |
| 37 | `TYPED_CLOSE_RE` | openAsksAfterSolved.ts ~78 | „შეაჩერე დანარჩენი" cancels other people's open questions |
| 38 | `isTypedDecline` | typedDecline.ts ~16 | A helper's short „არ ვიცი" marks the ask declined |
| 39 | `TYPED_LATER_RE`, `BUSY_WORD_RE` | laterChoices.ts ~50 | „მოგვიანებით" postpones the ask 3 days |
| 40 | `ALL_OF_THEM_RE` | askChoices.ts ~205 | „ორივე" sends every offered person to the asker |
| 41 | `asksToChangeThePlan` | chat ~7456 | შეცვალ… pauses the next wave without saying so |
| 42 | `PROTOCOL_WORDS` | campaignInvite.service.ts ~123 | კი / არა / ვუთხარი records the invite campaign result |
| 43 | `CONFIRMATION_WORDS` | factExtraction.service.ts ~77 | „კი / სწორია" turns the assistant's sentence into a confirmed fact |

## 3. Rewriting or dropping the model's text (B, mostly low risk)

- **Plan reply:** the closing question „დავიწყო?" (`withClosingQuestion`, chat ~8979); `PLAN_TALKS_RE` (chat ~9029); `planVoice` („ჩემი ქსელი" → „შენი", planVoice.ts ~31); `introPlanOnly` and `withPlanSentence` (planJustification.ts ~60–171).
- **Claims:** „შევინახე" (savedClaim.ts, mentionedNoteLine.ts); „ვერ გაიგზავნა" (`NOT_SENT_RE`, chat ~4842); „წავშალე" (deletionClaim.ts); offers (offerClaim.ts); send claims (`claimsAnAskWasSent`, replyGuards ~191–269); `saysItSendsNowWithoutApproval` (chat ~9895).
- **Wording:** სანდო is cut (`withoutQualityTheOwnerNeverSaid`, chat ~18011; factKeeping.ts ~114–181); stage directions and waiting lines (chat ~17534); openers (replyOpener.ts); internal words (internalText.ts, noteTalk.ts, ourSideApology.ts); `withoutScores` (noScores.ts); `whyAnswer` (whyThisPersonCut.ts); the „solved?" question (answerCardGuard.ts); `askOpening` and `personFlip` on outgoing questions; `ECHOED_COMMAND_RE` ჰკითხე → ვკითხე (askedVerb.ts).
- **Health:** `withoutConditionStated` (healthDisclosure.ts ~14–142) cuts health conditions from questions to others. Privacy, **keep**.
- **Officeholders:** `applyOfficeholderGate` (officeholderGate.ts ~556) drops named officeholders that no page carried.
- **Safety:** `safetyWorry` (safetyWorry.ts ~17) puts the 112 text in place of a blocked reply. **Keep**.

## 4. Path chosen from keywords (D, low risk)

- **Small talk:** `isSmallTalk` and `isToolFreeSmallTalk` (smallTalk.ts ~21–76) switch to the small model with no tools.
- **Greeting:** `answerGreeting`, `GREETING_ONLY_RE` (serverGreeting.ts, greetingTurn.ts) answer from the server alone.
- **Lookups first:** `asksTheWeather` (smallTalk ~89), `nameAskedWhereTheyWork` (whereTheyWork.ts ~18), `roleSearchQueries` (roleWebSearch.service.ts ~60–125), `needsNoOpeningSearch` (goalIntent ~262).
- **Auto goal:** need words make a goal (`statesANeed`, `seeksAPerson`, `looksLikeGoalRequest`, goalIntent ~28–270).
- **Hidden tools:** invite tools stay hidden without მოწვევა / ტექსტი (`asksForAnInvite`, replyGuards ~790); web tools are removed for „გამაცანი X" (personByName.ts ~20–84); relay is removed when a helper recommends someone (referralRecommendation.ts ~14).
- **Discuss first:** „განვიხილოთ" keeps the turn tool-less (discussFirst.ts ~15).
- **Other:** reminders (ownerReminders.service.ts ~125); birthdays (birthdaysAsked.ts); `KNOWS_RE` (namedNonMember.ts); the registered name is shown only when asked (registeredNameOnlyWhenAsked.ts); `askKind` buttons (askKind.ts ~30).

## 5. Keep: legal and safety rules

- **WhatsApp STOP** (`STOP_WORDS`, whatsappInbound.service.ts ~35): a legal opt-out.
- **112 text** (safetyWorry.ts).
- **Health conditions cut** from questions to others (healthDisclosure.ts).
- **Phone scrubbing** (privacyScrub.ts): this is data handling, not meaning.

## The code session's proposal (for Misho to decide)

1. **Groups 3 and 4 first.** Remove them in small commits, each tested by the tester. They carry low risk.
2. **Groups 1 and 2: replace, not delete.**
   - **Keep the structural checks.** These are: which card was on screen, whether a line is exactly another card's button, and the server's record of consent.
   - **Let the model decide what the owner meant.** It passes that decision to the tool together with the owner's words it relied on, and the server records both. The word lists go.
   - **Rewrite the C notes together with them.** Several notes (25, 26, 28) tell the model it may send without asking. If the notes stay and the walls go, more would reach real people than today.
3. **One gate at a time,** each with the tester's 3/3 before the next.
