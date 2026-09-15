#!/usr/bin/env bash
#
# build-linux-wsl.sh — produit les paquets Linux depuis WSL, à partir du dépôt
# tel qu'il est sur Windows.
#
# Pourquoi WSL et pas Windows : les modules natifs de la stack Holepunch
# (sodium-native, udx-native, rocksdb-native, simdle-native, quickbit-native,
# fs-native-extensions, rabin-native) sont compilés pour la plateforme HÔTE.
# Une arborescence installée sous Windows ne donne qu'un paquet Linux dont
# l'application plante au démarrage sur un `ERR_DLOPEN_FAILED`. electron-builder
# refuse d'ailleurs .deb/.AppImage/.pacman hors Linux.
#
# Côté macOS : rien de tout cela ne fonctionne — `.dmg` exige hdiutil et la
# signature exige codesign, tous deux absents de Linux comme de Windows. C'est
# le workflow GitHub Actions (.github/workflows/build-mac.yml) qui s'en charge.
#
# Utilisation (depuis PowerShell) — le log s'écrit HORS de l'arbre de build,
# jamais dans /tmp ni dans <dest> :
#   · /tmp est un tmpfs : la VM WSL le vide au moindre arrêt, ce qui a déjà
#     effacé la trace d'un build de 25 minutes ;
#   · <dest>/build.log serait supprimé par le `rsync --delete` de l'étape 2,
#     et tee continuerait d'écrire dans l'inode orphelin : plus rien de visible.
#
#   wsl.exe -d Ubuntu-24.04 -- bash -c "tr -d '\r' < '/mnt/c/Users/Ael/Desktop/Asgard!/scripts/build-linux-wsl.sh' > ~/b.sh; bash ~/b.sh --arch both > ~/build-linux.log 2>&1; echo exit=`$?; tail -30 ~/build-linux.log"
#
# Pas de `| tee` : dans un pipeline, bash renvoie le code de la DERNIÈRE
# commande — donc celui de tee, toujours 0 — et un build mort à la ligne 180
# serait annoncé comme réussi. Redirection simple, puis `tail` sur le log. (Le
# backtick avant `$?` protège la variable de PowerShell, qui la développerait
# avant même de lancer wsl.exe.)
#
# tr -d '\r' est indispensable : SearchReplace écrit en CRLF sous Windows et
# bash refuse une ligne qui finit par \r.
#
# Options :
#   --from <chemin>   dépôt Windows à copier (défaut : /mnt/c/Users/Ael/Desktop/Asgard!)
#   --dest <chemin>   répertoire de build Linux    (défaut : ~/asgard)
#   --arch <a>        x64, arm64 ou both           (défaut : x64)
#   --target <nom>    un seul format : deb, AppImage, tar.gz, pacman…
#                     (défaut : tous ceux de package.json → build long)
#   --no-copy-back    ne pas rapporter les artefacts sous <from>/release/linux
#   --skip-install    ne pas relancer npm install
#   -h, --help
set -euo pipefail

FROM="/mnt/c/Users/Ael/Desktop/Asgard!"
DEST="$HOME/asgard"
ARCH="x64"
COPY_BACK=1
SKIP_INSTALL=0
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --arch) ARCH="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --no-copy-back) COPY_BACK=0; shift ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h|--help) sed -n '2,37p' "$0"; exit 0 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

# Horodate de debut : sert a ne rapporter QUE ce que cette execution a produit.
# Le repertoire de build garde les formats d'avant, et sans ce filtre, la copie
# vers Windows melangerait un .deb de la veille et un .deb du jour — pareil a
# livrer par accident.
START_TS="$(date +%s)"

# Le `!` final du chemin Windows est littéral ; rsync et bash le traitent bien
# tant qu'on ne développe pas d'history (cas d'un script non interactif).
[ -d "$FROM" ] || { echo "dépôt introuvable : $FROM" >&2; exit 1; }
SRC="${FROM%/}/"

echo "=== 1/6 environnement ==="
for t in node npm git python3 make gcc; do
  command -v "$t" >/dev/null || { echo "outil manquant : $t (sudo apt-get install -y build-essential python3 nodejs npm)" >&2; exit 1; }
done
echo "node $(node -v) — npm $(npm -v) — $(uname -m) — $(. /etc/os-release && echo "$PRETTY_NAME")"
case "$FROM" in
  /mnt/*) echo "source sur disque Windows (lent) : copié une fois, puis tout se passe dans $DEST" ;;
esac

echo
echo "=== 2/6 copie du dépôt vers $DEST ==="
mkdir -p "$DEST"
# node_modules/dist/release exclus : le node_modules de Windows contient des
# .win32-x64-*.node qui empoisonneraient le build Linux, et release/ contient
# l'installeur Windows — on ne touche à rien des deux côtés.
rsync -a --delete \
  --exclude '/node_modules' \
  --exclude '/dist' \
  --exclude '/release' \
  --exclude '/.git' \
  --exclude '/app-log.txt' \
  --exclude '/crash-log.txt' \
  --exclude '/build-output.txt' \
  --exclude '/lint-output.txt' \
  --exclude '/stdout-log.txt' \
  "$SRC" "$DEST/"
cd "$DEST"
echo "copie faite : $(find . -path ./node_modules -prune -o -type f -print | wc -l) fichiers hors node_modules"
grep -q '"devTools": *devToolsAllowed\|devTools: devToolsAllowed' electron/main.ts \
  && echo "garde DevTools présente dans la source copiée" \
  || echo "ATTENTION : la source copiée ne contient pas la garde DevTools"

echo
echo "=== 3/6 dépendances npm (recompilation des modules natifs pour Linux) ==="
if [ "$SKIP_INSTALL" = "0" ]; then
  npm install --no-audit --no-fund 2>&1 | tail -5
else
  echo "ignoré (--skip-install)"
fi
[ -d node_modules/sodium-native ] || { echo "node_modules incomplet : relancer sans --skip-install" >&2; exit 1; }

echo
echo "=== 4/6 icônes puis build de l'application ==="
npm run build:icons
npm run build

echo
echo "=== 5/6 vérification des invariants avant empaquetage ==="
node scripts/check-devtools.mjs
node scripts/check-presence-invariants.mjs
node scripts/check-quit-teardown.mjs
node scripts/check-i18n-labels.mjs

echo
echo "=== 6/6 electron-builder --linux ==="
case "$ARCH" in
  x64|arm64) ARCHS=("$ARCH") ;;
  both) ARCHS=(x64 arm64) ;;
  *) echo "--arch vaut x64, arm64 ou both" >&2; exit 2 ;;
esac
# --publish never : sans jeton GitHub, electron-builder tenterait de créer une
# release et échouerait APRÈS un build pourtant réussi.
#
# Electron-builder 24.13 n'applique le filtre d'architecture QUE lorsqu'une
# cible est nommée sur la ligne de commande : `--linux deb --x64` ne produit
# que le .deb amd64, alors que `--linux --x64` rebâtit TOUTES les architectures
# déclarées dans package.json (linux.target[].arch). Boucler sur les
# architectures sans cibler un format reviendrait donc à faire deux fois le
# même travail complet — vérifié sur ce dépôt : une seule invocation a produit
# les 7 paquets (2 AppImage, 2 deb, 2 tar.gz, 1 pacman).
if [ -z "$TARGET" ]; then
  if [ "$ARCH" != "both" ]; then
    echo "note : sans --target, les architectures bâties sont celles de"
    echo "       package.json (linux.target[].arch) ; --arch n'y change rien."
    echo "       Une architecture unique exige un format : --target deb --arch x64"
  fi
  npx electron-builder --linux --publish never
else
  for a in "${ARCHS[@]}"; do
    echo "--- $TARGET / $a"
    # la cible se passe en argument positionnel après la plateforme
    # (`--linux deb`), pas en option `--deb` : electron-builder ignore cette
    # dernière forme et rebâtirait tous les formats de package.json
    npx electron-builder --linux "$TARGET" --"$a" --publish never
  done
fi

echo
echo "=== artefacts produits par cette exécution ==="
find release -maxdepth 1 -type f -newermt "@$START_TS" \
  \( -name '*.AppImage' -o -name '*.deb' -o -name '*.tar.gz' -o -name '*.pacman' \) \
  -printf '%10s  %p\n' | sort -k2

echo
echo "=== contrôle du paquet (mêmes exigences que pour l'exe Windows) ==="
if [ -f release/linux-unpacked/resources/app.asar ]; then
  node scripts/verify-build-labels.mjs --asar release/linux-unpacked/resources/app.asar
else
  echo "release/linux-unpacked/resources/app.asar absent — vérifier le log ci-dessus" >&2
  exit 1
fi

echo
echo "=== bibliothèques partagées du paquet x64 ==="
# Un .node qui ne résout pas sa libc est la panne classique d'un paquet Linux
# construit sur une glibc différente : l'application ne démarre pas du tout, et
# le fichier pèse 200 Mo qui n'accusent rien.
#
# Avertissement et non blocage : une machine de construction N'INSTALLE PAS les
# bibliothèques d'exécution. Les cinq sonames qui manquent ici (libnss3,
# libnssutil3, libsmime3, libnspr4, libasound.so.2) sont exactement celles que
# le Depends du .deb apporte sur la machine cible. Ce qui serait bloquant, ce
# serait un GLIBC_* plus récent que celui de la cible : c'est le chiffre affiché
# sous cette boucle qui doit rester bas.
NODE_COUNT=0
MISSING_LIBS=0
for bin in release/linux-unpacked/asgard $(find release/linux-unpacked/resources/app.asar.unpacked -name '*.node' 2>/dev/null); do
  [ "$(basename "$bin")" = "asgard" ] || NODE_COUNT=$((NODE_COUNT + 1))
  nf="$(ldd "$bin" 2>/dev/null | grep 'not found' || true)"
  if [ -n "$nf" ]; then
    MISSING_LIBS=$((MISSING_LIBS + 1))
    echo "  ⚠ ${bin#release/linux-unpacked/} : $(echo "$nf" | awk '/not found/{printf "%s ", $1}')"
  fi
done
echo "  $NODE_COUNT modules natifs vérifiés, $MISSING_LIBS avec bibliothèque non résolue sur CETTE machine"
# Le `|| true` n'est pas un déguisement : `find -exec objdump` sort en code 1
# dès qu UN fichier lui résiste, et avec `set -euo pipefail` cette valeur tue le
# pipeline, puis le script entier — la copie des artefacts vers Windows et le
# contrôle du Depends ne s'exécutaient jamais, sans que le code de sortie final
# le dise (masqué par le `| tee` de l'appelant).
MAXGLIBC="$(find release/linux-unpacked/resources/app.asar.unpacked -name '*.node' -exec objdump -T {} + 2>/dev/null | grep -o 'GLIBC_[0-9.]*' | sed 's/GLIBC_//' | sort -V | tail -1 || true)"
echo "  GLIBC maximale réclamée par les modules natifs : ${MAXGLIBC:-inconnue} — la machine cible doit être au moins cette version"
echo "  (glibc du hôte de build : $(ldd --version | head -1 | awk '{print $NF}'))"

if [ "$COPY_BACK" = "1" ]; then
  OUT="${SRC}release/linux"
  mkdir -p "$OUT"
  echo
  echo "=== rapport des artefacts vers $OUT ==="
  find release -maxdepth 1 -type f -newermt "@$START_TS" \
    \( -name '*.AppImage' -o -name '*.deb' -o -name '*.tar.gz' -o -name '*.pacman' \) \
    -exec cp -f {} "$OUT/" \;
  ls -l "$OUT" | awk 'NR>1 {printf "%10s  %s\n", $5, $9}'
  echo
  NEW_DEB="$(find "$OUT" -maxdepth 1 -name '*.deb' -newermt "@$START_TS" | head -1)"
  if [ -n "$NEW_DEB" ]; then
    echo "dépendances déclarées de $(basename "$NEW_DEB") :"
    dpkg-deb -f "$NEW_DEB" Depends
    echo
    echo "résolution de ces dépendances sur $(. /etc/os-release && echo $VERSION_ID) :"
    # Une alternative « a | b » est satisfaite dès qu'UN seul des deux noms
    # existe : tester le premier seulement afficherait « (none) » pour
    # libasound2 alors que libasound2t64 est parfaitement résolvable.
    dpkg-deb -f "$NEW_DEB" Depends | tr ',' '\n' | sed 's/^ *//; s/ *$//' | sort -u | while read -r dep; do
      [ -n "$dep" ] || continue
      hit=""
      for p in $dep; do
        [ "$p" = "|" ] && continue
        c="$(apt-cache policy "$p" 2>/dev/null | awk '/Candidate:/{print $2}')"
        if [ -n "$c" ] && [ "$c" != "(none)" ]; then hit="$p ($c)"; break; fi
      done
      if [ -n "$hit" ]; then printf '  ✓ %-46s %s\n' "$dep" "$hit"
      else printf '  ✗ %-46s AUCUN CANDIDAT dans les dépôts\n' "$dep"; fi
    done
  else
    echo "aucun .deb produit par cette exécution — dépendances non contrôlées" >&2
  fi
fi

echo
echo "Terminé. Les paquets sont dans ${SRC}release/linux"
