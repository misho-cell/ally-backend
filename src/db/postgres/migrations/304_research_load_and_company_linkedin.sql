-- 304 (Misho, 18 Nov: „LinkedIn-ის სია ვნახე, ბაზაში ჩაწერე … არ დაგავიწყდეს როგორც
-- კომპანიის ასევე პიროვნებების ლინქდინები").
-- research_load: the tag of the research load that wrote a public-research fact
-- (POST /admin/company-base/facts-by-number), so POST /admin/company-base/undo-load
-- takes that load back out, and an Axel reload leaves it alone. NULL for every
-- earlier row.
ALTER TABLE contact_facts ADD COLUMN IF NOT EXISTS research_load TEXT;
CREATE INDEX IF NOT EXISTS contact_facts_research_load_idx
  ON contact_facts (research_load)
  WHERE research_load IS NOT NULL;

-- A company's own LinkedIn page, beside its website.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_url TEXT NOT NULL DEFAULT '';
