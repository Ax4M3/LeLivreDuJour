import { fetchHtml } from './http.js';

async function discoverFromListing(config) {
  const $ = await fetchHtml(config.url);
  const urls = new Set();

  $('a').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const absolute = href.startsWith('http') ? href : new URL(href, config.url).href;
    if (!config.linkPattern.test(absolute)) return;
    if (config.requiresImg && $(a).find('img').length === 0) return;
    urls.add(absolute);
  });

  return [...urls];
}

async function fetchSitemapLocs(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MastodonLivresBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en récupérant le sitemap ${url}`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)];
  return matches.map(m => m[1]);
}

async function discoverFromSitemap(config) {
  const locs = await fetchSitemapLocs(config.sitemapUrl);

  const isSitemapIndex = locs.some(l => /sitemap.*\.xml$/i.test(l));
  let allLocs = locs;
  if (isSitemapIndex) {
    allLocs = [];
    for (const sub of locs.filter(l => /sitemap.*\.xml$/i.test(l))) {
      try {
        allLocs.push(...(await fetchSitemapLocs(sub)));
      } catch {}
    }
  }

  return allLocs.filter(l => config.urlPattern.test(l));
}

export async function discoverUrls(discoveryConfig) {
  if (discoveryConfig.type === 'listing') return discoverFromListing(discoveryConfig);
  if (discoveryConfig.type === 'sitemap') return discoverFromSitemap(discoveryConfig);
  throw new Error(`Type de découverte inconnu : ${discoveryConfig.type}`);
}