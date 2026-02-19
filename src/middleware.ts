import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/forgot-password(.*)',
    '/sso-callback(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
        // Wrap auth.protect() in a timeout to prevent hanging if Clerk's
        // auth servers are slow or unreachable from certain networks/regions.
        const authTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Clerk auth timeout")), 5000)
        );

        try {
            await Promise.race([auth.protect(), authTimeout]);
        } catch (err) {
            // If it's a redirect (Clerk redirecting to sign-in), let it through.
            // If it's our timeout, redirect to sign-in gracefully.
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage === "Clerk auth timeout") {
                const signInUrl = new URL("/sign-in", request.url);
                return NextResponse.redirect(signInUrl);
            }
            // Re-throw any other errors (e.g., Clerk's own auth redirect).
            throw err;
        }
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};
