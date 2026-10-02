-- Board #504 (Ninia, 2 October): a link (LinkedIn or a website) could not be
-- added to the profile. Its own column: the old-Ally "linkedin" column holds
-- leftover ids from a LinkedIn sign-in, not a link a person chose to show.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS profile_link TEXT;
