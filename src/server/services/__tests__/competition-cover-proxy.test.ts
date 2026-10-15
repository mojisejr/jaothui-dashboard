import handler from "~/pages/api/competitions/cover";
import type { NextApiRequest, NextApiResponse } from "next";
const mockAuth = jest.fn();
const mockUpload = jest.fn();
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token: string) => Boolean(mockAuth(token)),
}));
jest.mock("~/server/services/competition-admin-api-client", () => ({
  competitionAdminApiClient: {
    upload: (...args: unknown[]) =>
      mockUpload(...args) as Promise<{ assetId: string; url: string }>,
  },
  CompetitionApiError: class extends Error {},
}));
function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
it("rejects unauthenticated uploads before reading data", async () => {
  const res = response();
  await handler(
    { method: "POST", headers: {} } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockUpload).not.toHaveBeenCalled();
});
it("enforces raw four megabyte limit at the dashboard hop", async () => {
  mockAuth.mockReturnValue(true);
  const res = response();
  await handler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer valid",
        "content-type": "image/png",
        "content-length": String(4 * 1024 * 1024 + 1),
      },
    } as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(res.status).toHaveBeenCalledWith(413);
});
it("forwards raw bytes with filename after validating the dashboard session", async () => {
  mockAuth.mockReturnValue(true);
  mockUpload.mockResolvedValue({
    assetId: "image-test",
    url: "https://image.test",
  });
  const res = response();
  const req = {
    method: "POST",
    headers: {
      authorization: "Bearer valid",
      "content-type": "image/png",
      "x-file-name": encodeURIComponent("รูป.png"),
    },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("raw-image");
    },
  };
  await handler(
    req as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  expect(mockAuth).toHaveBeenCalledWith("valid");
  expect(mockUpload).toHaveBeenCalledWith(
    Buffer.from("raw-image"),
    "image/png",
    "รูป.png",
  );
  expect(res.status).toHaveBeenCalledWith(200);
});
