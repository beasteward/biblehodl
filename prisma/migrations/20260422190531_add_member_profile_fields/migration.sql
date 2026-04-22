-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Member" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("id", "joinedAt", "pubkey", "role", "teamId") SELECT "id", "joinedAt", "pubkey", "role", "teamId" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE INDEX "Member_teamId_idx" ON "Member"("teamId");
CREATE INDEX "Member_pubkey_idx" ON "Member"("pubkey");
CREATE UNIQUE INDEX "Member_teamId_pubkey_key" ON "Member"("teamId", "pubkey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
