ALTER TABLE engine ADD COLUMN registration_version integer NOT NULL DEFAULT 1 CHECK (registration_version > 0);
