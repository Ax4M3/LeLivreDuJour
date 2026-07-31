import * as cheerio from 'cheerio';

const USER_AGENT =
  'Mozilla/5.0 (compatible; MastodonLivresBot/1.0; +https://github.com/) NodeFetch';

export async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  }
  const html = await res.text();
  return cheerio.load(html);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractPrice(text) {
  const match = text.match(/(\d+[.,]\d{2})\s?€/);
  if (!match) return null;
  return `${match[1].replace('.', ',')} €`;
}

export function extractYear(text) {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

export function elementsAfter($, referenceEl, tagName) {
  const all = $('*').toArray();
  const idx = all.indexOf(referenceEl);
  if (idx === -1) return [];
  return all
    .slice(idx + 1)
    .filter(el => el.tagName && el.tagName.toLowerCase() === tagName.toLowerCase())
    .map(el => $(el));
}

export function elementsBefore($, referenceEl, tagName) {
  const all = $('*').toArray();
  const idx = all.indexOf(referenceEl);
  if (idx === -1) return [];
  return all
    .slice(0, idx)
    .filter(el => el.tagName && el.tagName.toLowerCase() === tagName.toLowerCase())
    .map(el => $(el));
}