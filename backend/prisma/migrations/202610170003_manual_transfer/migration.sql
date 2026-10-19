ALTER TYPE "PaymentChannel" ADD VALUE 'MANUAL_TRANSFER';
ALTER TABLE "payment_transactions" ADD COLUMN "transfer_reference" TEXT;
CREATE UNIQUE INDEX "payment_transactions_school_transfer_reference" ON "payment_transactions"("school_id", "transfer_reference");
