-- ============================================================
-- ACADEMIA PARTNER PORTAL - DATABASE SCHEMA (MySQL 8+)
-- Region -> Country -> Partner hierarchy with RBAC enforced
-- at query level (every scoped table carries region_id/country_id
-- and is filtered server-side, never trusted from the client).
-- ============================================================

CREATE DATABASE IF NOT EXISTS academia_partner_portal
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE academia_partner_portal;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- MODULE 2: Region -> Country hierarchy & RBAC
-- ------------------------------------------------------------

CREATE TABLE roles (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(40)  NOT NULL UNIQUE, -- SUPER_ADMIN, GLOBAL_PARTNER_MANAGER, REGIONAL_PARTNER_MANAGER, PARTNER_ADMIN, PARTNER_SALES_USER, ACADEMIA_MARKETING, ACADEMIA_SALES
  name          VARCHAR(80)  NOT NULL,
  description   VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE regions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE, -- e.g. Middle East, Africa, South Asia
  code          VARCHAR(20)  NOT NULL UNIQUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE countries (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  region_id     INT UNSIGNED NOT NULL,
  name          VARCHAR(100) NOT NULL,
  iso_code      VARCHAR(3)   NOT NULL,
  dialing_code  VARCHAR(8)   NOT NULL DEFAULT '', -- e.g. +91, shown as "+91 India" on phone fields
  notes         VARCHAR(255) NULL, -- free-form: compliance flags, data residency, or any other note
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id), -- intentionally no CASCADE: a region with countries can't be deleted
  UNIQUE KEY uq_country_region (region_id, iso_code)
) ENGINE=InnoDB;

-- Tier master (Silver/Gold/Platinum by default) -- fully manageable (add/modify/delete)
CREATE TABLE tiers (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(60) NOT NULL UNIQUE,
  rank_order          INT UNSIGNED NOT NULL, -- ordering for upgrade comparisons; higher = better tier
  min_deals_won       INT UNSIGNED NOT NULL DEFAULT 0,
  min_certifications  INT UNSIGNED NOT NULL DEFAULT 0,
  collateral_access   VARCHAR(40) NOT NULL DEFAULT 'standard',
  mdf_eligible        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tier_rank (rank_order)
) ENGINE=InnoDB;

-- Users are the base identity for everyone: Academia staff and partner-side people.
CREATE TABLE users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(190) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  designation     VARCHAR(120) NULL,
  phone_dialing_code VARCHAR(8) NULL,
  phone           VARCHAR(30),
  role_id         TINYINT UNSIGNED NOT NULL,
  -- scope: NULL region_id = global scope (Super Admin / Global Partner Manager)
  region_id       INT UNSIGNED NULL,       -- set for Regional Partner Manager / Academia Marketing contributor
  partner_id      BIGINT UNSIGNED NULL,    -- set for Partner Admin / Partner Sales User (FK added after partners table)
  status          ENUM('active','invited','disabled') NOT NULL DEFAULT 'invited',
  sso_provider    VARCHAR(20) NULL,        -- e.g. 'google' when the account was created/linked via SSO
  sso_subject     VARCHAR(190) NULL,       -- provider-side unique subject id
  activation_token VARCHAR(100) NULL,
  activation_token_expires DATETIME NULL,
  last_login_at   DATETIME NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (region_id) REFERENCES regions(id),
  UNIQUE KEY uq_sso (sso_provider, sso_subject),
  UNIQUE KEY uq_activation_token (activation_token)
) ENGINE=InnoDB;

CREATE TABLE access_audit_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  action        VARCHAR(80) NOT NULL,      -- e.g. TIER_CHANGE, DEAL_APPROVAL, COLLATERAL_PUBLISH, LOGIN, DENIED_ACCESS
  entity_type   VARCHAR(60) NOT NULL,
  entity_id     BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  ip_address    VARCHAR(45),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 1: Partner Onboarding & Profile Management
-- ------------------------------------------------------------

CREATE TABLE partners (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_name        VARCHAR(190) NOT NULL,
  region_id           INT UNSIGNED NOT NULL,
  sales_team_size     INT UNSIGNED NULL,
  existing_sis_erp_experience VARCHAR(255) NULL,
  tier_id             INT UNSIGNED NOT NULL,
  status              ENUM('applied','under_review','active','on_hold','terminated') NOT NULL DEFAULT 'applied',
  primary_contact_user_id BIGINT UNSIGNED NULL, -- Partner Admin
  timezone            VARCHAR(60) NULL, -- IANA tz, e.g. Asia/Kolkata -- cadence meetings display in this tz for the partner
  signup_date         DATE NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id),
  FOREIGN KEY (tier_id) REFERENCES tiers(id)
) ENGINE=InnoDB;

ALTER TABLE users ADD CONSTRAINT fk_users_partner FOREIGN KEY (partner_id) REFERENCES partners(id);
ALTER TABLE partners ADD CONSTRAINT fk_partners_primary_contact FOREIGN KEY (primary_contact_user_id) REFERENCES users(id);

-- A partner can operate in multiple countries within (usually) its region
CREATE TABLE partner_countries (
  partner_id    BIGINT UNSIGNED NOT NULL,
  country_id    INT UNSIGNED NOT NULL,
  PRIMARY KEY (partner_id, country_id),
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
  FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

CREATE TABLE partner_documents (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_id    BIGINT UNSIGNED NOT NULL,
  doc_type      ENUM('company_registration','nda','partner_agreement','tax_compliance','other') NOT NULL,
  label         VARCHAR(190) NULL,
  file_url      VARCHAR(500) NOT NULL,
  uploaded_by   BIGINT UNSIGNED NOT NULL,
  uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Profile history log: tier changes, agreement renewals, status changes
CREATE TABLE partner_history (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_id    BIGINT UNSIGNED NOT NULL,
  event_type    ENUM('tier_change','status_change','agreement_renewal','profile_update') NOT NULL,
  old_value     VARCHAR(255),
  new_value     VARCHAR(255),
  changed_by    BIGINT UNSIGNED NOT NULL,
  note          VARCHAR(500),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 3: Target Account & Contact Management
-- ------------------------------------------------------------

-- "Category" master for institutes (University, College, TVET, Group of Schools, Training Institute ...)
CREATE TABLE personas (
  id      TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE institutes (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(190) NOT NULL,
  website           VARCHAR(255) NULL,
  student_count     INT UNSIGNED NULL,
  campus_count      INT UNSIGNED NULL,
  persona_id        TINYINT UNSIGNED NOT NULL,   -- Category
  type              ENUM('Private','Public','Semi-govt') NOT NULL DEFAULT 'Private',
  country_id        INT UNSIGNED NOT NULL,
  region_id         INT UNSIGNED NOT NULL,
  contact_name        VARCHAR(150) NULL,
  contact_designation VARCHAR(120) NULL,
  contact_email       VARCHAR(190) NULL,
  contact_dialing_code VARCHAR(8) NULL,
  contact_phone       VARCHAR(30) NULL,
  is_existing_client BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_partner_id BIGINT UNSIGNED NULL, -- ownership/assignment to prevent overlap
  dedup_key         VARCHAR(255) GENERATED ALWAYS AS (LOWER(CONCAT(name, '|', COALESCE(website,'')))) STORED,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_institute_dedup (dedup_key),
  FOREIGN KEY (persona_id) REFERENCES personas(id),
  FOREIGN KEY (country_id) REFERENCES countries(id),
  FOREIGN KEY (region_id) REFERENCES regions(id),
  FOREIGN KEY (assigned_partner_id) REFERENCES partners(id)
) ENGINE=InnoDB;

CREATE TABLE institute_contacts (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institute_id  BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150) NOT NULL,
  designation   VARCHAR(120),
  email         VARCHAR(190),
  dialing_code  VARCHAR(8),
  phone         VARCHAR(30),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE institute_notes (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institute_id  BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NOT NULL,
  note          TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 4: Deal Registration & Pipeline Tracking
-- ------------------------------------------------------------

CREATE TABLE pipeline_stages (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(60) NOT NULL UNIQUE, -- Discovery Call, Demo, Commercials Shared, Negotiation, Won, Lost
  sort_order    TINYINT UNSIGNED NOT NULL,
  sla_days      INT UNSIGNED NULL -- days allowed in this stage before an SLA alert fires
) ENGINE=InnoDB;

CREATE TABLE deals (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institute_id          BIGINT UNSIGNED NOT NULL,
  partner_id            BIGINT UNSIGNED NOT NULL,
  registered_by         BIGINT UNSIGNED NOT NULL,       -- Partner Sales User
  academia_account_manager_id BIGINT UNSIGNED NULL,     -- co-owning Academia Sales user
  stage_id              TINYINT UNSIGNED NOT NULL,
  deal_value_usd        DECIMAL(14,2) NULL,
  next_step             VARCHAR(255) NULL,
  next_step_due_date    DATE NULL,
  current_status_note   VARCHAR(500) NULL,
  protection_window_days INT UNSIGNED NOT NULL DEFAULT 90,
  protected_until        DATE NULL,                      -- computed at approval time = approved_at + protection_window_days
  approval_status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_by            BIGINT UNSIGNED NULL,
  approved_at            DATETIME NULL,
  win_loss                ENUM('open','won','lost') NOT NULL DEFAULT 'open',
  win_loss_reason_code   VARCHAR(80) NULL,
  stage_entered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- for SLA/aging calc
  created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (institute_id) REFERENCES institutes(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (registered_by) REFERENCES users(id),
  FOREIGN KEY (academia_account_manager_id) REFERENCES users(id),
  FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Only ONE active (approved, protection window not expired, win_loss='open') deal per institute
-- is allowed; enforced in application logic at registration time (conflict check), logged here:
CREATE TABLE deal_conflict_checks (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  institute_id      BIGINT UNSIGNED NOT NULL,
  requesting_deal_id BIGINT UNSIGNED NOT NULL,
  conflicting_deal_id BIGINT UNSIGNED NULL,
  result            ENUM('clear','conflict') NOT NULL,
  checked_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institute_id) REFERENCES institutes(id),
  FOREIGN KEY (requesting_deal_id) REFERENCES deals(id),
  FOREIGN KEY (conflicting_deal_id) REFERENCES deals(id)
) ENGINE=InnoDB;

CREATE TABLE deal_stage_history (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deal_id       BIGINT UNSIGNED NOT NULL,
  from_stage_id TINYINT UNSIGNED NULL,
  to_stage_id   TINYINT UNSIGNED NOT NULL,
  changed_by    BIGINT UNSIGNED NOT NULL,
  changed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
  FOREIGN KEY (to_stage_id) REFERENCES pipeline_stages(id),
  FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 5: Region-wise Marketing Collateral Library
-- ------------------------------------------------------------

CREATE TABLE collateral_assets (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(190) NOT NULL,
  content_type  ENUM('pitch_deck','case_study','pricing_sheet','one_pager','battlecard','brand_guideline','video','other') NOT NULL,
  region_id     INT UNSIGNED NULL,   -- NULL = global asset
  country_id    INT UNSIGNED NULL,
  language      VARCHAR(20) NOT NULL DEFAULT 'en',
  min_tier_id   INT UNSIGNED NOT NULL, -- gates visibility, e.g. Platinum-only
  status        ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  latest_version_id BIGINT UNSIGNED NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id),
  FOREIGN KEY (country_id) REFERENCES countries(id),
  FOREIGN KEY (min_tier_id) REFERENCES tiers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE collateral_versions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id      BIGINT UNSIGNED NOT NULL,
  version_no    INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  is_latest_approved BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by   BIGINT UNSIGNED NOT NULL,
  uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES collateral_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  UNIQUE KEY uq_asset_version (asset_id, version_no)
) ENGINE=InnoDB;

ALTER TABLE collateral_assets ADD CONSTRAINT fk_collateral_latest_version
  FOREIGN KEY (latest_version_id) REFERENCES collateral_versions(id);

CREATE TABLE collateral_downloads (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id      BIGINT UNSIGNED NOT NULL,
  version_id    BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  partner_id    BIGINT UNSIGNED NULL,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES collateral_assets(id),
  FOREIGN KEY (version_id) REFERENCES collateral_versions(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id)
) ENGINE=InnoDB;

CREATE TABLE custom_asset_requests (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_id    BIGINT UNSIGNED NOT NULL,
  requested_by  BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(190) NULL,
  description   TEXT NOT NULL,
  status        ENUM('open','in_progress','fulfilled','declined') NOT NULL DEFAULT 'open',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 6: Cadence & MoM Tracker
-- ------------------------------------------------------------

CREATE TABLE cadence_meetings (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_id    BIGINT UNSIGNED NULL,   -- NULL if region-level cadence
  region_id     INT UNSIGNED NULL,
  scheduled_at  DATETIME NOT NULL,      -- stored in UTC; rendered in the partner's timezone client-side
  frequency     ENUM('weekly','fortnightly','adhoc') NOT NULL DEFAULT 'fortnightly',
  organized_by  BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (region_id) REFERENCES regions(id),
  FOREIGN KEY (organized_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE mom_action_items (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  meeting_id        BIGINT UNSIGNED NOT NULL,
  linked_deal_id    BIGINT UNSIGNED NULL,
  linked_institute_id BIGINT UNSIGNED NULL,
  action_item       VARCHAR(500) NOT NULL,
  owner_id          BIGINT UNSIGNED NULL,    -- linked system user, when the SPOC has a login
  owner_text        VARCHAR(190) NULL,       -- free-text SPOC/owner name(s), e.g. "Vaibhav/Rehnuma"
  status            ENUM('pending','done') NOT NULL DEFAULT 'pending',
  promised_date     DATE NULL,
  completion_date   DATE NULL,
  remarks           VARCHAR(500) NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES cadence_meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_deal_id) REFERENCES deals(id),
  FOREIGN KEY (linked_institute_id) REFERENCES institutes(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 7: Partner Training & Certification
-- ------------------------------------------------------------

CREATE TABLE training_types (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(190) NOT NULL UNIQUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE certification_types (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(190) NOT NULL UNIQUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- A batch is either a training run or a certification run of a given type, with a start/end window.
CREATE TABLE training_batches (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category              ENUM('training','certification') NOT NULL,
  training_type_id      INT UNSIGNED NULL,
  certification_type_id INT UNSIGNED NULL,
  name                  VARCHAR(190) NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  created_by            BIGINT UNSIGNED NOT NULL,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_type_id) REFERENCES training_types(id),
  FOREIGN KEY (certification_type_id) REFERENCES certification_types(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE batch_enrollments (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id      BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL, -- partner personnel enrolled
  status        ENUM('enrolled','completed','no_show') NOT NULL DEFAULT 'enrolled',
  enrolled_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES training_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_batch_user (batch_id, user_id)
) ENGINE=InnoDB;

-- Certificate issued once a certification batch is over; file lives on the participant's partner profile.
CREATE TABLE certification_records (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_enrollment_id   BIGINT UNSIGNED NOT NULL,
  certificate_file_url  VARCHAR(500) NULL,
  certificate_file_type ENUM('pdf','jpeg','jpg','png') NULL,
  issued_by             BIGINT UNSIGNED NOT NULL,
  issued_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_enrollment_id) REFERENCES batch_enrollments(id) ON DELETE CASCADE,
  FOREIGN KEY (issued_by) REFERENCES users(id),
  UNIQUE KEY uq_enrollment_certificate (batch_enrollment_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 8: Dashboards & Business Plan Tracking
-- ------------------------------------------------------------

CREATE TABLE business_plan_targets (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  region_id     INT UNSIGNED NOT NULL,
  fiscal_year   YEAR NOT NULL,
  sql_target    INT UNSIGNED NOT NULL,
  pipeline_value_target_usd DECIMAL(14,2) NOT NULL,
  win_rate_target_pct DECIMAL(5,2) NOT NULL,
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES regions(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_region_year (region_id, fiscal_year)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 9: Notification & Communication Centre
-- ------------------------------------------------------------

CREATE TABLE notifications (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  type          ENUM('deal_status','collateral_update','cadence_reminder','onboarding_milestone','broadcast','training_reminder') NOT NULL,
  channel       ENUM('in_app','email','whatsapp','sms') NOT NULL DEFAULT 'in_app',
  title         VARCHAR(190) NOT NULL,
  body          VARCHAR(1000) NOT NULL,
  entity_type   VARCHAR(60) NULL,
  entity_id     BIGINT UNSIGNED NULL,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- target_mode drives who receives it: all / by region / by specific partner / a specific user (partner personnel)
CREATE TABLE broadcast_announcements (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(190) NOT NULL,
  body          TEXT NOT NULL,
  target_mode   ENUM('all','region','partner','user') NOT NULL DEFAULT 'all',
  target_region_id INT UNSIGNED NULL,
  target_partner_id BIGINT UNSIGNED NULL,
  target_user_id BIGINT UNSIGNED NULL,
  target_tier_id INT UNSIGNED NULL, -- NULL = all tiers
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_region_id) REFERENCES regions(id),
  FOREIGN KEY (target_partner_id) REFERENCES partners(id),
  FOREIGN KEY (target_user_id) REFERENCES users(id),
  FOREIGN KEY (target_tier_id) REFERENCES tiers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- MODULE 10: Incentives, MDF & Commission Tracking (Phase 3)
-- ------------------------------------------------------------

CREATE TABLE mdf_requests (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  partner_id    BIGINT UNSIGNED NOT NULL,
  requested_by  BIGINT UNSIGNED NOT NULL,
  activity_description TEXT NOT NULL,
  requested_amount_usd DECIMAL(12,2) NOT NULL,
  approved_amount_usd  DECIMAL(12,2) NULL,
  status        ENUM('submitted','approved','rejected','paid') NOT NULL DEFAULT 'submitted',
  approved_by   BIGINT UNSIGNED NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE commission_records (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  deal_id       BIGINT UNSIGNED NOT NULL,
  partner_id    BIGINT UNSIGNED NOT NULL,
  commission_pct DECIMAL(5,2) NOT NULL,
  commission_amount_usd DECIMAL(12,2) NOT NULL,
  payout_status ENUM('pending','visible_only','paid') NOT NULL DEFAULT 'visible_only', -- actual payout depends on ERP/finance readiness
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deal_id) REFERENCES deals(id),
  FOREIGN KEY (partner_id) REFERENCES partners(id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------
-- Seed reference data
-- ------------------------------------------------------------

INSERT INTO roles (code, name, description) VALUES
 ('SUPER_ADMIN','Super Admin','Manages whole portal'),
 ('GLOBAL_PARTNER_MANAGER','Global Partner Manager','Owns entire channel program globally'),
 ('REGIONAL_PARTNER_MANAGER','Regional Partner Manager','Owns partner relationships for a region'),
 ('PARTNER_ADMIN','Partner Admin','Decision-maker at partner organisation'),
 ('PARTNER_SALES_USER','Partner Sales User','Sales rep at partner organisation'),
 ('ACADEMIA_MARKETING','Academia Marketing','Owns collateral creation'),
 ('ACADEMIA_SALES','Academia Sales / Account Manager','Co-owns named accounts with partners');

INSERT INTO personas (name) VALUES ('University'),('College'),('TVET'),('Group of Schools'),('Training Institute');

INSERT INTO pipeline_stages (name, sort_order, sla_days) VALUES
 ('Discovery Call', 1, 7),
 ('Demo', 2, 10),
 ('Commercials Shared', 3, 14),
 ('Negotiation', 4, 21),
 ('Won', 5, NULL),
 ('Lost', 6, NULL);

INSERT INTO tiers (name, rank_order, min_deals_won, min_certifications, collateral_access, mdf_eligible) VALUES
 ('Silver', 1, 0, 1, 'standard', FALSE),
 ('Gold', 2, 3, 3, 'extended', TRUE),
 ('Platinum', 3, 8, 5, 'full', TRUE);

INSERT INTO training_types (name) VALUES
 ('Academia Sales Pitch'),
 ('Academia D1 Deck Training'),
 ('Academia Product Walkthrough'),
 ('GTM - Calling Script'),
 ('GTM - Email Campaign');

INSERT INTO certification_types (name) VALUES
 ('Academia Partner Certification - GTM Mastery');
