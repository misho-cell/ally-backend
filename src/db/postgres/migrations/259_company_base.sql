-- 259: the company base (D847, the founder 20 Oct; Misho's word 21 Oct). Built from
-- the Axel v6 package's company files and TECH_TASK_COMPANY_BASE (Tornike's Claude).
-- Loaded by POST /admin/company-base/load; read by the find_companies_for_need tool.

-- The fixed list of industries, each with the words a need is matched on.
CREATE TABLE IF NOT EXISTS company_industries (
  industry_id  TEXT PRIMARY KEY,
  industry     TEXT NOT NULL,
  synonyms_en  TEXT NOT NULL DEFAULT '',
  synonyms_ka  TEXT NOT NULL DEFAULT ''
);

-- One company. company_id is the Georgian 9-digit state code, or C-<country>-NNN abroad.
CREATE TABLE IF NOT EXISTS companies (
  company_id     TEXT PRIMARY KEY,
  legal_name_ka  TEXT NOT NULL DEFAULT '',
  name_en        TEXT NOT NULL DEFAULT '',
  brand_names    TEXT NOT NULL DEFAULT '',
  country        TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  legal_form     TEXT NOT NULL DEFAULT '',
  size_band      TEXT NOT NULL DEFAULT '',
  activity_code  TEXT NOT NULL DEFAULT '',
  activity_ka    TEXT NOT NULL DEFAULT '',
  industry_id    TEXT,
  industry_2_id  TEXT,
  what_it_does   TEXT NOT NULL DEFAULT '',
  service_words  TEXT NOT NULL DEFAULT '',
  website        TEXT NOT NULL DEFAULT '',
  parent_group   TEXT NOT NULL DEFAULT '',
  confidence     TEXT NOT NULL DEFAULT '',
  -- Lower-case name_en + brands + what_it_does + service_words + activity_ka: the meaning match.
  search_text    TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies (industry_id);
CREATE INDEX IF NOT EXISTS idx_companies_industry_2 ON companies (industry_2_id);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies (country);

-- Every way a company's name is written; the name index for labels and facts.
CREATE TABLE IF NOT EXISTS company_names (
  company_id       TEXT NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  name_normalised  TEXT NOT NULL,
  name_latin_key   TEXT NOT NULL DEFAULT '',
  kind             TEXT NOT NULL DEFAULT '',
  strength         TEXT NOT NULL DEFAULT 'weak',
  PRIMARY KEY (company_id, name_normalised)
);
CREATE INDEX IF NOT EXISTS idx_company_names_key ON company_names (name_latin_key);
CREATE INDEX IF NOT EXISTS idx_company_names_norm ON company_names (name_normalised);

-- Public roles from the state register and public pages: directors, owners, founders.
CREATE TABLE IF NOT EXISTS company_public_people (
  company_id         TEXT NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
  name_ka            TEXT NOT NULL DEFAULT '',
  name_latin         TEXT NOT NULL DEFAULT '',
  role               TEXT NOT NULL,
  ownership_pct      TEXT NOT NULL DEFAULT '',
  current_or_former  TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (company_id, name_latin, name_ka, role)
);

-- One of our people at a company, on the number their facts already sit on.
-- possible = routing only, never said (TECH_TASK §4); confirmed may be said.
CREATE TABLE IF NOT EXISTS person_company_links (
  phone        TEXT NOT NULL,
  company_id   TEXT NOT NULL REFERENCES companies (company_id) ON DELETE CASCADE,
  person_name  TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT '',
  tie          TEXT NOT NULL DEFAULT '',
  evidence     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL CHECK (status IN ('confirmed', 'possible')),
  savers       INTEGER NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (phone, company_id, evidence, role)
);
CREATE INDEX IF NOT EXISTS idx_person_company_links_company ON person_company_links (company_id);
