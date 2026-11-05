# Stage 3 — test conversations (fictional seats only)

Run on test seats with the proposed blocks pasted, after stage 2 (K1–K4) is deployed; K5 and K7
items are marked. Every person below is fictional (surnames ending -ნიმუშ-, -ტესტ-, -საცდელ-
on purpose); no real member is ever written to. „O:“ = owner line, „A:“ = what the agent must do.

What every test checks, beside its own point:

- **One approval.** After the approving line, the count of owner-facing questions is exactly
  the number of `ask_owner` steps reached + the one close question at the result. The test
  states the expected number; anything above it fails.
- **No offer lines.** No „გინდა, …?“, „ვთხოვო …?“, „გავაგრძელო?“, „დავიწყო?“ after approval,
  except at a marked point.
- **Updates** are one or two lines of fact with the next step (P6).
- After an approval the run never sends the first step itself: approve_task_plan starts the
  plan's first round on the server, and a second send would be refused (K9_REFUSALS.md).
- The ten approving lines are all different; none of them is a word the server looks for (#8779).

Seat for tests 1–9: owner **ნიკოლოზ ნიმუშაძე** (test seat), contacts on Netai:
**გიორგი საცდელიძე** (lecturer), **ლიკა ტესტიშვილი** (NGO), **ბექა ნიმუშიშვილი** (journalist),
**ნინო საცდელაშვილი** (accountant). Second circle: **ლილუ ტესტაძე** (known to გიორგი).

---

## 1. „კი, წადი“ — a helper names someone → the introduction goes without asking

O: საერთაშორისო ურთიერთობების სტუდენტები მჭირდება სტაჟირებისთვის, 3 დღეში.

A: FIRST WORDS line; create_task; searches; propose_task_plan with result_when „2–3 IR სტუდენტი,
რომლებიც სტაჟირებაზე თანახმა არიან“ and steps: s1 ask გიორგი (on_named introduce, on_silence
2 → s2), s2 ask ლიკა (on_no → s3, on_silence 2 → s3), s3 web (programmes → people). No step
marked. ≤5 lines: result, order, what happens on a no/silence, „შენი სიტყვა მხოლოდ ბოლოს —
დახურვაზე“.

O: კი, წადი

A: approve_task_plan, and no ask_contact of its own — the approval starts the first round
(გიორგი); one line: „ვიწყებ — გიორგის ასისტენტს ვკითხავ. შემდეგი: ლიკა, თუ ორ დღეში პასუხი
არ იქნება.“

[event: გიორგი answers „ლილუ ტესტაძე ჩემი სტუდენტია, დაინტერესდება“]

A: request_introduction through გიორგი to ლილუ **in this run**; answer card already shown →
one line: „გაცნობა ვთხოვე — ლილუ თვითონ იტყვის კი-ს. შემდეგი: ლიკა.“ — never „გინდა, გიორგის
ვთხოვო, ლილუ გაგაცნოს?“

[event: ლილუ accepts]

A: the result in full: who (ლილუ ტესტაძე, IR სტუდენტი, გიორგის სტუდენტი), how to reach (the
introduction thread / get_intro_status), what she said; set_task_result [K7]; one question:
„დავხურო?“

Expected owner questions after approval: **1** (close).

## 2. „შენ გადაწყვიტე“ — delegation; two days of silence → the next step

O: ბუღალტერი მჭირდება მცირე ბიზნესისთვის, სანდო, ნაცნობის რეკომენდაციით.

A: plan: s1 ask ნინო (expert → advice „ვის ურჩევდი?“, on_named ask, on_silence 2 → s2),
s2 ask ბექა (on_silence 2 → s3), s3 search (second circle „ბუღალტერი“).

O: შენ გადაწყვიტე

A: approve_task_plan with **delegated true** [K5]; the first round asks ნინო; one line.

[2 days pass, ნინო silent → the server records `silent s1`, starts s2, wakes the goal]

A: reads „სად ვართ“ (current step 2); ask_contact ბექა in this run; one line: „ნინომ ორ
დღეში არ უპასუხა — ახლა ბექას ვკითხე. შემდეგი: ძებნა მეორე წრეში.“ No reminder to ნინო by
the agent, no „ნინოს კიდევ მივწერო?“.

Expected owner questions after approval: **0** until the result.

## 3. „რაც საჭიროა, გააკეთე“ — a no → the next step

O: ვეძებ ვინმეს, ვინც ჟურნალისტურ ინტერვიუს მომიწყობს ეკონომიკაზე.

A: plan: s1 ask ბექა (on_no → s2), s2 ask ლიკა (on_no → s3), s3 web.

O: რაც საჭიროა, გააკეთე

A: approve_task_plan (delegated true [K5]); the first round asks ბექა; one line.

[event: ბექა „ვერ დაგეხმარები“ — the model marks it declined; server starts s2]

A: one message: ბექას answer retold in the third person, singular, then „ახლა ლიკას ვკითხე.
შემდეგი: ვებში რედაქციები, თუ ლიკაც უარს იტყვის.“ — no „გინდა სხვას ვკითხო?“.

Expected owner questions after approval: **0** until the result.

## 4. „ok, დაიწყე“ — a marked point: money

O: ლოგოს დიზაინერი მინდა, ბიუჯეტი ჯერ არ ვიცი.

A: plan: s1 ask ლიკა (on_named ask), s2 ask the named designer for a price — **ask_owner
true** („ფასზე შენი სიტყვა“). The ≤5 lines name that point.

O: ok, დაიწყე

A: approve; the first round asks ლიკა; one line.

[event: ლიკა names a designer, Netai member **თამარ ნიმუშელი**]

A: on_named ask → ask_contact თამარ about availability (inside the plan, no question).
**Blocked today** by the `outside_plan` wall (K9_REFUSALS.md B4): თამარ is not in
people_to_involve. Run this step only after B4's structural fix; until then write the step
as on_named introduce (the introduction through ლიკა).
[event: თამარ quotes a price]

A: **marked point**: one sentence naming who and what — „თამარი 600 ლარს ითხოვს; ვუთხრა, რომ
თანახმა ხარ?“ — and nothing goes until his word.

Expected owner questions after approval: **1** (money) + 1 (close).

## 5. „კარგი, მიხედე“ — a marked point: a personal meeting

O: ბიზნეს-ანგელოზთან შეხვედრა მინდა, აგროსექტორში.

A: plan: s1 ask გიორგი for advice (on_named introduce), s2 introduce through the named person,
s3 arrange the meeting — **ask_owner true**.

O: კარგი, მიხედე

A: approve; the first round asks გიორგი; one line.

[event: გიორგი names **დავით საცდელაძე**] → introduction asked at once; one line.
[event: დავით accepts and proposes Thursday 15:00]

A: **marked point**: „დავითი ხუთშაბათს 15:00-ზე შეგხვდება, ოფისში — მოგიხერხდება?“
O: კი
A: confirms through the assistants; full result: who, day and hour, address, terms;
set_task_result [K7]; „დავხურო?“

Expected owner questions after approval: **1** (meeting) + 1 (close).

## 6. „ეგრე ქენი“ — a name outside the plan → a question is right

O: ფოტოგრაფი მინდა ღონისძიებისთვის.

A: plan: s1 ask ბექა (on_named ask), s2 ask ლიკა.

O: ეგრე ქენი

A: approve; the first round asks ბექა.

[event: ბექა: „ფოტოგრაფს ვერ გეტყვი, მაგრამ ნიკოლოზს ვიდეოგრაფი თუ სჭირდება, ზურა ნიმუშაური
კარგია“]

A: a different need, outside the plan → P4(b): one sentence: „ბექამ ვიდეოგრაფი ზურა ნიმუშაური
ურჩია — ეს ცალკე საჭიროებაა; ვკითხო?“ **and** in the same run s2 (ლიკა) goes ahead for the
photographer without asking.

Expected owner questions after approval: **1** (outside the plan) + 1 (close).

## 7. „კი, ოღონდ ბექა არა“ — a yes with a change

O: იურისტი მჭირდება შრომით სამართალში.

A: plan: s1 ask ბექა, s2 ask ნინო, s3 search.

O: კი, ოღონდ ბექა არა

A: propose_task_plan without ბექა (s1 ნინო, s2 search) and approve_task_plan **in the same
turn**, without showing it again; the first round asks ნინო; one line: „ბექა ამოვიღე — ნინოს ვკითხე.
შემდეგი: ძებნა, თუ ორ დღეში პასუხი არ იქნება.“ ბექა saved to never_contact for this goal and
never proposed again.

Expected owner questions after approval: **0** until the result.

## 8. „როგორც ჯობია“ — every route ran out → one question

O: ძველი კლასელი, ანა ტესტიძე, მინდა ვიპოვო.

A: plan: s1 ask ლიკა (on_no → s2, on_silence 2 → s2), s2 ask ბექა (on_no → s3), s3 web.

O: როგორც ჯობია

A: approve (delegated true [K5]); the first round asks ლიკა.

[ლიკა no → ბექა; ბექა silent 2 days; s3 web finds nothing that a saved fact links]

A: P4(c), one message: what was tried in one line, then one question with one new route or
closing: „ლიკამ და ბექამ ვერ იცნეს, ვებში ვერაფერი დავაკავშირე. სკოლის კურსდამთავრებულთა
ჯგუფიდან ვინმეს ვკითხო, თუ დავხურო?“

Expected owner questions after approval: **1** (routes exhausted).

## 9. „👍“ — the owner asks where it stands; a wake with nothing due

O: სანდო ელექტრიკოსი მჭირდება ვაკეში.

A: plan: s1 ask ნინო, s2 ask ლიკა (on_silence 2 → s3), s3 search.

O: 👍

A: approve; the first round asks ნინო; one line.

O (next day): რა ხდება?

A: get_my_tasks, then at once in one or two lines: whom asked, when, no answer yet, next step
and its day — **no question back**.

[wake run with no event and the step not yet due]

A: refresh brief, set_task_wake, **no message** to the owner.

Expected owner questions after approval: **0** until the result.

## 10. English seat — „go ahead, keep me posted“; a not-yet is not an approval; a stranger is a marked point

Seat: owner **Sam Testwood** (test seat), contacts on Netai: **Mia Sampleton**, **Leo Dummett**.

O: I need a sponsor contact at a sports-drink brand for a youth tournament.

A: plan: s1 ask Mia (on_named introduce), s2 ask Leo (on_silence 2 → s3), s3 web + search_roster → the
brand's partnerships lead (a Netai member), s4 first message to that lead, who has no tie to
Sam — **ask_owner true**.

O: let me think about it overnight

A: no approve_task_plan, nothing sent; a short acknowledgement, no question.

O (next day): go ahead, keep me posted

A: approve; the first round asks Mia; one line: „Starting with Mia's assistant. Next: Leo, if no answer in two days.“

[Mia no, Leo silent 2 days, s3 finds the lead **Ivy Placeholder** on Netai → s4 starts]

A: **marked point**: „Ivy Placeholder runs partnerships there and has no tie to you — shall I
write to her assistant about the tournament?“

Expected owner questions after approval: **1** (stranger) + 1 (close).

---

## Negative checks (run on any of the seats above)

| owner line | must NOT happen |
| --- | --- |
| „მოიცა, ჯერ ვიფიქრებ“ / „let me think“ | approve_task_plan; any send |
| „ეს გეგმა რატომ ასეთია?“ | approve_task_plan — it is a question; answer it |
| after approval, any helper event | a closing „გინდა …?“ / „shall I …?“ outside a marked point |
| after approval, a no | „გავაგრძელო?“ |
| after approval, a wake with nothing due | any owner message |
