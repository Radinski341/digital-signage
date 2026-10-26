-- Defaults for new restaurants only. Existing settings are changed only by the explicit audited preset.
ALTER TABLE "Branding"
  ALTER COLUMN "primaryColor" SET DEFAULT '#282828',
  ALTER COLUMN "accentColor" SET DEFAULT '#383838',
  ALTER COLUMN "textColor" SET DEFAULT '#101820',
  ALTER COLUMN "backgroundColor" SET DEFAULT '#ffffff',
  ALTER COLUMN "headingFont" SET DEFAULT 'montserrat',
  ALTER COLUMN "bodyFont" SET DEFAULT 'montserrat',
  ALTER COLUMN "radius" SET DEFAULT 22;
