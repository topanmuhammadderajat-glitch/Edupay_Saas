CREATE INDEX payment_attempts_reconciliation_due ON payment_attempts (updated_at, id) WHERE status IN ('CREATING', 'READY', 'REVIEW');
