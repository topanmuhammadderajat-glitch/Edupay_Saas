CREATE TABLE "onboarding_jobs" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "slug" TEXT NOT NULL,
 "admin_email" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "firebase_uid" TEXT NOT NULL,
 "school_id" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','COMPLETED')),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "onboarding_jobs_slug_key" ON "onboarding_jobs"("slug");
CREATE UNIQUE INDEX "onboarding_jobs_admin_email_key" ON "onboarding_jobs"("admin_email");
CREATE UNIQUE INDEX "onboarding_jobs_firebase_uid_key" ON "onboarding_jobs"("firebase_uid");
CREATE UNIQUE INDEX "onboarding_jobs_school_id_key" ON "onboarding_jobs"("school_id");
DO $guard$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON TABLE onboarding_jobs FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON TABLE onboarding_jobs FROM authenticated;
 END IF;
END $guard$;
ALTER TABLE onboarding_jobs ENABLE ROW LEVEL SECURITY;
