/*
  Warnings:

  - The primary key for the `DailyError` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "ErrorFingerprint" ADD COLUMN "sampleDigest" TEXT;
ALTER TABLE "ErrorFingerprint" ADD COLUMN "sampleFrame" TEXT;
ALTER TABLE "ErrorFingerprint" ADD COLUMN "sampleMessage" TEXT;
ALTER TABLE "ErrorFingerprint" ADD COLUMN "samplePath" TEXT;
ALTER TABLE "ErrorFingerprint" ADD COLUMN "samplePlatform" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyError" (
    "day" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'other',
    "fingerprint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "version", "platform", "fingerprint")
);
INSERT INTO "new_DailyError" ("count", "day", "fingerprint", "version") SELECT "count", "day", "fingerprint", "version" FROM "DailyError";
DROP TABLE "DailyError";
ALTER TABLE "new_DailyError" RENAME TO "DailyError";
CREATE INDEX "DailyError_fingerprint_day_idx" ON "DailyError"("fingerprint", "day");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
