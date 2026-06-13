export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        const { secret } = req.body || {};
        if (secret !== process.env.ADMIN_SECRET && secret !== 'PMPny92-') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!ANTHROPIC_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Missing environment variables' });
    }

    try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const currentSeason = (month >= 2 && month <= 7) ? `SS${String(year).slice(2)}` : `FW${String(year).slice(2)}`;
        const upcomingSeason = (month >= 2 && month <= 7) ? `FW${String(year).slice(2)}` : `SS${String(year + 1).slice(2)}`;
        const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const prompt = `You are PMPNY Intelligence — a senior fashion trend analyst with access to runway data, resale market signals, and retail performance metrics.

Generate a comprehensive monthly trend brief for ${monthName}. Current season: ${currentSeason}. Upcoming: ${upcomingSeason}.

Return ONLY a valid JSON object with this exact structure, no markdown:

{
  "title": "Evocative brief title, max 6 words",
  "season": "${currentSeason}",
  "week_label": "Monthly Brief · ${monthName}",
  "note": "2-3 sentences on what is happening in fashion RIGHT NOW. Be specific — mention real brands, shows, or market movements.",
  "colors": [
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"}
  ],
  "signals": [
    {"name": "Signal", "pct": 84, "direction": "rising", "category": "silhouette", "note": "One line why"},
    {"name": "Signal", "pct": 71, "direction": "rising", "category": "material", "note": "One line why"},
    {"name": "Signal", "pct": 58, "direction": "rising", "category": "color", "note": "One line why"},
    {"name": "Signal", "pct": 52, "direction": "peaking", "category": "accessories", "note": "One line why"},
    {"name": "Signal", "pct": 44, "direction": "peaking", "category": "hardware", "note": "One line why"},
    {"name": "Signal", "pct": 28, "direction": "fading", "category": "silhouette", "note": "One line why"},
    {"name": "Signal", "pct": 18, "direction": "fading", "category": "category", "note": "One line why"}
  ],
  "brand_momentum": {
    "rising": [
      {"name": "Brand Name", "note": "One line why rising"},
      {"name": "Brand Name", "note": "One line why rising"},
      {"name": "Brand Name", "note": "One line why rising"}
    ],
    "holding": [
      {"name": "Brand Name", "note": "One line why holding"},
      {"name": "Brand Name", "note": "One line why holding"},
      {"name": "Brand Name", "note": "One line why holding"}
    ],
    "cooling": [
      {"name": "Brand Name", "note": "One line why cooling"},
      {"name": "Brand Name", "note": "One line why cooling"},
      {"name": "Brand Name", "note": "One line why cooling"}
    ]
  }
}

Rules:
- signals must cover: silhouettes, materials, colors, accessories, hardware, lifestyle categories (tailoring, streetwear, etc.)
- direction must be "rising", "peaking", or "fading" — be honest, include all three
- pct reflects real market momentum — rising 60-90%, peaking 40-65%, fading 10-35%
- brand_momentum based on Lyst Index logic — search volume, runway impact, resale demand, press momentum
- colors must be accurate ${currentSeason}/${upcomingSeason} commercial palette with specific hex codes
- Return ONLY the JSON, nothing else`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 2048,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }],
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const claudeData = await claudeRes.json();
        const textBlock = claudeData.content?.find(b => b.type === 'text');
        const rawText = textBlock?.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No valid JSON in response');
        const brief = JSON.parse(jsonMatch[0]);
        if (!brief.title || !brief.signals || !brief.colors) throw new Error('Invalid brief structure');

        const sbHeaders = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        await fetch(`${SUPABASE_URL}/rest/v1/weekly_brief?is_active=eq.true`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({ is_active: false })
        });

        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/weekly_brief`, {
            method: 'POST',
            headers: { ...sbHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({
                week_label: brief.week_label,
                season: brief.season,
                title: brief.title,
                colors: brief.colors,
                signals: brief.signals,
                note: brief.note,
                brand_momentum: brief.brand_momentum,
                images: [],
                is_active: true
            })
        });

        if (!insertRes.ok) {
            const err = await insertRes.text();
            throw new Error(`Supabase insert failed: ${err}`);
        }

        return res.status(200).json({
            success: true,
            brief,
            season: currentSeason,
            generated: new Date().toISOString()
        });

    } catch(error) {
        console.error('Generate brief error:', error);
        return res.status(500).json({ error: error.message });
    }
}
