import { mutation } from "./_generated/server";


/**
 * Insert or update the user in a Convex table then return the document's ID.
 *
 * The `UserIdentity.tokenIdentifier` string is a stable and unique value we use
 * to look up identities.
 *
 * Keep in mind that `UserIdentity` has a number of optional fields, the
 * presence of which depends on the identity provider chosen. It's up to the
 * application developer to determine which ones are available and to decide
 * which of those need to be persisted. For Clerk the fields are determined
 * by the JWT token's Claims.
 */
export const store = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Called storeUser without authentication present");
        }

        // Check if we've already stored this identity before.
        const user = await ctx.db
            .query("users")
            .withIndex("by_token", (q) =>
                q.eq("tokenIdentifier", identity.tokenIdentifier)
            )
            .unique();

        if (user !== null) {
            // If we've seen this identity before but the name has changed, patch the value.
            if (user.name !== identity.name) {
                await ctx.db.patch(user._id, { name: identity.name });
            }
            return user._id;
        }
        // If it's a new identity, create a new `User` module.
        const userId = await ctx.db.insert("users", {
            name: identity.name,
            tokenIdentifier: identity.tokenIdentifier,
            email: identity.email,
            image: identity.pictureUrl,
        });

        // Seed Default Data
        const folderId = await ctx.db.insert("folders", {
            userId: userId,
            name: "My PRDs",
            createdAt: Date.now(),
        });

        // Global Context Doc
        await ctx.db.insert("documents", {
            userId: userId,
            title: "Context",
            content: [
                {
                    type: "p",
                    children: [
                        {
                            text: "Add your background context here — problem areas, constraints, links, reusable snippets.",
                        },
                    ],
                },
            ],
            isContext: true,
            isArchived: false,
            isPublished: false,
        });

        // Default PRD
        await ctx.db.insert("documents", {
            userId: userId,
            title: "Untitled PRD",
            folderId: folderId,
            content: [
                {
                    type: "p",
                    children: [{ text: "" }],
                },
            ],
            isContext: false,
            isArchived: false,
            isPublished: false,
        });

        return userId;
    },
});
