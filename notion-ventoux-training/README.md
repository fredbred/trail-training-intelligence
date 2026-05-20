# Notion Ventoux Training

Projet local TypeScript pour créer un dashboard Notion d'entraînement pour le Grand Raid Ventoux 2027 / Ultra Géant de Provence.

Le script ne hardcode aucun secret, ne logge pas le token Notion, ne supprime jamais de contenu Notion existant et peut générer une version locale Markdown/CSV sans contacter Notion.

## Installation

```bash
npm install
```

## Créer une intégration Notion

1. Ouvrir [Notion Developers](https://www.notion.so/profile/integrations).
2. Créer une nouvelle intégration interne.
3. Donner au minimum les capacités de lecture, insertion et mise à jour de contenu.
4. Copier le secret d'intégration dans `.env` comme `NOTION_TOKEN`.

## Partager une page parent

1. Dans Notion, créer ou choisir une page parent vide.
2. Ouvrir le menu `...` en haut à droite.
3. Choisir `Add connections`.
4. Sélectionner l'intégration créée.

## Récupérer le `page_id`

1. Ouvrir la page parent dans Notion.
2. Utiliser `Share` puis copier le lien.
3. L'identifiant de page est la longue chaîne de caractères dans l'URL.
4. Les tirets sont acceptés ou non ; le script transmet la valeur telle quelle à Notion.

## Configurer `.env`

Créer un fichier `.env` local non committé, puis remplir :

```dotenv
NOTION_TOKEN=<votre_token_notion>
NOTION_PARENT_PAGE_ID=...
NOTION_VERSION=2026-03-11
```

Ne committez jamais `.env`. Il est ignoré par `.gitignore`.

## Dry-run local

```bash
npm run dry-run
```

Génère dans `output/` :

- `dashboard.md`
- `plan_entrainement.csv`
- `bilan_semaine.csv`
- `phases_ventoux_2027.csv`
- `bibliotheque_seances.csv`
- `regles.csv`
- `manifest.preview.json`

Cette commande ne contacte pas Notion.

## Créer la structure Notion

```bash
npm run create-notion
```

La commande :

1. vérifie `NOTION_TOKEN` et `NOTION_PARENT_PAGE_ID` ;
2. crée la page racine `Grand Raid Ventoux 2027` ;
3. ajoute le contenu dashboard dans cette page ;
4. crée les 5 bases Notion sous cette page ;
5. ajoute une vue calendrier hebdomadaire `Calendrier semaine` sur la base `Plan entraînement` ;
6. insère les lignes initiales ;
7. écrit `output/notion_manifest.json` avec les IDs, URLs et vue créée.

Option équivalente dry-run :

```bash
npm run create-notion -- --dry-run
```

## Relancer sans dupliquer

Si `output/notion_manifest.json` existe déjà, `npm run create-notion` s'arrête pour éviter de créer un doublon.

Pour créer explicitement une nouvelle structure :

```bash
npm run create-notion -- --force
```

Le script ne supprime jamais les anciennes pages Notion. Si une création échoue en cours de route, il écrit `output/notion_manifest.partial.json` avec les IDs déjà obtenus.

## Build et tests

```bash
npm run build
npm test
```

Les tests vérifient notamment :

- exactement une propriété `title` par base ;
- les options `select` des seeds ;
- les dates du plan ;
- l'absence de token dans les fichiers dry-run.

## Erreurs Notion utiles

- `401` : token invalide ou expiré ; vérifier `NOTION_TOKEN`.
- `403` : intégration sans capacité suffisante ou page parent non partagée avec l'intégration.
- `404` : page parent introuvable ou inaccessible.
- `429` : rate limit Notion ; relancer plus tard.

## Limites

L'API crée les bases, schémas, lignes et contenu de page. Les vues Notion avancées, filtres, tris et layouts peuvent devoir être ajustés manuellement dans l'interface Notion.

Le script crée tout de même une vue calendrier hebdomadaire simple sur `Plan entraînement`, basée sur la propriété `Date`, avec les détails utiles visibles sur les cartes : type, durée, D+, intensité, priorité, statut et notes.
