# Restaurant platform implementation

## Baseline audit

The repository uses Next.js 15 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, NextAuth 4 credentials/JWT, S3, Zod 4 and SWR. Tailwind 4 is installed but its stylesheet is not imported. There are no tests or configured ESLint rules. Public routes are `/`, `/banner`, `/banner/[id]`, `/slide/[id]`, and legacy `/settings`. Administration is `/admin`, `/admin/login`, `/admin/templates`, `/admin/banners`, `/admin/slides`. Route handlers live under `/api/{auth,templates,banners,slides,upload}`.

Users, Template/TemplateField, Banner and Slide/SlideItem are the entire database. Template fields support scalar and array values; banner values are JSON. Five concrete template renderers exist. The playlist player uses a different generic renderer, and its ETag ignores banner changes. Uploads have two competing implementations (S3 in banner mutations and local disk/Formidable at `/api/upload`). S3 signing wrongly treats external URLs as keys. Raw HTML is rendered without sanitization. Prisma clients are instantiated per module. API mutations have no session or permission checks. Login points at a nonexistent route, the middleware login exclusion is invalid, and seeding creates a publicly documented password. Root-level middleware is also ignored with this repository’s `src/app` layout; the implementation moves it to `src/middleware.ts` and verifies localized document language and protected navigation in production browser tests.

Baseline: Prisma validation passes; TypeScript fails on missing Template.key; production build fails on synchronous route params; lint prompts interactively. PostgreSQL at the configured address is unreachable. No deployed schema or bucket behavior has been verified. Historical migration `20250813135023_templates_v2` drops MediaAsset and adds Template.key without a backfill; do not apply it blindly to populated databases.

## Target architecture

Preserve existing App Router, Prisma/PostgreSQL, NextAuth, S3, dynamic templates and playback URLs. Separate server services/authorization/validation, domain schemas, public renderers, admin components, and signage renderers. Scope every protected operation and referenced entity to Site. Use direct services for server rendering. Keep relational business data; reserve JSON for validated sections, rich-text documents, legacy template values and immutable revisions.

Site owns settings/profile/branding, locations/hours, supported locales/translations, menu, pages/sections/revisions, navigation/actions/integrations, media/references, memberships/audit, and signage. Initial site name is seed data only. Monetary inputs are decimal strings. UTC timestamps and IANA local schedules are distinct. Public pages use published content and cache invalidation; previews are authenticated and uncached. Retain existing signage IDs and published behavior.

## Decisions

Vercel + managed PostgreSQL and S3/CDN; pooled runtime and direct migration connections. Editors can publish routine content; Admin manages site configuration; Owner manages users/security. English is initially default, unprefixed URLs; other enabled locales are prefixed. Missing translations fall back to default with authoring warnings. Initial Home/Menu/About/Contact are drafts. No fabricated business facts. Automatic menu signage hides unavailable items; website labels them. Public media uses immutable CDN URLs; private staging uploads are validated before promotion.

## Migration safety

Never reset data or edit applied migrations. Inspect history/schema and take a verified backup. For an installation awaiting templates_v2, archive old media, apply a reviewed lossless equivalent with template-key backfill and reconcile migration history only after verification. New schema migrations are additive: introduce Site, backfill existing records/users, validate relationship/count invariants, then enforce constraints. Existing signage remains published. Seed runs must preserve edits and never create known credentials. Unknown database drift stops deployment.

## Delivery sequence and gates

0. Stabilize: fix build/types/lint, patched compatible framework, central Prisma, independent API authorization, input/media/HTML safety, transactional playlists, tests.
1. Restaurant core: additive ownership migration, memberships, profile/locations/schedules/branding and onboarding.
2. Admin redesign: shadcn/Tailwind primitives, responsive shell, dashboard, shared form/table/dialog/feedback/unsaved-change patterns, migrate signage screens.
3. Media: direct S3 staging, validate/finalize, library/picker, metadata, reference guards, derivatives/CDN.
4. Menu: categories/items/variants/tags/allergens, decimal pricing, publishing/availability, sorting/translations.
5. Pages: relational pages/sections, registry, Tiptap, draft/revision/publication/preview, actions/navigation/footer/integrations.
6. Localization: locale editor, dictionaries, translation dialogs/status/fallback/RTL/slugs.
7. Public theme: mobile SSR website and menu, shared branding/contact/hours/actions.
8. SEO/performance: metadata/sitemap/robots/JSON-LD/redirects, cached services and publication invalidation, measured mobile performance.
9. Signage: canonical renderer everywhere, menu bindings, update detection/media refresh/resilient polling.
10. Hardening: integration/E2E/security/accessibility/performance/backup/deployment checks and operator docs.

Each gate requires relevant lint/type/unit/integration checks and signage regression coverage. Staging smoke tests require real Postgres/S3/Vercel configuration. Do not report unrun checks as passing.

## Validation matrix

Unit: permissions, field/section validation, safe URLs, price/slug/translation/SEO/hours. Integration: legacy migrations, site boundaries and nested references, publication isolation, concurrency/audits, media verification/deletion, cache invalidation and signage versions. Playwright: onboarding/menu/page/media/translations/ordering/signage and unauthorized operations; mobile/keyboard/accessibility; non-JavaScript HTML/metadata; production Lighthouse. Test databases and object storage must be isolated from production.

## Progress

Implementation and local validation completed on 23 October 2026. Deployment and infrastructure acceptance remain separate release gates.

### Implemented modules

- Central Prisma lifecycle, server authorization and site ownership, Owner/Admin/Editor permissions, session revocation, login throttling, explicit Owner setup, safe mutation origins and production-secret checks.
- Site/profile/branding, locations, weekly and exceptional schedules, currency/time-zone conventions, audit records and optimistic concurrency.
- Responsive administrative shell, operational dashboard, reusable forms/tables/dialogs, translation editors, keyboard-accessible sorting, media selectors and contextual save/publish feedback. Existing signage routes remain available.
- Managed media records, paginated searchable library/picker, private upload intents, image-content verification and derivative generation, immutable public delivery URLs and reference-aware archival/deletion.
- Categories/items/variants, accurate decimal prices, galleries, tags/allergens, visibility, availability, featured state and fast price/availability editing.
- Pages, eleven registered section types, Tiptap rich text, draft previews, per-language publication snapshots, revision restoration, duplication/archival, navigation, reusable actions and external ordering integrations.
- Configurable locales, manual translations and interface dictionaries, default-language fallback, RTL, localized routes and publication-aware language alternates.
- Server-rendered public theme/menu, shared restaurant data, responsive navigation, branding tokens, metadata, sitemap/robots, factual Restaurant JSON-LD, redirects, tagged caches and mutation invalidation.
- Canonical signage rendering, preserved manual banners, published banner/playlist snapshots, menu bindings, shared price/availability updates, update-aware ETags and resilient player polling.

### Database and dependency changes

Five additive migrations follow the unchanged historical migration files: restaurant core, page routes, signage publication, membership access and content invariants. They backfill existing signage/users to the initial Site, preserve identifiers/order and enforce scoped uniqueness. The separately documented legacy repair preserves old media in an archived schema before reconciling the unsafe historical migration. No production database has been changed.

The existing Next.js/React/Prisma/NextAuth/Tailwind architecture is retained with compatible security updates. New capabilities use Radix/shadcn-compatible owned UI primitives, Lucide, React Hook Form, TanStack Table, dnd-kit, Tiptap, Sharp and allowlist HTML sanitization. Vitest, Playwright and axe provide verification. See `package.json`/lockfile for exact versions and `security.md` for overrides and advisory decisions.

### Verified locally

- Production build, TypeScript and ESLint pass on Node 22.23.4.
- 43 unit/database integration tests pass, covering content/URL/image validation, permissions/site boundaries, publication isolation, revisions/concurrency, decimal prices, environment checks and local schedules.
- Eight production-mode Chromium workflows pass: protected endpoints/origins; staff menu/image publishing; page draft/preview/publication and server metadata; restricted-role rejection; Bulgarian HTML/metadata and shared menu/signage updates; responsive accessibility; ordering-provider disabling; mobile-admin focus management.
- Empty-database migration chain and populated legacy repair/backfill were rehearsed against isolated PostgreSQL 17 databases. Original IDs, archived media, ordering and published signage were verified. A complete custom-format database dump was restored into a third isolated database and the same invariants passed.
- Approved npm runtime dependency audit reports zero advisories. Five high development-only advisory entries remain in the ESLint glob dependency chain; see `security.md`.
- Mobile Lighthouse against the production fixture Menu page: performance 99, accessibility 100, best practices 100, SEO 92; FCP 0.8 s, LCP 1.6 s, total blocking time 130 ms, CLS 0. The fixture lacks a configured menu description; actual SEO fields and translated metadata are separately browser-tested. Reports are generated under ignored `test-artifacts/`. These local measurements do not predict production-network performance.

### Remaining release gates

Real S3/IAM/CORS/CDN uploads, Vercel deployment, production-domain/secrets/connection limits, cloud backup recovery and real-TV playback have not been exercised. Supply approved restaurant imagery, facts, menu prices and ordering URLs, configure the site and publish reviewed pages/translations. Complete manual assistive-technology checks and performance checks against that content. CI configuration is included but has not been run on GitHub in this session. Follow `operations.md`; do not treat isolated local results as evidence that cloud deployment has succeeded.

## Modal AI assistant extension — 23 October 2026

Added the official OpenAI SDK with `gpt-6-luna` as the only model, server-only configuration, structured output and per-editor scope adapters. Content/settings, translation, media-text and signage editors now provide private persistent chat, editable Q&A tables, automatic unsaved form filling, conflict protection and Undo. The assistant generates text/controlled settings; normal employee Save/Publish and image selection remain explicit. Missing facts are requested rather than invented. Locale assistance receives the exact public dictionary keys and preserves unrelated overrides.

A sixth additive application migration, `20261023075000_modal_ai`, introduces conversations, structured messages and request/usage records. It was applied successfully only to the isolated test database. Requests enforce current editing permission, employee/site/record boundaries, origins, locale/reference restrictions and PostgreSQL-backed usage/concurrency limits. Chat clearing removes content without resetting quotas. Rich-text editors now synchronize externally generated values without emitting another form update.

Validation: 62 unit/database integration tests and 11 production Chromium scenarios pass, including mocked SDK/model contract tests and assistant Q&A, multilingual sections/SEO filling, Undo/history, mobile failure handling and existing rich-text refresh. Production build, TypeScript, ESLint and runtime dependency audit pass; the runtime audit remains at zero advisories. Existing CMS/signage regression scenarios remain included. Browser AI responses and server model calls are mocked in automated tests; local configuration has no OpenAI API key, so real model availability, latency and writing quality have not been validated. Run the documented opt-in live smoke check after provisioning a key. See `ai-assistant.md` for operation, privacy, quota and retention details.

## AI draft validation follow-up

Changed AI delivery from all-or-nothing publishing validation to independent, editable draft fields. The model now receives the complete form schema, current validation failures, protected workflow values and explicit structured-section/wire examples. Incomplete names, overlong copy, invalid slugs and price formatting reach the form with warnings so staff can correct them. Normal Save/Publish validation is unchanged. Unsafe content, unauthorized references/locales and protected changes remain excluded; their generated text is retained in copyable chat drafts while other useful fields are applied.

Added `jsonrepair` 3.15.0 only in the server delivery adapter after live gpt-6-luna checks reproduced malformed JSON inside the string-encoded sections field. Common wrapped/double-encoded values and repairable syntax are recovered, then undergo the existing scope/safety checks. Repaired formatting is flagged for completeness review. A separate image-reference check also incorrectly treated a standalone Image section's text as an image definition; that check now distinguishes actual template image-field definitions.

Verification: 73 unit/database tests, 12 production-mode browser scenarios, TypeScript, ESLint and the runtime dependency audit pass (zero runtime advisories). The new browser scenario confirms invalid generated text reaches the form, is blocked from saving until corrected, and then saves successfully. A live synthetic English/Bulgarian About-page check delivered both translations and sections with no rejected fields and one formatting-recovery warning, without changing restaurant records. Production build completed and exited normally under a diagnostic debugger rerun; preceding local builds encountered intermittent native SIGSEGV failures during generation/tracing. No type/lint/build validation was disabled. Recheck native runtime stability on the deployment environment if this recurs.

## Reference public theme — October 2026

Implemented the approved menu-first design using the existing public routes, services, content and branding. The compact header, self-hosted Montserrat, neutral palette, square food photographs, responsive four/two-column catalog, sticky category navigation, searchable dishes, accessible details dialogs and grouped footer follow the supplied reference. Saved homepage sections remain below the structured menu, including in draft previews. The plus opens dish details; no cart or customer checkout was introduced.

Added a registered Locations section and separate draft Locations page with shared restaurant addresses, selectable locations and an optional Google Maps view. Missing credentials or map failures preserve the server-rendered addresses and directions links. Existing Contact pages remain separate. New public labels use the existing translation dictionary, and Montserrat and the information footer group are exposed through normal CMS controls.

The additive `20261023080000_reference_theme` migration changes defaults only. The audited, repeat-safe `theme:reference` command applies the requested palette without replacing identity, images, page content or publication states. It creates missing draft Locations/navigation setup. The normal seed preserves customized branding. This migration and preset were applied successfully to the configured local restaurant database; missing Home/Contact starters were restored as drafts through the existing seed. At that inspection the restaurant had no published menu dishes: staff still need to enter/review content and publish Home, Menu and Locations. This supersedes earlier historical statements that no configured database had been changed.

Dependencies added for the theme are Fontsource Montserrat, Google's official Maps JavaScript loader and development-only Google Maps types. Map URLs are validated on the server, public menu payloads contain only displayed fields, and cached currency formatters avoid repeated expensive initialization. The public initial bundle fell from 153 kB to 126 kB.

Validation: 78 unit/database tests pass, plus TypeScript, ESLint and the production build. Sixteen production-mode Chromium scenarios passed with isolated map configuration and an intercepted Maps SDK; fifteen applicable scenarios also passed against the final bundle without map credentials. This includes existing CMS/AI/signage regression coverage. Local mobile Lighthouse scored performance 91, accessibility 100, best practices 100 and SEO 100 (FCP 1.1 s, LCP 2.4 s, TBT 320 ms, CLS 0.001). Runtime dependency audit remained at zero advisories. Measurements and screenshots use isolated synthetic content, not restaurant production records.

Native multi-worker compiler failures on this host were resolved for successful builds with `RAYON_NUM_THREADS=1`, retaining all normal build checks; CI now sets this value. Google Maps key, map ID, billing and domain restrictions are not configured for the restaurant, so actual Google tile delivery remains a staging check. Cloud deployment, real storage delivery and the other infrastructure release gates above remain outstanding. See `public-theme.md` for installation, CMS controls and configuration.

Continuation verification on 26 October: restored an isolated Node 22 runtime and PostgreSQL 17 database after temporary session files were cleared. All nine migrations applied to the empty test database; the production build, type check, lint, 78 tests and all 16 production-mode Chrome workflows passed again. The map-failure scenario now also checks location accessibility, and a separate scan reported no location-layout violations. Corrected the CLI instructions to account for Next.js's persistent five-minute data cache; normal CMS invalidation is unchanged. No restaurant business records were changed during this continuation.

## Central AI Website Builder — 26 October 2026

Added a separate cross-resource builder while preserving existing modal assistants. The builder stages related content in private workspaces, runs durable Luna function-tool jobs through a PostgreSQL queue, projects complete site/signage previews, provides existing structured CMS editors for review, and applies the accepted batch through shared transaction-compatible domain services. Signage remains opt-in. Existing records and unrelated translations are reused/preserved; user/security/infrastructure operations are not agent tools.

Migration `20261026090000_ai_website_builder` adds AiWorkspace, AiOperation, AiRun and AiToolEvent, with existing private conversation/message storage reused through a workspace relationship. There is no reset or content backfill. Prisma relations, leases, request allowances, cumulative budgets, cancellation fencing and tool-event deduplication support recovery. The existing tsx dependency moved to runtime dependencies for the persistent worker; no queue service or agent framework was added.

Preview routes use real public components, proposed reference graphs and canonical signage rendering, without saving live CMS records. Only the same origin may embed the private preview, and all previews remain authenticated/noindex/uncached. Acceptance locks the site/workspace, rechecks permissions and baseline fingerprints, applies records in dependency order, publishes translations/signage, stores a receipt and audits, then refreshes public caches. Default-language changes occur after prerequisite translations publish. A failed cache refresh can be retried without duplicating a committed batch.

Known deployment requirement: run `npm run ai:worker` under persistent supervision, separately hosted when the web app uses Vercel. The worker's database/generated client/site/OpenAI environment must match the web app. See `ai-website-builder.md` for staff workflow, endpoints, operator budgets, privacy and recovery.

Live verification used synthetic data only: the SDK accepted the complete tool catalogue and Luna requested get_schema (5,571 input/18 output tokens). A bounded real worker run then staged one English/Bulgarian category in five tool steps (31,404 input/438 output tokens), finished READY with zero validation errors, and created zero live category rows. Its temporary synthetic site and private job data were removed. Automated tests use a fake provider worker; actual restaurant content is never generated or published by the tests.

Final validation: 96 unit/database integration tests pass, including batch rollback, idempotent publication/cache recovery, scoped references, default-language switching, opt-in signage publication, job recovery/cancellation and mutation-time role revocation. All 18 production-mode Chromium workflows passed with mocked Maps/provider configuration; the two central-builder workflows passed again against the final build using real configured public settings. The production build, TypeScript, ESLint, Prisma validation and runtime dependency audit pass (zero runtime advisories). Desktop/mobile builder previews were captured with synthetic fixtures and mobile overflow was absent. The additive migration was then applied to the configured local restaurant database without changing restaurant business records or publishing content. Test services were stopped and their persistent Next.js data cache cleared.

The host's recurring native compiler/cache failures required clean generated build artifacts, Node 22, `RAYON_NUM_THREADS=1` and a 4096 MB heap for successful clean builds. Normal checks/minification remain enabled, and CI uses matching worker/heap settings. Production worker supervision and cloud deployment remain operator release tasks; the local worker can run with `npm run ai:worker`.

## Generation budget and resume follow-up

Raised central builder defaults by 50× to 3,200 model calls, 50 million input tokens and 6.4 million output tokens per explicit continuation. Added non-destructive `20261026120000_ai_run_resume_budget` columns recording continuation baselines while preserving cumulative usage. Resume now grants a fresh allowance to existing failed/cancelled runs, preserves the same checkpoint and proposed records, and reauthorizes under the employee's current session and permissions. Long completed tool transcripts compact into an application checkpoint using persisted proposals and employee knowledge instead of requiring a new instruction. Updated legacy budget-error wording and operator configuration/docs.

Verification: 102 unit/database tests, TypeScript, ESLint and the production build pass. Three production browser scenarios pass, including resuming a legacy budget-stopped job with its original staged record and cumulative counters preserved. The additive migration was applied to the configured database; existing proposals/checkpoints were not reset or automatically requeued. Test services/cache were cleaned and the local worker restarted with the higher defaults.


## Resume reliability and bulk proposal review follow-up

Investigated the configured local job history and host processes: an older worker and an updated worker were sharing checkpoints. The old process still applied its original lifetime token policy between steps. Both were stopped gracefully and replaced with one current development watcher. Worker startup now logs a policy marker, process ID and effective continuation limits; the workspace API exposes non-sensitive continuation usage/limits and the UI explains mismatched worker settings. Added `ai:worker:dev` with source/environment reloads and documented coordinated production worker restarts.

Separated factual review requirements from structural/security errors using an explicit issue code. Employees can review proposed prices, restaurant settings and dietary/allergen assignments together before confirming the exact revision for atomic publication. Confirmation is recorded in the receipt/audit and never bypasses schemas, scoped references, permissions or concurrent-edit protection. Active generation can be paused for review/publication without discarding staged content. Existing saved operations automatically receive the new issue classification; no migration or data reset was required. Read-only checks of the existing 89-record proposal found zero structural errors and 62 factual review issues at the time of inspection. No restaurant content was published by this maintenance work.

Validation: 104 unit/database tests pass, including new explicit-confirmation, receipt/audit and invalid-field/foreign-reference rejection cases. Four production Chromium scenarios pass: connected bilingual site/editing/publication, unauthenticated access rejection, legacy budget resume with preserved records/counters, and bulk factual review/publication. TypeScript, ESLint and the production build pass. The build and browser server used an isolated source copy/test database so the running development server was not disturbed. Browser tests use a fake provider; real restaurant content still requires employee review and acceptance.

## Server-rendered dish pages

Reused the existing MenuItem, ItemTranslation, MenuVariant, media, action and tag models to introduce locale-aware `/dishes/{slug}` pages in the current public App Router resolver. Published, site-scoped content is loaded through the existing tagged server cache. Dedicated Server Components render descriptions/paragraphs, photographs/gallery, category breadcrumbs, accurate prices/portions, availability, confirmed dietary/allergen labels, configured ordering actions and related available dishes. Menu cards and highlights now use real links instead of a dish modal; the shared card renderer also serves related dishes. Removed unused modal-only fields from client menu DTOs. Existing menu/signage data remains the single source of truth.

Added translated metadata, canonical/language alternate URLs, OpenGraph/Twitter data, MenuItem offers and breadcrumb JSON-LD, sitemap entries, and transactional redirects on item slug changes. Draft/archived items and disabled categories remain unavailable publicly. Private assistant previews reuse the dish renderer with authentication/noindex protection and no public structured data. The CMS's existing detailed description and SEO fields drive these pages; the description editor now has a clearer label and more writing space. No migration, dependency or restaurant data rewrite was needed.

Verification: 108 unit/database tests pass; TypeScript, ESLint and the production build pass. Nine production Chromium workflows pass across catalog, maps and assistant management, including new SSR HTML/translated SEO checks, non-JavaScript dish content, mobile overflow, unpublishing, disabled category handling and 308 slug redirects. An additional focused browser run verified proposed dish links in private previews and 404 on the public URL before acceptance. Browser/Maps/provider checks used synthetic fixtures and an isolated production build/database. No live restaurant content was edited or published for these tests. See `docs/dish-pages.md` for staff and developer guidance.

## Menu-page sidebar follow-up

Added a Menu-only sidebar layout to the shared public menu renderer. Desktop uses a sticky, keyboard-accessible category list with active scroll tracking, the CMS page title and a search control; the dishes occupy a responsive two/three-column content area. Category titles, descriptions and a divider sit above their products. Mobile retains the title and existing horizontal touch category navigation. The homepage catalog remains four columns with horizontal navigation. Public and private Menu routes select the same layout and preserve hero/content heading semantics.

Inspection of the configured public Menu page found an additional MENU_HIGHLIGHTS section duplicating products above the complete menu. Menu routes now omit those highlights from rendering while preserving their stored configuration and all other intro sections; highlights on other page types are unaffected. No data migration or restaurant content mutation was needed.

Verification: 108 unit/database tests, TypeScript, ESLint and the final production build pass. Ten production Chromium workflows pass, including a new sidebar scenario for sticky positioning, active links, translated category descriptions/dividers, search, mobile navigation, overflow/accessibility and duplicate-catalog prevention. Existing homepage catalog, Maps, SSR dish visibility/redirects, and assistant private preview/publication checks pass. Production/browser tests used a separate source copy and synthetic database; read-only Chrome inspection also confirmed the configured Menu page has one catalog and a sticky sidebar.

## Keyless maps and rich dish content follow-up

Replaced the Google Maps loader with locally bundled Leaflet 1.9.4 and public HTTPS OpenStreetMap tiles. Added Leaflet types, removed Google SDK/types and key requirements from example configuration and CI. Preserved shared locations, selection, directions and server-rendered addresses; added accessible marker buttons, translated zoom controls, lazy tile loading, resize cleanup, attribution and failure handling. Automated checks use real Leaflet with intercepted tiles. Read-only inspection of the running restaurant page loaded 12 real tiles with zero Google Maps requests. Public attribution remains visible and normal browser caching/referrer behavior follows the provider policy.

Added optional `ItemTranslation.detailsDocument` through non-destructive migration `20261026160000_dish_rich_descriptions`. Existing plain descriptions remain intact, and validated rich saves derive a plain-text compatibility copy. Updated the shared menu editor to use Tiptap for detailed descriptions, with clear primary/inline image controls. Server rendering reuses the validated RichText pipeline for headings, emphasis, lists, links and site-owned images, omitting empty description sections. Existing media ownership/reference protection applies inside descriptions. Older clients preserve unchanged rich descriptions when round-tripping plain text.

Updated both assistant instruction paths to generate structured, useful formatted dish writing in the requested languages, preserve supplied facts and explicitly manage confirmed allergen assignments. Imperfect plain-text rich-field output is retained as safe editable paragraphs. Added a dedicated public allergen panel with translated labels, icons and Contains cards, while dietary indicators remain separate. Missing assignments are explicitly unconfirmed and never treated as allergen-free. Read-only inspection found no ALLERGEN assignments on the current 60 published restaurant dishes; no labels or business facts were invented or published by this work.

Verification: 114 unit/database tests and all 18 production Chromium workflows pass. Coverage includes rich-field validation, safe assistant fallback, legacy persistence, media ownership, actual staff editing/publication, semantic SSR formatting, English/Bulgarian allergen labels, accessibility, maps/failure behavior, menu layout, permissions and signage. Desktop/mobile visual inspection of an isolated synthetic rich dish confirmed correct formatting, visible allergen cards and no mobile overflow; the visual fixture was archived and original category visibility restored. TypeScript, ESLint, the production build and runtime dependency audit pass (zero known runtime advisories). The additive migration was applied successfully to isolated and configured local databases, Prisma was regenerated and the local app refreshed; existing CMS records and proposals were preserved. Production deployment requires the same migration/client regeneration and coordinated web/worker restart. See `docs/dish-pages.md` and `docs/public-theme.md`.
