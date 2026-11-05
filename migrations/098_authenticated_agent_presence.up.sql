-- Authentication, not a self-declared signal, supplies verified presence.
ALTER TABLE agent_presence DROP CONSTRAINT agent_presence_verified_check;
