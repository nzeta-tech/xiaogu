export const adminMenuItems = [
  { id: "overview", label: "仪表盘", hint: "核心指标" },
  { id: "users", label: "用户管理", hint: "账号与积分" },
  { id: "content", label: "内容运营", hint: "作品与应用" },
  { id: "commerce", label: "商业化", hint: "订单与套餐" },
  { id: "growth", label: "增长活动", hint: "公告与优惠" },
  { id: "support", label: "反馈审计", hint: "工单与日志" },
  { id: "outbox", label: "发件箱", hint: "系统邮件通知" },
  { id: "settings", label: "系统设置", hint: "站点配置" },
] as const;

export type AdminSectionId = (typeof adminMenuItems)[number]["id"];

export function getAdminSection(hash: string): AdminSectionId {
  const section = hash.replace(/^#/, "");
  return adminMenuItems.some((item) => item.id === section) ? section as AdminSectionId : "overview";
}
