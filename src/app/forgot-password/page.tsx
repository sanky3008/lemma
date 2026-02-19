"use client";

import * as React from "react";
import { useSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "request" | "verify" | "reset";

export default function ForgotPasswordPage() {
    const { isLoaded, signIn, setActive } = useSignIn();

    const [step, setStep] = React.useState<Step>("request");
    const [email, setEmail] = React.useState("");
    const [code, setCode] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [error, setError] = React.useState("");
    const [loading, setLoading] = React.useState(false);

    // Step 1: Send reset code to email
    async function handleRequest(e: React.FormEvent) {
        e.preventDefault();
        if (!isLoaded) return;

        setLoading(true);
        setError("");

        try {
            await signIn.create({
                strategy: "reset_password_email_code",
                identifier: email,
            });
            setStep("verify");
        } catch (err: unknown) {
            const clerkError = err as { errors?: { message: string }[] };
            setError(
                clerkError.errors?.[0]?.message ?? "Something went wrong. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    // Step 2: Verify the code and set new password
    async function handleReset(e: React.FormEvent) {
        e.preventDefault();
        if (!isLoaded) return;

        setLoading(true);
        setError("");

        try {
            const result = await signIn.attemptFirstFactor({
                strategy: "reset_password_email_code",
                code,
                password: newPassword,
            });

            if (result.status === "complete") {
                await setActive({ session: result.createdSessionId });
                // Redirect is handled by router; use window.location for simplicity
                // to avoid importing router in a page that doesn't already have it
                window.location.href = "/";
            } else if (result.status === "needs_second_factor") {
                // Edge case: 2FA required after password reset on a new client
                setError("Please sign in normally — a verification code was sent to your email.");
            } else {
                setError("Password reset incomplete. Please try again.");
            }
        } catch (err: unknown) {
            const clerkError = err as { errors?: { message: string }[] };
            setError(
                clerkError.errors?.[0]?.message ?? "Invalid code or password. Please try again."
            );
        } finally {
            setLoading(false);
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

    // ── Step 2: Code + new password ──────────────────────────────────────────
    if (step === "verify") {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
                {BrandHeader}

                <div className="w-full max-w-sm">
                    <div className="mb-6 text-center">
                        <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            We sent a reset code to{" "}
                            <span className="font-medium text-foreground">{email}</span>.
                            Enter it below along with your new password.
                        </p>
                    </div>

                    <form onSubmit={handleReset} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="code">Reset code</Label>
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

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="newPassword">New password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                placeholder="••••••••"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                            <p className="text-xs text-muted-foreground">At least 8 characters</p>
                        </div>

                        {error && (
                            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </p>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading || code.length < 6 || newPassword.length < 8}
                        >
                            {loading ? "Resetting…" : "Reset password"}
                        </Button>
                    </form>

                    <div className="mt-6 flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { setStep("request"); setError(""); setCode(""); }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            ← Try a different email
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Step 1: Enter email ──────────────────────────────────────────────────
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            {BrandHeader}

            <div className="w-full max-w-sm">
                <div className="mb-6 text-center">
                    <h1 className="text-xl font-semibold text-foreground">Forgot password?</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Enter your email and we&apos;ll send you a reset code.
                    </p>
                </div>

                <form onSubmit={handleRequest} className="flex flex-col gap-4">
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
                            autoFocus
                        />
                    </div>

                    {error && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading || !isLoaded}>
                        {loading ? "Sending…" : "Send reset code"}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Remember it?{" "}
                    <Link
                        href="/sign-in"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
