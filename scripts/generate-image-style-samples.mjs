import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const width = 768;
const height = 1024;
const outputDir = path.resolve("public/examples/image-card-styles");
const cacheDir = "/tmp/xiaogu-image-card-photos";

const photoUrls = [
  "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1544717297-fa95b6ee9643?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=90",
  "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1600&q=90",
];

const styles = [
  ["illustration", 2, "illustration", "#1f766e", "#e96c4f"],
  ["whiteboard", 7, "whiteboard", "#244e5a", "#e45c45"],
  ["zen", 8, "zen", "#27443c", "#a86f52"],
  ["line-illustration", 7, "line", "#263b42", "#df7058"],
  ["luxury", 4, "luxury", "#d7b56d", "#1b2926"],
  ["magazine", 3, "magazine", "#d94a3d", "#153b55"],
  ["graffiti", 9, "graffiti", "#ff6959", "#2fc5b6"],
  ["event-stage", 6, "stage", "#f1c65c", "#e64c63"],
  ["handwritten-notes", 7, "notes", "#355c63", "#d9704e"],
  ["clay", 2, "clay", "#2b8f85", "#e18464"],
  ["minimal-drawing", 8, "minimal", "#273b38", "#c96952"],
  ["business", 1, "business", "#1e5672", "#dc644f"],
  ["blackboard", 5, "blackboard", "#f1e6c8", "#e49a68"],
  ["flat-knowledge", 0, "flat", "#247a73", "#e85c4e"],
  ["morandi", 2, "morandi", "#71877f", "#9c6f69"],
  ["science-sketch", 7, "science", "#274b58", "#df6b54"],
  ["dark-pro", 9, "dark", "#dfb86f", "#2d8d86"],
  ["fresh-card", 1, "fresh", "#237b70", "#e87560"],
  ["daily-sign", 8, "daily-sign", "#8d3f3b", "#c6a66b"],
  ["study", 7, "study", "#315b72", "#df634d"],
  ["large-sign", 9, "large-sign", "#b54138", "#213b38"],
  ["black-white", 1, "black-white", "#f4f1ea", "#242424"],
  ["scrapbook", 0, "scrapbook", "#4e7c71", "#c75a4b"],
  ["white-orange-blue", 5, "clean", "#236b96", "#ec6b3d"],
  ["daily", 3, "daily", "#a33f36", "#24303a"],
];

const headlines = [
  ["保险经纪人的", "内容增长路径"],
  ["从专业表达", "到稳定获客"],
  ["把信任做成", "长期复利"],
  ["一套可复用的", "内容经营方法"],
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ensurePhotos() {
  await mkdir(cacheDir, { recursive: true });
  for (const [index, url] of photoUrls.entries()) {
    const filename = path.join(cacheDir, "photo-" + (index + 1) + ".jpg");
    try {
      await readFile(filename);
    } catch {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Photo download failed: " + response.status);
      await writeFile(filename, Buffer.from(await response.arrayBuffer()));
    }
  }
}

function defs() {
  return [
    "<defs>",
    '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07111a" stop-opacity=".04"/><stop offset=".42" stop-color="#07111a" stop-opacity=".16"/><stop offset="1" stop-color="#07111a" stop-opacity=".92"/></linearGradient>',
    '<linearGradient id="light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".02"/><stop offset=".38" stop-color="#fff" stop-opacity=".12"/><stop offset=".6" stop-color="#f8f5ee" stop-opacity=".95"/><stop offset="1" stop-color="#f8f5ee"/></linearGradient>',
    '<filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#07111a" flood-opacity=".23"/></filter>',
    '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="8" result="n"/><feBlend in="SourceGraphic" in2="n" mode="soft-light"/></filter>',
    "</defs>",
  ].join("");
}

function textLine(x, y, value, size, color, weight = 700, anchor = "start") {
  return '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" fill="' + color + '" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="' + size + '" font-weight="' + weight + '">' + escapeXml(value) + "</text>";
}

function metricCards(y, ink, accent, light = false) {
  const card = light ? "#ffffffeb" : "#12212bea";
  const primary = light ? ink : "#f8f3e8";
  const muted = light ? "#66736f" : "#c7d0cc";
  const items = [["30天", "持续运营"], ["24篇", "有效内容"], ["18次", "主动咨询"]];
  return items.map((item, index) => {
    const x = 54 + index * 222;
    return [
      '<rect x="' + x + '" y="' + y + '" width="198" height="108" rx="18" fill="' + card + '" stroke="' + accent + '" stroke-opacity=".28"/>',
      textLine(x + 18, y + 43, item[0], 28, primary, 800),
      textLine(x + 18, y + 76, item[1], 17, muted, 500),
    ].join("");
  }).join("");
}

function processRow(y, ink, accent, light = false) {
  const labels = ["定位", "内容", "信任", "转化", "复盘"];
  const primary = light ? ink : "#f8f3e8";
  return labels.map((label, index) => {
    const x = 54 + index * 134;
    return [
      '<circle cx="' + (x + 28) + '" cy="' + y + '" r="28" fill="' + accent + '"/>',
      textLine(x + 28, y + 7, String(index + 1).padStart(2, "0"), 16, light ? "#fff" : "#102028", 800, "middle"),
      textLine(x + 28, y + 62, label, 18, primary, 700, "middle"),
    ].join("");
  }).join("");
}

function posterOverlay(style, index) {
  const [, , mode, ink, accent] = style;
  const headline = headlines[index % headlines.length];
  const pieces = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">',
    defs(),
  ];

  if (mode === "illustration") {
    pieces.push('<rect width="768" height="1024" fill="#f8edcf"/>');
    pieces.push('<path d="M0 180Q160 80 320 175T640 160T820 120V0H0Z" fill="#e5b96e" opacity=".28"/>');
    pieces.push('<path d="M0 745Q150 645 300 735T600 710T820 670V1024H0Z" fill="#8eb4a4" opacity=".48"/>');
    pieces.push('<path d="M76 300H238V452H76Z" fill="#d99565"/><path d="M100 275L157 225L214 275" fill="#8e6253"/><path d="M528 270H684V448H528Z" fill="#7aa59b"/><path d="M548 242L606 194L664 242" fill="#567d74"/>');
    pieces.push('<circle cx="596" cy="625" r="62" fill="#e3b18d"/><path d="M500 835Q516 686 596 686Q676 686 692 835" fill="#2e554f"/>');
    pieces.push(textLine(58, 86, "小谷 · 手绘案例", 18, ink, 700));
    pieces.push(textLine(58, 548, "保险经纪人的", 44, "#243e3b", 800));
    pieces.push(textLine(58, 604, "内容增长路径", 44, accent, 800));
    pieces.push(processRow(690, ink, accent, true));
    pieces.push(textLine(58, 965, "真实场景 · 手绘叙事 · 温暖可信", 17, "#6b756f", 500));
  } else if (mode === "whiteboard") {
    pieces.push('<rect width="768" height="1024" fill="#eef0eb" opacity=".52"/>');
    pieces.push('<rect x="42" y="118" width="684" height="820" rx="8" fill="#fbfbf7ed" stroke="#9aa6a2" stroke-width="4" filter="url(#shadow)"/>');
    pieces.push(textLine(78, 174, "小谷 · 白板工作坊", 18, "#60726e", 700));
    pieces.push(textLine(78, 245, headline[0], 40, ink, 700));
    pieces.push(textLine(78, 298, headline[1], 40, accent, 700));
    pieces.push('<path d="M82 327Q278 348 458 322" fill="none" stroke="' + accent + '" stroke-width="8" stroke-linecap="round"/>');
    pieces.push('<path d="M105 425L205 372L303 430L405 350L560 430M205 372V548M405 350V548" fill="none" stroke="' + ink + '" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>');
    pieces.push('<circle cx="105" cy="425" r="18" fill="' + accent + '"/><circle cx="303" cy="430" r="18" fill="#e6b655"/><circle cx="560" cy="430" r="18" fill="#67a68e"/>');
    pieces.push(processRow(655, ink, accent, true));
    pieces.push('<path d="M90 825Q222 755 350 822T640 806" fill="none" stroke="#6fa895" stroke-width="9" stroke-linecap="round"/>');
    pieces.push(textLine(78, 905, "边讲边画，把复杂方法说明白", 22, "#50615e", 600));
  } else if (mode === "zen") {
    pieces.push('<rect width="768" height="1024" fill="#f5f1e8" opacity=".2"/>');
    pieces.push('<rect x="500" y="0" width="268" height="1024" fill="#f8f4ecbf"/>');
    pieces.push(textLine(634, 120, "小", 26, ink, 500, "middle"));
    pieces.push(textLine(634, 164, "谷", 26, ink, 500, "middle"));
    pieces.push('<path d="M634 210V330" stroke="' + accent + '" stroke-width="2"/>');
    pieces.push(textLine(634, 400, "信任", 46, "#243d37", 500, "middle"));
    pieces.push(textLine(634, 458, "是一场长期主义", 24, "#53665f", 400, "middle"));
    pieces.push('<circle cx="634" cy="548" r="28" fill="' + accent + '" opacity=".78"/>');
    pieces.push(textLine(634, 705, "看见需求", 18, "#53665f", 500, "middle"));
    pieces.push(textLine(634, 742, "保持真诚", 18, "#53665f", 500, "middle"));
    pieces.push(textLine(634, 779, "持续陪伴", 18, "#53665f", 500, "middle"));
  } else if (mode === "line") {
    pieces.push('<rect width="768" height="1024" fill="#f9f0db"/>');
    pieces.push('<path d="M36 30H732V994H36Z" fill="none" stroke="#d9c89f" stroke-width="2"/>');
    pieces.push(textLine(58, 92, "小谷 · 线稿案例", 18, ink, 700));
    pieces.push(textLine(58, 172, headline[0], 42, ink, 800));
    pieces.push(textLine(58, 226, headline[1], 42, accent, 800));
    pieces.push('<path d="M565 290C635 290 686 344 686 414S635 538 565 538S444 484 444 414S495 290 565 290Z" fill="none" stroke="' + ink + '" stroke-width="5"/>');
    pieces.push('<path d="M490 672Q510 510 565 510Q620 510 640 672M530 390Q565 420 600 390" fill="none" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>');
    pieces.push('<path d="M78 355H382M78 425H340M78 495H380" stroke="#c8b98e" stroke-width="3"/>');
    pieces.push(processRow(750, ink, accent, true));
    pieces.push(textLine(58, 940, "轻线条 · 人物叙事 · 清晰结构", 18, "#6d756e", 500));
  } else if (mode === "luxury") {
    pieces.push('<rect width="768" height="1024" fill="#071713" opacity=".78"/>');
    pieces.push('<rect x="38" y="38" width="692" height="948" rx="8" fill="none" stroke="#d8b55f" stroke-width="3"/>');
    pieces.push('<rect x="64" y="64" width="640" height="896" rx="4" fill="none" stroke="#d8b55f" stroke-opacity=".38"/>');
    pieces.push(textLine(384, 118, "小谷 · PREMIUM CASE", 18, "#e9cc82", 700, "middle"));
    pieces.push(textLine(384, 215, "高净值客户信任经营", 42, "#f7ecd1", 700, "middle"));
    pieces.push(textLine(384, 265, "专业、克制、长期", 19, "#d9c79f", 500, "middle"));
    pieces.push(processRow(520, "#f7ecd1", "#d6ae55", false));
    pieces.push(metricCards(650, "#f7ecd1", "#d6ae55", false));
    pieces.push(textLine(384, 920, "稳健经营  ·  价值复利", 19, "#e4c777", 600, "middle"));
  } else if (mode === "magazine") {
    pieces.push('<rect width="768" height="1024" fill="url(#light)"/>');
    pieces.push('<rect x="0" y="0" width="18" height="1024" fill="' + accent + '"/>');
    pieces.push(textLine(48, 72, "XIAOGU REVIEW", 18, ink, 800));
    pieces.push(textLine(48, 128, "人物", 62, accent, 800));
    pieces.push(textLine(48, 190, "与长期价值", 48, "#182b34", 800));
    pieces.push('<rect x="48" y="690" width="290" height="230" fill="#fffef8e8"/>');
    pieces.push(textLine(70, 742, "专访", 18, accent, 800));
    pieces.push(textLine(70, 792, "她如何用内容", 30, "#172c30", 700));
    pieces.push(textLine(70, 834, "建立专业信任", 30, "#172c30", 700));
    pieces.push(textLine(70, 885, "真实案例 / 30天复盘", 16, "#66736f", 500));
    pieces.push('<circle cx="664" cy="90" r="58" fill="' + ink + '"/>');
    pieces.push(textLine(664, 98, "07", 28, "#fff", 800, "middle"));
  } else if (mode === "graffiti") {
    pieces.push('<rect width="768" height="1024" fill="#10181d" opacity=".28"/>');
    pieces.push('<path d="M-40 210Q185 90 390 230T810 160" fill="none" stroke="#2fd0bf" stroke-width="35" stroke-linecap="round"/>');
    pieces.push('<path d="M42 580Q220 430 390 590T750 520" fill="none" stroke="#ffd44d" stroke-width="19" stroke-linecap="round"/>');
    pieces.push('<path d="M560 80L704 224M704 80L560 224" stroke="#ff6559" stroke-width="28" stroke-linecap="round"/>');
    pieces.push(textLine(50, 390, "把专业", 70, "#fff", 900));
    pieces.push(textLine(50, 475, "讲出人情味", 70, "#ffd44d", 900));
    pieces.push(textLine(52, 855, "城市内容实验 / 小谷案例", 22, "#fff", 700));
    pieces.push('<circle cx="610" cy="820" r="76" fill="none" stroke="#2fd0bf" stroke-width="18"/>');
  } else if (mode === "stage") {
    pieces.push('<rect width="768" height="1024" fill="#061d43" opacity=".68"/>');
    pieces.push('<path d="M45 0L310 720H0Z" fill="#2370dd" opacity=".34"/><path d="M723 0L458 720H768Z" fill="#ec4f65" opacity=".32"/>');
    pieces.push(textLine(384, 110, "XIAOGU CONTENT SUMMIT", 17, "#b9d6ff", 700, "middle"));
    pieces.push(textLine(384, 260, "让专业内容", 52, "#fff", 800, "middle"));
    pieces.push(textLine(384, 326, "成为信任入口", 52, "#61d2d5", 800, "middle"));
    pieces.push('<rect x="132" y="700" width="504" height="144" rx="18" fill="#081d3de8" stroke="#438bef"/>');
    pieces.push(textLine(384, 754, "年度内容增长分享", 24, "#fff", 700, "middle"));
    pieces.push(textLine(384, 799, "定位 · 表达 · 连接 · 转化", 18, "#abc8ec", 500, "middle"));
    pieces.push(textLine(384, 936, "真实演讲现场案例", 18, "#d8e8ff", 500, "middle"));
  } else if (mode === "notes") {
    pieces.push('<rect width="768" height="1024" fill="#342f28" opacity=".18"/>');
    pieces.push('<path d="M52 95L710 58L738 947L80 985Z" fill="#faf0d9f5" filter="url(#shadow)"/>');
    pieces.push('<path d="M105 235H675M108 316H678M111 397H681M114 478H684M117 559H687M120 640H690M123 721H693" stroke="#bd9f72" stroke-opacity=".34" stroke-width="2"/>');
    pieces.push(textLine(110, 175, "内容经营复盘手记", 36, "#39524c", 700));
    pieces.push('<path d="M108 191Q296 210 474 185" fill="none" stroke="' + accent + '" stroke-width="7" stroke-linecap="round"/>');
    pieces.push(textLine(120, 285, "① 找到真实客户问题", 24, ink, 500));
    pieces.push(textLine(124, 366, "② 用自己的话讲明白", 24, ink, 500));
    pieces.push(textLine(128, 447, "③ 持续记录反馈", 24, ink, 500));
    pieces.push(textLine(132, 528, "④ 让信任自然发生", 24, ink, 500));
    pieces.push('<path d="M470 660Q535 605 610 658Q548 728 470 660Z" fill="none" stroke="' + accent + '" stroke-width="6"/>');
    pieces.push(textLine(138, 860, "小谷 · 真实案例笔记", 18, "#6b756f", 600));
  } else if (mode === "clay") {
    pieces.push('<rect width="768" height="1024" fill="#e9dbc6"/>');
    pieces.push('<ellipse cx="384" cy="887" rx="300" ry="70" fill="#765b48" opacity=".16"/>');
    pieces.push('<rect x="68" y="155" width="632" height="180" rx="42" fill="#e7b36a" filter="url(#shadow)"/>');
    pieces.push(textLine(384, 222, "保险经纪人的内容增长", 34, "#51382b", 800, "middle"));
    pieces.push(textLine(384, 275, "一套可执行的真实案例", 19, "#705445", 600, "middle"));
    const clayColors = ["#d86d54", "#4d8d7f", "#d3a54e", "#6a7d9b", "#b46f86"];
    clayColors.forEach((color, clayIndex) => {
      const x = 70 + clayIndex * 132;
      pieces.push('<rect x="' + x + '" y="420" width="106" height="170" rx="32" fill="' + color + '" filter="url(#shadow)"/>');
      pieces.push('<circle cx="' + (x + 53) + '" cy="462" r="23" fill="#f3d6bd"/>');
      pieces.push(textLine(x + 53, 550, ["定位", "内容", "连接", "转化", "复盘"][clayIndex], 17, "#fff7e7", 700, "middle"));
    });
    pieces.push('<circle cx="384" cy="760" r="82" fill="#f0c7a6" filter="url(#shadow)"/><path d="M250 925Q270 790 384 790Q498 790 518 925" fill="#335f58" filter="url(#shadow)"/>');
  } else if (mode === "minimal") {
    pieces.push('<rect width="768" height="1024" fill="#f7f1e5"/>');
    pieces.push(textLine(56, 90, "小谷", 18, ink, 700));
    pieces.push(textLine(56, 215, "内容不是", 56, "#203531", 800));
    pieces.push(textLine(56, 286, "发得更多", 56, accent, 800));
    pieces.push(textLine(56, 366, "而是更接近真实问题", 26, "#62706c", 500));
    pieces.push('<path d="M74 540Q180 448 288 540T500 540T712 500" fill="none" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>');
    pieces.push('<circle cx="180" cy="680" r="54" fill="none" stroke="' + accent + '" stroke-width="5"/><path d="M102 860Q118 744 180 744Q242 744 258 860" fill="none" stroke="' + ink + '" stroke-width="5"/>');
    pieces.push('<path d="M350 685H650M350 755H600M350 825H675" stroke="#c6b996" stroke-width="4" stroke-linecap="round"/>');
    pieces.push(textLine(56, 956, "极简手绘 · 真实观点", 17, "#6d756e", 500));
  } else if (mode === "business") {
    pieces.push('<rect width="768" height="1024" fill="url(#shade)"/>');
    pieces.push('<rect x="40" y="52" width="688" height="920" rx="20" fill="#0f2a3ac7" stroke="#6092a7" stroke-opacity=".45"/>');
    pieces.push(textLine(70, 108, "小谷 · BUSINESS CASE", 17, "#8fc5d1", 700));
    pieces.push(textLine(70, 205, "专业表达如何", 44, "#fff", 800));
    pieces.push(textLine(70, 260, "转化为稳定咨询", 44, "#64d1c6", 800));
    pieces.push(processRow(425, "#fff", "#d7b35c", false));
    pieces.push(metricCards(570, "#fff", "#2b8290", false));
    pieces.push('<rect x="70" y="760" width="628" height="120" rx="14" fill="#ffffff10" stroke="#ffffff24"/>');
    pieces.push(textLine(94, 810, "关键结论", 17, "#d7b35c", 700));
    pieces.push(textLine(94, 850, "持续回应真实问题，比追逐热点更有价值", 21, "#eaf2f4", 600));
  } else if (mode === "blackboard") {
    pieces.push('<rect width="768" height="1024" fill="#173b35"/>');
    pieces.push('<path d="M0 210H768M0 410H768M0 610H768M0 810H768" stroke="#fff" stroke-opacity=".06" stroke-width="2"/>');
    pieces.push(textLine(384, 88, "小谷 · 黑板复盘课", 18, "#e8d9b9", 600, "middle"));
    pieces.push(textLine(384, 170, "内容增长路线图", 44, "#f4e9cd", 700, "middle"));
    pieces.push('<path d="M100 245H668" stroke="#e8a66f" stroke-width="5" stroke-linecap="round"/>');
    pieces.push(processRow(350, "#f4e9cd", "#e39b68", false));
    pieces.push('<path d="M120 540Q220 450 315 548L430 420L640 560" fill="none" stroke="#8bc7b8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>');
    pieces.push('<circle cx="120" cy="540" r="14" fill="#f4e9cd"/><circle cx="315" cy="548" r="14" fill="#f4e9cd"/><circle cx="430" cy="420" r="14" fill="#f4e9cd"/><circle cx="640" cy="560" r="14" fill="#f4e9cd"/>');
    pieces.push(textLine(90, 720, "真实反馈", 22, "#e8a66f", 700));
    pieces.push(textLine(90, 764, "30天持续更新 · 18次主动咨询", 23, "#f4e9cd", 500));
    pieces.push(textLine(90, 820, "结论：稳定，比爆款更重要", 23, "#8bc7b8", 600));
  } else if (mode === "flat") {
    pieces.push('<rect width="768" height="1024" fill="#f6f2e7"/>');
    pieces.push('<circle cx="650" cy="105" r="120" fill="#d9eee7"/>');
    pieces.push(textLine(56, 76, "小谷 · 扁平知识卡", 18, ink, 700));
    pieces.push(textLine(56, 160, "一张图看懂", 42, "#203a37", 800));
    pieces.push(textLine(56, 216, "内容增长五步法", 42, accent, 800));
    const flatColors = ["#e96b56", "#2e837a", "#e6b44e", "#58799d", "#92719b"];
    flatColors.forEach((color, flatIndex) => {
      const x = 48 + (flatIndex % 2) * 340;
      const y = 300 + Math.floor(flatIndex / 2) * 175;
      pieces.push('<rect x="' + x + '" y="' + y + '" width="' + (flatIndex === 4 ? 672 : 316) + '" height="140" rx="22" fill="' + color + '"/>');
      pieces.push(textLine(x + 24, y + 52, "0" + (flatIndex + 1) + "  " + ["定位客户", "整理问题", "持续表达", "建立信任", "复盘转化"][flatIndex], 22, "#fff", 700));
      pieces.push(textLine(x + 24, y + 94, "从真实场景出发", 17, "#ffffffcc", 500));
    });
  } else if (mode === "morandi") {
    pieces.push('<rect width="768" height="1024" fill="url(#light)"/>');
    pieces.push('<rect x="38" y="480" width="692" height="474" rx="18" fill="#e8e1d7e8" filter="url(#shadow)"/>');
    pieces.push('<circle cx="660" cy="540" r="62" fill="#a98b84" opacity=".65"/>');
    pieces.push(textLine(70, 555, "小谷 · 莫兰迪案例", 18, ink, 700));
    pieces.push(textLine(70, 640, headline[0], 40, "#394b47", 800));
    pieces.push(textLine(70, 692, headline[1], 40, "#9b6f69", 800));
    pieces.push('<rect x="70" y="755" width="180" height="120" rx="14" fill="#b7c3ba"/><rect x="270" y="755" width="180" height="120" rx="14" fill="#c6b4aa"/><rect x="470" y="755" width="180" height="120" rx="14" fill="#b8aa8f"/>');
    pieces.push(textLine(160, 810, "稳定表达", 19, "#fff", 700, "middle"));
    pieces.push(textLine(360, 810, "持续连接", 19, "#fff", 700, "middle"));
    pieces.push(textLine(560, 810, "长期转化", 19, "#fff", 700, "middle"));
  } else if (mode === "science") {
    pieces.push('<rect width="768" height="1024" fill="#f7f0df"/>');
    pieces.push('<path d="M50 0V1024M130 0V1024M210 0V1024M290 0V1024M370 0V1024M450 0V1024M530 0V1024M610 0V1024M690 0V1024M0 80H768M0 160H768M0 240H768M0 320H768M0 400H768M0 480H768M0 560H768M0 640H768M0 720H768M0 800H768M0 880H768M0 960H768" stroke="#7ba2a0" stroke-opacity=".12" stroke-width="2"/>');
    pieces.push(textLine(54, 76, "小谷 · 科普手绘", 18, ink, 700));
    pieces.push(textLine(54, 152, "信任是如何", 42, "#263e43", 800));
    pieces.push(textLine(54, 205, "一步步建立的？", 42, accent, 800));
    pieces.push('<circle cx="202" cy="420" r="96" fill="none" stroke="' + ink + '" stroke-width="6"/><circle cx="202" cy="420" r="48" fill="' + accent + '" opacity=".7"/>');
    pieces.push('<path d="M310 420H676M570 390L676 420L570 450" fill="none" stroke="' + ink + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>');
    pieces.push('<rect x="60" y="600" width="648" height="275" rx="18" fill="#fff9e9" stroke="#d7c59b"/>');
    pieces.push(textLine(90, 655, "观察", 22, accent, 700));
    pieces.push(textLine(200, 655, "→", 26, ink, 700));
    pieces.push(textLine(265, 655, "表达", 22, accent, 700));
    pieces.push(textLine(375, 655, "→", 26, ink, 700));
    pieces.push(textLine(440, 655, "反馈", 22, accent, 700));
    pieces.push(textLine(550, 655, "→", 26, ink, 700));
    pieces.push(textLine(615, 655, "复盘", 22, accent, 700));
    pieces.push(textLine(90, 735, "案例数据：30天 / 24篇内容 / 18次主动咨询", 22, "#445b5e", 600));
    pieces.push(textLine(90, 805, "核心变量不是流量，而是持续回应真实问题", 20, "#687777", 500));
  } else if (mode === "dark") {
    pieces.push('<rect width="768" height="1024" fill="#07131d" opacity=".76"/>');
    pieces.push(textLine(54, 76, "小谷 · 深色专业案例", 18, "#7fc7c0", 700));
    pieces.push(textLine(54, 190, "把内容", 62, "#fff", 800));
    pieces.push(textLine(54, 262, "做成经营资产", 62, "#e0b970", 800));
    pieces.push('<path d="M54 315H714" stroke="#ffffff30"/>');
    pieces.push(processRow(455, "#fff", "#d7b35c", false));
    pieces.push(metricCards(590, "#fff", "#2b8290", false));
    pieces.push('<path d="M72 850Q210 760 340 836T690 760" fill="none" stroke="#4fb5aa" stroke-width="7"/>');
    pieces.push(textLine(54, 946, "专业判断 · 数据复盘 · 长期主义", 18, "#b9c8cc", 500));
  } else if (mode === "fresh") {
    pieces.push('<rect width="768" height="1024" fill="url(#light)"/>');
    pieces.push('<rect x="38" y="500" width="692" height="440" rx="30" fill="#f8fffbef" filter="url(#shadow)"/>');
    pieces.push(textLine(70, 555, "小谷 · 清爽案例", 18, ink, 700));
    pieces.push(textLine(70, 630, "少一点复杂", 40, "#25423e", 800));
    pieces.push(textLine(70, 681, "多一点真实连接", 40, accent, 800));
    pieces.push('<rect x="70" y="750" width="190" height="120" rx="22" fill="#d9eee7"/><rect x="288" y="750" width="190" height="120" rx="22" fill="#fde2d9"/><rect x="506" y="750" width="190" height="120" rx="22" fill="#e8ecd3"/>');
    pieces.push(textLine(165, 805, "客户问题", 19, "#2b645d", 700, "middle"));
    pieces.push(textLine(383, 805, "专业回应", 19, "#9a5142", 700, "middle"));
    pieces.push(textLine(601, 805, "持续跟进", 19, "#667048", 700, "middle"));
  } else if (mode === "daily-sign") {
    pieces.push('<rect width="768" height="1024" fill="#f2eee5" opacity=".12"/>');
    pieces.push('<rect x="74" y="92" width="620" height="840" fill="#f8f5ede0"/>');
    pieces.push(textLine(384, 170, "小谷 · 今日一签", 18, ink, 600, "middle"));
    pieces.push('<path d="M384 218V310" stroke="' + accent + '" stroke-width="2"/>');
    pieces.push(textLine(384, 420, "真正的专业", 48, "#263d38", 600, "middle"));
    pieces.push(textLine(384, 486, "是让人听得懂", 48, "#263d38", 600, "middle"));
    pieces.push('<circle cx="384" cy="580" r="34" fill="' + accent + '" opacity=".74"/>');
    pieces.push(textLine(384, 720, "不急着证明", 22, "#65736e", 500, "middle"));
    pieces.push(textLine(384, 762, "先认真理解", 22, "#65736e", 500, "middle"));
    pieces.push(textLine(384, 862, "长期信任，从一次真实回答开始", 18, "#7c6252", 500, "middle"));
  } else if (mode === "study") {
    pieces.push('<rect width="768" height="1024" fill="#efe4c9" opacity=".16"/>');
    pieces.push('<path d="M44 100L706 70L732 950L70 980Z" fill="#fff8e7ef" filter="url(#shadow)"/>');
    pieces.push(textLine(88, 160, "高效内容复盘笔记", 34, "#315b72", 800));
    pieces.push('<rect x="88" y="198" width="170" height="18" fill="#f6c747" opacity=".64"/>');
    const studyColors = ["#f29d72", "#67ad9f", "#e9bd55", "#7197c2", "#bd82aa"];
    studyColors.forEach((color, studyIndex) => {
      const x = 88 + studyIndex * 124;
      pieces.push('<circle cx="' + (x + 38) + '" cy="310" r="38" fill="' + color + '"/>');
      pieces.push(textLine(x + 38, 317, String(studyIndex + 1), 20, "#fff", 800, "middle"));
      pieces.push(textLine(x + 38, 375, ["定位", "素材", "表达", "互动", "复盘"][studyIndex], 17, "#3d5157", 700, "middle"));
    });
    pieces.push('<rect x="88" y="440" width="286" height="180" rx="14" fill="#fff" stroke="#e2d5b5"/><rect x="400" y="440" width="286" height="180" rx="14" fill="#fff" stroke="#e2d5b5"/>');
    pieces.push(textLine(110, 485, "本周重点", 19, "#e46b50", 700));
    pieces.push(textLine(110, 532, "✓ 回应3个客户问题", 18, "#53656a", 500));
    pieces.push(textLine(110, 572, "✓ 完成2次内容复盘", 18, "#53656a", 500));
    pieces.push(textLine(422, 485, "结果记录", 19, "#315b72", 700));
    pieces.push(textLine(422, 532, "24篇有效内容", 20, "#53656a", 600));
    pieces.push(textLine(422, 572, "18次主动咨询", 20, "#53656a", 600));
    pieces.push('<path d="M100 730Q250 650 380 724T670 690" fill="none" stroke="#e46b50" stroke-width="8" stroke-linecap="round"/>');
  } else if (mode === "large-sign") {
    pieces.push('<rect width="768" height="1024" fill="#081115" opacity=".68"/>');
    pieces.push(textLine(50, 80, "小谷 · 大字日签", 18, "#e0b970", 700));
    pieces.push(textLine(50, 300, "稳定", 112, "#fff", 900));
    pieces.push(textLine(50, 425, "比爆款", 112, "#fff", 900));
    pieces.push(textLine(50, 550, "更重要", 112, "#e0b970", 900));
    pieces.push('<path d="M50 615H710" stroke="#ffffff55" stroke-width="2"/>');
    pieces.push(textLine(50, 700, "真正可持续的增长", 28, "#f0f3f2", 700));
    pieces.push(textLine(50, 750, "来自一次次真实回应", 28, "#bdc7c4", 500));
    pieces.push(textLine(50, 935, "保险经纪人内容经营案例", 18, "#e0b970", 600));
  } else if (mode === "black-white") {
    pieces.push('<rect width="768" height="1024" fill="#fff" opacity=".06"/>');
    pieces.push('<rect x="36" y="40" width="696" height="944" fill="none" stroke="#fff" stroke-width="2"/>');
    pieces.push('<rect x="36" y="510" width="696" height="474" fill="#f7f7f4f2"/>');
    pieces.push(textLine(62, 565, "XIAOGU / CASE 01", 17, "#111", 800));
    pieces.push(textLine(62, 650, "保险经纪人的", 46, "#111", 800));
    pieces.push(textLine(62, 708, "内容增长路径", 46, "#111", 800));
    pieces.push('<path d="M62 746H706" stroke="#111" stroke-width="4"/>');
    pieces.push(processRow(820, "#111", "#111", true));
    pieces.push(textLine(62, 950, "30天持续经营 / 24篇内容 / 18次咨询", 18, "#333", 600));
  } else if (mode === "scrapbook") {
    pieces.push('<rect width="768" height="1024" fill="#e7d9c2c7" filter="url(#paper)"/>');
    pieces.push('<path d="M28 70L420 34L446 488L54 524Z" fill="none" stroke="#fff" stroke-width="22" filter="url(#shadow)"/>');
    pieces.push('<path d="M418 420L736 390L754 780L436 810Z" fill="#b7c8b9cc" stroke="#fff" stroke-width="16" filter="url(#shadow)"/>');
    pieces.push('<path d="M50 560L410 522L436 948L76 982Z" fill="#f6efdded" filter="url(#shadow)"/>');
    pieces.push('<path d="M74 560L214 545" stroke="#c65a4a" stroke-width="24" opacity=".6"/>');
    pieces.push(textLine(94, 640, "真实客户问题", 30, "#3e554f", 800));
    pieces.push(textLine(94, 695, "专业回应", 30, "#c25b4d", 800));
    pieces.push(textLine(94, 750, "持续连接", 30, "#3e554f", 800));
    pieces.push(textLine(94, 838, "一段内容，就是一次认真沟通", 18, "#68736f", 500));
    pieces.push('<circle cx="614" cy="620" r="60" fill="#d9a84b"/><path d="M520 778Q535 680 614 680Q693 680 708 778" fill="#4f766b"/>');
  } else if (mode === "clean") {
    pieces.push('<rect width="768" height="1024" fill="#f9fbfd"/>');
    pieces.push('<rect x="0" y="0" width="768" height="130" fill="#1f6694"/>');
    pieces.push(textLine(54, 62, "小谷 · CLEAN CASE", 18, "#fff", 700));
    pieces.push(textLine(54, 108, "保险经纪人内容经营", 30, "#fff", 800));
    pieces.push(textLine(54, 220, "从真实问题开始", 44, "#203b52", 800));
    pieces.push(textLine(54, 274, "建立稳定信任", 44, "#ec6b3d", 800));
    const cleanColors = ["#246b99", "#ec6b3d", "#57a6b2", "#e6a64d", "#457b69"];
    cleanColors.forEach((color, cleanIndex) => {
      const x = 48 + cleanIndex * 142;
      pieces.push('<rect x="' + x + '" y="350" width="122" height="235" rx="16" fill="#fff" stroke="' + color + '" stroke-width="3"/>');
      pieces.push('<circle cx="' + (x + 61) + '" cy="420" r="34" fill="' + color + '"/>');
      pieces.push(textLine(x + 61, 490, ["定位", "素材", "表达", "连接", "复盘"][cleanIndex], 18, color, 700, "middle"));
      pieces.push(textLine(x + 61, 535, "真实", 15, "#75808a", 500, "middle"));
    });
    pieces.push(metricCards(680, "#203b52", "#ec6b3d", true));
    pieces.push(textLine(54, 945, "简洁、清晰、可执行", 19, "#587080", 600));
  } else if (mode === "daily") {
    pieces.push('<rect width="768" height="1024" fill="#f6f1e8ed"/>');
    pieces.push('<path d="M40 42H728V982H40Z" fill="#fbf7ef" stroke="#9f9380" stroke-width="2"/>');
    pieces.push(textLine(384, 105, "小谷经营日报", 46, "#28343a", 800, "middle"));
    pieces.push('<path d="M64 132H704M64 150H704" stroke="#9f3f36" stroke-width="3"/>');
    pieces.push(textLine(64, 205, "保险经纪人如何建立长期内容资产", 30, "#262f33", 800));
    pieces.push('<rect x="64" y="245" width="420" height="270" fill="#d7d4cc" opacity=".24"/>');
    pieces.push('<rect x="510" y="245" width="194" height="270" fill="#efe8db" stroke="#c8bba5"/>');
    pieces.push(textLine(532, 290, "案例数据", 18, "#9f3f36", 800));
    pieces.push(textLine(532, 352, "30天", 32, "#27343a", 800));
    pieces.push(textLine(532, 405, "24篇内容", 24, "#27343a", 700));
    pieces.push(textLine(532, 455, "18次咨询", 24, "#27343a", 700));
    pieces.push('<path d="M64 555H704" stroke="#9f9380"/>');
    pieces.push(textLine(64, 610, "真实问题，是最好的选题来源", 24, "#9f3f36", 700));
    pieces.push(textLine(64, 660, "从客户沟通中整理问题，再用自己的语言持续回应。", 19, "#4e5a5d", 500));
    pieces.push(textLine(64, 705, "当内容开始解决具体问题，信任与咨询会自然发生。", 19, "#4e5a5d", 500));
    pieces.push('<path d="M64 760H704" stroke="#c7bca8"/>');
    pieces.push(textLine(64, 820, "本期观察", 18, "#9f3f36", 800));
    pieces.push(textLine(64, 868, "稳定更新不是重复，而是持续证明专业判断。", 21, "#303b3f", 600));
    pieces.push(textLine(64, 940, "第 07 期  ·  内容经营专题", 16, "#7b817e", 500));
  } else {
    pieces.push('<rect width="768" height="1024" fill="url(#light)"/>');
    pieces.push(textLine(54, 76, "小谷 · 真实增长案例", 18, ink, 700));
    pieces.push(textLine(54, 585, headline[0], 42, "#172c30", 800));
    pieces.push(textLine(54, 639, headline[1], 42, accent, 800));
    pieces.push(processRow(730, ink, accent, true));
    pieces.push(metricCards(820, ink, accent, true));
  }

  pieces.push("</svg>");
  return Buffer.from(pieces.join(""));
}

await ensurePhotos();
await mkdir(outputDir, { recursive: true });

for (const [index, style] of styles.entries()) {
  const [id, photoIndex] = style;
  const source = path.join(cacheDir, "photo-" + (photoIndex + 1) + ".jpg");
  const position = ["zen", "dark", "graffiti"].includes(style[2]) ? "centre" : "attention";
  const base = await sharp(source)
    .resize(width, height, { fit: "cover", position })
    .modulate({ saturation: style[2] === "black-white" ? 0 : 0.88, brightness: style[2] === "luxury" ? 0.72 : 0.96 })
    .toBuffer();
  await sharp(base)
    .composite([{ input: posterOverlay(style, index), blend: "over" }])
    .webp({ quality: 86, effort: 6 })
    .toFile(path.join(outputDir, id + ".webp"));
}

console.log("Generated " + styles.length + " realistic image-card case samples in " + outputDir);
