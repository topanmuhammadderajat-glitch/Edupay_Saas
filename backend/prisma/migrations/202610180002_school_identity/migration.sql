
ALTER TABLE "schools" ADD COLUMN "stamp_url" TEXT, ADD COLUMN "signature_url" TEXT;
CREATE TABLE "school_assets" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "school_id" TEXT NOT NULL REFERENCES "schools"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('logo','stamp','signature')),
 "content_type" TEXT NOT NULL CHECK ("content_type" IN ('image/png','image/jpeg')),
 "data" BYTEA NOT NULL CHECK (octet_length("data") BETWEEN 1 AND 1048576),
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "school_assets_school_id_kind_key" UNIQUE ("school_id","kind")
);
