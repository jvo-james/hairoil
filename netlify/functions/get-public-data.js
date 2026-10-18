import { response } from './_shared/http.js';
import { getFirebase } from './_shared/firebase.js';
import { getSettings, publicSettings } from './_shared/store.js';

export const handler = async event => {
  if (event.httpMethod !== 'GET') return response(405, { error: 'Method not allowed.' });
  try {
    const { db } = getFirebase();
    const settings = await getSettings(db);
    const reviewsSnap = await db.collection('reviews').where('published', '==', true).limit(50).get();
    const reviews = reviewsSnap.docs.map(doc => {
      const d = doc.data();
      return { id: doc.id, name: d.name || 'Customer', rating: Number(d.rating || 0), review: d.review || '', createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return response(200, { settings: publicSettings(settings), reviews });
  } catch (error) {
    return response(200, { settings: { productName: 'Hair Confidante Hair Oil', productDescription: 'A hair oil created to be part of your regular hair and scalp care routine.', retailPrice: Number(process.env.RETAIL_PRICE_GHS || 70), wholesalePrice: Number(process.env.WHOLESALE_PRICE_GHS || 60), wholesaleMinQty: Number(process.env.WHOLESALE_MIN_QTY || 10), bottleSize: '100 mL', inventory: null, productImageUrl: '' }, reviews: [], warning: error.message });
  }
};
