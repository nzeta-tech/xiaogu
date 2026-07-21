import Link from "next/link";
import { tryGetSystemSettings } from "@/lib/db/repositories";

function contactHref(contact: string) {
  return contact.includes("@") ? `mailto:${contact}` : contact;
}

export default async function HelpPage() {
  const settings = await tryGetSystemSettings();
  const supportContact = settings.site.supportContact || "support@nzeta.ai";

  return (
    <main className="legalPage">
      <header className="legalHeader">
        <Link href="/create">返回创作广场</Link>
        <h1>使用帮助</h1>
        <p>从账号登录、内容创作到积分支付，把最常见的问题一次讲清楚。</p>
      </header>

      <section>
        <h2>先从哪里开始</h2>
        <p>登录后，先在创作广场选择一个适合当前业务场景的应用，再按页面提示补充信息并提交。不同应用会显示所需积分，只有成功完成的任务才会计入已使用额度。</p>
        <p>如果某些应用需要更贴近你个人表达风格的内容，小谷会先引导你完成思维问卷。问卷完成后，系统会更稳定地沿用你的定位、语气和专业角度。</p>
      </section>

      <section>
        <h2>账号与登录</h2>
        <p>建议使用本人长期可接收通知的邮箱注册，并为账号设置至少 8 位的独立密码。管理员或运营人员不要共用同一个账号，以免影响审计记录和权限管理。</p>
        <p>如果你无法登录，先确认邮箱和密码是否输入正确；若后续开启邮件找回功能，可通过找回密码自助重置。当前如遇到登录异常、账号状态异常或需要人工协助，可直接联系支持团队。</p>
        <p>
          支持联系方式：
          {" "}
          <a href={contactHref(supportContact)}>{supportContact}</a>
        </p>
      </section>

      <section>
        <h2>上传资料与隐私保护</h2>
        <p>文本资料支持 TXT、Markdown、PDF 和 DOCX，单个文件不超过 10MB。上传保单、客户资料、候选人简历或培训材料前，请优先删除与任务无关的敏感信息。</p>
        <p>尤其建议去除身份证号、银行卡号、详细住址、完整病史、未授权客户隐私和其他不应进入创作流程的信息。只保留完成任务所必需的事实与背景，会让生成质量和数据安全都更稳。</p>
      </section>

      <section>
        <h2>积分、订单与支付</h2>
        <p>小谷当前以积分方式提供创作能力。积分包属于一次性购买额度，不是自动续费会员。支付成功后，系统会在收到支付确认后自动入账，你可以在账单页查看订单状态和使用记录。</p>
        <p>如果遇到重复支付、支付成功但额度未到账、订单长时间停留在处理中，建议先保留支付截图和订单时间，再联系支持团队，我们会更快帮你核对。</p>
      </section>

      <section>
        <h2>内容生成与合规提醒</h2>
        <p>AI 结果适合用于提炼结构、改写表达、形成初稿和提高内容生产效率，但它不替代正式的保险合规审核，也不构成保险、法律、医疗、投资或理财建议。</p>
        <p>在对外发布前，请务必再次核对产品责任、收益表述、承保规则、理赔条件、活动承诺和所属机构的最新合规要求。特别是涉及具体数字、案例结论和销售话术时，建议人工复核后再发布。</p>
      </section>

      <section>
        <h2>什么时候联系支持</h2>
        <p>如果你遇到以下情况，建议直接联系我们：账号无法登录、支付异常、积分扣减有疑问、页面报错、生成结果明显异常、素材上传失败，或你希望我们协助排查某条具体创作记录。</p>
        <p>为了更快定位问题，联系时可以一并提供注册邮箱、出问题的大致时间、涉及页面，以及必要的截图或报错提示。这样通常能显著缩短排查时间。</p>
      </section>

      <footer className="legalFooter">
        <Link href="/privacy">隐私政策</Link>
        <Link href="/terms">用户协议</Link>
      </footer>
    </main>
  );
}
