# Controlled production rollout

On 20 October 2026 the owner explicitly approved **production แบบจำกัดวง**: prepare backups and configuration, let one owner/staff member perform a genuine operation with joint verification, then broaden. The owner accepts that hosted-specific behavior is first checked on production. This replaces the separate hosted staging prerequisite in the earlier local qualification and operator documents for this release. It does not relabel hosted staging as tested.

## Release sequence

1. Preserve a private production database archive, storage/policy/grant inventory, existing migration checksums and the exact previous deployment. Verify the archive is readable and includes the core and storage data. Keep secrets and backups outside Git.
2. Merge the frontend-owned additive migration package, verify its exact checksum and apply through the existing Prisma lineage. Public buffalo/reward/account data is not part of this migration.
3. Prepare dashboard production-only configuration with mode `off`, the existing signer and original NFT recipient, pinned chain96/contracts/code/checkpoint, three confirmations, the qualified fee ceiling and the dedicated finite-expiry storage JWT. Do not rotate the project key, expose credentials to previews or fall back to service_role.
4. Merge the dashboard candidate into staging, then use a separate staging-to-main promotion PR. Verify the promoted application tree matches the qualified candidate. Deploy compatible code off, reject legacy write routes, wait for existing signer transactions to settle, then apply the reviewed scoped cutover transaction.
5. Verify the actual hosted writer, immutable assets, denied untrusted protected writes, public DB/certificate/image reads and private-journal denial. Synthetic storage probes use only a unique release operation directory; they never create a buffalo/NFT/reward record.
6. Open a coordinated trial window for one designated human. Use only the current production URL and refresh old tabs. The shared account does not provide a technical per-person rollout restriction: the limited circle is coordinated operationally. Oracle does not choose a cow, send a mainnet transaction or automatically open the workflow to the whole team.
7. Check the genuine operation's final status, canonical receipts, DB fields, image/JSON aliases and preserved data. Complete both create and edit acceptance before declaring the production integrity path verified. Until then report `PRODUCTION_DEPLOYED_CANARY_PENDING`, not full production verification.

Public searches should remain available during the change. Buffalo create/edit may be paused while the compatible release and policies are installed. If a provider/identity/preservation check fails, keep new writes off or drain, retain signed journals and restrictive policies, and repair forward. Follow [OPERATOR.md](OPERATOR.md) for the compatible rollback; never restore broad anonymous writes to make old code work.

## Operator handoff

The scoped writer token prepared for this release expires **18 January 2027 at 18:48:02 Asia/Bangkok**. Renew it with the same narrow role before expiry and update only the production secret, then verify the replacement on a unique operation asset. Do not rotate the project-wide JWT authority solely for renewal. Stateless old tokens can remain valid until expiry; emergency rollback disables the writer role/policy for all tokens. Keep renewal ownership and an advance reminder in the operator's release checklist.

Give the designated tester [STAFF.md](STAFF.md). The first real operation must be explicitly chosen by that human; the old token1360 repair authorization is not reused. Event admin migration, vote behavior, LINE notifications and unrelated repairs remain outside this release.
