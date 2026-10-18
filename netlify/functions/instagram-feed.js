import { response } from './_shared/http.js';

export const handler = async event => {
  if (event.httpMethod !== 'GET') return response(405, { error: 'Method not allowed.' });
  const elfsightWidgetId = String(process.env.ELFSIGHT_WIDGET_ID || '').trim();
  if (elfsightWidgetId && /^[a-z0-9-]{16,80}$/i.test(elfsightWidgetId)) return response(200, { configured: true, provider: 'elfsight', elfsightWidgetId, posts: [] });
  const userId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !token || userId === 'REPLACE_ME' || token === 'REPLACE_ME') return response(200, { configured: false, posts: [] });
  try {
    const url = new URL(`https://graph.instagram.com/${encodeURIComponent(userId)}/media`);
    url.searchParams.set('fields', 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp');
    url.searchParams.set('limit', '9');
    url.searchParams.set('access_token', token);
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.error) return response(200, { configured: true, posts: [], unavailable: true, message: 'Instagram is not available at the moment.' });
    const posts = (result.data || []).filter(post => ['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO'].includes(post.media_type) && (post.media_url || post.thumbnail_url)).slice(0, 9).map(post => ({
      id: String(post.id), caption: String(post.caption || '').slice(0, 450), mediaType: post.media_type,
      mediaUrl: post.media_type === 'VIDEO' ? (post.thumbnail_url || post.media_url) : post.media_url,
      permalink: /^https:\/\/(www\.)?instagram\.com\//.test(post.permalink || '') ? post.permalink : 'https://www.instagram.com/_michellebediako/',
      timestamp: post.timestamp || null
    }));
    return response(200, { configured: true, posts });
  } catch {
    return response(200, { configured: true, posts: [], unavailable: true });
  }
};
