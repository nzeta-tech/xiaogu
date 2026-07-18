import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function LegalDocument({ slug }: { slug: string }) {
  const settings = await tryGetSystemSettings();
  const document = settings.legal.documents.find((item) => item.slug === slug);

  return (
    <main className="legalPage">
      <header className="legalHeader">
        <Link href="/login">返回登录</Link>
        <h1>{document?.title ?? (slug === "terms" ? "用户协议" : "隐私政策")}</h1>
        <p>版本：{settings.legal.termsVersion} · 更新日期：{settings.legal.termsUpdatedAt}</p>
      </header>
      <article className="legalDocumentContent"><ReactMarkdown>{document?.content ?? ""}</ReactMarkdown></article>
      <footer className="legalFooter">{settings.legal.documents.filter((item) => item.slug !== slug).map((item) => <Link href={item.slug === "terms" || item.slug === "privacy" ? `/${item.slug}` : `/legal/${item.slug}`} key={item.slug}>{item.title}</Link>)}<Link href="/help">使用帮助</Link></footer>
    </main>
  );
}
