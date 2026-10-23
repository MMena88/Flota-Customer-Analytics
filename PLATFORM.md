# Puma Comercial — El Salvador

Private commercial workspace for a user-maintained customer base. Customer data is loaded through the private API, never embedded in source or deployment archives. National market figures are not inferred from fleet transactions.

## Fleet intelligence

The default view is **Flota · Tier list**. Upload the original Payment24 `Report` XLSX, including its original headers (the source uses `Transcation Result` and `Transcation Type`). The streaming reader accepts up to 30 MB compressed, 400 MB expanded and 250,000 records. It validates every row and previews counts and totals before submitting 250-row blocks. Select the same file again to resume an interrupted import.

`TransactionId` identifies each event. Identical events in overlapping files do not accumulate; changed events retain their earlier versions. Only completed imports enter `fleet_current`; an incomplete import can be discarded and later resumed. One import can be active at a time. A source copy is stored in private Supabase Storage after completion and can be downloaded from load history. Cards are reduced to their final four digits in the analytical database; the original private XLSX retains the source contents.

Approved `Spend` is consumption; approved `Refund Fleet Transaction` is subtracted on the refund event date. Pre-authorisations, errors, cancellations and pending operations remain searchable but do not increase consumption. Integer milli-gallons and cents preserve source precision. Payment24 amounts are consumption amounts after refunds, not confirmed pretax revenue or contribution. Fleet records contribute volume to the commercial workspace with revenue and cost left unknown. Avoid uploading daily commercial volume that repeats these same fleet events.

Accounts retain a stable relationship to the commercial client. New accounts match an unambiguous existing account code or normalized exact customer name; otherwise a new client with segment `Flota` is created. Different named divisions are not fuzzy-merged. Enrich industry, contacts, ownership and notes in the commercial profile. Source `Department` is an internal customer area, not geography.

Tiers rank all customers by positive net volume in the selected period/product: S through the first 50%, A through 80%, B through 95%, C thereafter, and — for nonpositive volume. The customer crossing a boundary stays in the preceding tier; equal-volume customers share a tier. These are portfolio concentration tiers, not national market share, profit, creditworthiness or price elasticity. Recency is measured against the selected cutoff capped at the latest uploaded date. Partial months are labeled and never extrapolated.

Client pages show consolidated accounts, daily/monthly consumption, station usage and identifiable drivers/plates. Transactions are searchable and paginated at 100 records. Quality and import-history tabs preserve excluded events and source traceability. The tier table is paginated at 25 customers and can export the selected ranking. Future uploads in the same format update this same workspace.

## Workflow

Create or paste clients using `nombre` and `segmento`. Optional `codigo` is recommended for stable matching. Enrich each profile with contact, products, supplier, strategic status, estimated monthly potential, next action, activities and documents.

Daily imports accept CSV/TSV or pasted tabular text. Key: client + date + product + unit + location. An identical reimport changes no totals. Corrections replace the daily aggregate and retain before/after revisions. Imports are previewed and validated before commit, and batches are transactional. Maximum 500 rows and 2 MB per batch. Daily values are consolidated totals, not individual invoice lines. Values use a decimal point and no thousands separators. Returns/credits need a separate treatment before negative imports are enabled.

Contribution is net revenue minus the loaded total cost. Missing revenue/cost is unknown, not zero. Units are filtered separately. Prior comparisons use the same number of calendar days and only submitted records; completeness is a commercial responsibility. Potential is a declared estimate, not an inferred market size. Pricing uses an explicit volume hypothesis, not estimated elasticity.

## Storage and access

Supabase Auth validates the signed-in user on every page/API request. A separate active `app_members` record grants workspace access. Read-only members cannot mutate data. PostgreSQL business tables live in the non-exposed `app_private` schema with RLS enabled and browser privileges revoked. The server connects using its protected database credential. Each API operation runs in a transaction; an error response rolls back writes. Import and client writes use a transaction advisory lock. Same-origin writes are enforced. No credentials or customer records are embedded in source or browser storage.

Storage uses a private bucket and short-lived signed download URLs. Browsers upload directly with a signed upload token after membership checks. Finalization validates size and, for the fleet source, SHA-256. Pending files that never complete can remain unlinked in the private bucket; administrators should review abandoned uploads periodically. This is one shared commercial workspace, not a multi-company tenant system.

Uploads: 10 MB maximum, PDF/DOCX/XLSX/CSV/TXT/PNG/JPG. Files are downloaded as attachments. Text/CSV context extraction is limited to 40,000 characters; long extracts in AI summaries are limited to 8,000 characters per document. PDF analysis can include a selected file up to 5 MB. Word/Excel uploads are stored with user summaries, not automatically parsed.

Workspace responses are capped at 4 MB for Vercel; excessive requests ask for a narrower filter. Workspace query limits: 30,000 daily records including the previous comparison period (larger queries require a narrower period), latest 500 global activities, 1,000 global documents, 50 imports and 30 AI consultations. A client profile separately loads its latest 1,000 activities, 1,000 documents and 200 revisions. Counts are available in the profile endpoint. Records are retained even when not displayed by these bounded views.

## AI connection

The implemented Responses API integration requires server-side `OPENAI_API_KEY`; `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. Configure provider credentials only as server-side secrets in the intended deployment. No key is included in this repository. Without a key, the UI says connection pending and the endpoint returns 503, never a simulated response.

The assistant uses client summaries, current/prior metrics by product/unit, fleet tiers and event totals, recent activities and document summaries. It cites internal evidence, distinguishes missing data and hypotheses, and has no write tools or automatic internet search. `store:false` is sent to the API. Maximum 250 clients and bounded context per request. Saved answers retain their question and filter context. AI behavior with a live model remains unverified until a connection is authorized.

## Validation

`npm run typecheck`, `npm test`, `npm run build`.

`npm test -- "/absolute/path/to/Payment24.xlsx"` adds a full-file regression check.

The test harness runs the PostgreSQL schema, real authentication policy, route guards, route handlers and business queries using PGlite. The Supabase network boundary is mocked explicitly; it is not an authentication bypass in the application. Checks include unauthorized/non-member access, viewer restrictions, cross-origin writes, direct browser-role SQL denial, transaction rollback, import idempotency, corrections, refunds, partial-load visibility, client consolidation, transaction pagination and private file finalization. No external AI requests are made.

Real Supabase sessions, deployed database connectivity, remote signed uploads/downloads and live AI must be verified after provisioning. Source deployment does not migrate the existing private database.
