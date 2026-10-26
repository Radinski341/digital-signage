# Modal AI assistant

## Configuration and deployment

Install dependencies with `npm ci`, generate Prisma and apply `20261023075000_modal_ai` through `npm run db:deploy`. This additive migration creates `AiConversation`, `AiMessage` and `AiRequest`; it does not modify restaurant content or publication state.

Set `OPENAI_API_KEY` in the server environment. Never use a `NEXT_PUBLIC_` variable or enter keys in restaurant content. The official `openai` SDK calls the Responses API with the fixed model `gpt-6-luna`, structured output and `store: false`. There is no fallback model, model picker, external browsing or image-generation tool. Missing credentials or inaccessible model access produces a useful error while manual editing remains available.

The Node route allows 120 seconds; the SDK timeout is 90 seconds without automatic retries. Ensure hosting supports that duration. Operator limits are `AI_USER_HOURLY_LIMIT` (default 20), `AI_SITE_DAILY_LIMIT` (default 100), and `AI_MAX_OUTPUT_TOKENS` (default 16000, maximum 32000). Hour/day limits use rolling 60-minute/24-hour windows and count attempted requests, including failures, across workers through PostgreSQL. Clearing a chat cannot reset its allowance. Set billing limits/alerts on the OpenAI project independently; request caps are not a monetary spending guarantee.

`npm run ai:smoke` explicitly makes a live, text-only gpt-6-luna call using a generic photograph description and prints only success, field names and token counts. It requires credentials and incurs API usage. The normal automated suite makes no external model calls.

## Employee workflow

Open an editor and expand **AI assistant**. Describe the goal, choose configured content languages and send a message. Examples: “Create a welcoming homepage with an introduction, menu highlights and complete SEO” or “Improve this dish description in English and Bulgarian.”

Missing facts are requested through an editable Question/Your answer table. Fill the fields and select **Send answers**. The application records the submitted questions and answers together as one user Q&A message; previous submissions appear read-only. The assistant must ask for unknown prices, ingredients, allergens, addresses, schedules and business claims. Always review factual and dietary information before saving.

A response fills safely editable draft values and marks the form unsaved, even if copy is too long or required business fields are incomplete. Field-specific warnings explain what to correct before saving. One invalid field no longer discards other generated text. Values that cannot be placed safely in the editor remain in chat as copyable drafts. **Undo these changes** restores fields still matching that response; manual edits made afterward remain intact. Edits made while a request is running are preserved and conflicting fields are reported. Save, preview and publication use the existing CMS services and permissions. Reopening a chat loads its transcript without reapplying older changes.

On desktop the main CMS form and chat sit alongside one another. On smaller screens switch between **Editor** and **AI chat**. The translation dialog narrows AI edits to its selected language and preserves page structure. If an assistant requests a language that is not configured, add it through Languages first.

A page assistant can generate all supported sections within that page. A category assistant cannot create dishes; a dish assistant works on that dish, including variants/translations. Shared menu/profile values remain references in pages and signage. Media assistance writes alt text/captions from descriptions supplied by staff; no photographs are sent to the model. Existing image selections remain unchanged. Activation, publication, image choice, user/security administration and deletion are outside AI editing.

## Privacy, persistence and security

Each saved-record conversation belongs to one user and one site. Other employees cannot read it. A chat for a new record is attached when that record is saved; abandoning an unsaved editor requests deletion of its temporary conversation. A failed network cleanup can leave an unattached conversation for operator cleanup. **Clear chat history** removes messages and retry payloads while preserving token counts/quota records.

The OpenAI request contains bounded recent conversation history, the allowed unsaved form fields and selected restaurant facts/reference labels. It excludes authentication/account records, storage credentials, image bytes and unrelated full records. OpenAI processing/retention remains subject to the API project's policies; `store: false` does not promise zero retention by every provider system. Do not enter secrets in chat or content.

Every endpoint checks server authentication, site/record ownership and the target's editing permission. Mutations enforce the application's origin rules. Generated values are checked against allowed fields, locale restrictions, safe content structure, image preservation and same-site reference catalogues before delivery. Normal form constraints such as required copy, lengths and formatting produce advisory draft warnings; they remain mandatory at Save/Publish. The model receives the full form schema, current validation errors, read-only workflow values and structured-section rules. Saved content still passes normal service validation, concurrency and auditing. Pending turns are serialized per conversation; completed retries with the same key do not trigger another model call. Logs contain request IDs/error types, not prompts or generated text.

## Interfaces and maintenance

- `POST /api/ai/conversations`: open/resume the current user's record conversation.
- `GET /api/ai/conversations/[id]?before=...`: read paginated private history.
- `POST /api/ai/conversations/[id]`: submit a versioned message or structured Q&A and the current draft; receive a validated response and form changes.
- `PATCH /api/ai/conversations/[id]`: attach a temporary conversation to a saved, authorized record.
- `DELETE /api/ai/conversations/[id]`: clear private conversation content.

The scope registry defines editable fields and validation; adapters bind them to the existing forms. Chats never call CMS write/publication services on the model's behalf. Malformed or unsafe fields are preserved as copyable chat text while usable fields still reach the form. Refusals, rate limits and provider failures leave the form unchanged.

Review expired pending requests and remove orphaned unsaved conversations older than the organization's chosen retention period (seven days is a practical starting point). Do not remove request counters within the rolling 24-hour quota window. Clear `AiRequest.result` when removing conversation history; it contains retry content. Include all three tables in database backups and account-deletion/export policies. A live synthetic bilingual About-page check has verified gpt-6-luna delivery of translations and sections through the draft recovery path. Real restaurant content still needs staff review. Malformed nested JSON can be repaired with the focused jsonrepair dependency; repaired values are explicitly flagged for completeness review and still pass scope, reference and safety checks.

## Central website proposals

The separate **AI Website Builder** now provides cross-resource generation, background jobs, complete private previews, editable proposals and atomic acceptance/publication. The modal assistant retains its original single-editor boundaries. Both use only `gpt-6-luna`, the same site/role protections and shared request allowances. See [central builder setup and workflow](ai-website-builder.md).
