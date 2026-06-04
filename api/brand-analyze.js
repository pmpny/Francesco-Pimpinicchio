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

    if (GEMINI_KEY && photos?.length > 0) {
        try {
            const report = await callGemini(GEMINI_KEY, prompt, photos);
            return res.status(200).json({ report, model: 'gemini' });
        } catch(e) {
            console.log('Gemini failed, falling back to Claude:', e.message);
        }
    }

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

${siteContent ? `VERIFIED BRAND FACTS — SOURCED FROM OFFICIAL WEBSITE:
The following information is confirmed fact. Do not contradict or override it with visual guesses.
Use images only to assess: silhouette quality, hardware execution, design consistency, and visual impact.
Do NOT guess materials from visual appearance — trust the website data below.
---
${siteContent.substring(0, 4000)}
---
END VERIFIED FACTS` : ''}

${context ? `ADDITIONAL CONTEXT (CONFIRMED FACT):\n${context}` : ''}

Your analysis must cover these sections — use ALL CAPS for each heading:

BRAND READ
2-3 sentences: what this brand is, what is working, what is not.

DESIGN SIGNATURE
What makes the product visually distinctive. Be specific — hardware, shape language, color codes. What makes it recognizable from across a room?

MARKET POSITION
Where this sits vs competitors. Name specific competitors. Correct price positioning based on verified prices above. Who is the actual customer.

COLOR INTELLIGENCE
Current palette assessment. What is working, what is missing for SS27/FW27 commercial viability.

COLLECTION GAPS
What silhouettes, categories, or price points are missing that the market demands right now.

FLAGS
What to avoid — saturating trends, positioning mistakes, messaging issues. Be direct.

OPPORTUNITIES
3 concrete commercial opportunities specific to this brand.

ACTION PLAN
4 prioritized steps with commercial rationale.

VERDICT
One honest paragraph: realistic commercial outcome if this designer executes well.`;
}

async function callGemini(apiKey, prompt, photos) {
    const parts = [{ text: prompt }];

    if (photos?.length > 0) {
        parts.push({ text: `Now analyze these ${photos.length} product photos. Use them to assess silhouette quality, hardware execution, color accuracy, design consistency, and visual impact ONLY. Do not use images to determine material or pricing — those are confirmed in the text above.` });
        for (const photo of photos.slice(0, 8)) {
            parts.push({ inlineData: { mimeType: photo.mime || 'image/jpeg', data: photo.b64 } });
        }
    }

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
            { type: 'text', text: prompt + '\n\nUse images to assess silhouette, hardware, and design consistency only. Trust the verified facts in the prompt for material and pricing.' }
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
