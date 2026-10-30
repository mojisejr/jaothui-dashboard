import type { ExportLayout } from "~/lib/competition-export-layout";
export const layoutFixture = (): ExportLayout => ({
  version: 1,
  reviewedCatalogFingerprint: "a".repeat(64),
  aliases: [],
  categories: [
    {
      id: "cat-one",
      level: "national",
      catalogValue: "รุ่นลูกควาย",
      registrationTypeValues: ["รุ่นลูกควาย"],
      posterNumber: "1",
      fullLabelTh: "รุ่นลูกควาย",
      shortLabelTh: "ลูก",
      groups: [
        { color: "black", sex: "male" },
        { color: "black", sex: "female" },
      ],
    },
  ],
});
export const detailFixture = () => ({
  exportPresentationVersion: 1 as const,
  event: {
    _id: "event.one",
    _rev: "rev1",
    title: "งานทดสอบ",
    description: "",
    location: "",
    catalogs: { national: ["รุ่นลูกควาย", "รุ่นควายรุ่น"], province: [] },
    registrationCount: 1,
    policy: {
      today: "2026-10-31",
      lifecycle: "ongoing",
      publicRegistration: "closed-manual",
      publicVisible: true,
      onsiteAllowed: true,
      warnings: [],
    },
  },
  layout: layoutFixture(),
  proposedLayout: layoutFixture(),
  rowCount: 1,
  ageWarningCount: 0,
  bindings: [
    {
      rawType: "รุ่นลูกควาย",
      level: "ประเทศ",
      color: "black",
      sex: "male",
      count: 1,
      catalogValue: "รุ่นลูกควาย",
    },
  ],
  plan: {
    version: 1 as const,
    state: "ready" as const,
    eventId: "event.one",
    eventRevision: "rev1",
    catalogFingerprint: "a".repeat(64),
    layoutFingerprint: "b".repeat(64),
    diagnostics: [],
    groups: [
      {
        key: "group-one",
        categoryId: "cat-one",
        ordinal: 1,
        posterNumber: "1",
        sheetName: "01-ลูก-ดำ-ผู้",
        fullClassLabel: "รุ่นลูกควาย",
        levelLabel: "ระดับประเทศ",
        colorLabel: "ดำ",
        sexLabel: "ผู้",
        registrationIds: ["reg1"],
      },
    ],
  },
});
