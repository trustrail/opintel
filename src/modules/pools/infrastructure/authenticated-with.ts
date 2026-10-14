/** Evaluate at PostgreSQL timestamp precision; a must be the presence row. */
export const authenticatedWithSql=`CASE WHEN public.is_credential_authentication(a.last_seen) THEN
 (SELECT jsonb_build_object('kind','credential','label',c.label,'alias',k.custody_alias)
  FROM pool_key k JOIN pool_credential c ON c.id=k.credential_id AND c.pool_id=k.pool_id
  WHERE k.id=a.key_version AND k.pool_id=a.pool_id)
 ELSE jsonb_build_object('kind','legacy_pool_key') END`;
