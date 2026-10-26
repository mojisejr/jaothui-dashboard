# Editorial source truth — full manual 0.2 (#62)

Reviewed 26 October 2026, Asia/Bangkok. Phase 2, source/editorial review.
The full book has separate cover/contents and 23 procedure/reference chapters.
Page numbers follow `manual.json` and the build report; chapter identifiers are
stable if later pagination changes. Capture truth belongs to
`capture-manifest-full.json`, maintained separately by the browser/capture owner.

Dashboard baseline: `a25e5a8` on `feature/book-publish`; application source remains
unchanged from `d39b21f` staging. Event source references below use the companion
competition-admin checkout, revision `291193f`; the main event checkout was older
and was not substituted for the current competition implementation.

## Source map and editorial checks

All Dashboard paths are repository-relative. Event paths refer to jaothui-event.
`✓` means the text/action was checked against code, not that a novice or a physical
print trial has passed.

| Chapter ID | Verbatim UI / behavior checked | Source of truth | Editorial |
|---|---|---|---|
| login | username, password, Login; shared Dashboard auth; event nav; Logout | `src/components/auth/LoginForm.tsx`; `src/context/auth.context.tsx`; `src/components/competitions/Workspace.tsx`; `src/components/ui/Header.tsx` | ✓ |
| states | ร่าง, ยังไม่เริ่มงาน, กำลังจัดงาน, จบตามกำหนด, ปิดงานด้วยมือ; distinct signup states | `src/lib/competitions.ts` (`lifecycleLabels`, `registrationLabels`); `Workspace.tsx` (`Status`); Event `src/server/services/competition-policy.ts` | ✓ |
| find-events | ค้นหาชื่องาน, สถานะงาน, การรับสมัคร, ประเภทฟอร์ม, date filters, ล้างตัวกรอง; page size12 | `src/pages/dashboard/competitions/index.tsx` | ✓ |
| draft | สร้างงานแข่งขัน, ชื่องาน, รายละเอียด, สถานที่, บันทึกงานร่าง, บันทึกการแก้ไข; new draft hidden | `src/pages/dashboard/competitions/new.tsx`; `src/components/competitions/CompetitionEditor.tsx` (`save`, `accept`) | ✓ |
| cover-image | รูปปก; JPEG/PNG/WebP/GIF ≤4MiB; upload distinct from save | `CompetitionEditor.tsx` (`upload`); `src/pages/api/competitions/cover.ts` | ✓ |
| thai-dates | five dates; three-part BE UI; Gregorian storage; Bangkok inclusive close | `CompetitionEditor.tsx` (`dateFields`); `ThaiDateInput.tsx`; `src/lib/competition-thai-date.ts`; Event `competition-policy.ts` | ✓ |
| copy-classes | คัดลอกเป็นงานใหม่ vs ใช้ชุดรุ่นนี้; latest100 templates; no entrants copied; legacy province retained | `CompetitionEditor.tsx` (`copyCatalog`, `runAction`); Event `src/server/admin/competition-service.ts` (`clone`) | ✓ |
| class-rules | เพิ่มรุ่น; min inclusive/exclusive; max inclusive; auto/custom name; copy/delete; max200/collection | `ClassCatalogEditor.tsx`; `src/lib/competition-classes.ts`; `src/lib/competitions.ts` (`catalog`) | ✓ |
| age-and-special | ceil-day month; strict bands; special min24; manual criteria | `ClassAgeTester.tsx`; `src/lib/competition-age-preview.ts`; `src/lib/competition-classes.ts`; Event `competition-policy.ts` | ✓ |
| publish | เผยแพร่งาน; save before state changes; publish does not override dates; post-entrant lock + external review | `CompetitionEditor.tsx` (`runAction`, `makeReport`, `applyReview`); Event `src/server/admin/competition-service.ts` | ✓ |
| applications | search name/owner/chip, status/type/level/sex/color; page size20; channel labels | `ApplicationsList.tsx`; `src/lib/competition-applications.ts` | ✓ |
| application-detail | stored age, no-data messages, owner/contact/address/images; เปิดภาพ; โหลดข้อมูลล่าสุด | `ApplicationReview.tsx`; `src/lib/competition-applications.ts` (`applicationSchema`) | ✓ |
| royal | explicit separate event; same review component; black age12; albino birthday−1day; source attachments | Dashboard `ApplicationReview.tsx`, `ClassAgeTester.tsx`, `competition-age-preview.ts`; Event `src/components/Events/RoyalForm.tsx`, `src/pages/events/[eventId].tsx`, `competition-policy.ts` | ✓ |
| decision | บันทึกอนุมัติ / บันทึกไม่อนุมัติ; reason required; no send in save; shared account limitation | `ApplicationReview.tsx` (`save`); `src/lib/competition-applications.ts` (`approvalInputSchema`) | ✓ |
| line | ส่ง / ลองส่ง LINE; provider acceptance distinct from receipt; sending/uncertain/review/disabled/no-recipient | `ApplicationReview.tsx` (`send`, `canSend`); `competition-applications.ts` (`notificationLabels`); Event `src/server/admin/competition-service.ts` | ✓ |
| signup-control | ปิดรับสมัคร vs เปิดรับสมัครตามกำหนด; save before action; dates still apply; onsite distinct | `CompetitionEditor.tsx` (`runAction`); Event `competition-policy.ts` | ✓ |
| onsite | ค้นหาข้อมูลและตรวจซ้ำ; explicit metadata apply; birthday/sex/color/class; บันทึกลงทะเบียนหน้างาน | `OnsiteRegistrationForm.tsx` (`lookup`, `applyMetadata`, `submit`); `src/lib/competition-onsite.ts` | ✓ |
| onsite-duplicate | reason≥10; inspect existing registrations; ลองคำขอเดิมอีกครั้ง; success+refresh-failure differs | `OnsiteRegistrationForm.tsx` (`duplicateCount`, `retry`, `submit`); `competition-onsite.ts` (`validateOnsite`) | ✓ |
| close-event | ปิดงาน ends both channels; no reopen UI; history/export readable | `CompetitionEditor.tsx` (`runAction`, rendered actions); Event `competition-policy.ts` | ✓ |
| export | ดาวน์โหลด Excel / ดาวน์โหลดใบสมัคร DOCX (ZIP); all statuses, not application filters; stored age including0 then cutoff fallback | `src/pages/dashboard/competitions/[id]/export.tsx`; `src/server/services/competition-export.service.ts` | ✓ |
| recovery | stale reload warning discards event edits; review retains comment; onsite same request; avoid raw DB fix | `CompetitionEditor.tsx`; `ApplicationReview.tsx` (`refresh`); `OnsiteRegistrationForm.tsx` (`submit`) | ✓ |
| quick-reference | action/result map and two exact age examples | above sources; `competition-age-preview.ts` | ✓ |
| admin-appendix | variable names only; no values/key; runtime switches distinct from public signup | `src/env.js`; `src/server/services/competition-admin-api-client.ts`; Event `src/pages/api/admin/competitions/[[...path]].ts`, `src/server/admin/competition-auth.ts`, `competition-service.ts`, `legacy-competition-cutover.ts` | ✓ |

## Fixture consistency

- Main `BOOK-COMP-261069 - สนามตัวอย่างเจ้าทุย`, normal, event26–31Oct2569,
  signup26–30Oct2569, cutoff26Oct2569.
- Classes: min10 inclusive/max12; min12 exclusive/max15; special min24 inclusive,
  staff checks teeth/other organizer requirements.
- ฟ้าครามตัวอย่าง `000000261069001`, DOB25Oct2568 →13 months (ceil12months1day).
- พายุฟ้าตัวอย่าง `000000261069002`, DOB26Oct2568 →12 months.
- Separate Royal `BOOK-ROYAL-261069 - ตัวอย่าง Royal แยกจากงานหลัก`:
  นิลมงคลตัวอย่าง `000000261069003`, black, DOB26Oct2568 →12 months.
  With albino calculation the same birthday shifts back one day →13 months.
- All contact phones `0000000000`. Addresses/identities are explicitly synthetic;
  no real identity-card number or private participant capture is permitted.
- Royal capture may be a staff-entered synthetic record. It demonstrates the
  review UI and must not be represented as proof of a completed public signup.

## Release truth and limits

Upstream current release runbook was read at
`ψ/writing/jaothui-dashboard/production-2026-10-26/RUNBOOK-PRODUCTION.md` in HQ.
Do not copy stale “release remains held” text from older repository docs. The
manual explains the current UI without claiming unobserved production receipts.
Local capture has actual LINE delivery disabled; a pictured status never proves
a live message. No production event or participant was created for this book.

Phase 2 editorial and page review do not close Phase 3 intended-viewer,
physical-print or first-time-reader acceptance. Record those results separately;
never turn a structural build pass into a read-once usability claim.

## Capture-specific qualification

The onsite form illustration records actual filled dev UI. The duplicate/retry
illustration is explicitly a source-backed decision diagram, not reconstructed
UI or proof that an onsite save/retry was executed in this slice. Prior app QA
is separate evidence. No real LINE delivery was attempted for the book.
