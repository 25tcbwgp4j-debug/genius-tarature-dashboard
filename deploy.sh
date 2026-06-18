#!/usr/bin/env bash
# Script di deploy SICURO per Tarature Dashboard
# Usa VERCEL_PROJECT_ID + VERCEL_ORG_ID per forzare il progetto corretto,
# evitando che Vercel risalga nella directory tree e usi la root .vercel invalida.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Deploy Tarature Dashboard da: $SCRIPT_DIR"

# ID progetto Tarature Dashboard su Vercel
TARATURE_PROJECT_ID="prj_YGDvHDTsgf5tsJyzUEA9DITkqnrc"
TARATURE_ORG_ID="team_4Huien3Mr5ywrdLti9SvO41c"

# Verifica che il .vercel locale punti al progetto giusto
LOCAL_PROJECT_ID=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/.vercel/project.json'))['projectId'])" 2>/dev/null || echo "")
if [ -n "$LOCAL_PROJECT_ID" ] && [ "$LOCAL_PROJECT_ID" != "$TARATURE_PROJECT_ID" ]; then
  echo "ERRORE: .vercel/project.json locale punta a progetto sbagliato: $LOCAL_PROJECT_ID"
  echo "Atteso: $TARATURE_PROJECT_ID (tarature-dashboard)"
  exit 1
fi

# Sblocca temporaneamente la root .vercel/project.json se esiste ed è immutabile
ROOT_VERCEL="/Users/christianavantifiori/Desktop/CLAUDE-CODE/.vercel/project.json"
ROOT_VERCEL_CONTENT=""
NEED_RELOCK=false
if [ -f "$ROOT_VERCEL" ]; then
  ROOT_VERCEL_CONTENT=$(cat "$ROOT_VERCEL")
  if ls -lO "$ROOT_VERCEL" 2>/dev/null | grep -q "uchg"; then
    chflags nouchg "$ROOT_VERCEL"
    NEED_RELOCK=true
  fi
fi

cleanup() {
  # Ripristina root .vercel/project.json
  if [ -n "$ROOT_VERCEL_CONTENT" ] && [ -f "$ROOT_VERCEL" ]; then
    echo "$ROOT_VERCEL_CONTENT" > "$ROOT_VERCEL"
  fi
  if [ "$NEED_RELOCK" = "true" ] && [ -f "$ROOT_VERCEL" ]; then
    chflags uchg "$ROOT_VERCEL"
    echo "Root .vercel/project.json ripristinato e ribloccato"
  fi
}
trap cleanup EXIT

cd "$SCRIPT_DIR"

# Forza il progetto corretto via env var (bypassa lettura .vercel parent)
VERCEL_PROJECT_ID="$TARATURE_PROJECT_ID" \
VERCEL_ORG_ID="$TARATURE_ORG_ID" \
npx vercel --prod --yes

echo "Deploy Tarature completato."
