const lafabriqueExcluded = new Set([
  'category', 'type', 'writer', 'my-account', 'cart',
  'rencontre', 'privacy-policy', 'wp-content', 'collab-la-fabrique',
]);

export const SOURCES = [
  {
    file: 'aux-forges-de-vulcain.json',
    discovery: {
      type: 'listing',
      url: 'https://auxforgesdevulcain.fr/rayon/nouveautes',
      linkPattern: /^https:\/\/auxforgesdevulcain\.fr\/a\//,
    },
  },
  {
    file: 'la-fabrique.json',
    discovery: {
      type: 'listing',
      url: 'https://lafabrique.fr/category/nouveautes/',
      requiresImg: true,
      linkPattern: {
        test(url) {
          const match = url.match(/^https:\/\/lafabrique\.fr\/([a-z0-9-]+)\/?$/i);
          return !!match && !lafabriqueExcluded.has(match[1].toLowerCase());
        },
      },
    },
  },
];