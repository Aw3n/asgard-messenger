import fs from 'fs'

// Passe 15 : ajoute les 9 clés "calls.stats*" aux 25 langues — libellés du
// panneau de statistiques d'appel (CallView). Ancre d'insertion :
// "calls.participantCount_plural", présent exactement une fois par langue.

const f = 'src/i18n/translations.ts'
let c = fs.readFileSync(f, 'utf8')

const KEYS = [
  'calls.statsTitle', 'calls.statsBandwidth', 'calls.statsDuration',
  'calls.statsPacketLoss', 'calls.statsChunksDropped', 'calls.statsUnderruns',
  'calls.statsFramesLost', 'calls.statsJitter', 'calls.statsBufferDepth',
]

const T = {
  fr: ["Statistiques de l'appel", 'Bande passante', 'Durée', 'Paquets audio perdus', 'Paquets ignorés', 'Coupures audio', 'Images vidéo perdues', 'Gigue', 'Tampon anti-gigue'],
  en: ['Call statistics', 'Bandwidth', 'Duration', 'Audio packets lost', 'Packets dropped', 'Audio dropouts', 'Video frames lost', 'Jitter', 'Jitter buffer'],
  nl: ['Oproepstatistieken', 'Bandbreedte', 'Duur', 'Verloren audiopakketten', 'Genegeerde pakketten', 'Audio-onderbrekingen', 'Verloren videobeelden', 'Jitter', 'Jitterbuffer'],
  de: ['Anrufstatistik', 'Bandbreite', 'Dauer', 'Verlorene Audiopakete', 'Verworfene Pakete', 'Audioaussetzer', 'Verlorene Videobilder', 'Jitter', 'Jitterpuffer'],
  it: ['Statistiche della chiamata', 'Larghezza di banda', 'Durata', 'Pacchetti audio persi', 'Pacchetti scartati', 'Interruzioni audio', 'Fotogrammi video persi', 'Jitter', 'Buffer anti-jitter'],
  es: ['Estadísticas de la llamada', 'Ancho de banda', 'Duración', 'Paquetes de audio perdidos', 'Paquetes descartados', 'Cortes de audio', 'Fotogramas de vídeo perdidos', 'Jitter', 'Búfer anti-jitter'],
  pt: ['Estatísticas da chamada', 'Largura de banda', 'Duração', 'Pacotes de áudio perdidos', 'Pacotes descartados', 'Cortes de áudio', 'Fotogramas de vídeo perdidos', 'Jitter', 'Buffer anti-jitter'],
  el: ['Στατιστικά κλήσης', 'Εύρος ζώνης', 'Διάρκεια', 'Χαμένα πακέτα ήχου', 'Πακέτα που απορρίφθηκαν', 'Διακοπές ήχου', 'Χαμένα καρέ βίντεο', 'Jitter', 'Μνήμη anti-jitter'],
  da: ['Opkaldsstatistik', 'Båndbredde', 'Varighed', 'Mistede lydpakker', 'Kasserede pakker', 'Lydafbrydelser', 'Mistede videobilleder', 'Jitter', 'Jitterbuffer'],
  fi: ['Puhelutilastot', 'Kaistanleveys', 'Kesto', 'Kadonneet äänipaketit', 'Hylätyt paketit', 'Äänikatkokset', 'Kadonneet videoruudut', 'Jitter', 'Jitterpuskuri'],
  sv: ['Samtalsstatistik', 'Bandbredd', 'Längd', 'Förlorade ljudpaket', 'Ignorerade paket', 'Ljudavbrott', 'Förlorade videobilder', 'Jitter', 'Jitterbuffert'],
  hr: ['Statistika poziva', 'Propusnost', 'Trajanje', 'Izgubljeni audiopaketi', 'Odbačeni paketi', 'Audioprekidi', 'Izgubljeni videokadrovi', 'Jitter', 'Jitter međuspremnik'],
  et: ['Kõne statistika', 'Ribalaius', 'Kestus', 'Kaotatud helipaketid', 'Hüljatud paketid', 'Helikatkestused', 'Kaotatud videokaadrid', 'Jitter', 'Jitteri puhver'],
  hu: ['Hívásstatisztika', 'Sávszélesség', 'Időtartam', 'Elveszett hangcsomagok', 'Eldobott csomagok', 'Hangkimaradások', 'Elveszett videokockák', 'Jitter', 'Jitterpuffer'],
  lv: ['Zvana statistika', 'Joslas platums', 'Ilgums', 'Zaudētie audio paketi', 'Atmestie paketi', 'Audio pārrāvumi', 'Zaudētie video kadri', 'Jitter', 'Jitter buferis'],
  lt: ['Skambučio statistika', 'Pralaidumas', 'Trukmė', 'Prarasti garso paketai', 'Atmesti paketai', 'Garso pertrūkiai', 'Prarasti vaizdo kadrai', 'Jitter', 'Jitter buferis'],
  mt: ['Statistika tas-sejħa', "Larghezza ta' banda", 'Tul', 'Paketti tal-awdjo mitlufa', 'Paketti skartati', 'Interuzzjonijiet tal-awdjo', 'Frejms tal-vidjow mitlufa', 'Jitter', 'Buffer kontra l-jitter'],
  pl: ['Statystyki połączenia', 'Przepustowość', 'Czas trwania', 'Utracone pakiety audio', 'Odrzucone pakiety', 'Przerwy w audio', 'Utracone klatki wideo', 'Jitter', 'Bufor anti-jitter'],
  sk: ['Štatistiky hovoru', 'Šírka pásma', 'Trvanie', 'Stratené zvukové pakety', 'Zahodené pakety', 'Zvukové výpadky', 'Stratené videosnímky', 'Jitter', 'Jitter buffer'],
  sl: ['Statistika klica', 'Pasovna širina', 'Trajanje', 'Izgubljeni zvočni paketi', 'Zavrženi paketi', 'Zvočne prekinitve', 'Izgubljene videoslike', 'Jitter', 'Jitter medpomnilnik'],
  cs: ['Statistiky hovoru', 'Šířka pásma', 'Doba trvání', 'Ztracené zvukové pakety', 'Zahozené pakety', 'Zvukové výpadky', 'Ztracené videosnímky', 'Jitter', 'Jitter buffer'],
  bg: ['Статистика на обаждането', 'Честотна лента', 'Продължителност', 'Загубени аудио пакети', 'Отхвърлени пакети', 'Аудио прекъсвания', 'Загубени видеокадри', 'Jitter', 'Jitter буфер'],
  ga: ['Staitistic an ghlao', 'Bandaleithead', 'Fad', 'Paicéid fuaime a chailleadh', 'Paicéid a caitheadh amach', 'Briseanna fuaime', 'Frámaí físe a chailleadh', 'Jitter', 'Maolán jitter'],
  ro: ['Statisticile apelului', 'Lățime de bandă', 'Durată', 'Pachete audio pierdute', 'Pachete eliminate', 'Întreruperi audio', 'Cadre video pierdute', 'Jitter', 'Buffer anti-jitter'],
  uk: ['Статистика дзвінка', 'Пропускна здатність', 'Тривалість', 'Втрачені аудіопакети', 'Відкинуті пакети', 'Аудіоперебої', 'Втрачені відеокадри', 'Jitter', 'Jitter-буфер'],
}

// Repère les sections de langue (^  xx: {) et insère dans chacune
// après la ligne "calls.participantCount_plural". Insertions appliquées
// de la fin vers le début pour ne pas invalider les offsets.
const sectionRegex = /^  (\w+): \{/gm
const sections = []
let m
while ((m = sectionRegex.exec(c)) !== null) sections.push({ lang: m[1], start: m.index })

const insertions = []
for (const s of sections) {
  const values = T[s.lang]
  if (!values) {
    console.warn(`langue sans traduction: ${s.lang}`)
    continue
  }
  if (values.length !== KEYS.length) {
    console.warn(`${s.lang}: ${values.length} valeurs pour ${KEYS.length} clés — ignoré`)
    continue
  }
  const next = sections.find((x) => x.start > s.start)
  const end = next ? next.start : c.length
  const section = c.slice(s.start, end)
  if (section.includes('"calls.statsTitle"')) {
    console.log(`${s.lang}: déjà présent`)
    continue
  }
  const anchor = section.indexOf('"calls.participantCount_plural"')
  if (anchor === -1) {
    console.warn(`ancre "calls.participantCount_plural" introuvable pour ${s.lang}`)
    continue
  }
  const lineEnd = section.indexOf('\n', anchor)
  const text = KEYS.map((k, i) => `      ${JSON.stringify(k)}: ${JSON.stringify(values[i])},\n`).join('')
  insertions.push({ pos: s.start + lineEnd + 1, lang: s.lang, text })
}

insertions.sort((a, b) => b.pos - a.pos)
for (const ins of insertions) {
  c = c.slice(0, ins.pos) + ins.text + c.slice(ins.pos)
}

fs.writeFileSync(f, c)
console.log(`Inséré ${KEYS.length} clés stats dans ${insertions.length} langues (${insertions.length * KEYS.length} entrées)`)
