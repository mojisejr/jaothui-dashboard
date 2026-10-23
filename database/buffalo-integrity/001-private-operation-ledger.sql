-- Release artifact: package in the existing frontend-owned migration lineage.
-- Additive only. Rehearse on disposable PG15; NO production application in Phase2.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA buffalo_integrity;
REVOKE ALL ON SCHEMA buffalo_integrity FROM PUBLIC;
CREATE TABLE buffalo_integrity.operation (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  idempotency_key text NOT NULL,
  intent_hash text NOT NULL,
  intent jsonb NOT NULL,
  domain jsonb NOT NULL,
  plan jsonb,
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','READY','SIGNING','CHAIN_PENDING','BROADCAST_UNKNOWN','AWAITING_METADATA_ACTION','CHAIN_STEPS','PROJECTING','VERIFYING','COMPLETED','RETRYABLE','RECOVERY_REQUIRED','NEEDS_REVIEW','CANCELLED')),
  version integer NOT NULL DEFAULT 0,
  fence bigint NOT NULL DEFAULT 0,
  lease_owner text,
  lease_until timestamptz,
  actual_token text,
  result jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner,idempotency_key)
);
CREATE TABLE buffalo_integrity.reservation (
  key text PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES buffalo_integrity.operation(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE buffalo_integrity.step (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES buffalo_integrity.operation(id),
  ordinal integer NOT NULL,
  kind text NOT NULL,
  expected jsonb NOT NULL,
  state text NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','SIGNED','PENDING','UNKNOWN','CONFIRMED','REVERTED','REVIEW')),
  chain_id integer NOT NULL,
  sender text NOT NULL,
  nonce bigint,
  calldata_hash text,
  transaction_hash text,
  signed_bytes text,
  transaction_envelope jsonb,
  receipt jsonb,
  proof jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id,ordinal),
  UNIQUE (chain_id,sender,nonce),
  UNIQUE (transaction_hash),
  CHECK ((signed_bytes IS NULL AND transaction_hash IS NULL) OR
         (signed_bytes IS NOT NULL AND transaction_hash IS NOT NULL AND nonce IS NOT NULL AND calldata_hash IS NOT NULL AND transaction_envelope IS NOT NULL))
);
CREATE TABLE buffalo_integrity.wallet_lease (
  chain_id integer NOT NULL,
  sender text NOT NULL,
  active_step uuid REFERENCES buffalo_integrity.step(id),
  fence bigint NOT NULL DEFAULT 0,
  lease_until timestamptz,
  PRIMARY KEY(chain_id,sender)
);
CREATE TABLE buffalo_integrity.event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES buffalo_integrity.operation(id),
  step_id uuid REFERENCES buffalo_integrity.step(id),
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Immutability is enforced even if future application code accidentally updates these fields.
CREATE FUNCTION buffalo_integrity.protect_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.owner,NEW.idempotency_key,NEW.intent_hash,NEW.intent,NEW.domain) IS DISTINCT FROM
    (OLD.owner,OLD.idempotency_key,OLD.intent_hash,OLD.intent,OLD.domain) THEN
   RAISE EXCEPTION 'immutable operation intent';
 END IF;
 IF OLD.plan IS NOT NULL AND NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'immutable approved plan'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operation_immutable BEFORE UPDATE ON buffalo_integrity.operation
 FOR EACH ROW EXECUTE FUNCTION buffalo_integrity.protect_intent();
CREATE FUNCTION buffalo_integrity.protect_signed_step() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.operation_id,NEW.ordinal,NEW.kind,NEW.expected,NEW.chain_id,NEW.sender) IS DISTINCT FROM
    (OLD.operation_id,OLD.ordinal,OLD.kind,OLD.expected,OLD.chain_id,OLD.sender) THEN RAISE EXCEPTION 'immutable step intent'; END IF;
 IF OLD.signed_bytes IS NOT NULL AND
    (NEW.nonce,NEW.calldata_hash,NEW.transaction_hash,NEW.signed_bytes,NEW.transaction_envelope) IS DISTINCT FROM
    (OLD.nonce,OLD.calldata_hash,OLD.transaction_hash,OLD.signed_bytes,OLD.transaction_envelope) THEN RAISE EXCEPTION 'immutable signed step'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER step_immutable BEFORE UPDATE ON buffalo_integrity.step
 FOR EACH ROW EXECUTE FUNCTION buffalo_integrity.protect_signed_step();
CREATE FUNCTION buffalo_integrity.append_only_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only operation event'; END $$;
CREATE TRIGGER event_append_only BEFORE UPDATE OR DELETE ON buffalo_integrity.event
 FOR EACH ROW EXECUTE FUNCTION buffalo_integrity.append_only_event();
ALTER TABLE buffalo_integrity.operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffalo_integrity.reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffalo_integrity.step ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffalo_integrity.wallet_lease ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffalo_integrity.event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA buffalo_integrity FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA buffalo_integrity FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buffalo_integrity FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA buffalo_integrity REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA buffalo_integrity REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA buffalo_integrity REVOKE ALL ON FUNCTIONS FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA buffalo_integrity FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA buffalo_integrity FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA buffalo_integrity FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buffalo_integrity FROM %I',role_name);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION buffalo_integrity.protect_journal_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'durable operation journal cannot be deleted'; END $$;
CREATE TRIGGER operation_no_delete BEFORE DELETE ON buffalo_integrity.operation FOR EACH ROW EXECUTE FUNCTION buffalo_integrity.protect_journal_delete();
CREATE TRIGGER step_no_delete BEFORE DELETE ON buffalo_integrity.step FOR EACH ROW EXECUTE FUNCTION buffalo_integrity.protect_journal_delete();
REVOKE ALL ON FUNCTION buffalo_integrity.protect_journal_delete() FROM PUBLIC;
COMMIT;
