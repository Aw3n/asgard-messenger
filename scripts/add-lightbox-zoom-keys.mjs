#!/usr/bin/env node
/**
 * Injects / rewrites the ImageLightbox keys in src/i18n/translations.ts for the
 * 25 supported languages.
 *
 * Why a script: translations.ts is one flat object per locale, the lightbox keys
 * only existed in `fr` and `nl` (so every other locale silently fell back to
 * French because of `fallbackLng: 'fr'`), and two of the hints described the old
 * behaviour ("click the image to close") which no longer exists.
 *
 * Existing lines are replaced in place, whatever their indentation (previous
 * injectors wrote them at column 0), missing ones are appended at the end of the
 * locale block, before its closing brace.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'lightbox.open', 'lightbox.zoomIn', 'lightbox.zoomOut', 'lightbox.resetZoom',
  'lightbox.fit', 'lightbox.actualSize', 'lightbox.fullscreen', 'lightbox.exitFullscreen',
  'lightbox.previous', 'lightbox.next', 'lightbox.download', 'lightbox.close',
  'lightbox.loadingOriginal', 'lightbox.previewOnly', 'lightbox.loadFailed',
  'lightbox.scrollZoom', 'lightbox.dragToPan',
]

const DATA = {
  fr: {
    'lightbox.open': 'Afficher en grand', 'lightbox.zoomIn': 'Zoomer', 'lightbox.zoomOut': 'Dézoomer',
    'lightbox.resetZoom': 'Réinitialiser le zoom', 'lightbox.fit': 'Ajuster', 'lightbox.actualSize': 'Taille réelle',
    'lightbox.fullscreen': 'Plein écran', 'lightbox.exitFullscreen': 'Quitter le plein écran',
    'lightbox.previous': 'Photo précédente', 'lightbox.next': 'Photo suivante', 'lightbox.download': 'Télécharger',
    'lightbox.close': 'Fermer', 'lightbox.loadingOriginal': "Chargement de l'original…",
    'lightbox.previewOnly': 'Aperçu en qualité réduite', 'lightbox.loadFailed': 'Original indisponible',
    'lightbox.scrollZoom': 'Molette ou pincement pour zoomer · Double-clic sur un détail',
    'lightbox.dragToPan': 'Glisser pour déplacer · Échap pour fermer',
  },
  en: {
    'lightbox.open': 'View full size', 'lightbox.zoomIn': 'Zoom in', 'lightbox.zoomOut': 'Zoom out',
    'lightbox.resetZoom': 'Reset zoom', 'lightbox.fit': 'Fit', 'lightbox.actualSize': 'Actual size',
    'lightbox.fullscreen': 'Fullscreen', 'lightbox.exitFullscreen': 'Exit fullscreen',
    'lightbox.previous': 'Previous photo', 'lightbox.next': 'Next photo', 'lightbox.download': 'Download',
    'lightbox.close': 'Close', 'lightbox.loadingOriginal': 'Loading original…',
    'lightbox.previewOnly': 'Reduced-quality preview', 'lightbox.loadFailed': 'Original unavailable',
    'lightbox.scrollZoom': 'Scroll or pinch to zoom · Double-click on a detail',
    'lightbox.dragToPan': 'Drag to move · Esc to close',
  },
  nl: {
    'lightbox.open': 'Op volle grootte bekijken', 'lightbox.zoomIn': 'Inzoomen', 'lightbox.zoomOut': 'Uitzoomen',
    'lightbox.resetZoom': 'Zoom resetten', 'lightbox.fit': 'Passend', 'lightbox.actualSize': 'Werkelijke grootte',
    'lightbox.fullscreen': 'Volledig scherm', 'lightbox.exitFullscreen': 'Volledig scherm verlaten',
    'lightbox.previous': 'Vorige foto', 'lightbox.next': 'Volgende foto', 'lightbox.download': 'Downloaden',
    'lightbox.close': 'Sluiten', 'lightbox.loadingOriginal': 'Origineel laden…',
    'lightbox.previewOnly': 'Voorbeeld met lagere kwaliteit', 'lightbox.loadFailed': 'Origineel niet beschikbaar',
    'lightbox.scrollZoom': 'Scroll of knijp om te zoomen · Dubbelklik op een detail',
    'lightbox.dragToPan': 'Sleep om te verplaatsen · Esc om te sluiten',
  },
  de: {
    'lightbox.open': 'Groß anzeigen', 'lightbox.zoomIn': 'Vergrößern', 'lightbox.zoomOut': 'Verkleinern',
    'lightbox.resetZoom': 'Zoom zurücksetzen', 'lightbox.fit': 'Einpassen', 'lightbox.actualSize': 'Tatsächliche Größe',
    'lightbox.fullscreen': 'Vollbild', 'lightbox.exitFullscreen': 'Vollbild beenden',
    'lightbox.previous': 'Vorheriges Foto', 'lightbox.next': 'Nächstes Foto', 'lightbox.download': 'Herunterladen',
    'lightbox.close': 'Schließen', 'lightbox.loadingOriginal': 'Original wird geladen…',
    'lightbox.previewOnly': 'Vorschau mit geringerer Qualität', 'lightbox.loadFailed': 'Original nicht verfügbar',
    'lightbox.scrollZoom': 'Scrollen oder kneifen zum Zoomen · Doppelklick auf ein Detail',
    'lightbox.dragToPan': 'Ziehen zum Verschieben · Esc zum Schließen',
  },
  it: {
    'lightbox.open': 'Mostra in grande', 'lightbox.zoomIn': 'Aumenta zoom', 'lightbox.zoomOut': 'Riduci zoom',
    'lightbox.resetZoom': 'Reimposta zoom', 'lightbox.fit': 'Adatta', 'lightbox.actualSize': 'Dimensione reale',
    'lightbox.fullscreen': 'Schermo intero', 'lightbox.exitFullscreen': 'Esci dallo schermo intero',
    'lightbox.previous': 'Foto precedente', 'lightbox.next': 'Foto successiva', 'lightbox.download': 'Scarica',
    'lightbox.close': 'Chiudi', 'lightbox.loadingOriginal': 'Caricamento originale…',
    'lightbox.previewOnly': 'Anteprima a qualità ridotta', 'lightbox.loadFailed': 'Originale non disponibile',
    'lightbox.scrollZoom': 'Scorri o pizzica per fare zoom · Doppio clic su un dettaglio',
    'lightbox.dragToPan': 'Trascina per spostare · Esc per chiudere',
  },
  es: {
    'lightbox.open': 'Ver en grande', 'lightbox.zoomIn': 'Ampliar', 'lightbox.zoomOut': 'Reducir',
    'lightbox.resetZoom': 'Restablecer zoom', 'lightbox.fit': 'Ajustar', 'lightbox.actualSize': 'Tamaño real',
    'lightbox.fullscreen': 'Pantalla completa', 'lightbox.exitFullscreen': 'Salir de pantalla completa',
    'lightbox.previous': 'Foto anterior', 'lightbox.next': 'Foto siguiente', 'lightbox.download': 'Descargar',
    'lightbox.close': 'Cerrar', 'lightbox.loadingOriginal': 'Cargando original…',
    'lightbox.previewOnly': 'Vista previa de calidad reducida', 'lightbox.loadFailed': 'Original no disponible',
    'lightbox.scrollZoom': 'Rueda o pellizco para acercar · Doble clic en un detalle',
    'lightbox.dragToPan': 'Arrastra para mover · Esc para cerrar',
  },
  pt: {
    'lightbox.open': 'Ver em tamanho grande', 'lightbox.zoomIn': 'Ampliar', 'lightbox.zoomOut': 'Reduzir',
    'lightbox.resetZoom': 'Redefinir zoom', 'lightbox.fit': 'Ajustar', 'lightbox.actualSize': 'Tamanho real',
    'lightbox.fullscreen': 'Ecrã inteiro', 'lightbox.exitFullscreen': 'Sair do ecrã inteiro',
    'lightbox.previous': 'Foto anterior', 'lightbox.next': 'Foto seguinte', 'lightbox.download': 'Transferir',
    'lightbox.close': 'Fechar', 'lightbox.loadingOriginal': 'A carregar o original…',
    'lightbox.previewOnly': 'Pré-visualização de qualidade reduzida', 'lightbox.loadFailed': 'Original indisponível',
    'lightbox.scrollZoom': 'Roda do rato ou pinça para ampliar · Duplo clique num detalhe',
    'lightbox.dragToPan': 'Arraste para mover · Esc para fechar',
  },
  el: {
    'lightbox.open': 'Προβολή σε πλήρες μέγεθος', 'lightbox.zoomIn': 'Μεγέθυνση', 'lightbox.zoomOut': 'Σμίκθυνση',
    'lightbox.resetZoom': 'Επαναφορά ζουμ', 'lightbox.fit': 'Προσαρμογή', 'lightbox.actualSize': 'Πραγματικό μέγεθος',
    'lightbox.fullscreen': 'Πλήρης οθόνη', 'lightbox.exitFullscreen': 'Έξοδος από πλήρη οθόνη',
    'lightbox.previous': 'Προηγούμενη φωτογραφία', 'lightbox.next': 'Επόμενη φωτογραφία', 'lightbox.download': 'Λήψη',
    'lightbox.close': 'Κλείσιμο', 'lightbox.loadingOriginal': 'Φόρτωση πρωτότυπου…',
    'lightbox.previewOnly': 'Προεπισκόπηση χαμηλής ποιότητας', 'lightbox.loadFailed': 'Το πρωτότυπο δεν είναι διαθέσιμο',
    'lightbox.scrollZoom': 'Κύλιση ή τσίμπημα για ζουμ · Διπλό κλικ σε λεπτομέρεια',
    'lightbox.dragToPan': 'Σύρετε για μετακίνηση · Esc για κλείσιμο',
  },
  da: {
    'lightbox.open': 'Vis i fuld størrelse', 'lightbox.zoomIn': 'Zoom ind', 'lightbox.zoomOut': 'Zoom ud',
    'lightbox.resetZoom': 'Nulstil zoom', 'lightbox.fit': 'Tilpas', 'lightbox.actualSize': 'Faktisk størrelse',
    'lightbox.fullscreen': 'Fuld skærm', 'lightbox.exitFullscreen': 'Afslut fuld skærm',
    'lightbox.previous': 'Forrige foto', 'lightbox.next': 'Næste foto', 'lightbox.download': 'Download',
    'lightbox.close': 'Luk', 'lightbox.loadingOriginal': 'Indlæser original…',
    'lightbox.previewOnly': 'Forhåndsvisning i lav kvalitet', 'lightbox.loadFailed': 'Original ikke tilgængelig',
    'lightbox.scrollZoom': 'Rul eller knib for at zoome · Dobbeltklik på en detalje',
    'lightbox.dragToPan': 'Træk for at flytte · Esc lukker',
  },
  fi: {
    'lightbox.open': 'Näytä täyskokoisena', 'lightbox.zoomIn': 'Lähennä', 'lightbox.zoomOut': 'Loitonna',
    'lightbox.resetZoom': 'Nollaa zoom', 'lightbox.fit': 'Sovita', 'lightbox.actualSize': 'Todellinen koko',
    'lightbox.fullscreen': 'Koko näyttö', 'lightbox.exitFullscreen': 'Poistu koko näytöstä',
    'lightbox.previous': 'Edellinen valokuva', 'lightbox.next': 'Seuraava valokuva', 'lightbox.download': 'Lataa',
    'lightbox.close': 'Sulje', 'lightbox.loadingOriginal': 'Ladataan alkuperäistä…',
    'lightbox.previewOnly': 'Alhaisen laadun esikatselu', 'lightbox.loadFailed': 'Alkuperäistä ei saatavilla',
    'lightbox.scrollZoom': 'Vieritä tai nipistä zoomataksesi · Kaksoisnapsauta yksityiskohtaa',
    'lightbox.dragToPan': 'Vedä siirtääksesi · Esc sulkee',
  },
  sv: {
    'lightbox.open': 'Visa i full storlek', 'lightbox.zoomIn': 'Zooma in', 'lightbox.zoomOut': 'Zooma ut',
    'lightbox.resetZoom': 'Återställ zoom', 'lightbox.fit': 'Anpassa', 'lightbox.actualSize': 'Verklig storlek',
    'lightbox.fullscreen': 'Helskärm', 'lightbox.exitFullscreen': 'Avsluta helskärm',
    'lightbox.previous': 'Föregående foto', 'lightbox.next': 'Nästa foto', 'lightbox.download': 'Ladda ner',
    'lightbox.close': 'Stäng', 'lightbox.loadingOriginal': 'Laddar originalet…',
    'lightbox.previewOnly': 'Förhandsvisning med låg kvalitet', 'lightbox.loadFailed': 'Originalet är inte tillgängligt',
    'lightbox.scrollZoom': 'Skrolla eller nyp för att zooma · Dubbelklicka på en detalj',
    'lightbox.dragToPan': 'Dra för att flytta · Esc stänger',
  },
  hr: {
    'lightbox.open': 'Prikaži u punoj veličini', 'lightbox.zoomIn': 'Uvećaj', 'lightbox.zoomOut': 'Umanji',
    'lightbox.resetZoom': 'Poništi zoom', 'lightbox.fit': 'Prilagodi', 'lightbox.actualSize': 'Stvarna veličina',
    'lightbox.fullscreen': 'Cijeli zaslon', 'lightbox.exitFullscreen': 'Izađi iz punog zaslona',
    'lightbox.previous': 'Prethodna fotografija', 'lightbox.next': 'Sljedeća fotografija', 'lightbox.download': 'Preuzmi',
    'lightbox.close': 'Zatvori', 'lightbox.loadingOriginal': 'Učitavanje izvornika…',
    'lightbox.previewOnly': 'Pregled smanjene kvalitete', 'lightbox.loadFailed': 'Izvornik nije dostupan',
    'lightbox.scrollZoom': 'Kotačić ili stisak za zumiranje · Dvoklik na detalj',
    'lightbox.dragToPan': 'Povuci za pomicanje · Esc za zatvaranje',
  },
  et: {
    'lightbox.open': 'Kuva täissuuruses', 'lightbox.zoomIn': 'Suurenda', 'lightbox.zoomOut': 'Vähenda',
    'lightbox.resetZoom': 'Lähtesta suum', 'lightbox.fit': 'Mahuta', 'lightbox.actualSize': 'Tegelik suurus',
    'lightbox.fullscreen': 'Täisekraan', 'lightbox.exitFullscreen': 'Välju täisekraanilt',
    'lightbox.previous': 'Eelmine foto', 'lightbox.next': 'Järgmine foto', 'lightbox.download': 'Laadi alla',
    'lightbox.close': 'Sulge', 'lightbox.loadingOriginal': 'Originaali laadimine…',
    'lightbox.previewOnly': 'Vähendatud kvaliteediga eelvaade', 'lightbox.loadFailed': 'Originaal pole saadaval',
    'lightbox.scrollZoom': 'Keri või näpista suumimiseks · Dubbelklõps detailile',
    'lightbox.dragToPan': 'Lohista liigutamiseks · Esc sulgemiseks',
  },
  hu: {
    'lightbox.open': 'Megtekintés teljes méretben', 'lightbox.zoomIn': 'Nagyítás', 'lightbox.zoomOut': 'Kicsinyítés',
    'lightbox.resetZoom': 'Nagyítás alaphelyzetbe', 'lightbox.fit': 'Illesztés', 'lightbox.actualSize': 'Tényleges méret',
    'lightbox.fullscreen': 'Teljes képernyő', 'lightbox.exitFullscreen': 'Kilépés a teljes képernyőből',
    'lightbox.previous': 'Előző fénykép', 'lightbox.next': 'Következő fénykép', 'lightbox.download': 'Letöltés',
    'lightbox.close': 'Bezárás', 'lightbox.loadingOriginal': 'Eredeti betöltése…',
    'lightbox.previewOnly': 'Kisebb minőségű előnézet', 'lightbox.loadFailed': 'Az eredeti nem érhető el',
    'lightbox.scrollZoom': 'Görgessen vagy csípjen a nagyításhoz · Dupla kattintás egy részletre',
    'lightbox.dragToPan': 'Húzza a mozgatáshoz · Esc a bezáráshoz',
  },
  lv: {
    'lightbox.open': 'Rādīt pilnā lielumā', 'lightbox.zoomIn': 'Pietuvināt', 'lightbox.zoomOut': 'Attālināt',
    'lightbox.resetZoom': 'Atiestatīt tālummaiņu', 'lightbox.fit': 'Ietilpināt', 'lightbox.actualSize': 'Patiesais izmērs',
    'lightbox.fullscreen': 'Pilnekrāna režīms', 'lightbox.exitFullscreen': 'Iziet no pilnekrāna',
    'lightbox.previous': 'Iepriekšējais fotoattēls', 'lightbox.next': 'Nākamais fotoattēls', 'lightbox.download': 'Lejupielādēt',
    'lightbox.close': 'Aizvērt', 'lightbox.loadingOriginal': 'Ielādē oriģinālu…',
    'lightbox.previewOnly': 'Samazinātas kvalitātes priekšskatījums', 'lightbox.loadFailed': 'Oriģināls nav pieejams',
    'lightbox.scrollZoom': 'Ritiniet vai spiediet ar diviem pirkstiem, lai tuvinātu · Dubultklikšķis uz detaļas',
    'lightbox.dragToPan': 'Velciet, lai pārvietotu · Esc, lai aizvērtu',
  },
  lt: {
    'lightbox.open': 'Rodyti visą dydį', 'lightbox.zoomIn': 'Priartinti', 'lightbox.zoomOut': 'Nutolinti',
    'lightbox.resetZoom': 'Atstatinti mastelį', 'lightbox.fit': 'Sutalpinti', 'lightbox.actualSize': 'Tikrasis dydis',
    'lightbox.fullscreen': 'Visas ekranas', 'lightbox.exitFullscreen': 'Išeiti iš viso ekrano',
    'lightbox.previous': 'Ankstesnė nuotrauka', 'lightbox.next': 'Kita nuotrauka', 'lightbox.download': 'Atsisiųsti',
    'lightbox.close': 'Uždaryti', 'lightbox.loadingOriginal': 'Įkeliamas originalas…',
    'lightbox.previewOnly': 'Sumažintos kokybės peržiūra', 'lightbox.loadFailed': 'Originalas nepasiekiamas',
    'lightbox.scrollZoom': 'Slinkite arba brinkite, kad priartintumėte · Dukart spustelėkite detalę',
    'lightbox.dragToPan': 'Vilkite, kad perkeltumėte · Esc – uždaryti',
  },
  mt: {
    'lightbox.open': 'Uri d-daqs sħiħ', 'lightbox.zoomIn': 'Kabbar', 'lightbox.zoomOut': 'Naqqas',
    'lightbox.resetZoom': 'Irrisettja ż-żoom', 'lightbox.fit': 'Adatta', 'lightbox.actualSize': 'Daqs reali',
    'lightbox.fullscreen': 'Skrin sħiħ', 'lightbox.exitFullscreen': 'Oħrog mill-iskrin sħiħ',
    'lightbox.previous': 'Ir-ritrett preċedenti', 'lightbox.next': 'Ir-ritrett li jmiss', 'lightbox.download': 'Niżżel',
    'lightbox.close': 'Agħlaq', 'lightbox.loadingOriginal': 'Qed jitgħabba l-oriġinal…',
    'lightbox.previewOnly': "Ħarsa b'kwalità mnaqqsa", 'lightbox.loadFailed': "L-oriġinal mhux disponibbli",
    'lightbox.scrollZoom': "Skrollja jew oqgħod biex tkabbar · Ikklikkja darbtejn fuq dettall",
    'lightbox.dragToPan': "Iġbed biex timxi · Esc biex tagħlaq",
  },
  pl: {
    'lightbox.open': 'Pokaż w pełnym rozmiarze', 'lightbox.zoomIn': 'Powiększ', 'lightbox.zoomOut': 'Pomniejsz',
    'lightbox.resetZoom': 'Resetuj powiększenie', 'lightbox.fit': 'Dopasuj', 'lightbox.actualSize': 'Rozmiar rzeczywisty',
    'lightbox.fullscreen': 'Pełny ekran', 'lightbox.exitFullscreen': 'Opuść pełny ekran',
    'lightbox.previous': 'Poprzednie zdjęcie', 'lightbox.next': 'Następne zdjęcie', 'lightbox.download': 'Pobierz',
    'lightbox.close': 'Zamknij', 'lightbox.loadingOriginal': 'Ładowanie oryginału…',
    'lightbox.previewOnly': 'Podgląd w obniżonej jakości', 'lightbox.loadFailed': 'Oryginał niedostępny',
    'lightbox.scrollZoom': 'Przewijaj lub szczyp, aby przybliżyć · Kliknij dwukrotnie detal',
    'lightbox.dragToPan': 'Przeciągnij, aby przesunąć · Esc zamyka',
  },
  sk: {
    'lightbox.open': 'Zobraziť v plnej veľkosti', 'lightbox.zoomIn': 'Priblížiť', 'lightbox.zoomOut': 'Oddialiť',
    'lightbox.resetZoom': 'Obnoviť priblíženie', 'lightbox.fit': 'Prispôsobiť', 'lightbox.actualSize': 'Skutočná veľkosť',
    'lightbox.fullscreen': 'Celá obrazovka', 'lightbox.exitFullscreen': 'Ukončiť celú obrazovku',
    'lightbox.previous': 'Predchádzajúca fotografia', 'lightbox.next': 'Ďalšia fotografia', 'lightbox.download': 'Stiahnuť',
    'lightbox.close': 'Zavrieť', 'lightbox.loadingOriginal': 'Načítava sa originál…',
    'lightbox.previewOnly': 'Náhľad so zníženou kvalitou', 'lightbox.loadFailed': 'Originál nie je dostupný',
    'lightbox.scrollZoom': 'Koliesko alebo štipnutie priblíži · Dvojité kliknutie na detail',
    'lightbox.dragToPan': 'Ťahaním posuniete · Esc zavrie',
  },
  sl: {
    'lightbox.open': 'Prikaži v polni velikosti', 'lightbox.zoomIn': 'Povečaj', 'lightbox.zoomOut': 'Pomanjšaj',
    'lightbox.resetZoom': 'Ponastavi povečavo', 'lightbox.fit': 'Prilagodi', 'lightbox.actualSize': 'Dejanska velikost',
    'lightbox.fullscreen': 'Celozaslonski način', 'lightbox.exitFullscreen': 'Zapri celozaslonski način',
    'lightbox.previous': 'Prejšnja fotografija', 'lightbox.next': 'Naslednja fotografija', 'lightbox.download': 'Prenesi',
    'lightbox.close': 'Zapri', 'lightbox.loadingOriginal': 'Nalaganje izvirnika…',
    'lightbox.previewOnly': 'Predogled znižane kakovosti', 'lightbox.loadFailed': 'Izvirnik ni na voljo',
    'lightbox.scrollZoom': 'Kolešček ali stisk za povečavo · Dvoklik na podrobnost',
    'lightbox.dragToPan': 'Potegni za premikanje · Esc za zapiranje',
  },
  cs: {
    'lightbox.open': 'Zobrazit ve plné velikosti', 'lightbox.zoomIn': 'Přiblížit', 'lightbox.zoomOut': 'Oddálit',
    'lightbox.resetZoom': 'Obnovit přiblížení', 'lightbox.fit': 'Přizpůsobit', 'lightbox.actualSize': 'Skutečná velikost',
    'lightbox.fullscreen': 'Celá obrazovka', 'lightbox.exitFullscreen': 'Ukončit celou obrazovku',
    'lightbox.previous': 'Předchozí fotografie', 'lightbox.next': 'Další fotografie', 'lightbox.download': 'Stáhnout',
    'lightbox.close': 'Zavřít', 'lightbox.loadingOriginal': 'Načítání originálu…',
    'lightbox.previewOnly': 'Náhled snížené kvality', 'lightbox.loadFailed': 'Originál není dostupný',
    'lightbox.scrollZoom': 'Kolečkem nebo štípnutím přiblížíte · Dvojité kliknutí na detail',
    'lightbox.dragToPan': 'Tažením posunete · Esc zavře',
  },
  bg: {
    'lightbox.open': 'Преглед в пълен размер', 'lightbox.zoomIn': 'Увеличаване', 'lightbox.zoomOut': 'Намаляване',
    'lightbox.resetZoom': 'Нулиране на мащаба', 'lightbox.fit': 'Побери', 'lightbox.actualSize': 'Действителен размер',
    'lightbox.fullscreen': 'Цял екран', 'lightbox.exitFullscreen': 'Изход от цял екран',
    'lightbox.previous': 'Предижна снимка', 'lightbox.next': 'Следваща снимка', 'lightbox.download': 'Изтегляне',
    'lightbox.close': 'Затваряне', 'lightbox.loadingOriginal': 'Зареждане на оригинала…',
    'lightbox.previewOnly': 'Преглед с по-ниско качество', 'lightbox.loadFailed': 'Оригиналът не е наличен',
    'lightbox.scrollZoom': 'Скрол или щипване за мащабиране · Двоен клик върху детайл',
    'lightbox.dragToPan': 'Влачете за преместване · Esc затваря',
  },
  ga: {
    'lightbox.open': 'Taispeáin sa méid iomlán', 'lightbox.zoomIn': 'Formhaignigh', 'lightbox.zoomOut': 'Laghdaigh',
    'lightbox.resetZoom': 'Athshocraigh an t-formhagnú', 'lightbox.fit': 'Oiriúnaigh', 'lightbox.actualSize': 'Méid iarbhír',
    'lightbox.fullscreen': 'Scáileán iomlán', 'lightbox.exitFullscreen': 'Fág an scáileán iomlán',
    'lightbox.previous': 'An ghrianghain roimhe seo', 'lightbox.next': 'An chéad ghrianghain eile', 'lightbox.download': 'Íoslódáil',
    'lightbox.close': 'Dún', 'lightbox.loadingOriginal': 'Bunleagan á lódáil…',
    'lightbox.previewOnly': 'Réamhamarcán le cáilíocht laghdaithe', 'lightbox.loadFailed': 'Níl an bunleagan ar fáil',
    'lightbox.scrollZoom': 'Scrolláil nó pinchigh chun formhagnú · Déchliceáil ar shonraí',
    'lightbox.dragToPan': 'Tarraing chun bog · Esc chun dúnadh',
  },
  ro: {
    'lightbox.open': 'Vizualizare la dimensiune completă', 'lightbox.zoomIn': 'Mărește', 'lightbox.zoomOut': 'Micșorează',
    'lightbox.resetZoom': 'Resetează zoom-ul', 'lightbox.fit': 'Potrivește', 'lightbox.actualSize': 'Dimensiune reală',
    'lightbox.fullscreen': 'Ecran complet', 'lightbox.exitFullscreen': 'Ieși din ecranul complet',
    'lightbox.previous': 'Fotografia anterioară', 'lightbox.next': 'Fotografia următoare', 'lightbox.download': 'Descarcă',
    'lightbox.close': 'Închide', 'lightbox.loadingOriginal': 'Se încarcă originalul…',
    'lightbox.previewOnly': 'Previzualizare de calitate redusă', 'lightbox.loadFailed': 'Originalul nu este disponibil',
    'lightbox.scrollZoom': 'Derulează sau ciupește pentru zoom · Dublu clic pe un detaliu',
    'lightbox.dragToPan': 'Trage pentru a muta · Esc pentru a închide',
  },
  uk: {
    'lightbox.open': 'Переглянути в повному розмірі', 'lightbox.zoomIn': 'Збільшити', 'lightbox.zoomOut': 'Зменшити',
    'lightbox.resetZoom': 'Скинути масштаб', 'lightbox.fit': 'Вмістити', 'lightbox.actualSize': 'Реальний розмір',
    'lightbox.fullscreen': 'На весь екран', 'lightbox.exitFullscreen': 'Вийти з повноекранного режиму',
    'lightbox.previous': 'Попередня фотографія', 'lightbox.next': 'Наступна фотографія', 'lightbox.download': 'Завантажити',
    'lightbox.close': 'Закрити', 'lightbox.loadingOriginal': 'Завантаження оригіналу…',
    'lightbox.previewOnly': 'Попередній перегляд зниженої якості', 'lightbox.loadFailed': 'Оригінал недоступний',
    'lightbox.scrollZoom': 'Прокрутка або щипок для масштабу · Подвійний клік по деталі',
    'lightbox.dragToPan': 'Перетягніть, щоб рухати · Esc закриває',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Locate the locale blocks: each starts with `  <code>: {` at two-space indent
// and holds a single nested `translation` object of flat "a.b" keys.
const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const known = Object.keys(DATA)
const missing = known.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !known.includes(m.code)).map((m) => m.code)
if (unknownBlocks.length) {
  console.error(`✗ translations.ts has locales without data: ${unknownBlocks.join(', ')}`)
  process.exit(1)
}

let replaced = 0
let inserted = 0

// Walk backwards: splicing a block must not shift the indexes of the previous ones.
for (let b = marks.length - 1; b >= 0; b--) {
  const code = marks[b].code
  const start = marks[b].i + 1
  const end = b + 1 < marks.length ? marks[b + 1].i : lines.length
  const block = lines.slice(start, end)
  const table = DATA[code]
  const pending = []

  for (const key of KEYS) {
    const line = `      "${key}": "${escapeValue(table[key])}",`
    // Previous injectors wrote these keys at column 0 — match any indentation.
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    // The nested shape is `  <locale>: { translation: { …keys… } },` — new keys
    // belong to the `translation` object, so insert before ITS closing brace
    // (four-space indent), not before the locale's own brace.
    let close = -1
    for (let i = block.length - 1; i >= 0; i--) {
      if (/^ {4}\}\s*,?\s*$/.test(block[i])) { close = i; break }
    }
    if (close < 0) {
      console.error(`✗ could not find the closing brace of the translation object in the ${code} block`)
      process.exit(1)
    }
    block.splice(close, 0, ...pending)
    inserted += pending.length
  }

  lines.splice(start, end - start, ...block)
}

writeFileSync(file, lines.join(eol), 'utf8')
console.log(`✓ ${known.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
