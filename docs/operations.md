# Operations and deployment

## Environments

Use Node 22.12 or newer and separate local, staging and production databases/buckets. Use `npm ci` and the committed lockfile. Prisma remains on version 6. Production uses Next.js 15.5.28 and its matching security-patched dependency line. Re-check vendor advisories before release; the repository records whether an external npm advisory check was actually completed.

`DATABASE_URL` is the pooled PostgreSQL runtime connection; `DIRECT_DATABASE_URL` is a direct migration connection. Set `NEXTAUTH_URL` to the exact public HTTPS origin and `NEXTAUTH_SECRET` to a securely generated random secret (for example, `openssl rand -base64 48`). Production rejects short or recognizable placeholder secrets. Keep secrets in Vercel environment settings and restrict preview deployments to staging data. Changing passwords, roles or memberships revokes sessions. `SITE_ID` is needed only when more than one site shares a deployment database; no restaurant picker is required for a single site. Restaurant domain, currency, time zone and content live in PostgreSQL.

## Migration preflight

1. Back up the **entire database**, including all schemas and Prisma migration history, and verify a restore into an isolated database.
2. Configure database/session time zone as UTC before applying SQL migrations; application schedules use the restaurant’s separate IANA time zone. Inspect historical timestamp conventions before importing data and never guess-convert existing timestamps. Run `npx prisma migrate status` against the direct URL and inspect actual tables. Never use `migrate reset` or `db push --accept-data-loss` against existing data.
3. If both historical migrations are already applied, run `npm run db:deploy` for the additive restaurant migrations.
4. On an empty database, the complete migration chain can be deployed normally.
5. If the database contains initial-schema data and `templates_v2` has **not** been applied, do not run its original SQL: it drops media and cannot backfill required keys. Run the reviewed `scripts/repair-legacy-template-v2.sql` with `psql -v ON_ERROR_STOP=1`. It moves existing media into `legacy_archive."MediaAsset"`, preserves all records and assigns deterministic generic template keys. Verify media/record counts and field contents. Only then mark `20250813135023_templates_v2` applied using `prisma migrate resolve --applied`, and deploy the new migrations. Preserve the existing `init` history; use baseline resolution only when its schema is already verified and history is missing.
6. A partially applied historical migration or unexpected schema is a manual-reconciliation case. Stop rather than guessing or deleting records. Do not edit applied migration files.
7. Compare record counts, IDs, playlist ordering, user memberships and published snapshots after migration. Run the staging signage regression before switching production traffic.

The repair path is tested with `tests/fixtures/legacy.sql` and `verify-legacy.sql`; it preserves archived media, user/banner/playlist IDs, order and live playback. Legacy archives are deliberately outside Prisma's managed public schema. They remain included in full database backups and must not be removed during deployment. Existing external images and private S3 keys remain readable; they are not blindly fetched or rewritten. To reuse an archived media URL, upload its approved original through the library, then deliberately update content references.

`npx prisma db seed` adds missing designed templates, blank system-page drafts and navigation containers without replacing existing fields/content or creating users. `npm run owner:setup` creates/promotes an explicitly chosen Owner with a supplied password. Former known default passwords cannot log in. Review migrated administrators and assign the intended Owner.

## S3 and CDN

Set `AWS_REGION`, `AWS_BUCKET_NAME`, and either scoped AWS credentials or the AWS SDK's workload credentials. Set `MEDIA_PUBLIC_BASE_URL` to a stable HTTPS CDN origin. The application never writes runtime uploads into Next.js `public/`.

Use a private bucket with public access blocked. CloudFront (or an equivalent CDN) should use origin access control and expose **only** validated `sites/*/media/*` objects. Do not expose `staging/*`. Existing private signage objects can remain private and use signed reads.

The upload sequence is: authenticated upload intent → short-lived size/type-constrained S3 POST → authenticated finalization → bounded download and actual image decode → EXIF-stripping re-encode and thumbnail generation → immutable final keys and media record. Upload policies never grant arbitrary keys. Staging objects are never rendered. Finalization is claimed once; failures require a new upload.

Required IAM operations: restricted PutObject/GetObject/DeleteObject on staging and managed media prefixes, plus GetObject on legacy signage keys as needed. Avoid bucket-admin permissions. Configure S3 CORS with exact development/staging/production origins, POST/GET/HEAD methods, required upload headers, and no wildcard credentialed origin. Configure a lifecycle rule to delete staging objects after one day. Final assets have immutable cache headers and unique URLs; replacement uses a new asset.

Images accept JPEG, PNG, WebP or AVIF up to 10 MB and 40 megapixels. Animated/unsupported or mismatched content is rejected. Managed records include intrinsic dimensions, size, thumbnail, alt and caption. Archived media stays available to existing content. Referential guards protect menu images, draft/published pages, branding and draft/published signage. Physical S3 object removal is deliberately separate from deleting an unreferenced archived library record, allowing backup retention and recovery. Operators should apply a reviewed orphan-retention policy, not blanket bucket deletion.

Verify real bucket/CORS/CDN behavior in staging with small, large, spoofed, oversized and invalid images. Local image fixtures and mocked validation do not prove real cloud delivery.

## Vercel release

Build with `prisma generate` and `next build`; run migrations once as a controlled release step with the direct URL. Do not run migrations inside HTTP requests. Set the function region close to PostgreSQL/S3 and use pool-compatible connection limits. Provision a valid public CDN origin before enabling media uploads. Configure the CMS public domain before launch so canonical URLs and structured data use the right origin.

Publish Home/Menu and configure navigation, approved imagery, real contact/location information, hours and menu prices. Add ordering providers/actions only when their actual store URLs are supplied. Enable and explicitly publish additional page languages after translation review. The default language switch requires existing live pages to be published in the proposed default language first.

Use `/api/health` for readiness (200/503 without infrastructure details). Vercel captures structured server events; unexpected API failures have a request ID. Alert on sustained 5xx/readiness failures and function/database connection exhaustion. Player requests remain session-independent; test fullscreen playback, transitions and menu update detection on a real TV.

Review expired `LoginWindow` and `UploadIntent` rows in a scheduled database maintenance job. Login windows can be removed after `expiresAt`; completed/failed upload intents can be retained for the organization's operational retention period. Do not delete audit/revision records as routine cache cleanup.

## Backup, recovery and rollback

Enable managed PostgreSQL point-in-time recovery and S3 versioning/retention appropriate to the operator. Back up all schemas, including `legacy_archive`, before migrations. Test restoration into a separate environment and verify users, publication pointers, images and players. A deployment rollback must remain compatible with the additive schema; do not roll back to the old unscoped application after site migration. Restore a page revision to draft, preview, then publish to recover content. Signage audit records retain publication snapshots; operator-assisted restoration should be validated in staging before publication.

Avoid restoring a production database over active writes. Pause administrative writes during a coordinated incident recovery. Real cloud restore drills and Vercel deployment checks remain operator release gates until performed against the chosen infrastructure.

## Content and extension conventions

Add a section's schema/defaults to the registry, its controlled editor configuration, and its renderer. Keep shared menu/profile/actions as references. Public rich text renders approved document nodes and safe links through React; legacy signage HTML is allowlist-sanitized. Do not add arbitrary HTML/CSS/script/embed fields.

Default-language routes have no prefix; other locales use canonical locale identifiers and manually entered slugs. Only published translations enter sitemap/hreflang. Missing entity translations use default-language text with `lang` markup. Menu publication and availability are separate: unavailable dishes remain labeled on the website and are excluded from automatic signage. Schedule exceptions replace intervals starting on their service date; an overnight interval from the preceding service date continues until its configured closing time.

Keep site/role/resource checks in server entry points and validate every nested reference. Keep new secrets out of both content records and client DTOs. Profile/branding/menu operations explicitly update shared live data; page and signage drafts use published snapshots. Important versioned saves reject stale edits with 409 rather than overwriting another employee's work.

## Optional AI assistance

Apply the additive `20261023075000_modal_ai` migration and configure a server-only `OPENAI_API_KEY` to enable modal AI chat. Every request uses `gpt-6-luna`. Configure OpenAI project billing alerts and the application's database-backed allowances; allow up to 120 seconds for the AI route. No API key is needed for manual editing or automated mocked tests. See [AI configuration and maintenance](ai-assistant.md) for privacy, history cleanup, limits and the explicit live smoke test.

## Central AI worker

Run `npm run ai:worker` under persistent process supervision alongside the web app (a separate Node host for Vercel deployments). Supply the same database/site/OpenAI configuration and generated Prisma client. The queue uses PostgreSQL leases and checkpoints, allowing worker restarts without duplicating content tools. Monitor worker restarts, heartbeat age, failed runs, database connections and provider budgets. Web readiness does not imply worker readiness. Review [builder deployment, limits, privacy and recovery](ai-website-builder.md) before enabling whole-site generation.
