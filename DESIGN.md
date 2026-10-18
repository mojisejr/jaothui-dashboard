---
design_md_version: 3
body: canonical
project: jaothui-dashboard
token_source: tailwind.config.ts; src/styles/globals.css; src/pages/_app.tsx
verify_tokens:
  - name: primary
    expect: "#ff8c00"
    probe: "background-color on [data-buffalo-create] .btn-primary"
  - name: base-100
    expect: "#0f0f11"
    probe: "background-color on [data-theme=halloween]"
  - name: form-radius
    expect: "8px"
    probe: "border-radius on #create-name"
primitives:
  - name: BaseLayout
    file: src/components/layout/BaseLayout.tsx
    variants: [dashboard, inner-page]
  - name: DurableCreate
    file: src/components/new-buffalo-info/DurableCreate.tsx
    variants: [form, upload, review, pending, completed]
quality_gates:
  accessibility:
    contrast: "WCAG AA >=4.5:1 body and >=3:1 large text; inherited theme exceptions must be reported"
    labels_roles: "Every new control has a visible label; errors use role=alert and progress role=status; axe is unclaimed unless run"
  spacing:
    scale: "New form gaps/padding use Tailwind 4px scale"
  typography:
    family: "Kanit, Inter, sans-serif"
    body_min: "16px body; 14px supporting labels and status"
    numeric: "No predicted token input; receipt-bound token appears as text"
  touch:
    target_min: "New buttons, inputs and selects >=44x44 CSS px"
verify_eyes:
  owner: root CUA gate of record
  route: http://127.0.0.1:3153/dashboard/new-buffalo-info
  widths: [390, 768, 1440]
  evidence: /Users/non/dev/opilot/.playwright-mcp/jaothui-dashboard/buffalo-integrity/phase-3
  required: "Real upload, receipt pause, reload and re-auth resume, projection recovery, two tabs, rendered image naturalWidth>0"
---

# jaothui-dashboard — DESIGN.md

## 1. Visual Theme & Atmosphere
Internal livestock registry tools use the existing dark Halloween theme, orange actions and Kanit typography. Creation is a practical four-step form with factual transaction progress. Preserve the existing navigation and form vocabulary.

## 2. Color Palette & Roles
| Token | Value | Role |
|---|---|---|
| primary | #FF8C00 | Navbar, active step and primary actions |
| secondary | #9D00FF | Existing secondary theme role |
| base-100 | #0f0f11 | Main dark canvas |
| base-content | DaisyUI halloween theme | Body text |
| warning / success | DaisyUI halloween theme | Recoverable issue / verified completion |

## 3. Typography
Kanit 300–600 is loaded in _app with Inter fallback. Body uses 16px, headings 24px semibold, supporting form labels and transaction IDs 14px. Hashes wrap, avoiding horizontal overflow.

## 4. Component Stylings
Reuse DaisyUI `.input.input-bordered`, `.select.select-bordered`, `.file-input`, `.btn.btn-primary` and `.btn.btn-outline`. Form controls are full width. Disabled actions remain visibly disabled while a request is pending or its server stage forbids the action. Owned images use object-contain and preserve the whole animal.

## 5. Layout Principles
Creation uses one centered max-w-3xl column, 16px mobile and 24px wider padding, with 16–24px gaps. Form fields become two columns at the existing sm breakpoint. Review and status remain in one bordered surface.

## 6. Depth & Elevation
Keep BaseLayout's existing navbar shadow and lower rounded corners. Creation adds thin orange borders and ordinary rounded corners, without new gradients, blur or elevation layers.

## 7. Do's & Don'ts
- Do keep the two explicit Mint NFT / Mint Metadata actions and show receipt-derived status.
- Do preserve the operation number and permit reload/re-auth recovery.
- Don't show a guessed token ID, countdown as confirmation, or a success message before publication verification.
- Don't introduce another UI library, font package or shell redesign.

## 8. Responsive Behavior
At 390px controls stack and hashes wrap; step labels form two columns. At 768px and 1440px fields and step labels use the wider layout while the content width stays capped. New controls target at least 44px; uploaded images scale within the viewport without cropping.

## 9. Measurable Quality Gates
| Gate | PASS | FAIL |
|---|---|---|
| Accessibility | Visible control labels, keyboard actions, announced errors/progress | Missing labels or unreadable progress |
| Spacing | 4px scale and no horizontal overflow at 390/768/1440 | Clipped actions or overflow |
| Typography | Body16/support14 and wrapped hashes | Small body text or clipped IDs |
| Touch | New controls44px minimum | Unreachable or small actions |
| Workflow | Actual receipt, durable resume and published image render | New signature on repeat or false completion |

The parent CUA run records rendered evidence. Strict DESIGN schema validation is a source-contract check; it does not itself establish visual or axe compliance.

## 10. Agent Prompt Guide
Reuse the current BaseLayout and DaisyUI Halloween controls with orange actions, Kanit text and a dark canvas. Keep creation at four steps and preserve the two intentional blockchain actions. Every action must reflect the durable server job, with a recoverable status and wrapping transaction identifiers. Review the actual rendered page at all three widths through the parent CUA gate.

## Primitives (reuse-first)
| Primitive | File | Variants |
|---|---|---|
| BaseLayout | src/components/layout/BaseLayout.tsx | Dashboard/inner navigation |
| DurableCreate | src/components/new-buffalo-info/DurableCreate.tsx | Draft/upload/review/chain/completed |
| DaisyUI controls | tailwind.config.ts | input/select/file-input/btn/alert/status |

## Known Drift
- The inherited navbar back action is btn-sm with an icon and lacks an explicit accessible label; this phase scopes new form controls, and the parent must report inherited drift.
- Existing legacy forms contain smaller text and unlabeled placeholders. They are retained outside isolated creation until the release cutover.
- Legacy orange navbar text contrast and theme-derived colors require rendered review; no automatic axe pass is claimed.

## Design Brain Links
This scoped creation contract is grounded in the repository's existing design sources:

- [Tailwind and DaisyUI theme tokens](tailwind.config.ts) define the palette and reusable control styles.
- [Global styles](src/styles/globals.css) provide the shared page styling.
- [Application font setup](src/pages/_app.tsx) defines the loaded typography.
- [BaseLayout](src/components/layout/BaseLayout.tsx) provides the existing dashboard navigation and shell.
- [Creation page](src/pages/dashboard/new-buffalo-info/index.tsx) retains the legacy four-step flow and selects the isolated durable flow.
- [DurableCreate](src/components/new-buffalo-info/DurableCreate.tsx) implements the scoped form, review, upload and transaction status controls described here.
