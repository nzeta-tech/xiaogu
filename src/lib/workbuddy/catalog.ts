export const workbuddyExperts = [
  { key: "orchestrator", name: "总控助理", icon: "✦", description: "理解目标、拆解任务、组织交付" },
  { key: "customer", name: "客户经营顾问", icon: "客", description: "客户分层、跟进与服务规划" },
  { key: "strategy", name: "内容策划师", icon: "策", description: "调研选题、栏目与内容日历" },
  { key: "writer", name: "文案创作师", icon: "写", description: "多平台内容与沟通材料" },
  { key: "product", name: "专业研究员", icon: "研", description: "财经、财富与保险资料研究" },
  { key: "compliance", name: "事实审校员", icon: "审", description: "来源、时效与专业边界复核" },
  { key: "visual", name: "视觉制作师", icon: "视", description: "图片、PPT与视频交付" },
  { key: "team", name: "团队教练", icon: "队", description: "培训、招募与经营复盘" },
] as const;

export type WorkbuddyScenario = "content" | "video" | "customer" | "product" | "team" | "research" | "general";

export const workbuddyTemplates: Array<{ scenario: WorkbuddyScenario; title: string; description: string; prompt: string; accent: string }> = [
  { scenario: "video", title: "视频创作", description: "锁定口播原文，规划数字人分镜并进入视频制作", prompt: "把我提供的定稿口播文案制作成数字人视频。口播原文逐字不变，只设计语义分段、画面节奏、字幕重点和辅助画面；需要选择数字人或声音时引导我进入数字人视频应用继续。", accent: "teal" },
  { scenario: "content", title: "内容获客", description: "选题、内容日历、多平台成稿与合规复核", prompt: "结合我的数字分身和目标客户，制定未来一周内容获客计划，给出选题日历，并产出口播、小红书、公众号和朋友圈内容，最后完成事实与合规复核。", accent: "teal" },
  { scenario: "customer", title: "客户跟进", description: "从会谈信息形成纪要、需求、异议和下一步", prompt: "根据我提供的客户会谈内容，整理客户需求和顾虑，区分已确认事实与待核验信息，生成会谈纪要、跟进消息和下一次行动计划；验收后再保存脱敏客户摘要。", accent: "blue" },
  { scenario: "product", title: "资料分析", description: "分析保单或产品资料并生成双版本讲解", prompt: "根据我提供的保单或产品资料，逐份提取责任、限制、等待期、免责和待核验信息，形成对比表、内部分析版与客户易懂版。", accent: "amber" },
  { scenario: "team", title: "经营复盘", description: "区分数据、判断与假设并形成行动计划", prompt: "根据我提供的经营数据和现状完成本周期复盘，区分事实、判断和假设，生成关键问题、行动负责人、截止时间、验收标准和下一周期计划。", accent: "violet" },
  { scenario: "research", title: "深度研究", description: "联网检索并形成带来源的结构化报告", prompt: "围绕我提供的财经、财富、保险或其他专业主题完成深度研究，保持原题领域，区分事实、判断和待核验内容，形成带来源的摘要、关键发现、影响分析和可执行建议。", accent: "rose" },
];

export type PlanStep = { title: string; description: string; expertKey: string; skillKey: string };

const sharedFinish: PlanStep[] = [
  { title: "事实与专业边界复核", description: "检查来源、时效和产品表述；保险任务额外检查承保、收益和理赔承诺。", expertKey: "compliance", skillKey: "compliance_review" },
  { title: "整理可验收交付包", description: "汇总成果、待确认事项和下一步行动。", expertKey: "orchestrator", skillKey: "assemble_delivery" },
];

export function buildWorkbuddyPlan(scenario: WorkbuddyScenario): PlanStep[] {
  const plans: Record<WorkbuddyScenario, PlanStep[]> = {
    video: [
      { title: "锁定口播原文", description: "确认定稿文案边界，不改写、不扩写、不重排口播。", expertKey: "orchestrator", skillKey: "lock_video_copy" },
      { title: "设计视频分镜", description: "按原文语义切段，规划数字人、字幕重点、辅助画面和节奏。", expertKey: "visual", skillKey: "plan_video_scenes" },
      { title: "进入视频制作", description: "整理选择数字人、声音和画幅所需信息，并进入数字人视频应用。", expertKey: "visual", skillKey: "prepare_digital_human_video" },
      ...sharedFinish,
    ],
    content: [
      { title: "读取业务上下文", description: "结合数字分身、目标客户与本次要求确定边界。", expertKey: "orchestrator", skillKey: "read_context" },
      { title: "调研并筛选选题", description: "提炼值得表达的机会、受众问题和内容角度。", expertKey: "strategy", skillKey: "research_topics" },
      { title: "制定内容日历", description: "安排渠道、目标、主题与发布节奏。", expertKey: "strategy", skillKey: "create_content_calendar" },
      { title: "生成多平台内容", description: "形成口播、小红书、公众号和朋友圈可编辑初稿。", expertKey: "writer", skillKey: "write_content_matrix" },
      ...sharedFinish,
    ],
    customer: [
      { title: "提取客户事实", description: "区分已确认信息、主观判断和待核验事项。", expertKey: "customer", skillKey: "extract_customer_facts" },
      { title: "分析需求与异议", description: "梳理家庭目标、真实顾虑和沟通边界。", expertKey: "customer", skillKey: "analyze_customer_needs" },
      { title: "制定跟进计划", description: "生成会谈纪要、沟通建议和下一次行动。", expertKey: "writer", skillKey: "create_followup_plan" },
      ...sharedFinish,
    ],
    product: [
      { title: "解析资料与版本", description: "提取资料中的产品事实并标记版本和有效日期。", expertKey: "product", skillKey: "extract_policy_document" },
      { title: "整理责任与限制", description: "结构化责任、免责、等待期与待核验信息。", expertKey: "product", skillKey: "compare_policy_facts" },
      { title: "制作双版本讲解", description: "分别生成内部研究版与客户易懂版。", expertKey: "writer", skillKey: "create_product_brief" },
      ...sharedFinish,
    ],
    team: [
      { title: "提取经营信号", description: "识别数据、现象和团队反馈中的关键问题。", expertKey: "team", skillKey: "analyze_team_signals" },
      { title: "形成复盘判断", description: "梳理原因、优先级和可验证的改进假设。", expertKey: "team", skillKey: "create_team_review" },
      { title: "设计训练行动", description: "生成周报、培训重点、负责人和验收标准。", expertKey: "team", skillKey: "create_team_plan" },
      ...sharedFinish,
    ],
    research: [
      { title: "界定研究问题", description: "明确范围、时间、对象和验收标准。", expertKey: "orchestrator", skillKey: "scope_research" },
      { title: "整理资料与证据", description: "区分可靠事实、行业观点和不确定信息。", expertKey: "product", skillKey: "research_evidence" },
      { title: "形成洞察与建议", description: "保持原题领域分析影响，并按用户用途给出行动建议。", expertKey: "strategy", skillKey: "write_research_report" },
      ...sharedFinish,
    ],
    general: [
      { title: "理解目标与边界", description: "识别任务对象、交付形式、约束和风险。", expertKey: "orchestrator", skillKey: "scope_task" },
      { title: "组织专业分析", description: "调用适合当前领域的专家形成核心判断。", expertKey: "strategy", skillKey: "professional_analysis" },
      { title: "生成工作成果", description: "把分析转化为可直接编辑和采用的交付物。", expertKey: "writer", skillKey: "create_deliverable" },
      ...sharedFinish,
    ],
  };
  return plans[scenario];
}
