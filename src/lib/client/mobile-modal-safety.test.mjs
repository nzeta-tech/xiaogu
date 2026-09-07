import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("work detail dialogs render through the document body portal", async () => {
  const content = await source("components/pages/WorkDetailPageClient.tsx");
  assert.match(content, /createPortal\(<div className="imageEditOverlay"/);
  assert.equal((content.match(/document\.body/g) ?? []).length >= 3, true);
});

test("other mobile action dialogs render through the document body portal", async () => {
  const [history, workbench, creation] = await Promise.all([
    source("components/pages/DraftsPageClient.tsx"),
    source("components/pages/WorkbenchPageClient.tsx"),
    source("components/pages/CreationAppPageClient.tsx"),
  ]);
  assert.match(history, /creationHistoryModalBackdrop[\s\S]*document\.body/);
  assert.match(workbench, /createPortal\(<div className="viralArticleModal"/);
  assert.match(creation, /createPortal\(<div className="trafficCoachPickerBackdrop"/);
});

test("mobile modal CSS preserves dynamic viewport and safe-area behavior", async () => {
  const [product, globals] = await Promise.all([
    source("app/product.css"),
    source("app/globals.css"),
  ]);
  assert.match(product, /\.imageEditOverlay\s*\{[\s\S]*?height:\s*100dvh/);
  assert.match(product, /\.imageEditDialog\s*\{[\s\S]*?safe-area-inset-bottom/);
  assert.match(product, /\.trafficCoachPickerBackdrop\s*\{\s*height:\s*100dvh/);
  assert.match(globals, /\.instancePreviewOverlay\s*\{\s*height:\s*100dvh/);
});
