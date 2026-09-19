# Extraction declarations: expand, backfill, enforce

Migration 018 is safe on populated cedant and rule tables. It adds nullable
`decimal_separator`, `date_format`, `sheet` and `sheet_index` columns without
inventing declarations. Existing IDs, rules and relationships are preserved.
`header_row` keeps its specified default of 1. Other validation checks allow
NULL declarations while rejecting invalid supplied values.

## Backfill after applying 018

1. Have the deployment owner obtain each cedant's decimal separator and date
   format, and each rule's exact sheet name or one-based sheet index. Include
   inactive rows: the later database constraints apply to them too.
2. Update the declarations through the existing tenant scope, using reviewed
   values for each row. Do not derive them from the machine, guess from file
   contents, or apply blanket defaults. For example, these are parameterized
   statements for `withTenant`, not a prefilled backfill:

   ```sql
   UPDATE cedant SET decimal_separator = $1, date_format = $2 WHERE id = $3;
   UPDATE cedant_file_rule
   SET sheet = $1, sheet_index = $2, header_row = $3 WHERE id = $4;
   ```

   Decimal separators supported by extraction are `.` and `,`; date declarations
   are `DD/MM/YYYY`, `MM/DD/YYYY` and `YYYY-MM-DD`. Set exactly one of `sheet` or
   `sheet_index`. CSV uses sheet index 1. Confirm the header row as well.
3. Run these checks for every project under its tenant scope. Both must return
   zero rows. Coordinate writers so incomplete declarations are not introduced
   between verification and the enforcement release.

   ```sql
   SELECT id FROM cedant
   WHERE decimal_separator IS NULL OR date_format IS NULL
      OR date_format NOT IN ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD');

   SELECT id FROM cedant_file_rule
   WHERE (sheet IS NULL) = (sheet_index IS NULL);
   ```

4. Re-export the rule snapshots and provision them to the sidecar. During this
   window, incomplete declarations refuse extraction and quarantine files;
   nullable database columns do not enable a fallback or an inferred locale.
   Existing quarantines are not silently released by editing a rule.

## Enforcement release, after verified backfill

Do **not** place the following in the active migration directory yet. The normal
runner applies every pending migration, which would eliminate the backfill
window if enforcement shipped beside 018. Once all deployments have completed
and verified their backfill, release a separately numbered forward migration:

```sql
ALTER TABLE cedant
  ALTER COLUMN decimal_separator SET NOT NULL,
  ALTER COLUMN date_format SET NOT NULL;
ALTER TABLE cedant_file_rule
  ADD CONSTRAINT extraction_sheet_declared
  CHECK ((sheet IS NULL) <> (sheet_index IS NULL));
```

Its down migration drops `extraction_sheet_declared` and drops the two NOT NULL
requirements; it must retain the declarations themselves. The enforcement
migration must fail if incomplete rows remain, rather than supplying defaults.
