-- Presence is mutable observational state, never a receipt.
UPDATE agent_presence SET verified=false WHERE verified;
ALTER TABLE agent_presence ADD CONSTRAINT agent_presence_verified_check CHECK (verified=false);
