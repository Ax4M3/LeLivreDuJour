import { readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { createRestAPIClient } from 'masto';
import { validateEditor } from './data/schema.js';
import { Low, JSONFile } from 'lowdb';

if (!existsSync('./cache')) mkdirSync('./cache', { recursive: true });
if (!existsSync('./logs')) mkdirSync('./logs', { recursive: true });

const adapter = new JSONFile('./published.json');
const db = new Low(adapter);
await db.read();
db.data ||= { books: [] };

const client = createRestAPIClient({
  url: process.env.MASTODON_BASE_URL,
  accessToken: process.env.MASTODON_ACCESS_TOKEN,
});

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  console.log(logMessage);
  appendFileSync('./logs/bot.log', logMessage);
}

function lireLivres() {
  const dossierEditors = './data/editors';
  const fichiers = readdirSync(dossierEditors).filter(f => f.endsWith('.json'));
  let tousLesLivres = [];
  let erreurs = 0;

  for (const fichier of fichiers) {
    try {
      const contenu = readFileSync(`${dossierEditors}/${fichier}`, 'utf-8');
      const data = JSON.parse(contenu);
      const editeurValide = validateEditor(data);

      const livresAvecEditeur = editeurValide.books.map(livre => ({
        ...livre,
        publisher: editeurValide.publisher,
        fediverse_id: editeurValide.fediverse_id,
      }));

      tousLesLivres = [...tousLesLivres, ...livresAvecEditeur];
      log(`✅ ${editeurValide.publisher}: ${livresAvecEditeur.length} livres chargés`);
    } catch (error) {
      log(`⚠️ Erreur dans ${fichier}: ${error.message}`, 'ERROR');
      erreurs++;
    }
  }

  if (erreurs > 0) {
    log(`⚠️ ${erreurs} fichiers éditeurs ont des erreurs de validation`, 'WARN');
  }

  return tousLesLivres;
}

function appliquerCorrections(livres) {
  if (!existsSync('./data/overrides/corrections.json')) return livres;

  try {
    const { corrections } = JSON.parse(
      readFileSync('./data/overrides/corrections.json', 'utf-8')
    );

    return livres.map(livre => {
      const correction = corrections.find(
        c => c.publisher === livre.publisher && c.title === livre.title
      );
      if (correction) {
        return { ...livre, [correction.field]: correction.newValue };
      }
      return livre;
    });
  } catch (error) {
    log(`⚠️ Erreur lors de l'application des corrections: ${error.message}`, 'WARN');
    return livres;
  }
}

function formaterPost(livre) {
  const { title, author, year, price, description, url } = livre;

  const auteurStr = author || "Auteur·e inconnu·e";
  let post = `${title} — ${auteurStr}${year ? ` (${year})` : ''}\n`;

  post += `${livre.publisher} | ${price || "Prix inconnu"}\n\n`;

  if (description) {
    const desc = description.substring(0, 200) + (description.length > 200 ? '…' : '');
    post += `${desc}\n\n`;
  }
  post += `🔗 ${url}`;

  const hashtags = [
    `#Livre`,
    `#Lecture`,
    `#${livre.publisher.replace(/\s+/g, '')}`,
    `#ÉditionsIndépendantes`,
  ].slice(0, 4).join(' ');

  post += `\n\n${hashtags}`;

  if (post.length > 500) {
    post = post.substring(0, 497) + '…';
  }

  return post;
}

async function publierSurMastodon(post, livre) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.v1.statuses.create({ status: post });
      db.data.books.push({
        title: livre.title,
        publisher: livre.publisher,
        date: new Date().toISOString(),
      });
      await db.write();
      log(`✅ Post publié : ${livre.title} (${livre.publisher})`);
      return;
    } catch (error) {
      log(`❌ Échec tentative ${attempt} pour ${livre.title}: ${error.message}`, 'ERROR');
      if (attempt === maxRetries) {
        throw new Error(`Échec après ${maxRetries} tentatives.`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }
}

async function publierLivre() {
  if (!process.env.MASTODON_ACCESS_TOKEN || !process.env.MASTODON_BASE_URL) {
    throw new Error('❌ Les variables MASTODON_ACCESS_TOKEN et MASTODON_BASE_URL sont requises.');
  }

  log('Début de la publication...');
  let livres = lireLivres();
  livres = appliquerCorrections(livres);
  log(`Trouvés ${livres.length} livres au total.`);

  if (livres.length === 0) {
    throw new Error('❌ Aucun livre trouvé dans le dossier data/editors/');
  }

  const livresRestants = livres.filter(livre =>
    !db.data.books.some(p => p.title === livre.title && p.publisher === livre.publisher)
  );

  if (livresRestants.length === 0) {
    log('⚠️ Tous les livres ont déjà été publiés.');
    return;
  }

  livresRestants.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));

  const livresPrioritaires = livresRestants.filter(l => l.isNew);
  const livreAleatoire = livresPrioritaires.length > 0
    ? livresPrioritaires[Math.floor(Math.random() * livresPrioritaires.length)]
    : livresRestants[Math.floor(Math.random() * livresRestants.length)];

  const post = formaterPost(livreAleatoire);
  log(`Post sélectionné : ${livreAleatoire.title}`);

  if (process.env.MODE_TEST === 'true') {
    log('🧪 Mode test activé. Post simulée :\n' + post);
    return;
  }

  await publierSurMastodon(post, livreAleatoire);
}

publierLivre().catch(error => {
  log(`❌ Erreur fatale : ${error.message}`, 'ERROR');
  process.exit(1);
});