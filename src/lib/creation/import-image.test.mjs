import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { readUploadedImage } from "./import-image.ts";

for (const format of ["jpeg", "png", "webp", "gif"]) {
  test(`reads a ${format} attachment and forwards normalized image content`, async () => {
    const bytes = await sharp({ create: { width: 12, height: 8, channels: 4, background: "#ff0000" } }).toFormat(format).toBuffer();
    const result = await readUploadedImage(bytes, async (dataUrl) => {
      assert.match(dataUrl, /^data:image\/jpeg;base64,/);
      const metadata = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
      assert.equal(metadata.format, "jpeg");
      assert.equal(metadata.width, 12);
      return "红色图片，没有文字";
    });
    assert.match(result, /红色图片，没有文字/);
  });
}

test("rejects invalid image bytes before calling recognition", async () => {
  await assert.rejects(readUploadedImage(Buffer.from("not an image"), async () => assert.fail("must not call recognition")));
});

test("does not silently attach an empty recognition result", async () => {
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(readUploadedImage(bytes, async () => "  "), /recognition unavailable/);
});
