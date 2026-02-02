import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a new session
export const createSession = mutation({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const sessionId = await ctx.db.insert("sessions", {
            sessionId: args.sessionId,
            createdAt: Date.now(),
        });
        return sessionId;
    },
});

// Get session by sessionId
export const getSession = query({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
            .first();
        return session;
    },
});

// Get all images for a session
export const getSessionImages = query({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const images = await ctx.db
            .query("images")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
            .collect();
        return images;
    },
});

// Clean up old sessions (older than 1 hour)
export const cleanupOldSessions = mutation({
    args: {},
    handler: async (ctx) => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const oldSessions = await ctx.db
            .query("sessions")
            .filter((q) => q.lt(q.field("createdAt"), oneHourAgo))
            .collect();

        // Delete old sessions and their images
        for (const session of oldSessions) {
            // Delete associated images
            const images = await ctx.db
                .query("images")
                .withIndex("by_sessionId", (q) => q.eq("sessionId", session.sessionId))
                .collect();

            for (const image of images) {
                await ctx.storage.delete(image.storageId);
                await ctx.db.delete(image._id);
            }

            // Delete session
            await ctx.db.delete(session._id);
        }

        return { deletedCount: oldSessions.length };
    },
});
