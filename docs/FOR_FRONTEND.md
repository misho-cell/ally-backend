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
