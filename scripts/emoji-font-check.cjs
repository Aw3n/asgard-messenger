/**
 * emoji-font-check.cjs — la police de repli est-elle réellement dessinée ?
 *
 * Ce contrôle ne porte plus sur des fichiers : il demande au moteur de rendu de
 * dessiner chaque glyphe et mesure les pixels produits. Il se lance sous WSL, sur
 * une machine qui n'installe AUCUNE police émoji (`fc-list | grep -ci emoji` y
 * renvoie 0) — précisément la configuration du client Linux qui a révélé le défaut
 * d'origine. Si le glyphe sort en couleur, la chaine @font-face -> asar -> woff2 ->
 * COLR/CPAL fonctionne de bout en bout ; sinon l'embarquement n'a rien résolu.
 *
 * Pourquoi pas `document.fonts.check()` : cette API se fie a l'attribut
 * `unicode-range` de la regle, pas au cmap réel de la police. Sans `unicode-range`,
 * elle répond vrai pour n'importe quel caractère et ne prouverait rien.
 *
 * Le critere est donc une COMPARAISON DE RENDU : chaque glyphe est trace deux fois,
 * avec « Asgard Emoji » puis avec une famille inventee qui renvoie le moteur sur son
 * propre repli de dernier recours. Des pixels identiques signifient que la police
 * embarquee n'a rien dessine. Le comptage de pixels chromatiques (max(r,g,b) -
 * min(r,g,b)) est garde comme information, plus comme juge : la premiere execution
 * de cette sonde a accuse a tort 💬 📞 📁 👥 🎙 — chez OpenMoji ces dessins sont
 * noirs et gris, donc de chroma nulle, alors qu'ils sont bien rendus.
 *
 * Lancé par scripts/linux-emoji-font-check.sh :
 *   electron scripts/emoji-font-check.cjs <chemin/linux-unpacked> --no-sandbox
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const UNPACKED = process.argv.slice(2).find((a) => !a.startsWith('-'))
// Séparation mesurée par cette sonde sur la machine de test : les 44 glyphes
// couverts diffèrent du dernier recours de 2 799 à 8 478 pixels ; les trois témoins,
// qui ne sont que des rectangles de substitution dessinés avec les métriques de leur
// propre police, en diffèrent de 1 537 au plus. Un seuil fixe hérité de ces nombres
// serait fragile : le jugement est donc rendu contre la distribution nulle mesurée
// dans LA MEME EXECUTION (voir `plafondTemoins`), ce qui rend la conclusion
// independante de la machine.
const SEUIL_DIFF = 50
if (!UNPACKED) {
  console.error('usage : electron scripts/emoji-font-check.cjs <linux-unpacked>')
  process.exitCode = 2
  app.exit(2)
}

/** CSS compilé du paquet : c'est lui qui declare la face, via l'asar. */
function findCss() {
  const assets = path.join(UNPACKED, 'resources', 'app.asar', 'dist', 'renderer', 'assets')
  const css = fs.readdirSync(assets).filter((f) => f.endsWith('.css'))[0]
  if (!css) throw new Error('aucun CSS dans ' + assets)
  return path.join(assets, css)
}

/** Les glyphes attendus viennent de la liste du depot, pas d'une recopie ici. */
function loadSpec() {
  const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'emoji-subset.json'), 'utf8'))
  return {
    family: spec.family,
    attends: spec.glyphs.map((g) => String.fromCodePoint(parseInt(g.cp, 16))),
    // Trois glyphes que OpenMoji connait mais que le sous-ensemble a ecartes : ils
    // doivent rester monochromes. Sans ce temoin negatif, un canvas qui ne dessine
    // jamais rien de couleur pourrait passer pour un succes.
    temoins: ['\u{1F984}', '\u{1F951}', '\u{1F9FF}'],
  }
}

const PROBE = (chars) => `(async () => {
  await document.fonts.load('96px "Asgard Emoji"')
  await document.fonts.ready
  const faces = [...document.fonts].map((f) => f.family.replace(/"/g, '') + ':' + f.status)
  const c = document.createElement('canvas')
  c.width = 112
  c.height = 112
  const x = c.getContext('2d', { willReadFrequently: true })
  // Deux familles, meme gabarit : « Asgard Emoji » et une famille inventee qui ne
  // peut que retomber sur le dernier recours du moteur. La difference de pixels est
  // la preuve que la police embarquee a dessine.
  const trace = (ch, famille) => {
    x.fillStyle = '#fff'
    x.fillRect(0, 0, c.width, c.height)
    x.font = '96px ' + famille
    x.fillStyle = '#000'
    x.textBaseline = 'top'
    x.fillText(ch, 8, 8)
    return x.getImageData(0, 0, c.width, c.height).data
  }
  const mesure = {}
  for (const ch of ${JSON.stringify(chars)}) {
    const a = trace(ch, '"Asgard Emoji"')
    const b = trace(ch, '"AsgardSansFamilleInventee-ZQ"')
    let encre = 0
    let couleur = 0
    let difference = 0
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], v = a[i + 1], bl = a[i + 2]
      if (r + v + bl < 720) encre++
      if (Math.max(r, v, bl) - Math.min(r, v, bl) > 40) couleur++
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) difference++
    }
    mesure[ch] = { encre, couleur, difference }
  }
  return { faces, mesure, pile: getComputedStyle(document.body).fontFamily }
})()`

async function run() {
  const css = findCss()
  const { family, attends, temoins } = loadSpec()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asgard-emoji-check-'))
  const page = path.join(dir, 'index.html')
  // La feuille est chargee depuis l'asar : c'est le chemin exact de l'expedition.
  fs.writeFileSync(page, `<!doctype html><meta charset=utf-8><link rel=stylesheet href="file://${css.replace(/\\/g, '/')}"><body style="margin:0;background:#fff"></body>`)

  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { offscreen: true, contextIsolation: true },
  })
  await win.loadFile(page)
  const res = await win.webContents.executeJavaScript(PROBE([...attends, ...temoins]), true)
  win.destroy()
  fs.rmSync(dir, { recursive: true, force: true })

  const m = (ch) => res.mesure[ch] || { encre: 0, couleur: 0, difference: 0 }
  const problems = []
  if (!res.faces.some((f) => f.includes(family))) problems.push(`aucune face « ${family} » declaree par le CSS du paquet`)
  const nonMesures = attends.filter((ch) => !res.mesure[ch])
  if (nonMesures.length) problems.push(`non mesures : ${nonMesures.join('')}`)
  // Le plafond des temoins definit la distribution nulle de l'execution : un glyphe
  // que la police embarquee ne dessine pas ne peut pas la depasser.
  const differencesTemoins = temoins.map((ch) => m(ch).difference)
  const plafondTemoins = Math.max(...differencesTemoins)
  const seuil = plafondTemoins + SEUIL_DIFF
  const nonDessines = attends.filter((ch) => m(ch).difference <= seuil)
  if (nonDessines.length) problems.push(`a la difference des temoins, donc non couverts : ${nonDessines.join('')}`)
  const temoinsColores = temoins.filter((ch) => m(ch).couleur >= 50)
  if (temoinsColores.length) problems.push(`temoins a tort en couleur (le sous-ensemble contient plus que declare) : ${temoinsColores.join('')}`)
  const sansEncre = attends.filter((ch) => m(ch).encre < 20)
  if (sansEncre.length) problems.push(`rien de dessine : ${sansEncre.join('')}`)

  const differentiels = attends.map((ch) => m(ch).difference)
  const encres = attends.map((ch) => m(ch).encre)
  const chroma = attends.filter((ch) => m(ch).couleur >= 50).length
  console.log(`CSS controle      : ${css}`)
  console.log(`faces declarees   : ${res.faces.length ? res.faces.join(', ') : 'aucune'}`)
  console.log(`pile du <body>    : ${res.pile}`)
  console.log(`glyphes mesures   : ${attends.length} attendus + ${temoins.length} temoins (${temoins.join(' ')})`)
  console.log(`pixels vs dernier recours : couverts ${Math.min(...differentiels)} a ${Math.max(...differentiels)}, temoins jusqu'a ${plafondTemoins}, seuil retenu ${seuil}`)
  console.log(`dessines en couleur : ${chroma}/${attends.length} (les autres sont les dessins noirs d OpenMoji)`)
  console.log(`pixels d'encre    : min ${Math.min(...encres)}, max ${Math.max(...encres)} (surface 12544)`)
  for (const p of problems) console.log(`✗ ${p}`)
  console.log(problems.length
    ? 'ÉCHEC — la police embarquee ne rend pas le contenu comme attendu'
    : `OK — les ${attends.length} émojis de contenu sont dessinés par la police du paquet, les témoins restent au dernier recours`)
  app.exit(problems.length ? 1 : 0)
}

app.whenReady().then(run).catch((e) => {
  console.error('sonde en echec : ' + ((e && e.stack) || e))
  app.exit(1)
})
