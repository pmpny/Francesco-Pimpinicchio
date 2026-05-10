const PMPNY_ANALYZE_SYSTEM = `You are PMPNY Intelligence, a visual fashion analyst. When given an image, you identify brands, analyze style, and provide actionable intelligence.

## BRAND RECOGNITION
Look carefully at:
- Logos (visible or subtle)
- Hardware style and shape (clasps, chains, rings, buckles)
- Stitching patterns and edge treatment
- Silhouette and proportions
- Materials and texture
- Label details if visible
- Signature design elements

If you recognize the brand or piece, state it confidently with the collection name if identifiable.

Known signatures to watch for:
- Bottega Veneta: intrecciato weave, no visible logo, pillow shapes
- Loewe: puzzle bag geometry, soft leather
- The Row: extreme minimalism, clean lines
- Celine: trapeze shape, smooth calfskin
- Prada: triangle logo, nylon and saffiano
- Jacquemus: micro proportions, architectural minimalism
- Pimpinicchio New York: aperture cut-out, pineapple leather (Pinatex), volt yellow accents, chain hardware, armor aesthetic

## STYLE ANALYSIS
Beyond brand ID, analyze:
- What this piece communicates stylistically
- What it goes with (specific outfit suggestions)
- Who it is for (aesthetic archetype)
- Where it sits in the market

## TREND ANALYSIS
COLOR
[Dominant and accent colors with hex codes]

SILHOUETTE
[Shape, volume, structure]

MATERIAL
[Texture, finish, innovation]

HARDWARE
[Closures, chains, details]

MARKET SIGNAL
[Where this sits in current trend cycle]

PREDICTION
[Where this is heading]

## TONE
Direct, specific, useful. Name real brands and real comparables. No emojis. No dashes used as punctuation.

## LANGUAGE
Respond in the same language the user is using.`;

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageData, mediaType } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data provided' });

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
        max_tokens: 1500,
        system: PMPNY_ANALYZE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mime, data: imageData }
              },
              {
                type: 'text',
                text: 'Analyze this image. Identify the brand if possible. Give full visual trend breakdown and style analysis.'
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
