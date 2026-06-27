-- CreateTable
CREATE TABLE "ChannelMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ChannelMember_channelId_idx" ON "ChannelMember"("channelId");

-- CreateIndex
CREATE INDEX "ChannelMember_pubkey_idx" ON "ChannelMember"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelMember_channelId_pubkey_key" ON "ChannelMember"("channelId", "pubkey");
