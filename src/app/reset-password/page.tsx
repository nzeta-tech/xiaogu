import { ResetPasswordPageClient } from "@/components/AuthActionPageClient";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const params = await searchParams; return <ResetPasswordPageClient token={params.token ?? ""} />; }
