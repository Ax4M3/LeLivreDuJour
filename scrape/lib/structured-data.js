import { extractPrice, extractYear } from './http.js';

function extractJsonLdObjects($) {
  const objects = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw || !raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          objects.push(...item['@graph']);
        } else {
          objects.push(item);
        }
      }
    } catch {}
  });
  return objects;
}

const BOOK_TYPES = ['book', 'product', 'creativework'];

function matchesType(obj, wanted) {
  const type = obj['@type'];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some(t => wanted.includes(String(t).toLowerCase()));
}

function authorNameFromJsonLd(author) {
  if (!author) return null;
  const list = Array.isArray(author) ? author : [author];
  const names = list
    .map(a => (typeof a === 'string' ? a : a?.name))
    .filter(Boolean);
  return names.length ? names.join(', ') : null;
}

function priceFromOffers(offers) {
  if (!offers) return null;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const amount = offer?.price ?? offer?.priceSpecification?.price;
  if (amount === undefined || amount === null) return null;
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return null;
  return `${num.toFixed(2).replace('.', ',')} €`;
}

function fromJsonLd($, url) {
  const objects = extractJsonLdObjects($);
  const book = objects.find(o => matchesType(o, BOOK_TYPES));
  if (!book) return null;

  const title = book.name || null;
  const author = authorNameFromJsonLd(book.author) || authorNameFromJsonLd(book.creator);
  const description = book.description || null;
  const price = priceFromOffers(book.offers);
  const dateStr = book.datePublished || book.releaseDate || book.dateCreated || '';
  const year = extractYear(String(dateStr)) || null;

  if (!title) return null;
  return { title, author, description, price, year, url, source: 'json-ld' };
}

function fromOpenGraph($, url) {
  const get = name =>
    $(`meta[property="${name}"]`).attr('content') ||
    $(`meta[name="${name}"]`).attr('content') ||
    null;

  const title = get('og:title');
  if (!title) return null;

  const description = get('og:description') || get('description');
  const priceAmount = get('product:price:amount') || get('og:price:amount');
  const price = priceAmount ? `${priceAmount.replace('.', ',')} €` : extractPrice($('body').text());
  const dateStr = get('article:published_time') || get('book:release_date') || '';
  const year = extractYear(String(dateStr)) || extractYear($('body').text());
  const author = get('book:author') || get('article:author');

  return { title, author, description, price, year, url, source: 'open-graph' };
}

function fromHeuristic($, url) {
  const h1 = $('h1').first();
  const title = h1.text().trim();
  if (!title) return null;

  const pageText = $('body').text();
  const price = extractPrice(pageText);
  const year = extractYear(pageText);

  let description = null;
  $('p').each((_, p) => {
    if (description) return;
    const text = $(p).text().trim();
    if (text.length > 100) description = text;
  });

  return { title, author: null, description, price, year, url, source: 'heuristic' };
}

export function genericExtractBook($, url) {
  return fromJsonLd($, url) || fromOpenGraph($, url) || fromHeuristic($, url);
}