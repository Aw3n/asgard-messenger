/**
 * errorboundary-data.mjs — fix25 (suite): translations for the hard-coded
 * fallback strings of src/components/ui/ErrorBoundary.tsx.
 *
 *   errors.title        — "Something went wrong"
 *   errors.description  — render-crash explanation
 *   errors.reloadApp    — "Reload app"
 *   errors.tryAgain     — "Try again"
 *
 * ErrorBoundary is a class component, so it reads the global i18n instance
 * (default export of src/i18n/config.ts) instead of the useTranslation hook.
 * 4 keys × 25 languages.
 */
export const DATA = {
  fr: {
    'errors.title': 'Une erreur est survenue',
    'errors.description': "L'interface a planté pendant l'affichage. Veuillez recharger l'application ou ouvrir la console de développement pour plus de détails.",
    'errors.reloadApp': "Recharger l'application",
    'errors.tryAgain': 'Réessayer',
  },
  nl: {
    'errors.title': 'Er is iets misgegaan',
    'errors.description': 'De interface is vastgelopen tijdens het weergeven. Herlaad de app of open de ontwikkelaarsconsole voor details.',
    'errors.reloadApp': 'App herladen',
    'errors.tryAgain': 'Opnieuw proberen',
  },
  de: {
    'errors.title': 'Etwas ist schiefgelaufen',
    'errors.description': 'Die Oberfläche ist beim Rendern abgestürzt. Bitte laden Sie die App neu oder öffnen Sie die Entwicklerkonsole für Details.',
    'errors.reloadApp': 'App neu laden',
    'errors.tryAgain': 'Erneut versuchen',
  },
  it: {
    'errors.title': 'Si è verificato un errore',
    'errors.description': "L'interfaccia si è bloccata durante il rendering. Ricarica l'app o apri la console di sviluppo per i dettagli.",
    'errors.reloadApp': "Ricarica l'app",
    'errors.tryAgain': 'Riprova',
  },
  es: {
    'errors.title': 'Algo salió mal',
    'errors.description': 'La interfaz se bloqueó durante el renderizado. Recarga la aplicación o abre la consola de desarrollador para ver los detalles.',
    'errors.reloadApp': 'Recargar la aplicación',
    'errors.tryAgain': 'Reintentar',
  },
  pt: {
    'errors.title': 'Algo correu mal',
    'errors.description': 'A interface bloqueou durante a renderização. Recarregue a aplicação ou abra a consola de programador para obter detalhes.',
    'errors.reloadApp': 'Recarregar a aplicação',
    'errors.tryAgain': 'Tentar novamente',
  },
  el: {
    'errors.title': 'Κάτι πήγε στραβά',
    'errors.description': 'Η διεπαφή κατέρρευσε κατά την εμφάνιση. Επαναφορτώστε την εφαρμογή ή ανοίξτε την κονσόλα προγραμματιστή για λεπτομέρειες.',
    'errors.reloadApp': 'Επαναφόρτωση εφαρμογής',
    'errors.tryAgain': 'Δοκιμάστε ξανά',
  },
  da: {
    'errors.title': 'Noget gik galt',
    'errors.description': 'Brugerfladen crashede under gengivelsen. Genindlæs appen, eller åbn udviklerkonsollen for detaljer.',
    'errors.reloadApp': 'Genindlæs app',
    'errors.tryAgain': 'Prøv igen',
  },
  fi: {
    'errors.title': 'Jotain meni pieleen',
    'errors.description': 'Käyttöliittymä kaatui renderöinnin aikana. Lataa sovellus uudelleen tai avaa kehittäjäkonsoli saadaksesi lisätietoja.',
    'errors.reloadApp': 'Lataa sovellus uudelleen',
    'errors.tryAgain': 'Yritä uudelleen',
  },
  sv: {
    'errors.title': 'Något gick fel',
    'errors.description': 'Gränssnittet kraschade under renderingen. Ladda om appen eller öppna utvecklarkonsolen för detaljer.',
    'errors.reloadApp': 'Ladda om app',
    'errors.tryAgain': 'Försök igen',
  },
  hr: {
    'errors.title': 'Nešto je pošlo po krivu',
    'errors.description': 'Sučelje se srušilo tijekom prikazivanja. Ponovno učitajte aplikaciju ili otvorite razvojnu konzolu za pojedinosti.',
    'errors.reloadApp': 'Ponovno učitaj aplikaciju',
    'errors.tryAgain': 'Pokušaj ponovno',
  },
  et: {
    'errors.title': 'Midagi läks valesti',
    'errors.description': 'Kasutajaliides jooksis renderdamisel kokku. Laadige rakendus uuesti või avage detailide jaoks arendajakonsool.',
    'errors.reloadApp': 'Laadi rakendus uuesti',
    'errors.tryAgain': 'Proovi uuesti',
  },
  hu: {
    'errors.title': 'Hiba történt',
    'errors.description': 'A felület összeomlott a megjelenítés közben. Töltse be újra az alkalmazást, vagy nyissa meg a fejlesztői konzolt a részletekért.',
    'errors.reloadApp': 'Alkalmazás újratöltése',
    'errors.tryAgain': 'Próbálja újra',
  },
  lv: {
    'errors.title': 'Kaut kas nogāja greizi',
    'errors.description': 'Saskarne avarēja renderēšanas laikā. Lūdzu, pārlādējiet lietotni vai atveriet izstrādātāja konsoli, lai iegūtu sīkāku informāciju.',
    'errors.reloadApp': 'Pārlādēt lietotni',
    'errors.tryAgain': 'Mēģināt vēlreiz',
  },
  lt: {
    'errors.title': 'Kažkas nutiko',
    'errors.description': 'Sąsaja nulūžo atvaizduojant. Įkelkite programą iš naujo arba atidarykite kūrėjo konsolę, kad sužinotumėte daugiau.',
    'errors.reloadApp': 'Įkelti programą iš naujo',
    'errors.tryAgain': 'Bandyti dar kartą',
  },
  mt: {
    'errors.title': 'Xi ħaġa marret ħażin',
    'errors.description': "L-interfaċċa waqgħet waqt ir-rendering. Jekk jogħġbok erġa' tagħbha l-app jew iftaħ il-console tal-iżviluppatur għad-dettalji.",
    'errors.reloadApp': "Erġa' tagħbha l-app",
    'errors.tryAgain': "Erġa' pprova",
  },
  pl: {
    'errors.title': 'Coś poszło nie tak',
    'errors.description': 'Interfejs uległ awarii podczas renderowania. Załaduj ponownie aplikację lub otwórz konsolę deweloperską, aby uzyskać szczegóły.',
    'errors.reloadApp': 'Załaduj ponownie aplikację',
    'errors.tryAgain': 'Spróbuj ponownie',
  },
  sk: {
    'errors.title': 'Niečo sa pokazilo',
    'errors.description': 'Rozhranie spadlo počas vykresľovania. Znovu načítajte aplikáciu alebo otvorte vývojársku konzolu pre podrobnosti.',
    'errors.reloadApp': 'Znovu načítať aplikáciu',
    'errors.tryAgain': 'Skúsiť znova',
  },
  sl: {
    'errors.title': 'Nekaj je šlo narobe',
    'errors.description': 'Vmesnik se je zrušil med izrisom. Ponovno naložite aplikacijo ali odprite razvijalsko konzolo za podrobnosti.',
    'errors.reloadApp': 'Ponovno naloži aplikacijo',
    'errors.tryAgain': 'Poskusi znova',
  },
  cs: {
    'errors.title': 'Něco se pokazilo',
    'errors.description': 'Rozhraní spadlo během vykreslování. Načtěte aplikaci znovu nebo otevřete vývojářskou konzolu s podrobnostmi.',
    'errors.reloadApp': 'Načíst aplikaci znovu',
    'errors.tryAgain': 'Zkusit znovu',
  },
  bg: {
    'errors.title': 'Нещо се обърка',
    'errors.description': 'Интерфейсът се срина по време на изчертаване. Презаредете приложението или отворете конзолата на разработчика за подробности.',
    'errors.reloadApp': 'Презареди приложението',
    'errors.tryAgain': 'Опитайте отново',
  },
  ga: {
    'errors.title': 'Tharla earráid',
    'errors.description': 'Thit an comhéadan le linn an rindreála. Athluchtaigh an aip nó oscail consól an fhorbróra chun sonraí a fháil.',
    'errors.reloadApp': 'Athluchtaigh an aip',
    'errors.tryAgain': 'Bain triail as arís',
  },
  ro: {
    'errors.title': 'Ceva a mers prost',
    'errors.description': 'Interfața s-a blocat în timpul randării. Reîncărcați aplicația sau deschideți consola de dezvoltare pentru detalii.',
    'errors.reloadApp': 'Reîncarcă aplicația',
    'errors.tryAgain': 'Încercați din nou',
  },
  en: {
    'errors.title': 'Something went wrong',
    'errors.description': 'The interface crashed while rendering. Please reload the app or open the developer console for details.',
    'errors.reloadApp': 'Reload app',
    'errors.tryAgain': 'Try again',
  },
  uk: {
    'errors.title': 'Щось пішло не так',
    'errors.description': 'Інтерфейс впав під час відображення. Перезавантажте застосунок або відкрийте консоль розробника, щоб дізнатися більше.',
    'errors.reloadApp': 'Перезавантажити застосунок',
    'errors.tryAgain': 'Спробувати ще раз',
  },
}
