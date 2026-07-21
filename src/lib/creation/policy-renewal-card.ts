import type { CreationFieldValue } from "@/lib/creation/output";

type RenewalValues = Record<string, CreationFieldValue>;
type RenewalStyle = "renewal-handwritten" | "renewal-warm" | "renewal-business";

const STYLE_PROMPTS: Record<RenewalStyle, string> = {
  "renewal-handwritten": "温暖的手写服务单风格：奶油色纸张、黑红双色手写、铅笔线稿、手绘边框、圈点批注、少量蓝灰便签元素，像顾问亲手整理给客户的一张有温度的服务提醒卡。",
  "renewal-warm": "温暖顾问风格：柔和奶油色背景、浅绿和浅蓝配色、轻水彩与彩色铅笔质感、自然植物或窗光背景，一侧为清晰信息区，一侧为亲和可信的保险顾问形象，像一张精致的客户服务卡。",
  "renewal-business": "简洁商务风格：白色或浅灰背景、深青色标题、克制的金色细节、现代编辑排版、清晰的信息分组和充足留白，像高端保险顾问发给客户的专业服务提醒卡。",
};

export function buildPolicyRenewalImagePrompt(values: RenewalValues) {
  const data = normalizeRenewalData(values);
  const style = normalizeStyle(valueOf(values.style));
  const hasPortrait = valueOf(values.avatar_visual_mode) === "yes" || isImageDataUrl(valueOf(values.reference_image));
  const portraitInstruction = hasPortrait
    ? "画面中需要自然呈现参考照片中的保险顾问形象，参考图仅用于人物形象，不要复制参考图中的文字或版式。"
    : "画面中可以使用简洁的顾问签名区或抽象人物插画，不要凭空生成一个容易误导客户的真人照片。";

  return [
    "请直接生成一张完整的中文保单续费提醒卡成品图。",
    "这是最终可下载、可发送给客户的单张图片，不是设计草稿，不是图片背景，不是文字填空模板，也不要在图片之外输出文案。",
    `视觉方向：${STYLE_PROMPTS[style]}`,
    `画面比例：${data.ratio}，一张竖版客户服务卡，主体完整居中，四周留有安全边距。`,
    portraitInstruction,
    "版式要求：顶部是醒目的“保单续费提醒”，下面有客户称呼；中部用清晰而有设计感的信息模块展示投保信息、保单号码、续费日期和本期保费；下部展示联系提示、顾问姓名和小谷保险顾问信息。图文必须在同一张图中融合完成。",
    "文字要求：所有下面列出的中文必须原样、清晰、完整地写在图片里，不得改写、漏字、错别字、乱码或用无意义的假文字替代。不要额外添加保险公司 logo、二维码、条款、收益承诺或未经提供的数字。",
    "必须出现的文字：",
    `标题：保单续费提醒`,
    `客户称呼：${data.customer}`,
    `投保信息：${data.insurer} · ${data.product}`,
    `保单号码：${data.policyNumber}`,
    `续费日期：${data.renewalDate}`,
    `本期保费：${data.premium}`,
    `联系提示：${data.contactText}`,
    `顾问姓名：${data.advisorName}`,
    `顾问公司：${data.advisorCompany}`,
    "底部合规提示：续费结果与保单状态请以保险公司通知及合同约定为准",
    "视觉质量要求：中文排版优先于装饰，信息层级清楚，文字不能被人物、图案或边框遮挡；不要做成手机截图、网页界面、PPT 截图、表单界面或一组多张小图；不要出现英文大标题。",
  ].join("\n");
}

function normalizeRenewalData(values: RenewalValues) {
  const rawPolicyNumber = valueOf(values.policy_number).trim();
  const policyNumber = valueOf(values.privacy_mode) === "full" ? rawPolicyNumber : maskPolicyNumber(rawPolicyNumber);
  return {
    customer: limit(valueOf(values.customer_salutation), 24) || "尊敬的客户",
    insurer: limit(valueOf(values.insurer), 30) || "保险公司",
    product: limit(valueOf(values.product_name), 34) || "保单产品",
    policyNumber: limit(policyNumber, 30) || "已脱敏",
    renewalDate: limit(valueOf(values.renewal_date), 28) || "请核对续费日期",
    premium: limit(`${valueOf(values.premium_amount)} ${valueOf(values.currency)}`.trim(), 28) || "请核对本期保费",
    advisorName: limit(valueOf(values.advisor_name), 18) || "小谷顾问",
    advisorCompany: limit(valueOf(values.advisor_company), 28) || "小谷保险顾问",
    contactText: limit(valueOf(values.contact_text), 80) || "如需协助了解续费流程，请随时联系我。",
    ratio: valueOf(values.ratio) === "1:1" ? "1:1" : "3:4",
  };
}

function normalizeStyle(value: string): RenewalStyle {
  if (value === "renewal-warm" || value === "renewal-business") return value;
  return "renewal-handwritten";
}

function valueOf(value: CreationFieldValue | undefined) {
  return Array.isArray(value) ? value.join("、") : value ?? "";
}

function limit(value: string, maxLength: number) {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function maskPolicyNumber(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-3)}`;
}

function isImageDataUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}
