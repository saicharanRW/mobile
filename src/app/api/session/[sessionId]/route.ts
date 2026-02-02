import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(
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

    // Get all images for this session
    const images = await client.query(api.sessions.getSessionImages, {
        sessionId,
    });

    // Convert images to include URLs and base64 data
    const imagesWithData = await Promise.all(
        images.map(async (img) => {
            const url = await client.query(api.images.getImageUrl, {
                storageId: img.storageId,
            });

            if (!url) {
                return null;
            }

            // Fetch the image and convert to base64
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            return {
                filename: img.filename,
                contentType: img.contentType,
                data: base64,
            };
        })
    );

    const validImages = imagesWithData.filter((img) => img !== null);

    return NextResponse.json({
        sessionId: session.sessionId,
        imageCount: validImages.length,
        images: validImages,
    });
}
