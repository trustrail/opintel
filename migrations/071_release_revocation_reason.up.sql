-- Safe fixed reasons explain revocation without changing immutable earlier events.
ALTER TABLE release_event ADD COLUMN reason text CHECK(reason IS NULL OR reason='provider changed');
