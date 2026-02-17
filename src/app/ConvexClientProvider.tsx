"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { type ReactNode } from "react";

// Use NEXT_PUBLIC_CONVEX_URL from .env.local
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Fail gracefully during build if env var is missing, but warn in dev
const convex = new ConvexReactClient(convexUrl || "https://placeholder-url.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
    // Don't render Convex provider if no URL (prevents crash during initial setup)
    if (!convexUrl) {
        console.warn("NEXT_PUBLIC_CONVEX_URL is not set. Convex will not work.");
        return <>{children}</>;
    }

    return (
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {children}
        </ConvexProviderWithClerk>
    );
}
