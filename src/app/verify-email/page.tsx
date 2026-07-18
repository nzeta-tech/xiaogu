import { VerifyEmailPageClient } from "@/components/AuthActionPageClient";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const params = await searchParams; return <VerifyEmailPageClient token={params.token ?? ""} />; }
