# Restaurant CMS & Digital Signage

A reusable Next.js restaurant website, staff CMS, structured menu and TV signage platform. UZBEK BG is the initial database site, not an application-specific rendering branch.

## Start locally

Use Node 22.12 or newer (see `.nvmrc`), npm and PostgreSQL. Patched HTML sanitization requires this runtime. Copy `.env.example` to `.env` and configure both database URLs, `NEXTAUTH_URL` and a random `NEXTAUTH_SECRET`. The direct database URL is used for migrations; use a pool-compatible runtime URL on Vercel.

```sh
npm ci
npm run db:generate
# Read docs/operations.md before migrating an existing database.
npm run db:deploy
npx prisma db seed
# Apply the selected white/Montserrat theme; existing branding changes are audited.
npm run theme:reference
npm run owner:setup
npm run dev
```

The Owner setup prompts for email and a hidden password. There are no default credentials. For private, non-interactive provisioning, the CLI accepts temporary `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD` variables; remove them afterward. Never put passwords in command arguments or commit populated environment files. Accounts using the former public seed password must be reset with the CLI.

Open `/admin/login`. Onboarding is visible on the dashboard. Configure restaurant details, currency/time zone, locations/hours, branding and domain; add menu categories and dishes; configure ordering links and reusable buttons; edit the starter pages and navigation; preview saved drafts, then publish. Initial marketing pages are drafts and contain no invented addresses, prices or business claims.

## Staff workflows

- **Restaurant:** edit shared identity/contact information; manage multiple locations, weekly intervals, overnight service and dated exceptions.
- **Menu:** manage categories, dishes, variants, dietary/allergen labels, photographs and translations. Every published dish has a server-rendered `/dishes/{slug}` page (locale-prefixed for additional languages), with formatted rich descriptions, declared allergen cards, related dishes, ordering links and editable SEO. Price and availability controls update the live menu and dish pages explicitly. Hidden and unavailable are distinct states. See [dish content and SEO](docs/dish-pages.md).
- **Pages:** add/reorder/duplicate/hide predefined sections; use formatted text and managed images; configure translated SEO; save a draft, preview privately, then publish each language. Revisions can be restored to draft. Home/Menu have protected route identities.
- **Media:** upload JPEG/PNG/WebP/AVIF, add alt text/captions, reuse assets, archive old images and inspect references. Referenced assets cannot be deleted. Upload a new image to replace a photograph deliberately in its editors; published revisions keep their original asset.
- **Actions/integrations:** configure external store links (including Wolt), then reuse translated buttons. Disabling a provider removes its dependent public actions.
- **Languages:** add canonical locale codes, dictionary phrases and manual translations. Default-language URLs are unprefixed; other languages use prefixes. Missing entity text falls back to the default language with language markup. Page-language publication is explicit.
- **Signage:** retain templates and dynamic fields; create manual banners or bind them to a menu category/dish; save drafts, preview and publish banners, then playlists. Connected category boards show the first 15 published/available dishes in order. Existing `/banner/[id]` and `/slide/[id]` URLs remain compatible. Players poll every minute and retain the last valid playlist through transient failures.

Owners manage users and security; Admins manage site settings; Editors can manage and publish routine content. Every protected mutation validates the current session, permission and ownership on the server. Membership disabling is site-specific.

## Architecture

- `src/server`: Prisma singleton, access checks, domain services, publication/cache logic, upload processing and public repositories.
- `src/modules`: shared Zod validation, permission/URL/locale helpers and section registry definitions.
- `src/components/{ui,admin,public,sections}`: shared primitives, staff workflows, restaurant presentation and registered section renderers.
- `src/components/templates`: preserved signage layouts rendered consistently in every display context.
- App Router groups separate admin/public presentation. Public HTML and metadata come from server-loaded published revisions; menu search and navigation retain server-rendered initial content.
- PostgreSQL relations hold business data. JSON is limited to validated section/rich-text configurations, immutable snapshots and existing dynamic template values. Currency uses Decimal; schedules use the restaurant IANA time zone.

See [implementation/audit](docs/implementation-plan.md) and [deployment, storage and migration runbook](docs/operations.md).

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Database integration tests require a migrated, isolated database. Browser fixtures refuse database names that do not end in `_test`.

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/restaurant_test npm test
# Use a temporary password from your private shell environment.
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/restaurant_test E2E_PASSWORD="$TEMPORARY_TEST_PASSWORD" npm run test:fixtures
npx playwright install chromium
# Start the app against the same test DB; set NEXTAUTH_URL and E2E_BASE_URL consistently.
E2E_PASSWORD="$TEMPORARY_TEST_PASSWORD" npm run test:e2e
```

Playwright covers staff menu/media selection, private drafts/publication, SSR metadata, permissions, localization/signage bindings and automated accessibility. Real S3/CDN upload and production Vercel behavior require external configuration; local fixtures do not prove those integrations. See the implementation document for the latest recorded results and remaining release checks.

## AI assistant

Set the server-only `OPENAI_API_KEY` and apply migrations to enable the assistant in content and settings editors. Every request uses **gpt-6-luna** through the official OpenAI SDK. Open **AI assistant**, describe your goal and select the content languages. Answer clarification questions in the editable table and send them together. Replies fill the current form automatically, with field warnings for drafts that need correction; review the result and use the normal Save/Preview/Publish controls. Unusable fields remain available as copyable text instead of discarding the reply. Undo preserves newer manual edits.

Chats are private to the employee and remembered per saved record. The assistant generates text and controlled settings, preserving selected images. It cannot manage users/passwords, publish content or create related records. See [AI operation, privacy and limits](docs/ai-assistant.md). `npm run ai:smoke` is an opt-in live API check that incurs a small API request; automated tests use mocked model responses.

## Public catalog theme

The public website follows the approved photo-led reference: a compact header, underlined category navigation, responsive food-card grid, dish details and a four-column footer. Published Home pages show the structured menu before their existing CMS sections. The dedicated Locations page uses the registered Locations and map section and stays draft until staff publish it.

`npm run theme:reference` applies the neutral palette and Montserrat to the configured site, preserves logos/media and records previous branding values in the audit log. It creates missing draft/navigation setup without replacing existing page content. Running the normal seed preserves custom branding. Use Website → Navigation to edit `footer` (company links) and `footer-info` (information links).

Location maps use Leaflet with OpenStreetMap tiles and require no credentials, API keys or billing setup. Set each location’s coordinates in the CMS. Interactive markers and the location list stay synchronized; addresses and directions remain available when map tiles cannot load. See [public theme operations](docs/public-theme.md).

### Website Assistant

The admin **Website Assistant** manages this website through coordinated updates to pages, menus, dietary/allergen labels, translations, SEO, branding, navigation and other restaurant content. Preview and edit the complete result, then **Accept and publish all**. Existing modal assistants remain available. Configure `OPENAI_API_KEY`, apply migrations, and run `npm run ai:worker` as a separate persistent Node process (`npm run ai:worker:dev` during local development for automatic source reloads). Restart every production worker after releases so obsolete limits cannot interrupt resumed runs. Unconfirmed business facts can be reviewed together in the publication dialog; structural validation and permissions remain enforced. A Vercel web deployment requires a separately hosted worker. See [setup, workflow, limits and recovery](docs/ai-website-builder.md).
