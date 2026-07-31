import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fetchHtml, sleep } from '../lib/http.js';
import { genericExtractBook } from '../lib/structured-data.js';
import { discoverUrls } from '../lib/discovery.js';
import { SOURCES } from './sites.config.js';

function readExisting(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function diffTitles(oldBooks, newBooks) {
  const oldTitles = new Set(oldBooks.map(b => b.title));
  const newTitles = new Set(newBooks.map(b => b.title));
  return {
    added: [...newTitles].filter(t => !oldTitles.has(t)),
    removed: [...oldTitles].filter(t => !newTitles.has(t)),
  };
}

async function scrapeSource(source) {
  const urls = await discoverUrls(source.discovery);
  const books = [];

  for (const url of urls) {
    try {
      const $ = await fetchHtml(url);
      const book = genericExtractBook($, url);
      if (book && book.title && book.price) {
        books.push(book);
      } else {
        console.warn(`  ⚠️  Fiche incomplète ignorée (${url})`);
      }
    } catch (error) {
      console.warn(`  ⚠️  Erreur sur ${url} :`, error.message);
    }
    await sleep(500);
  }

  return books;
}

async function run() {
  let hadFailure = false;

  for (const source of SOURCES) {
    const path = `./data/${source.file}`;
    console.log(`\n📚 Scraping ${source.file}...`);

    const existing = readExisting(path);
    if (!existing) {
      console.warn(`⚠️  Fichier ${path} introuvable, on le laisse de côté.`);
      continue;
    }

    let scrapedBooks;
    try {
      scrapedBooks = await scrapeSource(source);
    } catch (error) {
      console.error(`❌ Échec du scraping de ${source.file} :`, error.message);
      hadFailure = true;
      continue;
    }

    if (scrapedBooks.length === 0) {
      console.error(
        `❌ ${source.file} : 0 livre récupéré, probable problème de scraping. Fichier non modifié.`
      );
      hadFailure = true;
      continue;
    }

    const { added, removed } = diffTitles(existing.books, scrapedBooks);
    if (added.length) console.log(`  ➕ Ajoutés : ${added.join(' | ')}`);
    if (removed.length) console.log(`  ➖ Retirés : ${removed.join(' | ')}`);
    if (!added.length && !removed.length) console.log('  = Aucun changement');

    const missingAuthor = scrapedBooks.filter(b => !b.author).length;
    if (missingAuthor) {
      console.warn(
        `  ⚠️  ${missingAuthor} livre(s) sans auteur détecté (le site n'expose peut-être pas cette info en JSON-LD/Open Graph)`
      );
    }

    const updated = {
      publisher: existing.publisher,
      ...(existing.fediverse_id ? { fediverse_id: existing.fediverse_id } : {}),
      books: scrapedBooks.map(({ title, author, year, price, description, url }) => ({
        title,
        author,
        year,
        price,
        ...(description ? { description } : {}),
        url,
      })),
    };

    writeFileSync(path, JSON.stringify(updated, null, 2) + '\n');
    console.log(`  ✅ ${path} mis à jour (${scrapedBooks.length} livres)`);
  }

  if (hadFailure) {
    console.error('\n❌ Au moins un scraper a échoué, voir les logs ci-dessus.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Scraping terminé sans erreur.');
  }
}

run();