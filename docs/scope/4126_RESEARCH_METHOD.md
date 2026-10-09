# 4126 — the research method for people (D757–D764): exact scope for Misho's yes

Written by the code session, 9 October ~20:30 UTC. Nothing here is built. Every item ships only after
Misho's yes on that item (it widens what Netai researches and stores about people), and each prompt text
needs its own yes, recorded with the exact text.

## What exists today (read from the code)

- `researchRunner.service.ts` researches **phone numbers from the target list**, not new users. It runs
  every 15 minutes when `RESEARCH_RUNNER=on`, using web search only (Tavily). It is capped at 10 people
  per tick, 200 searches a day, 3 steps per person, and it re-researches each person every 30 days.
- What it finds is stored only as raw hits (`research_findings`: url, title, snippet, date). Nothing turns
  them into facts.
- Facts live in `contact_facts`: source chat / sweep / label / debrief, and confidence stated / mentioned.
  There is no URL column and no research source.
- A person can see the public facts about themselves only through a chat tool
  (`get_what_netai_knows_about_me`). **Nothing lets a person remove facts other people saved about them.**
- No table holds people who are neither users nor anybody's contacts.

## The scope, item by item (each needs a yes)

1. **One deep research run at registration, for the new user only.**
   - Inputs: their name and anything they gave at signup (city, a profile link).
   - Tools: web search plus page reading. No search cap for this one run.
   - It runs once and never again (D757 §5).
   - Cost: unknown until measured. I propose a hard stop of 60 searches and 30 pages per person, so one bad name cannot spend without limit. Misho decides between that and „no cap".
2. **Facts gain source, date and confidence.**
   - `contact_facts` gains `source = 'research'`, `source_url`, `checked_at` and `confidence` (confirmed / possible).
   - A fact from one ordinary source is `possible`. An official source, or two independent sources, makes it `confirmed`.
   - When sources conflict, both are kept, with a conflict note.
3. **People found on public member lists get their own table** (`list_people`).
   - Fields: name, organisation, listed role, source URL, check date. Nothing else: no phone and no photo.
   - Such a person is never a „knows" link and never an introduction route.
   - Before merging with a contact or user, a same-name check runs; on doubt, they are not merged.
   - They are researched deeper only when a request makes them relevant.
4. **Contacts' research stays professional only.**
   - The runner skips any number the owner's labels mark as family or close (მამა, დედა, ძმა, და, ბებია, ბაბუა, ცოლი, ქმარი, ❤️ …).
   - When it is unclear, Netai asks the owner instead.
   - **Open question:** should the existing 30-day re-research of the target list stop for people who are themselves users (D757 §5: „once, at registration")?
5. **A person sees and removes facts about themselves.**
   - `GET /me/facts` lists every fact about their own numbers, with source and date: researched, label-derived and other users' facts (the submitter is never named).
   - `DELETE /me/facts/:id` removes a fact everywhere: retracted, not matchable, not shown.
   - The same is available as a chat command.
   - The frontend needs one screen for it.
6. **Prompt texts, each a separate D44 yes:**
   - (a) list membership is never acquaintance;
   - (b) a single-source fact is said as „possible", with source and date;
   - (c) ask the owner when a contact's work status is unclear;
   - (d) an occasional „სამსახურში რამე სიახლე?" to the user, instead of re-research.

   I will draft the exact texts after items 1–5 are decided.

## DONE WHEN (from the founder, 2 of 2)

- A fresh seat registers, and its own work facts appear within the registration run, each with source and date.
- A member-list person is stored without any „knows" link.
- A single-source fact is shown as possible, with source and date.
- The person removes one fact, and it is gone everywhere.
