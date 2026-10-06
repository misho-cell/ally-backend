import { DATA_DICTIONARY_PART_A_D } from './dataDictionary';

/** The full export's dictionary: the first delivery's, plus parts B, C, D (across) and E. */
export const DATA_DICTIONARY_FULL = `${DATA_DICTIONARY_PART_A_D}

## contacts.csv — part B, one row per phonebook entry (owner → contact)

| column | what it is | in the base |
|---|---|---|
| owner_roster_key / owner_user_id | the member who saved this contact | "UserAlias"."contactId" |
| contact_hash / contact_user_id | the contact's number (hashed) and their account id, if any | "UserPhone" |
| contact_account_state | netai_user / ally_account / none | as in members.csv |
| contact_roster_key | the contact's own roster key when they are an Axel member | the roster |
| label | the full text the owner saved them under | "UserAlias".alias |
| label_script | georgian / latin / mixed / none | read from the label |
| label_first_name / label_surname / label_company / label_role | the label's parts, read at export time by the product's own label reader. They are not stored. | labelReader.classifyToken |
| label_saved_at / label_source | when it was saved (empty before 22 Aug 2026) and by which import | "UserAlias" |
| tags / tag_sources | every tag this owner gave this contact; who set it (IMPORTED_CONTACT, USER_CREATED) | "UserTags" |
| fact_count / employer / occupation / city / industry | facts on this number from anyone (all rows are in contact_facts.csv) | contact_facts |
| seniority / is_decision_maker | the base's enrichment of the number | contact_enrichment |
| owner_insights | what this owner's assistant saved about the contact (JSON) | contact_insights.data |
| relationship / relationship_strength | the computed type (family / close / professional / formal) and its score | contact_relationship_scores |
| via_warmth | the warmth of this owner as a bridge to this contact, 0.3–0.95, computed by the product's own rule (score, tags, owner's fact, answered ask, a written tie) | searchSecondDegree.ts |
| warm | the confirmed warm tie (tier green/blue, old colour allies/loyal, or said close) | chorusCap.confirmedWarmTieSql |
| close_contact | the owner told the assistant this person is close | warmth_events.stated_close |
| tier / legacy_colour | the colour tier; the old Ally app's colour | human_relationship_tiers; "UserConnection" |
| excluded / blocked | the owner excluded this contact (for what, why) / blocked the number | contact_exclusions; "UserBlock" |
| ties_written | relations the owner stated between this contact and another (relation:other_hash) | contact_relationships |
| asks_sent / asks_answered / asks_declined / asks_later / asks_open | asks this owner sent this contact through Netai | task_asks |
| introductions_asked / invited | introduction requests about this contact (statuses); an invitation sent | introduction_requests; invites |
| senior_role | the label or a fact names a senior role (CEO, director, founder, minister, head of…, Georgian forms included) | read at export time |

## contact_facts.csv — part B, every unretracted fact on every contact number

| column | what it is |
|---|---|
| contact_hash | the number the fact is about |
| field_type / value | occupation, employer, city, industry, note, member_of … and the value |
| is_public | visible to everyone, or private to who wrote it |
| source / confidence | chat, sweep, label, debrief; stated or mentioned |
| submitted_by_user_id / submitted_by_roster_key | who wrote it, and their roster key when a member |

## Part C — the crossings

- **crossings_member_to_member.csv**: one row for each ordered pair where member X saved member Y. It has Y's label and relationship fields in X's phonebook, and X's in Y's when Y saved X back.
- **crossings_shared_contacts.csv**: one row per (contact, member) for every contact saved by two or more members. Each row has that member's label and relationship fields, and the senior-role flag.
- The senior-role flag (C3) is a column on contacts.csv and crossings_shared_contacts.csv.
- The per-member Netai / old Ally / none counts (C4) are in aggregates_per_member.csv.

## Part D — across the roster

- **aggregates_tag_frequency.csv**: each tag, the distinct contacts carrying it, and how many members use it.
- **aggregates_top_employers.csv**: employers named in facts or as a label's company words, by distinct contacts.
- **aggregates_relationship_distribution.csv**: every value of relationship, tier, legacy_colour, warm and close_contact, with counts.
- **aggregates_reach.csv**: phonebook rows, distinct people, people saved by 2+, 3+ and 5+ members, senior-role flags.

## member_other.csv — part E, everything else per member (counts, never text)

These columns are counts per member:
- language
- conversations; messages_written
- goals: open, paused, closed
- asks received: answered, declined, open
- introductions: requested, mediated
- invites_sent
- answer_rules (standing rules for answering)
- chorus_asked / chorus_agreed (invitation campaign)
- referral_earnings / referral_earned_usd

## Not in the base

- Tags have no colour.
- No counter of mentions in conversations exists, and conversation text is not exported.
`;
