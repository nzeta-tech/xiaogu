import sharp from "sharp";
import type { CreationFieldValue } from "@/lib/creation/output";

type RenewalValues = Record<string, CreationFieldValue>;
type RenewalStyle = "renewal-handwritten" | "renewal-warm" | "renewal-business";

type RenewalData = {
  customer: string;
  insurer: string;
  product: string;
  policyNumber: string;
  renewalDate: string;
  premium: string;
  advisorName: string;
  advisorCompany: string;
  contactText: string;
  ratio: "3:4" | "1:1";
  portrait: string;
};

export async function renderPolicyRenewalCards(values: RenewalValues) {
  const data = await normalizeRenewalData(values);
  const primaryStyle = normalizeStyle(valueOf(values.style));
  const alternateStyle: RenewalStyle = primaryStyle === "renewal-handwritten" ? "renewal-warm" : "renewal-handwritten";
  const styles = [primaryStyle, alternateStyle];
  const images = await Promise.all(styles.map(async (style, index) => ({
    id: `renewal-${style}-${index + 1}`,
    url: await renderRenewalCard(data, style),
  })));
  const message = buildRenewalWechatMessage(data);

  return {
    mode: "image" as const,
    images,
    summary: message,
    retryable: false,
  };
}

function normalizeStyle(value: string): RenewalStyle {
  if (value === "renewal-warm" || value === "renewal-business") return value;
  return "renewal-handwritten";
}

async function normalizeRenewalData(values: RenewalValues): Promise<RenewalData> {
  const rawPolicyNumber = valueOf(values.policy_number).trim();
  const policyNumber = valueOf(values.privacy_mode) === "full" ? rawPolicyNumber : maskPolicyNumber(rawPolicyNumber);
  return {
    customer: limit(valueOf(values.customer_salutation), 24) || "尊敬的客户",
    insurer: limit(valueOf(values.insurer), 30),
    product: limit(valueOf(values.product_name), 34),
    policyNumber: limit(policyNumber, 30),
    renewalDate: limit(valueOf(values.renewal_date), 28),
    premium: limit(`${valueOf(values.premium_amount)} ${valueOf(values.currency)}`.trim(), 28),
    advisorName: limit(valueOf(values.advisor_name), 18),
    advisorCompany: limit(valueOf(values.advisor_company), 28),
    contactText: limit(valueOf(values.contact_text), 80) || "如需协助了解续费流程，请随时联系我。",
    ratio: valueOf(values.ratio) === "1:1" ? "1:1" : "3:4",
    portrait: await normalizePortrait(valueOf(values.reference_image), valueOf(values.portrait_treatment)),
  };
}

async function normalizePortrait(value: string, treatment: string) {
  const match = value.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return "";
  try {
    let pipeline = sharp(Buffer.from(match[1], "base64"))
      .rotate()
      .resize(420, 560, { fit: "cover", position: "attention" });
    if (treatment !== "original") {
      pipeline = pipeline.modulate({ brightness: 1.05, saturation: 0.72 }).sharpen({ sigma: 0.8 });
    }
    const buffer = await pipeline.png().toBuffer();
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function renderRenewalCard(data: RenewalData, style: RenewalStyle) {
  const width = 1200;
  const height = data.ratio === "1:1" ? 1200 : 1600;
  const svg = style === "renewal-warm"
    ? renderWarmSvg(data, width, height)
    : style === "renewal-business"
      ? renderBusinessSvg(data, width, height)
      : renderHandwrittenSvg(data, width, height);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function renderHandwrittenSvg(data: RenewalData, width: number, height: number) {
  const compact = height === 1200;
  const infoStart = 390;
  const rowGap = compact ? 82 : 112;
  const contactY = infoStart + rowGap * 5 + 20;
  const footerY = height - (compact ? 130 : 170);
  return svgDocument(width, height, `
    <rect width="${width}" height="${height}" fill="#fbfaf5"/>
    <rect x="34" y="34" width="${width - 68}" height="${height - 68}" rx="18" fill="none" stroke="#b85b54" stroke-width="4" stroke-dasharray="14 8"/>
    <path d="M80 115 C270 78 880 82 1090 116" fill="none" stroke="#b85b54" stroke-width="6" stroke-linecap="round"/>
    <rect x="92" y="96" width="1016" height="150" rx="10" fill="#fffefa" stroke="#b85b54" stroke-width="5"/>
    <text x="600" y="193" text-anchor="middle" class="title" fill="#1f2424">保单续费提醒</text>
    <text x="92" y="304" class="salutation" fill="#252b2a">${xml(data.customer)}：</text>
    ${infoRow("01", "投保信息", `${data.insurer} · ${data.product}`, infoStart, "#dce9ef")}
    ${infoRow("02", "保单号码", data.policyNumber, infoStart + rowGap, "#f5e4df")}
    ${infoRow("03", "续费日期", data.renewalDate, infoStart + rowGap * 2, "#fff0c9")}
    ${infoRow("04", "本期保费", data.premium, infoStart + rowGap * 3, "#e5efe1")}
    ${infoRow("05", "温馨提示", "请提前核对账户与续费安排", infoStart + rowGap * 4, "#eee7f5")}
    <path d="M90 ${contactY - 35} H1110" stroke="#cfd3ce" stroke-width="2" stroke-dasharray="12 10"/>
    <text x="98" y="${contactY + 8}" class="section" fill="#2f3936">联系我</text>
    ${svgText(data.contactText, 98, contactY + 58, compact ? 28 : 31, compact ? 42 : 48, compact ? 32 : 38, "#424b48", "body")}
    <g transform="translate(${compact ? 820 : 790} ${compact ? 920 : 1230}) rotate(-2)">
      <rect width="300" height="116" rx="12" fill="#ffffff" stroke="#76909a" stroke-width="3"/>
      <text x="150" y="47" text-anchor="middle" class="small" fill="#52646b">您的保险顾问</text>
      <text x="150" y="85" text-anchor="middle" class="advisor" fill="#202827">${xml(data.advisorName)}</text>
    </g>
    ${portraitCircle(data.portrait, compact ? 980 : 1010, compact ? 850 : 1138, compact ? 82 : 96)}
    <text x="92" y="${footerY}" class="disclaimer" fill="#767c77">续费结果与保单状态请以保险公司通知及合同约定为准</text>
    <text x="1100" y="${footerY}" text-anchor="end" class="small" fill="#8b5550">${xml(data.advisorCompany || data.advisorName)}</text>
    <path d="M1035 275 l16 -22 l16 22 l28 3 l-20 18 l6 27 l-30 -14 l-26 14 l5 -27 l-20 -18 z" fill="none" stroke="#b85b54" stroke-width="3"/>
  `, handwrittenCss());
}

function renderWarmSvg(data: RenewalData, width: number, height: number) {
  const compact = height === 1200;
  const panelY = compact ? 300 : 380;
  const panelHeight = compact ? 680 : 900;
  const rowGap = compact ? 102 : 128;
  const portraitX = compact ? 792 : 760;
  const portraitY = compact ? 350 : 450;
  const portraitW = compact ? 320 : 370;
  const portraitH = compact ? 550 : 720;
  return svgDocument(width, height, `
    <rect width="${width}" height="${height}" fill="#fff8e9"/>
    <rect x="30" y="30" width="1140" height="${height - 60}" rx="34" fill="none" stroke="#927f5d" stroke-width="4"/>
    <circle cx="1040" cy="155" r="52" fill="#f6df91" opacity=".8"/>
    <circle cx="112" cy="220" r="28" fill="#dfe9c4"/>
    <text x="600" y="162" text-anchor="middle" class="warmTitle" fill="#43392d">保单续费提醒</text>
    <rect x="86" y="208" width="520" height="72" rx="36" fill="#e9edcf" stroke="#a8ad83" stroke-width="2"/>
    <text x="346" y="256" text-anchor="middle" class="salutation" fill="#4b5038">${xml(data.customer)}</text>
    <rect x="70" y="${panelY}" width="650" height="${panelHeight}" rx="24" fill="#fffdf5" stroke="#a6987a" stroke-width="3"/>
    ${warmRow("投保信息", `${data.insurer} · ${data.product}`, panelY + 92)}
    ${warmRow("保单号码", data.policyNumber, panelY + 92 + rowGap)}
    ${warmRow("续费日期", data.renewalDate, panelY + 92 + rowGap * 2, true)}
    ${warmRow("本期保费", data.premium, panelY + 92 + rowGap * 3, true)}
    ${warmRow("服务提醒", "请提前核对账户与续费安排", panelY + 92 + rowGap * 4)}
    ${advisorPortrait(data.portrait, portraitX, portraitY, portraitW, portraitH)}
    <text x="${portraitX + portraitW / 2}" y="${portraitY + portraitH + 48}" text-anchor="middle" class="small" fill="#6a6255">您的保险顾问</text>
    <text x="${portraitX + portraitW / 2}" y="${portraitY + portraitH + 91}" text-anchor="middle" class="advisor" fill="#43392d">${xml(data.advisorName)}</text>
    <path d="M86 ${height - 210} H1114" stroke="#bcb197" stroke-width="2" stroke-dasharray="10 8"/>
    ${svgText(data.contactText, 100, height - 150, compact ? 25 : 29, 42, compact ? 38 : 48, "#4f4a41", "body")}
    <text x="1100" y="${height - 72}" text-anchor="end" class="disclaimer" fill="#81796b">具体以保险公司通知及合同约定为准</text>
  `, warmCss());
}

function renderBusinessSvg(data: RenewalData, width: number, height: number) {
  const compact = height === 1200;
  const startY = compact ? 330 : 420;
  const gap = compact ? 112 : 142;
  return svgDocument(width, height, `
    <rect width="${width}" height="${height}" fill="#f4f7f8"/>
    <rect width="${width}" height="255" fill="#183f45"/>
    <rect x="68" y="62" width="8" height="126" fill="#d3ad62"/>
    <text x="108" y="125" class="businessEyebrow" fill="#d9c28f">POLICY SERVICE</text>
    <text x="108" y="190" class="businessTitle" fill="#ffffff">保单续费提醒</text>
    <text x="1090" y="177" text-anchor="end" class="small" fill="#d5e3e2">${xml(data.customer)}</text>
    <rect x="68" y="${startY - 70}" width="1064" height="${compact ? 610 : 790}" rx="18" fill="#ffffff" stroke="#d9e2e4" stroke-width="2"/>
    ${businessRow("投保信息", `${data.insurer} · ${data.product}`, startY)}
    ${businessRow("保单号码", data.policyNumber, startY + gap)}
    ${businessRow("续费日期", data.renewalDate, startY + gap * 2, true)}
    ${businessRow("本期保费", data.premium, startY + gap * 3, true)}
    ${businessRow("服务提醒", "请提前核对账户与续费安排", startY + gap * 4)}
    <rect x="68" y="${height - 240}" width="1064" height="130" rx="14" fill="#e9f2f1"/>
    <text x="98" y="${height - 188}" class="small" fill="#587477">${xml(data.advisorCompany || "保险服务顾问")}</text>
    <text x="98" y="${height - 145}" class="advisor" fill="#183f45">${xml(data.advisorName)}</text>
    <text x="1098" y="${height - 160}" text-anchor="end" class="disclaimer" fill="#65777a">保单状态以保险公司通知及合同约定为准</text>
  `, businessCss());
}

function infoRow(index: string, label: string, value: string, y: number, fill: string) {
  return `<g><rect x="90" y="${y - 48}" width="72" height="62" rx="8" fill="${fill}"/><text x="126" y="${y - 8}" text-anchor="middle" class="index">${index}</text><text x="188" y="${y - 19}" class="small" fill="#707773">${xml(label)}</text><text x="188" y="${y + 22}" class="value" fill="#222927">${xml(value)}</text></g>`;
}

function warmRow(label: string, value: string, y: number, highlight = false) {
  return `<g><text x="112" y="${y - 24}" class="small" fill="#847966">${xml(label)}</text><rect x="108" y="${y - 4}" width="560" height="64" rx="14" fill="${highlight ? "#fff0c9" : "#f6f1e4"}"/><text x="136" y="${y + 39}" class="value" fill="#453d32">${xml(value)}</text></g>`;
}

function businessRow(label: string, value: string, y: number, highlight = false) {
  return `<g><text x="112" y="${y}" class="small" fill="#718084">${xml(label)}</text><text x="390" y="${y}" class="businessValue" fill="${highlight ? "#b67e20" : "#20383d"}">${xml(value)}</text><path d="M108 ${y + 36} H1090" stroke="#e3e9ea" stroke-width="2"/></g>`;
}

function portraitCircle(portrait: string, cx: number, cy: number, radius: number) {
  if (!portrait) return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#e4edf0"/><path d="M${cx - 38} ${cy + 28} q38 -72 76 0" fill="#93aab0"/><circle cx="${cx}" cy="${cy - 26}" r="28" fill="#93aab0"/>`;
  return `<defs><clipPath id="portraitCircle"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath></defs><image href="${portrait}" x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitCircle)"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#76909a" stroke-width="4"/>`;
}

function advisorPortrait(portrait: string, x: number, y: number, width: number, height: number) {
  if (!portrait) return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${width / 2}" fill="#e5ebe0"/><circle cx="${x + width / 2}" cy="${y + height * 0.3}" r="${width * 0.19}" fill="#9cad9f"/><path d="M${x + width * 0.2} ${y + height * 0.82} Q${x + width / 2} ${y + height * 0.42} ${x + width * 0.8} ${y + height * 0.82}" fill="#7e9a98"/></g>`;
  return `<defs><clipPath id="portraitWarm"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${width / 2}"/></clipPath></defs><image href="${portrait}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitWarm)"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${width / 2}" fill="none" stroke="#a6987a" stroke-width="4"/>`;
}

function svgText(text: string, x: number, y: number, fontSize: number, lineHeight: number, chars: number, fill: string, className: string) {
  const lines = wrapText(text, chars).slice(0, 3);
  return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${fill}" class="${className}">${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
}

function wrapText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const output: string[] = [];
  for (let index = 0; index < normalized.length; index += maxChars) output.push(normalized.slice(index, index + maxChars));
  return output.length > 0 ? output : [""];
}

function svgDocument(width: number, height: number, content: string, css: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${css}</style>${content}</svg>`;
}

function handwrittenCss() {
  return `text{font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif}.title{font-size:72px;font-weight:800}.salutation{font-size:40px;font-weight:650}.section{font-size:34px;font-weight:750}.value{font-size:34px;font-weight:700}.advisor{font-size:31px;font-weight:750}.small{font-size:24px}.index{font-size:24px;font-weight:800;fill:#44504d}.body{font-weight:500}.disclaimer{font-size:20px}`;
}

function warmCss() {
  return `text{font-family:"Noto Serif CJK SC","Songti SC","Noto Sans CJK SC",serif}.warmTitle{font-size:76px;font-weight:800}.salutation{font-size:35px;font-weight:650}.value{font-size:31px;font-weight:700}.advisor{font-size:31px;font-weight:750}.small{font-size:23px}.body{font-weight:500}.disclaimer{font-size:19px}`;
}

function businessCss() {
  return `text{font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif}.businessEyebrow{font-size:22px;font-weight:700;letter-spacing:4px}.businessTitle{font-size:66px;font-weight:800}.businessValue{font-size:34px;font-weight:750}.advisor{font-size:34px;font-weight:800}.small{font-size:24px}.disclaimer{font-size:19px}`;
}

function buildRenewalWechatMessage(data: RenewalData) {
  return `${data.customer}您好，提醒您在${data.insurer}投保的${data.product}将于${data.renewalDate}进入续费安排，本期保费为${data.premium}。请提前核对账户与续费安排，如需我协助确认流程，随时联系我。保单状态及续费结果以保险公司通知和合同约定为准。`;
}

function maskPolicyNumber(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-3)}`;
}

function valueOf(value: CreationFieldValue | undefined) {
  return Array.isArray(value) ? value.join("、") : value ?? "";
}

function limit(value: string, maxLength: number) {
  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
