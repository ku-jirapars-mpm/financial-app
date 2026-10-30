import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const signupOpen = process.env.ALLOW_SIGNUP === "true";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">MyFinance</CardTitle>
          <CardDescription>Sign in to your private finance records.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm mode="login" />
          {signupOpen && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              First time? <Link className="text-primary underline" href="/signup">Create your account</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
