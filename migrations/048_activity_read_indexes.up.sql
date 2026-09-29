CREATE INDEX query_run_activity_pool_idx ON query_run(project_id,pool_id,started_at DESC,id DESC);
CREATE INDEX query_run_activity_order_idx ON query_run(project_id,started_at DESC,id DESC);
