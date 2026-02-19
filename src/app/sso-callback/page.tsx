"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

// This page handles the OAuth redirect callback from Clerk (e.g. Google OAuth).
// Clerk will automatically complete the sign-in/sign-up flow and redirect
// to the `redirectUrlComplete` specified in authenticateWithRedirect().
export default function SSOCallbackPage() {
    return <AuthenticateWithRedirectCallback />;
}
