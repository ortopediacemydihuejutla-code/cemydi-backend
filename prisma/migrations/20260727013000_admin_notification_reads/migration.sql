CREATE TABLE "management"."admin_notification_reads" (
    "userId" INTEGER NOT NULL,
    "notificationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_reads_pkey"
        PRIMARY KEY ("userId", "notificationId"),
    CONSTRAINT "admin_notification_reads_userId_fkey"
        FOREIGN KEY ("userId")
        REFERENCES "accounts"."users"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "admin_notification_reads_readAt_idx"
ON "management"."admin_notification_reads"("readAt");
