import assert from "node:assert/strict";
import test from "node:test";
import { buildDomainPrompt, inferDomainContext, inferDomainScores } from "./context.ts";

test("pure finance requests stay in finance and reject insurance migration", () => {
  const context = inferDomainContext("只讲财经：美联储降息如何影响美股、债券和黄金，不要关联保险", "user");
  assert.equal(context.primaryDomain, "finance");
  assert.equal(context.allowInsuranceMigration, false);
  assert.match(buildDomainPrompt(context), /不允许主动迁移到保险/);
});

test("insurance requests keep the insurance professional boundary", () => {
  const context = inferDomainContext("分析这份医疗险保单的等待期、免责和续保条件", "user");
  assert.equal(context.primaryDomain, "insurance");
  assert.equal(context.allowInsuranceMigration, true);
  assert.match(buildDomainPrompt(context), /核保、理赔或客户服务/);
});

test("wealth and insurance signals form a hybrid domain", () => {
  const context = inferDomainContext("家庭养老现金流与商业保险应该如何安排", "user");
  assert.equal(context.primaryDomain, "hybrid");
  assert.ok(context.secondaryDomains.includes("wealth"));
  assert.ok(context.secondaryDomains.includes("insurance"));
});

test("general tasks remain domain neutral", () => {
  const context = inferDomainContext("帮我写一封感谢团队伙伴的信", "user");
  assert.equal(context.primaryDomain, "general");
  assert.equal(context.allowInsuranceMigration, false);
});

test("domain scores distinguish finance and insurance signals", () => {
  const finance = inferDomainScores("黄金、美元、美联储和债券市场");
  const insurance = inferDomainScores("保单核保理赔与健康告知");
  assert.ok(finance.finance > finance.insurance);
  assert.ok(insurance.insurance > insurance.finance);
});
