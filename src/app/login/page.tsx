import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthForm mode="login" nextPath={params.next ?? ""} initialEmail={params.email ?? ""} initialError={params.error ?? ""} />;
}
