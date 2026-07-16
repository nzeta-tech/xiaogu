import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <header className="legalHeader"><Link href="/login">返回登录</Link><h1>隐私政策</h1><p>更新日期：2026年7月16日</p></header>
      <section><h2>我们处理的信息</h2><p>为提供账号、创作、计费和支持服务，我们会处理注册信息、创作输入、生成结果、用量、订单和反馈记录。</p></section>
      <section><h2>敏感信息</h2><p>保单、客户资料和候选人简历可能包含敏感个人信息。请仅上传完成任务所必需的内容，并在上传前删除身份证号、银行卡号、详细住址和无关健康信息。不得在未获授权时上传他人资料。</p></section>
      <section><h2>使用目的</h2><p>信息仅用于身份验证、生成用户请求的内容、保存作品、计算积分、处理订单、排查故障和响应反馈，不用于出售个人信息。</p></section>
      <section><h2>服务提供方</h2><p>完成生成、支付和计量时，必要数据可能被发送给已配置的大模型、图片模型、Stripe 和 OpenMeter 服务。我们按完成服务所需的最小范围传输。</p></section>
      <section><h2>保存与删除</h2><p>账号和作品在服务期间保存。用户可通过反馈支持申请导出、更正或删除账号及相关数据；法律或财务记录要求保留的订单信息除外。</p></section>
      <section><h2>安全</h2><p>我们使用加密传输、HttpOnly 会话、访问控制和审计记录保护数据。任何网络服务均无法承诺绝对安全，请勿提交与任务无关的秘密信息。</p></section>
      <footer className="legalFooter"><Link href="/terms">用户协议</Link><Link href="/help">使用帮助</Link></footer>
    </main>
  );
}
