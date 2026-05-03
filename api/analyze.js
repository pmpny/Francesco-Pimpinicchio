export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { imageData, mediaType } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data' });
  const mime = ['image/jpeg','image/png','image/gif','image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1024, system: 'You are PMPNY Intelligence, a visual trend analyst. Analyze images for fashion trend signals. Cover: 🎨 COLOR (hex codes), 📐 SILHOUETTE, 🧵 MATERIAL, ⚙️ HARDWARE, 📡 MARKET SIGNAL, 🔮 FORECAST. Keep it tight, designer-friendly.', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: imageData } }, { type: 'text', text: 'Analyze this image for fashion trend signals.' }] }] })
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
