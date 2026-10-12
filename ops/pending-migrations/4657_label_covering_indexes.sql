-- 4657 — the name search's label scan, read from the index alone.
--
-- Authorised by Misho, 12 October 11:39 UTC, in the code session's chat:
-- „3 კი" (§132). Ops runs it by hand, off-peak, outside any transaction — the
-- migration runner wraps every file in BEGIN, where CONCURRENTLY is illegal
-- (the same reason as 036's trigram index). Nothing is deleted; no row changes.
--
-- WHY. The founder's „ეკა კოპალიანი" timed out at 8.6 s. The search reads every
-- label any user saved on the owner's numbers — for him 89,308 tags and 45,406
-- saved names on 1,908 numbers. Measured on production, 12 Oct, one table at a
-- time: ~0.7 s warm, ~3 s cold. The cold cost is disk: "UserTags" is 5.7 GB and
-- "UserAlias" 2.6 GB against 2.5 GB of shared_buffers, and the existing
-- (phone, tag) / (phone, alias) indexes do not hold "contactId", so every
-- matching phone's rows are fetched from scattered table pages. With
-- "contactId" in the index the scan (phone, label, and whether the owner saved
-- it) never touches the table.
--
-- COST. About 0.7 GB and 0.5 GB of disk (the existing two-column indexes are
-- 585 MB and 399 MB). CONCURRENTLY takes no write lock; it reads each table
-- twice, so run it off-peak. If a build fails it leaves an INVALID index:
-- check step 4 and, if invalid, tell the code session — do not drop anything
-- without Misho's word.

-- 1.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_tags_phone_tag_contact
  ON "UserTags" (phone, tag, "contactId");

-- 2.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_alias_phone_alias_contact
  ON "UserAlias" (phone, alias, "contactId");

-- 3. An index-only scan skips the table only for pages the visibility map
-- marks all-visible. "UserAlias" was last vacuumed in June 2025. VACUUM changes
-- no row; it refreshes that map and the planner's statistics.
VACUUM (ANALYZE) "UserTags";
VACUUM (ANALYZE) "UserAlias";

-- 4. Both indexes valid (expect two rows, both true):
SELECT c.relname, i.indisvalid
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
 WHERE c.relname IN ('idx_user_tags_phone_tag_contact', 'idx_user_alias_phone_alias_contact');

-- DONE WHEN (the tester's, 4657): the founder's „ეკა კოპალიანი" search under
-- 2 s cold, measured after 0200 is live.
