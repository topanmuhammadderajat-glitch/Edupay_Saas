-- Audit events may only be appended, including by accidental application SQL.
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER audit_events_no_changes BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_mutation();

-- All application writers also serialize on the invoice row.
CREATE UNIQUE INDEX payment_attempts_one_active_invoice
ON payment_attempts (school_id, invoice_id) WHERE status IN ('CREATING', 'READY');

ALTER TABLE invoices ADD CONSTRAINT invoices_amount_nonnegative CHECK (total_amount >= 0);
ALTER TABLE payment_transactions ADD CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0);
ALTER TABLE cash_incomes ADD CONSTRAINT income_amount_nonnegative CHECK (amount >= 0);
ALTER TABLE grade_fee_settings ADD CONSTRAINT fees_valid CHECK (
  grade BETWEEN 1 AND 12 AND spp_amount >= 0 AND registration_fee >= 0
  AND early_bird_discount >= 0 AND sibling_discount_pct BETWEEN 0 AND 100
  AND early_bird_cutoff_day BETWEEN 1 AND 28
);
