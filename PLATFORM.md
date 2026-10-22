# Puma Comercial — El Salvador

Private commercial workspace for a user-maintained customer base. Customer data is loaded through the private API, never embedded in source or deployment archives. National market figures are not inferred from fleet transactions.

## Fleet intelligence

The default view is **Flota · Tier list**. Upload the original Payment24 `Report` XLSX, including its original headers (the source uses `Transcation Result` and `Transcation Type`). The streaming reader accepts up to 30 MB compressed, 400 MB expanded and 250,000 records. It validates every row and previews counts and totals before submitting 250-row blocks. Select the same file again to resume an interrupted import.

`TransactionId` identifies each event. Identical events in overlapping files do not accumulate; changed events retain their earlier versions. Only completed imports enter `fleet_current`; an incomplete import can be discarded and later resumed. One import can be active at a time. A source copy is stored in private R2 after completion and can be downloaded from load history. Cards are reduced to their final four digits in the analytical database; the original private XLSX retains the source contents.

Approved `Spend` is consumption; approved `Refund Fleet Transaction` is subtracted on the refund event date. Pre-authorisations, errors, cancellations and pending operations remain searchable but do not increase consumption. Integer milli-gallons and cents preserve source precision. Payment24 amounts are consumption amounts after refunds, not confirmed pretax revenue or contribution. Fleet records contribute volume to the commercial workspace with revenue and cost left unknown. Avoid uploading daily commercial volume that repeats these same fleet events.

Accounts retain a stable relationship to the commercial client. New accounts match an unambiguous existing account code or normalized exact customer name; otherwise a new client with segment `Flota` is created. Different named divisions are not fuzzy-merged. Enrich industry, contacts, ownership and notes in the commercial profile. Source `Department` is an internal customer area, not geography.

Tiers rank all customers by positive net volume in the selected period/product: S through the first 50%, A through 80%, B through 95%, C thereafter, and — for nonpositive volume. The customer crossing a boundary stays in the preceding tier; equal-volume customers share a tier. These are portfolio concentration tiers, not national market share, profit, creditworthiness or price elasticity. Recency is measured against the selected cutoff capped at the latest uploaded date. Partial months are labeled and never extrapolated.

Client pages show consolidated accounts, daily/monthly consumption, station usage and identifiable drivers/plates. Transactions are searchable and paginated at 100 records. Quality and import-history tabs preserve excluded events and source traceability. The tier table is paginated at 25 customers and can export the selected ranking. Future uploads in the same format update this same workspace.

## Workflow

Create or paste clients using `nombre` and `segmento`. Optional `codigo` is recommended for stable matching. Enrich each profile with contact, products, supplier, strategic status, estimated monthly potential, next action, activities and documents.

Daily imports accept CSV/TSV or pasted tabular text. Key: client + date + product + unit + location. An identical reimport changes no totals. Corrections replace the daily aggregate and retain before/after revisions. Imports are previewed and validated before commit, and batches are transactional. Maximum 500 rows and 2 MB per batch. Daily values are consolidated totals, not individual invoice lines. Values use a decimal point and no thousands separators. Returns/credits need a separate treatment before negative imports are enabled.

Contribution is net revenue minus the loaded total cost. Missing revenue/cost is unknown, not zero. Units are filtered separately. Prior comparisons use the same number of calendar days and only submitted records; completeness is a commercial responsibility. Potential is a declared estimate, not an inferred market size. Pricing uses an explicit volume hypothesis, not estimated elasticity.

## Storage and access

Sites provides the owner-private access boundary for the entire app, including API routes. The shared workspace uses D1 (`DB`) and R2 (`BUCKET`). Identity-dependent pages use the supplied ChatGPT sign-in helper. Do not make this Site public without adding and verifying workspace authorization on every endpoint. Same-origin writes are enforced. No credentials or customer records are embedded in the source or browser storage.

Uploads: 10 MB maximum, PDF/DOCX/XLSX/CSV/TXT/PNG/JPG. Files are downloaded as attachments. Text/CSV context extraction is limited to 40,000 characters; long extracts in AI summaries are limited to 8,000 characters per document. PDF analysis can include a selected file up to 5 MB. Word/Excel uploads are stored with user summaries, not automatically parsed.

Workspace query limits: 30,000 daily records including the previous comparison period (larger queries require a narrower period), latest 500 global activities, 1,000 global documents, 50 imports and 30 AI consultations. A client profile separately loads its latest 1,000 activities, 1,000 documents and 200 revisions. Counts are available in the profile endpoint. Records are retained even when not displayed by these bounded views.

## AI connection

The implemented Responses API integration requires server-side `OPENAI_API_KEY`; `OPENAI_MODEL` is optional and defaults to `gpt-5-mini`. Provision secrets through the approved Sites runtime-secret workflow only. No key was provisioned in this initial version. Without a key, the UI says connection pending and the endpoint returns 503, never a simulated response.

The assistant uses client summaries, current/prior metrics by product/unit, fleet tiers and event totals, recent activities and document summaries. It cites internal evidence, distinguishes missing data and hypotheses, and has no write tools or automatic internet search. `store:false` is sent to the API. Maximum 250 clients and bounded context per request. Saved answers retain their question and filter context. AI behavior with a live model remains unverified until a connection is authorized.

## Validation

`node node_modules/typescript/bin/tsc --noEmit`

`node scripts/verify-core.mjs`

`node scripts/verify-fleet.mjs [absolute-path-to-Payment24.xlsx]`

The route harness uses in-memory SQLite and an R2 adapter to exercise request handling, import idempotency, corrections, incomplete-load visibility, client consolidation, refunds, excluded events, pagination, uploads, missing data, origin checks and financial calculations. Optional XLSX validation processes the actual file through the same reader and import routes. Browser QA could not pass the private sign-in boundary because managed local preview has no dispatch authentication; application authentication was not weakened to compensate. Sites builds use the supported `build-site.mjs` helper.

`scripts/import-payment24.mjs` accepts private initial-load configuration through hidden stdin; credentials must never be passed in command arguments, written to files or included in source. It sends data only to the specified Site origin and refuses redirects. Production imports are separate from source deployment.
