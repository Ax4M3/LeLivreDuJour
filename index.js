import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { createRestAPIClient } from 'masto';
import fetch from 'node-fetch';

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
  const { title, author, year, price, description, url, publisher, fediverse_id } = livre;

  const emojis = {
    "La Fabrique éditions": "🏭",
    "Les Éditions sociales": "✊",
    "Éditions Burn out": "🔥"
  };

  const emojiEditeur = emojis[publisher] || "📚";

  let post = `${emojiEditeur} *${title}* (${year})\n`;
  post += `✍️ ${author}\n`;
  post += `💰 ${price}\n`;
  post += `🏢 ${publisher} ${fediverse_id ? `(${fediverse_id})` : ''}\n\n`;
  post += `${description}\n\n`;
  post += `🔗 ${url}`;

  const publisherTag = publisher.replace(/\s+/g, '').replace(/[^\w]/g, '');
  post += `\n\n#Livre #Lecture #${publisherTag} #EditionsIndépendantes`;

  return post;
}

async function uploaderImage(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Impossible de télécharger l'image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    
    const attachment = await client.v2.media.create({
      file: new Blob([arrayBuffer], { type: 'image/jpeg' }),
      description: `Couverture du livre`
    });

    return attachment.id;
  } catch (error) {
    console.error(`⚠️ Erreur lors de l'upload de l'image ${imageUrl}:`, error.message);
    return null;
  }
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

  let mediaId = null;
  if (livreAleatoire.cover_url) {
    mediaId = await uploaderImage(livreAleatoire.cover_url);
  }

  await client.v1.statuses.create({
    status: post,
    mediaIds: mediaId ? [mediaId] : undefined,
  });

  ecrireLivrePublie(livreAleatoire);

  console.log('✅ Post publié avec succès :', livreAleatoire.title);
  console.log('📌 Éditeur :', livreAleatoire.publisher);
  console.log('💰 Prix :', livreAleatoire.price);
  if (mediaId) {
    console.log('🖼️ Image uploadée avec succès.');
  }
}

publierLivre().catch(error => {
  console.error('❌ Erreur fatale :', error);
  process.exit(1);
});