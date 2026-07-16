export function isDemoModeEnabled() {
  return process.env.ENABLE_DEMO_MODE === "true";
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
}

export function hasModelConfig() {
  const provider = process.env.MODEL_PROVIDER ?? "openai";
  if (provider === "google") return Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY || process.env.MODEL_API_KEY);
  return Boolean(process.env.MODEL_API_BASE && process.env.MODEL_API_KEY);
}

export function hasImageModelConfig() {
  return Boolean(process.env.OPENAI_IMAGE_API_KEY || process.env.IMAGE_MODEL_API_KEY);
}

export function hasMeteringConfig() {
  return Boolean(process.env.OPENMETER_BASE_URL && process.env.OPENMETER_API_KEY);
}

export function hasStripeConfig() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function hasLiveStripeConfig() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") && process.env.STRIPE_WEBHOOK_SECRET);
}

export function assertCommercialServiceConfigured(service: "model" | "metering" | "stripe") {
  if (isDemoModeEnabled()) return;

  const configured =
    service === "model" ? hasModelConfig() : service === "metering" ? hasMeteringConfig() : hasStripeConfig();

  if (!configured) {
    const label = service === "model" ? "大模型" : service === "metering" ? "计量计费" : "Stripe 支付";
    throw new Error(`${label}未配置，生产模式不能使用 demo 能力`);
  }
}
