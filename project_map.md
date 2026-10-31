# Project Map: jaothui-dashboard

## Purpose

Shared-account operator dashboard for JAOTHUI buffalo records, news and competition management. The competition workspace is a pre-release candidate under issues#56/#106 until the source-first cutover and operator acceptance are recorded. It does not replace public LINE login or vote/raffle.

## Data ownership and routes

| Surface | Entry point | Authority |
| --- | --- | --- |
| Buffalo create/edit | `src/pages/dashboard/new-buffalo-info`, `update-buffalo-info`, `update-buffalo-dna` | Core PostgreSQL, durable journal, existing chain96 contracts and scoped storage writer |
| Competition workspace | `src/pages/dashboard/competitions` | `jaothui-event` source backend and its original Sanity dataset |
| Competition applications/onsite/export | `src/pages/dashboard/competitions/[id]` | Protected server-to-server source API; event ID preserved throughout |
| Legacy export | `src/pages/dashboard/event-export.tsx` | Same authoritative source export DTO and format engines; no alternate age calculation |
| News | `src/pages/dashboard/news-events` | Existing frontend news admin bridge |

`src/context/auth.context.tsx` and the existing shared-account JWT protect the dashboard. `src/server/api/root.ts` composes independent competition, buffalo and news routers. `src/server/services/competition-admin-api-client.ts` owns the source REST bridge; credentials stay on the server. The dashboard does not become a second writer for competition domain data.

## Design

[DESIGN.md](DESIGN.md) is canonical. Competition screens reuse Header/AmbientOrbs and existing near-black orange/purple glass. Buffalo forms preserve their existing BaseLayout/DaisyUI controls and durable transaction flow; [buffalo scope](docs/buffalo-integrity-design.md) records those independent details. No new UI library or whole-dashboard redesign.

## Operational rules and challenges

- Event lifecycle and public registration status are separate. All dates are day-only Asia/Bangkok; the closing day is inclusive. Age cutoff is independent from registration closing date.
- Class builder uses existing Sanity string fields with a compatible codec, national-backed rows for new events, and readable legacy province rows. Stored application age wins during export, including zero.
- Competition export uses source-owned per-event layouts and a strict versioned presentation packet. Both download entry points share Thai labels, ordered groups and linked contents in the existing information sheet; missing/ambiguous mappings block download. Layout-only writes preserve signup rules and original applications. [Export setup/UAT](docs/competition-export.md) records source-first release and owner UI/Excel acceptance still pending; synthetic contract fixtures prove compatibility, not readiness of every live event.
- Source revisions/idempotency keys guard conflicting writes. A shared login cannot identify individual staff or prove the identity of a special-rule reviewer.
- Approval result and LINE provider outcome are separate. Retrying notification must not reapprove an application. Provider acceptance is not physical delivery/read proof.
- Cutover disables obsolete competition APIs only after the new dashboard is ready. It must not remove public signup/history or vote/raffle. Recovery disables new bridge writes and preserves compatible readers, IDs and history.
- Never restore the old buffalo writer routes or change production buffalo signer/storage/DB settings as part of competition deployment.

## Verification and release

Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and existing news environment/UI smokes for shared-path changes. Meaningful competition and buffalo guard regressions remain in their owning test suites. Fork/database integration tests need their explicitly isolated infrastructure; a normal suite run is not a new blockchain proof.

[Competition guide](docs/competition-workspace.md) and [release/operator guide](docs/competition-release.md) describe source-first deployment, actual cutover and recovery. Web-eye artifacts belong to the HQ competition-admin phase5 sink, not this source repository. Physical LINE delivery and operator acceptance remain explicit prerequisites for a full delivered claim.
