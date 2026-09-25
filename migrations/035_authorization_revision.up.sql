ALTER TABLE relationship_outbox RENAME COLUMN zed_token TO authorization_revision;
UPDATE relationship_outbox SET last_error='Authorization relationship write failed.' WHERE last_error='SpiceDB write failed.';
