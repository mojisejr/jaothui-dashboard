# Task-path editorial matrix — edition 0.3 (#62)

Reviewed 26 October 2026, Asia/Bangkok. Amendment Slice2R-A. Baseline52611c4;
no application code or capture changes. Source references are the same verified
Dashboard/Event implementation as `SOURCE-TRUTH-CHECKLIST.md`.

Six front chapters are complete ordinary job paths. A reference link adds detail;
it is not a prerequisite hop. Every path ends with observable completion, allowed
self-help, a safe hold/escalation boundary and a short incident packet. The
reference guide and23 original chapters remain optional. No first-time-human or
actual live-operation result is inferred from this editorial review.

| Task | Preconditions and ordinary path | Observable DoD | Self-help | Stop / decision / developer boundary | Incident packet and optional references | Source anchors |
|---|---|---|---|---|---|---|
| task-new | Shared Dashboard login; organizer-approved details/dates/rules; choose whole-event clone **before** filling, or new blank; name/cover/five dates; copy catalog or add rows; test age/color; save correct new-vs-existing draft button; publish/read back | New ID distinct from template; no copied entrants; saved values and public event match; signup status matches dates, including legitimate future waiting | Clear filters; complete dates; fix file type/size; save dirty form; read readiness warnings | Organizer rule uncertainty or post-entrant lock → Non/admin and impact review. Persistent read-back/service mismatch or age error after source values checked → admin forwards developer. No DB/config edits | Event URL/ID, Thai time, last confirmed step, expected/actual/error, sanitized screenshot. Optional dates/age/recovery | `CompetitionEditor.tsx` (`save`,`runAction`,`copyCatalog`,`upload`,`makeReport`,`applyReview`); `ClassCatalogEditor.tsx`; `ClassAgeTester.tsx`; `competition-thai-date.ts`; Event `competition-policy.ts`, `competition-service.ts` |
| task-review | Find correct event/application; inspect stored age, documents, Royal/color as applicable; save decision/reason; read back; separately send/retry LINE | Saved decision/reason read back. Notification stage complete at provider acceptance; actual receipt/read not required. Disabled/no recipient stays explicitly pending and handed over | Clear filters; fill rejection reason; reload conflicted application, retaining draft comment; known failed send uses send/retry, never repeat approval | Organizer/documents/no recipient/disabled setting → Non/admin. Unknown/review-required delivery holds send and needs admin/developer logs; read-back/persistent service errors → developer | Event/application URL+IDs, Thai time, saved result vs send state, expected/actual/error, sanitized image. Optional Royal/incident | `ApplicationsList.tsx`; `ApplicationReview.tsx` (`save`,`send`,`refresh`,`canSend`); `competition-applications.ts`; Event `competition-service.ts` |
| task-signup | Organizer instruction; correct saved published event, date and onsite policy; close public or extend deadline/save then reopen by schedule | Closed-manual public signup plus onsite policy remains allowed when valid; or reopening status matches date window (future waiting is valid), values read back | Save dirty changes; check start/deadline/end dates; reload only after recording unsaved edits | Closed/ended has no UI reopen; organizer date/rule decisions → Non/admin. State/read-back mismatch or repeated service error after allowed recovery → developer | Event URL/ID, Thai time, organizer instruction, last confirmed step, expected/actual/error/sanitized image. Optional status/incident | `CompetitionEditor.tsx` (`runAction`, dirty state and action rendering); `Workspace.tsx` (`Status`); Event `competition-policy.ts` |
| task-onsite | Correct eligible event; documents/identity values; mandatory chip lookup+duplicate check; explicit metadata apply or manual data; verify DOB/color/age/class; authorized duplicate reason≥10; submit once | Known success with ID/link and matching read-back. Known save+refresh failure is already saved, pause before next record. Uncertain result is **not** done | Correct missing input/lookup/class. Known save+refresh fail allows reload before next record without extra write. Uncertain write keeps same page/request and only same-request retry | Genuine duplicate/rule decisions → Non/admin. Continued uncertain write retains React request; no reload/close/new request; admin/developer examines logs. Persistent mismatch or verified age error → developer | Keep form; event/app URL+ID if known, Thai time, last confirmed result, expected/actual/error/sanitized image. Optional incident; reading PDF must not navigate away from active UI | `OnsiteRegistrationForm.tsx` (`lookup`,`applyMetadata`,`submit`,`retry`); `competition-onsite.ts` (`validateOnsite`,`onsiteAge`); Event `competition-policy.ts` |
| task-close | Choose export-only without changing event status; or organizer-approved closure after pending requests resolved; export XLSX or DOCX ZIP; open and compare | Export-only leaves event status unchanged and files match event/count/status/age. Closure branch additionally stops both channels. Share only to authorized recipients | Inspect downloads, connection and retry download; review age-warning rows with admin | Wrong closure has no reopen button; no clone-to-move entrants. Organizer reversal/incomplete historic age → Non/admin. Repeated wrong-event/count/read-back/export failure → developer | Event URL/ID, Thai time, last confirmed step, filename, expected/actual/error/sanitized image; no full private export to general group. Optional export/incident | `CompetitionEditor.tsx` actions; Event `competition-policy.ts`; `[id]/export.tsx`; `competition-export.service.ts` |
| task-recover | Identify last confirmed step and preserve current UI/request before repeating | Allowed recovery is confirmed correct, or responsible admin has full packet/has accepted hold. Escalation is not a claim of bug resolution | Filters/input/file/date; controlled stale reload; known failed notification retry; known onsite save vs refresh failure | Three levels explicitly separate staff input fixes; Non/admin business/config decisions; dev persistent read-back/service/verified-age/uncertain write-delivery logs. Uncertain onsite must keep original page/request | Full reusable packet includes intent,event/application IDs+URLs,Thai time,last confirmed step,expected/actual,error,attempts,sanitized shot; never credentials/token or excess personal data | `CompetitionEditor.tsx` stale reload; `ApplicationReview.tsx` conflict/refresh/send; `OnsiteRegistrationForm.tsx` known/unknown result; current production runbook recovery boundaries |

## Navigation and source continuity

- Manifest navigation prioritizes six tasks; optional links lead to reference guide,
  login and administrator appendix. It does not force23 reference hops.
- Fragment links target stable chapter IDs. `#contents` / `#cover` are reserved only
  for frontmatter books. Print page numbers are resolved from actual destinations
  with CSS `target-counter`; no hand-maintained chapter/page numbers.
- Existing chapters link to their primary job and the reference guide. Old hardcoded
  “Royalบท13” / “ปิดรับสมัครบท16” were replaced by named fragment links.
- Future signup waiting, strict ceil-month bands, special staff checks, preserved
  province rows, shared-account limits, Royal **non-black** one-day adjustment,
  no copied entrants and no manualclosed reopen are retained.
- All20 illustrations and their50 declared appearance inputs retain original bytes
  and capture lineage. New paths reuse illustrations; the onsite duplicate diagram
  remains explicitly source-backed, not proof of executing a new onsite save/retry.

## Gates and remaining human evidence

Relevant engine contracts cover grouped schema types/targets; actual five-page
book navigation and computed target page; default books without navigation;
reserved/unknown fragment behavior preserving a good PDF; relocated second-book
rendering; asset confinement; atomic promotion; and full Thai NFKC-equivalent
text preservation. Source review is not a substitute for a first-time reader.
Root owns final page-by-page raster acceptance and the separate novice trial.
