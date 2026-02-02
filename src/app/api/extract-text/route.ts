import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
    console.log('Extract-text API called');
    try {
        const formData = await request.formData();
        const file = formData.get('image') as File;

        if (!file) {
            console.error('No image provided in request');
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);

        // Convert file to base64
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Image = buffer.toString('base64');

        // Initialize Gemini model
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Create prompt for text extraction
        const prompt = `Extract ALL visible text from this image. 
        Focus on:
        - Product names
        - Expiry dates (MFG, EXP, Best Before, Use By)
        - Batch numbers
        - Any other readable text
        
        Return the extracted text in a clear, organized format. If no text is found, return "No text detected".`;

        // Generate content with image
        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: file.type,
                    data: base64Image,
                },
            },
        ]);

        const response = await result.response;
        const extractedText = response.text();

        console.log('Text extraction successful. Length:', extractedText.length);

        return NextResponse.json({
            success: true,
            extractedText: extractedText.trim(),
        });
    } catch (error) {
        console.error('Text extraction error:', error);
        return NextResponse.json(
            { error: 'Failed to extract text', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
