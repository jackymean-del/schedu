# SmartSched — GitHub Sync Setup Guide

## The Problem (and why it happens)
Claude's sandbox resets between sessions — the project folder disappears.
The sandbox also has no GitHub credentials, so it can't push directly.

## The Permanent Solution (one-time setup, ~10 minutes)

### STEP 1: Install Git on your computer
- **Windows**: Download from https://git-scm.com/download/windows
- **Mac**: Run `git --version` in Terminal — it auto-prompts to install
- **Already have it?** Skip to Step 2

### STEP 2: Create a GitHub Personal Access Token
1. Go to: https://github.com/settings/tokens/new
2. Note (name): `smartsched`
3. Expiration: `No expiration` (or 1 year)
4. Scopes: tick `repo` (full control)
5. Click **Generate token**
6. COPY the token — it starts with `ghp_...` — you only see it once!

### STEP 3: One-time push from your computer
1. Download `smart-sched-git.bundle` from this Claude chat
2. Put it in a folder (e.g. your Desktop)
3. Open Terminal / Git Bash in that folder
4. Run these commands:

```bash
# Clone from the bundle
git clone smart-sched-git.bundle smart-sched
cd smart-sched

# Point to GitHub
git remote set-url origin https://github.com/jackymean-del/smart-sched.git

# Push (will ask for username + token)
git push -u origin main
```
When asked:
- **Username**: `jackymean-del`
- **Password**: paste your `ghp_...` token

**That's it.** Your files are now on GitHub.

---

## After setup — how future sessions work

Every time Claude makes changes:
1. Claude updates the files and creates a new `.bundle`
2. You download the new bundle
3. You run ONE command in your `smart-sched` folder:

```bash
# Mac/Linux
bash ~/Desktop/push.sh

# Windows
push.bat

# Or manually
git pull /path/to/new-bundle main
git push origin main
```

---

## Even better: Store token so you never type it again

```bash
# Run once — saves token permanently
git config --global credential.helper store
git push  # enter credentials once, never again
```

On Mac use the keychain helper instead:
```bash
git config --global credential.helper osxkeychain
```

---

## Vercel Auto-Deploy (zero extra work)
Once your repo is on GitHub:
1. Go to https://vercel.com → New Project
2. Import `jackymean-del/smart-sched`
3. Set Root Directory: `frontend`
4. Click Deploy

Every future `git push` auto-deploys the frontend. No extra steps.

---

## GitHub Secrets for CI/CD
In your GitHub repo → Settings → Secrets → Actions, add:
- `VERCEL_TOKEN` — from https://vercel.com/account/tokens
- `VERCEL_ORG_ID` — from Vercel project settings
- `VERCEL_PROJECT_ID` — from Vercel project settings

Once set, the GitHub Action in `.github/workflows/ci.yml` handles
everything automatically on every push.
