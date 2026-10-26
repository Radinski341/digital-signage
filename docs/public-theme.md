# Public catalog theme

The public layout follows the approved Kamolonosh screenshots: white surfaces, dark text and controls, self-hosted Montserrat, a compact header, underlined category navigation, square food photographs, centered category headings and grouped footer links. Restaurant identity and facts remain database content; the reference site's assets and business information are not copied.

## Installation and safe updates

Use Node 22.12 or newer and the committed lockfile. Run `npm ci`, `npm run db:generate`, then `npm run db:deploy`. Migration `20261023080000_reference_theme` changes branding defaults for future records only; it does not rewrite existing branding or restaurant data.

Run `npm run theme:reference` to apply the user-selected neutral palette to the configured site. Set `SITE_ID` when more than one restaurant exists. The operation locks the selected site, preserves logos and media, and records previous/new branding values in AuditLog. It is repeat-safe. To restore previous colors/fonts/radius, use the recorded `branding.reference_preset` values in Settings → Branding. A CLI update takes effect as public caches expire (up to five minutes, followed by refresh); a server restart alone does not clear Next.js's persistent data cache. Normal CMS saves invalidate public content immediately.

The preset adds an unpublished Locations page with a collision-safe slug, preserves existing pages, and appends its page reference to navigation. It also creates missing header/footer containers. Empty header/company menus receive references to existing system pages; unpublished destinations remain hidden. The normal seed creates missing Locations/navigation setup while preserving custom branding.

Published Home pages now show the structured menu first and their saved sections below it. Those sections are neither deleted nor republished by the theme operation. The separate Menu route remains supported. Draft previews use the same ordering and presentation. Review the new Locations draft, translate it as needed and publish it through the CMS.

## CMS controls

- Branding retains color and radius controls, with Montserrat, system and serif font choices. Existing alternate fonts remain valid. Montserrat is bundled from Fontsource with Latin/Cyrillic coverage and an included license; no runtime Google Fonts request is needed.
- Website → Navigation: `header` controls primary links; `footer` contains company links; `footer-info` contains information links. Empty footer groups are omitted. Logos, phone, social links, hours and summary come from existing restaurant settings.
- Menu cards read existing item photographs, prices, names and availability. The circular arrow and dish title open server-rendered dish pages with variants, dietary/allergen information and the configured ordering action. They do not add items to an internal cart. Missing photographs use a deliberate placeholder; no weights, prices or photographs are invented.
- Add the registered **Locations and map** section to any page. Choose all locations or a single existing location. Addresses and coordinates remain shared restaurant records, with normal site-reference validation. The AI assistant discovers the new section through the same registry and schemas.
- New public control labels are translation dictionary entries. Category names, dishes, pages and navigation continue using existing manual translations and fallback behavior.

## OpenStreetMap and Leaflet

Location maps use bundled Leaflet 1.9.4 with the public OpenStreetMap standard raster tiles. No Google project, map ID, API key, account or billing configuration is required. Existing Google map environment values are ignored and can be removed. The Google SDK and types have been removed from dependencies and CI.

Enter each location's latitude and longitude in the CMS. Null/out-of-range coordinates are excluded from markers; no geocoding service is called. The map initially fits configured points, and selecting a location or marker keeps the list and map synchronized. Keyboard-accessible labeled markers, translated zoom controls, touch panning/zooming, resize handling and reduced-motion selection are supported. Map code and visible tiles load near the viewport; no map library is imported by pages without the Locations section. Wheel zoom is disabled so the map does not intercept page scrolling. Missing coordinates and tile-delivery failures leave server-rendered addresses and configured directions links available.

The map shows visible OpenStreetMap attribution. Tiles use the HTTPS standard URL, normal browser caching and the existing `strict-origin-when-cross-origin` referrer policy. There is no proxy, bulk download, offline prefetch or tile-cache bypass. Follow the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/); public tile service is best-effort. Deployments needing dedicated tile capacity can switch the tile layer/provider with its matching attribution. Browser map requests disclose the visitor’s network address and website origin to the tile service; location selection does not request the visitor’s geolocation.

## Verification

Browser fixtures use repository food imagery and synthetic restaurant records. Browser tests exercise the actual locally bundled Leaflet library and intercept only OpenStreetMap tile responses; tile failure is tested separately. No map credentials are configured in builds or CI. Selection, attribution, controls, server-rendered addresses, accessibility and fallback behavior are checked without third-party requests. Real tile delivery is also checked locally where network access permits.

Responsive screenshots are written to ignored `test-artifacts/` by the catalog browser suite. Public accessibility, keyboard focus, server-rendered dish pages, search, category grids, homepage ordering, server-rendered addresses and map failure states are verified alongside the existing CMS/signage regression tests.

The measured local catalog build scored Lighthouse 91 performance, 100 accessibility, 100 best practices and 100 SEO with synthetic published menu content. Its initial public JavaScript bundle is 126 kB. These measurements describe the local test fixture, not the live restaurant's content or network.

On this development host, the native compiler intermittently failed with multiple worker threads. `RAYON_NUM_THREADS=1 npm run build` completed with normal type checking, linting and minification enabled; CI uses the same worker limit. Use the supported Node 22 runtime rather than the host's older system Node.

Dish cards now link to [dedicated SSR dish pages](dish-pages.md), replacing the original modal interaction. Category navigation hides native scrollbars and provides gradient hover/focus arrows on desktop when content overflows; touch scrolling remains available on mobile.


## Menu-page category sidebar

The Menu system page uses a sticky category sidebar on screens at least 1024px wide. The selected category is highlighted as visitors scroll or follow category anchors; translated category titles, descriptions and a divider appear above the dishes. The available content width uses two or three dish columns. Sidebar search uses the same menu search state. On smaller screens, the menu title stays visible and the existing swipeable category navigation is used. The homepage keeps its horizontal category catalog and four-column desktop grid.

The CMS Menu title, category ordering, labels and descriptions remain the content source. Optional Menu intro sections are retained. On the Menu system page only, MENU_HIGHLIGHTS sections are omitted from rendering so they cannot duplicate products before the complete structured menu. Their saved configuration is preserved and highlights continue to render on other page types. Private assistant previews use the same layout and guard.
