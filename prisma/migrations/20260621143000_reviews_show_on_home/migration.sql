ALTER TABLE "management"."reviews"
ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "reviews_showOnHome_status_idx"
ON "management"."reviews"("showOnHome", "status");
