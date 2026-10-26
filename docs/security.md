# Security validation notes

The implementation retains Next.js 15 and Prisma 6, independently checks server sessions/memberships/permissions, validates scoped references, enforces mutation origins, hashes passwords with bcrypt, revokes changed sessions, throttles credentials through PostgreSQL, and rejects the former public seed password. Initial Owner provisioning is explicit and passwords are never written to logs. No production database or bucket has been modified during local validation.

Rich text is an allowlisted structured document rendered through React. Legacy signage HTML is sanitized on save and delivery. Image uploads enter private S3 staging and are decoded, bounded, re-encoded and promoted before use. Public media has stable URLs; private legacy delivery retains signed access. Draft/public snapshots and version checks protect live content from partial or concurrent edits. Referenced media and published playlist banner references are protected from deletion.

## Dependency decisions — 23 October 2026

The user approved npm's dependency-metadata security check. Compatible updates include Next.js 15.5.28, React 19.1.7, NextAuth 4.24.15, Prisma/client 6.19.3, sanitize-html 2.18.1 and Vitest 4.1.12. The sanitizer requires Node >=22.12.0; `.nvmrc` and CI target Node 22. Validation uses Node 22.23.4.

Two scoped overrides avoid unrelated framework major migrations:

- PostCSS 8.5.31 replaces affected PostCSS 8 releases while retaining the same major API. CSS compilation and the production build are checked.
- Prisma's configuration loader uses deepmerge-ts 8.0.2 instead of affected 7.x. The loader uses its exported `deepmerge` function. Prisma generation, validation, migration status and database-backed tests are checked with Prisma 6.

`npm audit --omit=dev` reports **zero advisories** after these fixes. The full dependency audit still reports five high-severity entries in one development-only chain: eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. The underlying [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects the available 3.0.3 release. These packages run trusted repository lint configuration, not visitor requests. Do not accept untrusted root-directory glob configuration. Keep this chain under review; do not downgrade the framework or suppress audit output to manufacture a clean full audit.

CI checks the production dependency audit. It does not claim that the development advisory chain has been fixed. Runtime audits are point-in-time package metadata checks, not proof of application security.

## Release gates outside local verification

- Configure real S3 IAM, private staging, lifecycle/CORS, public CDN delivery and validate real uploads.
- Review deployment secrets, HTTPS/domain configuration, Vercel behavior and production connection limits.
- Perform an operator backup/restore drill, production content review and real-TV playback test.
- Review manual keyboard/screen-reader behavior and production mobile performance with approved restaurant content.

Automated test and browser results are recorded in `implementation-plan.md`. Local fixtures intentionally use isolated test accounts and a local photograph; they do not establish cloud integration success.

## Modal AI boundaries

AI generation uses the official OpenAI SDK, server-only credentials and the single fixed model `gpt-6-luna`. Responses cannot execute tools, save/publish content, alter users or select media. Every conversation and request checks the target's editing permission and employee/site/record ownership; mutation origins and database-backed quotas apply independently of middleware. Generated patches pass field, locale, URL/content, image-preservation and catalogue-reference validation before filling a form. Final saves still use existing services and concurrency checks. Chats are private per employee; clearing history also clears retry payloads while retaining quota statistics. Provider-side storage is disabled with `store: false`; provider processing policies still apply. Automated tests mock AI calls. A separate live gpt-6-luna check with synthetic bilingual page content has verified draft recovery without changing restaurant data. Required-field, length and business-format constraints are advisory when filling unsaved AI drafts and remain mandatory in normal Save/Publish services. Unsafe or out-of-scope fields are kept out of the form while other useful fields are delivered.
