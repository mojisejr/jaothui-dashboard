/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Readable } from "stream";
import { type NextApiRequest, type NextApiResponse } from "next";
const mockRuntime = jest.fn<unknown, []>();
jest.mock("../runtime", () => ({ getCreateRuntime: () => mockRuntime() }));
jest.mock("~/server/services/auth.service", () => ({
  isAuth: (token: string) => token === "synthetic-auth",
}));
import handler, { config } from "~/pages/api/buffalo-create/image";
import { RAW_IMAGE_LIMIT } from "../contract";
function request(
  bytes: Buffer,
  headers: Record<string, string> = {},
  query: Record<string, string> = {
    id: "00000000-0000-4000-8000-000000000031",
    version: "0",
  },
) {
  return Object.assign(Readable.from([bytes]), {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-auth",
      "content-type": "image/png",
      "content-length": String(bytes.length),
      ...headers,
    },
    query,
  }) as NextApiRequest;
}
function response() {
  const json = jest.fn();
  const result = {
    status: jest.fn().mockReturnThis(),
    json,
    setHeader: jest.fn(),
  };
  return { res: result as unknown as NextApiResponse, ...result };
}
beforeEach(() => jest.clearAllMocks());
test("raw route bypasses encoded parser and accepts a near-2MB request without 413", async () => {
  expect(config.api.bodyParser).toBe(false);
  const upload = jest.fn();
  mockRuntime.mockReturnValue({ workflow: { upload } });
  const bytes = Buffer.alloc(RAW_IMAGE_LIMIT - 1);
  const res = response();
  await handler(request(bytes), res.res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(upload).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    0,
    bytes,
    "image/png",
  );
});
test("auth and strict boundaries reject before any image can bind", async () => {
  const upload = jest.fn();
  mockRuntime.mockReturnValue({ workflow: { upload } });
  const noAuth = response();
  await handler(request(Buffer.from("x"), { authorization: "" }), noAuth.res);
  expect(noAuth.status).toHaveBeenCalledWith(401);
  expect(mockRuntime).not.toHaveBeenCalled();
  const tooLarge = response();
  await handler(request(Buffer.alloc(RAW_IMAGE_LIMIT)), tooLarge.res);
  expect(tooLarge.status).toHaveBeenCalledWith(413);
  const mismatch = response();
  await handler(
    request(Buffer.from("x"), { "content-length": "2" }),
    mismatch.res,
  );
  expect(mismatch.status).toHaveBeenCalledWith(400);
  const spoof = response();
  await handler(
    request(
      Buffer.from("x"),
      {},
      {
        id: "00000000-0000-4000-8000-000000000031",
        version: "0",
        owner: "foreign",
      },
    ),
    spoof.res,
  );
  expect(spoof.status).toHaveBeenCalledWith(400);
  expect(upload).not.toHaveBeenCalled();
});
test("private runtime exceptions never leak authorization into upload responses", async () => {
  mockRuntime.mockImplementationOnce(() => {
    throw Error("privateKey signed_bytes secret");
  });
  const res = response();
  await handler(request(Buffer.from("x")), res.res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: "IMAGE_UPLOAD_REJECTED",
      diagnostic: expect.objectContaining({
        code: "IMAGE_UPLOAD_REJECTED",
        requestId: expect.any(String),
      }),
    }),
  );
});
