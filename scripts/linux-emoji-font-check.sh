#!/usr/bin/env bash
#
# linux-emoji-font-check.sh — les émojis de contenu sont-ils DESSINÉS dans le
# paquet Linux, sur une machine qui n'a aucune police émoji ?
#
# Complement de linux-runtime-smoke.sh : celui-ci prouve que le paquet démarre.
# Celui-ci prouve que la police de repli embarquée (assets/fonts, sous-ensemble
# OpenMoji produit par scripts/build-emoji-font.py) fait son travail devant
# l'utilisateur. La sonde emoji-font-check.cjs demande au moteur de rendu de
# tracer chaque glyphe dans un canvas et compte les pixels chromatiques ; un
# glyphe non couvert ne peut pas sortir en couleur, puisque le système n'a AUCUNE
# police émoji — condition contrôlée en étape 1, sans quoi le test serait vide.
#
# Comme pour la sonde de démarrage, les bibliothèques d'exécution d'Electron sont
# déployées dans un préfixe privé (`apt-get download` + `dpkg -x`, sans root) : la
# machine de build WSL ne les a pas, la machine cible les reçoit du Depends du
# .deb. HOME est isolé sous /tmp : aucun profil, aucun journal ne touche le ~/.
#
# Prérequis : un build Linux déjà produit (scripts/build-linux-wsl.sh), qui laisse
# release/linux-unpacked et node_modules/ sous ~/asgard.
#
# Utilisation (depuis PowerShell, sans `| tee` qui masquerait le code de sortie) :
#   wsl.exe -d Ubuntu-24.04 -- bash -c "tr -d '\r' < '/mnt/c/Users/Ael/Desktop/Asgard!/scripts/linux-emoji-font-check.sh' > ~/f.sh; bash ~/f.sh > ~/fontcheck.log 2>&1; echo exit=`$?; tail -22 ~/fontcheck.log"
#
# tr -d '\r' est indispensable : SearchReplace écrit en CRLF sous Windows et bash
# refuse une ligne qui finit par \r.
#
# Ne pas se fier au `echo exit=$?` de cette ligne : vu depuis PowerShell après une
# redirection, il renvoie 0 même quand le script sort en 1 (vérifié avec un chemin
# volontairement faux). La ligne « code de sortie : N » du log fait foi, ainsi que
# le verdict OK / ÉCHEC.
set -uo pipefail

SRC="$HOME/asgard"
UNPACKED="$SRC/release/linux-unpacked"
ELECTRON="$SRC/node_modules/electron/dist/electron"
while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2 ;;
    --app) UNPACKED="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done
[ -d "$UNPACKED" ] || { echo "arbre dépaqueté introuvable : $UNPACKED (lancer build-linux-wsl.sh)" >&2; exit 1; }
[ -x "$ELECTRON" ] || { echo "électron introuvable : $ELECTRON" >&2; exit 1; }

export HOME=/tmp/asgard-fontcheck-home
rm -rf "$HOME"; mkdir -p "$HOME"

echo "=== condition du test : aucune police émoji sur la machine ==="
NB_EMOJI="$(fc-list | grep -ci emoji || true)"
echo "  polices émoji installées : $NB_EMOJI"
if [ "$NB_EMOJI" != "0" ]; then
  echo "  AVERTISSEMENT : ce système a une police émoji, le test ne prouverait plus"
  echo "    que la couleur vient de la police embarquée (il pourrait venir du système)."
fi

echo
echo "=== bibliothèques d'exécution d'Electron (préfixe privé, sans root) ==="
PREFIX="$HOME/../asgard-fontcheck-libs"
mkdir -p "$PREFIX"
WORK="$(mktemp -d)"
for p in libnss3 libnspr4 libasound2 libasound2t64; do
  soname="$(printf '%s' "$p" | sed 's/t64$//')"
  if ldconfig -p | grep -q "${soname}\.so"; then echo "  déjà présente : $p"; continue; fi
  ( cd "$WORK" && apt-get download "$p" > /dev/null 2>&1 )
  f="$(ls "$WORK"/${p}_*.deb 2>/dev/null | head -1)"
  if [ -n "$f" ]; then dpkg -x "$f" "$PREFIX"; echo "  déployée dans le préfixe privé : $p"; fi
done
rm -rf "$WORK"
LIBDIR="$(find "$PREFIX" -name 'libnss3.so' -printf '%h\n' 2>/dev/null | head -1)"
echo "  préfixe : ${LIBDIR:-aucune bibliothèque manquante}"
export LD_LIBRARY_PATH="$LIBDIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

echo
echo "=== rendu, par le moteur du paquet ==="
cd "$SRC"
"$ELECTRON" scripts/emoji-font-check.cjs "$UNPACKED" --no-sandbox --disable-gpu 2>&1 |
  grep -v -E '^\[.*(WARNING|GPU stall|dbus)' | grep -v 'libGL error'
CODE="${PIPESTATUS[0]}"

echo
echo "code de sortie : $CODE"
rm -rf "$HOME"
exit "$CODE"
