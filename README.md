# mon-projet-docker — stack multi-conteneurs

Dépôt : https://github.com/Chokapyke/Exam-docker-Zhou

Petite application (notes) qui sert de support à une stack Docker complète : **frontend** (Vite / Nginx) → **backend** (Node.js/Express) → **base PostgreSQL**.

```
 Navigateur ──► :8080 ──► frontend ──/api──► backend ──► db (PostgreSQL)
                          └──── front_net ────┘└── back_net (internal) ──┘
```

| Service  | Image | Réseaux | Rôle |
|----------|-------|---------|------|
| frontend | build local (Vite en dev, Nginx en prod, **non-root**) | `front_net` | Point d'entrée unique + reverse proxy `/api` |
| backend  | build local (Node 22, **non-root**) | `front_net`, `back_net` | API REST |
| db       | `postgres:16-alpine` (Docker Hub) | `back_net` **seul** (`internal: true`) | Données (volume `db_data`) |

## Prérequis
Docker Engine ≥ 24 avec Compose v2 et Buildx. Pas besoin de Node en local.

## 1. Installation (une seule fois)
```bash
git clone https://github.com/Chokapyke/Exam-docker-Zhou.git mon-projet-docker && cd mon-projet-docker
./scripts/init.sh        # Linux / macOS / Git Bash : crée .env et secrets/db_password.txt (mot de passe aléatoire)
```
**Windows (PowerShell)** : `./scripts/init.sh` ne fonctionne pas, utilisez `./scripts/init.ps1` (ou `powershell -ExecutionPolicy Bypass -File scripts/init.ps1` si l'exécution de scripts est bloquée).

Équivalent manuel : `cp .env.example .env && cp secrets/db_password.txt.example secrets/db_password.txt`.

## 2. Mode DEV
```bash
docker compose up -d --build
```
`compose.override.yaml` est chargé automatiquement : targets `development`, Vite (HMR) sur http://localhost:8080 (point d'entrée unique, `/api` est proxifié vers le backend), code monté en volume (rechargement automatique), images taguées `:dev`.

## 3. Mode « prod locale »
```bash
docker compose down
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```
Targets `production` : Nginx sert le build statique et proxifie `/api`, backend minimal en lecture seule, `no-new-privileges`. Accès : http://localhost:8080.

## 4. Vérifier que tout fonctionne
```bash
docker compose ps                                  # tous les services "healthy"
curl -s http://localhost:8080/api/health           # {"status":"ok","db":"up"} => backend <-> DB OK
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"content":"hello"}' http://localhost:8080/api/notes
curl -s http://localhost:8080/api/notes
curl -i http://localhost:8080/healthz              # prod uniquement : 200 "ok"
```
Ou ouvrez http://localhost:8080 : le statut affiche « OK (db: up) » et le formulaire permet d'ajouter des notes.

**Vérifier l'isolation réseau** :
```bash
docker compose ps db                               # aucun port publié
docker network ls                                  # front_net et back_net
docker network inspect mon-projet-docker_back_net           # contient backend + db, "Internal": true
docker compose exec frontend wget -qO- -T 3 http://db:5432 || echo "frontend ne voit pas la DB (attendu)"
```

## 5. Prouver la persistance
```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"content":"je persiste"}' http://localhost:8080/api/notes
docker compose down            # SANS -v : supprime les conteneurs, pas le volume
docker compose up -d           # (en prod locale, ajouter les -f ... comme plus haut)
curl -s http://localhost:8080/api/notes   # la note est toujours là
docker volume ls | grep db_data
```
`docker compose down -v` supprime le volume (remise à zéro volontaire).

## 6. Build multi-architecture (amd64 + arm64)
Les images de base (`node:22-alpine`, `nginx-unprivileged`, `postgres:16-alpine`) sont multi-arch et aucune dépendance native n'est compilée.
```bash
docker buildx create --use --name multiarch 2>/dev/null || docker buildx use multiarch
docker buildx build --platform linux/amd64,linux/arm64 --target production \
  -t ghcr.io/chokapyke/exam-docker-zhou/backend:1.0.0 ./backend
docker buildx build --platform linux/amd64,linux/arm64 --target production \
  -t ghcr.io/chokapyke/exam-docker-zhou/frontend:1.0.0 ./frontend
# ajouter --push pour publier le manifest multi-arch (--load ne supporte qu'une seule archi)
```
Sur une machine x86, l'arm64 est émulé via QEMU : `docker run --privileged --rm tonistiigi/binfmt --install all`.
Vérification : `docker buildx imagetools inspect ghcr.io/chokapyke/exam-docker-zhou/backend:1.0.0`.

## 7. Registry (GHCR) et versioning
Stratégie **SemVer** déclenchée par un tag Git :

| Tag Git | Tags d'image publiés |
|---------|----------------------|
| `v1.2.3` | `1.2.3`, `1.2`, `sha-<commit>` |

- `X.Y.Z` : version immuable ; `X.Y` : dernier patch de la branche mineure ; `sha-…` : traçabilité exacte du commit.
- Le `TAG` du `.env` choisit la version utilisée par Compose.

Publication manuelle :
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u chokapyke --password-stdin
# puis les commandes buildx ci-dessus avec --push
```
Publication automatique : `git tag v1.0.0 && git push --tags` → `.github/workflows/publish.yml` construit en multi-arch, pousse sur GHCR avec provenance + SBOM.

## 8. Secrets
- Le mot de passe DB est dans `secrets/db_password.txt` (**ignoré par Git** ; seul `db_password.txt.example` est versionné).
- Compose le monte en `/run/secrets/db_password` ; Postgres le lit via `POSTGRES_PASSWORD_FILE`, le backend via `DB_PASSWORD_FILE`.
- `.env` ne contient que de la configuration non sensible. Aucun secret dans les images ni dans Git.

## 9. Choix techniques
- **Multi-stage + cache** : `package*.json` copié avant le code et cache mount npm, donc réinstallation uniquement si les dépendances changent. Prod sans devDependencies.
- **Non-root** : utilisateur `node` (backend), `nginx` (frontend), `postgres` (image officielle).
- **Healthchecks** sur les 3 services + `depends_on: condition: service_healthy` (db → backend → frontend).
- **.dockerignore** par service (node_modules, .env, secrets, .git…).
- **Lockfiles** : le Dockerfile utilise `npm ci` si `package-lock.json` existe, sinon `npm install`. Pour des builds reproductibles : `npm install` dans `backend/` et `frontend/`, puis committez les `package-lock.json`.

## 10. Bonus : scan Trivy
```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest \
  image --severity HIGH,CRITICAL ghcr.io/chokapyke/exam-docker-zhou/backend:1.0.0
```
La CI génère aussi provenance et SBOM (`provenance: true`, `sbom: true`), inspectables avec `docker buildx imagetools inspect <image>`.

## 10 bis. Équivalents Windows (PowerShell)
Dans PowerShell, `curl` est un alias de `Invoke-WebRequest` : utilisez `Invoke-RestMethod` (ou `curl.exe`).
```powershell
Invoke-RestMethod http://localhost:8080/api/health                       # status ok / db up
Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/notes `
  -ContentType 'application/json' -Body '{"content":"hello"}'
Invoke-RestMethod http://localhost:8080/api/notes
curl.exe -i http://localhost:8080/healthz                                # prod uniquement
```
Persistance : mêmes étapes que la section 5 (`docker compose down` sans `-v`, puis `up -d`, puis `Invoke-RestMethod .../api/notes`).

## 11. Troubleshooting
| Symptôme | Diagnostic / solution |
|----------|-----------------------|
| `secrets/db_password.txt: no such file` ou `superuser password is not specified` | Secret absent ou vide : lancer `./scripts/init.sh` (ou `init.ps1` sous Windows), puis `docker compose down -v` et relancer. |
| `port is already allocated` | Changer `HTTP_PORT` dans `.env`. |
| Service `unhealthy` / `dependency failed to start` | `docker compose ps` puis `docker compose logs db backend`. |
| `password authentication failed` | Le volume a été initialisé avec un ancien mot de passe : `docker compose down -v` puis relancer. |
| 502 / page blanche en prod | `docker compose logs frontend backend` ; vérifier que `backend` est `healthy`. |
| `exec format error` | Image construite pour une autre architecture : rebuild avec le bon `--platform`. |
| Hot reload inactif (Mac/Windows) | `VITE_POLLING=true` est déjà activé dans `compose.override.yaml`. |

## Structure
```
mon-projet-docker/
├── backend/   (Dockerfile, src/, package.json, .dockerignore)
├── frontend/  (Dockerfile, nginx/default.conf, src/, index.html, vite.config.js, .dockerignore)
├── compose.yaml · compose.override.yaml (dev) · compose.prod.yaml (prod locale)
├── .env.example · .gitignore · secrets/db_password.txt.example
├── scripts/init.sh · scripts/init.ps1 · .github/workflows/publish.yml
└── README.md
```
