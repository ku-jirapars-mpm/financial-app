import { notFound } from "next/navigation";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../login/auth-form";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (process.env.ALLOW_SIGNUP !== "true") notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>This is a private app. Registration is open only during setup.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AuthForm mode="signup" />
          <Alert>After creating your account, set <code>ALLOW_SIGNUP=false</code> and redeploy.</Alert>
        </CardContent>
      </Card>
    </main>
  );
}
