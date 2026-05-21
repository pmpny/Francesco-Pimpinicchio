export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    try {
        const fetchUrl = url.startsWith('http') ? url : `https://${url}`;

        const response = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PMPNYBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();

        // Extract text content — strip HTML tags
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();

        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // Extract meta description
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const description = descMatch ? descMatch[1].trim() : '';

        // Extract product names / headings
        const headings = [];
        const h1Matches = html.matchAll(/<h[123][^>]*>([^<]+)<\/h[123]>/gi);
        for (const m of h1Matches) {
            const txt = m[1].replace(/<[^>]+>/g, '').trim();
            if (txt.length > 3 && txt.length < 120) headings.push(txt);
        }

        // Extract prices (CHF, $, €)
        const prices = [...new Set(text.match(/(?:CHF|USD|\$|€)\s*[\d,]+(?:\.\d{2})?/gi) || [])];

        // Extract image URLs (just paths, not full content)
        const imgMatches = html.matchAll(/src=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi);
        const images = [];
        for (const m of imgMatches) {
            const imgUrl = m[1].startsWith('http') ? m[1] : new URL(m[1], fetchUrl).href;
            if (!imgUrl.includes('icon') && !imgUrl.includes('logo') && images.length < 20) {
                images.push(imgUrl);
            }
        }

        // Limit text to ~3000 words
        const words = text.split(' ');
        const truncated = words.slice(0, 3000).join(' ');

        return res.status(200).json({
            content: truncated,
            title,
            description,
            headings: headings.slice(0, 30),
            prices,
            imageUrls: images,
            wordCount: words.length,
            url: fetchUrl
        });

    } catch(error) {
        return res.status(500).json({ error: `Could not fetch site: ${error.message}` });
    }
}
