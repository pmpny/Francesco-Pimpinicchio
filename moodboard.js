export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, colors, season, title } = req.body;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const API_KEY = process.env.GOOGLE_API_KEY;
  const CX = process.env.GOOGLE_CX;

  try {
    // Build search queries based on trend content
    const queries = [
      `${query} fashion 2026 2027`,
      `${season || 'SS27'} runway ${query}`,
      `luxury accessories ${query} trend`,
    ];

    const imageResults = [];

    for (const q of queries) {
      const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${encodeURIComponent(q)}&searchType=image&num=3&imgSize=large&imgType=photo&safe=active`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.items) {
        data.items.forEach(item => {
          imageResults.push({
            url: item.link,
            title: item.title,
            source: item.displayLink,
            thumbnail: item.image?.thumbnailLink
          });
        });
      }
    }

    // Deduplicate by domain
    const seen = new Set();
    const unique = imageResults.filter(img => {
      if (seen.has(img.source)) return false;
      seen.add(img.source);
      return true;
    }).slice(0, 8);

    return res.status(200).json({
      images: unique,
      title: title || query,
      season: season || 'SS27',
      colors: colors || []
    });

  } catch (error) {
    console.error('Moodboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
