"use client";

import { useState } from "react";
import { getCreationAppFamily, type CreationApp, type CreationExample } from "@/lib/apps/catalog";
import { appPath } from "@/lib/client/url";
import { creationExamples } from "@/lib/apps/catalog";

type ExampleNavItem = {
  id: string;
  title: string;
  children?: Array<{
    id: string;
    title: string;
  }>;
};

export function CreationExamplePageClient({
  app,
  example,
  mode = "page",
  onClose,
}: {
  app: CreationApp;
  example: CreationExample;
  mode?: "page" | "modal";
  onClose?: () => void;
}) {
  const [fontScale, setFontScale] = useState(100);
  const catalogExample = creationExamples.find((item) => item.slug === example.slug);
  const hydratedExample = catalogExample
    ? {
        ...example,
        ...catalogExample,
        sections: example.sections.length ? example.sections : catalogExample.sections,
        outputs: example.outputs?.length ? example.outputs : catalogExample.outputs,
        linkedExamples: example.linkedExamples?.length ? example.linkedExamples : catalogExample.linkedExamples,
        imageResults: example.imageResults?.length ? example.imageResults : catalogExample.imageResults,
      }
    : example;
  const linkedExamples = ((hydratedExample.linkedExamples?.length
    ? hydratedExample.linkedExamples.map((slug) => creationExamples.find((item) => item.slug === slug)).filter(Boolean)
    : [hydratedExample]) as CreationExample[]);
  const initialExample = linkedExamples.find((item) => item.slug === hydratedExample.slug) ?? hydratedExample;
  const [activeExampleSlug, setActiveExampleSlug] = useState(initialExample.slug);
  const [viewModes, setViewModes] = useState<Record<string, "plain" | "wechat">>({});
  const [activeAnchorId, setActiveAnchorId] = useState<string>("");
  const activeExample = linkedExamples.find((item) => item.slug === activeExampleSlug) ?? hydratedExample;
  const sections = activeExample.sections ?? [];
  const outputs = activeExample.outputs ?? [];
  const imageResults = activeExample.imageResults ?? [];
  const isImageExample = activeExample.exampleType === "image" || (app.resultType === "image" && imageResults.length > 0);
  const navItems: ExampleNavItem[] = [
    ...sections.map((item, index) => ({
      id: item.id ?? `section-${index + 1}`,
      title: item.title,
    })),
    ...outputs.map((item, index) => ({
      id: item.id ?? `output-${index + 1}`,
      title: item.title,
      children: item.children?.map((child, childIndex) => ({
        id: child.id ?? `${item.id ?? `output-${index + 1}`}-child-${childIndex + 1}`,
        title: child.title,
      })),
    })),
  ];
  const imageNavItems: ExampleNavItem[] = imageResults.map((item, index) => ({
    id: item.id ?? `image-result-${index + 1}`,
    title: item.title,
  }));
  const appFamily = getCreationAppFamily(app.slug);
  const isWriteCopy = appFamily === "write-copy";
  const isImageCard = appFamily === "image-card";
  const isWechatImages = appFamily === "wechat-images";
  const isVideoScriptPolish = appFamily === "polish-video";
  const isWechatArticlePolish = appFamily === "polish-wechat-article";

  function adjustFontScale(delta: number) {
    setFontScale((current) => Math.min(130, Math.max(90, current + delta)));
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function exportWord(title: string, body: string) {
    const blob = new Blob([`${title}\n\n${body}`], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function setOutputViewMode(outputId: string, mode: "plain" | "wechat") {
    setViewModes((current) => ({ ...current, [outputId]: mode }));
  }

  const content = (
    <div className={buildExamplePageClassName(appFamily)}>
      <div className="page-content creationExampleCloneContent">
        {mode === "page" ? (
          <div className="page-back-bar">
            <a className="back-btn backLink" href={appPath("/workspace")}>返回广场</a>
          </div>
        ) : null}

        <section className="creationExampleTabs" aria-label="案例标签">
          {linkedExamples.map((item) => (
            <button
              className={item.slug === activeExampleSlug ? "creationExampleTab active" : "creationExampleTab"}
              key={item.slug}
              onClick={() => setActiveExampleSlug(item.slug)}
              type="button"
            >
              {item.title}
            </button>
          ))}
        </section>

        <section className={isWriteCopy ? "creationExampleHeroCard writeCopyExampleHeroCard" : isImageCard ? "creationExampleHeroCard imageCardExampleHeroCard" : "creationExampleHeroCard"}>
          <div className="creationExampleHeroHeader">
            <div className="creationExampleHeroTitle">
              <h1>{activeExample.title}</h1>
              <a className="creationExampleCloneAction" href={appPath(`/apps/${app.slug}?example=${activeExample.slug}`)}>
                {activeExample.ctaLabel ?? "做同款"}
              </a>
            </div>
            <button aria-label="关闭案例" className="creationExampleClose" onClick={() => onClose?.()} type="button">
              {mode === "modal" ? "×" : <a href={appPath("/workspace")}>×</a>}
            </button>
          </div>
          {activeExample.intro ? (
            <div className="creationExampleIntroCard">
              <p>{activeExample.intro}</p>
            </div>
          ) : null}
          <div className="creationExampleHeroMeta">
            <span>{app.name}</span>
            <strong>{app.points} 积分/次</strong>
            {activeExample.highlight ? <em>{activeExample.highlight}</em> : null}
          </div>
          {isWriteCopy ? (
            <div className="writeCopyExampleSummary">
              <div>
                <span>适合场景</span>
                <strong>同一观点拆成多平台内容</strong>
              </div>
              <div>
                <span>案例结构</span>
                <strong>先短内容，再长内容，再延展选题</strong>
              </div>
              <div>
                <span>克隆目标</span>
                <strong>更接近目标站的案例阅读页节奏</strong>
              </div>
            </div>
          ) : null}
          {isImageCard ? (
            <div className="imageCardExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>单张图片结果型案例</strong>
              </div>
              <div>
                <span>核心差异</span>
                <strong>不同标签页切换不同风格与结果图</strong>
              </div>
              <div>
                <span>当前目标</span>
                <strong>更接近目标站图片结果页阅读方式</strong>
              </div>
            </div>
          ) : null}
          {isWechatImages ? (
            <div className="wechatImagesExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>公众号长文配图型案例</strong>
              </div>
              <div>
                <span>核心差异</span>
                <strong>重点是文章阅读节奏，而不是单张海报展示</strong>
              </div>
              <div>
                <span>当前目标</span>
                <strong>更接近目标站公众号配图案例页的阅读方式</strong>
              </div>
            </div>
          ) : null}
          {isVideoScriptPolish ? (
            <div className="polishExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>已有口播稿的精修案例</strong>
              </div>
              <div>
                <span>核心变化</span>
                <strong>先把开头拉住，再把结构和语气顺平</strong>
              </div>
              <div>
                <span>当前目标</span>
                <strong>更接近目标站的“改稿型案例页”阅读节奏</strong>
              </div>
            </div>
          ) : null}
          {isWechatArticlePolish ? (
            <div className="polishExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>已有公众号成稿的精修案例</strong>
              </div>
              <div>
                <span>核心变化</span>
                <strong>标题、结构、语言和结尾互动都重新提一层</strong>
              </div>
              <div>
                <span>当前目标</span>
                <strong>更接近目标站长文精修案例页的阅读方式</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="creationExampleCloneLayout">
          <aside className="creationExampleSidebar">
            <div className="creationExampleSidebarCard">
              <div className="creationExampleSidebarHeader">
                <strong>内容导航</strong>
              </div>
              <div className="creationExampleZoomRow">
                <span>内容缩放</span>
                <div className="creationExampleZoomControls">
                  <button onClick={() => adjustFontScale(-10)} type="button">−</button>
                  <span>{fontScale}%</span>
                  <button onClick={() => adjustFontScale(10)} type="button">+</button>
                </div>
              </div>
              <div className="creationExampleCatalog">
                {(isImageExample ? imageNavItems : navItems).map((item) => (
                  <div className="creationExampleCatalogGroup" key={item.id}>
                    <a className="creationExampleCatalogItem" href={`#${item.id}`} onClick={() => setActiveAnchorId(item.id)}>
                      <span className={activeAnchorId === item.id ? "creationExampleCatalogDot active" : "creationExampleCatalogDot"} aria-hidden="true">✓</span>
                      <span>{item.title}</span>
                    </a>
                    {item.children?.length ? (
                      <div className="creationExampleCatalogChildren">
                        {item.children.map((child) => (
                          <a
                            className={activeAnchorId === child.id ? "creationExampleCatalogChild active" : "creationExampleCatalogChild"}
                            href={`#${child.id}`}
                            key={child.id}
                            onClick={() => setActiveAnchorId(child.id)}
                          >
                            <span className="creationExampleCatalogDoc" aria-hidden="true">📄</span>
                            <span>{child.title}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="creationExampleMain">
            {isImageExample ? (
              <article className={isImageCard ? "creationExampleContentCard creationExampleImageCard imageCardExampleContentCard" : isWechatImages ? "creationExampleContentCard creationExampleImageCard wechatImagesExampleContentCard" : "creationExampleContentCard creationExampleImageCard"}>
                {imageResults.map((item, index) => (
                  <section className={isImageCard ? "creationExampleImageSection imageCardExampleImageSection" : isWechatImages ? "creationExampleImageSection wechatImagesExampleImageSection" : "creationExampleImageSection"} id={item.id ?? `image-result-${index + 1}`} key={item.id ?? item.imageUrl}>
                    <div className="creationExampleImageHeader">
                      <div className="creationExampleImageHeaderTitle">
                        <span className="creationExampleImageIcon" aria-hidden="true">🖼️</span>
                        <h2>{item.title}</h2>
                      </div>
                      <div className="creationExampleImageMeta">
                        {item.badge ? <span className="creationExampleImageBadge">{item.badge}</span> : null}
                      </div>
                    </div>

                    <div className="creationExampleSignatureRow">
                      <div>
                        <strong>添加签名水印</strong>
                        <p>目标站这里是图片结果区，本地先保留同款信息架构，不在案例页里启用真实签名交互。</p>
                      </div>
                      <span className="creationExampleSignatureSwitch" aria-hidden="true" />
                    </div>

                    <div className="creationExampleImageGrid">
                      <article className="creationExampleImageTile">
                        <div className="creationExampleImageFrame" style={item.ratio ? { aspectRatio: item.ratio } : undefined}>
                          <img alt={activeExample.title} className="creationExamplePreviewImage" src={item.imageUrl} />
                        </div>
                        <div className="creationExampleImageActions">
                          <a className="creationExampleImageAction" download href={item.imageUrl} target="_blank" rel="noreferrer">
                            下载
                          </a>
                          <button onClick={() => void copyText(item.imageUrl)} type="button">复制图片链接</button>
                        </div>
                      </article>
                    </div>
                  </section>
                ))}
              </article>
            ) : (
              <article className={isWriteCopy ? "creationExampleContentCard writeCopyExampleContentCard" : "creationExampleContentCard"} style={{ fontSize: `${fontScale}%` }}>
                {sections.map((section) => (
                  <section className={isWriteCopy ? "creationExampleBlock writeCopyExampleBlock" : "creationExampleBlock"} id={section.id} key={section.id ?? section.title}>
                    <div className="creationExampleBlockHeader">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">📄</span>
                        <h2>{section.title}</h2>
                      </div>
                      <div className="creationExampleBlockActions">
                        <button onClick={() => void copyText(section.body)} type="button">复制</button>
                        <button onClick={() => exportWord(section.title, section.body)} type="button">导出Word</button>
                      </div>
                    </div>
                    <div className="creationExampleBlockBody">
                      <MarkdownContent text={section.body} />
                      {section.quote ? <blockquote>{section.quote}</blockquote> : null}
                    </div>
                  </section>
                ))}

                {outputs.map((item) => (
                  <section className={isWriteCopy ? "creationExampleBlock creationExampleBlockAccent writeCopyExampleBlock writeCopyExampleBlockAccent" : "creationExampleBlock creationExampleBlockAccent"} id={item.id} key={item.id ?? item.title}>
                    <div className="creationExampleBlockHeader">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">🪄</span>
                        <h2>{item.title}</h2>
                      </div>
                      {item.tag ? <span className="creationExampleTag">{item.tag}</span> : null}
                    </div>
                    <div className="creationExampleBlockBody">
                      <MarkdownContent text={item.body} />
                      {item.quote ? <blockquote>{item.quote}</blockquote> : null}
                      {item.viewMode === "wechat" ? (
                        <div className="creationExampleViewSwitch">
                          <button
                            className={currentViewMode(item.id, item.viewMode, viewModes) === "plain" ? "creationExampleViewButton active" : "creationExampleViewButton"}
                            onClick={() => setOutputViewMode(item.id ?? item.title, "plain")}
                            type="button"
                          >
                            普通格式
                          </button>
                          <button
                            className={currentViewMode(item.id, item.viewMode, viewModes) === "wechat" ? "creationExampleViewButton active" : "creationExampleViewButton"}
                            onClick={() => setOutputViewMode(item.id ?? item.title, "wechat")}
                            type="button"
                          >
                            公众号格式
                          </button>
                        </div>
                      ) : null}
                      {(currentViewMode(item.id, item.viewMode, viewModes) === "wechat" ? (item.children ?? []) : []).map((child) => (
                        <article className="creationExampleArticleCard" id={child.id} key={child.id ?? child.title}>
                          <div className="creationExampleArticleHeader">
                            <span className="creationExampleArticleMarker" aria-hidden="true">📄</span>
                            <h3>{child.title}</h3>
                          </div>
                          <div className="creationExampleArticleBody">
                            <MarkdownContent text={child.body} />
                            {child.quote ? <blockquote>{child.quote}</blockquote> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </article>
            )}
          </div>
        </section>
      </div>
    </div>
  );

  if (mode === "modal") {
    return (
      <div className="creationExampleModalOverlay" onClick={() => onClose?.()} role="presentation">
        <div className="creationExampleModalShell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="案例内容">
          {content}
        </div>
      </div>
    );
  }

  return content;
}

function buildExamplePageClassName(appFamily: ReturnType<typeof getCreationAppFamily>) {
  const classes = ["target-subpage", "creationExamplePage", "creationExampleClonePage"];
  if (appFamily === "write-copy") classes.push("writeCopyExamplePage");
  if (appFamily === "image-card") classes.push("imageCardExamplePage");
  if (appFamily === "wechat-images") classes.push("wechatImagesExamplePage");
  if (appFamily === "polish-video" || appFamily === "polish-wechat-article") classes.push("polishExamplePage");
  if (appFamily === "polish-video") classes.push("videoPolishExamplePage");
  if (appFamily === "polish-wechat-article") classes.push("wechatPolishExamplePage");
  return classes.join(" ");
}

function currentViewMode(
  outputId: string | undefined,
  defaultMode: "plain" | "wechat" | undefined,
  viewModes: Record<string, "plain" | "wechat">,
) {
  return viewModes[outputId ?? ""] ?? defaultMode ?? "plain";
}

function MarkdownContent({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);

  return (
    <>
      {blocks.map((block) => {
        if (block === "---") {
          return <hr className="creationExampleDivider" key={block} />;
        }

        if (block.startsWith("### ")) {
          return <h4 className="creationExampleHeading creationExampleHeading4" key={block}>{block.slice(4)}</h4>;
        }

        if (block.startsWith("## ")) {
          return <h3 className="creationExampleHeading creationExampleHeading3" key={block}>{block.slice(3)}</h3>;
        }

        if (block.startsWith("# ")) {
          return <h2 className="creationExampleHeading creationExampleHeading2" key={block}>{block.slice(2)}</h2>;
        }

        if (block.startsWith(">")) {
          return <blockquote key={block}>{block.replace(/^>\s?/, "")}</blockquote>;
        }

        return <p key={block}>{block}</p>;
      })}
    </>
  );
}
