-- ROW 278 — THE HALF OF THE GEORGIAN-CAPITALS FIX THAT NEEDS AN INDEX.
--
-- Row 277 (182ea72) fixed first-degree name search: PostgreSQL's lower() leaves
-- MTAVRULI (U+1C90-U+1CBF) exactly as it is while the query side has already
-- folded it in JavaScript, so a contact saved in capitals could never match.
-- That fix wraps the stored column in TRANSLATE at every first-degree site.
--
-- It stops there ON PURPOSE, and this file is the reason.
--
-- ============ WHY SECOND-DEGREE COULD NOT TAKE THE SAME FIX ============
--
-- MEASURED, 28 September, on the live database:
--
--     "UserAlias"   8,417,865 rows
--     "UserTags"   21,336,032 rows
--
--     idx_user_alias_trgm  GIN (lower(alias) gin_trgm_ops)
--     idx_user_tags_trgm   GIN (lower(tag)   gin_trgm_ops)
--
-- Second-degree and by-country search match on `LOWER(alias)` and `LOWER(tag)`
-- with no wrapper, so those two GIN indexes ARE the plan. Wrapping the column
-- in TRANSLATE changes the expression's shape, the index stops matching it, and
-- a search across twenty-one million rows falls back to a scan. A plain
-- COUNT(*) filtered on those tables already times out through ro.sh, so this is
-- not a theory about what might get slower.
--
-- The first-degree path was safe to change for the opposite reason: its own
-- comment says the `|| ''` wrapper exists SPECIFICALLY to keep the planner off
-- the trigram GIN, so there was no index there to lose.
--
-- ============ AND IT IS NOT A RARE CASE ============
--
--     TABLESAMPLE SYSTEM (2) over "UserAlias":
--     1,028 of 162,532 sampled aliases contain Mtavruli — about 0.63%
--
-- Roughly fifty thousand saved contact names across the base. A phone stores
-- what its owner typed, so these are real people's phonebooks and not a test
-- artefact.
--
-- ============ WHAT THIS MIGRATION DOES, AND WHAT IT DELIBERATELY DOES NOT ====
--
-- It teaches `normalize_search_token` to fold Mtavruli, which is the one place
-- worth changing: it is already the normalizer behind the searches' fuzzy pass,
-- so every caller gains the fold at once instead of six call sites gaining it
-- one at a time and the seventh being found on somebody's screen.
--
-- The fold is placed INSIDE the existing translate rather than beside it: the
-- Georgian-to-Latin map is written in Mkhedruli, so a Mtavruli letter passes
-- straight through it untouched today. Folding first makes the existing map
-- apply to capitals for free.
--
-- ⚠️ IT DOES NOT REBUILD THE TWO EXPRESSION INDEXES, AND UNTIL SOMEBODY DOES
-- THEY HOLD THE OLD FUNCTION'S OUTPUT. PostgreSQL does not re-evaluate a
-- functional index when the function changes — it cannot know — so each index
-- keeps whatever was written when its row was indexed.
--
-- ⚠️⚠️ AND MY FIRST DRAFT OF THIS COMMENT SAID „DEPLOYING THIS ALONE IS SAFE",
-- WHICH IS WRONG, AND I AM LEAVING THE CORRECTION HERE RATHER THAN THE TIDY
-- SENTENCE.
--
-- The reasoning that looked right: folding is a no-op on text with no capitals,
-- so every ordinary row is unaffected and the 0.63% stay exactly as unfindable
-- as they already are. Both halves of that are true. The conclusion is not,
-- because it only considers the STORED side.
--
-- Search the fuzzy pass for a name TYPED IN CAPITALS, today: the query is
-- normalized by this same function, which leaves it in Mtavruli, and the index
-- holds Mtavruli for that row — they match, and the row is found. Change the
-- function alone and the query folds to „tamar" while the index still holds
-- „ᲗᲐᲛᲐᲠ": they stop matching. A narrow case that works today would break, and
-- it would break in the direction of „the fix made search worse".
--
-- So this migration and the two REINDEXes are ONE operation, and the function
-- must not be deployed on its own. Ordering it the other way — reindex first —
-- is not available either: the index can only be rebuilt from whatever the
-- function returns at that moment.
--
-- ============ THE TWO COMMANDS, RUN OFF-PEAK, ONE AT A TIME ============
--
-- CONCURRENTLY cannot run inside a transaction and this migration is one, which
-- is the same reason migration 036 left its index out of band. A REINDEX over
-- twenty-one million rows is real I/O on the production database, so it is
-- announced before it is run rather than discovered in a latency graph.
--
--   REINDEX INDEX CONCURRENTLY idx_user_alias_norm_trgm;
--   REINDEX INDEX CONCURRENTLY idx_user_tags_norm_trgm;
--
-- After BOTH have finished, and not before, the second-degree and by-country
-- searches can be moved onto the normalized expression. Moving them first would
-- close a casing hole by making every second-degree search slow, which is
-- trading a visible fault for an invisible one — the plate row says in so many
-- words that it is not done unless the search is also not slower.

CREATE OR REPLACE FUNCTION normalize_search_token(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(replace(replace(replace(replace(replace(
    translate(
      lower(
        -- Mtavruli -> Mkhedruli, before anything else looks at the letters.
        -- The 46 pairs are the ones JavaScript's own toLowerCase produces over
        -- U+1C90-U+1CBF, so this fold and the one in georgianCase.ts agree by
        -- construction rather than by somebody reading a chart.
        translate(coalesce(input, ''),
          'ᲐᲑᲒᲓᲔᲕᲖᲗᲘᲙᲚᲛᲜᲝᲞᲟᲠᲡᲢᲣᲤᲥᲦᲧᲨᲩᲪᲫᲬᲭᲮᲯᲰᲱᲲᲳᲴᲵᲶᲷᲸᲹᲺᲽᲾᲿ',
          'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶჷჸჹჺჽჾჿ')
      ),
      'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
      'abgdevztiklmnopjrstufkgkscczcckjh'),
    'gh', 'g'), 'kh', 'k'), 'zh', 'j'), 'ts', 'c'), 'x', 'k'), 'q', 'k');
$$;
