import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { createRestAPIClient } from 'masto';

const DOSSIER_DATA = './data';
const FICHIER_PUBLIES = './published.json';
const LIMITE_CARACTERES = 500;
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

const HASHTAGS_FIXES = ['#Livre', '#Lecture', '#EditionsIndépendantes'];

function champsManquants(livre) {
  const champsRequis = ['title', 'author', 'year', 'price', 'url'];
  return champsRequis.filter(champ => !livre[champ]);
}

function lireLivres() {
  if (!existsSync(DOSSIER_DATA)) {
    throw new Error(`❌ Le dossier ${DOSSIER_DATA} n'existe pas.`);
  }

  const fichiers = readdirSync(DOSSIER_DATA).filter(f => f.endsWith('.json'));
  const tousLesLivres = [];

  for (const fichier of fichiers) {
    let data;
    try {
      const contenu = readFileSync(`${DOSSIER_DATA}/${fichier}`, 'utf-8');
      data = JSON.parse(contenu);
    } catch (error) {
      console.error(`⚠️ ${fichier} ignoré : JSON invalide (${error.message})`);
      continue;
    }

    if (!data.publisher || !Array.isArray(data.books)) {
      console.error(`⚠️ ${fichier} ignoré : "publisher" ou "books" manquant/invalide.`);
      continue;
    }

    for (const livre of data.books) {
      const manquants = champsManquants(livre);
      if (manquants.length > 0) {
        console.error(
          `⚠️ Livre ignoré dans ${fichier} ("${livre.title ?? 'sans titre'}") : ` +
          `champ(s) manquant(s) [${manquants.join(', ')}]`
        );
        continue;
      }

      tousLesLivres.push({
        ...livre,
        publisher: data.publisher,
        fediverse_id: data.fediverse_id ?? null,
      });
    }
  }

  return tousLesLivres;
}

function lireLivresPublies() {
  if (!existsSync(FICHIER_PUBLIES)) {
    return { books: [] };
  }
  try {
    const contenu = readFileSync(FICHIER_PUBLIES, 'utf-8');
    const data = JSON.parse(contenu);
    return { books: Array.isArray(data.books) ? data.books : [] };
  } catch (error) {
    console.error(`⚠️ ${FICHIER_PUBLIES} illisible, il sera recréé (${error.message})`);
    return { books: [] };
  }
}

function ecrireLivrePublie(livre) {
  const published = lireLivresPublies();
  published.books.push({
    title: livre.title,
    publisher: livre.publisher,
    date: new Date().toISOString(),
  });
  writeFileSync(FICHIER_PUBLIES, JSON.stringify(published, null, 2));
}

function estDejaPublie(livre, livresPublies) {
  return livresPublies.some(
    p => p.title === livre.title && p.publisher === livre.publisher
  );
}

function choisirLivre(livresRestants, livresPublies) {
  const dernierePublicationParEditeur = new Map();
  for (const p of livresPublies) {
    const date = new Date(p.date).getTime();
    const actuel = dernierePublicationParEditeur.get(p.publisher) ?? -Infinity;
    if (date > actuel) {
      dernierePublicationParEditeur.set(p.publisher, date);
    }
  }

  const livresParEditeur = new Map();
  for (const livre of livresRestants) {
    if (!livresParEditeur.has(livre.publisher)) {
      livresParEditeur.set(livre.publisher, []);
    }
    livresParEditeur.get(livre.publisher).push(livre);
  }

  const editeursTries = [...livresParEditeur.keys()].sort((a, b) => {
    const dateA = dernierePublicationParEditeur.get(a) ?? -Infinity;
    const dateB = dernierePublicationParEditeur.get(b) ?? -Infinity;
    return dateA - dateB;
  });

  const editeurChoisi = editeursTries[0];
  const livresDeLEditeur = livresParEditeur.get(editeurChoisi);

  return livresDeLEditeur[Math.floor(Math.random() * livresDeLEditeur.length)];
}

function nettoyerHashtag(texte) {
  return texte
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]/g, '');
}

function formaterPost(livre) {
  const { title, author, author_fediverse_id, year, price, description, url, publisher, fediverse_id } = livre;

  const auteurStr = author_fediverse_id ? `${author} (${author_fediverse_id})` : author;
  const editeurStr = fediverse_id ? `${publisher} ( ${fediverse_id} )` : publisher;
  const publisherTag = `#${nettoyerHashtag(publisher)}`;
  const hashtags = [...HASHTAGS_FIXES, publisherTag].join(' ');

  const entete = `📚 ${title} — ${auteurStr} (${year})\n${editeurStr} | ${price}\n\n`;
  const pied = `\n\n🔗 ${url}\n\n${hashtags}`;

  const longueurFixe = entete.length + pied.length;
  const placeRestante = LIMITE_CARACTERES - longueurFixe;

  let descriptionFinale = description ?? '';
  if (descriptionFinale.length > placeRestante) {
    const coupe = descriptionFinale.slice(0, Math.max(placeRestante - 1, 0));
    const dernierEspace = coupe.lastIndexOf(' ');
    descriptionFinale = `${coupe.slice(0, dernierEspace > 0 ? dernierEspace : coupe.length)}…`;
  }

  return `${entete}${descriptionFinale}${pied}`.trim();
}

async function publierLivre() {
  if (!DRY_RUN && (!process.env.MASTODON_ACCESS_TOKEN || !process.env.MASTODON_BASE_URL)) {
    throw new Error('❌ Les variables MASTODON_ACCESS_TOKEN et MASTODON_BASE_URL sont requises.');
  }

  const livres = lireLivres();
  if (livres.length === 0) {
    throw new Error('❌ Aucun livre valide trouvé dans le dossier data/.');
  }

  const livresPublies = lireLivresPublies().books;
  let livresRestants = livres.filter(livre => !estDejaPublie(livre, livresPublies));

  let historiquePourSelection = livresPublies;
  if (livresRestants.length === 0) {
    console.log('⚠️ Tous les livres ont déjà été publiés. Réinitialisation de la liste.');
    if (!DRY_RUN) {
      writeFileSync(FICHIER_PUBLIES, JSON.stringify({ books: [] }, null, 2));
    }
    livresRestants = livres;
    historiquePourSelection = [];
  }

  const livreChoisi = choisirLivre(livresRestants, historiquePourSelection);
  const post = formaterPost(livreChoisi);

  if (post.length > LIMITE_CARACTERES) {
    console.warn(`⚠️ Le post dépasse ${LIMITE_CARACTERES} caractères (${post.length}) malgré la troncature.`);
  }

  if (DRY_RUN) {
    console.log('🧪 Mode dry-run : rien n\'est publié ni écrit sur disque.\n');
    console.log('--- Aperçu du post ---');
    console.log(post);
    console.log('----------------------');
    console.log(`Longueur : ${post.length}/${LIMITE_CARACTERES} caractères`);
    return;
  }

  const client = createRestAPIClient({
    url: process.env.MASTODON_BASE_URL,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });

  await client.v1.statuses.create({ status: post });
  ecrireLivrePublie(livreChoisi);

  console.log('✅ Post publié avec succès :', livreChoisi.title);
  console.log('📌 Éditeur :', livreChoisi.publisher);
  console.log('💰 Prix :', livreChoisi.price);
}

publierLivre().catch(error => {
  console.error('❌ Erreur fatale :', error.message ?? error);
  process.exit(1);
});