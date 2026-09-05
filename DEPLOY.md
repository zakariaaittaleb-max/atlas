# Déploiement sur Vercel

## Option 1 : Via GitHub (recommandé)

### Étape 1 : Créer un repo GitHub
```bash
git remote add origin https://github.com/votre-username/atlas.git
git branch -M main
git push -u origin main
```

### Étape 2 : Connecter à Vercel
1. Allez sur [vercel.com](https://vercel.com)
2. Cliquez sur **New Project**
3. Sélectionnez **Import Git Repository**
4. Connectez votre compte GitHub
5. Sélectionnez le repo `atlas`
6. Cliquez sur **Import**

### Étape 3 : Configurer les variables d'environnement
Dans la page du projet Vercel, allez à **Settings → Environment Variables** et ajoutez :

```
SUPABASE_URL          = votre_url_supabase
SUPABASE_ANON_KEY    = votre_clé_anon
SUPABASE_SERVICE_ROLE_KEY = votre_clé_service_role (build only)
NEXT_PUBLIC_SUPABASE_URL = votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY = votre_clé_anon
```

### Étape 4 : Déployer
Vercel déploie automatiquement à chaque push sur `main`.

---

## Option 2 : Via CLI (déploiement direct)

```bash
# 1. Installer/authentifier Vercel CLI
npm i -g vercel
vercel login

# 2. Déployer
cd /path/to/atlas
vercel

# 3. Suivre les prompts :
#    - Project name : atlas (ou votre nom)
#    - Directory : . (courant)
#    - Build : Yes
#    - Output : Yes (accepter .next)

# 4. Ajouter les variables d'environnement (depuis le CLI ou le dashboard)
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# etc.

# 5. Redéployer
vercel --prod
```

---

## Configuration

Vercel lit `vercel.json` qui configure :
- **buildCommand** : `npm run build`
- **outputDirectory** : `.next`
- **devCommand** : `npm run dev`
- **regions** : `cdg1` (Paris) — changer si besoin
- **functions** : timeout de 60s pour les API routes

---

## Variables d'environnement critiques

| Variable | Nécessaire | Visibilité |
|----------|-----------|-----------|
| `SUPABASE_URL` | Oui | Public (NEXT_PUBLIC_) |
| `SUPABASE_ANON_KEY` | Oui | Public (NEXT_PUBLIC_) |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Secret (build only) |
| `NODE_ENV` | Auto | `production` en prod |

⚠️ **Important** : La `SERVICE_ROLE_KEY` doit être **Build-only** (pas exposée au navigateur).

---

## Vérification post-déploiement

Après le déploiement :

1. **Allez à votre URL Vercel** (ex. `https://atlas.vercel.app`)
2. **Testez les pages** :
   - `/login` — connexion
   - `/facilitateur` — page d'accueil facilitateur
   - `/equipe` — page d'accueil équipe
3. **Vérifiez les logs** : Dashboard Vercel → Deployments → Logs

---

## Troubleshooting

### Le build échoue avec une erreur Google Fonts
**Cause** : Vercel n'a pas pu télécharger les fonts Google.
**Solution** : Vercel devrait pouvoir atteindre `fonts.googleapis.com`. Si ça persiste, considérez self-hosting les fonts.

### Les requêtes API échouent
**Cause** : Les variables d'environnement Supabase manquent ou sont mal nommées.
**Solution** : Vérifiez dans Settings → Environment Variables que toutes les clés sont présentes.

### La page est blanche
**Cause** : Erreur JavaScript ou problème de chargement.
**Solution** : Ouvrez DevTools (F12) et vérifiez la console. Vérifiez les Logs de Vercel.

---

## Mise à jour après déploiement

Après avoir déployé une fois :

```bash
# Récupérer la config depuis Vercel
vercel pull

# Déployer une nouvelle version
git push origin main
# (Vercel redéploie automatiquement via GitHub)

# Ou manuellement :
vercel --prod
```

---

## Domaine personnalisé

Dans **Settings → Domains** du projet Vercel :
1. Cliquez sur **Add Domain**
2. Entrez votre domaine (ex. `atlas.example.com`)
3. Suivez les instructions DNS (ajouter records CNAME ou A)

---

## Support

- **Vercel Docs** : https://vercel.com/docs
- **Next.js Docs** : https://nextjs.org/docs
- **Problèmes de build** : Vérifiez les logs dans Vercel Dashboard
