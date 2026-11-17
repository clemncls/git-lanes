# git-lanes

Un graphe Git lisible dans le terminal : branches parallèles en colonnes,
jonctions visibles et commits récents en haut. Sans dépendance d’exécution.

La vue par défaut affiche les noms des branches et replie les commits
intermédiaires. `-d` ajoute les hashes, les messages de commits et les tags.

## Installation

Prérequis : Git accessible dans le `PATH`, Node.js 22 ou supérieur et un terminal
capable d’afficher les caractères Unicode.

Le paquet s’installe directement depuis GitHub ; aucune publication npm n’est
nécessaire.

```bash
pnpm add -D @clemncls/git-lanes@github:clemncls/git-lanes#v0.1.1
pnpm exec git-lanes
```

Pour l’exécuter depuis les sources :

```bash
git clone https://github.com/clemncls/git-lanes.git
cd votre-autre-depot
node /chemin/vers/git-lanes/bin/git-lanes.mjs
```

Le graphe porte sur le dépôt du répertoire courant.

## Utilisation

```bash
git-lanes                    # Vue simplifiée, 30 nœuds au maximum
git-lanes -n 15              # Limiter à 15 nœuds
git-lanes -d -n 50           # Afficher les détails de 50 commits
git-lanes --color always     # Forcer les couleurs, même en redirection
git-lanes --color never      # Désactiver les couleurs
git-lanes --help
```

Après une installation locale, préfixer ces commandes par `pnpm exec`.
Pour intégrer une commande au projet :

```json
{
  "scripts": {
    "git:graph": "git-lanes"
  }
}
```

Puis utiliser `pnpm -s git:graph`. Le `-s` de pnpm masque son préambule ; celui
placé après `git:graph` sélectionne explicitement la vue simplifiée.

| Option | Effet |
| --- | --- |
| `-s`, `--simplified` | Vue simplifiée, sélectionnée par défaut |
| `-d`, `--detailed` | Ajouter hashes, messages et tags |
| `-n`, `--max-count` | Limite de nœuds, 30 par défaut, maximum 10 000 ; limite de commits en mode détaillé |
| `--color` | `auto`, `always` ou `never` |
| `-h`, `--help` | Afficher l’aide |

## Lecture du graphe

Chaque branche active conserve sa colonne jusqu’à sa jonction. Les noms
s’alignent à droite du graphe ; les noms longs passent à la ligne.

- `◉` et le badge `HEAD` repèrent la position courante.
- `●` repère une branche, `○` un ancêtre commun et `◆` une jonction ou une fusion.
- `≡` regroupe des références pointant sur le même commit.
- `├`, `┤` et les coudes arrondis matérialisent les connexions.
- `┆` indique un croisement de lignes sans jonction.
- `┊` prolonge une ascendance située hors de la limite affichée.

Les branches locales et distantes sont incluses. Les références symboliques
comme `origin/HEAD` sont regroupées avec leur cible ; les références internes,
comme les checkpoints d’outils, ne servent pas de points de départ.

La vue simplifiée décrit l’ascendance entre les positions de branches : Git peut
replier des commits et réécrire leurs liens. Le mode détaillé conserve les parents
réels des commits. Les couleurs sont automatiques, désactivées en redirection ou
avec `NO_COLOR`, sauf demande explicite `--color always`.

## Développement

```bash
npm test
npm run verify:package
```

Les tests créent des dépôts temporaires et couvrent les branches parallèles,
les fusions multiples, le tri récent vers ancien, les limites, les couleurs,
les noms longs, les dépôts vides, les métadonnées hostiles et les limites de
ressources. Aucune installation de dépendances requise.

La seconde commande fabrique l’archive, l’installe dans un répertoire temporaire
et relance les tests du CLI et de sécurité contre le paquet installé.

Le CLI dans `bin/` orchestre trois modules : lecture Git, rendu et traitement du
terminal dans `src/`. Le rendu est une fonction pure ; les tests de lecture Git
contrôlent aussi les arguments et les limites de chaque processus.

La CI couvre Linux et Windows avec Node.js 22 et 24. Consulter
[SECURITY.md](SECURITY.md) pour le modèle de confiance, les budgets de ressources
et le compte rendu de revue, et [CHANGELOG.md](CHANGELOG.md) pour les versions.

Références visuelles : [git-graph](https://github.com/git-bahn/git-graph) et
[Serie](https://github.com/lusingander/serie). Le moteur de rendu est implémenté
ici en JavaScript, sans dépendre de ces outils ni d’un protocole d’images.

## Licence

MIT — voir [LICENSE](LICENSE).
