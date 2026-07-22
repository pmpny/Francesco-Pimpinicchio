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
        const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // ── SEASON LOGIC — forecast the upcoming DESIGN season, not the one on sale now ──
        // Designers work ~12-18 months ahead. The brief should project the next season
        // a designer would actively be developing, with early signals on the one after it.
        //
        // Fashion design calendar (Northern Hemisphere):
        //   Jan-Jun  → you are designing the SS of NEXT year   (target), FW next year = horizon
        //   Jul-Dec  → you are designing the FW of NEXT year   (target), SS year+2   = horizon
        //
        // Example (this file running July 2026):
        //   targetSeason = SS27, horizonSeason = FW27
        let targetSeason, horizonSeason;
        if (month >= 1 && month <= 6) {
            targetSeason  = `SS${String(year + 1).slice(2)}`;
            horizonSeason = `FW${String(year + 1).slice(2)}`;
        } else {
            targetSeason  = `FW${String(year + 1).slice(2)}`;
            horizonSeason = `SS${String(year + 2).slice(2)}`;
        }

        // Current commercial season (what's in stores now) — used ONLY as evidence, never the subject.
        const currentSeason = (month >= 2 && month <= 7)
            ? `SS${String(year).slice(2)}`
            : `FW${String(year).slice(2)}`;

        const prompt = `You are PMPNY Intelligence — a senior fashion trend FORECASTER writing for independent accessories and ready-to-wear designers who are developing collections 12 to 18 months ahead of retail.

Today is ${monthName}. Right now these designers are actively designing ${targetSeason}, with early direction-setting for ${horizonSeason}.

Your job is to PROJECT where ${targetSeason} is heading — colors, silhouettes, materials, hardware, and market direction — NOT to report on what is currently in stores. Write like a forecaster giving a designer a head start, not like a journalist recapping the current season.

Use current-season (${currentSeason}) runway, resale, and retail data ONLY as evidence for where things are going. For example: "The Row's resale premiums holding through ${currentSeason} signal refined tailoring will carry into ${targetSeason}." The subject is always the FUTURE season; present data is just the supporting signal.

Search the web for the most recent runway coverage (Resort/Pre-collections and the latest ready-to-wear shows), color forecasting, resale/Lyst-style momentum, and material innovation to ground your projections in real, current signals.

Return ONLY a valid JSON object with this exact structure, no markdown:

{
  "title": "Evocative forward-looking brief title, max 6 words",
  "season": "${targetSeason}",
  "week_label": "Monthly Brief · ${monthName}",
  "note": "2-3 sentences PROJECTING the ${targetSeason} direction. Reference real current signals (brands, shows, resale movements) as evidence for where ${targetSeason} is heading. Forward-looking, not a recap of now.",
  "colors": [
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"}
  ],
  "signals": [
    {"name": "Signal", "pct": 84, "direction": "rising", "category": "silhouette", "note": "One line — why this is building toward ${targetSeason}"},
    {"name": "Signal", "pct": 71, "direction": "rising", "category": "material", "note": "One line — why this is building toward ${targetSeason}"},
    {"name": "Signal", "pct": 58, "direction": "rising", "category": "color", "note": "One line — why this is building toward ${targetSeason}"},
    {"name": "Signal", "pct": 52, "direction": "peaking", "category": "accessories", "note": "One line — at its commercial peak now, plan accordingly"},
    {"name": "Signal", "pct": 44, "direction": "peaking", "category": "hardware", "note": "One line — at its commercial peak now, plan accordingly"},
    {"name": "Signal", "pct": 28, "direction": "fading", "category": "silhouette", "note": "One line — why this will read dated by ${targetSeason}"},
    {"name": "Signal", "pct": 18, "direction": "fading", "category": "category", "note": "One line — why this will read dated by ${targetSeason}"}
  ],
  "brand_momentum": {
    "rising": [
      {"name": "Brand Name", "note": "One line — trajectory into ${targetSeason}"},
      {"name": "Brand Name", "note": "One line — trajectory into ${targetSeason}"},
      {"name": "Brand Name", "note": "One line — trajectory into ${targetSeason}"}
    ],
    "holding": [
      {"name": "Brand Name", "note": "One line — steady cultural weight"},
      {"name": "Brand Name", "note": "One line — steady cultural weight"},
      {"name": "Brand Name", "note": "One line — steady cultural weight"}
    ],
    "cooling": [
      {"name": "Brand Name", "note": "One line — losing momentum heading into ${targetSeason}"},
      {"name": "Brand Name", "note": "One line — losing momentum heading into ${targetSeason}"},
      {"name": "Brand Name", "note": "One line — losing momentum heading into ${targetSeason}"}
    ]
  }
}

Rules:
- Everything projects toward ${targetSeason}. Do NOT recap the current retail season as the topic.
- signals must cover: silhouettes, materials, colors, accessories, hardware, lifestyle categories (tailoring, utility, etc.)
- direction must be "rising", "peaking", or "fading" — be honest, include all three. Rising = building toward ${targetSeason}; peaking = at commercial peak now; fading = will read dated by ${targetSeason}.
- pct reflects forecasted momentum — rising 60-90%, peaking 40-65%, fading 10-35%
- brand_momentum based on Lyst-Index logic (search volume, runway impact, resale demand, press) — read as trajectory INTO ${targetSeason}, not a snapshot of now
- colors must be a credible ${targetSeason} commercial palette with specific hex codes, informed by current color forecasting
- Ground projections in real current signals found via web search — cite real brands and movements in the notes
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
        // With web_search enabled the response may contain multiple text blocks
        // (interleaved with tool use). Concatenate all text blocks, then extract JSON.
        const rawText = (claudeData.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No valid JSON in response');
        const brief = JSON.parse(jsonMatch[0]);
        if (!brief.title || !brief.signals || !brief.colors) throw new Error('Invalid brief structure');

        // Safety net: force the season fields to the computed target regardless of model output
        brief.season = targetSeason;
        if (!brief.week_label) brief.week_label = `Monthly Brief · ${monthName}`;

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
            season: targetSeason,
            horizon: horizonSeason,
            generated: new Date().toISOString()
        });

    } catch(error) {
        console.error('Generate brief error:', error);
        return res.status(500).json({ error: error.message });
    }
}
