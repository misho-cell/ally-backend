-- 4293 (plate NEW-2): the setup scripts could not build an empty database.
-- The tables below came from the old Ally app (its own Prisma migrations), so
-- production always had them and no migration here ever created them — on an
-- empty Postgres the fourth migration already failed („UserAlias" does not
-- exist). Generated from production's own catalogue on 10 Oct 2026: only the
-- twelve legacy tables the Netai code reads or writes, each column as it was
-- before Netai's own migrations (those add their columns themselves). Every
-- statement is IF NOT EXISTS, so on production this file changes nothing.

DO $$ BEGIN
  CREATE TYPE "ActionType" AS ENUM ('REGISTER', 'AUTH', 'RECOVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClassifyProgressStatusEnum" AS ENUM ('lazySorter', 'beginner', 'skilledSorter', 'superstar', 'networkingGuru');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FeatureType" AS ENUM ('lottery');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IdentifierType" AS ENUM ('PHONE', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformType" AS ENUM ('android', 'ios');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RelationshipStatus" AS ENUM ('unsorted', 'allies', 'loyal', 'connections', 'contacts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TagSource" AS ENUM ('NUMBERS_DB', 'USER_CREATED', 'IMPORTED_CONTACT', 'USER_NAME', 'BIA', 'TRUSTED_TAGS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" SERIAL,
  "name" VARCHAR(256) NOT NULL,
  "email" VARCHAR(512),
  "password" VARCHAR(512) NOT NULL,
  "gender" "Gender",
  "userPicture" TEXT,
  "birthday" TIMESTAMP(3),
  "city" VARCHAR(512),
  "jobPosition" VARCHAR(512),
  "employer" VARCHAR(512),
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE'::"UserStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isSynced" BOOLEAN NOT NULL DEFAULT false,
  "syncAt" TIMESTAMP(3),
  "fb" VARCHAR(512),
  "instagram" VARCHAR(512),
  "linkedin" VARCHAR(512),
  "twitter" VARCHAR(512),
  "inviterReferralUserId" INTEGER,
  "deletedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "linkedinCountry" TEXT,
  "linkedinEmail" TEXT,
  "linkedinUserInfo" JSONB,
  "zendeskAIChatTicketId" INTEGER,
  "hasAccessToAI" BOOLEAN NOT NULL DEFAULT false,
  "hasAccessGenerateMapUsingPhone" BOOLEAN NOT NULL DEFAULT false,
  "openAiThreadId" TEXT,
  "contactsSyncStatisticDeniedReasonText" TEXT,
  "contactsSyncStatisticGrantedFullAccess" TEXT[],
  "contactsSyncStatisticGrantedLimitedAccess" TEXT[],
  "contactsSyncStatisticPressedOnSeeAll" BOOLEAN,
  "contactsSyncStatisticPressedOnTakeMeToAlly" TEXT[],
  "contactsSyncStatisticPressedSkipOn" TEXT[],
  "haveAccessPremiumMap" BOOLEAN NOT NULL DEFAULT false,
  "zendeskUserId" TEXT,
  "coins" INTEGER NOT NULL DEFAULT 0,
  "hasImportedAllContacts" BOOLEAN NOT NULL DEFAULT false,
  "boughtPremiumMapAt" TIMESTAMP(3),
  "cancelledPremiumMapAt" TIMESTAMP(3),
  "lastClassifyAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "usdcWalletAddress" TEXT,
  "hideUserOnGamificationLeaderboard" BOOLEAN NOT NULL DEFAULT false,
  "deletedTagsCount" INTEGER NOT NULL DEFAULT 0,
  "hasAutoSubRenewal" BOOLEAN NOT NULL DEFAULT true,
  "hideUserBirthday" BOOLEAN NOT NULL DEFAULT false,
  "hideUserEmail" BOOLEAN NOT NULL DEFAULT false,
  "hideUserGender" BOOLEAN NOT NULL DEFAULT false,
  "hideUserPhotos" BOOLEAN NOT NULL DEFAULT false,
  "hideUserSocialNetworks" BOOLEAN NOT NULL DEFAULT false,
  "hideUserTags" BOOLEAN NOT NULL DEFAULT false,
  "hideUserWorkInfo" BOOLEAN NOT NULL DEFAULT false,
  "usdcWalletNetwork" TEXT,
  "stripeCustomerId" TEXT,
  "subscription_tier" VARCHAR(20) NOT NULL DEFAULT 'free'::character varying,
  "subscription_status" VARCHAR(20) NOT NULL DEFAULT 'inactive'::character varying,
  "paddle_subscription_id" VARCHAR(100),
  "paddle_customer_id" VARCHAR(100),
  "trial_ends_at" TIMESTAMPTZ,
  "current_period_ends_at" TIMESTAMPTZ,
  "hasAccessToAlly" BOOLEAN NOT NULL DEFAULT false,
  "referral_code" TEXT,
  "subscription_status_changed_at" TIMESTAMPTZ,
  "invite_cohort" TEXT,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "cancels_at" TIMESTAMPTZ,
  "grace_answer_used_at" TIMESTAMPTZ,
  "profile_link" TEXT,
  "evening_card_hour" SMALLINT,
  "contact_import_reminder" BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserPhone" (
  "id" SERIAL,
  "phone" VARCHAR(51) NOT NULL,
  "phoneNumber" VARCHAR(51) NOT NULL,
  "phoneCode" VARCHAR(7) NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserAlias" (
  "id" SERIAL,
  "userId" INTEGER,
  "contactId" INTEGER NOT NULL,
  "alias" VARCHAR(512) NOT NULL,
  "phone" VARCHAR(51) NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "source" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserTags" (
  "id" SERIAL,
  "userId" INTEGER,
  "contactId" INTEGER,
  "tag" VARCHAR(512) NOT NULL,
  "phone" VARCHAR(51) NOT NULL,
  "weightCount" INTEGER NOT NULL DEFAULT 1,
  "source" "TagSource" NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserConnection" (
  "id" SERIAL,
  "originUserId" INTEGER NOT NULL,
  "isIgnored" BOOLEAN NOT NULL DEFAULT false,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "name" VARCHAR(512),
  "picture" VARCHAR(256),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uuid" VARCHAR(5000),
  "callFrequency" INTEGER NOT NULL DEFAULT 0,
  "isFavorite" INTEGER NOT NULL DEFAULT 0,
  "smsFrequency" INTEGER NOT NULL DEFAULT 0,
  "contactFrequency" INTEGER NOT NULL DEFAULT 0,
  "banConductContact" BOOLEAN NOT NULL DEFAULT false,
  "banConductedByContact" BOOLEAN NOT NULL DEFAULT false,
  "isSkipped" BOOLEAN,
  "isMyContact" BOOLEAN NOT NULL DEFAULT true,
  "sortIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "platform" "PlatformType",
  "contactObjectJson" TEXT,
  "classifyProgressStatus" "ClassifyProgressStatusEnum",
  "classifyProgressStatusAddedAt" TIMESTAMP(3),
  "relationshipStatus" "RelationshipStatus" NOT NULL DEFAULT 'unsorted'::"RelationshipStatus",
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserConnectionPhone" (
  "id" SERIAL,
  "phone" VARCHAR(51) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "connectionId" INTEGER NOT NULL,
  "phoneCode" VARCHAR(10) NOT NULL,
  "phoneNumber" VARCHAR(51) NOT NULL,
  "ownerUserId" INTEGER,
  "isOriginalGeoPhoneStartsWithEight" BOOLEAN NOT NULL DEFAULT false,
  "isCustomEditedCountryCode" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserDailyLogin" (
  "id" SERIAL,
  "userId" INTEGER NOT NULL,
  "loginDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Otp" (
  "id" SERIAL,
  "identifier" TEXT NOT NULL,
  "identifierType" "IdentifierType" NOT NULL,
  "actionType" "ActionType" NOT NULL,
  "otp" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SearchHistory" (
  "id" SERIAL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "searchQuery" TEXT NOT NULL,
  "originUserId" INTEGER NOT NULL,
  "foundExactMatch" BOOLEAN,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FeatureFlags" (
  "id" SERIAL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "featureName" "FeatureType" NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "enabled_tools" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tool_key" VARCHAR(100) NOT NULL,
  "tool_label" VARCHAR(200) NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("tool_key")
);

CREATE TABLE IF NOT EXISTS "user_profiles" (
  "user_id" TEXT NOT NULL,
  "profile_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id")
);

-- contact_insights.sql carries no number, so on an empty database it would run
-- after everything — while 016 already alters its table. The two tables are
-- created here in the shape 016 leaves them (user_id TEXT, no reference to the
-- old „users" table); the unnumbered file then finds them and adds only its
-- index and seed rows.
CREATE TABLE IF NOT EXISTS contact_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  neo4j_contact_id TEXT NOT NULL,
  neo4j_contact_name TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, neo4j_contact_id)
);

CREATE TABLE IF NOT EXISTS insight_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,
  field_label TEXT NOT NULL,
  field_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
