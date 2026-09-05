# Pousser le projet sur GitHub

Tout le code est prêt. Exécutez ces commandes pour créer le repo GitHub et pousser :

## Étape 1 : Créer le repo GitHub

### Option A : Via GitHub Web (recommandé)
1. Allez sur [github.com/new](https://github.com/new)
2. Repo name: `atlas`
3. Description: `Atlas — business strategy simulator`
4. **Private** ou **Public** (votre choix)
5. **Ne cochez pas** "Initialize with README" (on le pousse déjà)
6. Cliquez **Create Repository**

### Option B : Via GitHub CLI
```bash
gh auth login  # Une fois si vous n'êtes pas logué
gh repo create atlas --public --source=. --remote=origin --push
```

## Étape 2 : Ajouter la remote et pousser

Si vous avez créé via le web, exécutez ceci :

```bash
cd /Users/zakaria/iCloud\ Drive\ \(Archive\)/Desktop/CoWork/atlas

# Ajouter la remote (remplacez USERNAME)
git remote add origin https://github.com/USERNAME/atlas.git
git branch -M main

# Pousser
git push -u origin main
```

## Vérification

```bash
# Vérifier que la remote est là
git remote -v

# Vérifier l'historique
git log --oneline | head -5

# Vérifier le statut
git status
```

## Après le push

Une fois le push réussi :

1. **Vérifiez sur GitHub** : allez à `github.com/USERNAME/atlas`
   - Vous devriez voir 20+ commits
   - 187 fichiers
   - Branches : `main` + `ux/pilotage-par-das`

2. **Connectez à Vercel** :
   - Aller sur vercel.com
   - New Project → Import Git Repository
   - Sélectionnez `atlas`
   - Vercel crée une URL `atlas-xxxxxxx.vercel.app`

3. **Configurez les variables d'environnement** :
   - Dans Vercel Settings → Environment Variables
   - Ajouter : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## État du repo

```
Branche active: main
Dernier commit: aa69e62 - Synchronise main avec les changements de la branche feature

Contenu:
  ✅ 187 fichiers tracés
  ✅ 2.9M répo compressé
  ✅ 431 tests passants
  ✅ 0 erreurs ESLint
  ✅ Configuration Vercel (vercel.json)
  ✅ Guide de déploiement (DEPLOY.md)

Prêt à être déployé ! 🚀
```

---

## Troubleshooting

### "fatal: 'origin' already exists"
```bash
git remote remove origin
git remote add origin https://github.com/USERNAME/atlas.git
```

### "fatal: authentication failed"
Assurez-vous que :
- Vous êtes logué : `gh auth login`
- Votre token est valide : `gh auth status`
- HTTPS est configuré (pas SSH si vous n'avez pas de clé)

### "fatal: The current branch main has no upstream"
```bash
git push -u origin main
```
Le `-u` configure le tracking automatique pour les push futurs.

---

Une fois le push sur GitHub fait, venez me dire et je configurerai le déploiement Vercel final ! 🎯
