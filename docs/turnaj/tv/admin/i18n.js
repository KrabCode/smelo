// Admin console UI strings.
//
// Only the console chrome is translated. Content that ends up on the TV —
// rules, ticker notes, table names, break texts, the waiting message — stays
// Czech no matter what the operator picks, because the players read it.

const STRINGS = {
    cs: {
        'gate.password': 'Heslo',
        'gate.unlock': 'Odemknout',
        'gate.wrong': 'Špatné heslo',
        'error.saveFailed': 'Uložení selhalo: ',

        'save.saving': 'Ukládám...',
        'save.saved': 'Uloženo ✓',
        'save.error': 'Chyba ✗',

        'sec.timer': 'Timer',
        'sec.players': 'Hráči',
        'sec.winners': 'Výsledky',
        'sec.payout': 'Výplaty',
        'sec.tables': 'Stoly',
        'sec.seating': 'Místa',
        'sec.notes': 'Poznámky (ticker)',
        'sec.rules': 'Pravidla (TV)',
        'sec.blinds': 'Struktura blindů',
        'sec.breaks': 'Přestávky',
        'sec.config': 'Nastavení turnaje',
        'sec.profiles': 'Profily turnaje',
        'sec.sounds': 'Zvuky',
        'sec.log': 'Log',
        'sec.language': 'Jazyk',

        'timer.start': 'Start',
        'timer.running': 'Běží...',
        'timer.pause': 'Pauza',
        'timer.resume': 'Pokračovat',
        'timer.reset': 'Reset',
        'timer.startOfTournament': 'Začátek turnaje',
        'timer.set': 'Nastavit',
        'timer.levelBack': 'Level zpět',
        'timer.levelFwd': 'Level vpřed',
        'timer.confirmStart': 'Spustit timer?',
        'timer.confirmReset': 'Opravdu resetovat timer?',

        'status.waiting': 'Čeká se',
        'status.running': 'Běží',
        'status.finished': 'Ukončen',
        'status.ended': 'Turnaj ukončen',
        'label.pause': 'PAUZA',
        'label.break': 'PŘESTÁVKA',
        'label.level': 'Level',

        'players.namePlaceholder': 'Jméno hráče...',
        'players.add': '+ Hráč',
        'players.test': '+ Test (8)',
        'players.removeAll': 'Smazat vše',
        'players.confirmTest': 'Přidat 8 testovacích hráčů?',
        'players.confirmRemoveAll': 'Opravdu smazat všechny hráče?',
        'players.confirmRemove': 'Odebrat {name}?',
        'players.random': 'Náhodné',
        'players.remove': 'Odebrat',
        'players.noSeat': 'bez místa',
        'th.player': 'Hráč',
        'th.table': 'Stůl',
        'th.buys': 'Buys',
        'th.addon': 'Add-on',
        'th.bonus': 'Bonus',
        'th.active': 'Aktivní',
        'th.time': 'Čas',

        'winners.declare': 'Vyhlásit vítěze',
        'winners.declared': 'Vítězové vyhlášeni ✓',
        'winners.clear': 'Smazat výsledky',
        'winners.confirmClear': 'Smazat výsledky?',
        'winners.place': 'místo',
        'winners.namePlaceholder': 'Jméno hráče...',

        'payout.pool': 'Prize pool',
        'payout.places': 'míst',
        'payout.fee': 'Poplatek',
        'payout.total': 'Celkem',
        'payout.addPlace': '+ Místo',
        'payout.removePlace': '− Místo',
        'payout.auto': 'Auto',

        'tables.add': '+ Stůl',
        'tables.save': 'Uložit',
        'tables.saved': 'Uloženo',
        'tables.confirmRemove': 'Smazat stůl "{name}"?',

        'seating.locked': 'Zamčený',
        'seating.open': 'Otevřený',
        'seating.free': 'volných',
        'seating.rotate': 'Otočit o 90°',
        'seating.walls': 'Zdi:',
        'seating.rebalance': 'Rebalance?',
        'seating.reshuffle': 'Přepočítat místa',
        'seating.confirmReshuffle': 'Přepočítat zasedací pořádek?',

        'notes.add': '+ Poznámka',
        'notes.tickerSpeed': 'Rychlost tickeru:',

        'rules.hint': 'Text za <b>|</b> se zobrazí jako štítek',
        'rules.sectionName': 'Název sekce...',
        'rules.addRule': '+ Pravidlo',
        'rules.addSection': '+ Sekce',
        'rules.removeSection': 'Smazat sekci',
        'rules.confirmRemoveRule': 'Smazat pravidlo?',
        'rules.confirmRemoveSection': 'Smazat celou sekci pravidel?',

        'breaks.hint': 'Každá přestávka začne po zvoleném levelu. Popisek se ukáže ve struktuře, text běží na TV během přestávky.',
        'breaks.afterLevel': 'Po levelu',
        'breaks.duration': 'Délka (min)',
        'breaks.none': 'Žádné přestávky',
        'breaks.outside': 'mimo strukturu',
        'breaks.remove': 'Smazat přestávku',
        'breaks.labelPlaceholder': 'Popisek ve struktuře (např. Konec re-buyů)',
        'breaks.messagePlaceholder': 'Text na TV během přestávky — první řádek větším písmem...',
        'breaks.add': '+ Přestávka',

        'cfg.structure': 'Struktura',
        'cfg.levelDur': 'Délka levelu (min)',
        'cfg.maxLevels': 'Max levelů',
        'cfg.ante': 'Ante (× BB)',
        'cfg.startEst': 'Orientační začátek',
        'cfg.waitingMsg': 'Text před začátkem',
        'cfg.chips': 'Žetony',
        'cfg.buyin': 'Buy-in (Kč)',
        'cfg.buyinChips': 'Žetonů za buy-in',
        'cfg.bonus': 'Bonus žetony za včasný příchod',
        'cfg.bounty': 'Bounty',
        'cfg.bountyAmount': 'Bounty za vyřazení (Kč)',
        'cfg.bountyHint': 'Jen informativní — nevstupuje do prize poolu',
        'cfg.addon': 'Add-on',
        'cfg.addonPrice': 'Add-on cena (Kč)',
        'cfg.addonChips': 'Add-on žetony',
        'cfg.fees': 'Poplatky',
        'cfg.organizerFee': 'Poplatek organizátorům (Kč)',
        'cfg.organizerFeeHint': 'Odečte se z prize poolu před výplatou',

        'profiles.hint': 'Uloží i načte celé nastavení turnaje — strukturu blindů, přestávky, žetony, buy-in i poplatky.',
        'profiles.none': '— Uložené profily —',
        'profiles.load': 'Načíst',
        'profiles.delete': 'Smazat profil',
        'profiles.namePlaceholder': 'Název profilu…',
        'profiles.save': 'Uložit jako profil',
        'profiles.saved': 'Uloženo ✓',
        'profiles.confirmOverwrite': 'Profil „{name}" už existuje. Přepsat?',
        'profiles.confirmLoad': 'Načíst profil „{name}"? Přepíše aktuální strukturu a nastavení turnaje.',
        'profiles.confirmDelete': 'Smazat profil „{name}"?',

        'sounds.none': '— žádný —',
        'sounds.levelChange': 'Změna levelu',
        'sounds.buyin': 'Buy-in / re-buy',
        'sounds.koLoss': 'Vyřazení (prohra)',
        'sounds.koWin': 'Vyřazení (výhra)',
        'sounds.end': 'Konec turnaje',
        'sounds.test': 'Test',

        'log.empty': 'Žádné události',
        'log.clear': 'Smazat log',
        'log.confirmClear': 'Smazat log událostí?',
        'log.buyin': 'Buy-in',
        'log.rebuy': 'Re-buy',
        'log.addon': 'Add-on',
        'log.knockout': 'Vyřazen',
        'log.reentry': 'Návrat'
    },

    uk: {
        'gate.password': 'Пароль',
        'gate.unlock': 'Розблокувати',
        'gate.wrong': 'Невірний пароль',
        'error.saveFailed': 'Не вдалося зберегти: ',

        'save.saving': 'Зберігаю...',
        'save.saved': 'Збережено ✓',
        'save.error': 'Помилка ✗',

        'sec.timer': 'Таймер',
        'sec.players': 'Гравці',
        'sec.winners': 'Результати',
        'sec.payout': 'Виплати',
        'sec.tables': 'Столи',
        'sec.seating': 'Місця',
        'sec.notes': 'Нотатки (біжучий рядок)',
        'sec.rules': 'Правила (ТВ)',
        'sec.blinds': 'Структура блайндів',
        'sec.breaks': 'Перерви',
        'sec.config': 'Налаштування турніру',
        'sec.profiles': 'Профілі турніру',
        'sec.sounds': 'Звуки',
        'sec.log': 'Лог',
        'sec.language': 'Мова',

        'timer.start': 'Старт',
        'timer.running': 'Триває...',
        'timer.pause': 'Пауза',
        'timer.resume': 'Продовжити',
        'timer.reset': 'Скинути',
        'timer.startOfTournament': 'Початок турніру',
        'timer.set': 'Встановити',
        'timer.levelBack': 'Рівень назад',
        'timer.levelFwd': 'Рівень вперед',
        'timer.confirmStart': 'Запустити таймер?',
        'timer.confirmReset': 'Справді скинути таймер?',

        'status.waiting': 'Очікування',
        'status.running': 'Триває',
        'status.finished': 'Завершено',
        'status.ended': 'Турнір завершено',
        'label.pause': 'ПАУЗА',
        'label.break': 'ПЕРЕРВА',
        'label.level': 'Рівень',

        'players.namePlaceholder': 'Ім’я гравця...',
        'players.add': '+ Гравець',
        'players.test': '+ Тест (8)',
        'players.removeAll': 'Видалити все',
        'players.confirmTest': 'Додати 8 тестових гравців?',
        'players.confirmRemoveAll': 'Справді видалити всіх гравців?',
        'players.confirmRemove': 'Видалити {name}?',
        'players.random': 'Випадково',
        'players.remove': 'Видалити',
        'players.noSeat': 'без місця',
        'th.player': 'Гравець',
        'th.table': 'Стіл',
        'th.buys': 'Buy-in',
        'th.addon': 'Add-on',
        'th.bonus': 'Бонус',
        'th.active': 'Активний',
        'th.time': 'Час',

        'winners.declare': 'Оголосити переможців',
        'winners.declared': 'Переможців оголошено ✓',
        'winners.clear': 'Видалити результати',
        'winners.confirmClear': 'Видалити результати?',
        'winners.place': 'місце',
        'winners.namePlaceholder': 'Ім’я гравця...',

        'payout.pool': 'Призовий фонд',
        'payout.places': 'місць',
        'payout.fee': 'Комісія',
        'payout.total': 'Разом',
        'payout.addPlace': '+ Місце',
        'payout.removePlace': '− Місце',
        'payout.auto': 'Авто',

        'tables.add': '+ Стіл',
        'tables.save': 'Зберегти',
        'tables.saved': 'Збережено',
        'tables.confirmRemove': 'Видалити стіл «{name}»?',

        'seating.locked': 'Закритий',
        'seating.open': 'Відкритий',
        'seating.free': 'вільних',
        'seating.rotate': 'Повернути на 90°',
        'seating.walls': 'Стіни:',
        'seating.rebalance': 'Ребаланс?',
        'seating.reshuffle': 'Перерахувати місця',
        'seating.confirmReshuffle': 'Перерахувати розсадку?',

        'notes.add': '+ Нотатка',
        'notes.tickerSpeed': 'Швидкість рядка:',

        'rules.hint': 'Текст після <b>|</b> показується як мітка',
        'rules.sectionName': 'Назва розділу...',
        'rules.addRule': '+ Правило',
        'rules.addSection': '+ Розділ',
        'rules.removeSection': 'Видалити розділ',
        'rules.confirmRemoveRule': 'Видалити правило?',
        'rules.confirmRemoveSection': 'Видалити весь розділ правил?',

        'breaks.hint': 'Кожна перерва починається після вибраного рівня. Підпис показується у структурі, текст іде на ТВ під час перерви.',
        'breaks.afterLevel': 'Після рівня',
        'breaks.duration': 'Тривалість (хв)',
        'breaks.none': 'Немає перерв',
        'breaks.outside': 'поза структурою',
        'breaks.remove': 'Видалити перерву',
        'breaks.labelPlaceholder': 'Підпис у структурі (напр. Кінець re-buy)',
        'breaks.messagePlaceholder': 'Текст на ТВ під час перерви — перший рядок більшим шрифтом...',
        'breaks.add': '+ Перерва',

        'cfg.structure': 'Структура',
        'cfg.levelDur': 'Тривалість рівня (хв)',
        'cfg.maxLevels': 'Макс. рівнів',
        'cfg.ante': 'Анте (× BB)',
        'cfg.startEst': 'Орієнтовний початок',
        'cfg.waitingMsg': 'Текст перед початком',
        'cfg.chips': 'Фішки',
        'cfg.buyin': 'Buy-in (Kč)',
        'cfg.buyinChips': 'Фішок за buy-in',
        'cfg.bonus': 'Бонусні фішки за вчасний прихід',
        'cfg.bounty': 'Bounty',
        'cfg.bountyAmount': 'Bounty за виліт (Kč)',
        'cfg.bountyHint': 'Лише інформативно — не входить у призовий фонд',
        'cfg.addon': 'Add-on',
        'cfg.addonPrice': 'Ціна add-on (Kč)',
        'cfg.addonChips': 'Фішки за add-on',
        'cfg.fees': 'Комісії',
        'cfg.organizerFee': 'Комісія організаторам (Kč)',
        'cfg.organizerFeeHint': 'Віднімається з призового фонду перед виплатою',

        'profiles.hint': 'Зберігає та завантажує всі налаштування турніру — структуру блайндів, перерви, фішки, buy-in і комісії.',
        'profiles.none': '— Збережені профілі —',
        'profiles.load': 'Завантажити',
        'profiles.delete': 'Видалити профіль',
        'profiles.namePlaceholder': 'Назва профілю…',
        'profiles.save': 'Зберегти як профіль',
        'profiles.saved': 'Збережено ✓',
        'profiles.confirmOverwrite': 'Профіль «{name}» вже існує. Перезаписати?',
        'profiles.confirmLoad': 'Завантажити профіль «{name}»? Це перезапише поточну структуру та налаштування турніру.',
        'profiles.confirmDelete': 'Видалити профіль «{name}»?',

        'sounds.none': '— немає —',
        'sounds.levelChange': 'Зміна рівня',
        'sounds.buyin': 'Buy-in / re-buy',
        'sounds.koLoss': 'Виліт (програш)',
        'sounds.koWin': 'Виліт (виграш)',
        'sounds.end': 'Кінець турніру',
        'sounds.test': 'Тест',

        'log.empty': 'Немає подій',
        'log.clear': 'Очистити лог',
        'log.confirmClear': 'Очистити лог подій?',
        'log.buyin': 'Buy-in',
        'log.rebuy': 'Re-buy',
        'log.addon': 'Add-on',
        'log.knockout': 'Вибув',
        'log.reentry': 'Повернення'
    }
};

let lang = localStorage.getItem('adminLang') === 'uk' ? 'uk' : 'cs';

export function getLang() {
    return lang;
}

export function setLang(next) {
    lang = STRINGS[next] ? next : 'cs';
    localStorage.setItem('adminLang', lang);
}

// t('players.confirmRemove', { name: 'Franta' })
export function t(key, params) {
    let s = STRINGS[lang][key] || STRINGS.cs[key] || key;
    if (params) {
        for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(v);
    }
    return s;
}

export function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    document.documentElement.lang = lang;
}
