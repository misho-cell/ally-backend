/**
 * The data dictionary shipped inside the zip: every column, what a person
 * would call it, and what the base calls it.
 */
export const DATA_DICTIONARY_PART_A_D = `# Axel members export — data dictionary (first delivery: parts A and D)

Exported by the Netai backend on Misho's word, 6 October 2026, for the founder's request of 11:22 Tbilisi.

## Identifiers and the hash

- **member_hash / any *_hash**: a phone number replaced by a keyed one-way code (HMAC-SHA256 over the digits, first 24 hex characters). The same number gives the same hash in every file of every delivery. The key is a server secret, so a hash cannot be rebuilt by trying numbers. If that secret is ever rotated, every hash changes.
- **roster_key**: 1…N, the member's place on the roster ordered by member_hash. It is stable while the roster is unchanged.
- **user_id**: the base's own account id ("User".id), empty when the number has no account.
- The roster is the public, unretracted contact_facts rows with field_type = member_of naming Axel, one row per phone number.

## members.csv — part A, one row per roster member

| column | what it is | in the base |
|---|---|---|
| account_found | the roster number belongs to an account | "UserPhone" matched by digits |
| account_found_by | always phone_number in this delivery | — |
| account_state | netai_user = has used Netai (a conversation, a search, or a live subscription); ally_account = an old Ally account only; none = no account, or deleted | netaiMembership.joinedNetai |
| registered_at | when the account was created | "User"."createdAt" |
| last_active_at | the latest message in any Netai conversation | MAX(conversations.created_at) |
| subscription_status | the subscription state | "User".subscription_status |
| phonebook_shared / phonebook_contacts | has a phonebook in the base / distinct numbers in it | "UserAlias" where "contactId" = the member |
| phonebook_first_dated_save | the earliest save with a real date. Rows from before 22 Aug 2026 carry a migration timestamp and are not counted | "UserAlias".created_at |
| is_axel_member | always true here | — |
| ask_opted_out | has asked to receive no asks | ask_optouts |
| blocks_set | numbers this member has blocked | "UserBlock" |
| asks_sent_24h / asks_received_24h | asks in the last 24 hours. The receiving cap is 2 a day; the sending cap is 20 | task_asks |
| asks_sent_total / asks_received_total | all asks ever | task_asks |
| open_goals | open goals | tasks.status = open |
| needs_noted | needs the assistant has noted | user_notes.kind = need |
| profile_answers | profile questions answered (Part H) | answer_events |
| own_job_position / own_employer / own_city | as the member entered them at registration (often empty) | "User" |
| facts_on_own_number | the base holds any fact about this member's own number | contact_facts |

## aggregates_per_member.csv — part D, per member, over that member's phonebook

| column | what it is | in the base |
|---|---|---|
| contacts_total | distinct numbers in the phonebook | "UserAlias" |
| contacts_tagged | contacts carrying at least one tag from this member | "UserTags" |
| contacts_with_facts | contacts the base holds any fact on, from anyone | contact_facts (unretracted) |
| contacts_with_relationship_score | contacts with a computed relationship type (family / close / professional / formal) | contact_relationship_scores |
| contacts_warm | the confirmed warm tie: tier green or blue, OR old-Ally colour allies or loyal, OR the member said "close" | chorusCap.confirmedWarmTieSql |
| tier_green … tier_red | the colour tier the member gave | human_relationship_tiers |
| legacy_allies … legacy_contacts | the old Ally app's colour | "UserConnection"."relationshipStatus" |
| contacts_netai_users / contacts_old_ally_accounts / contacts_no_account | what each contact's number is in the base | "UserPhone" + "User" |
| contacts_axel_members | contacts who are themselves on the roster | the roster |

## Not in the base

- Tags have no colour anywhere in the base. "Colour" exists only as the old Ally relationship sort and the tier above.
- Parsed first name / surname / company / role are not stored. They come in the second delivery, read from the label at export time.
`;
