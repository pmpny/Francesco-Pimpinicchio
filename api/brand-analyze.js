export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { brandName, category, url, context, siteContent, photos } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

    try {
        // Build the message parts for Gemini
        const parts = [];

        // Text prompt
        const systemPrompt = `You are PMPNY Intelligence — a Digital Creative Director and Strategic Merchandiser with senior experience at Italian luxury manufacturers and global fashion houses.

Analyze this brand completely and honestly. Do not flatter. Give a direct, commercially truthful assessment.

BRAND: ${brandName || 'Unknown'}
CATEGORY: ${category || 'Fashion Accessories'}
${url ? `WEBSITE: ${url}` : ''}
${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

${siteContent ? `WEBSITE CONTENT EXTRACTED:
${siteContent.substring(0, 4000)}` : ''}

Your analysis must cover:

BRAND READ
2-3 sentences: honest assessment of what this brand is, what's strong, what's missing.

DESIGN SIGNATURE
What makes the product visually distinctive. Be specific — materials, hardware, shape language, color codes. What would make this recognizable from across a room?

MARKET POSITION
Where this brand sits vs competitors. Name specific competitors. Price positioning. Who is the customer.

COLOR INTELLIGENCE
Current color palette assessment. What's working, what's missing for SS27/FW27 commercial viability.

COLLECTION GAPS
What silhouettes, categories, or price points are missing that the market demands right now.

FLAGS
What to avoid — saturating trends, positioning mistakes, messaging inconsistencies. Be direct.

OPPORTUNITIES
3 concrete commercial opportunities specific to this brand. Not generic advice — specific to what you see.

ACTION PLAN
4 prioritized steps. What to do first, second, third, fourth. Each with commercial rationale.

VERDICT
One honest paragraph: if this designer executes well, what is the realistic commercial outcome? Be truthful about limitations and potential.`;

        parts.push({ text: systemPrompt });

        // Add photos if provided
        if (photos && photos.length > 0) {
            parts.push({ text: `\n\nI'm also providing ${photos.length} product/brand images for visual analysis:` });
            for (const photo of photos.slice(0, 8)) {
                parts.push({
                    inlineData: {
                        mimeType: photo.mime || 'image/jpeg',
                        data: photo.b64
                    }
                });
            }
            parts.push({ text: 'Please analyze these images carefully — note the actual materials, hardware, silhouettes, color palette, design details, and construction quality you can see. Do not guess or invent details you cannot see.' });
        }

        // Call Gemini 3.1 Pro Preview
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4096,
                    topP: 0.95
                }
            })
        });

        const geminiData = await geminiRes.json();

        if (geminiData.error) {
            throw new Error(geminiData.error.message || 'Gemini API error');
        }

        const report = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis failed.';

        return res.status(200).json({ report, model: 'gemini-3.1-pro-preview' });

    } catch(error) {
        console.error('Brand analyze error:', error);
        return res.status(500).json({ error: error.message });
    }
}
