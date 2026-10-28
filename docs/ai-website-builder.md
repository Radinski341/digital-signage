# Website Assistant

Open **Website Assistant** in the admin sidebar. This complements the existing per-editor assistants. It manages the single existing website: each request proposes content or settings updates, rather than creating another site. It reads the site's CMS, proposes related content across resources, and lets an employee review the entire result before **Accept and publish all**.

## Configure and run

Use the supported Node 22 runtime and committed lockfile. Apply the additive migration `20261026090000_ai_website_builder` with `npm run db:deploy` after generating Prisma. It creates private proposal/job tables without changing restaurant records, existing conversations, or publication state.

The builder runs inside the Next.js application, including on Vercel. Configure the database, generated Prisma client, site settings and server-only `OPENAI_API_KEY` on the web deployment. Enable Vercel Fluid compute: the action route declares a 300-second maximum duration, and each request processes only one saved model/tool round (the model call has a 90-second timeout).

Keep the Website Assistant page open during generation. It sends authenticated `POST /api/ai/workspaces/[id]/step` requests sequentially and refreshes progress between rounds. Closing the page stops further requests; reopen and select the proposal to continue from its saved checkpoint. An in-flight request may finish after the page closes. A terminated request becomes reclaimable when its two-minute lease expires. Multiple tabs are protected by PostgreSQL leases and existing tool checkpoints. No separate worker service, cron configuration or additional runtime is required. Existing queued proposals are picked up when opened.

The optional `npm run ai:worker` / `npm run ai:worker:dev` commands remain available for installations that deliberately want continuous processing independent of the browser. They are unnecessary for the Vercel setup. Keep all processors on the same release and budget settings.

All calls use the existing official OpenAI SDK, Responses API, `gpt-6-luna`, and `store: false`. There is no additional agent framework, queue service, fallback model, stock-image search or image generation. The worker may send selected public CDN thumbnails to Luna for visual matching; image inspection never establishes ingredients or allergen guarantees. Restrict public media to the configured trusted CDN and provide accurate captions and approved photography.

Existing `AI_USER_HOURLY_LIMIT` and `AI_SITE_DAILY_LIMIT` allowances count each user-initiated builder instruction once. Internal model steps have limits per explicitly started/resumed continuation (50× the original defaults):

| Variable | Default |
| --- | --- |
| `AI_BUILDER_MAX_CALLS` | 3,200 |
| `AI_BUILDER_MAX_INPUT_TOKENS` | 50,000,000 |
| `AI_BUILDER_MAX_OUTPUT_TOKENS` | 6,400,000 |

Actual provider usage is recorded after responses; failed/interrupted calls may lack usage totals. Limits are not a dollar-spending guarantee. Keep OpenAI project billing alerts. A run reaching a limit preserves its proposal. **Resume run** renews its allowance and continues the same checkpoint; lifetime usage counters remain unchanged. Existing failed and cancelled runs can be resumed, including after signing in again, subject to current permissions. One proposal supports up to 500 content records, staged in batches of up to 20. Long tool transcripts automatically compact into a fresh application checkpoint at completed tool-round boundaries. Staged records, manual edits and employee knowledge remain stored and accessible through paginated tools.

## Employee workflow

1. Select **New update request**, describe the changes you want, and provide confirmed restaurant facts and requested language codes. The default language is included automatically. Include signage explicitly if TVs should change.
2. The worker inspects existing records, reusable assets, form schemas and the section registry. It improves existing content and creates missing content. Missing business facts are collected in grouped questions. Paste menu rows with dish name, price, ingredients and explicitly confirmed dietary/allergen information.
3. Keep the builder page open to advance generation; closing it preserves progress. Reopen the builder to see saved progress, chat and proposed records. Failed jobs can resume; cancellation fences outstanding work from changing the proposal.
4. Review desktop/mobile previews, localized pages, dish details and metadata. Internal links stay inside the private proposal. Signage previews use the existing canonical renderer with projected menu data. Photos can be uploaded through Media Library in another tab, then selected by the agent or in a proposal editor.
5. Use **Review / edit** to correct descriptions, prices, translations, sections or references with the existing CMS controls. Ordinary invalid draft text is retained and flagged rather than discarded. Malformed structured content stays visible for repair. Saving a reviewed record confirms its supplied business facts and protects it from subsequent AI changes; **Allow AI revisions** explicitly removes that protection.
6. Resolve validation and concurrent-edit conflicts. Compare original, current CMS and proposed values before choosing to keep a proposal over current edits. Removing something from a proposal removes only that proposed operation; broken dependent references must be repaired.
7. **Accept and publish all** opens a bulk business-fact review when proposed prices, restaurant details, hours or dietary/allergen assignments have not yet been confirmed. Review the displayed values, correct any errors through the normal proposal editors, and explicitly confirm before publishing. Confirmation applies only to the exact proposal revision and is recorded in the publication receipt/audit. It does not bypass invalid fields, unsafe URLs, missing or foreign references, permissions or edit conflicts. There is no need to open/save every dish just to confirm a reviewed menu. **Pause and review generated content** stops an active run without losing its proposals; resume later or publish valid saved work without further generation.

   **Accept and publish all** saves and publishes the reviewed batch atomically. It publishes selected page translations and dishes, applies settings/navigation/actions, and publishes signage only when explicitly included. No model calls or uploads occur inside the commit transaction. A failure rolls back every record and revision. Retrying the same acceptance returns the same receipt, without duplicates.

The database commit and public cache refresh are separate. If cache refresh fails after a successful commit, the receipt remains marked pending; use **Refresh published content** to retry invalidation without republishing. A network failure can also be retried safely. Published proposals become read-only; create a new proposal for further changes. Existing page revision history and batch audit records remain available. There is no automatic bulk deletion, archiving or unpublication.

## Coverage and boundaries

Tools cover restaurant information, locations/hours, branding, languages/dictionaries, menu categories/dishes/variants, dietary/allergen dictionaries, integrations, actions, pages/sections/SEO, navigation, media text, templates, banners and slides. Internal references share real or server-reserved IDs and resolve only inside the selected site/proposal. Missing facts are never interpreted as allergen-free or used to invent prices. Proposed factual changes require quoted employee-supplied evidence or explicit manual review.

The agent has the initiating employee's role. Editors cannot change branding, language or other protected settings. Permissions, account status and session revocation are checked again throughout generation and at acceptance. User/password/security administration, environment variables, secrets, arbitrary SQL, shell commands and external side effects are not content tools. All proposal/chat/preview endpoints are private to their owner and site. Preview routes are uncached/noindex and permit embedding only from the same origin for the review panel; other routes retain their existing frame protection.

## Interfaces and recovery

- `GET/POST /api/ai/workspaces`: list private proposals or create one.
- `GET /api/ai/workspaces/[id]`: current proposal, recent messages, job progress, validation, conflicts and preview/editor context.
- `POST /api/ai/workspaces/[id]/step`: advance one authorized, leased generation round.
- `POST /api/ai/workspaces/[id]/message`: queue an idempotent instruction, including questionnaire answers.
- `POST /api/ai/workspaces/[id]/stage`: save a reviewed proposal record without changing live CMS data.
- `POST /api/ai/workspaces/[id]/cancel`, `/resume`, `/unlock`, `/remove`, `/rebase`: revision-checked proposal operations.
- `POST /api/ai/workspaces/[id]/accept`: revision-bound, idempotent atomic publication and cache refresh.
- `/preview/site/[workspaceId]/…`: authenticated whole-site preview with optional `banner` or `slide` query selection.

`AiWorkspace` owns a private conversation and staged `AiOperation` records. `AiRun` stores durable continuation/usage, leases and checkpoints. `AiToolEvent` deduplicates tool execution. Worker restarts recover expired leases. Generation writes only proposal tables; employee uploads separately use the existing media pipeline. Acceptance reuses transaction-compatible CMS/signage operations, stores before/after audit linkage, preserves revision history, and applies default-language switches only after required translations are published.

Back up these tables together with existing AI messages/requests and CMS content. They contain briefs, generated copy, previous values, employee answers and encrypted model continuation data. Follow the same restricted database/backups policy as CMS drafts. Do not log payloads, prompts or provider credentials. Operator cleanup may delete abandoned proposals and their conversations according to retention policy; keep publication receipts/audit evidence as required and never remove request counters inside the rolling quota window. Deleting a conversation cascades its private proposal/job data, so review archival policy first.

Automated tests use isolated PostgreSQL, synthetic restaurant data and a fake provider worker, never a live model. An optional billed contract check sends only synthetic text and tool schemas, executes no tools and changes no CMS records:

```sh
AI_BUILDER_SMOKE=1 npm run ai:builder:smoke
```

This verifies model access and SDK tool-schema compatibility, not complete restaurant writing quality. Real content still needs the employee's preview and acceptance, and production worker supervision/storage/deployment need staging verification.

Local verification also exercised a bounded real Luna worker run against a temporary synthetic restaurant: five tool steps produced one English/Bulgarian category, with zero validation errors and zero live category rows. That fixture was removed after the check. This verifies durable SDK/tool continuation and staging; complete restaurant writing, photograph matching, production supervision and cloud deployment still require review in the intended environment.

The local verification build used Node 22 with `RAYON_NUM_THREADS=1` and `NODE_OPTIONS=--max-old-space-size=4096`, matching CI. On this host a stale generated compiler cache caused a native/webpack failure; clean generated `.next` artifacts resolved it without disabling lint, types or minification. Final browser checks used isolated fixtures, and their persistent data cache was cleared before returning to the configured restaurant database.
