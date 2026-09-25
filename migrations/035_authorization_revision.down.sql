ALTER TABLE relationship_outbox RENAME COLUMN authorization_revision TO zed_token;
UPDATE relationship_outbox SET last_error='SpiceDB write failed.' WHERE last_error='Authorization relationship write failed.';
