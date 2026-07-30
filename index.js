import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { createRestAPIClient } from 'masto';

const client = createRestAPIClient({
  url: process.env.MASTODON_BASE_URL,
  accessToken: process.env.MASTODON_ACCESS_TOKEN,
});

function lireLivres() {
  const dossierData = './data';
  const fichiers = readdirSync(dossierData).filter(f => f.endsWith('.json'));
  let tousLesLivres = [];

  for (const fichier of fichiers) {
    try {
      const contenu = readFileSync(`${dossierData}/${fichier}`, 'utf-8');
      const data = JSON.parse(contenu);
      const livresAvecEditeur = data.books.map(livre => ({
        ...livre,
        publisher: data.publisher,
        fediverse_id: data.fediverse_id
      }));
      tousLesLivres = [...tousLesLivres, ...livresAvecEditeur];
    } catch (error) {
      console.error(`⚠️ Erreur lors de la lecture de ${fichier}:`, error.message);
    }
  }

  return tousLesLivres;
}

function lireLivresPublies() {
  try {
    if (!existsSync('./published.json')) {
      return { books: [] };
    }
    const contenu = readFileSync('./published.json', 'utf-8');
    return JSON.parse(contenu);
  } catch (error) {
    return { books: [] };
  }
}

function ecrireLivrePublie(livre) {
  const published = lireLivresPublies();
  published.books.push({
    title: livre.title,
    publisher: livre.publisher,
    date: new Date().toISOString()
  });
  writeFileSync('./published.json', JSON.stringify(published, null, 2));
}

function formaterPost(livre) {
  const { title, author, author_fediverse_id, year, price, description, url, publisher, fediverse_id } = livre;

  const auteurStr = author_fediverse_id ? `${author} (${author_fediverse_id})` : author;
  let post = `📚 ${title} — ${auteurStr} (${year})\n`;

  const editeurStr = fediverse_id ? `${publisher} ( ${fediverse_id} )` : publisher;
  post += `${editeurStr} | ${price}\n\n`;

  if (description) {
    post += `${description}\n\n`;
  }

  post += `🔗 ${url}`;

  const publisherTag = publisher.replace(/\s+/g, '').replace(/[^\w]/g, '');
  post += `\n\n#Livre #Lecture #EditionsIndépendantes`;

  return post;
}

async function publierLivre() {
  if (!process.env.MASTODON_ACCESS_TOKEN || !process.env.MASTODON_BASE_URL) {
    throw new Error('❌ Les variables MASTODON_ACCESS_TOKEN et MASTODON_BASE_URL sont requises.');
  }
  
  const livres = lireLivres();
  if (livres.length === 0) {
    throw new Error('❌ Aucun livre trouvé dans le dossier data/');
  }

  const livresPublies = lireLivresPublies().books;
  let livresRestants = livres.filter(livre =>
    !livresPublies.some(p => p.title === livre.title && p.publisher === livre.publisher)
  );

  if (livresRestants.length === 0) {
    console.log('⚠️ Tous les livres ont déjà été publiés. Réinitialisation de la liste.');
    writeFileSync('./published.json', JSON.stringify({ books: [] }, null, 2));
    livresRestants = lireLivres();
  }

  const livreAleatoire = livresRestants[Math.floor(Math.random() * livresRestants.length)];
  const post = formaterPost(livreAleatoire);

  await client.v1.statuses.create({
    status: post,
  });

  ecrireLivrePublie(livreAleatoire);

  console.log('✅ Post publié avec succès :', livreAleatoire.title);
  console.log('📌 Éditeur :', livreAleatoire.publisher);
  console.log('💰 Prix :', livreAleatoire.price);
}

publierLivre().catch(error => {
  console.error('❌ Erreur fatale :', error);
  process.exit(1);
});