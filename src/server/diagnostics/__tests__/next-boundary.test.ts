/** @jest-environment node */
import type * as TRPCModule from "~/server/api/trpc";
import type * as ZodModule from "zod";
import type * as TRPCServerModule from "@trpc/server";
jest.mock("superjson", () => ({
  __esModule: true,
  default: {
    serialize: (json: unknown) => ({ json }),
    deserialize: (v: { json: unknown }) => v.json,
  },
}));
jest.mock("~/server/db", () => ({ db: {} }));
jest.mock("~/server/services/auth.service", () => ({ isAuth: () => true }));
jest.mock("~/server/api/root", () => {
  const { createTRPCRouter, publicProcedure } =
    jest.requireActual<typeof TRPCModule>("~/server/api/trpc");
  const { z } = jest.requireActual<typeof ZodModule>("zod");
  const { TRPCError } =
    jest.requireActual<typeof TRPCServerModule>("@trpc/server");
  return {
    appRouter: createTRPCRouter({
      buffaloEdit: createTRPCRouter({
        write: publicProcedure
          .input(z.object({ name: z.string() }))
          .mutation(() => true),
      }),
      competition: createTRPCRouter({
        conflict: publicProcedure.query(() => {
          throw new TRPCError({
            code: "CONFLICT",
            message: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่",
          });
        }),
        gateway: publicProcedure.query(() => {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "บริการการแข่งขันไม่พร้อม",
          });
        }),
      }),
      newsEvents: createTRPCRouter({
        invalid: publicProcedure.query(() => {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "กรุณาระบุชื่อกิจกรรม",
          });
        }),
      }),
    }),
  };
});
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { type NextApiRequest, type NextApiResponse } from "next";
import handler, { config } from "~/pages/api/trpc/[trpc]";
let server: Server;
let origin: string;
const logs = jest.spyOn(console, "error").mockImplementation(() => undefined);
beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url!.split("?")[0]!.split("/").pop()!;
    Object.assign(req, { query: { trpc: path } });
    void handler(req as NextApiRequest, res as NextApiResponse);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trpc/`;
});
afterAll(async () => {
  logs.mockRestore();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test("actual Next handler owns parser and correlates invalid JSON and >8 MB payloads", async () => {
  expect(config.api.bodyParser).toBe(false);
  for (const body of [
    '{"broken"',
    JSON.stringify({ json: { name: "x".repeat(8 * 1024 * 1024) } }),
  ]) {
    const res = await fetch(origin + "buffaloEdit.write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect([400, 413]).toContain(res.status);
    const text = await res.text();
    expect(text).toContain(res.headers.get("x-request-id"));
    expect(text).toMatch(/INPUT_INVALID|INPUT_TOO_LARGE/);
    expect(text).not.toContain("stack");
  }
});
test("shared competition/news typed responses retain safe Thai action messages", async () => {
  const cases = [
    ["competition.conflict", 409, "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่"],
    ["competition.gateway", 502, "บริการการแข่งขันไม่พร้อม"],
    ["newsEvents.invalid", 400, "กรุณาระบุชื่อกิจกรรม"],
  ] as const;
  for (const [path, status, message] of cases) {
    const res = await fetch(origin + path);
    expect(res.status).toBe(status);
    expect(await res.text()).toContain(message);
  }
});
