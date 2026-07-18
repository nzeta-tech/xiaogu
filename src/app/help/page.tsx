import Link from "next/link";

export default function HelpPage() {
  return (
    <main className="legalPage">
      <header className="legalHeader">
        <Link href="/workspace">返回创作广场</Link>
        <h1>使用帮助</h1>
        <p>创作、积分和账号操作的常见说明。</p>
      </header>
      <section>
        <h2>开始创作</h2>
        <p>在创作广场选择应用，填写必填信息后提交。不同应用按页面标注的积分扣费；失败任务不记录成功用量。</p>
        <p>需要个性化思维的应用会先引导完成思维问卷，完成后再开放提交。</p>
      </section>
      <section>
        <h2>文件与敏感信息</h2>
        <p>文本文件支持 TXT、Markdown、PDF 和 DOCX，单个文件不超过 10MB。上传保单、简历前请遮盖身份证号、银行卡号、住址等非必要信息。</p>
      </section>
      <section>
        <h2>积分与订单</h2>
        <p>积分包属于一次性购买，不是自动续费会员。支付完成后由支付平台通知系统入账，可在充值中心查看订单和用量。</p>
      </section>
      <section>
        <h2>内容责任</h2>
        <p>AI 结果仅作为创作和结构分析辅助。系统提供的是基础敏感词预检，不等同于机构正式合规审核。保险内容发布前请核对事实、条款、收益表述和所属机构的合规要求。</p>
      </section>
      <footer className="legalFooter"><Link href="/privacy">隐私政策</Link><Link href="/terms">用户协议</Link></footer>
    </main>
  );
}
