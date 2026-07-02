-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "phase" TEXT NOT NULL DEFAULT 'lobby',
    "phaseEndsAt" DATETIME,
    "hostPubkey" TEXT NOT NULL DEFAULT '',
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT -1,
    "questionStartedAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameSession" ("createdAt", "currentQuestionIndex", "finishedAt", "gameId", "id", "questionStartedAt", "startedAt", "status") SELECT "createdAt", "currentQuestionIndex", "finishedAt", "gameId", "id", "questionStartedAt", "startedAt", "status" FROM "GameSession";
DROP TABLE "GameSession";
ALTER TABLE "new_GameSession" RENAME TO "GameSession";
CREATE INDEX "GameSession_gameId_idx" ON "GameSession"("gameId");
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastRank" INTEGER,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("displayName", "id", "joinedAt", "pubkey", "score", "sessionId") SELECT "displayName", "id", "joinedAt", "pubkey", "score", "sessionId" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE INDEX "Player_sessionId_idx" ON "Player"("sessionId");
CREATE UNIQUE INDEX "Player_sessionId_pubkey_key" ON "Player"("sessionId", "pubkey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
