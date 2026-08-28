---
name: airtable-schema-change
description: Changes Airtable tables, fields, relationships, record shapes, or sync logic with MCP-verified schema inspection, code reference tracing, and read/write testing. Use when changing Airtable tables, fields, relationships, record shapes, or synchronization logic.
---

# Airtable Schema Change

Use for changes involving Airtable tables, fields, relationships, record shapes, or synchronization logic.

**Scope:** Airtable is not integrated in this repository yet. Use this skill only when Airtable integration code exists or is being added.

Read first: `AGENTS.md`, `docs/DATA_CLASSIFICATION.md`, and `.cursor/rules/data-safety.mdc`. Never copy client, voter, or casework data into Airtable or this repo.

## Before making changes

- inspect the actual Airtable schema using the configured Airtable MCP
- never guess table or field names
- identify every application reference to the affected field
- identify migrations or backwards compatibility concerns

Do not delete, rename, or change a field type without explicit approval.

Prefer additive schema changes when practical.

### Inspect schema (Airtable MCP)

Namespace: `plugin-airtable-airtable`. Call `GetDynamicTools` before first use. If auth fails, call `mcp_auth` and retry.

Discovery order:

1. `search_bases` or `list_bases` → obtain `baseId` (`app…`)
2. `list_tables_for_base` → obtain `tableId` (`tbl…`), field names, field IDs (`fld…`), types
3. `get_table_schema` → detailed config (select choices, linked-record targets, required options)

Rules:

- Use Airtable internal IDs in code and MCP calls. Never substitute display names for IDs.
- Never fabricate `baseId`, `tableId`, `fieldId`, or choice IDs.
- For interface-only bases (permission errors on table tools), use `list_pages_for_base` and page-based read tools instead.

### Find application references

Search the repo for every reference to affected tables, fields, and record shapes:

```bash
# Replace with actual names/IDs discovered from MCP
rg -i "FieldName|fld[A-Za-z0-9]{14}|TableName|tbl[A-Za-z0-9]{14}" apps/ netlify/ packages/
```

Check:

- Type definitions and mappers
- Read paths (list/fetch/sync)
- Write paths (create/update/upsert)
- Tests and fixtures
- Netlify Functions or other server-side sync boundaries

Document each reference and whether it reads, writes, or assumes a shape.

### Backwards compatibility

Before changing anything, note:

- Existing records with old field names or missing new fields
- Linked-record relationships that break if a table or field moves
- Sync jobs or webhooks that expect the current shape
- Deploy order: schema first vs code first (prefer additive schema + tolerant reads, then tighten writes)

Present a change plan and wait for explicit approval before delete, rename, or field-type changes.

## Schema change policy

| Change | Default |
|--------|---------|
| Add optional field | Allowed — preferred |
| Add required field | Needs default/backfill plan |
| Rename field | Requires explicit approval |
| Change field type | Requires explicit approval |
| Delete field/table | Requires explicit approval |

Prefer additive schema: new fields with defaults, dual-read old+new names during migration, deprecate old fields only after code no longer references them.

## Implement application changes

When schema or sync logic changes:

- Map by stable field IDs where possible; isolate display-name lookups in one layer
- Tolerate missing/null fields on read — do not assume every record has every field
- Keep sync logic centralized; do not duplicate Airtable access across UI and server
- Never commit Airtable API tokens, base URLs with secrets, or real campaign records

For schema mutations via MCP (only after approval):

- Add: `create_field`, `create_table`
- Modify name/description/options: `update_field`, `update_table`
- Do not call delete/rename/type-change tools without explicit user approval

## After changing application code

- test reads
- test writes where appropriate
- test missing/null data
- run the complete test suite and build
- summarize schema implications separately from code changes

### Verification steps

**1. Test reads**

Use MCP `list_records_for_table` (or page tools for interface-only bases) against the affected table. Confirm:

- Expected fields present with correct types
- Linked records resolve
- Filters and field selection match application expectations

**2. Test writes** (when the change includes create/update/sync)

Use MCP `create_records_for_table` / `update_records_for_table` on non-production or explicitly approved test records. Confirm:

- Required fields accepted
- Linked-record fields accept valid record IDs (`search_candidate_linked_records` when needed)
- Application write path produces the same shape

**3. Test missing/null data**

- Records with the new field empty
- Records created before the schema change (no new field)
- Null or empty linked-record fields
- Application handles all cases without crash or silent data loss

**4. Full suite and build**

From repo root:

```bash
npm test
npm run build
```

Report actual output. Do not claim pass/fail without running the commands.

**5. Diff inspection**

```bash
git status
git diff
```

Reject secrets, real voter/client data, debug logging, and unrelated edits.

## Completion report

Split schema implications from code changes:

```markdown
## Airtable schema change report

### Schema implications
- Base: [name] (`app…`)
- Tables/fields affected: …
- Change type: additive | migration | (approved destructive)
- Backwards compatibility: …
- Records requiring backfill: …

### Code changes
- path — reason

### Application references updated
- [file — field/table — read|write]

### Verification
- Reads: [what was tested, result]
- Writes: [what was tested, result, or N/A]
- Missing/null: [cases tested, result]
- npm test → [pass/fail]
- npm run build → [pass/fail]

### Limitations / follow-ups
- …
```

## Git

Do not commit or push unless explicitly requested. If asked to commit later:

- Stage named paths only; never `git add -A` or `git add .`
- Never commit to `main`
- Never commit credentials, `.env` values, or real campaign data
