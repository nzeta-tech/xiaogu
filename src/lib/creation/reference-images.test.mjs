import test from "node:test";
import assert from "node:assert/strict";
import { avatarPhotoIdFromReference, resolveCreationReferenceImages } from "./reference-images.ts";

test("owned avatar API references are converted to model-ready data URLs", async () => {
  const id = "446c306c-a92e-492b-9d38-e4c3a5cbdc68";
  assert.equal(avatarPhotoIdFromReference(`/api/avatar/photos/${id}/content?v=1`), id);
  const images = await resolveCreationReferenceImages({
    values: { reference_image: [`/api/avatar/photos/${id}/content?v=1`] },
    loadOwnedAvatarPhoto: async assetId => assetId === id ? { contentType: "image/jpeg", bytes: Buffer.from("portrait") } : null,
  });
  assert.deepEqual(images, [`data:image/jpeg;base64,${Buffer.from("portrait").toString("base64")}`]);
});

test("unowned and unsupported internal references never reach the image provider", async () => {
  const images = await resolveCreationReferenceImages({
    values: { reference_image: ["/api/avatar/photos/446c306c-a92e-492b-9d38-e4c3a5cbdc68/content", "https://example.com/private.jpg"] },
    loadOwnedAvatarPhoto: async () => null,
  });
  assert.deepEqual(images, []);
});
