import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/LegalDocument";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export const dynamic = "force-dynamic";

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const settings = await tryGetSystemSettings();
  if (!settings.legal.documents.some((document) => document.slug === slug)) notFound();
  return <LegalDocument slug={slug} />;
}
