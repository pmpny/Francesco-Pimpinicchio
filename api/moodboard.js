export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query, colors, season, title } = req.body;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: 'Missing UNSPLASH_ACCESS_KEY' });

  try {
    const queries = [
      `${query} fashion`,
      `luxury bag accessories ${season || 'SS27'}`,
      `fashion editorial accessories`,
    ];

    const imageResults = [];
    const seen = new Set();

    for (const q of queries) {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=4&orientation=portrait&content_filter=high`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Client-ID ${ACCESS_KEY}`,
          'Accept-Version': 'v1'
        }
      });
      const data = await response.json();

      if (data.results) {
        data.results.forEach(photo => {
          if (!seen.has(photo.id)) {
            seen.add(photo.id);
            imageResults.push({
              url: photo.urls.regular,
              title: photo.alt_description || query,
              source: 'Unsplash',
              photographer: photo.user.name,
              photographerUrl: `${photo.user.links.html}?utm_source=pmpny_intelligence&utm_medium=referral`,
              downloadUrl: photo.links.download_location
            });
          }
        });
      }
    }

    // Trigger Unsplash download events (required by API guidelines)
    imageResults.slice(0, 8).forEach(img => {
      if (img.downloadUrl) {
        fetch(`${img.downloadUrl}?client_id=${ACCESS_KEY}`).catch(() => {});
      }
    });

    return res.status(200).json({
      images: imageResults.slice(0, 8),
      title: title || query,
      season: season || 'SS27',
      colors: colors || []
    });

  } catch (error) {
    console.error('Moodboard error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
