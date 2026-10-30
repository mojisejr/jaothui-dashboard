# Competition staff arrival workflow

Applicants display a QR from their application history. Staff use the ordinary
phone camera to open the protected Dashboard link. Login returns to that same
application; scan/opening alone never writes an arrival. No webcam permission,
in-web scanner, printable tag, or new native application is required.

The arrival action is near the top of the application detail, after the animal,
microchip, event, and class identity. It is separate from Royal approval. The
existing "ลงทะเบียนหน้างาน" action still means creating an application.

## Rules

- Normal registered and Royal approved applications can report arrival.
- Royal pending/rejected and unknown event types cannot confirm arrival.
- Confirmation is available during the event's start/end days, inclusive in
  Asia/Bangkok. The public signup deadline does not close reporting for existing
  eligible applications. Closed/draft events and invalid dates are blocked.
- Confirmation requires authenticated staff and an explicit press. Duplicate
  requests/scans keep the recorded time and cannot report another class.
- Staff can undo with a reason, including correcting a past mistake. An undo
  keeps the original arrival and correction audit. A new late confirmation is
  still blocked outside the event window.
- Staff use the existing shared Dashboard account. The audit does not pretend
  to identify the individual person using that account.
- Applicant status and staff detail/list are read from the same source; arrival
  totals and filters are separate from application/approval totals. Existing
  exports retain their previous scope and status semantics.

## Review, configuration and merge

This feature is delivered as an unmerged feature-to-staging PR for owner review.
It has not been played through in a browser by the agent. Automated test/build
evidence and checkpoint IDs are in the PR.

The two new production QR variables have already been prepared in the source
Vercel project (the signing key is sensitive/server-only). This did not deploy
either project. No new Dashboard secret is required; retain its existing bridge.

1. Prepare source QR configuration and merge/promote the matching
   `jaothui-event` source PR first. Its deployment must be Ready before the
   Dashboard rollout. Source config: server-only `CHECKIN_QR_SECRET` and
   `CHECKIN_DASHBOARD_URL` (production `https://dboard.jaothui.com`). See the
   matching source repository's `docs/competition-mobile-checkin.md`.
2. Preserve the existing `JAOTHUI_COMPETITION_ADMIN_API_BASE_URL` and server-only
   bridge key configuration. A preview Dashboard should use a matching isolated
   source, and source-issued QR should point to the preview Dashboard origin.
3. Merge this PR into `staging`, then promote `staging` to `main` through the
   normal release PR. Wait for a Ready deployment of the intended commit.
4. Run owner phone acceptance. The new contract must report an old/misconfigured
   source clearly rather than turn a missing arrival field into fake success.

## Owner test steps

Prepare two phones, applicant LINE login and shared staff login, plus a
designated test event whose dates include the test day. Use separate application
rows/classes, including Normal, approved Royal, and blocked Royal fixtures.

1. Applicant: history → choose class → show QR. Check the compact card, readable
   QR, animal/event/class labels, and full details reveal.
2. Staff: scan with the phone camera while logged out. Login must return to that
   same application. A camera may open a different browser from LINE; the staff
   session must exist in the browser actually used.
3. Review identity. Before confirmation, the application must still be not
   reported. Press confirm, then refresh the applicant view and compare times.
4. Rescan; the time must be unchanged. Another class for the animal must remain
   unreported. Search by microchip in the applications tab as the fallback and
   verify the same detail/status.
5. Filter arrived/not-arrived and compare the displayed counts with rows.
6. Undo with a meaningful reason. Refresh the applicant view; it must show not
   reported again. Staff audit must keep both the original arrival and undo.
7. Check blocked Royal/unknown types and date-window explanations. Signup closed
   during the event must not prevent otherwise eligible arrival confirmation.
8. Exercise failed/offline requests and refresh after reconnecting. A pending or
   failed request must not be presented as a confirmed server write.

The complete source checklist also covers QR invalidation/deletion and key
rotation. Do not modify real event dates or submit live production applications
just to create fixtures. Redact QR tokens and personal information in feedback.

## Rollback

Use reviewed revert commits at the PR checkpoints, starting with Dashboard
entry points. Keep source compatibility until deployed consumers no longer need
it. Do not delete arrival/audit history or reset approval to undo this feature.
No force push or staging-branch deletion is part of rollout or rollback.
