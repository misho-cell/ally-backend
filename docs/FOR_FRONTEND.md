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

## 10 October, 12:15Z — the founder's answers (D772, D773) and the test push, on Misho's yes (patch 0088, not live yet)

- **`GET /contacts` rows gain `phone`** (D772, the founder's option გ): the full number as `+digits`, e.g.
  `{ "id": "c_Zq3…", "name": "ნინო ბერიძე", "phone": "+995599000001", "on_netai": true }`. Use the `id` for the page URL as before. The number
  never needs to be in a URL.
- **`GET /contacts/:id` gains `public_facts`** (D773): what is public or published about the person, each with its source:
  `"public_facts": [ { "field": "employer", "value": "TBC Bank", "source_url": "https://…", "fact_date": "2026-05-01" } ]`.
  `source_url` and `fact_date` can be null. It is empty for most contacts, and never holds what other members saved.
- **`POST /setup/test-push` is ON** (BI): 200 `{ "sent": true }`, or 404 with no subscription yet. The „did it arrive?" step can be built.
- **The monthly reminder (D771)** will be the assistant's own words in the chat, not a push text. Its instruction waits for Misho's yes
  on the exact wording. The profile switch stays as it is until I write here.

## 10 October, 11:45Z — item 10 of your 06:30Z list (1882): setup state per person and gadget, and a test push (patch 0080, not live yet)

```
GET /setup/state
→ 200 { "success": true, "data": {
    "done_count": 3, "total": 5,
    "server":  { "install": false, "notifications": true, "contacts": true, "freshness": false, "connector": true },
    "devices": [ { "device_id": "ph-7f3a", "gadget": "iphone",
                   "steps": { "install": "done", "freshness": "later" }, "updated_at": "2026-10-10T11:40:00.000Z" } ] } }

PUT /setup/devices/ph-7f3a/steps/install    { "gadget": "iphone", "status": "done" }
→ 200 with the same shape, already updated
→ 400 an unknown step, gadget or status, or a device id that is not 1–64 of A–Z a–z 0–9 _ -

POST /setup/test-push
→ 200 { "sent": true }   ·   404 no notification subscription yet   ·   403 not switched on yet (see below)
```

- **Steps:** `install`, `notifications`, `contacts`, `freshness`, `connector`. **Gadgets:** `iphone`, `android`, `windows`, `mac`, `other`.
  **Statuses:** `done` (Done), `failed` (It didn't work), `later` (Later).
- **`device_id`:** yours to make. A random id kept in the browser's storage is enough. It only tells this person's gadgets apart.
- **`server`:** what Netai sees for itself, whatever anyone tapped:
  - `contacts`: an import brought contacts in;
  - `freshness`: the monthly switch is on;
  - `notifications`: a push subscription exists;
  - `connector`: same as `/connector/state`;
  - `install`: always false, because only the gadget can tell.
- **`done_count`:** a step counts once, if the server sees it or any gadget said `done`. That gives your „2 of 5 done".
- **The test push is OFF.** Its line is new text for real people and waits for Misho's yes (BI). Until then the route answers 403. Draw the
  „did it arrive?" step only after I write here that it is on.
- Login only, with no subscription needed (setup comes first). 30 calls a minute, and 3 test pushes a minute.
- The admin side has `GET /admin/setup-funnel`, which counts people per gadget and step.

## 10 October, 11:10Z — item 4 of your 06:30Z list: „ჩემი კონტაქტები" and a contact's page (patch 0079, not live yet)

Your FOR_TORNIKE.md went into the tester box word for word at 10:40Z (box 50854). Misho's word to me was to finish everything you need,
so item 4 is built now in the **narrowest shape** you offered Tornike: list option ა (name and the Netai mark, no number), page option
დ (only the person's own labels, closeness and facts). If he picks ბ or გ, that is one field added to the list rows, and I'll write it here.

```
GET /contacts?q=ნინო&limit=50&cursor=<next_cursor>
→ 200 { "success": true, "data": {
    "contacts": [ { "id": "c_Zq3…", "name": "ნინო ბერიძე", "on_netai": true },
                  { "id": "c_8Lk…", "name": null, "on_netai": false } ],
    "next_cursor": "NTA" } }
→ 400 limit outside 1–100, or a cursor this list did not give

GET /contacts/c_Zq3…
→ 200 { "success": true, "data": {
    "id": "c_Zq3…", "name": "ნინო ბერიძე", "role": "ბუღალტერი · TBC", "on_netai": true,
    "labels": ["ბუღალტერი"], "warmth": "warm",
    "facts": [ { "field": "occupation", "value": "ბუღალტერი", "saved_at": "2026-09-01" } ],
    "exclusions": [ { "excluded_for": "office in Rustavi", "reason": null } ] } }
→ 404 an id that is not one of this person's contacts
```

- **`id`:** an opaque reference, the same one the Claude connector uses. It is tied to this person, so it is useless to anyone else. No
  phone number is in any response.
- **`name`:** the name the person saved. It is `null` when the saved label has no letters (a number or a symbol). Draw „…" or the Netai
  mark. The list is sorted by name and skips contacts marked deceased. `q` matches anywhere in the name, as typed.
- **`next_cursor`:** pass it back as `cursor`. It is `null` on the last page.
- **`warmth`:**
  - `warm`: a tie the person confirmed (old Ally green/blue, allies/loyal, or told Netai „close").
  - `distant`: they marked it red.
  - `neutral`: everything else. A computed score never decides.
- **`role`:** from the person's own occupation/employer facts, otherwise `null`.
- **`facts`:** only what this person saved, newest first within each field.
- **`exclusions`:** the goals this contact was kept out of, in the words the person used.
- **The topic boundary is not here, on purpose.** A boundary is the contact's own private setting, and the person asking is never told
  one exists (D421). The design's „topic boundary as a saved field" cannot show another person's boundary. Tell me if the design meant
  something else, such as the person's own note about a contact.
- Login and subscription as the rest of `/contacts`. 60 calls a minute. Status codes: 200 / 400 / 401 / 404 / 500.

## 10 October, 09:45Z — items 7 and 8 are LIVE; your 09:30Z read matches

- **Item 7:** `GET` / `PUT /contacts/import-state` went live with 0074 (6b227e0) at 09:20Z. The monthly reminder switch saves, but no
  reminder is sent yet.
- **Item 8:** `GET /connector/state` went live with 0076 (a4e835d) at 09:29Z. Ops checked that it answers 401 without a login.
- **Your 09:30Z:** your routes board and the role fallback match the contract. `incoming_request` is the mediator, as you now have it.
- **Still open from your 06:30Z list:** item 4 (contacts list and page) waits for Misho's word on what it may show. Items 9 and 10 are not
  started.

## 10 October, 09:25Z — re your 08:55Z: the evening hour and the story lines are LIVE

- **Item 6:** `GET` / `PUT /evening-card/hour` went live with 0069 (b5f022a) at 08:23Z. PUT answers `{ hour }` read back after the save,
  which is the value you show. `null` comes back as 19.
- **Item 5:** `lines` on `GET /updates/count` went live with 0073 (4dec3ed) at 08:35Z.
- **Next to ship:** items 7 (0074) and 8 (0076), from 09:16Z in ops' order. I'll write here as they land.

## 10 October, 09:15Z — item 8 of your 06:30Z list: the connector state (patch 0076, not live yet)

```
GET /connector/state
→ 200 { "success": true, "data": { "connected": true, "last_seen_at": "2026-10-10T08:00:00.000Z" } }
```

- **`connected`:** the person's Claude connector holds a grant that has not been revoked and can still refresh. That stays true for 30 days
  after the last use.
- **`last_seen_at`:** the newest grant. One is issued at login and again at every refresh, and an access token lives one hour, so a
  connector in use moves at least once an hour. It is null for someone who never connected, and it keeps its value after a disconnect.
- Login is required. 30 calls a minute. Status codes: 200 / 401 / 500. No token is ever read out.

## 10 October, 09:00Z — re your 08:20Z: `plans` is LIVE

- **`GET /billing/offer` → `plans`** went live with 0064 (79cfc81) at 08:16Z. Ops checked it live: `pro` 19.99 and `enterprise` 79.
  Your pages switch on their own, as you said.
- **Also live:** items 2 and 3, `GET /threads/:id/routes` (0066, 7dc62ad) and `role` on `GET /threads` (0067, 46c9f74), since
  ~07:05Z today. The tester passed both.
- **Queued in ops' chain, not live yet:** item 6 (0069), item 5 (0073) and item 7 (0074). I'll write here as each one ships.
- **Next from me:** item 8, the connector state. Item 4 (contacts list and page) waits for Misho's word on what the page may show.

## 10 October, 08:45Z — item 7 of your 06:30Z list: the contact sync page (patch 0074, not live yet)

```
GET /contacts/import-state
→ 200 { "success": true, "data": { "last_import_at": "2026-10-01T09:00:00.000Z", "last_import_count": 412,
                                   "count": 420, "monthly_reminder": false } }

PUT /contacts/import-state   { "monthly_reminder": true }
→ 200 with the same shape, already updated
→ 400 { "success": false, "error": "monthly_reminder must be true or false" }
```

- **`last_import_at`:** the last import that actually brought contacts. An import still running, or one that brought nothing, does not
  count. It is null for someone who never imported.
- **`last_import_count`:** how many contacts that import brought. **`count`:** how many distinct numbers the person holds now, from every
  import.
- **`monthly_reminder`:** the person's own switch, off by default. **The reminder itself is not built yet.** Its push text waits for
  Misho's yes, so for now the switch is saved and nothing is sent. I'll write here when the push goes.
- Same login and subscription as `POST /contacts/import`. Both routes answer 30 calls a minute. Status codes: 200 / 400 / 401 / 500.

## 10 October, 08:20Z — item 5 of your 06:30Z list: the story lines on `GET /updates/count` (patch 0073, not live yet)

`GET /updates/count` gains one field, `lines`. It holds at most 3 strings: the first updates that are due, oldest first, one line each.
It is still read-only, so nothing is released or marked seen.

```json
{ "success": true, "data": { "due": 4, "held": 2, "followed": 1,
  "lines": ["ოფისი რუსთავში — ლევანმა უპასუხა", "Weekly summary — 3 goals, 1 waits on you"] } }
```

- **Each line** is the card's own `title`, then „ — " and its `detail` when the card has one. It is the same text `GET /updates` would
  draw for that card, with no new wording.
- **Language:** the same rule as `GET /updates`. Your `X-Locale` comes first, then the one we infer.
- **Empty:** `lines: []` when nothing is due. `due` can be larger than the number of lines; draw „+N" from the difference if you want it.
- **Status codes:** unchanged, 200 / 401 / 500.
- **Live:** not yet. Patch 0073 on our side; I'll write here when ops ships it.

## 10 October, 07:20Z — item 6 of your 06:30Z list: the evening hour as a setting (patch 0069, not live yet)

`GET /evening-card/hour` → `{ "success": true, "data": { "hour": 19 } }` (19 when the person never set one).

`PUT /evening-card/hour` with `{ "hour": 21 }` → 200 and the stored value back. `{ "hour": null }` resets it to 19.
- **Range:** a whole hour from **8 to 22**, in the person's own time zone. Anything else is 400 with a plain message. The bounds keep the
  card's push out of the night's quiet hours.
- **When it applies:** from the next card on. A card already made for today keeps its time.
- **Access:** the person's own login, the same as `GET /evening-card`. 500 with a plain message on a server fault.

---

## 10 October, 07:00Z — re your 06:30Z (Misho, the full list): items 2 and 3 built; the order for the rest

**Item 1, `plans` in `/billing/offer`:** see 06:20Z below (patch 0064).

**Item 2, the routes board (D722): `GET /threads/:id/routes`** (patch 0066, not live yet). It is keyed by the thread id, as you asked.
```json
{ "success": true, "data": { "routes": [
  { "ask_id": 41, "kind": "ask", "person_name": "ნინო", "role": "addressee",
    "state": "answered", "summary": "კი, ვიცნობ ერთს", "updated_at": "2026-10-10T06:00:00Z" },
  { "ask_id": 9, "kind": "introduction", "person_name": "გელა", "role": "mediator",
    "state": "confirmed", "summary": "ნანა", "updated_at": "2026-10-10T05:30:00Z" }
] } }
```
- `state`: `waiting` | `answered` | `declined` | `confirmed` (an accepted introduction) | `closed` (expired or cancelled). I added
  `closed` to your four, because an ask that ran out is none of them.
- `summary`: for an ask, the answer as the owner already reads it in the chat (numbers scrubbed), at most 200 characters, or null while
  there is none. For an introduction, the person asked for.
- `person_name`: the owner's own saved name, or null when they saved none.
- `ask_id` together with `kind` is the row's key. An ask and an introduction can share a number.
- **No `ask_thread_id`.** That thread belongs to the person asked, and the owner cannot open it. The owner's side of every route is this
  same conversation.
- Fewer than two rows, no goal on the thread, or not this user's thread: `"routes": []`, meaning no board. 400 for a bad id, 500 with a
  plain message. It sits behind the same login and subscription as `/messages`.

**Item 3, the role on each `GET /threads` row** (patch 0067, not live yet). The new field is `"role": "initiator" | "mediator" |
"addressee" | null`.
- `mediator`: an introduction request came to this person, in the request's own thread or in a conversation it was written into.
- `addressee`: someone's goal asked them.
- `initiator`: their own goal or their own introduction request.
- `null`: a plain conversation.

**The rest, in the order I take them:**
- **5:** a summary line on `/updates/count`.
- **6:** the evening hour as a setting.
- **7:** the contact import state.
- **4:** contacts list and page. It touches what may be shown about other people (phone numbers, labels), so I bring its shape to Misho
  first.
- **8:** connector state. I look at what the connector already records.
- **9 and 10:** wait until their features exist, as you say.

Each gets its own section here when it is built. **Checked:** none of 4–8 exists today under another name.

---

## 10 October, 06:20Z — re your 05:10Z (Misho: plan prices from the server): `plans` in `GET /billing/offer` (patch, not live yet)

Your name is kept: `plans.pro` and `plans.enterprise`, USD a month, as numbers.
```json
{ "success": true, "data": {
  "card_trial_days": 5,
  "invite_free_days": 20,
  "plans": { "pro": 19.99, "enterprise": 79 }
} }
```
- Read from `provider_prices` rows `subscription.price.pro` and `.enterprise`. A month bought with the referral balance is charged from the
  same rows. Live today they hold 19.99 and 79.00.
- A tier with no row (or 0) comes back as `null`. Keep your own value then, as you already do.
- Everything else on the route is unchanged: public, 30 a minute, a 500 with a plain message on a failed read.
- **One thing to know:** a card subscription is charged at the price set in the payment provider, not from these rows. If someone changes
  one and not the other, the page follows these rows. I am flagging it to ops so both are changed together.

Status: on branch `claude/ally-app-docs-ctezil`, handed to ops as a patch. I will post the LIVE commit here.

---

## 10 October, 04:40Z — 4126 item 5: „facts about me", one screen (on branch, ships by day)

Misho's yes, 9 Oct: a person sees every fact kept about their own numbers, and removes any of them. Both routes need the user's JWT and
live under `/privacy`, next to „my data".

**`GET /privacy/facts-about-me`** → 200
```json
{ "success": true, "data": { "facts": [
  { "id": 9, "field": "employer", "value": "Acme", "origin": "research",
    "source_url": "https://a.example", "date": "2026-10-04", "status": "possible" },
  { "id": 12, "field": "occupation", "value": "ბუღალტერი", "origin": "saved_by_someone",
    "source_url": null, "date": "2026-09-01", "status": null }
] } }
```
- `origin`: `research` (found on a public page), `label` (read from how someone saved the number), `saved_by_someone` (a contact told Netai).
  **Who saved a fact is never sent**, and the screen should not suggest it.
- `status` is set only on research facts: `confirmed` / `possible` / `rough` / `unknown`. Show `possible` as possible, with `source_url` and `date`.
- At most 200 facts, newest first. An empty list is `"facts": []`.

**`DELETE /privacy/facts-about-me/:id`** → 200 `{ "success": true, "data": { "removed": true } }`
- 404 when the fact is not about this person, or is already gone. 400 for an id that is not a number. 500 on a server fault.
- The removal is for good: the fact disappears from search and from every list, and neither the saver nor a research reload brings it back.

Status: on branch `claude/ally-app-docs-ctezil`. It ships by day, because it removes data and newly shows people what is kept about them.
I will post the LIVE commit here.

---

## 9 October, 21:50Z — re your 21:30Z (Misho: both free periods on the pricing page): `GET /billing/offer` (patch, not live yet)

Public: no token needed, because the pricing page is read signed out. 30 requests a minute per address.

```json
GET /billing/offer
200 { "success": true, "data": { "card_trial_days": 5, "invite_free_days": 20 } }
200 { "success": true, "data": { "card_trial_days": 5, "invite_free_days": null } }
429 too many · 500 { "success": false, "error": "Could not read the offer" }
```

- `card_trial_days` is the card trial the server gives (env `STRIPE_TRIAL_DAYS`, 5 today).
- `invite_free_days` is the days an invitation carries. It is `null` while the dashboard switch `invite_free_days_on` is off, or the value is 0. Read on live at 21:48Z: switched on, 20.
- Both come from the same place the grant does, so a dashboard change shows on the page at once.

---

## 9 October, 19:45Z — re your 19:30Z (D699): `GET /status/assistant`, the real „online" dot (patch, not live yet)

Authenticated (the usual bearer token), 20 requests a minute per person. It reads two rows and costs nothing, so polling every few minutes is fine.

```json
GET /status/assistant
200 { "success": true, "data": { "state": "answering", "since": null, "checked_at": "2026-10-09T19:41:07.000Z" } }
200 { "success": true, "data": { "state": "not_answering", "since": "2026-10-09T19:02:11.000Z", "checked_at": "2026-10-09T19:02:11.000Z" } }
200 { "success": true, "data": { "state": "unknown", "since": null, "checked_at": "2026-10-09T18:20:00.000Z" } }
401 no or bad token · 429 too many · 500 { "success": false, "error": "Could not read the assistant status" }
```

- **`answering`:** the AI provider answered within the last 45 minutes, counting any real reply or the heartbeat probe. The heartbeat probes after 25 quiet minutes and looks every 10, so a healthy server is never staler than that. `checked_at` is that last answer.
- **`not_answering`:** the heartbeat heard a refusal (`provider_refusing` incident open), and nothing has answered since. `since` is when the refusal began (the „…-დან" in your line). `checked_at` repeats it. **Do not age this state out on `checked_at`:** failing probes do not restamp it, and the line must stay up until the server says otherwise.
- **`unknown`:** no answer in 45 minutes and no refusal on record (for example, the heartbeat itself stopped). The server already does the ageing, so draw nothing. `checked_at` is the last answer ever seen, or null.
- **On 500 or a network error,** draw nothing, the same as `unknown`.

What it does **not** cover: it speaks for the AI provider only. The API being down shows up to you as the request failing. Login codes and the database are not probed (outageDetect.service.ts says so too).

---

## 9 October, 03:00Z — #1688 part 2: the „other" box starts with the prepared line (on branch, not live)

`GET /threads/:id/messages` — one additive field. On the **newest assistant message that has an „other" button**
(`other_choice_index` present), while the reader's live ask in this thread has a prepared line (#1695), the message
carries:

```json
{ "id": 812, "role": "assistant", "choices": ["კი", "არა", "სხვა"], "other_choice_index": 2,
  "other_prefill": "კი, ვაკეთებ საბაჟო გაფორმებას საკვების ექსპორტიორებისთვის." }
```

- When the reader taps the button at `other_choice_index`, open the input **with `other_prefill` in it**, cursor at the end,
  instead of empty. Nothing is sent until he sends.
- Absent on every other message, and absent when there is no prepared line — then the box opens empty, as today.
- Status codes unchanged (200 / 401 / 403 / 404 / 500). The field is best-effort: a failed lookup leaves it out.
- Live: not yet — branch `claude/ally-app-docs-ctezil`; it ships after #1695 (91d79cb). I will say here when it is live.

## 9 October, 02:00Z — re your 01:55Z (#859): 501's three push rows

Read from production, read-only. Endpoints are left out (they are tokens); all three go to `fcm.googleapis.com`.

| row | device_id | created | last_seen_at | user_agent |
|---|---|---|---|---|
| A | none | 30 Jul | 30 Jul (never moved) | none |
| B | yes | 4 Sep | 8 Oct, 06:11Z | Android 10, Chrome 154 **Mobile** |
| C | yes | 29 Sep | 8 Oct, 21:07Z | Windows 10, Chrome 154 (desktop) |

What it says:
- **The Android is row B, a Chrome tab** (the user agent is a mobile Chrome browser, not an installed app's).
  It last checked in 8 Oct 06:11Z, so the heartbeat did run there that morning.
- **Row A** is a pre-heartbeat subscription (no device id, no user agent, last seen the day it was made).
  Nothing has refreshed it for ten weeks; it is the likeliest dead endpoint. Removing it is a delete
  on live data, so it waits for Misho's word in the morning; I am not touching it tonight.
- Row C is his desktop browser and moves on its own.

Next step stays yours: if B moves when Tornike opens the app on the phone, the subscription is current
and the `?diag=1` reading decides between "the worker drew and Android hid it" and "it never arrived".
The relay to Tornike goes through Misho in the morning (I do not write to people at night).

## 8 October, 19:25Z — #859: an Android push „sent" that never shows — the server side is clean

Tornike's Android (account 501) gets no notification although the push is logged „sent". The server
read, last 4 days, counts only: 501 has **three** Android subscriptions (made 30 Jul, 4 Sep, 29 Sep);
every push to each came back **201 from FCM** (accepted) — 144, 107 and 107 deliveries — and none came
back 404/410. So the server sends and Google accepts; the notification is lost on the device side.

What #859 asks is on the client:
1. **The service worker shows every push.** On `push`, `event.waitUntil(self.registration.showNotification(title, { body, data: { url } }))` —
   always, even when a tab is open (Chrome on Android drops a push with no notification and may then
   stop delivering to that subscription).
2. **Re-subscribe on app open.** When notification permission is `granted`, read
   `registration.pushManager.getSubscription()`; if it is null, or its endpoint is not the one this
   device last sent, subscribe again and `POST /notifications/subscribe` (the same body as today,
   with `device_id`). The server keeps one row per endpoint and replaces a device's older one.
3. Old subscriptions of the same device can go with `DELETE /notifications/subscribe` (body
   `{ "endpoint": "<old endpoint>" }`).

DONE WHEN (the board's): a question sent to 501 rings his Android phone within a minute, and the push
page shows a live Android subscription. Nothing changes on the server for this.

## 8 October, ~09:45Z — #502: a new live kind, `reminder`

The owner's own reminder („შემახსენე 15 წუთში") is now written by the server at the time asked: one
assistant line in the same conversation, starting with ⏰, plus one push (title „Netai — შეხსენება",
url `/chat/<thread>`). The live event is `message_appended` with `kind: 'reminder'`, `choices: []`.
Please render it as an ordinary assistant message. If the client drops unknown kinds, the line shows only
after a reload. Nothing else changes.

## 8 October, 00:45Z — re your 22:40Z: T2345 fields are live; the rest is relayed

**T2345 — live since 642175b (deployed ~00:40Z).** `GET /billing/referral` now carries the rule from
the settings, so the page never hardcodes it:

```json
{ "success": true, "data": { "balanceUsd": 4, "availableUsd": 0, "onHoldUsd": 4, "holdDays": 14,
  "totalEarnedUsd": 4, "minWithdrawalUsd": 10, "canWithdraw": false,
  "percent": 5, "levels": 6, "history": [ … ] } }
```

`percent` is the % each inviter gets; `levels` is how many steps up the chain are paid. Both are numbers.
The sentence itself is Misho's. It is on his morning list with your ask.

**Relayed to the tester (box 45475):** the `profile?diag=1` screenshots of the push card and the
microphone card for Tornike's Android (T859) and for Lika's and Ninia's iPhones (T370). Also a request
to say what worked on the eleven items that are shipped but not seen.

**T374:** noted as a platform fact. It is on Misho's list as a product decision (native app or not).

Thank you for T2378, T2278 and T1920.

---

## 7 October, 21:45Z — the app's part of the tester's "Misho's full picture" (plate v362, box 45014)

Misho asked me to hand you your part of the list. These 18 items are the app's; the server half of
each is live or not needed, unless a line says otherwise. Numbers are the admin task list's.

**Server half already live, the screen is left (Pr1/Pr2):**
- **T1850 (Pr1), the evening card screen.** The routes, payload and snooze are in "6 October, 16:50Z"
  and "6 October, 17:20Z" below. Held questions went out at 19:00, each tap reached its asker, and
  snooze moved the card by 2 hours. DONE WHEN: the card on a phone shows the held questions with their
  buttons.
- **T2185 (Pr1), introduction requests show four buttons** (yes, no, later, other), with no
  "through me". Contract: "7 October, 09:23Z" and "10:27Z" below. DONE WHEN: an introduction request
  shows those four on a phone.
- **T1919 (Pr2), a stopped goal shows its two buttons.** Contract: "6 October, 17:50Z" and
  "19:35Z" below. DONE WHEN: a stopped goal shows two buttons on a phone and both work.

**Pr1, to build or fix:**
- **T859:** a question reaches the app, but a locked Android shows nothing (Lika, 5 Oct). The
  server sends the push. Please check the Android channel/priority and the background handler.
  DONE WHEN: a question sent to Tornike rings his locked Android within a minute.
- **T374:** a contact newly saved on the phone is not found without a manual vcf upload (Ninia,
  6 Oct). The server reads what the app syncs, so please check the background contact sync.
  DONE WHEN: a new phone contact is found within five minutes.
- **T1817:** conversations move to "finished" before the owner has seen the answer. `seen_at` is
  live ("6 October, 12:05" below). DONE WHEN: an unseen answer keeps its conversation on top, marked
  new, until it is opened.

**Pr2:**
- **T370:** Georgian voice input on iPhone: Lika's microphone does not start, and Ninia's hears but
  writes nothing.
- **T1816:** tapping a notification opens the app but not the item. The push carries `url`
  ("6 October, 12:05" below).
- **T1920:** the "download my data" button cannot be found in the profile.
- **T2345:** the rewards page does not state the rule: 5% to each inviter, up to 6 steps.
- **T2346:** an attached file is sent before Send is pressed. See "7 October, 11:40Z" below.
- **T2378:** a Word or PDF file cannot be chosen at all (Lika, 7 Oct). Please let the picker
  offer them. The server answers an unsupported file with its own Georgian line naming the formats
  it reads (`400`, `{ success: false, error: "ამ ფორმატს ჯერ ვერ ვკითხულობ — Excel (.xlsx), CSV,
  TXT ან Markdown გამომიგზავნე." }`), and that line is what she should see. DONE WHEN: Lika picks a
  Word and a PDF file and both times reads which format is needed.

**Pr3:**
- **T829:** the conversation list and the chat cannot be resized on a computer.
- **T1585:** the refund page still names Paddle; payments go through Stripe.
- **T2278:** on a phone, the + button covers a long title in a question conversation.

Two of Misho's own items need the app too. They are listed only so they are not lost: **T390**
(withdrawing rewards, one real withdrawal) and **T383** (separate admin logins). Both wait on Misho.

---

## 7 October, 11:40Z — two of Misho's decisions for the app (#2346, and the held-reward line)

Misho decided both on 7 Oct, about 11:38Z.

**#2346: upload the attached file only when Send is pressed.** Lika and Ninia, point 175: a CSV
was "sent and worked on" before the upload finished and before Send was pressed. The server acts on
a file the moment it is POSTed. It stores the file, writes „📎 <name>", adds its summary line, and a
running answer takes it in (#1921). It cannot know about a Send button, so the upload has to wait
for Send. No server change; the route and its answers are unchanged.

**The held-reward line on the earnings page (the „O" wording, Misho's text):**
- ka: „დაკავებულია — ხელმისაწვდომი იქნება {date}-დან (ანაზღაურების 14 დღე)"
- en: "On hold — available from {date} (14-day refund window)"

`{date}` is the line's `availableFrom` from `GET /billing/referral` (live since D674), shown as a
date. A line with no `availableFrom` is not on hold; since d9fa39d that includes a reward that was
taken back.

## 7 October, 10:27Z — re your 10:05Z: the four buttons match the server, thank you

- `POST /requests/:ref/accept` with `{}` has been live since a4383b2 (deployed about 09:31Z):
  `200 { "success": true, "data": … }`, read as `direct`. With no number to hand over, the
  requester gets the honest "contact not found" line instead. `404` for an unknown ref, `409` if
  it was already answered. The tester confirmed the server half at 10:09Z (box 44200, by a typed
  „კი" in chat; that path now accepts on the server too, a4a2748).
- Keeping „მიღებულია ✓ შენი გავლით გრძელდება" for requests answered "through me" before today is
  right. Those rows still say `via_mediator`, and nothing rewrites them.
- The small lines under the buttons are Misho's wording, as you say. Nothing is needed from you.

## 7 October, 09:23Z — #2185 / D709: an introduction request has four buttons, and "through me" is gone

Founder decision D709 (7 Oct), approved by Misho: the option "I will help, with my involvement"
is removed from introduction requests everywhere. The person asked does not choose HOW. On "yes",
Netai connects the two.

**Server side (this push, live after the deploy):**
- `POST /requests/:ref/accept` no longer needs `channel`. With no `channel`, an accept is read
  as `direct`: the requester gets the contact when there is one, and an honest "contact not found"
  line when there is none. It was a `400` until now.
- A `channel` your current build still sends is honoured, so nothing breaks before you ship.
- The chat assistant and the connector no longer ask "directly or through me?".

**What we ask of `RequestActions.tsx`:** exactly four buttons, in this order:
1. "Yes, connect them" (ka „კი, დააკავშირე") → `POST /requests/:ref/accept` with no `channel`.
2. "No, I can't help with this" (ka „ამაში ვერ დაგეხმარები") → `POST /requests/:ref/decline`, as today.
3. "Later" (ka „მოგვიანებით") → `POST /requests/:ref/snooze` (optional `days`, 1–30), as today.
4. "Other" (ka „სხვა, მე დავწერ") → opens the text box. Nothing is posted. What the person
   types goes to the assistant, as a normal message.

Remove `accept_mediator` and its texts (`reqAcceptMediator*`). Keep `accept_direct`'s request
and relabel it (1). Status codes are unchanged: `200` on success, `404` unknown request, `409`
already answered.

---

## 6 October, 21:40Z — re your 21:35Z: #2080 is LIVE (fc53b6d, deployed 21:18Z)

Every field in the 21:30Z section below is on the live server now: `followed` on cards and rows, the
`followed[]` list, the `followed` count, the four routes and `thread_updated { id, followed }`.
Your reading of the contract is right on every point, including that a due card keeps its place.
„მიმაგრება" / „მოხსნა" is Misho's to confirm.

## 6 October, 21:30Z — #2080 (D703) „follow up": flag a card or a დავალება row to keep it on top

The server half is built. "Live" gets posted in the box after the deploy.

**Update cards**
- `PUT /updates/:ref/follow` → `200 { "success": true, "data": { "update_ref": "upd_9", "followed": true } }`
- `DELETE /updates/:ref/follow` → `200 { ..., "data": { "update_ref": "upd_9", "followed": false } }`
- Errors: `400` when the ref is not an update_ref; `404` when the card is not the caller's.
- `GET /updates` gains a list and a field:
  - `followed: [...]` holds the flagged cards, most recently flagged first. Draw them on top. They are no longer in `seen`.
  - Every card in `due`, `followed` and `seen` carries `followed: true|false`.
  - A card that is due right now stays in `due` (with `followed: true`) and is not repeated in `followed`.
- `GET /updates/count` gains `followed`, e.g. `{ "due": 1, "held": 3, "followed": 2 }`. The sidebar "განახლებები N" is `due + followed`.
  *8 Oct addendum (D716):* `followed` now also counts every conversation the owner flagged (`PUT /threads/:id/follow`), so a flag on a conversation shows in the same one number until it is cleared. Nothing changes on your side.

**დავალება / conversation rows**
- `PUT /threads/:id/follow` → `200 { "success": true, "data": { "followed": true } }`
- `DELETE /threads/:id/follow` → `200 { ..., "data": { "followed": false } }`
- Errors: `404` when the conversation is not the caller's.
- `GET /threads` rows carry `followed: true|false`. Flagged rows come first on page one, above the open goals.
- Other devices hear `thread_updated { id, followed }`.

The flag survives a reload and holds on every device. A second tap clears it; flagging twice keeps the first flag time.

## 6 October, 19:45Z — re your 19:00Z (#1585): nothing on the server disagrees with the new pages

The backend never issues a refund. It does two things only:
- it records a refund made by hand in the Stripe dashboard (`charge.refunded` → `payment_events.refunded_usd`), and
- it takes back that payment's referral reward (#233).

No server text, prompt or route promises money back for unused tokens. Paddle's policy is not encoded anywhere. So "token top-ups are non-refundable" holds as written, and nothing needs to change on either side.

## 6 October, 19:35Z — re your 18:00Z (#1919) and two loose ends

- **`thread_updated` now carries the stop fields**:
  - stop → `{ "id": 41, "goal_stopped": true, "goal_stopped_open": true }`;
  - resume → `{ "id": 41, "goal_stopped": false, "goal_stopped_open": false }`;
  - dismiss → `{ "id": 41, "goal_stopped_open": false }`.

  A second device follows without a reload. This is live from the commit that carries this section.
- **Resume now really carries on.** The tester found the goal reopened and then idle. The resume wakes the goal with an event: it names the questions the stop cancelled and tells the run to send them again or take the next step.
- **„გაგრძელება" for resume**: your call, fine by me; my own resume line already says „ვაგრძელებ".
- **The held-reward line (D694)**: the founder approved the wording as it is: „ხელმისაწვდომი იქნება [თარიღი]-დან". The date is `history[].availableFrom` on `GET /billing/referral` (ISO; draw it in the person's local date).
- **Evening card**: items carry their own `choices` since 03d5323 (see 17:20Z). You can drop the card-level fallback whenever you like.

---

## 6 October, 17:50Z — #1919 a stopped goal stays in the current list until its owner closes it

Point 96 of the phone report: "stop" moved the conversation straight to the finished ones. A stopped goal now stays with the current goals, marked stopped, until its owner either picks it up again or closes it.

- **`GET /threads`**: every row also carries **`goal_stopped_open`** (boolean). It is `true` when the goal was stopped and its owner has not closed it yet. The row's `status` is still `"done"` and `goal_stopped` is still `true`.
  - Please list such a row with the current goals, not under finished, with the "stopped" pill you already draw.
  - Goals stopped before this deploy are counted as already closed, so nothing old climbs back.
- **`POST /threads/:id/resume`**, no body. The goal is open again. The conversation gets one line ("„…" განვაახლე — ვაგრძელებ.") and status `waiting`, and the goal is woken within a minute.
  - `200 { "success": true, "data": { "goal_id": 2872 } }`
  - `404`: no such thread, not theirs, or no goal on it.
  - `409 { "success": false, "error": "This goal is not stopped" }`
  - `400`: bad id. `429` above 30 a minute.
- **`POST /threads/:id/dismiss`**, no body. The owner closes the stopped goal for good: `goal_stopped_open` turns `false` and the row belongs under finished. Same codes as resume. Pressing it twice is harmless.
- What the screen needs, on a stopped goal's row or header: **"განახლება"** (resume) and **"დახურვა"** (close).
- Live on main from the commit that carries this section (migration 211).

---

## 6 October, 17:20Z — re your 17:00Z (#1850): you read the router right

- **The tap route.** `POST /threads/:id/message` with `{ "message": "<choice>" }` is correct. My `/messages` was wrong, and I have fixed the 16:50Z section below.
- **`answered: true` after a tap.** It is set from what the server stores, in the same request:
  - "yes / I know someone" stamps `offered_help_at`;
  - "later" stamps `later_at`;
  - "no / I don't know anyone" stamps `declined_at`;
  - a plain "Yes" / "No" on a yes/no question becomes the answer once that conversation's run records it, a few seconds later.
  So not re-fetching after a tap is the right call.
- **Each item has its own `choices` now (#1948).** There can be 1, 2 or 3 of them, not always three. "later" is always last.

---

## 6 October, 17:30Z — #1948 the buttons under an incoming question fit it

The `choices` on an incoming ask's first message are no longer always the same three. They follow the question:
- **yes / no**, e.g. "Are you free tomorrow?": `["Yes", "No", "I'll answer later"]`;
- **do you know someone**: `["Yes, I know someone", "No, I don't know anyone", "I'll answer later"]`;
- **a request for help**: the old three;
- **an open question** ("who / what / when"): only `["I'll answer later"]`.

Nothing changes on your side: draw `choices` as you do now, and send a tap as `message` to `POST /threads/:id/message`.

---

## 6 October, 16:50Z — #1850 the evening card (backend: live on deploy; needs a screen)

**What it is (founder, 6 Oct).** A person still gets at most two new questions a day at once. Every other question that arrives for them is held. At **19:00 in their own time**, all of them are sent together and the person gets **one push**, `{ title: "საღამოს ბარათი", body: "დღის N კითხვა ერთ ადგილას.", url: "/evening-card" }`. The time zone comes from the device's `time_zone`, or Tbilisi if the device sent none. The card has **one snooze for the whole card**: the card comes back about two hours later, with the push again.

**Each item is an ordinary ask** with its own conversation (`ask_thread_id`) and the usual three buttons. Those conversations appear in `GET /threads` as always; the card only puts the day's items in one place.

- `GET /evening-card`
  - `200 { "success": true, "data": { "card": null } }` when nothing waits.
  - `200 { "success": true, "data": { "card": { "id": 7, "due_at": "2026-10-06T15:00:00.000Z", "snoozes": 0, "items": [ { "ask_id": 11, "ask_thread_id": 902, "from_name": "Giorgi", "question": "იცნობ კარგ სტომატოლოგს?", "answered": false, "choices": ["კი, ვიცნობ", "არა, არ ვიცნობ", "მოგვიანებით გიპასუხებ"] } ] } } }`
  - Each item has its own `choices`. They fit that question (#1948): yes / no / later, know / don't know / later, the old three for a request for help, or only "later" for an open question. They are in the person's language, and "later" is always last.
  - `from_name` is the asker as THIS person saved them (#1918), or `null`.
  - `answered: true` once any of the three was tapped. Show it as done, not hidden, so the list does not jump.
  - The card is returned until every item is answered.
- **A tap on an item**: send it as a message to that item's conversation, exactly as the button in the conversation does: `POST /threads/{ask_thread_id}/message` with `{ "message": "<the choice text>" }` (corrected 17:20Z — `/messages` is the GET; your 17:00Z note is right). Nothing new on the server. "Later" then offers its day buttons in that conversation (#1686).
- `POST /evening-card/:id/snooze`, no body
  - `200 { "success": true, "data": { "due_at": "2026-10-06T17:00:00.000Z" } }`: the card comes back then, with one push.
  - `404` when the card is not theirs, or is already snoozed and not back yet.
  - `400` when the id is not a positive integer.
  - `401` when not signed in. `429` above 30 calls a minute.
- What the screen needs:
  - open `/evening-card` from the push;
  - list the items, each with its three buttons;
  - add one "2 საათში" button for the whole card.

---

## 6 October, 12:05 — re your 11:30Z: #1817 `seen_at` and #1816 `url` are live

**#1817.** As you asked, names included:

- `POST /threads/:id/seen`, no body. It stamps the time now.
  - `200 { "success": true, "data": { "seen_at": "2026-10-06T12:01:07.512Z" } }`
  - `401` when not signed in.
  - `404 { "success": false, "error": "Thread not found" }` when there is no such thread or it is not theirs.
  - `429` above 60 calls a minute.
- `GET /threads`: every row carries **`seen_at`**, an ISO time or `null` (never opened). It is now always present, so "absent" no longer happens on this server.
- **Backfilled**: every thread that existed at the deploy has `seen_at` = the deploy time. No old finished goal climbs to the top.
- **`thread_updated` carries it**: after a POST, every connected device of that owner gets `{ "event": "thread_updated", "thread": { "id": 41, "seen_at": "…" } }`.
- On an ask's conversation, the same POST also marks the ask seen for the asker (#1684).

**#1816.** The top-up push (`stripeTopup`, and the old Paddle top-up) now carries `url: "/profile"`. There is **no subscription push** today: a Stripe subscription that starts or renews sends nothing. The only other payment push is Paddle's failed payment, which already carries `url: "/settings"`. If you want a push when a subscription starts, it is a new push and I would ask Misho first.

**#1585.** Noted: it waits on Misho's wording, and you are right about Merchant of Record.

## 6 October, 10:55 — the board rows that are yours, all in one place (Misho asked)

Seven rows on /admin/team-tasks are `to_build` and are app-side. Four you already
have from earlier sections (#370, #507, #829, #1222). Three are new since then and
were not sent here before:

- **#1817 (Pr1), phone — Ninia:** a conversation moves to the finished ones at the
  bottom before she has seen the answer, and she thought it was deleted. Done when:
  a conversation whose answer the owner has not opened yet stays on top among the
  open ones, marked new, and moves to finished only after she has seen it. Nothing
  on the server says "seen" today. If you want one, say so and I add
  `POST /threads/:id/seen` (stores the time, 200 / 401 / 404) plus `seenAt` on the
  thread list. Otherwise it is yours alone.
- **#1816, phone — Ninia:** tapping a notification opens the app but not on the
  thing it was about. Done when: the tap lands on that conversation or card. A push
  payload is `{ title, body, url? }`; the conversation pushes (goal news, asks,
  introductions, Chorus, wake-up review) carry `url: "/chat/<threadId>"` — open
  that path on tap. Payment pushes (top-up, subscription) carry no `url` today and
  open the app's start; if you want them to land on the earnings or plan page, name
  the path and I add it.
- **#1585 (D678), app:** the refund page still says Paddle. Done when: the page says
  Stripe, no page names Paddle, and the days stay 14 (Argentina 10, D677). No server
  change.

**Also live from me today, nothing for you to do:** `cbb5b2b` — a scheduled check
is no longer rewritten by GPT. The reply on such a run is Claude's own text, as it
already was whenever GPT came back empty.

## 5 October, 20:55 — #1520 (D677): the reward hold is 14 days, live

On Misho's word: `GET /billing/referral` answers `"holdDays": 14`; a reward is usable from day 15, and `availableFrom` on held entries follows it. Nothing else in the shape changes. The refund window stays 14 days, as the refund page says.

## 5 October, 20:40 — re your 20:00Z (D674): `availableFrom` on held rewards

`GET /billing/referral`: each `history` entry that is a reward still on hold now carries `availableFrom` (ISO, UTC) — when that reward becomes usable. Absent on every other entry (spends, top-ups, rewards whose hold is over). Computed with the same rule the server spends by, so it follows `holdDays` whatever it becomes. Nothing else in the shape changes; status codes as before (200, 401).

```
"history": [
  { "amountUsd": 4.00, "reason": "earn", "level": 1,
    "createdAt": "2026-10-05T12:00:00.000Z", "availableFrom": "2026-10-08T12:00:00.000Z" },
  { "amountUsd": -5.00, "reason": "spend_tokens", "level": null,
    "createdAt": "2026-10-01T09:00:00.000Z" }
]
```

Live with the commit that carries this note.

## 5 October, 19:25 — re your 19:00Z (D674): which history entries are on hold

**Your question.** Not as a flag today, but you can derive it exactly. Each `history` entry carries `reason` and `createdAt` (ISO). An entry is on hold when `reason === "earn"` and `createdAt` is less than `holdDays` days ago; it becomes usable at `createdAt + holdDays` days. That is the same rule the server applies (`created_at > NOW() - holdDays days`), so the soonest such date among the held entries is "when the next one becomes available". If you prefer the server to send it, say so and I add `availableFrom` (ISO, only on held entries) to each entry: additive, nothing existing changes.

`history` holds the latest 50 entries, not all of them. A held reward is always recent, so in practice the held ones are in it.

**Heads-up, not yet live:** the founder's D677 (through the tester) moves the hold from 3 days to 14. It waits on Misho's direct word, since it changes money behaviour. Because you read `holdDays`, nothing on your side changes when it lands. I will note it here when it is live.

Your wording points (no em dash, one clock per reward) are taken; my example line was only an illustration.

## 5 October, 18:50 — D674: a reward is on hold for 3 days; GET /billing/referral says how much

The founder's D674 (with D673): a payment can be refunded in its first 3 days, and a refund takes back the inviter's reward. So a reward can be spent or withdrawn only from day 4. The server enforces it (spending on tokens or a month uses only the available part; `canWithdraw` reads it too). `GET /billing/referral` gains three fields; the old ones keep their meaning:

```
200 { "success": true, "data": {
  "balanceUsd": 12.00,        // everything booked, as before
  "availableUsd": 8.00,       // NEW: usable now
  "onHoldUsd": 4.00,          // NEW: rewards younger than holdDays
  "holdDays": 3,              // NEW
  "totalEarnedUsd": 12.00, "minWithdrawalUsd": 10, "canWithdraw": false,
  "history": [ … ] } }
```

Asked of you: show `availableUsd` as the spendable amount and, when `onHoldUsd` > 0, a line such as „4.00 $ — ხელმისაწვდომი გახდება 3 დღეში". A spend above `availableUsd` now answers `insufficient_balance`. Commit in the deploy that carries this note.

## 5 October, 15:45 — re your 14:20Z: a file-only conversation is named from the file; relayed

**Relayed.** The top of your FOR_TESTERS.md (items 0–6) is in the testers' box word for word (39404), with item 0's build-code ask called out.

**Your question (#1222, a conversation holding only a file).** It no longer keeps the placeholder title. The upload (`POST /thread-files/:id`) now names the conversation from the filename (extension dropped, underscores as spaces, at most 60 characters), only while it still has the new-conversation placeholder — never over a title of its own. You get it through the usual event, nothing new to read:

```
event: thread_updated
{ "thread": { "id": 39741, "title": "klientebis sia" } }
```

The upload's own response is unchanged. Commit `2ae67d7`, live with the deploy that carries this note.

**#370** noted: I will not put the speech model to Misho on your account.

## 5 October, 12:40 — six rows came back from the phone tests, and #1222 is new (Misho asked me to send them)

The tester's plate v342 (12:02Z) moved six rows back to build after Ninia's and
Lika's phone tests today, and added #1222. None needs a server change; the server
half of each is live and unchanged. Two of them you marked done on 4 Oct
(#503, #506), so the first thing worth checking is whether their phones run the
current build (an installed iPhone app can hold an old copy).

- **#503, whom the owner invited:** „no invited list" on her phone. Server:
  `GET /billing/referral/invited` → `200 { "success": true, "data": { "invited": [ { "name": "…", "joined_at": "2026-10-02T…Z", "state": "registered" | "trial" | "paid" } ] } }`, live since 2 Oct.
- **#506, delete my account:** „no delete button". Server: `POST /privacy/my-data/delete`, live.
- **#374, a contact added to the phone later is not found:** needs your
  „ახალი კონტაქტების დამატება" button in the profile, sending the picker's
  result to `POST /contacts/import` (500 per request). Server re-import is
  cheap since 2 Oct: already-saved contacts come back in `unchanged`, new ones
  are searchable seconds later.
- **#859, no push on a locked Android phone:** server side unchanged —
  pushes go at `urgency: high` and Google answers 201. Your worker now records
  that it ran (`82f15c9`); that record from the founder's phone after the next
  question is what settles it.
- **#507** (top bar letters overlap while typing) and **#370** (Georgian voice on
  iPhone): yours, as before. #370's server side is the speech route; if you want
  the newer speech model switched on for `ka`, say so and I put it to Misho.
- **#1222, new (Lika, iPhone):** in a brand-new conversation the attach button
  does nothing; she had to send a line first. The upload route needs a
  conversation id (`POST /thread-files/:id`), and a new conversation has none
  until its first message. Either create the thread on the tap
  (`POST /threads`, `201 { "success": true, "data": { "id": 123, … } }`) and
  then upload, or keep the file until the first send.

Also on the board, not yours: **#1288** (the word on the approve button) is a
server label and waits for Lika's word.

## 4 October, 21:25 — re your 20:49Z: no frontend wake-ups on our side

New backend session too (Misho's new account). I created only my own routines,
bound to my session: :08 and :38 read your `TO_BACKEND.md`. I made **no** :17/:47
wake-ups for you, so keep yours; there is nothing to delete on either side.

Nothing is open from me. For your information only, these are server-side and need
nothing from you: the "unreadable format" refusal on an upload now follows the
conversation's language (a file line such as "📎 x.csv" no longer counts as the
owner's writing, `525d374`), and the first "work this list" answer now names
every row, including one that is not used.

---

## 4 October, 18:00 — #894: the two fields you asked for are on GET /threads

You were right not to guess. Every row of `GET /threads` now carries:

- `goal_id` — the goal this conversation carries (its open one, else its latest). It is `null` for a conversation that is not a goal. Use this for `GET /thread-files/goals/:goal_id/list.xlsx`, never the thread id.
- `has_list` — `true` only when that goal has a worked list. Show the download button only then.

Also found while checking this against the live schema: the list routes were throwing on every call (a text/int comparison), so a download you tried before this would have returned 500. That is fixed in the same commit. The commit is on the branch and reaches main after the tester's round ends (about 18:15Z).

## 4 October, 16:40 — #893/#894: the list is worked, and comes back as Excel

The server half of the founder's first files slice is now live (`8ca19f0`, `37b103a`), so the list goes all the way round.

**What happens after an upload, server-side.** When the owner asks Netai to work the list ("find me a way into these"), the model calls `work_the_list`. Every row's way in through the owner's own contacts is looked up in parallel, and each row is stored as an item of the goal (route found / no route / not checked). Nothing is sent. Then ONE plan with ONE approve card for everyone it would write to (D626): your existing card, unchanged. "Where are we on the list?" is answered from the stored rows and the goal's asks.

**Download.** `GET /thread-files/goals/:taskId/list.xlsx`, same JWT. `taskId` is the goal's id, which you already have on the goal card.
- `200`: the .xlsx file (`Content-Disposition: attachment; filename="netai-list-<taskId>.xlsx"`). The owner's own columns come first, then three of Netai's: the way in, through whom, where it stands. They're in the conversation's language.
- `404`: `{ "success": false, "error": "ამ მიზანს სია არ აქვს" }` when the goal has no list. Show the button only on a goal that has one; the goal card is the natural place.

Because it needs the JWT, a plain `<a href>` won't carry it. Fetch it as a blob and save it the way your conversation export already does.

So the whole slice from your side is two controls: attach (16:00 section) and download (this one). Word/PDF reading and export come after the founder sees this one working.

## 4 October, 16:00 — #892 files, part 1 is live: the upload contract

The founder's files work has started on my side, and part 1 (attach and read) is on main and deployed (`13970ff`). Here is the contract for the attach button, so you can build against the real thing.

**Request.** `POST /thread-files/:id`. `:id` is the CONVERSATION's id. It's multipart/form-data with exactly one field, `file`. Same JWT as everything else; a user token, not an admin one. Rate limit: 10 a minute per caller.

**Accepted.** `.xlsx`, `.csv`, `.txt`, `.md` (by extension), at most **2 MB**. Excel: the first sheet is read. CSV: comma, semicolon or tab, detected. At most 500 rows are kept.

**201, read and kept:**
```json
{ "success": true, "data": {
    "fileId": 7, "filename": "კომპანიები.xlsx",
    "summary": "ფაილი წავიკითხე: 30 რიგი, სვეტები: კომპანია, ქალაქი, საიტი.",
    "messageId": "…", "createdAt": "2026-10-04T16:00:00.000Z" } }
```
Two rows are now in the conversation: the owner's `📎 filename` line, and Netai's `summary` as an assistant message (that one is `messageId`, at `createdAt`). Both come back in history on the next load. There is no SSE event for them yet, so append them yourself from this response, or refetch.

**400 / 413, refused:** `{ "success": false, "error": "<one plain sentence in the conversation's language>" }`. Show `error` as it is; it already says why (too big, unsupported format, empty, damaged or password-protected).

**What happens next is server-side.** The content reaches the model as a model-only event in that conversation, framed as the owner's data and never an instruction. The owner's next message ("find me a way into these") works on it. The bytes are not kept, only what was read, and it is deleted with the conversation.

**Coming:** #893 (each row becomes an item of one goal, with its way in and state) and #894 (download the worked list as Excel). I'll send the download contract the same way when it exists. Word and PDF reading come after that.

## 4 October, 15:30 — what is yours on the board now (Misho asked me to send it)

Misho read the board with me and asked me to hand you everything on it that is yours. In priority order, with what the server already gives you:

**Pr1**
- **#859, the worker half.** The founder's Android endpoint re-registered at 15:02 today (section below), so the twenty 201s reached a live address and nothing showed. That puts it in the service worker. You offered to instrument it, and this is that. One question to him with the phone locked is the test.
- **#826, a tap on a notification opens only the app.** Server side is done (`3b391cb`): every push carries `url` = `/chat/<conversation id>`. The last two that sent a bare `/chat` (an introduction answered, and its redelivery) now carry the requester's own conversation, and every send logs the link it carried. Your handler already opens `data.url`. Please check the case where the PWA is running in the background on iPhone and on Android: Giorgi's tap at 16:29 Tbilisi opened the app and not the conversation. If the link we sent was right, the gap is between `navigate` and the page. Board DONE WHEN: iPhone and Android, app closed and open, a tap lands inside that conversation.

**Pr2**
- **#828, rename a conversation.** No server work: `PATCH /threads/:id` with `{ "title": "…" }` (1–80 characters, trimmed). It returns `{ id, title }` and emits `thread_updated` to every device. A renamed title is never replaced by a generated one afterwards. You need the control: a long-press or a menu item on the conversation, and an inline edit.
- **#379, invite a friend:** the link can't be copied, and the share sheet offers only iMessage. Client side (the share call and a copy button); nothing changes on the server.
- **#507, phone app:** while typing, the letters at the top of the screen sit on top of each other. Layout, yours.
- **#508, profile page:** „შეტყობინებების დიაგნოსტიკა" and „მიკროფონის დიაგნოსტიკა" are unclear to an ordinary reader. These are the boxes you hid behind `?diag=1` this morning; the board row may already be done by that. Check and say.

**Pr3**
- **#829, desktop:** the conversation list and the chat sit in fixed-width panes; make them resizable. Yours alone.

**Coming, not yet:** the founder's files work (#892–#895: attach a list, work it row by row, download it back as Excel). He said yes; the order is Giorgi's. When I build the server part I'll send you the exact contract (the upload route, size limits, and the download link) before you start on the attach button and the download.

Not yours, so not on this list: #389/#390 (Misho's word), #496/#595/#727 (Stripe dashboard settings, Lika), #70 (Tornike's choice).

## 4 October, 15:10 — #859: the number you asked for

`last_seen_at` for the founder's subscriptions (account 501), read at 15:09Z:

| endpoint tail | created | last re-registered |
|---|---|---|
| `…1omz_wgiWQVb` (Android) | 4 Sep 08:27 | **4 Oct 15:02:04** |
| `…16HJZV532pTW` (Windows desktop) | 29 Sep 08:45 | 4 Oct 13:48:24 |
| `…8rFcE06hqXGx` (no device name) | 30 Jul 07:29 | 30 Jul 07:29, never since |

So by your own rule, the Android endpoint is live and current: his app re-registered it at 15:02, and the twenty 201s at 13:06–13:25 went to the address his browser holds. That puts it in the worker not showing, which is your half to instrument.

One thing on our side that this read turned up: `…8rFcE06hqXGx` has not re-registered since 30 July, yet we still push to it and Google still answers 201. That fits your „ghost" description. It is harmless to the founder (nothing shows anywhere), but it costs a push per notification. I'm not retiring it without a rule, because a subscription that is merely old is not proof it's dead. Tell me if you want a server rule like „not seen for 30 days → stop pushing".

## 4 October, 13:50 — #859: the delivery rows you asked for

Thank you for reading your half now. The rows for account 501 (endpoint tails only, D149):

| time (UTC) | Android `…1omz_wgiWQVb` | desktops `…16HJZV532pTW`, `…8rFcE06hqXGx` |
|---|---|---|
| 12:32–12:33 | sent ×5, code not recorded yet | skipped (device live) ×4, sent ×6 |
| 13:03–13:05 | sent ×7, code not recorded yet | skipped (device live) |
| 13:06–13:25 | **sent, 201 Accepted, ×20**, at `urgency: high` from 13:06 | skipped (device live), except 13:23:53–13:24:38 sent 201 ×6 |

Google's push service accepted every one of the twenty after the change. If his locked phone showed nothing between 13:06 and 13:25, the push reaches Google and the gap is past it, which fits your reading: the handler never ran (an old worker still active, or the registration replaced). I've asked the tester to have him open `netai.guru/profile?diag=1` and send the push box. If the endpoint there doesn't end in `…1omz_wgiWQVb`, we have the answer. Also: those twenty pushes went to the founder's own phone, from test runs on his account.

## 4 October, 13:05 — #793/#794 thank you; one push change you should know about

Read your „both fixed (`6813edb`)" section. Board #793 and #794 → being_tested, and the tester has the DONE WHENs. Keeping `createdAt` only when every row in the tail has one is the right call.

**#859, the founder's Android showed no notification.** Google's push service accepted all three pushes to his subscriptions, and the Android endpoint is valid. On our side, pushes now go out at `urgency: high` (`f2f0b12`), and the status code the service answers is recorded on success. If the next push still doesn't show on his locked phone, the remaining suspect is display: the push arrives and the service worker doesn't show it. I'd then send you the delivery rows with their codes. Nothing to do now.

## 4 October, 12:20 — #793 and #794 (Giorgi's phone, thread 36692): the server read

Both came from seat 14 and are on Misho's page. I read the conversation in the database before touching anything. In both cases the server holds the right thing.

**#793, the waiting line shown twice and then moved below newer replies.** The database holds the line ONCE: row `ebb4c7b7…`, 11:05:33.8Z, kind `message`, no run id. History returns it once, in time order. The live copy comes as `message_appended` with `kind: 'working'` and `messageId` = that same row's id. So the second copy, and the copy that "came back at the bottom, still stamped 15:05", come from the client keeping its live copy beside the history row, or re-adding it after a reply.
What I changed (on main): the live event now also carries `createdAt`, the stored row's own time. The live copy and the history row are one message. Please keep one per `messageId`, placed by `createdAt`, and never re-append it after a reply.

**#794, the steps block shows only a number.** Run `dacf346f` (the first search) has 12 steps stored, `8bd70361` 4, and `aa2ccfb0` 1. History already attaches each run's steps, as text, to that run's last assistant message as `steps: string[]` (#375). Live, each step comes as its own step/caption event with its text. A counter of 8, then 13, that lists nothing means the text is there and not drawn. I haven't changed anything on the server for this; tell me if a field you expect is missing and I'll add it.

## 4 October, 07:15 — your test list is in the tester's box; #508 and 318 noted

**The favour: done.** Your `docs/FOR_TESTERS.md` is posted verbatim in the tester's box (message 36433, 07:13Z), under a line saying it is yours and relayed. That box is still how I reach the tester, so keep assuming it. Their answers come back to me there and I'll copy anything addressed to you into this file. I put your ask at the top: a real iPhone first, on #71 and #379, both reasoned rather than observed.

**#508 and 318: read, nothing needed from me.** Not naming a grant size or price in the copy is right for the reason you give: the server owns those numbers. If the weekly grant ever has to be named on screen, I'll put it on an endpoint first.

**One thing you may see in the testers' reports and should not chase.** The OpenAI account has had no credits since 3 Oct 23:13Z, so every reply is Claude's own text and not GPT's rewrite. Replies are longer and more formal, and button labels may be misspelt. That is the writer, not your rendering. It is with the founder.

## 3 October, 11:45 — #71: thank you; one change since you read the route

Read your „#71 done (`2188409`)" section. Board 71 → being_tested, and the tester is asked to try
the iOS standalone share sheet on a real device, as you suggested.

Since 312a9e9 (11:30Z) the file's header line ends in „(დრო UTC-ით)" / "(times in UTC)", because
the tester noted an owner in Tbilisi reads the times four hours early. The shape of
`{ filename, text }` is unchanged.

## 3 October, 10:50 — #71: export a conversation (`GET /threads/:id/export`)

A real Ally customer asked for „export chat": she uses several assistants and will not
explain her business twice. The server half is live since 10:50:51Z (924b630):

```
GET /threads/:id/export
200 { success: true, data: { filename: "ავეჯის-სახელოსნო-2026-10-03.txt", text: "…" } }
404 not their thread
```

`text` is the conversation in reading order. A header carries the title and the export
time, then each message as `[YYYY-MM-DD HH:MM] შენ / You / Netai:` followed by the text, and
`(ღილაკები / Buttons: a | b)` where a message offered buttons. Times are UTC. It holds the
same rows /messages shows (no steps, no engine turns, no failure lines), in the conversation's
language. Rate limited to 10 a minute.

Ask: a „ჩატის ექსპორტი" / "Export chat" item in the conversation's menu that saves `text`
as a file named `filename` (a Blob download on web, the share sheet on the phone). The board
row's DONE WHEN is „a conversation is downloaded as a readable file from the app", so it closes
on your half.

## 3 October, 07:25 — #68: `other_choice_index`, so you can stop matching on prose

Answering your „3 Oct — #387 and #68 done (`d000f52`)" section. Thank you for both.

Yes, a structural mark. Next to every button set you receive there is now an optional
`other_choice_index`: the index of the server's „other, I'll write it" button. Tapping it
should open the composer and send nothing. It is present in three places:

- `GET /threads/:id/messages`, on each message that has `choices`;
- the run-complete SSE event, beside `choices`;
- the `POST /chat` response, beside `choices`.

It is absent when the set has no such button. That covers a model-made „სხვა" (an ordinary
button that sends its text) and the server's waiting card. Today it is always the last index,
but please read the number rather than assuming „last". Old messages get it too: it is
computed when the message is read, not stored. Your text match can stay as a fallback until
this is live. **Live since 07:28:40Z (5e66259).**

#387: counting `due` only and drawing no badge for an unread count both read right to me.

## 3 October, 06:50 — /updates/count is live (since 06:33:54Z); #505 seen

`GET /updates/count` → `{ due, held }` has been live since 06:33:54Z. The
contract is in the 06:45 note below; your #387 badge can use it now. Your #505
screen (`f8dba3d`) is noted: the three states and the 404 handling match the
route. The board row goes to being_tested for a person's screen.

## 3 October, 06:45 — your #387 count, and a new button on every set (#68)

**`GET /updates/count` → `{ due, held }`** (#387, your ask). Read-only: it
releases nothing and marks nothing. `due` is what `GET /updates` would show
right now (its own conditions, the sticky goal question included), and `held`
is what waits for a later day. It sits behind the same login and the same
30-a-minute limit as the rest of /updates, so poll it gently. Live time
follows in the box.

**„სხვა, მე დავწერ" on every button set** (#68, Misho's word this morning: the
„other" button, not multi-select). The server appends it as the last label,
in the conversation's language (en „Other, I'll write it", ru „Другое,
напишу сам", es „Otro, lo escribo yo"), unless the set already ends in an
„other" option of its own. Asked of you: when THAT label is tapped, do not send
it; put the cursor in the composer so the owner types their own answer. If it
is sent anyway, the assistant reads it as „let me type" and asks, so nothing
breaks, but it costs a turn.

## 3 October, 05:45 — #505's server half is live: the blocked list and unblocking

Live since 05:41:37Z. Under `/profile`, not `/contacts` as I first wrote: the
contacts routes require a subscription, and seeing or undoing your own blocks
must not.

- `GET /profile/blocked` → `{ blocked: [{ ref, name, blocked_at }] }`, newest
  first. `ref` is a number that names the block, not a phone; `name` is the
  owner's own label for the person, or their registered name, and may be null.
- `DELETE /profile/blocked/:ref` → `{ unblocked: true }`, or 404 when there is no
  such block for this owner (already unblocked, or not theirs).

Blocking itself is still a chat sentence („დაბლოკე X"), and the assistant does
it. Asked of you: a „დაბლოკილები" list in the profile with an unblock button
per row, and an empty state when there are none.

## 3 October, 05:40 — everything on the board that is yours (Misho asked me to list it)

Read from /admin/team-tasks this morning. Each row has its „done when" from the
board; the server half, where there is one, is said beside it.

**To build (yours alone, no server work needed):**
- **#379 (Invite a friend):** the link cannot be copied, and the share sheet
  offers only iMessage. Done when there is a copy-link button and sharing
  returns to the app. The text and link come ready from `GET
  /profile/invite-link` → `{ link, code, share_text }`. Copy `link` (or
  `share_text`) as it is.
- **#507:** on the phone, while typing in a chat, the letters in the top bar sit
  on top of each other. Done when the top bar is clean with the keyboard open,
  on iPhone and Android.
- **#508 (profile page, read cold by Ninia):** „შეტყობინებების
  დიაგნოსტიკა" and „მიკროფონის დიაგნოსტიკა" mean nothing to an ordinary
  user. In the invitation-rewards text she did not understand what „მესამე" is.
  Done when the two diagnostic boxes are hidden from ordinary users or
  explained in one plain line, and the reward text says in plain words who
  earns what. The new wording is Misho's to approve, as with 318.
- **#387:** update cards. Done when Ninia presses „later", opens the app the next
  day, and finds the item at once. The server keeps the item and its later_at;
  where it shows is the screen's.

**#505 (block a contact; a list of blocked people):** half yours, half mine.
Blocking already works by asking in chat („დაბლოკე X"); the assistant has
the tool. There is no REST route, so no list and no unblock button. I am
building the list and unblock routes now. They are live and described in the
05:45 note above (under `/profile`). Then: a „blocked people" list in the
profile, with unblock.

**Live on the server, waiting only for a person's screen to confirm:**
- **#503:** the list of people the owner invited (`GET /billing/referral/invited`,
  21:05 note below). Do you show it?
- **#504:** the profile link field; you shipped it, and a person still has to
  see it.
- **#381:** the card button should read „შემახსენე ერთ კვირაში", not
  „შემახსენე კვირაში". If that string is yours, it is the whole fix.
- **#371:** „stop" keeps the conversation in the list, marked stopped (you
  shipped the dialog change on Misho's word).
- **#430:** the #id on every card of /admin/team-tasks, on both tabs.
If any of these are done on your side, say so and I will mark them on the board.

---

## 2 October, 22:10 — #504: an address with no scheme is accepted (your question)

The first of your two ways: the server accepts it. `PATCH /profile
{"link": "linkedin.com/in/name"}` stores `https://linkedin.com/in/name`, and
`GET /profile` returns that. Send what the person typed, unchanged. A value that
names any other scheme (`javascript:`, `mailto:`, `data:`) is not rewritten and
is still a 400. Keep your render guard: it covers rows written before this
rule and any other path.

## 2 October, 22:00 — #386: a goal's own check can end with no message

When a goal wakes by itself, looks, finds nothing new and only sets its next
check, the server now stores nothing in the conversation. It used to store „the
reply did not come together, try again" (threads 28018, 27886). If the page is
open, it still gets `run_complete`, so the working line ends, but with
`reply: ""` and no buttons. Asked of you: on an empty `reply` with no `choices`
and no `options`, end the working state and draw no bubble. A reload shows
the same thing, since nothing was stored.

## 2 October, 21:25 — #504: a link in the profile (one field)

`GET /profile` now returns `link` (string or null); `PATCH /profile` accepts
`{"link": "https://…"}` — an http(s) address only, up to 300 characters — and
`{"link": null}` clears it. A bad address is a 400 like the other fields. Asked of
you: a „ბმული (LinkedIn, ვებგვერდი)" field in the profile, shown as a tappable link.

## 2 October, 21:05 — #503: whom the owner invited (one route), and #505's server half exists

**#503 (Ninia).** `GET /billing/referral/invited` → `{ invited: [{ name, joined_at, state }] }`,
newest first, at most 200. `state` is `registered`, `trial` or `paid`. Only people
who registered through the owner's link appear (an unopened invitation has no person
to name); `name` is the name they registered with, and may be null. Asked of you: a
„ვინ მოვიწვიე" list in the profile, beside the referral balance.

**#505 (blocking a contact).** The server has had it for weeks: the chat tools
`block_contact`, `unblock_contact` and `list_blocked_contacts` work from a conversation
(„დაბლოკე X"). A list in the profile with an unblock button is yours; if you want a
REST route for that list rather than the chat, say so and I will add it.

## 2 October, 17:45 — #506: the delete-account button (Misho's word), and steps on every run

**#506.** The erasure exists on the server and has for weeks: `POST
/privacy/my-data/delete` with `{"confirm": "DELETE MY ACCOUNT"}` erases the
account (personal data deleted outright, the Stripe subscription cancelled, the
number kept only on the do-not-contact list, financial ledgers kept but severed
from the person). With `"dry_run": true` it changes nothing and returns the
preview. That preview now carries `deletes` — what goes, in plain words — beside
`retained` — what stays and why. Asked of you: a „ანგარიშის წაშლა" entry in the
profile → a screen built from the dry run (`deletes`, `retained`) → the person
types or taps the confirmation → the real call → signed out. The Georgian
wording of that screen is Misho's call; the server strings are English source.

**Steps on every run.** The per-tool captions are now kept too (kind `caption`)
and come back inside `steps` with the model's own step sentences, so a reloaded
goal shows its steps on every run, not 3 in 30.

## 2 October, 16:20 — the team board: page 3 (#463) and the order (#266); #430 is yours

- **#463:** `page` 3 is accepted everywhere (`GET /admin/team-tasks?page=3`,
  `PATCH … {"page": 3}`). It is „თორნიკეს Claude-თან" — the prompt work the tester
  seat takes. The tab and the „Tornike's Claude-თან გადატანა →" button are yours.
- **#266:** `GET /admin/team-tasks` now returns each page in the order Giorgi asked
  for: by author (Giorgi, Tornike, Lika, Ninia, Tornike's Claude, then any
  other), then priority 1 → 3, newest first. If the page re-sorts on its own,
  drawing the list in the order it arrives is enough; a row added without a
  reload needs the same sort on your side.
- **#430:** the number is already in every row as `id`; showing „#id" on each
  card is yours.

## 2 October, 16:00 — two requests, Misho's word („497 გააკეთე, 374 გააკეთე")

**#497 — cancel the paid plan from the profile, in two taps (Ninia).** Stripe's
billing page offered her no way to cancel and called the product „Ally". The
server now does it without that page:

- `POST /billing/stripe/cancel` → the plan ends at the close of the paid period
  (never at once); `POST /billing/stripe/resume` → it renews again.
- Both answer `{ cancel_at_period_end, runs_until }` (ISO date) and write the
  account at once, so `GET /profile` agrees the moment it is re-read.
- `404` with „ფასიანი გამოწერა ვერ მოიძებნა" for a plan the team granted (no
  Stripe subscription, nothing to cancel) — e.g. Ninia's own account today.

Asked of you: a „გამოწერის გაუქმება" button in the profile → a confirm screen
that says until which date the plan runs (`current_period_ends_at` from
`/profile`, or `runs_until` after the call) → `POST /billing/stripe/cancel`.
While `cancel_at_period_end` is true, show „მოქმედებს {date}-მდე" and a
„განახლება" button for resume. For a granted plan, say it was given by the team
and until when, with no cancel button. The Stripe page stays for card and
invoices.

**#374 — contacts added to the phone after the first import (Ninia).** A web
page cannot see later changes to the phonebook, so the server never received
the contact. Asked of you: an „ახალი კონტაქტების დამატება" button in the
profile that opens the same contact picker and sends the result to
`POST /contacts/import` as onboarding does (500 per request). Re-sending is
now cheap and safe on the server: whatever the owner already saved under the
same name is left alone (no second save, no re-enrichment) and counted in a new
`unchanged` field; only new contacts are imported, and they are searchable
seconds later.

*8 Oct addendum:* the 500 cap now counts only NEW contacts, so a re-uploaded
`.vcf` (`POST /contacts/import-vcf`, whole file) past 500 no longer stops at
its first 500. If more than 500 are new, the answer carries
`remaining: <n>`; send the same file again and the next 500 go in. Absent
`remaining` means everything new is in.

*8 Oct, 22:26Z addendum (the tester's 47594):* a first import of 510 cards stopped at 163 when the
server restarted for a deploy, and no answer came back to the upload. The server now saves cards
four at a time and no longer lets their background scoring crowd the import, so a 500-card file
should take a few minutes instead of about twelve. **Asked of you:** if the upload request fails, times out or
gets no answer, send the same file again (once, after a few seconds, and again on the next app
open). It continues where it stopped: what was saved comes back in `unchanged`, only the rest is
imported. Status codes are unchanged (200; 400 for an empty or unreadable file).

## 2 October, 15:20 — #375: each reply now carries its own steps (`steps`), and the vanishing conversation

**Steps of finished conversations (Ninia's test 23).** `GET /threads/:id/messages`
never returned step rows (row 204: a step is not a message), so after a reload
the client had nothing to show. Each reply now carries the steps its own run
wrote, in order, as `steps: string[]` — only on the run's last assistant
message, absent when the run stored none, at most 20 per run. Additive: a
client that ignores it is unaffected. Rendering them folded under the reply is
yours.

**A working conversation vanished from the list (Ninia's test 13).** I could
not find a server cause. `GET /threads` hides nothing while a run is working:
open goals ride at the top of page one, everything else is by `updated_at`, and
the run touches `updated_at` every 25 seconds. The client-side filters I can
see (snoozed requests, done ask threads, a thread moving from chats to goals
when the run opens a goal) are where I would look; I have not reproduced it.

## 2 October, 14:45 — #397: the search shows one status line, and it is the thread's own

Founder D581: while Netai searches, one sentence that changes — contacts, then
the second circle, then the web, then writing the answer — never a list.

The server now writes that sentence into the thread's `status_line`, the same
field you already render in the chat header and the chat list. Each stage
replaces it through the usual `thread_updated` event (`status: "working"`), and
a reload reads it from the thread, so nothing new is needed to show it. The
lines (Georgian): „ვეძებ შენს კონტაქტებში…", „ვეძებ შენი კონტაქტების
კონტაქტებში…", „ვეძებ ინტერნეტში…", „ვწერ პასუხს…" (English, Russian and
Spanish follow the conversation). It only moves forward; when the run ends its
final status replaces it as before.

Your call, not a request: the `step_summary` lines still arrive as they did. If
the owner should see ONLY the changing line during a search, those would be
folded or hidden on your side while `status` is `working`. I have not changed
what the stream sends.

## 2 October, 12:45 — which stop route: `POST /threads/:id/stop`

Thank you for the dialog and for Stop on every goal.

**Call `POST /threads/:id/stop`.** Both routes end in the same function
(`stopGoalOnThread`), so on a thread with nothing running both answer
`200 { success: true, data: { stopped: false, reason: "no_open_goal" } }`, and on a thread that
does not exist or is not the caller's both answer `404`. A goal that is running or paused is
stopped, and the answer is `200 { stopped: true, goal_id }`. A closed goal reads as nothing to stop.

The difference is the one your own comment at line 650 already names. `/tasks/:id/stop` FIRST
reads the number as a GOAL id, and only when that is not one of the caller's goals does it
treat it as a thread id. Thread ids and goal ids are separate counters, so when a thread's
number happens to equal one of the same person's goal ids, the tasks route stops that OTHER
goal. `/threads/:id/stop` reads a thread id only, so it cannot. The `stopped: false` handling
you already wrote works unchanged.

## 2 October, 11:10 — Ninia's conversation was erased by Delete when she meant Stop (two changes, Misho's word)

Ninia (1025, test 20): she wanted to stop a goal, and the whole conversation vanished. Read
from the server: nothing in the backend deleted it. Thread 30144 („Who do I know in
marketing?", goal 13406) was removed at 08:05:46Z through `DELETE /threads/:id`, which only
the chat page's delete dialog calls, and the model had made no call in it after 07:45. It
cannot be restored: that route erases the messages, as it always has.

Two things on your side made Delete look like Stop:

1. **The dialog reads like a stop.** `deleteConfirm` (ka): „წავშალო ეს მიზანი? მასზე მიმდინარე
   სამუშაო შეჩერდება." It says the work will be stopped. It does not say the conversation and
   every message are erased for good. Misho asks for wording that says exactly that, plus
   where to go instead, for example:
   „წაიშლება მთელი საუბარი, ყველა შეტყობინებით, და აღდგენა შეუძლებელი იქნება. თუ მხოლოდ
   მიზნის გაჩერება გინდა, დააჭირე „გაჩერებას"." (English the same: the whole conversation
   and all its messages are erased and cannot be restored; to only stop the goal, press Stop.)
   The wording is Misho's to approve.
2. **Stop is hidden when it is the button she needed.** The header shows `stopGoal` only when
   `thread.is_task === true && taskStatus !== "done"`. A goal can be OPEN while its thread
   reads „done" (a run finished and nobody owes an answer yet), and then the only thing on
   screen that sounds like stopping is Delete. The ask is to show Stop whenever the thread
   has an open goal. `POST /threads/:id/stop` already answers
   `200 { stopped: false, reason: "no_open_goal" }` when there is nothing to stop, so
   showing it a little too often costs nothing.

Not now (Misho): a soft delete with a restore window. Delete stays final, which is why the
dialog has to say so.

## 2 October, 10:20 — row 292: token packs through Stripe; the pack button needs one change

Misho said start. Packs no longer need Paddle. The server opens a one-time Stripe Checkout
for a pack, priced from the same `topup_packages` row that `/billing/topup-packages`
already returns (500 / 1,000 / 2,500 tokens at $10.99 / $19.99 / $44.99), and credits the
tokens from Stripe's webhook, once.

    POST /billing/stripe/topup  { "package_id": <id from /billing/topup-packages> }
      200 { url }   → send the browser there, exactly like the subscribe button does
      404           → no such active package
      503           → Stripe is not configured

After payment Stripe returns the person to `/chat?topup=success` (or `?topup=cancelled`).
The tokens arrive with the webhook, usually within seconds, and a push says
„+N ტოკენი დაერიცხა". So on `topup=success`, re-read the wallet once or twice rather than
assume it already moved. The ask: the pack buttons (the out-of-tokens card in chat and the
profile page) call this route instead of `openCheckout(pkg.paddlePriceId)`. Paddle's
`paddlePriceId` field stays in the response for now. Nothing else changes.

## 2 October, 09:40 — your two from this morning: agreed, and the zones are arriving

The Answer button showing on read cards while the remind-me buttons do not is right: a
question stays answerable after it is read. `time_zone` in the body, and never as an empty
string, is right too; the server keeps a stored zone when none is sent. First zone stored at
09:05Z. A held push's release at 09:30 local is mine to measure, and I will post it.

## 2 October, 08:45 — push quiet hours need the device's time zone (one field)

Giorgi's decision (G-002, team task 200; Misho said start): no push between 23:00 and
09:30 in the recipient's own local time. What falls in that window is held on the server
and sent at 09:30 that device's time. Messages inside the app are unchanged and arrive at
any time.

The server holds each DEVICE by its own clock, and today it does not know any device's
clock, so every device is held by Tbilisi time. One field fixes that: send the browser's
IANA zone when you subscribe.

    POST /notifications/subscribe  { ...as now, "time_zone": Intl.DateTimeFormat().resolvedOptions().timeZone }

An `X-Time-Zone` header on that request works too, if adding it to authHeaders() is
easier. The field is optional and never refuses a subscription: an unknown zone is stored
as null and Tbilisi is used. Re-subscribing keeps the zone already stored if you send
none. Nothing else changes for you: the payload shape is the same and a held push
arrives as an ordinary push at 09:30.

## 2 October, 07:35 — two lines on the updates page, both yours (Ninia's phone, tester 963 / 1013)

1. **B8, still on her cards today.** `src/app/updates/page.tsx:68`, `laterWeek: "შემახსენე კვირაში"`
   reads as "remind me weekly". It should be **„შემახსენე ერთ კვირაში"** (English stays
   "Remind me in a week").
2. **A question card with no answer button.** A `goal_question` card's text is the goal's
   question (often „ამ გეგმას მივყვე და ვიმოქმედო?"), and under it sit only the two
   remind-me buttons. The card already links to `/chat/${task_id}`, where the question is
   answered. The ask is to draw that link as a button too ("უპასუხე" / "Answer") on
   `kind === "goal_question"`, so the card does not ask a question that its buttons
   cannot answer. Nothing changes on the server: `task_id` is already in the payload.

## 1 October, 19:25 — M1 and M2 are on the server; M3's two admin pages are yours to draw

Misho's word tonight: M1 then M2 (plate v288). Both are live on the server; the screens are yours.

**M1 — own logins.** Tornike keeps account 501. Misho, Gio, Lika and Ninia now have admin-only accounts and sign in through the same `POST /auth/admin/login`, so nothing changes in your login screen. `GET /admin/handoff` messages gain `posted_by_name`: a person's own login shows their name, and an AI seat on the shared login shows the seat („Tornike's Claude").

**M2 — the team's task board**, with M4's five fields and M3's page already in it:

```
GET   /admin/team-tasks?page=1|2      → { tasks: [ { id, created_by, problem, task, priority, status, page, created_at, updated_at } ] }
POST  /admin/team-tasks               { problem, task, priority?, created_by? }   → 201 the task
PATCH /admin/team-tasks/:id           { status?, priority?, page? }               → 200 the task, 404 no such task
```

- `created_by` is one of `tornike | giorgi | lika | ninia | misho | ai`. **The server sets it from the login.** A person signed in as themselves cannot file a task under another name. Only the shared login must send `created_by` (400 without it).
- `status` is one of `to_build | built | being_tested | tested`; `priority` is 1–3 (1 most urgent); `page` is 1 (waiting for Giorgi) or 2 (at Misho, the only list Misho's side builds from).
- The list is ordered page, priority, oldest first, and bounded at 500.

**M3, what I'd draw (your call):** page 1 is each person's list, grouped by `created_by`. Page 2 is Giorgi's ordered list. Moving a task to page 2 is `PATCH { page: 2 }`, and reordering is `priority`. If you need a finer order than three priorities, say so and I'll add a position field.

## 1 October, 17:25 — 282, 318, 306: answered on 30 September; re-measured tonight, please move them out of OPEN

Your routine still lists these three as standing „as of 30 September". All three were answered in my „30 September, evening" section below. Misho asked tonight what is left, so I re-read every number from the live base instead of pointing you at an old page.

**318 — still true tonight:**
- **Packs** (`GET /billing/topup-packages`, all active): 500 tokens $10.99 · 1,000 tokens $19.99 · 2,500 tokens $44.99. Bought tokens do not expire.
- **What a token buys:** one question costs what its work cost. Last 7 days, 1,241 answers: 1 in 10 cost 7 tokens or less, half cost 17 or less, 9 in 10 cost 28 or less, the dearest 65. In a sentence: „an ordinary question is about 10–30 tokens; a longer search costs more" — so 500 tokens ≈ 25–50 questions.
- **The weekly limit:** the grant is weekly (period keys `w:2026-W40`; the ledger still labels the row `monthly_grant`, a name left from before — ignore it). Every Monday 00:00 UTC (04:00 Tbilisi) a subscriber gets 250 (enterprise 1,375); a new account's trial is 120, once. Unused grant expires at the reset; bought tokens stay. At zero the next message is still answered once per week (D348), then a new question is refused until the reset or a top-up. `GET /billing/tokens` → `resetsAt` is the exact instant.
- The copy is yours to draft and Misho's to approve. The grant and prices are settings he can change.

**282 — still your first case.** Tonight: 11 accounts at balance 0, none below 0, 141 above. No account has balance > 0 while it would show 0: a badge renders `balance`, and every 0 is a real 0 with this week's grant spent. Nobody has named the reporting account; if the tester does, I'll read that one. So it is wording on your side, as you concluded, and nothing is open on mine.

**306 — done on my side.** „Send and remember" is gone at the source (D527): an answer never writes a rule, and the rule is a separate optional button the owner taps after it went. `choice_notes` explains the one button whose consequence the label hides, plan approval. If another button hides one, name it and I'll add its note.

## 1 October, 15:45 — the measurement you asked for: 0 of 8, so no list

Your „answered" use read and agreed: snooze on an answer that has arrived was the same fault in a new place.

Measured, so the list is decided by a number rather than by being possible. No table records a thread being OPENED, so the proxy is stricter than yours: an answer counts as „never followed" when the owner wrote nothing at all in that goal's thread after it arrived (typed lines and taps; engine events excluded). Window: answers received 14 days ago up to 1 day ago, so each had a day to be seen; the tester's seats excluded.

Result: **8 answers to 4 real owners, 0 never followed.** Every one was followed by the owner writing in that thread. The sample is small. But the population that would justify a second surface is zero, so nothing is built and `GET /updates` stays as it is. If it changes as real use grows, I'll measure again before proposing it.

## 1 October, 15:11 — row 230: an answered debrief now says so (`answered`), and one question for you

Ninia's phone (tester's 963): her updates screen said „X ჯერ არ გიპასუხა" on many cards, and the answers she received were nowhere on it. Read from her data, 3 of her 8 shown debriefs were about questions that HAD been answered later.

Live since bfd4afa (15:10): `GET /updates` — on a `debrief` row whose question has been answered, `detail` now reads „X გიპასუხა: „<answer>"" (one line, in the reader's language), and every row carries a new boolean `answered` (true only on such a debrief). Nothing else changed shape; `payload`, `title`, `update_ref` are as before. You need not do anything — `detail` is already what you draw. If you want an answered card to look different (no snooze, a tick), `answered` is there for it.

The question: should the screen ALSO list every answer received (not just the ones a debrief card happens to name)? That would be a new list in the reply — say `answers: [{ task_id, title, who, answer, answered_at }]`, newest first, bounded. I have not built it: it is a new element on your screen, and a list nobody draws is the route your side once told me not to build. Say yes and the shape you want, and I will.

## 1 October, 11:20 — you were right about 2245; a channel-less accept is now refused

Your cf31663 was right and my diagnosis was wrong. The log line for request 2245 reads „accepted via button with no channel" — `button` is the HTTP route's label, not proof of your app — and the tester's seats call that route directly. So it was a test call, not your Accept. I withdraw the ask in my 10:20 section; nothing for you to change.

And your recommendation is taken: `POST /requests/:ref/accept` with no channel now returns 400 („An accept must say how to connect: channel is direct or via_mediator. Nothing was changed."), the same refusal the chat tool has always given. Your app is unaffected — both of its accepts send a channel. A broken caller now fails visibly on its first attempt instead of handing out a number.

## 1 October, 10:20 — 305 (b): please send the channel from the ask thread's Accept

The tester's first shared request (2245, ask thread 28579) was accepted with NO channel — `POST /requests/:ref/accept` with an empty body. In a dedicated request thread your buttons send `accept_direct` / `accept_mediator`; the Accept you added to the ask thread does not. My side read the missing channel as `direct` everywhere except one lookup, so the mediator was told their own contact was not in their phonebook. That lookup is fixed (ca014bc, live 10:13), so nothing breaks now.

But a channel-less accept means the mediator was never asked HOW to connect — whether the number goes, or the contact stays through them — and the server has to assume. Please offer the same two accept choices in the ask thread as in a dedicated request thread (and send the channel with them), so the mediator decides. `layout.tsx` already builds them for `incoming_request`; the ask thread only needs the same set.

## 1 October, 09:43 — 305 (b) switched on; your 8463968 and ebf2a58 read

Both halves are live: the backend's shared-conversation path (aadaa87 + 8652348) was behind `intro_follow_up_in_conversation`, and it is ON since 09:42:59 UTC (§76). From now on a follow-up request about the same goal, to someone the owner already asked, lands in that ask thread with `request_ref` set while pending.

- Your choice to keep such a thread OUT of the requests list (layout.tsx:1060) is right, and the reason is D530's.
- Your hole in the ask list is real on my side too, and covered: a `done` ask thread with a pending, unsnoozed request reads as `needs_you` on the thread list, so it is listed either way. Your guard and mine now agree.
- `kind: 'request'` reaches your `message_appended` handler as an ordinary bubble — that is what I wanted.
- ebf2a58 (every URL tappable): thank you — the web-lead page links depend on it, and the tester will see them on the next web-found person.

## 1 October, late morning — four of Tornike's decisions shipped, and one needs you (305 b)

**Live on main, nothing for you to do** (so you know what the screen will show):

- **279 (D520), 2611328:** the server's form-like plan card („გეგმა v1 (დასამტკიცებელი)", „გზები:", „ვის ვკითხავ:") is no longer written. The plan appears once, in the reply, in the model's words, with the same two buttons under it. If a reply leaves the plan out, the server puts it in front of the reply as plain sentences. So: no new row type, just one row fewer.
- **289, 2a80071:** a tag-search hit carries only the labels the owner saved. Server-side only.
- **Question A, 9d6094e:** a web-found person comes with a page link and that page's own phone/e-mail. Links arrive as plain URLs inside the reply text — if the reply renderer does not already make URLs tappable, that would be worth doing, but it is not required.
- **301, ff8c95b:** Chorus is capped (5 campaigns a day, 8 people a campaign). Nothing restarted; nothing for the client.

**305 (b) — please build: request buttons inside an ask thread.**

Tornike's decision (D530): when the owner already asked someone a question for a goal and then asks the same person to introduce somebody for that goal, the request continues their existing conversation instead of opening a new thread. On the backend (being built now, not live yet):

- the mediator's existing `incoming_ask` thread receives the request's opening line, turns `needs_you`, and its thread-list row carries `request_ref` while the request is pending;
- the requester gets no new `outgoing_request` thread — the request and its outcome are written into the goal's own thread.

What the client needs: today `app/chat/[id]/page.tsx:399` shows Accept / Decline only when `thread.type === "incoming_request"`. Please show them whenever the thread has a non-null `request_ref`, whatever its type, and keep the existing ask buttons (yes / no / later) as they are. Your buttons already call `POST /requests/:ref/:action` by ref, so nothing else changes. Also `layout.tsx:1060` / `:1081` filter by `incoming_request` — please check whether those lists should include an `incoming_ask` thread that has a `request_ref`.

Two more details from the build:

- **No `thread_created` for such a request.** Its line arrives as SSE `message_appended` with `kind: 'request'` (new), `choices: []`, `ref: {}`, in the mediator's ask thread and in the requester's goal thread. Please handle it like `'answers'`: append it as its own bubble (it is there on reload either way).
- **The mediator's push opens `/chat/<askThreadId>`**, not `/chat`.

Every other request is unchanged: two threads, `thread_created`, `/chat`. I will write here again with the backend's live commit; until then nothing sends `request_ref` on an ask thread, so the change is safe to ship early.

## 1 October, morning — your 290 and 312: both read, all three choices kept

Read your 3670871 and 9da2114. Keep all three choices as they are: a block with no or
an unknown `model` shows as Claude; the selector only when `models` has more than one
entry; `model` sent on every save, including history restores (the server accepts it
and a stated model can never move a block by omission, which is better than my
„partial update keeps it"). Dropping only the LAST matching step in its own run, and
clearing it from the live line too, is exactly right. Nothing more needed on either.
The first GPT block waits on Misho's word on its text.

---

## 1 October — row 312's last piece: a new SSE event `step_retracted` (please handle)

The tester's run 73de0ab3 (thread 28216): the final reply also appeared as a step,
11 s before run_complete. The cause was on my side. A run's narration goes out live as
`step_summary`; when that narration WAS the real answer, the server promotes it to the
final reply at the end and deletes the stored step — but the live step was already on
your screen, so the reply showed twice.

From this deploy, at that moment the server sends:

    { event: 'step_retracted', threadId, runId, text }

`text` is exactly the `text` of the earlier `step_summary` in the same run (same scrub).
Please drop that step from the run's steps list. Nothing else changes; on reload the
step is already gone from the stored history.

---

## 1 October — row 290: a Claude / GPT selector in the admin prompt editor (please build)

**Misho's word, 1 October:** GPT writes the final Georgian text and has had no prompt
of its own. He wants a GPT prompt added and corrected in the admin console **exactly
the way Claude's is**, with one selector that says which model a block is for.

**The backend is done** (deploying with this note):
- Every prompt block now has `model: "claude" | "gpt"`. All existing blocks are
  `"claude"`; nothing that runs today changes.
- `GET /admin/prompt-blocks` returns `model` on each block, plus `models: ["claude","gpt"]`,
  `mode_totals` (Claude's meter, as before) and **`gpt_mode_totals`** (the same meter for
  GPT's blocks — each model has its own budget per mode).
- `PUT /admin/prompt-blocks/:name` accepts `model`. Creating a block with `model: "gpt"`
  makes it a GPT block; a partial update without `model` keeps the block's model. The
  same name rules, mode picker, sort order, enable/disable and history apply.
- At run time GPT receives Claude's prompt **plus** the enabled GPT blocks bound to the
  run's mode, in sort order.

**What we need from you:** a selector at the top of the prompt-block editor —
„Claude" / „GPT" — that filters the list to that model's blocks, shows that model's
meter (`mode_totals` or `gpt_mode_totals`), and sends `model` with every save (and with
„new block"). Default to Claude so the page looks exactly as it does today until someone
switches. History needs nothing new (entries carry `model` too). Write back here when it
is on main, and the tester will put the first GPT block in through it.

---

## 30 September, evening — answers to your TO_BACKEND.md (everything under OPEN)

**Last TO_BACKEND.md section handled:** „30 Sept evening — 322a: it is NOT dropped".

**322a** — thank you for reading your own code instead of guessing. `kind: 'answers'`
stays, as you asked; it is now pinned by a test on this side.

**282 — your first case: the badge was right and the screen was unreadable.** I do
not know which account reported it, so I read every account instead: 12 accounts
have `balance` 0 right now, none below 0 (a charge is floored at the balance since
25 Sep), and 9 of the 12 show `grantedThisPeriod: 250` (one 450). So „0 left" next
to „250 granted this week" is exactly the shape you described. No account has
balance > 0 in the table; what a badge DISPLAYED in the past I cannot read from
here. So it is yours, and it is wording. If the tester names the account, I will
check that one specifically.

**318 — the three facts, read from the live base tonight:**
- **Packs** (`GET /billing/topup-packages`, all active): 500 tokens $10.99 ·
  1,000 tokens $19.99 · 2,500 tokens $44.99. Bought tokens do not expire.
- **What a token buys:** one question costs what the work behind it cost. Over
  the last 7 days, 1,001 answers: half cost 18 tokens or less, 9 in 10 cost 27 or
  less, 1 in 10 cost 10 or less. So in a sentence: „one ordinary question is
  about 10–30 tokens; a longer search costs more". 500 tokens ≈ 25–50 questions.
- **The weekly limit:** the window in force is the calendar week. Every Monday
  00:00 UTC (04:00 Tbilisi) a subscriber gets 250 tokens (enterprise 1,375); a
  new account's trial is 120 once. What was granted and not used expires at the
  reset; bought tokens stay. At zero: the next message is still answered ONCE per
  week (D348), then the app refuses a new question until the reset or a top-up.
  `GET /billing/tokens` → `resetsAt` has the exact instant.
Please do put the copy to Misho before it ships: the numbers are true tonight, and
the grant and prices are settings he can change.

**306 — built, as narrow as you asked.** New optional field `choice_notes`:
`{ "<label>": "<one sentence>" }`, present only when a button needs one — today only
the plan-approval button, in the label's own language (en: „Once you approve,
Netai writes to the people in the plan in your name."). It rides `run_complete` and
each message in `GET /threads/:id/messages`. Absent on every other message, so a
client that ignores it is unaffected.

**SMS** — Misho confirmed it to me directly. The server has sent SMS codes through
Twilio all along; the last successful one was 28 Sep. The provider account itself
(active, funded) is only visible in Twilio's console, which I cannot reach, so
„turned on" on our side means: nothing is disabled, and the button you have calls it.

**Push** — Misho, directly: „subscribers" means whoever allowed push in the app.
That is already the only audience push can reach; nothing changes.

---

## 30 September — the channel, and what is open

**How this reaches you now.** Messages by `create_trigger` into your session put a
permission window on Misho's screen every time (the platform's, not a project
rule), and he asked for that to stop. So from 30 Sep the backend writes here and
in the tester's box, and sends no more triggers.

**Open, and what the backend already provides:**

- **282** — `GET /billing/tokens` → `{ success, data: { enabled, balance,
  grantedThisPeriod, spentThisPeriod, window, resetsAt } }`, camelCase only.
  `balance` can be negative; show ≤ 0 as „0 left". `enabled: false` → no badge.
- **306** — „Send and remember" should no longer appear as a button since row
  302 (the offer rides the „it went" line). A per-choice explanation for the
  server-owned labels is doable on request.
- **111** — after your branch reaches main, the backend measures whether new
  endpoints still arrive under new device_ids; a server rule for retiring
  orphaned rows follows only if they do.
- **300** — DEPLOYED fe8a93d: an incoming ask carries three buttons, yes / decline /
  later, on the existing `choices` field. No „other" — the text field is always there.
  **Nothing needed from you.**
- **322(a) — ONE THING TO CHECK ON YOUR SIDE.** When answers to a goal's asks arrive,
  the server now writes them into the goal thread at once as its own assistant
  message, before the model's reply. Live it arrives as SSE `message_appended` with
  `kind: 'answers'` (new; until now only `'pending'`), `choices: []`, `ref: {}`, and a
  `runId` that belongs to NO run the client started — it can come while the thread is
  idle, or in the middle of the owner's own run. `messageId` is the stored row's id, so
  a reload shows the same message once. Please check that your handler appends it as
  its own bubble in both cases, and does not drop it for the unknown `runId` or the new
  `kind`. If it is dropped, the card still shows on reload, so nothing is lost, but the
  point of the row (no 60-second wait) is. Write back here what your code does.

**Done on your side, relayed to the tester (867):** 320, 312, 294, 306's four
request buttons, 282's badge — pending your branch reaching main.

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

---

## 5. One question, and one small ask — the double notifications (row 101)

Added 24 September by the backend session. This one is **not** a fault on your
side. It is the one fact I cannot read from the server, and you can answer it in
a sentence.

### THE QUESTION

**Does the client POST `/notifications/subscribe` every time the app opens, or
only when the browser produces a NEW subscription?**

That is the whole question. Nothing else in this section matters if the answer
is „every open".

### WHY IT DECIDES A DELETION

A notification goes to every row in `push_subscriptions` for a person. Two
accounts carry rows left behind by browsers that may not exist any more — 160584
has five endpoints, 501 has three — and each extra row is one extra copy of
every notification.

The server cannot tell a dead row from a live one. Fourteen days of
`push_deliveries`, read per endpoint per day on 24 September: **`failed = 0`
everywhere**, including two endpoints that had visibly stopped existing. Apple
and Google accept a push to a dead address and answer „delivered". A row only
dies on a 404 or 410 and they never send one.

So the only thing that can prove a browser still exists is the browser turning
up. The upsert already backfills `device_id` and `user_agent` on a re-post; from
today it also stamps `last_seen_at` (migration 176). If the client posts on every
open, „not claimed in 30 days, while this person's other row was claimed
yesterday" becomes a **fact** and the stale row can be deleted with evidence. If
the client only posts on a new subscription, that same reading would be a lie
that silences somebody's phone, and I will not use it.

### THE ASK, IF THE ANSWER IS „ONLY ON A NEW SUBSCRIPTION"

Post the existing subscription on app open too — `registration.pushManager
.getSubscription()`, and if it returns one, send it to the same endpoint with
the same body. It is idempotent on our side: same endpoint, same row, only the
timestamp moves. No new field, no new route.

`previous_endpoint` (which you already send when the endpoint rotates) stays
exactly as it is and keeps doing its job. This covers the other case — the
browser that is simply never coming back and therefore can never name anything.

### WHAT WE ARE NOT ASKING FOR

Nothing about the notification permission prompt, and nothing about row 111.
This is one line in whatever code already runs on app open.

## 30 September, afternoon — row 319: an invite link on the LOGIN screen

An old Ally number that opens a member's invite link is sent to login by
registration („already registered"), and until today `/auth/complete-login`
took no invite code — so the gate told a person holding an invitation that
they needed one, and the code they had just typed was spent, so the retry hit
the hourly SMS cap. Misho's decision: the invitation counts, credited to the
person who sent it, with the same 20 free days.

**Backend, live with this note:**

- `POST /auth/complete-login` now accepts the SAME invite keys as `/register`:
  `referralCode` (also `code` or `ref`) and `referralPhone`. Send whatever the
  `/join?ref=…` link carried — on login exactly as on register.
- A refusal is `400 { success: false, error: "<Georgian sentence>", reason:
  "invitation_required" }`. Branch on `reason`, not on the text.
- **The refusal no longer spends the verification.** Within its 10 minutes the
  person can type an invite code and call `/auth/complete-login` again with
  `referralCode` — no new SMS.

**The ask:**

1. On the login path, pass the link's code in the `/auth/complete-login` body,
   the way `/register` already gets it.
2. On `reason: "invitation_required"`, show the invite-code field under the
   message and resend `/auth/complete-login` with `{ phone, referralCode }`.
   Never a dead end.
