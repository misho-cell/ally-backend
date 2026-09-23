# The screen-by-screen checklist — row 74

What to open, what to do on it, and **the failure that leaves no mark on the
screen**. That last column is the whole reason this file exists: the seat is
very good at seeing what a screen shows and cannot see what the database
recorded a moment later, and half of everything found in the last two weeks
was the gap between those two.

Written 23 September. Every „already found this way" below is a real one.

**How to use it.** Go down the list on a phone. For each row, do the action,
then read the CHECK column — where it says „ask the backend", post the account
and the minute in the box and I will read the row or the log line back. Nothing
here needs a database login.

---

## 1 · Registration through an invite link

| | |
|---|---|
| **Do** | Open somebody's invite link on a phone that has never registered. Register. |
| **See** | The invite code is carried through every step of the form, including the one where you type the number. |
| **CHECK — ask the backend** | Did `[register] referral code arrived under: …` print, and with which key? „The client never sent it" and „it arrived and did not resolve" look identical on the screen. |
| **Found this way** | Three weeks of registrations with no inviter — `setInviteInput("")` cleared the link's code at the first step. Nobody saw it because both cases render the same. |
| **Open** | Row 229. And note: **nobody has registered through Netai since 9 September**, so this row cannot close until somebody deliberately brings a person in. |

## 2 · The first screen — typing a need

| | |
|---|---|
| **Do** | Type a real need („I need a plumber in Tbilisi"). Then, in a NEW chat, type the same sentence again. |
| **See** | The second one takes you to the goal that already exists rather than opening a second. |
| **CHECK** | A repeat must not create a second goal — and a DIFFERENT city or purpose must still create one („Kutaisi photographer" is not „Tbilisi photographer"). |
| **Found this way** | Row 242, reproduced in 43 seconds: two identical sentences, two live goals, neither pointing at the other. Five such pairs exist on real accounts, the oldest five days apart. |

## 3 · The plan and its two buttons

| | |
|---|---|
| **Do** | Approve a plan. Then say „change the plan". Then approve again. |
| **See** | The wave pauses on the change request and resumes on the new approval. What was already in flight keeps going (D119, both halves). |
| **CHECK — ask the backend** | Was `plan_change_requested_at` set, and was it CLEARED by the approval? A stale one outliving the yes that answered it is invisible. |
| **Found this way** | „Tomorrow I will be at home **instead** of the office" paused a real goal. The hold is invisible — no card, no line — so only the database says it happened. |

## 4 · Consent

| | |
|---|---|
| **Do** | Say „thanks" or „ok" on a proposed plan. Then something that is not a yes. |
| **See** | Nothing is sent. The plan stays unapproved. |
| **CHECK — ask the backend** | `plan_approved_at` must still be null. A screen that looks unchanged and a row that has been approved are the same picture. |

## 5 · The question arriving on the other phone

| | |
|---|---|
| **Do** | Have an English-writing account ask a Georgian-writing one, and the reverse. |
| **See** | The frame AND the question are in the reader's language, with `(ორიგინალი: …)` underneath. |
| **CHECK — ask the backend** | A row in `usage_events` with kind `ask_translation`, and no `[ask-relay] … UNTRANSLATED: rejected —` line. |
| **Found this way** | Twice in one day. First the translation never ran at all for eight hours and nothing said so. Then it ran and produced a Korean word inside Georgian, and a paragraph of the model talking to itself. |
| **Still needs a person** | Whether the Georgian says what the asker said. No check I can write covers that — an inverted „no need to reply" is Georgian letters and the right length. |

## 6 · Answering somebody else's question

| | |
|---|---|
| **Do** | Answer on the recipient's phone. Take the „send / send and remember" offer. |
| **See** | The card, the buttons and the confirmation are all in the recipient's language. |
| **CHECK** | The answer reaches the asker once. Not twice. |
| **Found this way** | One approval sending the same work twice (row 101, still open on Lika's phone). |

## 7 · The boundary

| | |
|---|---|
| **Do** | On one account say „never ask me about dentists". Then have another account look for a dentist. |
| **See** | That person is not named, not suggested, and not written to — including when the model reaches them through „top connectors" rather than through a search. |
| **CHECK — ask the backend** | Row 247 has three layers: the search, the plan and the send. The send layer refuses even if the first two let somebody through. |

## 8 · Introductions

| | |
|---|---|
| **Do** | Ask for an introduction with a reason, in a language the mediator does not write in. Accept it on the other phone. |
| **See** | Each of the three screens — requester, mediator, target — is in ITS OWN reader's language, including the quoted sentence inside it. |
| **CHECK** | The number-disclosure line matches what actually happened (given / not given). |
| **New today** | The quoted message, reason and answer are translated now. Before tonight only the frame was. |

## 9 · „Later" and the updates screen

| | |
|---|---|
| **Do** | Press „later" on something. Close the app. Open it the next day. |
| **See** | The item is easy to find. |
| **CHECK — ask the backend** | Opening the screen must NOT mark a weekly summary as seen — only a tap does (`POST /updates/:ref/seen`). |
| **Right now** | **96 items are due and unseen on real accounts**, 68 of them questions the product asked somebody. The oldest has waited since 28 August. That is row 73 and it is the biggest number on the board. |

## 10 · A notification on a locked phone

| | |
|---|---|
| **Do** | Lock the phone. Have a question arrive. |
| **CHECK — ask the backend** | Give me the account and the minute. Three faults look identical from the phone: no push subscription stored, a send that failed, and a send that succeeded and the OS did not show it. The log separates them; the phone cannot. |

## 11 · Quiet hours

| | |
|---|---|
| **Do** | Nothing. Watch overnight. |
| **See** | No reminder between 22:00 and 08:00 Tbilisi. |
| **CHECK** | A reminder due at night must be DEFERRED, not dropped — it should arrive after 08:00, not vanish. |
| **Found this way** | Eleven real people were reminded at night, three of them at five in the morning. |

## 12 · Profile and subscription

| | |
|---|---|
| **Do** | Cancel a subscription. Open the profile. |
| **See** | The end date and „will not renew". |
| **CHECK** | The screen must read `cancel_at_period_end`, NOT `subscription_status` — Stripe leaves the status at `active` when somebody cancels at period end. Account 4511 was told its payment was automatic on the day it cancelled. |
| **Backend** | All three fields have been in `GET /profile` for days. This one is a screen change with nothing in front of it. |

## 13 · The balance

| | |
|---|---|
| **See** | What is left, in words, and when it resets. |
| **Know this before testing it** | **There is no separate limit on asks** — the founder's D134: tokens are the one limit. Any other number on that screen is enforced by nothing. There is one brake, and it is not a cap: a per-person daily relay limit, so one contact cannot be written to over and over. |

## 14 · Contacts

| | |
|---|---|
| **Do** | Merge two contacts. Undo. Block somebody. Say „stop contacting me". |
| **CHECK** | After a block, that person must not appear in ANY of the seven searches. One shared exclusion point feeds all of them — if one search still shows them, that is a wire that does not call it, and I want the search's name. |
| **Open question** | Is the merge row (236) about the admin page or about something a normal user does in the app? There is no user-facing merge route today. |

## 15 · Voice

| | |
|---|---|
| **Do** | Press the microphone. Say one sentence. |
| **See** | It appears once. |
| **Open** | Row 226. iPhone records nothing, Android repeats the words. Audio never reaches the server as audio, so nothing on my side can see this — it needs a phone in a hand. |

## 16 · A long answer

| | |
|---|---|
| **See** | It appears as it is written, and the screen follows it down. |
| **Backend** | The server already streams: `answer_delta` events over SSE as the text is written, plus `answer_reset` when a reply is replaced. If it lands in one block, the events are arriving and nothing is rendering them. Worth opening the stream once before anybody touches my side. |

---

## The four the seat added, 19:39 — screens that changed today

Their words, kept as their own: „four screens that changed today and deserve a
line each". Every one of them is a behaviour that did not exist this morning,
which makes them the likeliest place for the next silent fault.

### 17 · Change the plan AFTER a yes

| | |
|---|---|
| **Do** | Approve a plan, then say „change the plan". Separately, say a plain sentence containing „instead" („tomorrow I'll be at home instead of the office"). |
| **See** | Nothing NEW goes out — and a reply already in flight still arrives. |
| **CHECK — ask the backend** | Was the hold stamp set by the first, and NOT set by the second? The false hold their control caught at 17:02 is invisible on every screen. |

### 18 · A second message to the same person

| | |
|---|---|
| **Do** | On a goal where somebody has already been asked, send them another sentence. |
| **See** | It goes, and reads as a follow-up rather than as the first question again. |
| **CHECK — ask the backend** | `is_follow_up` on the row. Four historical duplicates were the model rephrasing its own question, and text comparison would have caught none of them. |

### 19 · A question in another language

| | |
|---|---|
| **Do** | Ask across a language line, both directions. |
| **See** | The reader's language, with the original labelled underneath. |
| **CHECK — ask the backend** | The `ask_translation` row AND which model wrote it — **and that the reader's language came from what they last wrote.** A reader who has written nothing has nothing to read it from, which is a different fault wearing the same face. |

### 20 · The goals list on 501

| | |
|---|---|
| **Do** | Open the owner's own goal list. |
| **See** | The hidden test goals gone, and the forty that wrote to real people still there. |
| **CHECK** | Hiding is a list somebody wrote, never a rule inferred from a title or a date. Anything missing that is not on that list is a bug, not tidiness. |

---

## The three questions worth asking about any screen

1. **What did the database record?** Not „did the screen look right" — the screen and the row disagreed in four of today's findings.
2. **Which population is this number about?** Twice in one evening a count of „registrations" meant something else: six fictional seats, then one legacy Ally user. The Ally base is 62,200 accounts and people still join it; Netai's own is thirteen.
3. **If this silently did nothing, how would I know?** The translation ran for eight hours doing nothing and looked exactly like code that had not deployed. Now every crossed language line that goes out untranslated writes a line. That question is worth asking of every new thing on this list.

The seat's reply, 19:39: agreed, all three — and they are already Gate E in
their own rules (status codes before contents, which population, capped lists).
Two sets of rules arrived at the same three from opposite ends, which is the
best argument either of us has that they are the right three.
