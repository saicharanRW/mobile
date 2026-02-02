import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Generate upload URL for file upload
export const generateUploadUrl = mutation(async (ctx) => {
    return await ctx.storage.generateUploadUrl();
});


// Store image metadata after upload
export const storeImage = mutation({
    args: {
        sessionId: v.string(),
        filename: v.string(),
        storageId: v.id("_storage"),
        contentType: v.string(),
    },
    handler: async (ctx, args) => {
        const imageId = await ctx.db.insert("images", {
            sessionId: args.sessionId,
            filename: args.filename,
            storageId: args.storageId,
            contentType: args.contentType,
            createdAt: Date.now(),
        });
        return imageId;
    },
});

// Get image URL
export const getImageUrl = query({
    args: {
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        const url = await ctx.storage.getUrl(args.storageId);
        return url;
    },
});

// Get image file
export const getImage = query({
    args: {
        storageId: v.id("_storage"),
    },
    handler: async (ctx, args) => {
        return await ctx.storage.getUrl(args.storageId);
    },
});
