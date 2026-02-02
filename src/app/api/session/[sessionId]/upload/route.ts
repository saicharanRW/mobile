import { NextRequest, NextResponse } from 'next/server';
import { sessions } from '../../sessions';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;

    const session = sessions.get(sessionId);

    if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('image') as File;

        if (!file) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Store image in session
        session.images.push({
            filename: file.name,
            data: buffer,
            contentType: file.type,
        });

        return NextResponse.json({
            success: true,
            sessionId,
            imageCount: session.images.length,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
