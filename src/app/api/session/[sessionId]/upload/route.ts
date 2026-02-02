import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    const session = await client.query(api.sessions.getSession, {
        sessionId,
    });

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('image') as File;

        if (!file) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        // Convert file to array buffer
        const blob = await file.arrayBuffer();

        // Get upload URL from Convex
        const uploadUrl = await client.mutation(api.images.generateUploadUrl);

        // Upload the file to Convex storage
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type },
            body: blob,
        });

        const { storageId } = await uploadResponse.json();

        // Store image metadata in database
        await client.mutation(api.images.storeImage, {
            sessionId,
            filename: file.name,
            storageId,
            contentType: file.type,
        });

        const images = await client.query(api.sessions.getSessionImages, {
            sessionId,
        });

        return NextResponse.json({
            success: true,
            sessionId,
            imageCount: images.length,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
