-- One-off migration: GEM_KEYWORD_* tender tables -> GEM_TENDER_*, plus eligibility/lock flags.
-- Run manually against MySQL 8 BEFORE deploying the code that uses the new names;
-- otherwise app startup creates empty GEM_TENDER* tables next to the old ones.

RENAME TABLE
    GEM_KEYWORD_TENDERS TO GEM_TENDERS,
    GEM_KEYWORD_TENDER_ACTIVITIES TO GEM_TENDER_ACTIVITIES,
    GEM_KEYWORD_TENDER_COMMENTS TO GEM_TENDER_COMMENTS,
    GEM_KEYWORD_TENDER_DOCUMENTS TO GEM_TENDER_DOCUMENTS;

ALTER TABLE GEM_TENDER_ACTIVITIES RENAME COLUMN gem_keyword_tender_id TO gem_tender_id;
ALTER TABLE GEM_TENDER_COMMENTS RENAME COLUMN gem_keyword_tender_id TO gem_tender_id;
ALTER TABLE GEM_TENDER_DOCUMENTS RENAME COLUMN gem_keyword_tender_id TO gem_tender_id;

-- Old text eligibility is kept as legacy_eligibility until the backfill is decided; drop it after.
ALTER TABLE GEM_TENDERS
    RENAME COLUMN eligible TO legacy_eligibility;

ALTER TABLE GEM_TENDERS
    ADD COLUMN eligible BOOLEAN NOT NULL DEFAULT FALSE AFTER eligibility_reminder_sent_on,
    ADD COLUMN ineligible BOOLEAN NOT NULL DEFAULT FALSE AFTER eligible,
    ADD COLUMN out_of_scope BOOLEAN NOT NULL DEFAULT FALSE AFTER ineligible,
    ADD COLUMN missed BOOLEAN NOT NULL DEFAULT FALSE AFTER out_of_scope,
    ADD COLUMN unattended BOOLEAN NOT NULL DEFAULT FALSE AFTER missed,
    MODIFY COLUMN stage VARCHAR(64) NULL DEFAULT NULL;

-- Existing rows backfill (flags from legacy_eligibility / lock messages, legacy stages
-- new / assigned / eligible) is intentionally left for a later decision.
-- Until then those legacy stage values render as "no stage" in the app.
