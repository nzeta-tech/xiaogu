import { AcceptTermsPageClient } from "@/components/AuthActionPageClient";
export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <AcceptTermsPageClient nextPath={params.next ?? ""} />;
}
