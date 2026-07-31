import { z } from 'zod';

export const BookSchema = z.object({
  title: z.string().min(1, "Le titre est obligatoire"),
  author: z.string().min(1, "L'auteur·e est obligatoire"),
  year: z.union([
    z.number().int().positive(),
    z.string().regex(/^\d{4}$/, "L'année doit être un nombre à 4 chiffres")
  ]).optional(),
  price: z.string()
    .regex(/^\d{1,3}(,\d{2})? €$/, "Le prix doit être au format 'XX,XX €' ou 'X €'")
    .transform(price => price.replace(' ', '')),
  description: z.string().max(1000, "La description est trop longue (max 1000 caractères)").optional(),
  url: z.string().url("L'URL doit être valide"),
  isNew: z.boolean().optional().default(false),
  imageUrl: z.string().url().optional(),
});

export const EditorSchema = z.object({
  publisher: z.string().min(1, "Le nom de l'éditeur est obligatoire"),
  fediverse_id: z.string()
    .regex(/^@[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+$/, "Fediverse ID invalide (ex: @Editeur@mastodon.social)")
    .optional(),
  website: z.string().url().optional(),
  books: z.array(BookSchema),
});

export function validateEditor(data) {
  return EditorSchema.parse(data);
}