// api/generate-brief.js
// Called automatically on the 1st of every month via Vercel cron
// Also callable manually from admin

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Security: allow cron (GET) or manual admin trigger (POST with secret)
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
        // Determine current and upcoming season
        const now = new Date();
        const month = now.getMonth() + 1; // 1-12
        const year = now.getFullYear();

        let currentSeason, upcomingSeason, seasonLabel;
        if (month >= 2 && month <= 7) {
            currentSeason = `SS${String(year).slice(2)}`;
            upcomingSeason = `FW${String(year).slice(2)}`;
        } else {
            currentSeason = `FW${String(year).slice(2)}`;
            upcomingSeason = `SS${String(year + 1).slice(2)}`;
        }
        seasonLabel = currentSeason;

        const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Generate brief with Claude
        const prompt = `You are PMPNY Intelligence — a fashion trend analyst. Generate a monthly trend brief for ${monthName}.

Current season: ${currentSeason}
Upcoming season: ${upcomingSeason}

Generate a JSON response with this exact structure (no markdown, pure JSON):
{
  "title": "A short evocative brief title (max 6 words, no quotes)",
  "season": "${currentSeason}",
  "week_label": "Monthly Brief · ${monthName}",
  "signals": [
    {"name": "Signal Name", "pct": 78},
    {"name": "Signal Name", "pct": 65},
    {"name": "Signal Name", "pct": 54},
    {"name": "Signal Name", "pct": 43},
    {"name": "Signal Name", "pct": 38}
  ],
  "colors": [
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"},
    {"hex": "#XXXXXX", "name": "Color Name"}
  ],
  "note": "2-3 sentences on what's happening in fashion RIGHT NOW in ${monthName} ${year}. Specific, commercial, no fluff."
}

Rules:
- Signals must be REAL trends happening now in ${currentSeason} fashion accessories and ready-to-wear
- Percentages reflect actual market momentum (use web knowledge up to your cutoff)
- Colors must be accurate ${currentSeason}/${upcomingSeason} commercial palette — specific hex codes
- Title should be poetic but grounded (e.g. "The Architecture of Restraint", "Quiet Hardware Rising")
- Note should mention specific brands, shows, or market movements if relevant
- Return ONLY the JSON, no other text`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const claudeData = await claudeRes.json();
        const rawText = claudeData.content?.[0]?.text || '';

        // Parse JSON from response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No valid JSON in response');

        const brief = JSON.parse(jsonMatch[0]);

        // Validate structure
        if (!brief.title || !brief.signals || !brief.colors) {
            throw new Error('Invalid brief structure');
        }

        // Save to Supabase — deactivate old, insert new
        const sbHeaders = {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        // Deactivate old briefs
        await fetch(`${SUPABASE_URL}/rest/v1/weekly_brief?is_active=eq.true`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({ is_active: false })
        });

        // Insert new brief
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
            brief: brief,
            season: currentSeason,
            generated: new Date().toISOString()
        });

    } catch(error) {
        console.error('Generate brief error:', error);
        return res.status(500).json({ error: error.message });
    }
}
