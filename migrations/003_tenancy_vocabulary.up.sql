CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE industry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, name text NOT NULL,
  description text, vocabulary_version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  default_industry_id uuid REFERENCES industry(id), default_region text NOT NULL,
  sso_enforced boolean NOT NULL DEFAULT false, idle_timeout_mins integer NOT NULL DEFAULT 480,
  allowed_domains text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
  industry_id uuid NOT NULL REFERENCES industry(id) ON DELETE RESTRICT, name text NOT NULL, region text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}', policy_version integer NOT NULL DEFAULT 1, archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_unique_name ON project (company_id, lower(name));
CREATE TABLE vocabulary_term (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scope text NOT NULL CHECK (scope IN ('industry','project')),
  industry_id uuid REFERENCES industry(id) ON DELETE CASCADE, project_id uuid REFERENCES project(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('metric','subject','operation','parameter')), name text NOT NULL, display_name text NOT NULL,
  description text, formula text, required_columns jsonb NOT NULL DEFAULT '[]', assumption_columns jsonb NOT NULL DEFAULT '[]',
  grain_rule text CHECK (grain_rule IN ('sum','sum_over_sum','avg_of_ratio','none')), param_type text CHECK (param_type IN ('string','enum','integer','date','boolean')),
  enum_values jsonb NOT NULL DEFAULT '[]', column_hint text, aliases jsonb NOT NULL DEFAULT '[]', result_shape text,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz,
  CONSTRAINT scope_target CHECK ((scope = 'industry' AND industry_id IS NOT NULL AND project_id IS NULL) OR (scope = 'project' AND project_id IS NOT NULL AND industry_id IS NULL)),
  CONSTRAINT measure_needs_grain CHECK (kind <> 'metric' OR formula IS NULL OR grain_rule IS NOT NULL)
);
CREATE UNIQUE INDEX term_unique_industry ON vocabulary_term (industry_id, kind, lower(name)) WHERE scope = 'industry' AND active;
CREATE UNIQUE INDEX term_unique_project ON vocabulary_term (project_id, kind, lower(name)) WHERE scope = 'project' AND active;
CREATE TABLE term_synonym (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES vocabulary_term(id) ON DELETE CASCADE, synonym text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX term_synonym_unique_name ON term_synonym (term_id, lower(synonym));
CREATE TABLE synonym_candidate (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE, expression text NOT NULL, resolved_term_id uuid REFERENCES vocabulary_term(id) ON DELETE SET NULL, confidence numeric(4,3), occurrences integer NOT NULL DEFAULT 1, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')));
CREATE UNIQUE INDEX synonym_candidate_unique_expression ON synonym_candidate (project_id, lower(expression));
CREATE TABLE demo_source_template (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), industry_id uuid NOT NULL REFERENCES industry(id) ON DELETE CASCADE, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('postgres','spreadsheet')), narrative text, schema_spec jsonb NOT NULL, generator_spec jsonb NOT NULL, pack_version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true);
CREATE UNIQUE INDEX demo_source_template_unique_name ON demo_source_template (industry_id, lower(name));
CREATE TABLE embedding (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_type text NOT NULL CHECK (owner_type IN ('metric','term_synonym','prompt')), owner_id uuid NOT NULL, scope_type text NOT NULL CHECK (scope_type IN ('industry','project')), industry_id uuid REFERENCES industry(id) ON DELETE CASCADE, project_id uuid REFERENCES project(id) ON DELETE CASCADE, content text NOT NULL, content_hash bytea NOT NULL, model text NOT NULL, dimensions smallint NOT NULL, vector vector(1536) NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (owner_type, owner_id, model));
CREATE INDEX embedding_metric_hnsw ON embedding USING hnsw (vector vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE owner_type = 'metric' AND active;
CREATE INDEX embedding_scope ON embedding (owner_type, scope_type, industry_id, project_id) WHERE active;
INSERT INTO industry (slug, name, description) VALUES ('reinsurance-treaty', 'Reinsurance Treaty', 'Reinsurance treaty vocabulary and demo pack.');
