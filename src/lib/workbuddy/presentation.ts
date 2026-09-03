import { z } from "zod";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";

const presentationBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("markdown"), content: z.string().max(30000) }),
  z.object({ type: z.literal("table"), title: z.string().max(160).optional(), columns: z.array(z.string().max(100)).min(1).max(10), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(10)).max(50) }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "success", "warning", "danger"]), title: z.string().max(160).optional(), content: z.string().max(4000) }),
  z.object({ type: z.literal("steps"), title: z.string().max(160).optional(), items: z.array(z.object({ title: z.string().max(160), detail: z.string().max(1000).optional(), status: z.enum(["todo", "active", "done"]).optional() })).min(1).max(20) }),
  z.object({ type: z.literal("timeline"), title: z.string().max(160).optional(), items: z.array(z.object({ time: z.string().max(80), title: z.string().max(160), detail: z.string().max(1000).optional() })).min(1).max(30) }),
  z.object({ type: z.literal("flow"), title: z.string().max(160).optional(), nodes: z.array(z.object({ label: z.string().max(160), detail: z.string().max(500).optional() })).min(2).max(12) }),
  z.object({ type: z.literal("chart"), title: z.string().max(160), chartType: z.enum(["bar", "line", "donut"]), data: z.array(z.object({ label: z.string().max(100), value: z.number() })).min(1).max(20), unit: z.string().max(30).optional() }),
  z.object({ type: z.literal("sources"), title: z.string().max(160).optional(), items: z.array(z.object({ title: z.string().max(300), url: z.string().url(), publishedAt: z.string().max(80).optional(), note: z.string().max(300).optional() })).min(1).max(30) }),
  z.object({
    type: z.literal("choices"),
    question: z.string().max(500),
    options: z.array(z.object({ label: z.string().max(120), value: z.string().max(500), description: z.string().max(300).optional() })).min(1).max(8),
    multiple: z.boolean().optional(),
    minSelections: z.number().int().min(1).max(8).optional(),
    maxSelections: z.number().int().min(1).max(8).optional(),
    submitLabel: z.string().max(40).optional(),
    valuePrefix: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("form"),
    appSlug: z.string().min(1).max(100),
    title: z.string().max(200),
    description: z.string().max(600).optional(),
    submitLabel: z.string().max(60).optional(),
    fields: z.array(z.object({
      id: z.string().min(1).max(100), label: z.string().max(160), type: z.enum(["text", "textarea", "single", "multiple", "file"]), required: z.boolean(),
      placeholder: z.string().max(500).optional(), helper: z.string().max(500).optional(), accept: z.string().max(300).optional(), multiple: z.boolean().optional(),
      maxFiles: z.number().int().min(1).max(10).optional(), step: z.number().int().min(1).max(20).optional(), presentation: z.enum(["field", "data"]).optional(),
      visibleWhen: z.array(z.object({ fieldId: z.string().max(100), equals: z.string().max(500).optional(), oneOf: z.array(z.string().max(500)).max(20).optional(), hasValue: z.boolean().optional() })).max(10).optional(),
      visibleWhenAny: z.array(z.object({ fieldId: z.string().max(100), equals: z.string().max(500).optional(), oneOf: z.array(z.string().max(500)).max(20).optional(), hasValue: z.boolean().optional() })).max(10).optional(),
      revealAfter: z.array(z.string().max(100)).max(10).optional(),
      initialValue: z.union([z.string(), z.array(z.string())]).optional(),
      options: z.array(z.object({ label: z.string().max(160), value: z.string().max(500), description: z.string().max(300).optional(), previewUrl: z.string().max(1000).optional() })).max(30).optional(),
    })).min(1).max(30),
  }),
  z.object({ type: z.literal("artifact"), artifactId: z.string().min(1), title: z.string().max(200), artifactType: z.string().max(50), description: z.string().max(500).optional(), resultUrl: z.string().max(1000).optional() }),
]);

const presentationSchema = z.object({ blocks: z.array(presentationBlockSchema).min(1).max(12) });
export type WorkbuddyPresentationBlock = z.infer<typeof presentationBlockSchema>;

export async function planWorkbuddyPresentation(input: {
  userId: string;
  objective: string;
  response: string;
  artifact?: { id: string; title: string; artifactType: string; resultUrl?: string; appSlug?: string } | null;
  sources?: Array<{ title?: string; url?: string; publishedDate?: string }>;
}) {
  // Most chat answers and application deliveries are already well expressed as
  // Markdown plus artifact/source cards. Do not put a cosmetic model call on
  // the critical path unless the answer contains enough real numeric data to
  // benefit from a chart or other structured visualization.
  const numericSignals = input.response.match(/(?:同比|环比|占比|增长|下降|提升|减少)[^。\n]{0,24}?\d+(?:\.\d+)?%/g) ?? [];
  if (numericSignals.length < 2) return fallbackBlocks(input);

  const prompt = `你是小谷的展示规划器，只决定现有回答如何呈现，不改写事实，也不生成HTML/CSS。

可用原语：markdown、table、callout、steps、timeline、flow、chart、sources、choices、artifact。
自主选择最适合的少量原语；普通内容优先markdown，不要为了可视化而可视化。只有存在真实数值才使用chart。长对比适合table，需要用户选择时使用choices。
如果存在专业应用产物，必须使用给定artifactId生成artifact块；不得把专业产物正文复制、概括成另一份替代品。markdown只能作为小谷的交付说明。
来源只能使用给定来源，不得编造URL。所有块必须符合JSON字段。

用户目标：${input.objective}
小谷交付说明：${input.response}
专业产物：${JSON.stringify(input.artifact ?? null)}
可用来源：${JSON.stringify(input.sources ?? [])}

只输出JSON：{"blocks":[...]}。`;
  try {
    const raw = await runInsuranceContentAgent([{ role: "user", content: prompt }], input.userId, "general", { timeoutSeconds: 18 });
    const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? "";
    const parsed = presentationSchema.safeParse(JSON.parse(json));
    if (parsed.success) return ensureRequiredBlocks(parsed.data.blocks, input);
  } catch { /* safe fallback below */ }
  return fallbackBlocks(input);
}

function ensureRequiredBlocks(blocks: WorkbuddyPresentationBlock[], input: Parameters<typeof planWorkbuddyPresentation>[0]) {
  const result = [...blocks];
  if (!result.some(block => block.type === "markdown")) result.unshift({ type: "markdown", content: input.response });
  if (input.artifact && !result.some(block => block.type === "artifact" && block.artifactId === input.artifact?.id)) {
    result.push({ type: "artifact", artifactId: input.artifact.id, title: input.artifact.title, artifactType: input.artifact.artifactType, resultUrl: input.artifact.resultUrl, description: input.artifact.appSlug ? `由${input.artifact.appSlug}生成的原始专业产物` : "原始专业产物" });
  }
  return result.slice(0, 12);
}

function fallbackBlocks(input: Parameters<typeof planWorkbuddyPresentation>[0]): WorkbuddyPresentationBlock[] {
  const blocks: WorkbuddyPresentationBlock[] = [{ type: "markdown", content: input.response }];
  if (input.artifact) blocks.push({ type: "artifact", artifactId: input.artifact.id, title: input.artifact.title, artifactType: input.artifact.artifactType, resultUrl: input.artifact.resultUrl, description: "完整保留的专业应用产物" });
  const sources = (input.sources ?? []).flatMap(source => source.title && source.url ? [{ title: source.title, url: source.url, publishedAt: source.publishedDate }] : []);
  if (sources.length) blocks.push({ type: "sources", title: "参考来源", items: sources });
  return blocks;
}
