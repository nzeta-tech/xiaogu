export type PolicyRenewalExtractedFields = {
  customer_salutation?: string;
  insurer?: string;
  product_name?: string;
  policy_number?: string;
  renewal_date?: string;
  premium_amount?: string;
  currency?: string;
  advisor_name?: string;
  advisor_company?: string;
};

export function extractPolicyRenewalFields(sourceText: string): {
  fields: PolicyRenewalExtractedFields;
  normalizedText: string;
  missing: string[];
} {
  const text = normalizeText(sourceText);
  const fields: PolicyRenewalExtractedFields = {};

  fields.customer_salutation = extractCustomerSalutation(text);
  fields.policy_number = firstMatch(text, [
    /(?:保单号|保单号码|保单编号)\s*[:：]?\s*([A-Za-z0-9\-*]+)/,
  ]);
  fields.renewal_date = firstMatch(text, [
    /(?:续费期|续费日期|续保日期|缴费日期)\s*[:：]?\s*((?:20\d{2}|[12][09]\d{2})年\d{1,2}月\d{1,2}日)/,
    /将于\s*((?:20\d{2}|[12][09]\d{2})年\d{1,2}月\d{1,2}日)\s*进入续费期/,
  ]);

  const insurerAndProduct = extractInsurerAndProduct(text);
  fields.insurer = insurerAndProduct.insurer;
  fields.product_name = insurerAndProduct.product;

  const premium = extractPremium(text);
  fields.premium_amount = premium.amount;
  fields.currency = premium.currency;

  const advisor = extractAdvisor(text);
  fields.advisor_name = advisor.name;
  fields.advisor_company = advisor.company;

  const missing = [
    "customer_salutation",
    "insurer",
    "product_name",
    "policy_number",
    "renewal_date",
    "premium_amount",
    "currency",
  ].filter((key) => !fields[key as keyof PolicyRenewalExtractedFields]);

  return {
    fields,
    normalizedText: text,
    missing,
  };
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .trim();
}

function extractCustomerSalutation(text: string) {
  const lineMatch = text.match(/(亲爱的?[^\n,:]{1,18}(?:女士|先生|老师|总|小姐|太太|您好))/);
  if (lineMatch?.[1]) return cleanValue(lineMatch[1]);
  const fallback = text.match(/([^\n,:]{1,10}(?:女士|先生|老师|总|小姐|太太))/);
  return cleanValue(fallback?.[1] ?? "");
}

function extractInsurerAndProduct(text: string) {
  const direct = text.match(/您在\s*([^\n,。；;]{2,24}?)\s*购买\s*([^\n,。；;]{2,30}?保单)/);
  if (direct) {
    return {
      insurer: cleanValue(direct[1]),
      product: cleanValue(direct[2]),
    };
  }

  const product = firstMatch(text, [
    /(?:产品名称|投保产品|购买产品)\s*[:：]?\s*([^\n,。；;]{2,30})/,
    /购买\s*([^\n,。；;]{2,30}?保单)/,
  ]);
  const insurer = firstMatch(text, [
    /(?:保险公司|承保公司|投保公司)\s*[:：]?\s*([^\n,。；;]{2,24})/,
    /您在\s*([^\n,。；;]{2,24}?)\s*购买/,
    /([^\n,。；;]{2,24}(?:保险|金融|人寿))/,
  ]);

  return {
    insurer: cleanValue(insurer),
    product: cleanValue(product),
  };
}

function extractPremium(text: string) {
  const line = text.match(/(?:保费|本期保费)\s*(?:为|:)?\s*([^\n,。；;]+)/);
  const raw = cleanValue(line?.[1] ?? "");
  if (!raw) return { amount: "", currency: "" };

  const normalized = raw.replace(/\s+/g, "");
  const currency = normalizeCurrency(
    firstMatch(normalized, [
      /(人民币|美元|美金|港币|新加坡元)/,
      /(USD|HKD|SGD|CNY)/i,
      /([$¥￥])/,
    ]),
  );
  const amount = cleanValue(
    normalized
      .replace(/人民币|美元|美金|港币|新加坡元/gi, "")
      .replace(/USD|HKD|SGD|CNY/gi, "")
      .replace(/[$¥￥]/g, ""),
  );

  return { amount, currency };
}

function extractAdvisor(text: string) {
  const name = firstMatch(text, [
    /您的[^\n]{0,12}保险顾问\s*([^\n,。；;]{1,12})/,
    /顾问姓名\s*[:：]?\s*([^\n,。；;]{1,12})/,
  ]);
  const company = firstMatch(text, [
    /您的([^\n,。；;]{2,20}(?:国际|保险|顾问|团队|工作室))/,
    /公司(?:或团队)?\s*[:：]?\s*([^\n,。；;]{2,20})/,
  ]);
  return {
    name: cleanValue(name),
    company: cleanValue(company),
  };
}

function normalizeCurrency(raw: string) {
  const value = raw.trim().toUpperCase();
  if (!value) return "";
  if (value === "美金" || value === "USD" || value === "$") return "美元";
  if (value === "HKD") return "港币";
  if (value === "SGD") return "新加坡元";
  if (value === "CNY" || value === "¥" || value === "￥") return "人民币";
  return raw === "美金" ? "美元" : raw;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function cleanValue(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[：:\-—\s]+|[：:\-—\s]+$/g, "").trim();
}
