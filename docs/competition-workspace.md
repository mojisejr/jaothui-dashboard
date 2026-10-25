# Competition workspace — operator guide

Issue: #56. Event setup, controls, applications, onsite and export are implemented.
The release remains held for Phase5 regression, controlled LINE and operator acceptance.

## Use the workspace

Sign in with the dashboard's existing shared team account, then open
`/dashboard/competitions` from the dashboard hub. The shared account does not
identify individual staff or authenticate a named rule reviewer.

- Search and combine event, registration, form-type and event-date filters.
  Event status and registration status are separate; inspect historical-data
  warnings before editing an older event.
- Create a draft, upload a cover, enter event details and dates, and copy/edit
  the class list using one row per class. New events use the single “รุ่นแข่งขัน” list (national-backed storage); provincial rows appear only when older data already has them. Save the draft before publishing.
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

## Build competition classes

Use “เพิ่มรุ่น”, select an optional group, and choose age or special eligibility.
Set minimum and/or inclusive maximum in months. The minimum can mean “ตั้งแต่”
(inclusive) or “มากกว่า” (exclusive). Age classes require at least one bound;
special classes can omit both. Generated names follow the group and range;
choose a custom display name for teeth categories or other organizer wording.
Copy a row to create the next range, then change its name/rules: duplicate display
names are blocked even when the underlying rules differ. Delete unwanted rows.

Use the birthday tester after selecting the event's buffalo age cutoff. It uses
the existing ceiling-month convention: 9 months 1 day means 10 months; 12 months
exactly does not qualify for a >12 range. Younger buffalo cannot enter a higher
range. Royal albino keeps its existing one-day birthday adjustment, shown in
the tester. Neither registration closing date nor today's date sets age.

For special classes, optional age bounds still apply automatically. Teeth,
mother-with-calf and other non-age criteria remain staff checks; a calf's age is
not the mother's age. Staff enter a readable name/criteria, never JSON or `[SP]`.

Sanity schemas remain unchanged. Versioned rules live in the existing string
arrays, while public choices and stored application types contain readable names.
Unedited legacy rows retain their exact stored strings; unclear old age text
shows a review warning and is not silently converted. Editing those rows requires
clear rules before saving. General edits can preserve untouched legacy arrays.
Existing provincial rows are not merged, migrated, or deleted automatically.

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

## Applications, onsite and export

Open an event's applications to search and filter by approval/type/level/sex/color.
Absent approval is pending, not rejected. Review images, address and applicant
information; nullable legacy data remains readable. Reject with a reason.
Approval-save and LINE delivery/retry states are separate; provider acceptance
does not prove a person read the message. Never repeat approval solely to retry
notification. Staff onsite can continue after public registration closes, until
the event ends, with the source age cutoff and explicit duplicate override.

Export from the event context or the existing /dashboard/event-export page. Both
use the source export contract; stored ages, including zero, take precedence.
Missing ages use only the event's age cutoff and show warnings when unavailable.
The old route does not invent an age from today's date or the event start.

## Release and recovery

Follow [competition release/operator handover](competition-release.md) for the
source-first sequence, environment checks, legacy link/API cutover and recovery.
Actual LINE and production changes need their explicit approved boundaries.
Existing buffalo production settings and public applicant LINE login are unchanged.
Local tests are isolated to designated Sanitydev synthetic records; no physical
LINE receipt or complete operator acceptance is claimed by this guide.

### เลือกวันที่ พ.ศ. ในโซนการแข่งขัน

วันที่ทั้ง 9 ช่องในรายการงาน ตั้งค่างาน ทดลองคำนวณอายุ และลงทะเบียนหน้างาน
ใช้ตัวเลือก **วัน / เดือนภาษาไทย / ปี พ.ศ.** เช่น 25 ต.ค. 2569
ระบบแปลงเป็น `2026-10-25` ก่อนส่ง API และเก็บฐานข้อมูลตามรูปแบบเดิม
วันปิดรับสมัครยังรับได้ถึงสิ้นวันไทย (Asia/Bangkok) และการตัดอายุไม่เปลี่ยนแปลง

- เลือกทั้งสามส่วนให้ครบก่อนบันทึก หากเปลี่ยนเดือนหรือปีแล้ววันเดิมไม่มีจริง
  ระบบแสดงข้อความให้เลือกวันใหม่ โดยไม่เลื่อนหรือปัดวันให้เอง
- งานร่างยังเว้นวันที่ว่างได้ กด **ล้างวันที่** เพื่อล้างทั้งช่องอย่างชัดเจน
  หากกรอกเพียงบางส่วน ระบบจะกันการบันทึก/เปลี่ยนสถานะ/สร้างรายงานผลกระทบ
  และเตือนก่อนออกจากหน้าที่แก้ค้าง
- ตัวกรองวันที่ในรายการงานใช้เฉพาะวันที่ที่เลือกครบและถูกต้อง
  การแก้เหลือเพียงบางส่วนจะพักตัวกรองช่องนั้นและกลับหน้า 1
  กด **ล้างตัวกรอง** เพื่อล้างวัน เดือน ปี และเงื่อนไขทั้งหมด
- ปีที่เคยบันทึกนอกช่วงตัวเลือกยังแสดงได้ เลือก **แสดงปีเพิ่มเติม…**
  เพื่อขยายช่วงปี ตัวเลือกปีไม่ใช่เงื่อนไขจำกัดสิทธิ์สมัคร
- วันเกิดจากทะเบียนจะใส่ทั้งสามส่วนเมื่อกดนำข้อมูลมาใช้เท่านั้น
  การแก้วันเกิดหรือรับข้อมูลทะเบียนใหม่จะล้างรุ่นที่เคยเลือก ให้เลือกรุ่นตามอายุล่าสุด
  เมื่อบันทึกหน้างานสำเร็จ ฟอร์มและวันที่จะว่างพร้อมรายการถัดไป
