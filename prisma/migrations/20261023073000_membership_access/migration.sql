-- Disable membership within its own site instead of disabling a shared user globally.
ALTER TABLE "Membership" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
