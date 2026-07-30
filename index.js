import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { Mastodon } from 'mastodon-api';
import fetch from 'node-fetch';


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

async function uploaderImage(url, client) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Impossible de télécharger l'image: ${response.statusText}`);
    }
    const buffer = await response.buffer();
    const base64Image = buffer.toString('base64');
    const uploadResponse = await client.post('media', {
      file: base64Image,
      description: `Couverture du livre: ${url}`
    });

    return uploadResponse.data.id;
  } catch (error) {
    console.error(`⚠️ Erreur lors de l'upload de l'image ${url}:`, error.message);
    return null;
  }
}

async function publierLivre() {
  const accessToken = process.env.MASTODON_ACCESS_TOKEN;
  const baseUrl = process.env.MASTODON_BASE_URL;

  if (!accessToken || !baseUrl) {
    throw new Error('❌ Les variables MASTODON_ACCESS_TOKEN et MASTODON_BASE_URL sont requises.');
  }
  const livres = lireLivres();
  if (livres.length === 0) {
    throw new Error('❌ Aucun livre trouvé dans le dossier data/');
  }
  const livresPublies = lireLivresPublies().books;
  const livresRestants = livres.filter(livre =>
    !livresPublies.some(p => p.title === livre.title && p.publisher === livre.publisher)
  );

  if (livresRestants.length === 0) {
    console.log('⚠️ Tous les livres ont déjà été publiés. Réinitialisation de la liste.');
    writeFileSync('./published.json', JSON.stringify({ books: [] }, null, 2));
    const nouveauxLivresRestants = livres.filter(livre =>
      !lireLivresPublies().books.some(p => p.title === livre.title && p.publisher === livre.publisher)
    );
    if (nouveauxLivresRestants.length === 0) {
      throw new Error('❌ Aucun livre disponible à publier.');
    }
    livresRestants.push(...nouveauxLivresRestants);
  }
  const livreAleatoire = livresRestants[Math.floor(Math.random() * livresRestants.length)];
  const post = formaterPost(livreAleatoire);
  const client = new Mastodon({
    access_token: accessToken,
    api_url: baseUrl + '/api/v1/',
  });

  try {
    let mediaId = null;
    if (livreAleatoire.cover_url) {
      mediaId = await uploaderImage(livreAleatoire.cover_url, client);
    }

    const postData = { status: post };
    if (mediaId) {
      postData.media_ids = [mediaId];
    }
    await client.post('statuses', postData);

    ecrireLivrePublie(livreAleatoire);

    console.log('✅ Post publié avec succès :', livreAleatoire.title);
    console.log('📌 Éditeur :', livreAleatoire.publisher);
    console.log('💰 Prix :', livreAleatoire.price);
    if (mediaId) {
      console.log('🖼️ Image uploadée avec succès.');
    }
  } catch (error) {
    console.error('❌ Erreur lors de la publication :', error.message);
    throw error;
  }
}

publierLivre().catch(error => {
  console.error('❌ Erreur fatale :', error);
  process.exit(1);
});