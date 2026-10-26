#!/usr/bin/env node
/**
 * Adds the sixteen channel-management strings (groups.addChannel, groups.createChannel,
 * groups.channelName, groups.channelType, groups.channelTypeText / Announcement / Readonly,
 * groups.channelTypeWhoWrites, groups.deleteChannel, groups.channelCreated / channelCreateFailed,
 * groups.channelDeleted / channelDeleteFailed, groups.channelNameRequired, groups.channelNameExists,
 * common.create) to all 25 supported languages of src/i18n/translations.ts.
 *
 * Why this wording : groupService.addChannel/removeChannel et le traitement distant
 * `channel:add` / `channel:remove` existaient déjà, mais aucune vue ne les appelait —
 * un groupe restait figé à ses canaux de création. Les libellés reprennent le vocabulaire
 * déjà en place dans chaque langue (groups.textChannels, groups.readOnly, groups.announcements,
 * common.delete) pour que « canal » se nomme pareil d'un bout à l'autre de l'interface.
 * Le qui-écrit se compose avec les libellés de rôles existants (common.owner / admin /
 * moderator / member) : une seule phrase, et elle ne peut plus contredire la liste des membres.
 *
 * Same in-place algorithm as add-member-mute-keys.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/i18n/translations.ts', import.meta.url)

const KEYS = [
  'common.create',
  'groups.addChannel',
  'groups.channelCreateFailed',
  'groups.channelCreated',
  'groups.channelDeleteFailed',
  'groups.channelDeleted',
  'groups.channelName',
  'groups.channelNameExists',
  'groups.channelNameRequired',
  'groups.channelType',
  'groups.channelTypeAnnouncement',
  'groups.channelTypeReadonly',
  'groups.channelTypeText',
  'groups.channelTypeWhoWrites',
  'groups.createChannel',
  'groups.deleteChannel',
]

const DATA = {
  fr: {
    'common.create': 'Créer',
    'groups.addChannel': 'Ajouter un canal',
    'groups.channelCreateFailed': 'Impossible de créer le canal',
    'groups.channelCreated': 'Canal créé',
    'groups.channelDeleteFailed': 'Impossible de supprimer le canal',
    'groups.channelDeleted': 'Canal supprimé',
    'groups.channelName': 'Nom du canal',
    'groups.channelNameExists': 'Ce nom de canal est déjà pris',
    'groups.channelNameRequired': 'Saisissez un nom de canal',
    'groups.channelType': 'Type de canal',
    'groups.channelTypeAnnouncement': 'Annonce',
    'groups.channelTypeReadonly': 'Lecture seule',
    'groups.channelTypeText': 'Texte',
    'groups.channelTypeWhoWrites': 'Qui peut écrire : {{roles}}',
    'groups.createChannel': 'Créer un canal',
    'groups.deleteChannel': 'Supprimer le canal',
  },
  en: {
    'common.create': 'Create',
    'groups.addChannel': 'Add channel',
    'groups.channelCreateFailed': 'Couldn’t create the channel',
    'groups.channelCreated': 'Channel created',
    'groups.channelDeleteFailed': 'Couldn’t delete the channel',
    'groups.channelDeleted': 'Channel deleted',
    'groups.channelName': 'Channel name',
    'groups.channelNameExists': 'That channel name is already taken',
    'groups.channelNameRequired': 'Enter a channel name',
    'groups.channelType': 'Channel type',
    'groups.channelTypeAnnouncement': 'Announcement',
    'groups.channelTypeReadonly': 'Read only',
    'groups.channelTypeText': 'Text',
    'groups.channelTypeWhoWrites': 'Who can write: {{roles}}',
    'groups.createChannel': 'Create channel',
    'groups.deleteChannel': 'Delete channel',
  },
  nl: {
    'common.create': 'Maken',
    'groups.addChannel': 'Kanaal toevoegen',
    'groups.channelCreateFailed': 'Kanaal maken is mislukt',
    'groups.channelCreated': 'Kanaal gemaakt',
    'groups.channelDeleteFailed': 'Verwijderen van kanaal is mislukt',
    'groups.channelDeleted': 'Kanaal verwijderd',
    'groups.channelName': 'Kanaalnaam',
    'groups.channelNameExists': 'Deze kanaalnaam is al in gebruik',
    'groups.channelNameRequired': 'Voer een kanaalnaam in',
    'groups.channelType': 'Type kanaal',
    'groups.channelTypeAnnouncement': 'Aankondiging',
    'groups.channelTypeReadonly': 'Alleen lezen',
    'groups.channelTypeText': 'Tekst',
    'groups.channelTypeWhoWrites': 'Wie kunnen schrijven: {{roles}}',
    'groups.createChannel': 'Kanaal maken',
    'groups.deleteChannel': 'Kanaal verwijderen',
  },
  de: {
    'common.create': 'Erstellen',
    'groups.addChannel': 'Kanal hinzufügen',
    'groups.channelCreateFailed': 'Kanal konnte nicht erstellt werden',
    'groups.channelCreated': 'Kanal erstellt',
    'groups.channelDeleteFailed': 'Kanal konnte nicht gelöscht werden',
    'groups.channelDeleted': 'Kanal gelöscht',
    'groups.channelName': 'Kanalname',
    'groups.channelNameExists': 'Dieser Kanalname ist bereits vergeben',
    'groups.channelNameRequired': 'Bitte einen Kanalnamen eingeben',
    'groups.channelType': 'Kanaltyp',
    'groups.channelTypeAnnouncement': 'Ankündigung',
    'groups.channelTypeReadonly': 'Nur lesen',
    'groups.channelTypeText': 'Textkanal',
    'groups.channelTypeWhoWrites': 'Wer schreiben kann: {{roles}}',
    'groups.createChannel': 'Kanal erstellen',
    'groups.deleteChannel': 'Kanal löschen',
  },
  it: {
    'common.create': 'Crea',
    'groups.addChannel': 'Aggiungi canale',
    'groups.channelCreateFailed': 'Impossibile creare il canale',
    'groups.channelCreated': 'Canale creato',
    'groups.channelDeleteFailed': 'Impossibile eliminare il canale',
    'groups.channelDeleted': 'Canale eliminato',
    'groups.channelName': 'Nome del canale',
    'groups.channelNameExists': 'Il nome del canale è già in uso',
    'groups.channelNameRequired': 'Inserisci un nome per il canale',
    'groups.channelType': 'Tipo di canale',
    'groups.channelTypeAnnouncement': 'Annuncio',
    'groups.channelTypeReadonly': 'Sola lettura',
    'groups.channelTypeText': 'Testo',
    'groups.channelTypeWhoWrites': 'Chi può scrivere: {{roles}}',
    'groups.createChannel': 'Crea canale',
    'groups.deleteChannel': 'Elimina canale',
  },
  es: {
    'common.create': 'Crear',
    'groups.addChannel': 'Añadir canal',
    'groups.channelCreateFailed': 'No se pudo crear el canal',
    'groups.channelCreated': 'Canal creado',
    'groups.channelDeleteFailed': 'No se pudo eliminar el canal',
    'groups.channelDeleted': 'Canal eliminado',
    'groups.channelName': 'Nombre del canal',
    'groups.channelNameExists': 'Ese nombre de canal ya está en uso',
    'groups.channelNameRequired': 'Escribe un nombre de canal',
    'groups.channelType': 'Tipo de canal',
    'groups.channelTypeAnnouncement': 'Anuncio',
    'groups.channelTypeReadonly': 'Solo lectura',
    'groups.channelTypeText': 'Texto',
    'groups.channelTypeWhoWrites': 'Quién puede escribir: {{roles}}',
    'groups.createChannel': 'Crear canal',
    'groups.deleteChannel': 'Eliminar canal',
  },
  pt: {
    'common.create': 'Criar',
    'groups.addChannel': 'Adicionar canal',
    'groups.channelCreateFailed': 'Não foi possível criar o canal',
    'groups.channelCreated': 'Canal criado',
    'groups.channelDeleteFailed': 'Não foi possível eliminar o canal',
    'groups.channelDeleted': 'Canal eliminado',
    'groups.channelName': 'Nome do canal',
    'groups.channelNameExists': 'Esse nome de canal já está em uso',
    'groups.channelNameRequired': 'Introduza um nome de canal',
    'groups.channelType': 'Tipo de canal',
    'groups.channelTypeAnnouncement': 'Anúncio',
    'groups.channelTypeReadonly': 'Apenas leitura',
    'groups.channelTypeText': 'Texto',
    'groups.channelTypeWhoWrites': 'Quem pode escrever: {{roles}}',
    'groups.createChannel': 'Criar canal',
    'groups.deleteChannel': 'Eliminar canal',
  },
  el: {
    'common.create': 'Δημιουργία',
    'groups.addChannel': 'Προσθήκη καναλιού',
    'groups.channelCreateFailed': 'Δεν ήταν δυνατή η δημιουργία του καναλιού',
    'groups.channelCreated': 'Το κανάλι δημιουργήθηκε',
    'groups.channelDeleteFailed': 'Δεν ήταν δυνατή η διαγραφή του καναλιού',
    'groups.channelDeleted': 'Το κανάλι διαγράφηκε',
    'groups.channelName': 'Όνομα καναλιού',
    'groups.channelNameExists': 'Αυτό το όνομα καναλιού χρησιμοποιείται ήδη',
    'groups.channelNameRequired': 'Εισάγετε όνομα καναλιού',
    'groups.channelType': 'Τύπος καναλιού',
    'groups.channelTypeAnnouncement': 'Ανακοίνωση',
    'groups.channelTypeReadonly': 'Μόνο για ανάγνωση',
    'groups.channelTypeText': 'Κείμενο',
    'groups.channelTypeWhoWrites': 'Μπορούν να γράψουν: {{roles}}',
    'groups.createChannel': 'Δημιουργία καναλιού',
    'groups.deleteChannel': 'Διαγραφή καναλιού',
  },
  da: {
    'common.create': 'Opret',
    'groups.addChannel': 'Tilføj kanal',
    'groups.channelCreateFailed': 'Kanalen kunne ikke oprettes',
    'groups.channelCreated': 'Kanal oprettet',
    'groups.channelDeleteFailed': 'Kanalen kunne ikke slettes',
    'groups.channelDeleted': 'Kanal slettet',
    'groups.channelName': 'Kanalnavn',
    'groups.channelNameExists': 'Det kanalnavn er allerede i brug',
    'groups.channelNameRequired': 'Indtast et kanalnavn',
    'groups.channelType': 'Kanaltype',
    'groups.channelTypeAnnouncement': 'Meddelelse',
    'groups.channelTypeReadonly': 'Kun læsning',
    'groups.channelTypeText': 'Tekst',
    'groups.channelTypeWhoWrites': 'Der kan skrives af: {{roles}}',
    'groups.createChannel': 'Opret kanal',
    'groups.deleteChannel': 'Slet kanal',
  },
  fi: {
    'common.create': 'Luo',
    'groups.addChannel': 'Lisää kanava',
    'groups.channelCreateFailed': 'Kanavaa ei voitu luoda',
    'groups.channelCreated': 'Kanava luotu',
    'groups.channelDeleteFailed': 'Kanavaa ei voitu poistaa',
    'groups.channelDeleted': 'Kanava poistettu',
    'groups.channelName': 'Kanavan nimi',
    'groups.channelNameExists': 'Tämä kanavan nimi on jo käytössä',
    'groups.channelNameRequired': 'Anna kanavan nimi',
    'groups.channelType': 'Kanavan tyyppi',
    'groups.channelTypeAnnouncement': 'Ilmoitus',
    'groups.channelTypeReadonly': 'Vain luku',
    'groups.channelTypeText': 'Teksti',
    'groups.channelTypeWhoWrites': 'Voivat kirjoittaa: {{roles}}',
    'groups.createChannel': 'Luo kanava',
    'groups.deleteChannel': 'Poista kanava',
  },
  sv: {
    'common.create': 'Skapa',
    'groups.addChannel': 'Lägg till kanal',
    'groups.channelCreateFailed': 'Det gick inte att skapa kanalen',
    'groups.channelCreated': 'Kanal skapad',
    'groups.channelDeleteFailed': 'Det gick inte att ta bort kanalen',
    'groups.channelDeleted': 'Kanal borttagen',
    'groups.channelName': 'Kanalnamn',
    'groups.channelNameExists': 'Det kanalnamnet används redan',
    'groups.channelNameRequired': 'Ange ett kanalnamn',
    'groups.channelType': 'Kanaltyp',
    'groups.channelTypeAnnouncement': 'Meddelande',
    'groups.channelTypeReadonly': 'Endast läsning',
    'groups.channelTypeText': 'Textkanal',
    'groups.channelTypeWhoWrites': 'Kan skriva: {{roles}}',
    'groups.createChannel': 'Skapa kanal',
    'groups.deleteChannel': 'Ta bort kanal',
  },
  hr: {
    'common.create': 'Stvori',
    'groups.addChannel': 'Dodaj kanal',
    'groups.channelCreateFailed': 'Kanal nije bilo moguće stvoriti',
    'groups.channelCreated': 'Kanal stvoren',
    'groups.channelDeleteFailed': 'Kanal nije bilo moguće izbrisati',
    'groups.channelDeleted': 'Kanal izbrisan',
    'groups.channelName': 'Naziv kanala',
    'groups.channelNameExists': 'Taj naziv kanala je već zauzet',
    'groups.channelNameRequired': 'Unesite naziv kanala',
    'groups.channelType': 'Vrsta kanala',
    'groups.channelTypeAnnouncement': 'Obavijest',
    'groups.channelTypeReadonly': 'Samo za čitanje',
    'groups.channelTypeText': 'Tekst',
    'groups.channelTypeWhoWrites': 'Pisati mogu: {{roles}}',
    'groups.createChannel': 'Stvori kanal',
    'groups.deleteChannel': 'Izbriši kanal',
  },
  et: {
    'common.create': 'Loo',
    'groups.addChannel': 'Lisa kanal',
    'groups.channelCreateFailed': 'Kanali loomine ebaõnnestus',
    'groups.channelCreated': 'Kanal loodud',
    'groups.channelDeleteFailed': 'Kanali kustutamine ebaõnnestus',
    'groups.channelDeleted': 'Kanal kustutatud',
    'groups.channelName': 'Kanali nimi',
    'groups.channelNameExists': 'See kanali nimi on juba kasutusel',
    'groups.channelNameRequired': 'Sisesta kanali nimi',
    'groups.channelType': 'Kanali tüüp',
    'groups.channelTypeAnnouncement': 'Teadaanne',
    'groups.channelTypeReadonly': 'Ainult lugemiseks',
    'groups.channelTypeText': 'Tekst',
    'groups.channelTypeWhoWrites': 'Kirjutada saavad: {{roles}}',
    'groups.createChannel': 'Loo kanal',
    'groups.deleteChannel': 'Kustuta kanal',
  },
  hu: {
    'common.create': 'Létrehozás',
    'groups.addChannel': 'Csatorna hozzáadása',
    'groups.channelCreateFailed': 'A csatorna létrehozása nem sikerült',
    'groups.channelCreated': 'Csatorna létrehozva',
    'groups.channelDeleteFailed': 'A csatorna törlése nem sikerült',
    'groups.channelDeleted': 'Csatorna törölve',
    'groups.channelName': 'A csatorna neve',
    'groups.channelNameExists': 'Ezt a csatornanevet már használják',
    'groups.channelNameRequired': 'Adja meg a csatorna nevét',
    'groups.channelType': 'A csatorna típusa',
    'groups.channelTypeAnnouncement': 'Bejelentés',
    'groups.channelTypeReadonly': 'Csak olvasható',
    'groups.channelTypeText': 'Szöveg',
    'groups.channelTypeWhoWrites': 'Írhatnak: {{roles}}',
    'groups.createChannel': 'Csatorna létrehozása',
    'groups.deleteChannel': 'Csatorna törlése',
  },
  lv: {
    'common.create': 'Izveidot',
    'groups.addChannel': 'Pievienot kanālu',
    'groups.channelCreateFailed': 'Kanālu nevarēja izveidot',
    'groups.channelCreated': 'Kanāls izveidots',
    'groups.channelDeleteFailed': 'Kanālu nevarēja dzēst',
    'groups.channelDeleted': 'Kanāls dzēsts',
    'groups.channelName': 'Kanāla nosaukums',
    'groups.channelNameExists': 'Šis kanāla nosaukums jau tiek lietots',
    'groups.channelNameRequired': 'Ievadiet kanāla nosaukumu',
    'groups.channelType': 'Kanāla veids',
    'groups.channelTypeAnnouncement': 'Paziņojums',
    'groups.channelTypeReadonly': 'Tikai lasīšanai',
    'groups.channelTypeText': 'Teksts',
    'groups.channelTypeWhoWrites': 'Var rakstīt: {{roles}}',
    'groups.createChannel': 'Izveidot kanālu',
    'groups.deleteChannel': 'Dzēst kanālu',
  },
  lt: {
    'common.create': 'Sukurti',
    'groups.addChannel': 'Pridėti kanalą',
    'groups.channelCreateFailed': 'Nepavyko sukurti kanalo',
    'groups.channelCreated': 'Kanalas sukurtas',
    'groups.channelDeleteFailed': 'Nepavyko ištrinti kanalo',
    'groups.channelDeleted': 'Kanalas ištrintas',
    'groups.channelName': 'Kanalo pavadinimas',
    'groups.channelNameExists': 'Šis kanalo pavadinimas jau naudojamas',
    'groups.channelNameRequired': 'Įveskite kanalo pavadinimą',
    'groups.channelType': 'Kanalo tipas',
    'groups.channelTypeAnnouncement': 'Pranešimas',
    'groups.channelTypeReadonly': 'Tik skaitymui',
    'groups.channelTypeText': 'Tekstas',
    'groups.channelTypeWhoWrites': 'Gali rašyti: {{roles}}',
    'groups.createChannel': 'Sukurti kanalą',
    'groups.deleteChannel': 'Ištrinti kanalą',
  },
  mt: {
    'common.create': 'Oħloq',
    'groups.addChannel': 'Żid kanal',
    'groups.channelCreateFailed': "Ma setg'etx toħloq il-kanal",
    'groups.channelCreated': 'Il-kanal inħoloq',
    'groups.channelDeleteFailed': "Ma setg'etx tħassar il-kanal",
    'groups.channelDeleted': 'Il-kanal inħassar',
    'groups.channelName': 'Isem il-kanal',
    'groups.channelNameExists': "Dan l-isem tal-kanal diġà qed jintuża",
    'groups.channelNameRequired': 'Daħħal isem tal-kanal',
    'groups.channelType': "Tip ta' kanal",
    'groups.channelTypeAnnouncement': 'Annunzju',
    'groups.channelTypeReadonly': 'Aqra biss',
    'groups.channelTypeText': 'Testu',
    'groups.channelTypeWhoWrites': 'Jistgħu jiktbu: {{roles}}',
    'groups.createChannel': 'Oħloq kanal',
    'groups.deleteChannel': 'Ħassar il-kanal',
  },
  pl: {
    'common.create': 'Utwórz',
    'groups.addChannel': 'Dodaj kanał',
    'groups.channelCreateFailed': 'Nie udało się utworzyć kanału',
    'groups.channelCreated': 'Kanał utworzony',
    'groups.channelDeleteFailed': 'Nie udało się usunąć kanału',
    'groups.channelDeleted': 'Kanał usunięty',
    'groups.channelName': 'Nazwa kanału',
    'groups.channelNameExists': 'Ta nazwa kanału jest już zajęta',
    'groups.channelNameRequired': 'Wpisz nazwę kanału',
    'groups.channelType': 'Typ kanału',
    'groups.channelTypeAnnouncement': 'Ogłoszenie',
    'groups.channelTypeReadonly': 'Tylko do odczytu',
    'groups.channelTypeText': 'Tekst',
    'groups.channelTypeWhoWrites': 'Mogą pisać: {{roles}}',
    'groups.createChannel': 'Utwórz kanał',
    'groups.deleteChannel': 'Usuń kanał',
  },
  sk: {
    'common.create': 'Vytvoriť',
    'groups.addChannel': 'Pridať kanál',
    'groups.channelCreateFailed': 'Nepodarilo sa vytvoriť kanál',
    'groups.channelCreated': 'Kanál vytvorený',
    'groups.channelDeleteFailed': 'Nepodarilo sa odstrániť kanál',
    'groups.channelDeleted': 'Kanál odstránený',
    'groups.channelName': 'Názov kanála',
    'groups.channelNameExists': 'Tento názov kanála sa už používa',
    'groups.channelNameRequired': 'Zadajte názov kanála',
    'groups.channelType': 'Typ kanála',
    'groups.channelTypeAnnouncement': 'Oznámenie',
    'groups.channelTypeReadonly': 'Iba na čítanie',
    'groups.channelTypeText': 'Textový kanál',
    'groups.channelTypeWhoWrites': 'Mohú písať: {{roles}}',
    'groups.createChannel': 'Vytvoriť kanál',
    'groups.deleteChannel': 'Odstrániť kanál',
  },
  sl: {
    'common.create': 'Ustvari',
    'groups.addChannel': 'Dodaj kanal',
    'groups.channelCreateFailed': 'Kanala ni bilo mogoče ustvariti',
    'groups.channelCreated': 'Kanal ustvarjen',
    'groups.channelDeleteFailed': 'Kanala ni bilo mogoče izbrisati',
    'groups.channelDeleted': 'Kanal izbrisan',
    'groups.channelName': 'Ime kanala',
    'groups.channelNameExists': 'To ime kanala je že zasedeno',
    'groups.channelNameRequired': 'Vnesite ime kanala',
    'groups.channelType': 'Vrsta kanala',
    'groups.channelTypeAnnouncement': 'Obvestilo',
    'groups.channelTypeReadonly': 'Samo za branje',
    'groups.channelTypeText': 'Besedilo',
    'groups.channelTypeWhoWrites': 'Lahko pišejo: {{roles}}',
    'groups.createChannel': 'Ustvari kanal',
    'groups.deleteChannel': 'Izbriši kanal',
  },
  cs: {
    'common.create': 'Vytvořit',
    'groups.addChannel': 'Přidat kanál',
    'groups.channelCreateFailed': 'Kanál se nepodařilo vytvořit',
    'groups.channelCreated': 'Kanál vytvořen',
    'groups.channelDeleteFailed': 'Kanál se nepodařilo odstranit',
    'groups.channelDeleted': 'Kanál odstraněn',
    'groups.channelName': 'Název kanálu',
    'groups.channelNameExists': 'Tento název kanálu se již používá',
    'groups.channelNameRequired': 'Zadejte název kanálu',
    'groups.channelType': 'Typ kanálu',
    'groups.channelTypeAnnouncement': 'Oznámení',
    'groups.channelTypeReadonly': 'Pouze ke čtení',
    'groups.channelTypeText': 'Textový kanál',
    'groups.channelTypeWhoWrites': 'Mohou psát: {{roles}}',
    'groups.createChannel': 'Vytvořit kanál',
    'groups.deleteChannel': 'Odstranit kanál',
  },
  bg: {
    'common.create': 'Създай',
    'groups.addChannel': 'Добавяне на канал',
    'groups.channelCreateFailed': 'Не успях да създам канала',
    'groups.channelCreated': 'Каналът е създаден',
    'groups.channelDeleteFailed': 'Не успях да изтрия канала',
    'groups.channelDeleted': 'Каналът е изтрит',
    'groups.channelName': 'Име на канала',
    'groups.channelNameExists': 'Това име на канала вече се използва',
    'groups.channelNameRequired': 'Въведете име на канала',
    'groups.channelType': 'Тип на канала',
    'groups.channelTypeAnnouncement': 'Съобщение',
    'groups.channelTypeReadonly': 'Само за четене',
    'groups.channelTypeText': 'Текст',
    'groups.channelTypeWhoWrites': 'Могат да пишат: {{roles}}',
    'groups.createChannel': 'Създай канал',
    'groups.deleteChannel': 'Изтрий канала',
  },
  ga: {
    'common.create': 'Cruthaigh',
    'groups.addChannel': 'Cuir cainéal leis',
    'groups.channelCreateFailed': 'Theip ar chruthú an chainéil',
    'groups.channelCreated': 'Cainéal cruthaithe',
    'groups.channelDeleteFailed': 'Theip ar scrios an chainéil',
    'groups.channelDeleted': 'Cainéal scriosta',
    'groups.channelName': 'Ainm an chainéil',
    'groups.channelNameExists': 'Tá an t-ainm cainéil seo in úsáid cheana',
    'groups.channelNameRequired': 'Cuir ainm cainéil isteach',
    'groups.channelType': 'Cineál cainéil',
    'groups.channelTypeAnnouncement': 'Fógra',
    'groups.channelTypeReadonly': 'Léamh amháin',
    'groups.channelTypeText': 'Téacs',
    'groups.channelTypeWhoWrites': 'Is féidir scríobh do: {{roles}}',
    'groups.createChannel': 'Cruthaigh cainéal',
    'groups.deleteChannel': 'Scrios cainéal',
  },
  ro: {
    'common.create': 'Creează',
    'groups.addChannel': 'Adaugă canal',
    'groups.channelCreateFailed': 'Nu s-a putut crea canalul',
    'groups.channelCreated': 'Canal creat',
    'groups.channelDeleteFailed': 'Nu s-a putut șterge canalul',
    'groups.channelDeleted': 'Canal șters',
    'groups.channelName': 'Numele canalului',
    'groups.channelNameExists': 'Acest nume de canal este deja folosit',
    'groups.channelNameRequired': 'Introduceți un nume de canal',
    'groups.channelType': 'Tip de canal',
    'groups.channelTypeAnnouncement': 'Anunț',
    'groups.channelTypeReadonly': 'Doar citire',
    'groups.channelTypeText': 'Canal de text',
    'groups.channelTypeWhoWrites': 'Pot scrie: {{roles}}',
    'groups.createChannel': 'Creează canal',
    'groups.deleteChannel': 'Șterge canalul',
  },
  uk: {
    'common.create': 'Створити',
    'groups.addChannel': 'Додати канал',
    'groups.channelCreateFailed': 'Не вдалося створити канал',
    'groups.channelCreated': 'Канал створено',
    'groups.channelDeleteFailed': 'Не вдалося видалити канал',
    'groups.channelDeleted': 'Канал видалено',
    'groups.channelName': 'Назва каналу',
    'groups.channelNameExists': 'Ця назва каналу вже зайнята',
    'groups.channelNameRequired': 'Введіть назву каналу',
    'groups.channelType': 'Тип каналу',
    'groups.channelTypeAnnouncement': 'Оголошення',
    'groups.channelTypeReadonly': 'Лише читання',
    'groups.channelTypeText': 'Текст',
    'groups.channelTypeWhoWrites': 'Можуть писати: {{roles}}',
    'groups.createChannel': 'Створити канал',
    'groups.deleteChannel': 'Видалити канал',
  },
}

const escapeValue = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

// Garde-fou : une locale oubliée écrirait « undefined » dans le catalogue, et
// la phrase « qui écrit » sans son espace réservé n'afficherait aucun rôle.
const gaps = []
for (const [code, table] of Object.entries(DATA)) {
  for (const key of KEYS) {
    if (!table[key]) {
      gaps.push(`${code}/${key}`)
    } else if (key === 'groups.channelTypeWhoWrites' && !table[key].includes('{{roles}}')) {
      gaps.push(`${code}/${key} (sans {{roles}})`)
    }
  }
}
const locales = Object.keys(DATA)
if (locales.length !== 25) {
  console.error(`✗ expected 25 locales in DATA, found ${locales.length}`)
  process.exit(1)
}
if (gaps.length) {
  console.error(`✗ missing values: ${gaps.join(', ')}`)
  process.exit(1)
}

const file = FILE.pathname.replace(/^\/([A-Za-z]:)/, '$1')
const raw = readFileSync(file, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const lines = raw.split(/\r\n|\n/)

// Each locale block starts with `  <code>: {` at two-space indent and holds one
// nested `translation` object made of flat "a.b" keys.
const marks = []
lines.forEach((line, i) => {
  const m = /^  ([a-z]{2}): \{\s*$/.exec(line)
  if (m) marks.push({ code: m[1], i })
})

const missing = locales.filter((c) => !marks.some((m) => m.code === c))
if (missing.length) {
  console.error(`✗ locale blocks not found in translations.ts: ${missing.join(', ')}`)
  process.exit(1)
}
const unknownBlocks = marks.filter((m) => !locales.includes(m.code)).map((m) => m.code)
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
    const re = new RegExp('^[ \\t]*"' + key.replace(/\./g, '\\.') + '":\\s*"(?:[^"\\\\]|\\\\.)*",?[ \\t]*$')
    const at = block.findIndex((l) => re.test(l))
    if (at >= 0) {
      if (block[at] !== line) { block[at] = line; replaced++ }
    } else {
      pending.push(line)
    }
  }

  if (pending.length) {
    // Insert before the closing brace of the `translation` object (four-space
    // indent), not before the locale's own brace.
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
console.log(`✓ ${locales.length} locales · ${KEYS.length} keys · ${replaced} lines rewritten, ${inserted} lines added`)
