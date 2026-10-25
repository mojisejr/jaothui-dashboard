# Competition admin release and operator handover

Issues#56/#106. This guide covers the candidate event-admin consolidation. It is separate from the already-released buffalo write-integrity system. Do not treat a local test, PR approval or disabled notification as full production acceptance.

## What stays the same

Applicants continue using `jaothui-event`, LINE login, public normal/Royal forms, status and history. Staff use the existing shared dashboard login. Event data remains in the source application's original Sanity dataset. No Sanity schema migration, PostgreSQL migration, new contract, staff account redesign, vote/raffle change or historical bulk correction is part of this release.

## Before deployment

- Finish both PRs, their exact-head hard gates, local browser journey and recovery exercise. Review source and dashboard together; an API-only release is not the staff UI.
- Obtain explicit owner authorization for the competition production release. The earlier buffalo production authorization does not authorize this release.
- Record existing source/dashboard deployment identities, source and dashboard settings presence, target Sanity project/dataset, legacy admin state and a private backup/inventory. Never paste secret values or entrant data into the checklist.
- Check that frontend draft-visibility reader compatibility from frontend PR205 remains deployed. No new frontend deployment is required solely for this candidate.
- Preserve all existing production buffalo-integrity, shared login and news settings. Local QA deliberately disables buffalo writes and uses an unreachable loopback core DB; those QA values must never replace production values.

## Server settings

| App | Setting | Meaning |
| --- | --- | --- |
| Source and dashboard | `JAOTHUI_COMPETITION_ADMIN_API_KEY` | Matching high-entropy server-only bridge key, at least32characters |
| Source | `SANITY_API_WRITE_TOKEN` | Source server writer for the existing project/dataset; never expose as NEXT_PUBLIC |
| Source | `SANITY_DATASET`, `NEXT_PUBLIC_SANITY_DATASET` | Must refer to the same intended dataset; local QA uses dev |
| Dashboard | `JAOTHUI_COMPETITION_ADMIN_API_BASE_URL` | Source origin; client appends `/api/admin/competitions` |
| Source | `JAOTHUI_COMPETITION_ADMIN_WRITES_ENABLED` | Exact `true` permits new bridge mutations; otherwise disabled |
| Source | `COMPETITION_LINE_NOTIFICATIONS_ENABLED` | Exact `true` enables actual delivery attempts; otherwise disabled |
| Source | `COMPETITION_LEGACY_ADMIN_DISABLED` | Exact `true` opts into the reviewed competition UI/API cutover; absent/false retains source-first compatibility |
| Source | `JAOTHUI_COMPETITION_DASHBOARD_URL` | Validated dashboard competition destination for legacy redirects |

Source production is the existing `jaothui-events` project/main at `https://jaothui-events.vercel.app`. Dashboard production is `jaothui-dashboard`/main at `https://dboard.jaothui.com`. Verify actual aliases/settings again in the authorized release window. Preview settings and dev keys are not production credentials. Deployment environment changes require a deployment/restart; a saved value does not change an existing process.

## Source-first rollout

1. Promote reviewed source feature→staging→main with the compatible reader/bridge code. Keep new writes and real LINE disabled; leave legacy cutover off while the new dashboard is unavailable. Check source public routes, historical reads, draft exclusion and unauthenticated bridge rejection.
2. Promote reviewed dashboard feature→staging→main. Set its production-only bridge origin/key. Check shared login, competition list/details, application/history and both export entry points with writes still disabled. Confirm existing buffalo and news workflows remain intact.
3. During an approved coordinated staff window, enable new bridge writes and verify one designated test event lifecycle with an operator. Shared credentials do not enforce a technical per-person pilot; coordinate the limited circle operationally.
4. Only after the dashboard is verified, configure the exact dashboard destination and opt into legacy competition cutover. Test old links and direct legacy APIs: event/application identity preserved, credential query/path segments discarded, obsolete writes denied before provider/storage calls. Public signup/status/history and vote/raffle remain available.
5. Keep real LINE off until a designated recipient and explicit send authorization are recorded. Test normal/Royal outcomes and retry only within that boundary. Record provider acknowledgment separately from the human's observed receipt.
6. Broaden staff access only after the owner accepts the full journey and the remaining live checks. Until then report pre-release/limited-trial/pending-operator status accurately.

## Operator journey

Use `/dashboard/competitions`. Create a draft, upload its cover, copy or add class rows, and review generated names/rules. Confirm separate signup dates, event dates and age cutoff; all closing days include the full Thai day. Publish only after validation. Existing entrants are not copied.

Use the public form through LINE, then find the application in the event's application list. Inspect normal/Royal images, address and optional fields. Approve or reject with a reason. The saved decision and notification result are separate; a failed/uncertain notification is not a failed decision. Retry notification through its own action rather than approving again.

Close public registration manually: public submission must stop, but staff onsite registration remains available until event end. Check autofilled buffalo information before saving; any duplicate override needs an explicit reason. Extend an expired registration closing date before reopening, without changing age cutoff by accident. Export Excel and Word/ZIP and verify the chosen event, row count and stored ages. Close the event: new onsite registration must stop while history and exports remain readable.

After applications exist, changes to class rules/age cutoff/form type require the impact report and the owner's external review reference. General text/image edits do not automatically reclassify existing registrations. Four previously audited malformed historical catalog labels remain unchanged; review them only if reused. Do not turn this release into a bulk data repair.

## Recovery

For an unsafe/new-write failure, disable `JAOTHUI_COMPETITION_ADMIN_WRITES_ENABLED` and real LINE, deploy/restart the compatible source, then verify reads/history/export still work and new bridge mutations fail closed. This switch does not undo completed changes. Preserve IDs, revisions, operation records, notification snapshots and all entrant history. Investigate the saved outcome before retrying an uncertain operation.

Keep legacy cutover enabled once it is installed: do not automatically revive the old caller-userId admin write path when dashboard writes are paused. If redirect configuration is invalid, the old UI must fail safe instead of exposing controls. Repair its configuration or the dashboard first.

Rollback a UI independently only to a source-compatible revision. Once versioned class strings exist, never roll source readers back before the compatible codec. No destructive schema/data rollback and no automatic historical reclassification. Do not change buffalo production mode/signer/DB/storage policy as a competition recovery action.

## Acceptance record

Record exact source/dashboard commits, environment, date, test event/application IDs, byte-verified downloads, browser widths390/768/1440, kill-switch results and current provider outcomes. Human acceptance and physical LINE receipt must have their own explicit record; local/stub evidence cannot close them. Keep all credentials, private backups and logs outside Git.
