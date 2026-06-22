ALTER TABLE "users" SET SCHEMA "accounts";
ALTER TABLE "user_sessions" SET SCHEMA "accounts";
ALTER TABLE "login_attempts" SET SCHEMA "accounts";
ALTER TABLE "auth_tokens" SET SCHEMA "accounts";

ALTER TABLE "products" SET SCHEMA "catalog";
ALTER TABLE "brands" SET SCHEMA "catalog";
ALTER TABLE "classifications" SET SCHEMA "catalog";

ALTER TABLE "suppliers" SET SCHEMA "management";
ALTER TABLE "promotions" SET SCHEMA "management";
ALTER TABLE "reviews" SET SCHEMA "management";
ALTER TABLE "database_backups" SET SCHEMA "management";
ALTER TABLE "database_backup_schedule" SET SCHEMA "management";
