-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'ADMIN_TU', 'KASIR', 'PARENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('SD', 'SMP', 'SMA', 'SMK');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('QRIS', 'BCA_VA', 'MANDIRI_VA', 'BNI_VA', 'BRI_VA', 'CASH');

-- CreateEnum
CREATE TYPE "ShuttleType" AS ENUM ('NONE', 'ONE_WAY', 'TWO_WAY');

-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('SPP_INVOICE', 'DANA_BOS', 'HIBAH_PEMDA', 'DONASI_WAKAF', 'SERAGAM_BUKU', 'LAIN_LAIN');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('CREATING', 'READY', 'SETTLED', 'EXPIRED', 'CANCELLED', 'REVIEW');

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "npsn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "logo_url" TEXT,
    "level" "EducationLevel" NOT NULL DEFAULT 'SD',
    "midtrans_server_key" TEXT NOT NULL,
    "midtrans_client_key" TEXT NOT NULL,
    "midtrans_is_prod" BOOLEAN NOT NULL DEFAULT false,
    "invoice_cutoff_day" INTEGER NOT NULL DEFAULT 1,
    "due_day_of_month" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PARENT',
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_fee_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "spp_amount" DECIMAL(12,2) NOT NULL,
    "registration_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "early_bird_discount" DECIMAL(12,2) NOT NULL DEFAULT 25000,
    "early_bird_cutoff_day" INTEGER NOT NULL DEFAULT 5,
    "sibling_discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_fee_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracurriculars" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_fee" DECIMAL(12,2) NOT NULL,
    "mentor_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracurriculars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shuttle_routes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "route_description" TEXT NOT NULL,
    "vehicle_no" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_phone" TEXT NOT NULL,
    "monthly_fee_two_way" DECIMAL(12,2) NOT NULL,
    "monthly_fee_one_way" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shuttle_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "nis" TEXT NOT NULL,
    "nisn" TEXT,
    "full_name" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "classroom" TEXT NOT NULL,
    "shuttle_route_id" TEXT,
    "shuttle_type" "ShuttleType" NOT NULL DEFAULT 'NONE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_extracurriculars" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "extracurricular_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_extracurriculars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "month_period" INTEGER NOT NULL,
    "year_period" INTEGER NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) NOT NULL,
    "spp_amount" DECIMAL(12,2) NOT NULL,
    "shuttle_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extracurricular_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "registration_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "early_bird_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sibling_discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "payment_type" "PaymentChannel",
    "early_bird_cutoff_day" INTEGER NOT NULL DEFAULT 5,
    "pricing_locked_at" TIMESTAMP(3),
    "snap_token" TEXT,
    "snap_redirect_url" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "school_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "transaction_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_channel" "PaymentChannel" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "receipt_hash" TEXT NOT NULL,
    "cash_received" DECIMAL(12,2),
    "midtrans_order_id" TEXT,
    "midtrans_status" TEXT,
    "cashier_id" TEXT,
    "cashier_notes" TEXT,
    "receipt_qr_code" TEXT,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_profiles" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "kop_surat_title" TEXT NOT NULL,
    "kop_surat_subtitle" TEXT NOT NULL,
    "kop_surat_address" TEXT NOT NULL,
    "kop_surat_contact" TEXT NOT NULL,
    "logo_url" TEXT,
    "headmaster_name" TEXT NOT NULL,
    "headmaster_nip" TEXT,
    "headmaster_signature_url" TEXT,
    "treasurer_name" TEXT NOT NULL,
    "treasurer_nip" TEXT,
    "treasurer_signature_url" TEXT,
    "bank_name" TEXT NOT NULL,
    "bank_account_number" TEXT NOT NULL,
    "bank_account_holder" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_incomes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" "IncomeCategory" NOT NULL DEFAULT 'SPP_INVOICE',
    "description" TEXT NOT NULL,
    "invoice_id" TEXT,
    "received_by" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_expenses" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "voucher_no" TEXT NOT NULL,
    "receipt_photo_url" TEXT,
    "paid_to" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'CREATING',
    "snap_token" TEXT,
    "redirect_url" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "gateway_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_npsn_key" ON "schools"("npsn");

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "users_school_id_role_idx" ON "users"("school_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_email_key" ON "users"("school_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_school_id_id_key" ON "users"("school_id", "id");

-- CreateIndex
CREATE INDEX "grade_fee_settings_school_id_idx" ON "grade_fee_settings"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_fee_settings_school_id_grade_key" ON "grade_fee_settings"("school_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "grade_fee_settings_school_id_id_key" ON "grade_fee_settings"("school_id", "id");

-- CreateIndex
CREATE INDEX "extracurriculars_school_id_idx" ON "extracurriculars"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "extracurriculars_school_id_code_key" ON "extracurriculars"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "extracurriculars_school_id_id_key" ON "extracurriculars"("school_id", "id");

-- CreateIndex
CREATE INDEX "shuttle_routes_school_id_idx" ON "shuttle_routes"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "shuttle_routes_school_id_id_key" ON "shuttle_routes"("school_id", "id");

-- CreateIndex
CREATE INDEX "students_school_id_parent_id_idx" ON "students"("school_id", "parent_id");

-- CreateIndex
CREATE INDEX "students_school_id_grade_idx" ON "students"("school_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_nis_key" ON "students"("school_id", "nis");

-- CreateIndex
CREATE UNIQUE INDEX "students_school_id_id_key" ON "students"("school_id", "id");

-- CreateIndex
CREATE INDEX "student_extracurriculars_school_id_idx" ON "student_extracurriculars"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_extracurriculars_student_id_extracurricular_id_key" ON "student_extracurriculars"("student_id", "extracurricular_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_extracurriculars_school_id_id_key" ON "student_extracurriculars"("school_id", "id");

-- CreateIndex
CREATE INDEX "invoices_school_id_status_idx" ON "invoices"("school_id", "status");

-- CreateIndex
CREATE INDEX "invoices_school_id_student_id_idx" ON "invoices"("school_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_invoice_no_key" ON "invoices"("school_id", "invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_student_id_month_period_year_period_key" ON "invoices"("school_id", "student_id", "month_period", "year_period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_school_id_id_key" ON "invoices"("school_id", "id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_school_id_id_key" ON "invoice_items"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_receipt_hash_key" ON "payment_transactions"("receipt_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_midtrans_order_id_key" ON "payment_transactions"("midtrans_order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_school_id_transaction_time_idx" ON "payment_transactions"("school_id", "transaction_time");

-- CreateIndex
CREATE INDEX "payment_transactions_invoice_id_idx" ON "payment_transactions"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_school_id_invoice_id_key" ON "payment_transactions"("school_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_school_id_receipt_no_key" ON "payment_transactions"("school_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_school_id_id_key" ON "payment_transactions"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_profiles_school_id_key" ON "school_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_profiles_school_id_id_key" ON "school_profiles"("school_id", "id");

-- CreateIndex
CREATE INDEX "cash_incomes_school_id_date_idx" ON "cash_incomes"("school_id", "date");

-- CreateIndex
CREATE INDEX "cash_incomes_school_id_category_idx" ON "cash_incomes"("school_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "cash_incomes_school_id_receipt_no_key" ON "cash_incomes"("school_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "cash_incomes_school_id_invoice_id_key" ON "cash_incomes"("school_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_incomes_school_id_id_key" ON "cash_incomes"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_school_id_code_key" ON "expense_categories"("school_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_school_id_id_key" ON "expense_categories"("school_id", "id");

-- CreateIndex
CREATE INDEX "cash_expenses_school_id_date_idx" ON "cash_expenses"("school_id", "date");

-- CreateIndex
CREATE INDEX "cash_expenses_school_id_category_id_idx" ON "cash_expenses"("school_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_expenses_school_id_voucher_no_key" ON "cash_expenses"("school_id", "voucher_no");

-- CreateIndex
CREATE UNIQUE INDEX "cash_expenses_school_id_id_key" ON "cash_expenses"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_order_id_key" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_school_id_invoice_id_status_idx" ON "payment_attempts"("school_id", "invoice_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_school_id_id_key" ON "payment_attempts"("school_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_school_id_period_key" ON "receipt_sequences"("school_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_school_id_id_key" ON "receipt_sequences"("school_id", "id");

-- CreateIndex
CREATE INDEX "audit_events_school_id_created_at_idx" ON "audit_events"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_school_id_id_key" ON "audit_events"("school_id", "id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_fee_settings" ADD CONSTRAINT "grade_fee_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracurriculars" ADD CONSTRAINT "extracurriculars_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shuttle_routes" ADD CONSTRAINT "shuttle_routes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_parent_id_fkey" FOREIGN KEY ("school_id", "parent_id") REFERENCES "users"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_shuttle_route_id_fkey" FOREIGN KEY ("school_id", "shuttle_route_id") REFERENCES "shuttle_routes"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_extracurriculars" ADD CONSTRAINT "student_extracurriculars_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_extracurriculars" ADD CONSTRAINT "student_extracurriculars_school_id_extracurricular_id_fkey" FOREIGN KEY ("school_id", "extracurricular_id") REFERENCES "extracurriculars"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_school_id_student_id_fkey" FOREIGN KEY ("school_id", "student_id") REFERENCES "students"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_school_id_cashier_id_fkey" FOREIGN KEY ("school_id", "cashier_id") REFERENCES "users"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_profiles" ADD CONSTRAINT "school_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_incomes" ADD CONSTRAINT "cash_incomes_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_school_id_category_id_fkey" FOREIGN KEY ("school_id", "category_id") REFERENCES "expense_categories"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_school_id_invoice_id_fkey" FOREIGN KEY ("school_id", "invoice_id") REFERENCES "invoices"("school_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
