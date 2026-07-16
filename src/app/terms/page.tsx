import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legalPage">
      <header className="legalHeader"><Link href="/login">返回登录</Link><h1>用户协议</h1><p>更新日期：2026年7月16日</p></header>
      <section><h2>服务性质</h2><p>小谷提供保险内容创作、结构分析和运营辅助工具。生成内容不构成保险、法律、医疗、投资或理财建议。</p></section>
      <section><h2>用户责任</h2><p>用户应确保输入资料来源合法并已取得必要授权，对最终发布内容的事实准确性、产品条款和合规性负责。禁止生成虚假承诺、误导宣传或侵犯他人权益的内容。</p></section>
      <section><h2>积分与支付</h2><p>积分包为一次性数字服务额度，不自动续费。支付成功后积分到账；对重复扣款、支付失败或服务未交付的情况，可通过反馈支持提交核查和退款申请。</p></section>
      <section><h2>AI 输出</h2><p>AI 结果可能存在遗漏或错误。用户在对外发布或用于客户沟通前应进行人工核验，尤其是保险责任、收益、承保和理赔相关表述。</p></section>
      <section><h2>账号管理</h2><p>用户应保护登录凭证，不得共享账号或绕过额度限制。发现异常使用时，平台可暂时限制账号并通知用户核查。</p></section>
      <section><h2>变更与终止</h2><p>重大服务或协议变更将通过站内公告说明。用户不同意变更时可停止使用，并通过反馈支持申请账号与数据处理。</p></section>
      <footer className="legalFooter"><Link href="/privacy">隐私政策</Link><Link href="/help">使用帮助</Link></footer>
    </main>
  );
}
