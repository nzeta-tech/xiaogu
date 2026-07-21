import { AuthForm } from "@/components/AuthForm";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string; next?: string; email?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="register"
      initialReferralCode={params.ref ?? ""}
      nextPath={params.next ?? ""}
      initialEmail={params.email ?? ""}
      initialError={params.error ?? ""}
    />
  );
}
