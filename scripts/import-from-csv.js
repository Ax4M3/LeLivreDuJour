import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import csv from 'csv-parser';
import { validateEditor } from '../data/schema.js';

const editorName = process.argv[2];
const filePath = process.argv[3];

if (!editorName || !filePath) {
  console.error("Usage: node scripts/import-from-csv.js <editor-name> <csv-file>");
  process.exit(1);
}

if (!existsSync('./data/editors')) {
  mkdirSync('./data/editors', { recursive: true });
}

if (filePath.endsWith('.csv')) {
  const results = [];
  readFileSync(filePath, 'utf-8')
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      const editor = {
        publisher: editorName,
        books: results.map(row => ({
          title: row.title || row.Titre || row['Titre du livre'],
          author: row.author || row.Auteur || row['Auteur·e'] || "Auteur·e inconnu·e",
          year: row.year || row.Année || row['Année de parution'],
          price: row.price || row.Prix || row['Prix public'] || "Prix inconnu",
          url: row.url || row.URL || row['Lien'],
          description: row.description || row.Description || row['Résumé'],
        })),
      };
      try {
        const editorValide = validateEditor(editor);
        writeFileSync(
          `./data/editors/${editorName.toLowerCase().replace(/\s+/g, '-')}.json`,
          JSON.stringify(editorValide, null, 2)
        );
        console.log(`✅ Importé ${results.length} livres pour ${editorName}`);
      } catch (error) {
        console.error(`❌ Erreur de validation pour ${editorName}:`, error.message);
        process.exit(1);
      }
    })
    .on('error', (error) => {
      console.error(`❌ Erreur lors de la lecture du CSV:`, error.message);
      process.exit(1);
    });
} else {
  console.error("❌ Seuls les fichiers CSV sont supportés pour l'instant");
  process.exit(1);
}