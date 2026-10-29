-- Disposable customer database only. Never applied to an Opintel store.
CREATE TABLE public.records (
  id integer PRIMARY KEY,
  token_id text NOT NULL,
  masked_label text NOT NULL,
  amount integer NOT NULL,
  custody_label text NOT NULL,
  withheld_label text NOT NULL
);
INSERT INTO public.records
SELECT n, 'customer-' || n, 'label-' || n, 100 + n,
       'custody-' || n, 'withheld-' || n
FROM generate_series(1, 10) n;
CREATE TABLE public.other_records (audit_key text PRIMARY KEY, description text);
INSERT INTO public.other_records VALUES ('one', 'second table');

-- Model a customer database with ordinary planner statistics. Unknown scan size
-- must still refuse; this fixture must not depend on an autovacuum race.
ANALYZE public.records;
ANALYZE public.other_records;
