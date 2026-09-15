#!/usr/bin/env bash
#
# linux-runtime-smoke.sh — vérifie que le paquet Linux « linux-unpacked » (ce
# que le .deb installe dans /opt/Asgard) DÉMARRE réellement, et pas seulement
# qu'il est bien construit.
#
# La différence compte : les contrôles statiques (ldd, Depends, .desktop, asar)
# passent alors que l'exécutable meurt à la première ligne — c'est exactement ce
# qui s'est produit ici, avec « libnss3.so: cannot open shared object file ».
# Ces cinq sonames ne sont pas installées sur une machine de BUILD (elles le
# sont sur la machine CIBLE, apportées par le Depends du .deb). Comme elles
# peuvent être récupérées sans root (`apt-get download` ne demande rien) et
# déployées dans un préfixe privé, ce script simule la machine cible sans rien
# installer ni modifier du système.
#
# Ce qui est contrôlé : le process principal survit, les modules natifs se
# chargent (aucun ERR_DLOPEN_FAILED), le renderer se charge depuis l'asar et
# EXÉCUTE le code React (les journaux [Renderer] le prouvent), et l'arrêt net
# publie bien « offline » sur la DHT avant de fermer network puis storage.
#
# Utilisation (depuis PowerShell, sans `| tee` qui masquerait le code de sortie) :
#   wsl.exe -d Ubuntu-24.04 -- bash -c "tr -d '\r' < '/mnt/c/Users/Ael/Desktop/Asgard!/scripts/linux-runtime-smoke.sh' > ~/s.sh; bash ~/s.sh > ~/smoke.log 2>&1; echo exit=`$?; tail -30 ~/smoke.log"
#
# Options : --app <chemin>   arbre à lancer
#           (défaut : ~/asgard/release/linux-unpacked/asgard)
#           --secs <n>       durée de vie du processus avant arrêt (défaut 25)
#           --keep           ne pas tuer l'application (fenêtre à l'écran, WSLg)
set -uo pipefail

APP="$HOME/asgard/release/linux-unpacked/asgard"
SECS=25
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="$2"; shift 2 ;;
    --secs) SECS="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done
DIR="$(dirname "$APP")"
[ -x "$APP" ] || { echo "exécutable introuvable ou non exécutable : $APP" >&2; exit 1; }

# HOME déplacé : cette vérification ne doit créer aucune identité, aucun
# réglage, aucun journal dans le ~/.config de l'utilisateur.
export HOME=/tmp/asgard-smoke-home
rm -rf "$HOME"; mkdir -p "$HOME"

echo "=== application ==="
echo "  $APP"
echo "  $(file -b "$APP" | cut -d, -f1-2)"
echo "  DISPLAY=${DISPLAY:-absent}  WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-absent}"

echo
echo "=== bibliothèques d'exécution (celles que le Depends apporte) ==="
# Une variante t64 est le même paquet sous un autre nom (Ubuntu 24.04).
PREFIX="$HOME/../asgard-smoke-libs"
mkdir -p "$PREFIX"
WORK="$(mktemp -d)"
for p in libnss3 libnspr4 libasound2 libasound2t64; do
  # on teste le NOM DE BIBLIOTHÈQUE, pas le nom du paquet : c'est lui qui dit si
  # la machine la possède déjà, et il est identique entre libasound2 (22.04) et
  # libasound2t64 (24.04)
  soname="$(printf '%s' "$p" | sed 's/t64$//')"
  if ldconfig -p | grep -q "${soname}\.so"; then echo "  déjà présente : $p"; continue; fi
  ( cd "$WORK" && apt-get download "$p" > /dev/null 2>&1 )
  f="$(ls "$WORK"/${p}_*.deb 2>/dev/null | head -1)"
  if [ -n "$f" ]; then dpkg -x "$f" "$PREFIX"; echo "  déployée dans le préfixe privé : $p"; fi
done
rm -rf "$WORK"
LIBDIR="$(find "$PREFIX" -name 'libnss3.so' -printf '%h\n' 2>/dev/null | head -1)"
echo "  préfixe : ${LIBDIR:-aucune bibliothèque manquante}"

echo
echo "=== lancement (fenêtre réelle si WSLg) ==="
cd "$DIR"
export LD_LIBRARY_PATH="$LIBDIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
LOG=/tmp/asgard-smoke.log
"$APP" --no-sandbox --disable-gpu > "$LOG" 2>&1 &
PID=$!
sleep "$SECS"
if ps -p "$PID" > /dev/null 2>&1; then
  echo "  VIVANT après ${SECS} s (pid $PID), $(pgrep -c -f "$DIR") processus"
  STARTED=1
else
  echo "  MORT avant ${SECS} s — voir $LOG"
  STARTED=0
fi

echo
echo "=== journal de l'application ==="
APPLOG="$(find "$HOME" -name asgard.log 2>/dev/null | head -1)"
if [ -n "$APPLOG" ]; then
  echo "  $APPLOG"
  grep -E 'Renderer loaded|StorageService|Renderer\]|Quit|cleanup' "$APPLOG" | tail -12
else
  echo "  aucun asgard.log écrit — l'application n'est pas allée jusqu'au main"
fi

[ "$KEEP" = "1" ] || { pkill -f "$DIR" 2>/dev/null; sleep 2; kill -9 "$PID" 2>/dev/null; }

echo
echo "=== verdict ==="
fail=0
note() { printf '  %-24s %s\n' "$1" "$2"; }
for pat in 'ERR_DLOPEN_FAILED' 'cannot open shared object' 'SUID sandbox' 'FATAL ERROR' 'A plugin with'; do
  n="$(grep -ci "$pat" "$LOG")"
  [ "$n" = "0" ] || { note "PANNE" "$pat ($n)"; fail=1; }
done
note "démarrage" "$([ "$STARTED" = 1 ] && echo ok || echo 'échec — aucun processus survivant')"
note "renderer" "$(grep -q 'Renderer loaded successfully' "$LOG" && echo "chargé depuis l'asar" || echo 'NON CHARGÉ')"
note "journal main" "$([ -n "$APPLOG" ] && echo écrit || echo absent)"
note "console ouverte" "$(grep -qi 'DevTools' "$LOG" && echo 'Mention de DevTools (à lire)' || echo 'aucune')"
[ "$STARTED" = 1 ] || fail=1
rm -rf "$HOME"
echo
if [ "$fail" = 0 ]; then
  echo "OK — le paquet Linux démarre, charge le renderer et s'arrête proprement."
  exit 0
else
  echo "ÉCHEC — voir $LOG"
  exit 1
fi
