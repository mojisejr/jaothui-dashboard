/** @jest-environment node */
import sharp from "sharp";
import { normalizeBuffaloImage } from "../image-preflight";
import { RAW_IMAGE_LIMIT } from "../create/contract";
test("DNA/create reject exact byte boundary, wrong MIME, corrupt and disguised formats", async () => {
  await expect(
    normalizeBuffaloImage(Buffer.alloc(RAW_IMAGE_LIMIT), "image/jpeg"),
  ).rejects.toMatchObject({ code: "INVALID_IMAGE_SIZE_OR_TYPE" });
  await expect(
    normalizeBuffaloImage(Buffer.from("small"), "text/plain"),
  ).rejects.toMatchObject({ code: "INVALID_IMAGE_SIZE_OR_TYPE" });
  await expect(
    normalizeBuffaloImage(Buffer.from("not jpeg"), "image/jpeg"),
  ).rejects.toMatchObject({ code: "INVALID_IMAGE_CONTENT" });
  await expect(
    normalizeBuffaloImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
      ),
      "image/png",
    ),
  ).rejects.toMatchObject({ code: "INVALID_IMAGE_CONTENT" });
});
test("valid PNG is decoded and normalized to bounded JPEG before storage", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "#fff" },
  })
    .png()
    .toBuffer();
  const bytes = await normalizeBuffaloImage(png, "image/png");
  expect((await sharp(bytes).metadata()).format).toBe("jpeg");
  expect(bytes.length).toBeLessThan(RAW_IMAGE_LIMIT);
});
