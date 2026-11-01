CREATE TABLE "DailyEvent" (
    "day" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payloadKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "version", "name", "payloadKey")
);

CREATE TABLE "ErrorFingerprint" (
    "fingerprint" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstSeenDay" TEXT NOT NULL,
    "firstVersion" TEXT NOT NULL,
    "lastSeenDay" TEXT NOT NULL,
    "lastVersion" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT
);

CREATE TABLE "DailyError" (
    "day" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("day", "version", "fingerprint")
);

CREATE TABLE "ServiceSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "DailyUsage" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "batches" INTEGER NOT NULL DEFAULT 0,
    "items" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "eventRows" INTEGER,
    "errorRows" INTEGER,
    "fingerprintRows" INTEGER,
    "databaseBytes" BIGINT
);

CREATE INDEX "DailyEvent_name_day_idx" ON "DailyEvent"("name", "day");

CREATE INDEX "ErrorFingerprint_lastSeenDay_idx" ON "ErrorFingerprint"("lastSeenDay");

CREATE INDEX "DailyError_fingerprint_day_idx" ON "DailyError"("fingerprint", "day");
