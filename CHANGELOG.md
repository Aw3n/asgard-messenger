# Changelog

Toutes les modifications notables d'Asgard sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
projet utilise le [versionnement sémantique](https://semver.org/lang/fr/).
Chaque entrée référence le commit qui la porte.

Aucun tag n'a été posé sur ce dépôt : les plages de version ci-dessous sont
déduites de l'historique, la 1.0.1 s'ouvrant sur `96f7902` (le commit qui monte
`package.json` à 1.0.1) et se fermant sur `f58838b`.

---

## [1.0.1] — 2026-10-07

Release de correctifs : aucune fonctionnalité nouvelle, sept anomalies corrigées
dont deux touchaient l'intégrité des données échangées.

### Corrigé

#### Transferts de fichiers

- **Un fichier tronqué était annoncé comme complet** (`971cd5b`). La boucle
  d'envoi à fenêtre glissante avalait le rejet d'un chunk et le retirait dans le
  même mouvement de l'ensemble `pending`. Quand l'échec tombait en dehors de la
  fenêtre observée par `Promise.race`, il devenait invisible : `Promise.all`
  résolvait, `file:complete` partait, et le pair assemblait un binaire tronqué
  sans qu'aucune erreur n'apparaisse d'un côté comme de l'autre. La première
  erreur est désormais mémorisée, l'émission s'arrête, `file:complete` n'est pas
  envoyé et l'échec remonte jusqu'à l'expéditeur. Correctif appliqué aux deux
  chemins, envoi direct et multicast de groupe.
- **Coût complet payé pour un destinataire injoignable** (`f51f526`). `sendFile`
  compressait le fichier et écrivait son blob avant de vérifier la connexion : un
  destinataire hors ligne coûtait le réencodage vidéo entier plus un blob
  orphelin sur le disque, pendant que le widget restait à « 0 % » sans jamais
  expliquer l'échec. La connexion est maintenant sondée d'abord, avec une
  tentative de dial, et une erreur explicite est remontée. Le dial alimente au
  passage `ed25519ToNoiseMap`, ce qui supprime le repli sur la clé Ed25519 brute
  qui faisait échouer l'envoi même une fois connecté.
- **Barre de progression propagée aux homonymes** (`f834f2c`). Les transferts en
  cours étaient appariés par nom de fichier : toutes les bulles plus anciennes
  portant le même nom miroitaient la progression de l'envoi courant, alors que
  les fichiers diffèrent par leur contenu et leur empreinte. La pièce jointe
  porte désormais l'identifiant de transfert et la bulle interroge par
  identifiant. Le nettoyage du sondage utilisait en outre une valeur de closure
  périmée, qui laissait la barre figée à mi-parcours jusqu'au remontage.
- **Widget de transfert affiché dans toutes les conversations** (`f58838b`). La
  liste des transferts en cours est globale, mais les entrées d'envoi ne
  portaient aucun identifiant de conversation : envoyer le même fichier à deux
  amis simultanément faisait apparaître la progression dans les deux fenêtres,
  sans moyen de savoir laquelle avançait réellement. Les réceptions
  connaissaient déjà leur conversation sans l'exposer. Le widget est maintenant
  monté par conversation et filtre les deux listes ; au passage, les canaux de
  groupe montent le widget, ce qui n'était pas le cas — leurs transferts
  n'étaient visibles que dans une fenêtre de discussion privée ouverte par
  ailleurs.

#### Réseau

- **Plantage du processus principal sur reset de connexion** (`2d4ac8a`).
  `handleConnection` n'attachait son propre gestionnaire `'error'` que 371 lignes
  plus loin, après le câblage de Protomux, corestore et trois canaux — et
  `Protomux.from()` se trouvait hors de tout `try`. Une levée n'importe où dans
  cette portion laissait le socket sans écouteur : le `ECONNRESET` suivant
  remontait en « Emitted 'error' event on NoiseSecretStream instance » et tuait
  le processus principal. La rejection de `handleConnection` elle-même n'était pas
  traitée. Reproduit en local avec deux nœuds Hyperswarm réels détruits en plein
  échange ; avec la garde en place, le même scénario sort en code 0. Verrouillé
  sous la règle **R5** de `scripts/check-quit-teardown.mjs`, contrôle vérifié
  non-vacant contre trois copies volontairement cassées.
- **Socket DHT direct jamais détruit en cas d'échec** (`df01674`).
  `connectToPeer` n'écoutait que `'open'`. Un socket en erreur, fermé, ou jamais
  ouvert dans le budget de 10 s restait vivant sans écouteur `'error'` — la même
  classe de défaillance que celle couverte par R5 pour les sockets du swarm.
  Ajout des gestionnaires `'error'` et `'close'`, destruction du socket sur tout
  résultat non concluant, minuteur nettoyé une fois la promesse résolue.

#### Messagerie

- **Réactions emoji perdues sans aucun signal** (`e8b67cf`). Un canal Protomux
  fermé conserve ses handles de message et `send()` retourne `false` en avalant la
  trame : `NetworkService.send()` journalisait donc « SEND SUCCESS » pour des
  réactions qui n'avaient jamais quitté la machine, et `toggleReaction` noyait
  l'échec dans un `.catch(() => {})`. L'émission refuse désormais un socket
  détruit ou un canal fermé, la réaction manquée part dans une file rejouée à la
  reconnexion du pair, et les deux côtés l'écrivent dans Hyperbee — sans quoi
  elle mourait au redémarrage.

### Modifié

- **Nommage des exécutables Windows** (`7a834ba`, `862be26`). Le motif par défaut
  d'electron-builder produisait `Asgard Setup 1.0.1.exe` et `Asgard 1.0.1.exe`,
  avec des espaces ; l'installeur était ensuite renommé à la main avant chaque
  distribution, ce qui le désynchronisait de son `.blockmap` et de `latest.yml`
  (dont l'`url` était déjà écrite avec des tirets d'union et ne correspondait à
  aucun des deux noms). `nsis.artifactName` et `win.artifactName` font maintenant
  émettre directement les noms distribués : les trois références concordent.

### CI et build

- **Le job Linux ne produisait pas tous les paquets déclarés** (`4e0d09d`). La
  cible pacman mourait sur `bsdtar: exit status 127` (fpm l'appelle pour écrire
  le `.MTREE`), d'où l'ajout de `libarchive-tools`. Le runner arm64 ne pouvait
  quant à lui produire aucun `.deb` : le fpm embarqué par electron-builder
  n'existe qu'en binaire x86_64, d'où « Exec format error ». Sa suppression ne
  perd aucune couverture — le job x64 empaquettait déjà en croisé l'AppImage, le
  deb et le tar.gz arm64, et les addons Holepunch livrent des précompilés pour
  chaque plateforme, donc l'hôte d'empaquetage ne se retrouve jamais dans
  l'artefact.
- **GitHub Actions passées en v7** (`3c9d5e9`), pour s'exécuter sur Node 24 et
  faire disparaître l'annotation de dépréciation Node 20. `checkout@v5+` et
  `setup-node@v5+` déclaraient déjà node24, mais `upload-artifact` n'a basculé
  son runtime par défaut qu'à la v6. Aucun des changements cassants intermédiaires
  ne s'applique ici : workflows en `workflow_dispatch` uniquement, cache déjà sur
  npm, globs d'artefacts laissées zippées puisque `archive` reste non renseigné.

### Dépendances

- **Pile Holepunch remise à niveau** (`4b6c927`) : protomux 3.12.1, hyperswarm
  4.17.2, hypercore 11.37.0, corestore 7.12.6, b4a 1.9.0, compact-encoding 3.5.2,
  hyperdrive 13.3.4. Sept paquets en retard, tous en patch ou mineur, aucun
  cassant. Trois correctifs upstream comptent ici : protomux borne la longueur
  déclarée d'un batch à la fin de la trame (nous batchons chaque envoi, une
  longueur surdimensionnée faisait auparavant décoder au-delà du buffer) ;
  hyperswarm ne rafraîchit la découverte que sur le front montant
  hors-ligne→en-ligne au lieu de chaque mise à jour réseau, que notre nœud
  derrière firewall reçoit souvent ; hypercore accepte le manifeste v3 au lieu de
  lever, et ne remonte plus d'erreur depuis un réplicateur détruit.

### Interne

- Version applicative alignée sur 1.0.1 (`96f7902`) : `package.json` pilote
  `app.getVersion()`, qui alimente le titre de fenêtre, le plateau, les journaux
  et la section À propos.
- Cinq libellés que l'audit de langues signalait à tort ont été tranchés
  (`730063b`) : « Jitter », « Pause », « Download », la paire de marques
  « Keet / Pear ID » et « Jitter buffer », dont la valeur égale légitimement
  l'anglais dans certaines langues. Déclarés dans les listes SAME / ALLOW_SAME
  avec leur raison plutôt que d'éditer 24 catalogues à la main — aucune chaîne
  livrée ne change, et l'audit redevient un filet capable d'attraper une vraie
  dérive.

### Artefacts

Générés depuis `88d96f8`. Les empreintes sont des SHA-256.

Les conteneurs ne sont pas reproductibles bit à bit — une même source
régénérée donne des `.exe`, `.deb`, `.AppImage`, `.dmg` et `.zip` dont la
taille varie de quelques octets. L'`app.asar` qu'ils embarquent, lui, l'est :
c'est sur lui que porte la vérification de contenu ci-dessous.

**Windows** — installeur NSIS x64 + arm64, portable x64 :

| Fichier | Octets | SHA-256 |
|---|---|---|
| `Asgard_Setup_1.0.1.exe` | 286 109 790 | `51597220aaa96622afd367d4dccfd22337aed41bbe5177678f6d23e5a3f92ac2` |
| `Asgard_1.0.1.exe` | 141 136 664 | `a1b3316a06c5683b0bd1d99c40f8d09895a7e4e61c6b7276c7e81126797d651b` |

**Linux** :

| Fichier | Octets | SHA-256 |
|---|---|---|
| `Asgard-1.0.1-linux-x86_64.AppImage` | 199 507 436 | `a3a542ad40fd6e94d3ab445e9294a22aa9062cb6fbbfbdb8d810b53a6e5d2a26` |
| `Asgard-1.0.1-linux-arm64.AppImage` | 199 824 246 | `ae80e40ebf97f80b039e0ebf7cb5c28ede9b7491222268cb11544fb0808d30c1` |
| `Asgard-1.0.1-linux-amd64.deb` | 113 574 158 | `baabd3eb5a2ba26bb275b000ee69cd0f3f6b0550b57fc112b044ce1f47819e8f` |
| `Asgard-1.0.1-linux-arm64.deb` | 108 688 190 | `f6d7fad22f0cbcdf032f6efaa037ba84e2410bebd6ad19e54c9b1c079bc612a5` |
| `Asgard-1.0.1-linux-x64.pacman` | 113 541 596 | `6d1d7e77b6468604c5aba98664fee935acad724b9b33b5852dd981245ceb93ba` |
| `Asgard-1.0.1-linux-x64.tar.gz` | 186 695 099 | `0f837a3f266141b8c0439cc12e6b648ef6dcf5aee8e82f2f3d74c8da2d75890a` |
| `Asgard-1.0.1-linux-arm64.tar.gz` | 186 683 884 | `39b9002b329b1c3a04560972f463e917db38c0c5833065e5de824e3522d6b96a` |

**macOS** — non signés, `CSC_IDENTITY_AUTO_DISCOVERY: false` :

| Fichier | Octets | SHA-256 |
|---|---|---|
| `Asgard-1.0.1.dmg` (x64) | 194 422 153 | `89455b289b4b6ff786803058c52196e269c4e9c094636fa4e821e1ed464da07d` |
| `Asgard-1.0.1-mac.zip` (x64) | 185 694 152 | `87a7fb7c4f2cb61b67018fcd1b2d16655703e0e14a34ce461beaf2308b7b68ff` |
| `Asgard-1.0.1-arm64.dmg` | 188 417 901 | `02672e9bc58cf0266ff9069c0d3a5fb2542a5b8ea6b6980156a218b12c34630f` |
| `Asgard-1.0.1-arm64-mac.zip` | 179 639 138 | `f5c4f751cfd19d23a0940d6acab1e9cda105e95654743eaed508dca13266e011` |

L'`app.asar` des paquets Linux et macOS est byte-identique
(`15ebd20f95579dde…`, 71 007 127 octets) ; celui des paquets Windows en diffère
de 748 octets (`c41e29a2179a18bf…`), écart attendu lié aux modules natifs
précompilés par plateforme. Les six asar contrôlés — Windows x64 et arm64,
`.deb` amd64 et arm64, `.zip` macOS x64 et arm64 — contiennent la garde R5, la
garde `connectToPeer`, le bundle renderer `index-Bj_vR7Ii.js` et les trois sites
du correctif de portée du widget (`conversationId` dans `getActiveReceives`,
dans `sendFile` et dans l'entrée multicast). Les quatre asar Linux et macOS sont
en outre byte-identiques à ceux de la génération `f58838b`, ce qui établit que
le commit de documentation n'a rien changé au contenu livré.

### Vérification

Chaîne exécutée avant chaque livraison : `tsc --noEmit` sur les trois
configurations (renderer, electron, preload), `vitest run` (327 tests passés,
2 sautés), `eslint --max-warnings 0`, `npm run check:all` (intégrité des 25
langues, invariants de présence et de fermeture, pictogrammes, DevTools),
`npm run build` puis `npm run verify:build`.

---

## [1.0.0] — 2026-08-13 → 2026-09-17

Première version publiée, de l'import initial `7889d9f` jusqu'à `c287bd7`,
dernier commit avant le passage à 1.0.1.

- Messagerie pair-à-pair chiffrée de bout en bout sur la pile Pear / Holepunch :
  Hyperswarm pour la découverte, Hypercore et Hyperbee pour la persistance,
  Protomux pour le multiplexage. Aucun serveur, aucun compte, aucune clé privée
  ne quitte l'appareil.
- Conversations en un-à-un et en groupe, appels audio et vidéo, transferts de
  fichiers avec compression et miniature, réactions, statuts de présence. Les
  appels ne passent pas par WebRTC : l'audio est encodé en Opus via WebCodecs
  (`AudioEncoder` / `AudioDecoder`), la vidéo en trames JPEG à 25 FPS, les deux
  transportés sur Protomux ; l'audio de groupe suit une topologie mesh, chaque
  participant envoyant directement à tous les autres.
- Interface en 25 langues, thème et taille de police réglables, lecteur
  multimédia intégré, visionneuse photo avec zoom et galerie.
- Empaquetage Windows (installeur NSIS et portable), Linux (AppImage, deb,
  pacman, tar.gz) et macOS (dmg et zip, x64 et arm64). Ces cibles étaient
  déclarées mais le job Linux ne les produisait pas toutes ; voir la correction
  `4e0d09d` en 1.0.1.

Travaux ayant suivi la publication initiale et rattachés à la 1.0.1 :
correction du runner macOS Intel vers `macos-15-intel` (`051f7ee`),
`--publish never` sur le job macOS (`97731ff`), mise à jour de la feuille de
route et de l'URL du dépôt (`33d562f`), rafraîchissement des dépendances
Holepunch et audit Linux (`604a453`), synchronisation du lockfile et passage à
Node 22 en CI (`3cdc86a`), traductions complètes des 25 langues (`f10cc7d`),
sous-ensemble d'émojis OpenMoji embarqué avec icônes en SVG (`e68408f`), widget
de progression maintenu pour tous les formats et codecs (`c287bd7`).

---

[1.0.1]: https://github.com/Aw3n/asgard-messenger/compare/c287bd7...f58838b
[1.0.0]: https://github.com/Aw3n/asgard-messenger/commits/c287bd7
