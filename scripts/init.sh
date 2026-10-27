#!/bin/sh
# Prépare .env et le secret local (sans jamais les écraser s'ils existent)
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || { cp .env.example .env; echo "✔ .env créé"; }
if [ ! -f secrets/db_password.txt ]; then
  (openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n') | tr -d '\n' > secrets/db_password.txt
  chmod 644 secrets/db_password.txt   # lisible par l'utilisateur non-root du conteneur
  echo "✔ secrets/db_password.txt généré"
fi
