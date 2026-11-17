# Sécurité

## Signaler un problème

Utiliser le [signalement privé GitHub](https://github.com/clemncls/git-lanes/security/advisories/new)
pour une vulnérabilité. Éviter les issues publiques contenant des données sensibles.
Les correctifs sont publiés dans la dernière version de la série `0.1.x`.

## Périmètre de confiance

Le CLI lit le dépôt courant et affiche du texte. Il n’effectue ni écriture Git,
ni requête réseau, ni installation. Node.js, le programme `git` accessible dans
le `PATH`, le système et l’environnement d’exécution doivent être fiables et
maintenus à jour. L’outil ne constitue pas un bac à sable pour un exécutable Git
ou une machine compromis.

Les messages de commits, noms de références et messages d’erreur sont traités
comme des données non fiables : séquences ANSI/OSC retirées, contrôles et
séparateurs de ligne neutralisés, contrôles bidirectionnels/invisibles exposés
sous forme de `\uXXXX`. Les couleurs proviennent uniquement du moteur de rendu.
Cette protection ne détecte pas tous les homographes Unicode ni les différences
de largeur propres à chaque police de terminal.

Git est lancé avec une liste d’arguments, sans shell, sans pager, sans notes et
sans vérification de signature. Le suivi de fichiers et les verrous optionnels
sont désactivés. Les révisions sont des identifiants de commits validés, transmis
sur stdin ; les tags d’objets non commit ne sont pas parcourus.
Voir les contrats de [Git log](https://git-scm.com/docs/git-log) et de
[Node.js child_process](https://nodejs.org/api/child_process.html).

## Limites de ressources

| Ressource | Limite |
| --- | --- |
| Requête Git | 15 secondes par processus |
| Sortie d’un processus Git | 8 Mio par flux |
| Nœuds demandés avec `-n` | 10 000, avec 30 par défaut |
| Références lues | 10 000 |
| Champ affiché | 4 096 caractères, avec ellipse si tronqué |
| Métadonnées affichables cumulées | 1 000 000 de caractères |
| Canvas de graphe | 250 000 cellules |
| Largeur de terminal retenue | 40 à 240 colonnes |

Une requête dépassant les budgets produit une erreur contrôlée, sans trace
interne. Ces limites bornent le travail du CLI ; elles ne remplacent pas les
limites mémoire et CPU du système. Une configuration Git invalide peut toujours
empêcher la lecture d’un dépôt et sera signalée.

## Revue du 17 novembre 2026

Périmètre : code source, configuration du paquet, archive installable, appels
Git, sorties terminal et réglages GitHub. Il s’agit d’une revue avec tests de
régression, pas d’une certification ni d’un audit de Git ou de Node.js.

| Constat de la version 0.1.0 | Résolution en 0.1.1 |
| --- | --- |
| Erreurs d’arguments affichées sans filtrage terminal | Filtrage de tous les chemins de sortie d’erreur |
| Contrôles bidirectionnels conservés dans les noms et messages | Représentation visible des contrôles Unicode |
| Pas de délai Git, de maximum de nœuds ni de budget de rendu | Limites explicites et erreurs contrôlées |
| Arrêt d’un pipe en aval provoquant une trace `EPIPE` | Sortie silencieuse et réussie |
| Regroupement des références par recherches imbriquées | Indexation des références par commit et nom de branche |

Aucun appel au shell ni dépendance d’exécution n’a été identifié dans le paquet.
Le contrôle GitHub a indiqué la détection de secrets et la protection des pushes
actives, sans alerte renvoyée à cette date. Cela ne garantit pas l’absence de
secrets ou de vulnérabilités non détectés.

La CI exécute les tests sur Linux et Windows avec Node.js 22 et 24. Les actions
sont fixées par SHA, le jeton est limité à la lecture du contenu et les
identifiants de checkout ne sont pas conservés.
