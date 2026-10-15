# Competition workspace — Phase 3 operator guide

Issue: #56. This checkpoint covers event setup and event controls. It is not the
complete competition-admin migration.

## Use the workspace

Sign in with the dashboard's existing shared team account, then open
`/dashboard/competitions` from the dashboard hub. The shared account does not
identify individual staff or authenticate a named rule reviewer.

- Search and combine event, registration, form-type and event-date filters.
  Event status and registration status are separate; inspect historical-data
  warnings before editing an older event.
- Create a draft, upload a cover, enter event details and dates, and copy/edit
  national or provincial class catalogs. Save the draft before publishing.
  Copying an event copies configuration and classes, not applicants.
- Publishing makes a valid event visible in the public app. Manual registration
  closure stops public applications while staff eligibility continues until the
  event's closing day. Closing the event stops both channels.
- Dates contain no time. Every closing day includes the entire day in
  `Asia/Bangkok`. Event end, registration deadline and buffalo age cutoff have
  separate meanings. Extend an expired registration deadline and save before
  reopening registration.
- Once applications exist, age cutoff, form type and class catalogs are locked.
  An exceptional change requires an impact report and Non's external review
  reference/reason. It does not reclassify existing applications. Returning to
  general editing cancels the proposed rules while preserving general edits.
- If another write changed the event, reload the latest data and review the
  changes before retrying. Failed validation preserves entered values. Confirm
  leaving a page with unsaved edits only when those edits can be discarded.

## Server configuration

The dashboard calls the source `jaothui-event` backend through a protected REST
bridge. Sanity and competition domain writes remain owned by that backend.

| Application | Server-only setting | Purpose |
| --- | --- | --- |
| Dashboard | `JAOTHUI_COMPETITION_ADMIN_API_BASE_URL` | Source backend origin; the client appends `/api/admin/competitions`. |
| Dashboard and source | `JAOTHUI_COMPETITION_ADMIN_API_KEY` | Same high-entropy bridge secret on both servers; at least 32 characters. |
| Source | `SANITY_API_WRITE_TOKEN` | Source's Sanity writer credential. |
| Source | `JAOTHUI_COMPETITION_ADMIN_WRITES_ENABLED` | Writes require the exact value `true`; otherwise keep disabled. |
| Source | `COMPETITION_LINE_NOTIFICATIONS_ENABLED` | Actual LINE delivery requires the exact value `true`; keep disabled outside a separately approved delivery test or rollout. |

Never prefix credentials with `NEXT_PUBLIC_`, return the bridge key to the
browser, put values in source control, or include them in screenshots/logs.
Existing dashboard login settings remain server-side and are unchanged.

The local Phase 3 preview uses the designated Sanity `dev` dataset and synthetic
events. Configure both source dataset settings, `NEXT_PUBLIC_SANITY_DATASET` and
`SANITY_DATASET`, consistently; the dashboard's Sanity-backed legacy reads must
also use `dev`. Check the selected dataset before enabling writes. Local preview
success does not establish production readiness or operator acceptance.

## Remaining delivery and rollout hold

Phase 4 still needs the dashboard applications list/detail, approval/rejection,
notification outcomes/retry, onsite registration, and event-context export UI
with browser verification. Source API availability is not proof that these
operator workflows are delivered.

Phase 5 still needs full public/admin regression, controlled live delivery
proof, legacy admin cutover, production configuration checks, recovery exercise
and operator acceptance. Voting and raffle work remain outside this scope.

Hold production writes and legacy admin removal until those gates close. Deploy
the compatible source backend and public draft-visibility readers first, with
bridge writes disabled; verify their contracts, then deploy/configure the
dashboard. Enable source writes only at the approved rollout checkpoint.

For a write incident, disable `JAOTHUI_COMPETITION_ADMIN_WRITES_ENABLED` on the
source and redeploy/restart it, then investigate before retrying. The switch
stops new bridge mutations; it does not undo completed writes. Keep compatible
source readers available for existing event history and drafts. Roll back the
dashboard independently if needed; do not remove draft filtering or run a
destructive data rollback as part of UI recovery.
