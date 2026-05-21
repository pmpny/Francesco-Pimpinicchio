export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { brandName, category, url, context, siteContent, photos } = req.body;
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    const prompt = buildPrompt(brandName, category, url, context, siteContent);

    // Try Gemini first (best for visual analysis), fall back to Claude
    if (GEMINI_KEY && photos?.length > 0) {
        try {
            const report = await callGemini(GEMINI_KEY, prompt, photos);
            return res.status(200).json({ report, model: 'gemini' });
        } catch(e) {
            console.log('Gemini failed, falling back to Claude:', e.message);
        }
    }

    // Claude fallback (or primary if no photos)
    if (ANTHROPIC_KEY) {
        try {
            const report = await callClaude(ANTHROPIC_KEY, prompt, photos);
            return res.status(200).json({ report, model: 'claude' });
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    }

    return res.status(500).json({ error: 'No AI API keys configured.' });
}

function buildPrompt(brandName, category, url, context, siteContent) {
    return `You are PMPNY Intelligence — a Digital Creative Director and Strategic Merchandiser with senior experience at Italian luxury manufacturers and global fashion houses.

Analyze this brand completely and honestly. Do not flatter. Give a direct, commercially truthful assessment.

BRAND: ${brandName || 'Unknown'}
CATEGORY: ${category || 'Fashion Accessories'}
${url ? `WEBSITE: ${url}` : ''}
${context ? `ADDITIONAL CONTEXT:\n${context}` : ''}
${siteContent ? `\nWEBSITE CONTENT:\n${siteContent.substring(0, 3000)}` : ''}

Your analysis must cover these sections — use ALL CAPS for each heading:

BRAND READ
2-3 sentences: what this brand is, what's working, what's not.

DESIGN SIGNATURE
What makes the product visually distinctive. Be specific — materials, hardware, shape language, color codes. What would make this recognizable from across a room?

MARKET POSITION
Where this sits vs competitors. Name specific competitors. Price positioning. Who is the actual customer.

COLOR INTELLIGENCE
Current palette assessment. What's working, what's missing for SS27/FW27 commercial viability.

COLLECTION GAPS
What silhouettes, categories, or price points are missing that the market demands right now.

FLAGS
What to avoid — saturating trends, positioning mistakes, messaging issues. Be direct.

OPPORTUNITIES
3 concrete commercial opportunities specific to this brand. Not generic — specific.

ACTION PLAN
4 prioritized steps. What to do first, second, third, fourth. Each with commercial rationale.

VERDICT
One honest paragraph: realistic commercial outcome if this designer executes well. Be truthful about limitations and potential.`;
}

async function callGemini(apiKey, prompt, photos) {
    const parts = [{ text: prompt }];
    
    if (photos?.length > 0) {
        parts.push({ text: `\nAnalyze these ${photos.length} product images carefully. Note actual materials, hardware, silhouettes, colors, construction. Do not invent details you cannot see.` });
        for (const photo of photos.slice(0, 8)) {
            parts.push({ inlineData: { mimeType: photo.mime || 'image/jpeg', data: photo.b64 } });
        }
    }

    // Try models in order of preference
    const models = ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    
    for (const model of models) {
        try {
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
                })
            });
            const data = await geminiRes.json();
            if (data.error) throw new Error(data.error.message);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
        } catch(e) {
            console.log(`${model} failed:`, e.message);
            if (model === models[models.length - 1]) throw e;
        }
    }
    throw new Error('All Gemini models failed');
}

async function callClaude(apiKey, prompt, photos) {
    let content;
    
    if (photos?.length > 0) {
        content = [
            ...photos.slice(0, 5).map(p => ({ type: 'image', source: { type: 'base64', media_type: p.mime || 'image/jpeg', data: p.b64 } })),
            { type: 'text', text: prompt + '\n\nAnalyze the uploaded product images carefully. Note actual materials, hardware, silhouettes, colors, construction quality.' }
        ];
    } else {
        content = prompt;
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 4096,
            messages: [{ role: 'user', content }]
        })
    });

    const data = await claudeRes.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content?.[0]?.text;
    if (!text) throw new Error('No response from Claude');
    return text;
}
