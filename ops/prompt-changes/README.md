# Prompt changes — the standing route, for the seat's edits as well as mine

**The founder does not paste prompt text. Ever.** His own words, 20 September:

> „I don't like myself to update prompts. That's your job, not mine."
>
> „It's quite annoying to make some technical work and to be all time with my
> PC and laptop. I don't like it. It's wasting my time."

He is right, and the seat's 370 asked for this to be written down rather than
arranged afresh each time. So it is.

## The route

1. **The seat writes the change** and posts it in the handoff box: the target,
   the exact new text, and why.
2. **I turn it into a change file** in this directory — `<id>.json`,
   `<id>.after.txt`, `<id>.before.txt` — and commit it. The `before` and its
   sha256 are read from production at that moment, not from a paste.
3. **`./scripts/ops/prompt.sh check <id>`** runs every refusal and writes
   nothing. It is run first, every time.
4. **`./scripts/ops/prompt.sh apply <id>`** sends it and reads the result back.
5. **I report the hash in the box.**

Nobody's hands are needed but mine, and nothing goes down the route that is
not in git first.

## Why the seat cannot simply do it themselves

Not permission — **their own tooling refuses the action before it reaches this
server**. The seat tried four ways on 20 September: the direct API write, a
second method, a write that changed no characters at all, and driving the
admin screen by hand. All four were refused on their side, and a second chat
was refused after them.

So an access grant here would be spent on nothing. The block is not mine to
lift and the work is not theirs to do. **Applying it is mine.**

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
