import { getQuotaCost, type QuotaAction } from "./quota";
import { isDemoModeEnabled } from "@/lib/config/runtime";
import { tryGetLocalQuotaBalance } from "@/lib/db/repositories";

type MeteringMode = "openmeter" | "demo" | "unconfigured";

function getConfig() {
  return {
    baseUrl: process.env.OPENMETER_BASE_URL?.replace(/\/$/, ""),
    apiKey: process.env.OPENMETER_API_KEY,
    namespace: process.env.OPENMETER_NAMESPACE ?? "insurance-content-agent",
    featureKey: process.env.OPENMETER_FEATURE_KEY ?? "ai_content_generation",
  };
}

export function getMeteringMode(): MeteringMode {
  const { baseUrl, apiKey } = getConfig();
  if (baseUrl && apiKey) return "openmeter";
  return isDemoModeEnabled() ? "demo" : "unconfigured";
}

export async function getQuotaBalance(customerId: string) {
  const { baseUrl, apiKey, featureKey } = getConfig();
  const localBalance = await tryGetLocalQuotaBalance(customerId);
  if (!baseUrl || !apiKey) {
    if (!isDemoModeEnabled()) {
      return {
        balance: localBalance,
        hasAccess: localBalance > 0,
        mode: "unconfigured" as const,
      };
    }

    return {
      balance: 100,
      hasAccess: true,
      mode: "demo" as const,
    };
  }

  const customer = await ensureCustomer(customerId);
  if (!customer?.id) {
    return {
      balance: localBalance || (isDemoModeEnabled() ? 100 : 0),
      hasAccess: localBalance > 0 || isDemoModeEnabled(),
      mode: "openmeter" as const,
    };
  }

  const response = await fetch(`${baseUrl}/customers/${encodeURIComponent(customer.id)}/entitlement-access`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    return {
      balance: localBalance,
      hasAccess: localBalance > 0,
      mode: "openmeter" as const,
    };
  }

  const payload = (await response.json()) as {
    data?: Array<{
      feature?: { key?: string };
      feature_key?: string;
      balance?: number;
      has_access?: boolean;
      hasAccess?: boolean;
      value?: { balance?: number; hasAccess?: boolean; has_access?: boolean };
    }>;
    hasAccess?: boolean;
    balance?: number;
    value?: { balance?: number; hasAccess?: boolean };
  };

  const access = payload.data?.find((item) => item.feature?.key === featureKey || item.feature_key === featureKey);
  const hasExplicitBalance =
    access?.balance !== undefined || access?.value?.balance !== undefined || payload.balance !== undefined || payload.value?.balance !== undefined;
  const balance = access?.balance ?? access?.value?.balance ?? payload.balance ?? payload.value?.balance ?? 0;
  const hasAccess =
    access?.hasAccess ??
    access?.has_access ??
    access?.value?.hasAccess ??
    access?.value?.has_access ??
    payload.hasAccess ??
    payload.value?.hasAccess ??
    balance > 0;

  if (!access && isDemoModeEnabled()) {
    return { balance: 100, hasAccess: true, mode: "openmeter" as const };
  }

  const remoteBalance = hasExplicitBalance ? balance : hasAccess ? Number.MAX_SAFE_INTEGER : 0;
  const effectiveBalance = Math.max(remoteBalance, localBalance);
  return { balance: effectiveBalance, hasAccess: hasAccess || localBalance > 0, mode: "openmeter" as const };
}

export async function reportUsage(input: {
  customerId: string;
  action: QuotaAction;
  amount?: number;
  metadata?: Record<string, unknown>;
}) {
  const { baseUrl, apiKey, namespace } = getConfig();
  const amount = input.amount ?? getQuotaCost(input.action);

  if (!baseUrl || !apiKey) {
    if (!isDemoModeEnabled()) {
      return { ok: false, mode: "unconfigured" as const, amount };
    }

    return { ok: true, mode: "demo" as const, amount };
  }

  await ensureCustomer(input.customerId);

  const response = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/cloudevents+json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      specversion: "1.0",
      id: crypto.randomUUID(),
      type: "ai.content.quota.consumed",
      source: namespace,
      subject: input.customerId,
      time: new Date().toISOString(),
      data: {
        action: input.action,
        credits: amount,
        customer_id: input.customerId,
        ...input.metadata,
      },
    }),
  });

  return { ok: response.ok, mode: "openmeter" as const, amount };
}

export async function grantCredits(input: {
  customerId: string;
  amount: number;
  reason: string;
  eventId?: string;
  metadata?: Record<string, unknown>;
}) {
  const { baseUrl, apiKey, featureKey } = getConfig();
  if (!baseUrl || !apiKey) {
    if (!isDemoModeEnabled()) {
      return { ok: false, mode: "unconfigured" as const };
    }

    return { ok: true, mode: "demo" as const };
  }

  const customer = await ensureCustomer(input.customerId);
  if (!customer?.id) {
    return { ok: false, mode: "openmeter" as const };
  }

  const response = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/cloudevents+json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      specversion: "1.0",
      id: input.eventId ?? crypto.randomUUID(),
      type: "ai.content.quota.granted",
      source: getConfig().namespace,
      subject: input.customerId,
      time: new Date().toISOString(),
      data: {
        feature_key: featureKey,
        credits: input.amount,
        customer_id: input.customerId,
        reason: input.reason,
        ...input.metadata,
      },
    }),
  });

  return { ok: response.ok, mode: "openmeter" as const };
}

export async function revokeCredits(input: {
  customerId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  return reportUsage({
    customerId: input.customerId,
    action: "write_script",
    amount: input.amount,
    metadata: {
      adjustment: "credit_revocation",
      reason: input.reason,
      ...input.metadata,
    },
  });
}

async function ensureCustomer(customerId: string) {
  const { baseUrl, apiKey } = getConfig();
  if (!baseUrl || !apiKey) return null;

  const existing = await fetch(`${baseUrl}/customers?key=${encodeURIComponent(customerId)}`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (existing.ok) {
    const payload = (await existing.json()) as { data?: Array<{ id: string; key: string; name?: string }> };
    const customer = payload.data?.find((item) => item.key === customerId);
    if (customer) return customer;
  }

  const created = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
    body: JSON.stringify({
      key: customerId,
      name: `Broker ${customerId.slice(0, 8)}`,
    }),
  });

  if (!created.ok) return null;
  return (await created.json()) as { id: string; key: string; name?: string };
}
