import assert from "node:assert/strict";
import test from "node:test";
import { clipboardImageFiles } from "./clipboard-images.ts";

const item = (file) => ({ kind: "file", type: file.type, getAsFile: () => file });
test("extracts a screenshot once when clipboard exposes both items and files", async () => {
  const file = new File(["image bytes"], "image.png", { type: "image/png" });
  const result = clipboardImageFiles({ items: [item(file)], files: [file] });
  assert.deepEqual(result, [file]);
});
test("leaves plain text and copied HTML to the browser", () => {
  const items = ["text/plain", "text/html"].map((type) => ({ kind: "string", type, getAsFile: () => null }));
  assert.deepEqual(clipboardImageFiles({ items, files: [] }), []);
});
test("normalizes extensionless clipboard screenshots without changing bytes", async () => {
  const file = new File(["screenshot"], "image", { type: "image/png", lastModified: 123 });
  const [result] = clipboardImageFiles({ items: [item(file)], files: [] });
  assert.match(result.name, /\.png$/);
  assert.equal(result.type, "image/png");
  assert.equal(result.lastModified, 123);
  assert.equal(await result.text(), "screenshot");
});
test("falls back to files, ignores non-images, and tolerates null clipboard items", () => {
  const image = new File(["image"], "photo.jpg", { type: "image/jpeg" });
  const document = new File(["text"], "note.txt", { type: "text/plain" });
  assert.deepEqual(clipboardImageFiles({ items: [{ kind: "file", type: "image/png", getAsFile: () => null }], files: [image, document] }), [image]);
});
