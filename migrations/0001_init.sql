-- Private-by-default content model for Cloudflare D1. Public reads go only
-- through Pages Functions that whitelist fields and verified/published rows.
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  token_sha256 TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','reviewer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('Acumulación de basura','Drenaje obstruido','Contaminación de río o quebrada','Vertido','Quema de residuos','Deterioro de espacio natural','Otro problema ambiental')),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 20 AND 1200),
  province TEXT NOT NULL,
  canton TEXT NOT NULL CHECK (length(canton) BETWEEN 1 AND 80),
  occurred_on TEXT NOT NULL,
  private_location TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','verified','referred','closed')),
  public_consent INTEGER NOT NULL DEFAULT 0 CHECK (public_consent IN (0,1)),
  location_public INTEGER NOT NULL DEFAULT 0 CHECK (location_public IN (0,1)),
  public_summary TEXT,
  latitude REAL,
  longitude REAL,
  location_verified INTEGER NOT NULL DEFAULT 0 CHECK (location_verified IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_by TEXT REFERENCES admin_users(id),
  reviewed_at TEXT,
  referral_reference TEXT,
  CHECK (latitude IS NULL OR latitude BETWEEN -5.2 AND 1.7),
  CHECK (longitude IS NULL OR longitude BETWEEN -92.5 AND -75.0)
);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_area ON reports(province, canton, created_at DESC);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  problem TEXT NOT NULL CHECK (length(problem) BETWEEN 20 AND 700),
  solution TEXT NOT NULL CHECK (length(solution) BETWEEN 20 AND 1200),
  province TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('Idea inicial','En evaluación','En implementación','Implementada con resultados por documentar')),
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','needs_changes')),
  submitter_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_by TEXT REFERENCES admin_users(id),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_proposals_review ON proposals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  description TEXT NOT NULL,
  province TEXT,
  canton TEXT,
  activity TEXT NOT NULL,
  materials TEXT,
  offerings TEXT,
  official_url TEXT,
  public_contact TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','needs_update')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
  location_public INTEGER NOT NULL DEFAULT 0 CHECK (location_public IN (0,1)),
  latitude REAL,
  longitude REAL,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -5.2 AND 1.7),
  CHECK (longitude IS NULL OR longitude BETWEEN -92.5 AND -75.0)
);
CREATE INDEX IF NOT EXISTS idx_org_directory ON organizations(is_published, verification_status, province, activity);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  results TEXT,
  province TEXT,
  canton TEXT,
  official_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','needs_update')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  location_public INTEGER NOT NULL DEFAULT 0 CHECK (location_public IN (0,1)),
  latitude REAL,
  longitude REAL,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -5.2 AND 1.7),
  CHECK (longitude IS NULL OR longitude BETWEEN -92.5 AND -75.0)
);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(status, verification_status, is_public, project_type);

CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_on TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('report','proposal','organization','project','publication')),
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_on TEXT,
  consulted_at TEXT NOT NULL,
  geography TEXT,
  unit TEXT,
  methodology TEXT,
  limitations TEXT NOT NULL,
  created_by TEXT REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sources_entity ON sources(entity_type, entity_id);

-- Only stores short-lived hashed-network rate limits; never raw IP addresses.
CREATE TABLE IF NOT EXISTS submission_limits (
  ip_hash TEXT NOT NULL,
  form_type TEXT NOT NULL CHECK (form_type IN ('report','proposal','login')),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(ip_hash, form_type)
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Public map payload is restricted to reviewed locations and non-private fields.
CREATE VIEW IF NOT EXISTS public_map_points AS
  SELECT id, activity AS category, name AS title, province, canton,
         latitude, longitude, official_url AS source_url, last_verified_at AS verified_at
    FROM organizations
   WHERE is_published=1 AND verification_status='verified'
     AND location_public=1 AND latitude IS NOT NULL AND longitude IS NOT NULL
     AND last_verified_at IS NOT NULL AND official_url IS NOT NULL
     AND EXISTS (SELECT 1 FROM sources s WHERE s.entity_type='organization' AND s.entity_id=organizations.id AND s.url=organizations.official_url)
  UNION ALL
  SELECT id, project_type AS category, name AS title, province, canton,
         latitude, longitude, official_url AS source_url, last_verified_at AS verified_at
    FROM projects
   WHERE status='published' AND verification_status='verified' AND is_public=1
     AND location_public=1 AND latitude IS NOT NULL AND longitude IS NOT NULL
     AND last_verified_at IS NOT NULL AND official_url IS NOT NULL
     AND EXISTS (SELECT 1 FROM sources s WHERE s.entity_type='project' AND s.entity_id=projects.id AND s.url=projects.official_url)
  UNION ALL
  SELECT id, 'report' AS category, public_summary AS title, province, canton,
         latitude, longitude, NULL AS source_url, reviewed_at AS verified_at
    FROM reports
   WHERE status='verified' AND public_consent=1 AND location_public=1 AND public_summary IS NOT NULL
     AND location_verified=1 AND latitude IS NOT NULL AND longitude IS NOT NULL;
