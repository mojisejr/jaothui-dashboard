import type { NextApiRequest, NextApiResponse } from "next";
import handler from "~/pages/api/competitions/export";
const mockAuth = jest.fn();
const mockExport = jest.fn();
const mockWorkbook = jest.fn();
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token: string) => Boolean(mockAuth(token)),
}));
jest.mock("~/server/services/competition-admin-api-client", () => ({
  competitionAdminApiClient: {
    exportData: (...args: unknown[]) => mockExport(...args) as Promise<unknown>,
  },
  CompetitionApiError: class extends Error {},
}));
jest.mock("~/server/services/competition-export.service", () => ({
  createCompetitionWorkbook: (...args: unknown[]) =>
    mockWorkbook(...args) as Buffer,
  createCompetitionDocxZip: jest.fn(),
  safeExportName: () => "งาน",
  CompetitionExportError: class extends Error {},
}));
const response = () => {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue(true);
});
it("rejects unauthenticated export before loading any applicant data", async () => {
  const res = response();
  await handler(
    {
      method: "GET",
      headers: {},
      query: { id: "event", format: "xlsx" },
    } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockExport).not.toHaveBeenCalled();
});
it("rejects arbitrary paths and unsupported formats", async () => {
  const res = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer session" },
      query: { id: "../other", format: "csv" },
    } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockExport).not.toHaveBeenCalled();
});
it("authenticates, fetches by event ID and sends matching binary and identity headers", async () => {
  const data = { event: { title: "งาน" }, rowCount: 3 };
  mockExport.mockResolvedValue(data);
  mockWorkbook.mockReturnValue(Buffer.from("xlsx"));
  const res = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer session" },
      query: { id: "event-106", format: "xlsx" },
    } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(mockAuth).toHaveBeenCalledWith("session");
  expect(mockExport).toHaveBeenCalledWith("event-106");
  expect(mockWorkbook).toHaveBeenCalledWith("event-106", data);
  expect(res.setHeader).toHaveBeenCalledWith("X-Competition-Id", "event-106");
  expect(res.setHeader).toHaveBeenCalledWith("X-Record-Count", "3");
  expect(res.send).toHaveBeenCalledWith(Buffer.from("xlsx"));
});
it("keeps legacy event IDs containing dots valid", async () => {
  mockExport.mockResolvedValue({ event: { title: "งาน" }, rowCount: 0 });
  mockWorkbook.mockReturnValue(Buffer.from("xlsx"));
  const res = response();
  await handler(
    {
      method: "GET",
      headers: { authorization: "Bearer session" },
      query: { id: "event.legacy-106", format: "xlsx" },
    } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(mockExport).toHaveBeenCalledWith("event.legacy-106");
  expect(res.status).toHaveBeenCalledWith(200);
});
