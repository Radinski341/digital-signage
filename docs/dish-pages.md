# Dish pages

Every published menu item in an enabled category automatically has a public page at `/dishes/{slug}`, or `/{locale}/dishes/{slug}` for an enabled additional language. No page-builder duplication, new table or migration is needed. Menu cards and menu-highlight sections link to these pages; public dish dialogs have been removed. The existing catch-all App Router route resolves dish URLs from cached, site-scoped published content and renders a Server Component.

## Staff workflow

Edit the dish under **Restaurant → Menu**. Maintain its name, short description, **Detailed dish description**, SEO title and meta description for each language. The detailed description now uses the shared rich-text editor: headings, bold/italic/underline, paragraphs, lists, links and Media Library images. Structured Tiptap JSON is validated and rendered safely on the server. Existing plain descriptions remain supported, and a plain-text counterpart is maintained for older integrations. Write useful descriptions about confirmed preparation, ingredients, flavor and portions; do not guess ingredients or allergen guarantees. Website Assistant can prepare these fields using your supplied facts, then preview the dish inside its private website proposal before acceptance.

Set a primary photograph and optional additional photographs/captions in the existing media library. Configure accurate portion/variant prices, availability and dietary/allergen assignments. An item-specific action takes precedence over a general configured ordering provider. Unavailable dishes stay accessible with an availability notice and no ordering action. Draft/archived dishes and dishes in disabled categories return 404 and are excluded from public content and sitemap entries.

The page displays breadcrumbs to the current published menu/category, a photograph/gallery, translated descriptions, portion prices, confirmed dietary/allergen labels and a general invitation to contact the restaurant about allergies. Related dishes prioritize available items in the same category, then shared labels and featured items. They use the same menu data and card presentation as the catalog. No prices, ratings, nutrition or business facts are invented.

## Rendering and SEO

The response contains dish content and related links without requiring JavaScript. Metadata includes the configured translated title/description with content defaults, canonical URL, enabled translated language alternates, OpenGraph and Twitter sharing data. Missing translations use the established content fallback and canonicalize to the displayed translation's locale. The sitemap lists only enabled, explicitly translated published dishes. JSON-LD describes the factual MenuItem, its offers/availability and breadcrumbs; it never fabricates reviews or dietary guarantees.

Changing a dish slug through the CMS or an accepted assistant proposal creates permanent redirects for enabled locales using the existing Redirect entity. Existing site cache invalidation refreshes menu cards, dish pages, related content and sitemap after saves/publication. Prices remain Decimal strings until presentation. Private assistant previews reuse the same renderer with scoped projected content, remain authenticated/noindex, and do not emit public structured data.

## Verification

Unit coverage verifies paths, enabled translation alternates, metadata fallback, related-item selection and factual structured data. Production browser checks exercise card-to-page navigation, keyboard/accessibility behavior, paragraph rendering, variant/order controls, translated metadata, sitemap entries, non-JavaScript rendering, mobile overflow, draft/category visibility and permanent redirects. Existing assistant generation, review and publication tests continue to protect private proposals and publication behavior. No external ordering or payment API is called.


## Rich description upgrade and allergen presentation

Apply additive migration `20261026160000_dish_rich_descriptions`, regenerate Prisma and restart web/worker processes together when deploying. The optional `ItemTranslation.detailsDocument` JSON column preserves existing plain `details`; no backfill or reset is required. Editor saves derive a plain-text counterpart from the validated document. Older clients preserve the existing document when round-tripping unchanged plain text and can deliberately replace it by changing the plain description. Inline images use the existing site-scoped media-reference and safe-deletion rules.

Website Assistant and per-editor assistants are instructed to write useful formatted dish stories, with short paragraphs, level-three headings, restrained emphasis and concise lists, in the requested languages. They must use confirmed facts. Ordinary text returned in place of a rich document is safely retained as editable paragraphs. Unsupported nodes and unsafe links remain blocked.

Allergens use the existing structured ALLERGEN tags assigned to each dish. The published page renders a dedicated panel with icons, translated names and explicit Contains labels. Dietary labels remain separate. With no confirmed assignments, the panel states that the information is unconfirmed; absence of tags is never presented as an allergen-free guarantee. Staff can select confirmed labels under Menu → dish → Dietary indicators & allergens, or provide the confirmed information to the assistant. A generic contact note supplements declared allergens rather than replacing the list.
