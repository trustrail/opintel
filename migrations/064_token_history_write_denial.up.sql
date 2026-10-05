-- RLS already denies inserts by default. This explicit policy states that
-- tenant writes are forbidden, rather than leaving a missing policy for a
-- later reader to fill in. Matches evidence_rollup; only the database-owned
-- assignment trigger writes history. Existing grants remain unchanged.
CREATE POLICY tenant_write ON token_domain_assignment FOR INSERT TO opintel_app
 WITH CHECK(false);
