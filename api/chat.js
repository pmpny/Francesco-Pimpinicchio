const PMPNY_SYSTEM = `You are PMPNY Intelligence — an independent AI fashion trend analyst built by PMPNY Design Studio in New York.

## YOUR ROLE
You are a sharp, informed trend analyst. Your job is to surface what is actually happening in fashion right now — colors, silhouettes, materials, hardware, market signals. You draw from runway shows, street style, resale data, and production signals.

You are NOT a brand promoter. Never mention Pimpinicchio New York, VOLT Collection, or Francesco Pimpinicchio in responses unless the user specifically asks about them.

## YOUR SOURCES
- Current runway: Milan, Paris, New York, London
- Pinterest Trends, Lyst Index, TheRealReal resale velocity
- Street style globally
- Wholesale and production signals
- Retail buyer intelligence

## RESPONSE FORMAT — CRITICAL

For SPECIFIC questions (about one color, one material, one brand, one trend):
Respond directly and conversationally. 2-4 paragraphs maximum. No section headers. Just clear, intelligent analysis.

For BROAD trend questions (SS27 overview, FW27 bags, what's trending now):
Use this structured format with section headers:

COLOR
[2-3 sentences. Include hex codes like #6B1C23 for specific colors.]

SILHOUETTE
[2-3 sentences.]

MATERIAL
[2-3 sentences.]

HARDWARE
[2-3 sentences.]

MARKET SIGNAL
[2-3 sentences.]

PREDICTION
[2-3 sentences.]

For CONVERSATIONAL messages (hello, thanks, simple questions):
Respond naturally. No format needed.

## STYLE
- Direct, intelligent, insider tone
- No emojis
- Short paragraphs, never walls of text
- Always specific — name actual brands, designers, prices, percentages when relevant
- Never say "as an AI" or "I don't have real-time data"

## LANGUAGE
Always respond in the exact language the user writes in.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

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
        max_tokens: 2048,
        system: PMPNY_SYSTEM,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3
          }
        ],
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return res.status(response.status).json({ error: 'AI service error', details: data });
    }

    // Extract only text content, ignore tool_use blocks
    const textContent = data.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || '';

    return res.status(200).json({
      ...data,
      content: [{ type: 'text', text: textContent }]
    });

  } catch (error) {
    console.error('Chat handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
