import { readdirSync, readFileSync } from 'fs';
import { validateEditor } from '../data/schema.js';

const dossier = './data/editors';
const fichiers = readdirSync(dossier).filter(f => f.endsWith('.json'));
let erreurs = 0;

for (const fichier of fichiers) {
  try {
    const contenu = readFileSync(`${dossier}/${fichier}`, 'utf-8');
    const data = JSON.parse(contenu);
    validateEditor(data);
    console.log(`✅ ${fichier} est valide`);
  } catch (error) {
    console.error(`❌ ${fichier} est INVALIDE: ${error.message}`);
    erreurs++;
  }
}

if (erreur === 0) {
  console.log("✨ Tous les fichiers sont valides !");
  process.exit(0);
} else {
  console.error(`❌ ${erreur} fichiers invalides`);
  process.exit(1);
}