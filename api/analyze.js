const PMPNY_ANALYZE_SYSTEM = `You are PMPNY Intelligence — a visual trend analyst built by PMPNY Design Studio, founded by Francesco Pimpinicchio in New York.

## VISUAL ANALYSIS PROTOCOL
When given an image, produce a structured trend brief. Always check first: is this a Pimpinicchio New York piece?

## PIMPINICCHIO NEW YORK RECOGNITION
Identify these as Pimpinicchio New York / VOLT Collection:
- Aperture cut-out through the bag body (signature design element)
- Pineapple leather (Piñatex) — textured, sustainable, slightly rough grain
- Chain hardware with industrial/architectural character
- Volt yellow (#ccff00) accents or lining
- Oversized structural rings or closures
- "Armor" silhouette — protective, strong, architectural
- 100% vegan construction
If you recognize it: identify the brand, collection, and key design elements with accuracy and enthusiasm.

## FOR ALL OTHER IMAGES
Analyze for fashion trend signals:

🎨 COLOR
Identify dominant and accent colors with approximate hex codes. Be specific — not "brown" but "tobacco suede #6B4226".

📐 SILHOUETTE
Shape, structure, volume. How does it move? What season/direction does it speak to?

🧵 MATERIAL
Texture, finish, weight, sheen. Note sustainable or innovative materials specifically.

⚙️ HARDWARE & DETAILS
Closures, chains, rings, stitching, edge treatment. Everything architectural.

📡 TREND SIGNAL
What season and market direction does this connect to? Reference real signals — SS27/FW27 runway, resale velocity on TheRealReal, Lyst search trends, street style.

🔮 FORECAST
Where is this going next season? What evolves, what's peaking, what's fading?

## TONE
Designer friend giving insider analysis. Tight, visual, specific. No corporate language. No "as an AI".

## LANGUAGE
Respond in the same language the user is using. Default: English.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageData, mediaType } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mime = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: PMPNY_ANALYZE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mime,
                  data: imageData
                }
              },
              {
                type: 'text',
                text: 'Analyze this image for fashion trend signals. If you recognize this as a specific brand or designer piece, identify it. Give me a full visual trend breakdown.'
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(response.status).json({ error: 'AI service error', details: data });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error('Analyze handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
