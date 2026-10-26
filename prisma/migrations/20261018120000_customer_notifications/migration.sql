-- CreateTable
BEGIN;

CREATE TABLE "accounts"."notification_preferences" (
    "userId" INTEGER NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "offers" BOOLEAN NOT NULL DEFAULT true,
    "rentals" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "management"."notification_automation" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rentalStatus" BOOLEAN NOT NULL DEFAULT true,
    "prescriptions" BOOLEAN NOT NULL DEFAULT true,
    "security" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management"."notification_campaigns" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "payloadHash" TEXT,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL DEFAULT 'NONE',
    "destinationId" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts"."notification_recipients" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts"."push_subscriptions" (
    "id" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionTokenId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management"."push_deliveries" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "receiptId" TEXT,
    "errorCode" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaigns_requestKey_key" ON "management"."notification_campaigns"("requestKey");

-- CreateIndex
CREATE INDEX "notification_campaigns_createdAt_id_idx" ON "management"."notification_campaigns"("createdAt", "id");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_createdAt_id_idx" ON "accounts"."notification_recipients"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_readAt_idx" ON "accounts"."notification_recipients"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_campaignId_userId_key" ON "accounts"."notification_recipients"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_identity_key" ON "accounts"."push_subscriptions"("identity");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_active_idx" ON "accounts"."push_subscriptions"("userId", "active");

-- CreateIndex
CREATE INDEX "push_deliveries_status_nextAttemptAt_leaseUntil_idx" ON "management"."push_deliveries"("status", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_recipientId_subscriptionId_key" ON "management"."push_deliveries"("recipientId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "accounts"."notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts"."notification_recipients" ADD CONSTRAINT "notification_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "management"."notification_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts"."notification_recipients" ADD CONSTRAINT "notification_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "accounts"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management"."push_deliveries" ADD CONSTRAINT "push_deliveries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "accounts"."notification_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management"."push_deliveries" ADD CONSTRAINT "push_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "accounts"."push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
