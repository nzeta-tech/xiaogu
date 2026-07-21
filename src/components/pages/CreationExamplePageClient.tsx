"use client";

import { useState } from "react";
import { getCreationAppFamily, type CreationApp, type CreationExample } from "@/lib/apps/catalog";
import { appPath } from "@/lib/client/url";
import { creationExamples } from "@/lib/apps/catalog";
import { usePageMeta } from "@/lib/client/page-meta";

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
        sections: example.slug === "video-script-polish-case" ? catalogExample.sections : example.sections.length ? example.sections : catalogExample.sections,
        outputs: example.slug === "video-script-polish-case" ? catalogExample.outputs : example.outputs?.length ? example.outputs : catalogExample.outputs,
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
  usePageMeta({
    title: `${app.name} · 功能案例`,
    description: `获客创作 / ${app.name} / 案例`,
  });
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
  const appFamily = getCreationAppFamily(app.slug);
  const isWriteCopy = appFamily === "write-copy";
  const isLiveScript = app.slug === "live-script";
  const isImageCard = appFamily === "image-card";
  const isWechatImages = appFamily === "wechat-images";
  const isVideoScriptPolish = appFamily === "polish-video";
  const isWechatArticlePolish = appFamily === "polish-wechat-article";
  const isGeneralContent = app.slug === "general-content";
  const isLetter = app.slug === "letter";
  const imageNavItems: ExampleNavItem[] = isWechatImages
    ? [
        { id: "wechat-images-instance-info", title: "实例信息" },
        { id: "wechat-images-generated-results", title: "生成的图片" },
      ]
    : imageResults.map((item, index) => ({
        id: item.id ?? `image-result-${index + 1}`,
        title: item.title,
      }));
  const wechatImagesArticlePreview = "🎤 你以为是在聊客户，其实是在聊自己。\n\n很多人做内容时，习惯先想我要讲什么产品、讲什么专业、讲什么观点。但真正让别人愿意继续看下去的，往往不是你讲得多完整，而是读者会不会在某一句里突然觉得：这说的就是我。\n\n所以公众号配图也不是简单找几张好看的图。它更像是在帮一篇文章安排呼吸点，让读者在情绪推进、观点切换和故事停顿的地方，都能自然停一下、再继续读下去。";
  const videoPolishBlocks = [
    ...sections.map((section) => ({
      id: section.id,
      title: section.title,
      body: section.body,
      accent: false,
    })),
    ...outputs.map((output) => ({
      id: output.id,
      title: output.title,
      body: output.body,
      accent: true,
    })),
  ];

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
    <div className={buildExamplePageClassName(appFamily, app.slug)}>
      <div className="page-content creationExampleStudioContent">
        {mode === "page" ? (
          <div className="page-back-bar">
            <a className="back-btn backLink" href={appPath(`/apps/${app.slug}`)}>← 返回{app.name}</a>
            <span className="subpageBreadcrumb">获客创作 / {app.name} / 功能案例</span>
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
              <a className="creationExampleStudioAction" href={appPath(`/apps/${app.slug}?example=${activeExample.slug}`)}>
                {activeExample.ctaLabel ?? "使用此功能"}
              </a>
            </div>
            <button aria-label="关闭案例" className="creationExampleClose" onClick={() => onClose?.()} type="button">
              {mode === "modal" ? "×" : <a href={appPath(`/apps/${app.slug}`)}>×</a>}
            </button>
          </div>
          {activeExample.intro ? (
            <div className="creationExampleIntroCard">
              <p>{activeExample.intro}</p>
            </div>
          ) : null}
          {isVideoScriptPolish ? null : (
            <div className="creationExampleHeroMeta">
              <span>{app.name}</span>
              <strong>{app.points} 积分/次</strong>
              {activeExample.highlight ? <em>{activeExample.highlight}</em> : null}
            </div>
          )}
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
                <span>阅读重点</span>
                <strong>观察一份素材如何适配不同渠道，同时保持事实和观点一致</strong>
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
                <span>阅读重点</span>
                <strong>确认图片主题、信息层级、尺寸与素材来源</strong>
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
                <span>阅读重点</span>
                <strong>观察四张图片如何分别支撑开篇、方法、转折和总结</strong>
              </div>
            </div>
          ) : null}
          {isVideoScriptPolish ? null : null}
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
                <span>阅读重点</span>
                <strong>对照标题、段落推进、术语解释和事实边界</strong>
              </div>
            </div>
          ) : null}
          {isGeneralContent ? (
            <div className="generalContentExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>热点泛选题案例</strong>
              </div>
              <div>
                <span>输出结构</span>
                <strong>萃取逻辑 + 选题标题 + 文案</strong>
              </div>
              <div>
                <span>阅读重点</span>
                <strong>从已核实事实提炼与普通人相关的生活议题</strong>
              </div>
            </div>
          ) : null}
          {isLiveScript ? (
            <div className="liveScriptExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>直播流程稿案例</strong>
              </div>
              <div>
                <span>核心模块</span>
                <strong>输入思路、节奏拆解、完整脚本、互动承接</strong>
              </div>
              <div>
                <span>阅读重点</span>
                <strong>查看开场、讲解、互动、核验提醒和收尾如何组成完整流程</strong>
              </div>
            </div>
          ) : null}
          {isLetter ? (
            <div className="letterExampleSummary">
              <div>
                <span>案例类型</span>
                <strong>情绪表达型信件案例</strong>
              </div>
              <div>
                <span>核心重点</span>
                <strong>对象明确、情绪克制、语气自然，不像模板祝福</strong>
              </div>
              <div>
                <span>阅读重点</span>
                <strong>先了解功能边界，再使用自己的真实素材开始创作</strong>
              </div>
            </div>
          ) : null}
        </section>

        {isVideoScriptPolish ? (
          <section className="videoPolishExampleCanvas">
            <aside className="videoPolishExampleSidebarCard">
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
                <div className="creationExampleCatalogGroup">
                  <a className="creationExampleCatalogItem" href="#video-polish-generated" onClick={() => setActiveAnchorId("video-polish-generated")}>
                    <span className={activeAnchorId === "video-polish-generated" ? "creationExampleCatalogDot active" : "creationExampleCatalogDot"} aria-hidden="true">✓</span>
                    <span>生成结果</span>
                  </a>
                </div>
                {videoPolishBlocks.map((item) => (
                  <div className="creationExampleCatalogGroup" key={item.id}>
                    <a className="creationExampleCatalogItem" href={`#${item.id}`} onClick={() => setActiveAnchorId(item.id ?? "")}>
                      <span className={activeAnchorId === item.id ? "creationExampleCatalogDot active" : "creationExampleCatalogDot"} aria-hidden="true">✓</span>
                      <span>{item.title}</span>
                    </a>
                  </div>
                ))}
              </div>
            </aside>

            <main className="videoPolishExampleMain" style={{ fontSize: `${fontScale}%` }}>
              <article className="creationExampleContentCard videoPolishExampleContentCard" id="video-polish-generated">
                <section className="creationExampleBlock creationExampleBlockAccent">
                  <div className="creationExampleBlockHeader">
                    <div className="creationExampleBlockTitle">
                      <span className="creationExampleDocIcon" aria-hidden="true">📋</span>
                      <h2>生成结果</h2>
                    </div>
                    <div className="creationExampleBlockActions">
                      <button onClick={() => void copyText(videoPolishBlocks.map((item) => `${item.title}\n${item.body}`).join("\n\n"))} type="button">复制</button>
                      <button onClick={() => exportWord(activeExample.title, videoPolishBlocks.map((item) => `${item.title}\n\n${item.body}`).join("\n\n"))} type="button">导出Word</button>
                    </div>
                  </div>

                  {videoPolishBlocks.map((item) => (
                    <div className="videoPolishExampleSection" id={item.id} key={item.id}>
                      <div className="creationExampleBlockHeader">
                        <div className="creationExampleBlockTitle">
                          <span className="creationExampleDocIcon" aria-hidden="true">{item.accent ? "🪄" : "📄"}</span>
                          <h2>{item.title}</h2>
                        </div>
                      </div>
                      <div className="creationExampleBlockBody">
                        <MarkdownContent text={item.body} />
                      </div>
                    </div>
                  ))}
                </section>
              </article>
            </main>
          </section>
        ) : (
        <section className="creationExampleStudioLayout">
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
              isWechatImages ? (
                <article className="creationExampleContentCard creationExampleImageCard wechatImagesExampleContentCard wechatImagesSharedWorkCard">
                  <section className="creationExampleImageSection wechatImagesExampleImageSection" id="wechat-images-instance-info">
                    <div className="creationExampleImageHeader">
                      <div className="creationExampleImageHeaderTitle">
                        <span className="creationExampleImageIcon" aria-hidden="true">🧾</span>
                        <h2>实例信息</h2>
                      </div>
                      <div className="creationExampleImageMeta">
                        <span className="creationExampleImageBadge">本地原创示例</span>
                      </div>
                    </div>
                    <div className="wechatImagesExampleInfoGrid">
                      <div className="wechatImagesExampleInfoCard">
                        <span>图片风格</span>
                        <strong>温暖手绘</strong>
                      </div>
                      <div className="wechatImagesExampleInfoCard">
                        <span>输出类型</span>
                        <strong>多张文章配图</strong>
                      </div>
                      <div className="wechatImagesExampleInfoCard">
                        <span>结果状态</span>
                        <strong>已完成</strong>
                      </div>
                    </div>
                    <div className="wechatImagesExampleArticleCard">
                      <div className="wechatImagesExampleArticleHeader">
                        <strong>文章内容</strong>
                        <button onClick={() => void copyText(wechatImagesArticlePreview)} type="button">复制内容</button>
                      </div>
                      <div className="wechatImagesExampleArticleBody">
                        <MarkdownContent text={wechatImagesArticlePreview} />
                      </div>
                    </div>
                  </section>

                  <section className="creationExampleImageSection wechatImagesExampleImageSection" id="wechat-images-generated-results">
                    <div className="creationExampleImageHeader">
                      <div className="creationExampleImageHeaderTitle">
                        <span className="creationExampleImageIcon" aria-hidden="true">🖼️</span>
                        <h2>生成的图片</h2>
                      </div>
                      <div className="creationExampleImageMeta">
                        <span className="creationExampleImageBadge">已生成 {imageResults.length} 张图片</span>
                      </div>
                    </div>

                    <div className="wechatImagesExampleResultActions">
                      <a className="creationExampleImageAction" href={appPath(`/apps/${app.slug}?example=${activeExample.slug}`)}>
                        使用此功能
                      </a>
                      <button onClick={() => void copyText(imageResults.map((item) => item.imageUrl).join("\n"))} type="button">复制全部图片链接</button>
                    </div>

                    <div className="wechatImagesExampleGallery">
                      {imageResults.map((item, index) => (
                        <article className="wechatImagesExampleGalleryCard" id={item.id ?? `image-result-${index + 1}`} key={item.id ?? item.imageUrl}>
                          <div className="creationExampleImageFrame" style={item.ratio ? { aspectRatio: item.ratio } : undefined}>
                            {/* Example result URLs can be external assets from the seeded library. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img alt={`${activeExample.title} ${index + 1}`} className="creationExamplePreviewImage" src={item.imageUrl} />
                          </div>
                          <div className="wechatImagesExampleGalleryMeta">
                            <strong>{item.title}</strong>
                            <span>{index === 0 ? "推荐先看" : "备选结果"}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </article>
              ) : (
                <article className={isImageCard ? "creationExampleContentCard creationExampleImageCard imageCardExampleContentCard" : "creationExampleContentCard creationExampleImageCard"}>
                  {imageResults.map((item, index) => (
                    <section className={isImageCard ? "creationExampleImageSection imageCardExampleImageSection" : "creationExampleImageSection"} id={item.id ?? `image-result-${index + 1}`} key={item.id ?? item.imageUrl}>
                      <div className="creationExampleImageHeader">
                        <div className="creationExampleImageHeaderTitle">
                          <span className="creationExampleImageIcon" aria-hidden="true">🖼️</span>
                          <h2>{item.title}</h2>
                        </div>
                        <div className="creationExampleImageMeta">
                          {item.badge ? <span className="creationExampleImageBadge">{item.badge}</span> : null}
                        </div>
                      </div>

                      <div className="creationExampleImageGrid">
                        <article className="creationExampleImageTile">
                          <div className="creationExampleImageFrame" style={item.ratio ? { aspectRatio: item.ratio } : undefined}>
                            {/* Example result URLs can be external assets from the seeded library. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
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
              )
            ) : (
              <article className={isWriteCopy ? "creationExampleContentCard writeCopyExampleContentCard" : isLiveScript ? "creationExampleContentCard liveScriptExampleContentCard" : "creationExampleContentCard"} style={{ fontSize: `${fontScale}%` }}>
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
                  <section className={isWriteCopy ? "creationExampleBlock creationExampleBlockAccent writeCopyExampleBlock writeCopyExampleBlockAccent" : isGeneralContent ? "creationExampleBlock creationExampleBlockAccent generalContentExampleBlock" : "creationExampleBlock creationExampleBlockAccent"} id={item.id} key={item.id ?? item.title}>
                    <div className="creationExampleBlockHeader">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">🪄</span>
                        <h2>{item.title}</h2>
                      </div>
                      <div className="creationExampleBlockActions">
                        {item.tag ? <span className="creationExampleTag">{item.tag}</span> : null}
                        <button onClick={() => void copyText([item.body, ...(item.children ?? []).map((child) => `${child.title}\n${child.body}`)].filter(Boolean).join("\n\n"))} type="button">复制</button>
                        <button onClick={() => exportWord(item.title, [item.body, ...(item.children ?? []).map((child) => `${child.title}\n\n${child.body}`)].filter(Boolean).join("\n\n"))} type="button">导出Word</button>
                      </div>
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
                      {(item.viewMode === "wechat"
                        ? currentViewMode(item.id, item.viewMode, viewModes) === "wechat" ? (item.children ?? []) : []
                        : (item.children ?? [])
                      ).map((child) => (
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
        )}
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

function buildExamplePageClassName(appFamily: ReturnType<typeof getCreationAppFamily>, appSlug: string) {
  const classes = ["product-subpage", "creationExamplePage", "creationExampleStudioPage"];
  if (appFamily === "write-copy") classes.push("writeCopyExamplePage");
  if (appFamily === "image-card") classes.push("imageCardExamplePage");
  if (appFamily === "wechat-images") classes.push("wechatImagesExamplePage");
  if (appSlug === "general-content") classes.push("generalContentExamplePage");
  if (appSlug === "letter") classes.push("letterExamplePage");
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
      {blocks.map((block, index) => {
        const key = `${index}-${block}`;
        if (block === "---") {
          return <hr className="creationExampleDivider" key={key} />;
        }

        if (block.startsWith("### ")) {
          return <h4 className="creationExampleHeading creationExampleHeading4" key={key}>{block.slice(4)}</h4>;
        }

        if (block.startsWith("## ")) {
          return <h3 className="creationExampleHeading creationExampleHeading3" key={key}>{block.slice(3)}</h3>;
        }

        if (block.startsWith("# ")) {
          return <h2 className="creationExampleHeading creationExampleHeading2" key={key}>{block.slice(2)}</h2>;
        }

        if (block.startsWith(">")) {
          return <blockquote key={key}>{block.replace(/^>\s?/, "")}</blockquote>;
        }

        return <p key={key}>{block}</p>;
      })}
    </>
  );
}
