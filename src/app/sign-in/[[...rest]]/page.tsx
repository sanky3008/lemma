"use client";

import * as React from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/auth/google-button";

type Step = "credentials" | "second_factor";

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/");
      } else if (result.status === "needs_second_factor") {
        // Trigger email OTP for the second factor
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setStep("second_factor");
      } else {
        setError("Unexpected sign-in state. Please try again.");
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(
        clerkError.errors?.[0]?.message ?? "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSecondFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/");
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const clerkError = err as { errors?: { message: string }[] };
      setError(
        clerkError.errors?.[0]?.message ?? "Invalid code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (!isLoaded) return;
    try {
      await signIn.prepareSecondFactor({ strategy: "email_code" });
    } catch {
      // silently ignore
    }
  }

  const BrandHeader = (
    <div className="mb-8 flex flex-col items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
        <span className="text-sm font-bold text-primary-foreground">L</span>
      </div>
      <span className="text-sm font-medium text-foreground">Lemma</span>
    </div>
  );

  // ── Step 2: Email OTP second factor ──────────────────────────────────────
  if (step === "second_factor") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        {BrandHeader}

        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We sent a 6-digit verification code to{" "}
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <form onSubmit={handleSecondFactor} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tracking-widest text-center text-base"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
              {loading ? "Verifying…" : "Verify & sign in"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Didn&apos;t receive a code?{" "}
              <button
                type="button"
                onClick={handleResendCode}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Resend
              </button>
            </p>
            <button
              type="button"
              onClick={() => { setStep("credentials"); setError(""); setCode(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Email + password ─────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {BrandHeader}

      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <GoogleButton mode="signIn" />
        </div>

        <div className="relative my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !isLoaded}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
