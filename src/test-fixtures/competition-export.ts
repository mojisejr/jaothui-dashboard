import { createHash } from "node:crypto";
import type { ExportGroup } from "~/lib/competition-export-layout";

/** Explicit source descriptors; this helper never groups rows by display text. */
export function sourceExportFixture<
  T extends {
    event: {
      _id: string;
      _rev: string;
      catalogs: { national: string[]; province: string[] };
    };
    registrations: Array<{ _id: string; type: string }>;
    rowCount: number;
  },
>(
  packet: T,
  groups: Array<Partial<ExportGroup> & { registrationIds: string[] }>,
) {
  return {
    ...packet,
    exportPresentationVersion: 1 as const,
    registrations: packet.registrations.map((row) => ({
      ...row,
      rawType: row.type,
    })) as Array<T["registrations"][number] & { rawType: string }>,
    exportPlan: {
      version: 1 as const,
      state: "ready" as const,
      eventId: packet.event._id,
      eventRevision: packet.event._rev,
      catalogFingerprint: createHash("sha256")
        .update(
          JSON.stringify({
            national: packet.event.catalogs.national,
            province: packet.event.catalogs.province,
          }),
        )
        .digest("hex"),
      layoutFingerprint: "b".repeat(64),
      diagnostics: [],
      groups: groups.map(
        (group, index): ExportGroup => ({
          key: `group-${index + 1}`,
          categoryId: `category-${index + 1}`,
          ordinal: index + 1,
          posterNumber: String(index + 1).padStart(2, "0"),
          sheetName: `${index + 1}-รุ่น-ดำ-ผู้`,
          fullClassLabel: "รุ่นลูกควาย",
          levelLabel: "ระดับประเทศ",
          colorLabel: "ดำ",
          sexLabel: "ผู้",
          ...group,
        }),
      ),
    },
  };
}
