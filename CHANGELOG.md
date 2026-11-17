# Changelog

## 0.1.1 — 2026-11-17

- Séparation du CLI, de la lecture Git, du rendu et du traitement du terminal.
- Filtrage des sorties d’erreur et des contrôles de terminal ; représentation
  visible des contrôles Unicode bidirectionnels et invisibles.
- Délais et budgets explicites pour Git, les références, les métadonnées et le graphe.
- Arguments Git fixes et révisions validées sur stdin, sans shell, notes,
  pager, suivi de fichiers ni vérification de signature.
- Lecture des tags pointant sur un objet non commit ignorée sans faire échouer le graphe.
- Regroupement des références par index ; correction des couleurs lors de la réutilisation des colonnes.
- Retour à la ligne tenant compte des caractères larges et des graphèmes combinés.
- Fermeture d’un pipe en aval gérée sans trace `EPIPE`.
- Tests de sécurité, tests de rendu sans Git et CI Linux/Windows sur Node.js 22/24.
- Politique et compte rendu de revue dans [SECURITY.md](SECURITY.md).

## 0.1.0 — 2026-11-17

- Première version : graphe terminal à colonnes persistantes, vue simplifiée
  par défaut, détails avec `-d`, limite configurable avec `-n`.
