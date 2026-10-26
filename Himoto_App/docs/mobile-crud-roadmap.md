# Mobile CRUD Rollout Plan

This plan maps mobile writes to the existing HIMOTO web workflows. “CRUD” means the operations the web system supports safely; it does not imply unrestricted deletion or direct editing of records whose changes have accounting, legal, or audit effects. Current mobile routes are listed in [mobile-api.md](mobile-api.md).

## Rules for every module

1. Inspect the web screen, route, permission, domain service, database constraints, audit behavior, and existing checks before adding a mobile mutation.
2. Add a typed mobile endpoint that calls the existing domain service. The server derives the actor, permission, and branch scope from the mobile session; never trust a client supplied user, role, or branch.
3. Reuse revisions for stale-edit detection and request IDs for safe create retries where supported by the web workflow. Keep soft-delete, audit, and transaction behavior intact.
4. Gate controls by permission in the app, while enforcing the same permission again on the server. Return useful validation/conflict errors and refresh the affected list after success.
5. Verify the allowed and denied roles, branch boundaries, validation, retry/conflict behavior, audit record, and web regression against the isolated test database before enabling the screen.

## Module sequence and scope

| Order | Module | Mobile write scope | Guardrails and reason |
| --- | --- | --- | --- |
| 1 | Duty roster (weekly shifts) | **Implemented:** create, read, edit, soft delete. | Uses `hr.read` / `hr.write` and the web duty-roster service. Keeps active staff/store checks, overlap validation, duplicate-create protection, revisions, and database access scope. This is scheduling, not punch attendance. |
| 2 | Contracts and rentals | **Implemented:** draft CRUD, hold reservations, forgotten-contract backfill, renewal backfill, and existing-contract receipt/refund backfill. | Uses the shared web finalize, renewal, and payment services with their permissions, store/account scope, revisions, idempotency, audit, and ledger behavior. Handover and return remain separate. |
| 3 | Customers | **Create implemented; next:** edit profile. | `customers.write`; preserve identity/phone duplicate checks and branch access. Add blacklist as its own explicit action and permission flow after profile editing; do not model it as delete. |
| 4 | Shift reports | Create/edit draft and attach evidence; submit/finalize as a distinct action. | Reuse report status transitions, media signing, audit trail, and existing `contracts`/operations permissions exactly as the web app does. Submitted reports should not become freely editable. |
| 5 | Staff | Create/edit permitted staff fields; deactivate only through the web-supported status workflow. | `hr.write`; prevent destructive removal when contracts, shifts, or history reference the staff member. Do not expose payroll or private fields unless explicitly needed and authorized. |
| 6 | Vehicles | **Implemented:** create and edit inventory fields. | `vehicles.write` and scoped stores. Uses web validation, audit, revision, locking, open-contract, and in-transit safeguards. No generic delete; transfer and receive remain separate workflows. |
| 7 | Finance and cashbook | Add supported income/expense/voucher/payment workflows; corrections use the existing reversal/adjustment path. | `finance.write`, branch restrictions, amount validation, audit trail, and duplicate-payment protection. Never silently edit or delete posted ledger entries. |
| 8 | Stores, accounts, settings, integrations | Defer until core workflows are stable; implement only exact web-supported actions. | High-impact permissions and provider secrets. Use narrow admin actions, audit all changes, and never return integration credentials to the mobile client. |

Read-only modules such as dashboard summaries, staff sales reports, histories, and lookup lists stay read-only unless the web app has a clear matching mutation. Bulk import/delete and provider configuration are not mobile CRUD targets in the first release.

## Current first slice: duty roster

The mobile team screen is available from **More → Lịch trực cơ sở**. Users with `hr.read` can browse weekly shifts; users with `hr.write` can add, edit, or soft delete. The personal Home card continues to show only the signed-in person's linked shifts. No database migration is needed for these routes because they use the existing roster table and service.

The Contracts tab exposes **Tạo hợp đồng nháp** and **Sửa nháp / Xóa nháp** on draft rows for accounts with `contracts.draft`. Home **Làm hợp đồng** opens the same create form and posts to `/contracts/draft` (a singular alias of `/contracts/drafts`). **Nhận cọc giữ xe** creates a draft and finalizes it with an actual receipt, leaving the vehicle awaiting handover. **Nhập bổ sung giao dịch** has three branches: forgotten contract history, an actual missed renewal (with optional receipt), and a previously received or refunded contract transaction. Each branch requires its web permission and a confirmation that the historical event really happened. Handover and return are not included.

The Fleet tab exposes **Thêm xe** and **Sửa xe** for accounts with `vehicles.write`. It supports core inventory fields and refreshes the list after saving. It intentionally has no delete control because the web app has no generic vehicle delete route. Status and branch changes can be rejected for open contracts or in-transit vehicles; use the dedicated return or receive workflows for those cases.

For local manual verification, use an isolated test database and accounts with `hr.read` only, `hr.write` on one branch, and all-branch access. Check week navigation and store filtering; create and edit a shift; verify an overlapping shift is rejected; retry a create request safely; confirm a stale edit/delete returns a conflict; and confirm a branch account cannot change another branch. Confirm a read-only account sees no mutation controls and receives `403` if it calls a write endpoint directly. Finally verify the web roster still shows the same changes.

## Next implementation slice

Add customer profile editing (order 3), after reviewing the current customer update route and revision behavior. Keep blacklist as a separate follow-up action. Before each new module, update `mobile-api.md`, add route and client DTOs, implement the native form/action, add focused permission and database checks, then record the manual frontend checks and the next slice here.
