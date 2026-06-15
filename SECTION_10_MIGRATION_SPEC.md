# §10 — Data Migration Spec: Ally Postgres → Supabase + Neo4j Rebuild

**Version:** 1.0  
**Status:** Draft  
**Scope:** One-time migration of ~2.5M contacts from old Ally Postgres (Germany) to new Supabase Frankfurt + Neo4j Aura (Germany).

---

## 10.1 Infrastructure & Residency

| Component | Source | Destination |
|---|---|---|
| Contact data | Old Ally Postgres (Germany) | Supabase Frankfurt (eu-central-1) |
| Graph data | Old Neo4j (read only for structure reference — NOT direct source) | Neo4j Aura (Germany) |
| Migration runner | Any VM in EU (Frankfurt preferred) | — |

**Rule:** No data may transit outside the EU at any point. All connection strings must resolve to EU endpoints. Verify with `pg_stat_activity` host before running.

---

## 10.2 Merge Key — Phone E.164 as Idempotency Key

Every contact row is uniquely identified by its E.164-normalised phone number.

**Normalisation rule:**
```
e164 = '+' + digits_only(raw_phone)
```
- Strip all non-digit characters except leading `+`
- If no `+` prefix: prepend country code from `UserPhone.phoneCode`
- Result must match `^\+[1-9]\d{6,14}$` — reject rows that do not match

**MERGE pattern (all inserts use this):**
```sql
INSERT INTO phones (e164, ...)
VALUES ($1, ...)
ON CONFLICT (e164) DO NOTHING;
```

Re-running the migration twice produces zero net changes on the second run. No `UPDATE` is issued during migration — only `INSERT ... ON CONFLICT DO NOTHING`.

---

## 10.3 Source → Destination Field Mapping

### 10.3.1 `User` → `users`

| Source (old Ally) | Destination (Supabase) | Notes |
|---|---|---|
| `User.id` | `users.legacy_id` | integer, kept for join tracing |
| `User.name` | `users.name` | |
| `User.email` | `users.email` | nullable |
| `User.city` | `users.city` | nullable |
| `User.jobPosition` | `users.job_position` | snake_case |
| `User.employer` | `users.employer` | nullable |
| `User.gender` | `users.gender` | enum cast |
| `User.birthday` | `users.birthday` | nullable |
| `User.createdAt` | `users.created_at` | |
| `User.status` | `users.status` | only `'ACTIVE'` rows migrated (see §10.4) |

### 10.3.2 `UserPhone` → `phones`

| Source | Destination | Notes |
|---|---|---|
| `UserPhone.phone` | `phones.e164` | normalised, PK for merge |
| `UserPhone.phoneCode` | `phones.country_code` | e.g. `+995` |
| `UserPhone.phoneNumber` | `phones.local_number` | without country code |
| `UserPhone.userId` | `phones.user_id` | FK → users.legacy_id |
| `UserPhone.createdAt` | `phones.created_at` | |

### 10.3.3 `UserAlias` → `contact_aliases`

| Source | Destination | Notes |
|---|---|---|
| `UserAlias.id` | `contact_aliases.legacy_id` | |
| `UserAlias.userId` | `contact_aliases.owner_user_id` | who saved this alias |
| `UserAlias.contactId` | `contact_aliases.contact_user_id` | nullable |
| `UserAlias.alias` | `contact_aliases.alias` | |
| `UserAlias.phone` | `contact_aliases.e164` | normalised, FK → phones.e164 |

### 10.3.4 `UserTags` → `contact_tags`

| Source | Destination | Notes |
|---|---|---|
| `UserTags.id` | `contact_tags.legacy_id` | |
| `UserTags.userId` | `contact_tags.owner_user_id` | nullable |
| `UserTags.contactId` | `contact_tags.contact_user_id` | nullable |
| `UserTags.tag` | `contact_tags.tag` | lowercased on insert |
| `UserTags.phone` | `contact_tags.e164` | normalised, FK → phones.e164 |
| `UserTags.weightCount` | `contact_tags.weight_count` | integer, default 1 |
| `UserTags.source` | `contact_tags.source` | enum: `IMPORTED_CONTACT`, etc. |

---

## 10.4 Privacy Filters (Applied Before Any Insert)

Both filters run as a WHERE clause on the source query. No filtered row is written to the destination.

### Filter 1 — Block-flagged contacts
```sql
AND NOT EXISTS (
  SELECT 1 FROM "UserConnection" uc
  WHERE (uc."originUserId" = up."userId" OR uc."originUserId" = up."userId")
    AND (uc."banConductContact" = true OR uc."banConductedByContact" = true)
)
```

### Filter 2 — Under-18
```sql
AND (
  u."birthday" IS NULL
  OR u."birthday" <= NOW() - INTERVAL '18 years'
)
```

### Filter 3 — Deleted / disabled accounts
```sql
AND u."deletedAt" IS NULL
AND u."disabledAt" IS NULL
AND u."status" = 'ACTIVE'
```

All three filters compose with AND. A row excluded by any filter is silently skipped (no error, no log entry beyond batch counter).

---

## 10.5 Batch Strategy

**Batch size:** 10,000 rows per commit  
**Total estimated rows:** ~2.5M contacts (phones as unit of work)  
**Estimated batches:** ~250  
**Checkpoint table:** `migration_checkpoint` (created on first run)

```sql
CREATE TABLE IF NOT EXISTS migration_checkpoint (
  table_name  TEXT PRIMARY KEY,
  last_offset BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

**Per-batch loop (pseudocode):**
```
offset = read_checkpoint('phones')
LOOP:
  rows = SELECT ... FROM "UserPhone" ORDER BY id LIMIT 10000 OFFSET offset
  IF rows is empty → BREAK
  BEGIN TRANSACTION
    INSERT INTO phones (...) ON CONFLICT (e164) DO NOTHING  [for each row]
    INSERT INTO contact_aliases (...) ON CONFLICT DO NOTHING  [joined aliases]
    INSERT INTO contact_tags (...) ON CONFLICT DO NOTHING  [joined tags]
    UPDATE migration_checkpoint SET last_offset = offset + 10000, updated_at = NOW()
      WHERE table_name = 'phones'
  COMMIT
  offset += 10000
  SLEEP 50ms  -- back-pressure on source DB
```

**On interruption:** Restart the script. It reads `last_offset` from `migration_checkpoint` and resumes from the next uncommitted batch. Already-committed rows are skipped via `ON CONFLICT DO NOTHING`.

**On error in batch:** Roll back the transaction for that batch only. Log the offset and the error. Continue to next batch. Failed batches are re-queued for a single retry pass at the end.

---

## 10.6 Neo4j Rebuild

**Source for rebuild:** New Supabase `phones` and `contact_tags` tables — NOT the old Neo4j instance.

**Graph model:**
```
(:PhoneNode { e164: string, user_id: int|null })
-[:CONTACT { weight: int, source: string }]->
(:PhoneNode)
```

**Rebuild steps:**

1. **Load phone nodes**
```cypher
MERGE (p:PhoneNode { e164: $e164 })
ON CREATE SET p.user_id = $user_id, p.created_at = datetime()
```
Source: `SELECT e164, user_id FROM phones`

2. **Load connection edges** — derived from `UserConnection` joined to `phones`:
```cypher
MATCH (a:PhoneNode { e164: $from_e164 })
MATCH (b:PhoneNode { e164: $to_e164 })
MERGE (a)-[r:CONTACT]->(b)
ON CREATE SET r.weight = $weight, r.source = $source
```
Source:
```sql
SELECT
  up_from.phone AS from_e164,
  up_to.phone   AS to_e164,
  uc."contactFrequency" AS weight,
  uc."platform"::text   AS source
FROM "UserConnection" uc
JOIN "UserPhone" up_from ON up_from."userId" = uc."originUserId"
JOIN "UserPhone" up_to   ON up_to."userId"   = uc."originUserId"
WHERE uc."isIgnored" = false
  AND uc."banConductContact" = false
  AND uc."banConductedByContact" = false
```

3. **Batch size for Neo4j:** 5,000 nodes or edges per transaction.

4. **Idempotency:** `MERGE` on `e164` for nodes, `MERGE` on `(a)-[r:CONTACT]->(b)` for edges — safe to re-run.

---

## 10.7 Idempotency Proof

The migration script is idempotent. Running it N times is equivalent to running it once.

| Operation | Pattern | Re-run effect |
|---|---|---|
| Insert phone | `INSERT ... ON CONFLICT (e164) DO NOTHING` | 0 rows affected |
| Insert alias | `INSERT ... ON CONFLICT DO NOTHING` | 0 rows affected |
| Insert tag | `INSERT ... ON CONFLICT DO NOTHING` | 0 rows affected |
| Neo4j node | `MERGE (p:PhoneNode {e164})` | no-op if exists |
| Neo4j edge | `MERGE (a)-[r:CONTACT]->(b)` | no-op if exists |
| Checkpoint | `UPDATE ... SET last_offset` | idempotent per batch |

**Verification query (run after second pass — must return 0 for all):**
```sql
SELECT
  (SELECT COUNT(*) FROM phones          WHERE created_at > $second_run_start) AS new_phones,
  (SELECT COUNT(*) FROM contact_aliases WHERE created_at > $second_run_start) AS new_aliases,
  (SELECT COUNT(*) FROM contact_tags    WHERE created_at > $second_run_start) AS new_tags;
-- Expected: 0 | 0 | 0
```

---

## 10.8 Pre-Migration Checklist

- [ ] Source DB connection string resolves to EU host
- [ ] Destination Supabase region confirmed as `eu-central-1` (Frankfurt)
- [ ] Neo4j Aura region confirmed as Germany
- [ ] `migration_checkpoint` table created on destination
- [ ] All destination tables have unique constraints on merge keys
- [ ] Dry-run on 1,000 rows completed with zero errors
- [ ] Privacy filter verified: blocked and under-18 rows absent from destination sample
- [ ] Rollback plan documented: `TRUNCATE phones, contact_aliases, contact_tags CASCADE` + drop Neo4j DB

---

## 10.9 Post-Migration Verification

```sql
-- Row counts (compare against source estimates)
SELECT 'phones'          AS tbl, COUNT(*) FROM phones
UNION ALL
SELECT 'contact_aliases',         COUNT(*) FROM contact_aliases
UNION ALL
SELECT 'contact_tags',            COUNT(*) FROM contact_tags;

-- No orphaned aliases (every alias phone exists in phones)
SELECT COUNT(*) FROM contact_aliases ca
LEFT JOIN phones p ON p.e164 = ca.e164
WHERE p.e164 IS NULL;
-- Expected: 0

-- No orphaned tags
SELECT COUNT(*) FROM contact_tags ct
LEFT JOIN phones p ON p.e164 = ct.e164
WHERE p.e164 IS NULL;
-- Expected: 0

-- Neo4j node count matches phones
MATCH (p:PhoneNode) RETURN count(p);
-- Expected: ~= SELECT COUNT(*) FROM phones
```

---

## 10.10 Rollback

If migration must be aborted mid-run:

1. Stop the migration script.
2. On Supabase:
```sql
TRUNCATE contact_tags, contact_aliases, phones CASCADE;
TRUNCATE migration_checkpoint;
```
3. On Neo4j Aura:
```cypher
MATCH (n) DETACH DELETE n;
```
4. Restart from offset 0.

The old Ally Postgres and old Neo4j remain untouched throughout — they are read-only sources.
