# Prompt changes — the route for MY changes. Not for the seat's.

## Read this first: the wider version of this document was wrong for an hour

On 20 September the seat's 370 asked me to take their prompt changes as a file
and apply them, and I wrote this page saying yes. **The founder overruled it
within the hour and he is right:**

> „it's our job about prompts. Prompts belong to us, not to Misho. So it's our
> job to do it ourselves, not through Misho."

**The wording of the assistant's instructions is his domain.** Routing it
through me would put a third party in the middle of a text that is not theirs
and make every future wording change wait on somebody else's day. The seat
withdrew their own ask in 373 with the same reasoning, and named the real
cause: their tooling classifies „write a live prompt block" as a production
deploy, and that seat is not cleared for one. **Nothing in this repository can
fix that, and an access grant here would have been spent on nothing.**

Their correction on the language, which I adopt: where either of us wrote that
a write „was refused", the true word is **blocked before sending** — it never
reached this server, and „rejected by us" would put the fault in the wrong
place.

So this page is what it always should have been: **the route for the changes I
make**, which is a narrower thing.

His earlier words still stand for the changes that ARE mine — he does not
paste text for those either:

> „It's quite annoying to make some technical work and to be all time with my
> PC and laptop. I don't like it. It's wasting my time."

So when a change to a prompt is mine to make, it goes down this route and no
human types anything.

## The route

1. **The change is written down** — target, exact new text, why. When it comes
   from a ticket, the ticket is quoted in the change file.
2. **I turn it into a change file** in this directory — `<id>.json`,
   `<id>.after.txt`, `<id>.before.txt` — and commit it. The `before` and its
   sha256 are read from production at that moment, not from a paste.
3. **`./scripts/ops/prompt.sh check <id>`** runs every refusal and writes
   nothing. It is run first, every time.
4. **`./scripts/ops/prompt.sh apply <id>`** sends it and reads the result back.
5. **I report the hash in the box.**

Nobody's hands are needed but mine, and nothing goes down the route that is
not in git first.

## Why the seat's own writes do not arrive, which is not my problem to solve

**Their tooling blocks the call before it leaves**, classifying a live prompt
write as a production deploy. They followed the documented Run 27 procedure
exactly on 20 September — chunks staged, joined, length and sha checked, a
backup taken first — and everything up to the write succeeded. The block is on
their side and this server never saw the request.

**So an access grant here would be spent on nothing**, and taking the work
instead would move a decision that belongs to the founder. Their clearance
changes, or he clears the one action. Neither is mine.

## What this route is NOT

It is not „the assistant may edit the prompts". `prompt.sh` applies a change
file that is already committed — target, exact before, exact after, who
approved it and when — and refuses everything else. Its four refusals are the
point and are documented in the script's own header:

1. the live text must still match the sha the change was reviewed against;
2. any prerequisite change must already be live, verified by its own hash;
3. the change file must be committed and unmodified;
4. it must actually change something.

**The route being open is not an approval of what goes down it.** Every change
file records who approved the text and in what form — and when that approval
was a blanket delegation rather than a reading of the words, it says so. See
`216-single-item-deletion-exists.json` for the wording.

## What still needs a person

A change to a live text that **makes a promise to a user about their data,
their money, or who will be contacted** is not a wording fix. Those go to
Misho or the founder first, in the box, and the change file records the
answer. Everything else — a false sentence, a clumsy one, a missing option —
is applied on the seat's word plus the four refusals above.
