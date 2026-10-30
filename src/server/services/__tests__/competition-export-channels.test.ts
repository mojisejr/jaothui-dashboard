/** @jest-environment node */
import type { NextApiRequest, NextApiResponse } from "next";
import { read, utils, type CellObject } from "xlsx";
import handler from "~/pages/api/competitions/export";
import { createLegacyCompetitionExport } from "../legacy-competition-export.service";
import { sourceExportFixture } from "~/test-fixtures/competition-export";
import { exportDataSchema } from "~/lib/competition-applications";

const mockSource = jest.fn();
jest.mock("~/server/services/auth.service", () => ({ isAuth: () => true }));
jest.mock("~/server/services/competition-admin-api-client", () => ({
  competitionAdminApiClient: {
    exportData: (...args: unknown[]) => mockSource(...args) as Promise<unknown>,
  },
  CompetitionApiError: class extends Error {},
}));
function packet() {
  return exportDataSchema.parse(
    sourceExportFixture(
      {
        registrationPolicyVersion: 1,
        event: {
          _id: "event",
          _rev: "rev",
          title: "งานทดสอบ",
          catalogs: { national: [], province: [] },
          registrationCount: 1,
          policy: {
            today: "2026-10-31",
            lifecycle: "ended",
            publicRegistration: "closed-date",
            publicVisible: true,
            onsiteAllowed: false,
            warnings: [],
          },
        },
        registrations: [
          {
            _id: "row",
            _rev: "rev",
            event: { _ref: "event" },
            type: "รุ่นเดิม",
            level: "national",
            sex: "male",
            color: "black",
            name: "ProperName",
            microchip: "00001",
            ownerTel: "0800000000",
            exportAge: 0,
            buffaloAge: 0,
            ageSource: "stored",
            registrationPolicyVersion: 1,
            approvalRequirement: "not_required",
            registrationStatus: "registered",
          },
        ],
        rowCount: 1,
      },
      [{ sheetName: "01-ลูกดำ-ผู้", registrationIds: ["row"] }],
    ),
  );
}
function response() {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    send: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}
const request = {
  method: "GET",
  headers: { authorization: "Bearer session" },
  query: { id: "event", format: "xlsx" },
} as unknown as NextApiRequest;
beforeEach(() => {
  jest.clearAllMocks();
  mockSource.mockResolvedValue(packet());
});

it("delivers semantically identical actual XLSX with links and counts through legacy and binary routes", async () => {
  const legacy = await createLegacyCompetitionExport("event", "xlsx");
  const res = response();
  await handler(request, res as unknown as NextApiResponse);
  expect(res.status).toHaveBeenCalledWith(200);
  const legacyBook = read(Buffer.from(legacy.buffer, "base64"), {
    type: "buffer",
  });
  const binaryBook = read((res.send.mock.calls as Array<[Buffer]>)[0]![0], {
    type: "buffer",
  });
  expect(binaryBook.SheetNames).toEqual(legacyBook.SheetNames);
  expect(legacy.sheetCount).toBe(binaryBook.SheetNames.length);
  for (const name of binaryBook.SheetNames) {
    expect(
      utils.sheet_to_json(binaryBook.Sheets[name]!, { header: 1 }),
    ).toEqual(utils.sheet_to_json(legacyBook.Sheets[name]!, { header: 1 }));
    expect(
      (binaryBook.Sheets[name]?.A1 as CellObject | undefined)?.l?.Target,
    ).toBe((legacyBook.Sheets[name]?.A1 as CellObject | undefined)?.l?.Target);
  }
});

it("returns strict actionable preflight failure and no binary from either channel", async () => {
  const data = packet();
  data.exportPlan.state = "needs-review";
  data.exportPlan.diagnostics = [
    { code: "UNMAPPED_REGISTRATION", message: "กรุณาผูกรุ่นให้ครบ" },
  ];
  mockSource.mockResolvedValue(data);
  await expect(
    createLegacyCompetitionExport("event", "xlsx"),
  ).rejects.toMatchObject({ diagnostics: data.exportPlan.diagnostics });
  const res = response();
  await handler(request, res as unknown as NextApiResponse);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ diagnostics: data.exportPlan.diagnostics }),
  );
  expect(res.send).not.toHaveBeenCalled();
});
