import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { open_url } from 'tools.web_search';
import { load } from 'cheerio';
import { validateEditor } from '../data/schema.js';

const EDITORS_CONFIG = {
  'divergences': {
    url: 'https://www.editionsdivergences.com/',
    selector: {
      book: '.product-item',
      title: '.product-title',
      author: '.product-author',
      price: '.price',
      url: 'a[href*="/product/"]',
      description: '.product-description',
    },
    publisher: "Éditions Divergences",
    fediverse_id: "@Divergences@mastodon.social",
    website: "https://www.editionsdivergences.com",
  },
  'editions-jou': {
    url: 'https://editionsjou.net/litterature/',
    selector: {
      book: '.product',
      title: 'h3',
      author: '.author',
      price: '.price',
      url: 'a[href*="/livre/"]',
      description: '.description',
    },
    publisher: "Éditions JOU",
    fediverse_id: "@editionsjou@mastodon.social",
    website: "https://editionsjou.net",
  },
  'la-volte': {
    url: 'https://lavolte.net/',
    selector: {
      book: '.book',
      title: '.title',
      author: '.author',
      price: '.price',
      url: 'a[href*="/livre/"]',
    },
    publisher: "La Volte",
    fediverse_id: "@LaVolte@mastodon.social",
    website: "https://lavolte.net",
  },
};

async function scrapeEditor(editorKey) {
  const config = EDITORS_CONFIG[editorKey];
  if (!config) throw new Error(`Config pour ${editorKey} introuvable`);

  if (!existsSync('./data/editors')) {
    mkdirSync('./data/editors', { recursive: true });
  }

  try {
    const result = await open_url({ url: config.url });
    const $ = load(result.content);
    const books = [];

    $(config.selector.book).each((i, el) => {
      const title = $(el).find(config.selector.title).text().trim();
      const author = $(el).find(config.selector.author).text().trim();
      const price = $(el).find(config.selector.price).text().trim();
      let url = $(el).find(config.selector.url).attr('href');
      const description = config.selector.description
        ? $(el).find(config.selector.description).text().trim()
        : undefined;

      if (title && url) {
        if (!url.startsWith('http')) {
          url = new URL(url, config.url).href;
        }

        books.push({
          title,
          author: author || "Auteur·e inconnu·e",
          price: price || "Prix inconnu",
          url,
          description,
        });
      }
    });

    const editorData = {
      publisher: config.publisher,
      fediverse_id: config.fediverse_id,
      website: config.website,
      books,
    };

    const editorValide = validateEditor(editorData);

    writeFileSync(
      `./data/editors/${editorKey}.json`,
      JSON.stringify(editorValide, null, 2)
    );

    console.log(`✅ Scrapé ${books.length} livres pour ${config.publisher}`);
    return books.length;
  } catch (error) {
    console.error(`❌ Erreur lors du scraping de ${editorKey}:`, error.message);
    throw error;
  }
}

const editorKey = process.argv[2];
if (!editorKey) {
  console.error("Veuillez spécifier un éditeur (ex: 'divergences')");
  process.exit(1);
}

scrapeEditor(editorKey).catch(console.error);