import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("studio asset continuation opens the same work in Workbuddy workspace", async () => {
  const [client, productCss, studio] = await Promise.all([
    readFile(new URL("../../components/pages/WorkbuddyPageClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/product.css", import.meta.url), "utf8"),
    readFile(new URL("../../components/pages/XiaohongshuStudioPageClient.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(client, /createPortal/);
  assert.match(client, /className="wbApplicationWorkspace"/);
  assert.match(client, /← 返回对话/);
  assert.match(client, /shouldOpenEmbeddedContinuation\(option\)/);
  assert.match(client, /onOpenWorkspace\(option\.href/);
  assert.match(client, /if \(option\.continuation\) return/);
  assert.match(client, /onChoice\(conversationContinuationMessage\(option\)\)/);
  assert.match(client, /key=\{`\$\{workId\}:\$\{index\}:\$\{item\.id\}`\}/);
  assert.doesNotMatch(client, /<figure key=\{item\.id\}>/);
  assert.doesNotMatch(client, /InlineXiaohongshuAssets/);
  assert.doesNotMatch(client, /streamCreationImages\("wechat-images"/);
  assert.match(productCss, /\.wbApplicationWorkspace\{position:absolute/);
  const embeddedOverride = productCss.lastIndexOf(".xiaoguLightTheme.workbuddyEmbeddedShell,");
  const collapsedOverride = productCss.lastIndexOf("grid-template-columns: 68px minmax(0, 1fr) !important");
  assert.ok(embeddedOverride > collapsedOverride, "embedded one-column rule must follow desktop collapsed-sidebar rules");
  assert.match(productCss.slice(embeddedOverride), /grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(studio, /embeddedInWorkbuddy && initialContent \? "cards"/);
});
