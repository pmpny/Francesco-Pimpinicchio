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
        const baseUrl = new URL(fetchUrl).origin;

        // Fetch HTML + Shopify data in parallel
        const [htmlResult, shopifyResult] = await Promise.allSettled([
            fetchHTML(fetchUrl),
            fetchShopifyData(baseUrl)
        ]);

        const html = htmlResult.status === 'fulfilled' ? htmlResult.value : '';
        const shopifyData = shopifyResult.status === 'fulfilled' ? shopifyResult.value : null;

        // Extract text from HTML
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ').trim();

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const description = descMatch ? descMatch[1].trim() : '';

        // Build final content — HTML text + Shopify product data
        let finalContent = text.split(' ').slice(0, 2000).join(' ');
        let productSummary = '';

        if (shopifyData?.products?.length > 0) {
            const products = shopifyData.products.slice(0, 20);
            productSummary = '\n\n--- PRODUCT CATALOG (from store data) ---\n';
            products.forEach(p => {
                const price = p.variants?.[0]?.price;
                const comparePrice = p.variants?.[0]?.compare_at_price;
                const tags = p.tags ? (Array.isArray(p.tags) ? p.tags.join(', ') : p.tags) : '';
                const desc = p.body_html
                    ? p.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)
                    : '';
                productSummary += `\nProduct: ${p.title}`;
                if (price) productSummary += ` | Price: $${price}`;
                if (comparePrice) productSummary += ` | Was: $${comparePrice}`;
                if (p.product_type) productSummary += ` | Type: ${p.product_type}`;
                if (tags) productSummary += ` | Tags: ${tags}`;
                if (desc) productSummary += `\nDescription: ${desc}`;

                // Variants (sizes, colors)
                if (p.variants?.length > 1) {
                    const variantTitles = [...new Set(p.variants.map(v => v.title).filter(t => t !== 'Default Title'))];
                    if (variantTitles.length > 0) productSummary += `\nVariants: ${variantTitles.join(', ')}`;
                }
                productSummary += '\n';
            });
            productSummary += '--- END PRODUCT CATALOG ---';
        }

        finalContent = finalContent + productSummary;

        return res.status(200).json({
            content: finalContent,
            title,
            description,
            wordCount: finalContent.split(' ').length,
            url: fetchUrl,
            hasShopifyData: !!shopifyData?.products?.length,
            productCount: shopifyData?.products?.length || 0
        });

    } catch(error) {
        return res.status(500).json({ error: `Could not fetch site: ${error.message}` });
    }
}

async function fetchHTML(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMPNYBot/1.0)' },
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
}

async function fetchShopifyData(baseUrl) {
    try {
        // Shopify exposes products publicly at /products.json
        const res = await fetch(`${baseUrl}/products.json?limit=20`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMPNYBot/1.0)' },
            signal: AbortSignal.timeout(8000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        // Verify it's actually Shopify data
        if (!data.products || !Array.isArray(data.products)) return null;
        return data;
    } catch(e) {
        return null; // Not Shopify or not accessible
    }
}
