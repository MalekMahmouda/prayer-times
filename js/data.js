'use strict';

/**
 * Static data for the Prayer Times renderer.
 * All datasets transcribed verbatim from the Phase 1 single-file build.
 */

/* ═══ SHARED DATE / TIMEZONE HELPERS (app-wide single source) ═══ */
/* Local calendar date key 'YYYY-MM-DD' from LOCAL components.
   NEVER use toISOString().slice(0,10) for local-day data — it is UTC-based
   and shifts the day for 00:00–03:00 in UTC+3 (and similar zones). */
function localDateKey(d) {
  const x = d instanceof Date ? d : new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/* IANA timezone validation — accepts multi-path zones like
   America/Argentina/Buenos_Aires. Prefers Intl.DateTimeFormat (the same
   database the runtime uses) over a fragile regex. */
function isValidTimezone(tz) {
  if (typeof tz !== 'string') return false;
  const s = tz.trim();
  if (!s) return false;
  if (s === 'UTC') return true;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(s)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: s }); return true; }
  catch (e) { return false; }
}

/* ═══ THEMES (design-token palettes) — 3 dark / 5 light, no near-duplicates ═══ */
const THEMES = [
  { id: 'midnight', en: 'Midnight', ar: 'ليلي',    color: '#4f7dff', dark: true },
  { id: 'royal',    en: 'Royal',    ar: 'ملكي',     color: '#a78bfa', dark: true },
  { id: 'oled',     en: 'OLED',     ar: 'أسود',     color: '#79ffb0', dark: true },
  // (dark flag consumed by widget isDark + Android status-bar luminance)
  { id: 'blue',     en: 'Blue',     ar: 'أزرق',     color: '#0a6aaa', dark: false },
  { id: 'emerald',  en: 'Emerald',  ar: 'زمردي',    color: '#1d7a44', dark: false },
  { id: 'islamic',  en: 'Islamic',  ar: 'إسلامي',   color: '#146b47', dark: false },
  { id: 'ocean',    en: 'Ocean',    ar: 'محيطي',    color: '#0a4a7c', dark: false },
  { id: 'sahara',   en: 'Sahara',   ar: 'صحراوي',   color: '#b45309', dark: false },
];

// Migration map for theme ids saved by earlier builds.
const THEME_MIGRATE = {
  emerald: 'islamic', desert: 'sahara', rose: 'royal', slate: 'blue',
  forest: 'ocean', purple: 'royal', violet: 'royal', light: 'sahara',
  midnight: 'midnight', ocean: 'ocean',
};

/* ═══ ADHAN SOUNDS ═══ */
const ADHAN_SOUNDS = {
  alafasy: 'https://cdn.aladhan.com/audio/adhans/a9.mp3',
  nafees:  'https://cdn.aladhan.com/audio/adhans/a1.mp3',
  dubai:   'https://cdn.aladhan.com/audio/adhans/a4.mp3',
  zahrani: 'https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3',
  turkey:  'https://cdn.aladhan.com/audio/adhans/a2.mp3',
  classic: 'https://cdn.aladhan.com/audio/adhans/a7.mp3',
};

/* ═══ QURAN RECITERS (cdn.islamic.network, bitrates verified per edition) ═══ */
const RECITERS = [
  { id: 'ar.alafasy',         en: 'Mishary Alafasy',       ar: 'مشاري العفاسي',       br: 128 },
  { id: 'ar.abdulbasitmurattal', en: 'Abdul Basit (Murattal)', ar: 'عبد الباسط (مرتل)', br: 192 },
  { id: 'ar.abdurrahmaansudais', en: 'Abdurrahman As-Sudais', ar: 'عبد الرحمن السديس', br: 192 },
  { id: 'ar.husary',          en: 'Mahmoud Al-Husary',     ar: 'محمود الحصري',       br: 128 },
  { id: 'ar.minshawi',        en: 'Mohamed Al-Minshawi',   ar: 'محمد المنشاوي',      br: 128 },
];

/* ═══ PRAYER CONSTANTS ═══ */
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const AR_PRAYER = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const ICON_PRAYER = { Fajr: '🌅', Dhuhr: '☀️', Asr: '🌤', Maghrib: '🌇', Isha: '🌙' };

const HME = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab',"Sha'ban",'Ramadan','Shawwal',"Dhu al-Qi'dah",'Dhu al-Hijjah'];
const HMA = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];

/* ═══ I18N ═══ */
const T = {
  en: {
    appName: 'Prayer Times', sub: 'Islamic Companion',
    nav: { prayers: 'Prayers', calendar: 'Calendar', qibla: 'Qibla', quran: 'Quran', names: '99 Names', dhikr: 'Dhikr', stats: 'Stats', settings: 'Settings' },
    more: 'More', language: 'Language', location: 'Location',
    nextPrayer: 'Next Prayer', startsIn: 'Starts in', today: 'Today',
    tomorrow: 'Tomorrow', next: 'NEXT', passed: 'Passed', current: 'Now',
    gregorian: 'Gregorian', hijri: 'Hijri',
    sunNight: 'Sun & Night', sunrise: 'Sunrise', sunset: 'Sunset', solarNoon: 'Solar Noon',
    midnight: 'Midnight', firstThird: 'First Third', lastThird: 'Last Third',
    glance: 'Today at a Glance', prayersCount: 'Prayers', qiblaBearing: 'Qibla',
    hist: { title: 'Prayer Record', hint: 'Tap a prayer to cycle: Not recorded → Completed → Missed' },
    offline: 'Offline', cached: 'Using cached times', detecting: 'Detecting…',
    setDate: 'Date', failedLoad: 'Failed to load. Check connection.',
    cal: { title: 'Monthly Calendar', prev: 'Previous month', nextM: 'Next month', todayBtn: 'Today', selectDay: 'Select a day to see prayer times', noTimes: 'Times unavailable for this date', exportCsv: 'Export month (CSV)' },
    qibla: { title: 'Qibla Direction', from: 'from', distance: 'Distance to Kaaba', km: 'km', yourCoords: 'Your coordinates', kaabaCoords: 'Kaaba coordinates', how: 'How to use', howText: 'Face the direction shown by the bearing. The dial rotates the Kaaba marker to the qibla angle from North.', live: 'Live compass — turn until the 🕋 marker points forward', calibrate: 'Compass unreliable — move the phone in a ∞ figure to calibrate', noSensor: 'No compass data yet — showing static bearing', static: 'Static bearing — this device has no compass' },
    quran: { search: 'Search surah by name or number…', meccan: 'Meccan', medinan: 'Medinan', verses: 'verses', noResults: 'No surahs found.', reciter: 'Reciter', loading: 'Could not load audio. Check connection.' },
    names: { search: 'Search by name or meaning…', day: 'Name of the Day', all: 'All 99 Names', dhikr: 'Dhikr', noResults: 'No names found.', source: 'Asma Allah al-Husna' },
    dhikr: { title: 'Dhikr Counter', target: 'Target', custom: 'Custom', reset: 'Reset', daily: 'Today', total: 'All time', tapHint: 'Tap the counter or press Space', done: 'Target reached — Alhamdulillah!' },
    set: {
      title: 'Settings', general: 'General', language: 'Language', theme: 'Theme', h24: '24-Hour Format',
      calc: 'Prayer Calculation', method: 'Method', madhab: 'Asr school', madhabS: 'Used by ISNA and custom methods', shafi: 'Shafi (standard)', hanafi: 'Hanafi',
      adhanSec: 'Adhan', reciter: 'Reciter', volume: 'Volume', perPrayer: 'Per-prayer Adhan', overlay: 'Fullscreen Adhan overlay', testAdhan: 'Test Adhan',
      desktop: 'Desktop', sww: 'Start with Windows', swwS: 'Launch automatically at login', ctt: 'Close to Tray', cttS: 'Keep running in the system tray when closed', testNotif: 'Test Notification',
      location: 'Location', gps: 'Use GPS / Current Location', searchCity: 'Search city', city: 'City', country: 'Country', setLoc: 'Search & Set Location', cancel: 'Cancel', coords: 'Coordinates',
      notif: 'Prayer Alerts', notifS: 'Notify before each prayer', minutesBefore: 'Minutes before', beep: 'Pre-prayer beep', adhanSound: 'Play adhan at prayer time',
      adjust: 'Time Adjustments (min)', dataNote: 'All data is stored locally on this device. No account, no analytics.',
    },
    toast: { locSet: 'Location updated!', locFail: 'City not found. Try again.', noCity: 'Please enter a city', gpsDenied: 'Location denied. Set manually.', gpsNo: 'Geolocation not supported', switchedEn: 'Switched to English 🌙', switchedAr: 'تم التبديل للعربية 🌙', testIn3: 'Test notification in 3s…', deskOnly: 'Desktop mode only', beep: '🔊', adhanPlay: 'Playing adhan preview…' },
    dh: { subhan: 'SubhanAllah', subhanAr: 'سُبْحَانَ اللَّه', alhamd: 'Alhamdulillah', alhamdAr: 'الْحَمْدُ لِلَّه', akbar: 'Allahu Akbar', akbarAr: 'اللَّهُ أَكْبَر', tahlil: 'La ilaha illa Allah', tahlilAr: 'لَا إِلَٰهَ إِلَّا اللَّه', istighfar: 'Astaghfirullah', istighfarAr: 'أَسْتَغْفِرُ اللَّه', salawat: 'Salawat', salawatAr: 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ' },
  },
  ar: {
    appName: 'أوقات الصلاة', sub: 'رفيق إسلامي',
    nav: { prayers: 'الصلوات', calendar: 'التقويم', qibla: 'القبلة', quran: 'القرآن', names: 'أسماء الله', dhikr: 'الذكر', stats: 'الإحصاءات', settings: 'الإعدادات' },
    more: 'المزيد', language: 'اللغة', location: 'الموقع',
    nextPrayer: 'الصلاة القادمة', startsIn: 'تبدأ بعد', today: 'اليوم',
    tomorrow: 'غداً', next: 'التالية', passed: 'انقضت', current: 'الآن',
    gregorian: 'الميلادي', hijri: 'الهجري',
    sunNight: 'الشمس والليل', sunrise: 'الشروق', sunset: 'الغروب', solarNoon: 'الظهر شمسياً',
    midnight: 'منتصف الليل', firstThird: 'الثلث الأول', lastThird: 'الثلث الأخير',
    glance: 'نظرة سريعة', prayersCount: 'الصلوات', qiblaBearing: 'القبلة',
    hist: { title: 'سجل الصلوات', hint: 'اضغط على الصلاة للتبديل: غير مسجلة → أدّيتها → فاتتني' },
    offline: 'غير متصل', cached: 'أوقات مخزنة مؤقتاً', detecting: 'جاري التحديد…',
    setDate: 'التاريخ', failedLoad: 'فشل التحميل. تحقق من الاتصال.',
    cal: { title: 'التقويم الشهري', prev: 'الشهر السابق', nextM: 'الشهر التالي', todayBtn: 'اليوم', selectDay: 'اختر يوماً لعرض أوقات الصلاة', noTimes: 'الأوقات غير متاحة لهذا التاريخ', exportCsv: 'تصدير الشهر (CSV)' },
    qibla: { title: 'اتجاه القبلة', from: 'من', distance: 'المسافة إلى الكعبة', km: 'كم', yourCoords: 'إحداثياتك', kaabaCoords: 'إحداثيات الكعبة', how: 'كيفية الاستخدام', howText: 'اتجه نحو الدرجة المعروضة. تدور البوصلة لتشير علامة الكعبة إلى زاوية القبلة من الشمال.', live: 'بوصلة حية — أدر الهاتف حتى يشير مؤشر 🕋 إلى الأمام', calibrate: 'البوصلة غير مستقرة — حرّك الهاتف على شكل ∞ للمعايرة', noSensor: 'لا توجد بيانات بوصلة بعد — يتم عرض الاتجاه الثابت', static: 'اتجاه ثابت — هذا الجهاز لا يحتوي بوصلة' },
    quran: { search: 'ابحث عن سورة بالاسم أو الرقم…', meccan: 'مكية', medinan: 'مدنية', verses: 'آية', noResults: 'لا توجد نتائج.', reciter: 'القارئ', loading: 'تعذر تحميل الصوت. تحقق من الاتصال.' },
    names: { search: 'ابحث عن الاسم أو المعنى…', day: 'اسم اليوم', all: 'أسماء الله الحسنى', dhikr: 'الذكر', noResults: 'لا توجد نتائج.', source: 'أسماء الله الحسنى' },
    dhikr: { title: 'مسبحة إلكترونية', target: 'الهدف', custom: 'مخصص', reset: 'تصفير', daily: 'اليوم', total: 'الإجمالي', tapHint: 'اضغط على العداد أو مفتاح المسافة', done: 'اكتمل الهدف — الحمد لله!' },
    set: {
      title: 'الإعدادات', general: 'عام', language: 'اللغة', theme: 'المظهر', h24: 'صيغة 24 ساعة',
      calc: 'طريقة الحساب', method: 'الطريقة', madhab: 'مذهب العصر', madhabS: 'تُستخدم في طريقة أمريكا الشمالية والطريقة المخصصة', shafi: 'شافعي (القياسي)', hanafi: 'حنفي',
      adhanSec: 'الأذان', reciter: 'المؤذن', volume: 'مستوى الصوت', perPrayer: 'الأذان لكل صلاة', overlay: 'شاشة كاملة للأذان', testAdhan: 'تجربة الأذان',
      desktop: 'سطح المكتب', sww: 'البدء مع ويندوز', swwS: 'تشغيل تلقائي عند تسجيل الدخول', ctt: 'التصغير إلى شريط المهام', cttS: 'يستمر بالعمل في شريط المهام عند الإغلاق', testNotif: 'تنبيه تجريبي',
      location: 'الموقع', gps: 'استخدام الموقع الحالي (GPS)', searchCity: 'بحث عن مدينة', city: 'المدينة', country: 'الدولة', setLoc: 'بحث وتحديد الموقع', cancel: 'إلغاء', coords: 'الإحداثيات',
      notif: 'تنبيهات الصلاة', notifS: 'إشعار قبل كل صلاة', minutesBefore: 'دقائق قبل', beep: 'تنبيه قبل الصلاة', adhanSound: 'تشغيل الأذان عند وقت الصلاة',
      adjust: 'تعديل الأوقات (د)', dataNote: 'جميع البيانات محفوظة محلياً على هذا الجهاز. لا حسابات ولا تحليلات.',
    },
    toast: { locSet: 'تم تحديث الموقع!', locFail: 'لم يتم العثور على المدينة. حاول مجدداً.', noCity: 'الرجاء إدخال مدينة', gpsDenied: 'تم رفض الموقع. حدد يدوياً.', gpsNo: 'تحديد الموقع غير مدعوم', switchedEn: 'Switched to English 🌙', switchedAr: 'تم التبديل للعربية 🌙', testIn3: 'تنبيه تجريبي بعد ٣ ثوان…', deskOnly: 'يعمل في وضع سطح المكتب فقط', beep: '🔊', adhanPlay: 'تجربة الأذان…' },
    dh: { subhan: 'سبحان الله', subhanAr: 'سُبْحَانَ اللَّه', alhamd: 'الحمد لله', alhamdAr: 'الْحَمْدُ لِلَّه', akbar: 'الله أكبر', akbarAr: 'اللَّهُ أَكْبَر', tahlil: 'لا إله إلا الله', tahlilAr: 'لَا إِلَٰهَ إِلَّا اللَّه', istighfar: 'أستغفر الله', istighfarAr: 'أَسْتَغْفِرُ اللَّه', salawat: 'الصلاة على النبي', salawatAr: 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ' },
  },
};

/* ═══ 99 NAMES — ASMA ALLAH AL-HUSNA (verbatim from Phase 1) ═══ */
const ASMA = [
  {n:1,  ar:'ٱللَّٰه',      tr:'Allah',          en:'The One God — the proper name of God, encompassing all His attributes.',                                              ar2:'الإله الواحد الأحد، الجامع لجميع صفات الكمال.',                                     dhikr:'يَا اللَّه'},
  {n:2,  ar:'ٱلرَّحْمَٰن',  tr:'Ar-Rahman',      en:'The Most Gracious — whose mercy embraces all of creation without exception.',                                          ar2:'الذي وسعت رحمتُه كلَّ شيء في الدنيا.',                                              dhikr:'يَا رَحْمَٰن'},
  {n:3,  ar:'ٱلرَّحِيم',    tr:'Ar-Rahim',        en:'The Most Merciful — who bestows special mercy on the believers in the Hereafter.',                                     ar2:'الذي يختص المؤمنين برحمته في الآخرة.',                                              dhikr:'يَا رَحِيم'},
  {n:4,  ar:'ٱلْمَلِك',     tr:'Al-Malik',        en:'The King — the absolute sovereign and ruler of all existence.',                                                       ar2:'المالك لجميع الخلق، المتصرف في الوجود كله.',                                        dhikr:'يَا مَلِك'},
  {n:5,  ar:'ٱلْقُدُّوس',   tr:'Al-Quddus',       en:'The Most Holy — perfectly pure and free from every deficiency or fault.',                                              ar2:'المنزَّه عن كل نقص وعيب وسوء.',                                                    dhikr:'يَا قُدُّوس'},
  {n:6,  ar:'ٱلسَّلَام',    tr:'As-Salam',        en:'The Source of Peace — from whom all peace originates and who grants safety.',                                          ar2:'الذي منه السلامة وإليه ترجع السلامة.',                                              dhikr:'يَا سَلَام'},
  {n:7,  ar:'ٱلْمُؤْمِن',   tr:'Al-Muʾmin',       en:'The Granter of Security — who gives faith and removes fear from His servants.',                                        ar2:'الذي يمنح الأمان ويُصدِّق المؤمنين.',                                               dhikr:'يَا مُؤْمِن'},
  {n:8,  ar:'ٱلْمُهَيْمِن', tr:'Al-Muhaymin',     en:'The Guardian — who watches over and protects all things with perfect awareness.',                                      ar2:'الرقيب الحافظ على كل شيء.',                                                        dhikr:'يَا مُهَيْمِن'},
  {n:9,  ar:'ٱلْعَزِيز',    tr:'Al-ʿAziz',        en:'The Almighty — the invincible and undefeatable whose power none can overcome.',                                        ar2:'الغالب الذي لا يُغلَب ولا يُقهَر.',                                                dhikr:'يَا عَزِيز'},
  {n:10, ar:'ٱلْجَبَّار',   tr:'Al-Jabbar',        en:'The Compeller — who repairs what is broken and subdues by His irresistible will.',                                     ar2:'الذي يجبر الكسير ويقهر بقدرته.',                                                   dhikr:'يَا جَبَّار'},
  {n:11, ar:'ٱلْمُتَكَبِّر',tr:'Al-Mutakabbir',   en:'The Supreme in Greatness — whose majesty and greatness is absolute and eternal.',                                      ar2:'المتعالي بعظمته، الكبير في ذاته وصفاته.',                                          dhikr:'يَا مُتَكَبِّر'},
  {n:12, ar:'ٱلْخَالِق',    tr:'Al-Khaliq',        en:'The Creator — who brings into existence from absolute nothingness.',                                                   ar2:'الذي أوجد الخلق من العدم.',                                                        dhikr:'يَا خَالِق'},
  {n:13, ar:'ٱلْبَارِئ',    tr:'Al-Bariʾ',         en:'The Originator — who distinguishes and fashions each creation uniquely.',                                              ar2:'المميِّز لكل مخلوق بهيئته وصورته.',                                                dhikr:'يَا بَارِئ'},
  {n:14, ar:'ٱلْمُصَوِّر',  tr:'Al-Musawwir',      en:'The Fashioner — who gives each created being its unique and perfect form.',                                            ar2:'الذي صوَّر كل خلقه بصورة مخصوصة.',                                                dhikr:'يَا مُصَوِّر'},
  {n:15, ar:'ٱلْغَفَّار',   tr:'Al-Ghaffar',       en:'The Perpetual Forgiver — who ceaselessly forgives the sins of those who repent.',                                     ar2:'الغافر للذنوب كثيراً، الكثير المغفرة.',                                             dhikr:'يَا غَفَّار'},
  {n:16, ar:'ٱلْقَهَّار',   tr:'Al-Qahhar',        en:'The Subduer — who overpowers and dominates everything in existence.',                                                  ar2:'القاهر فوق عباده، الغالب على كل شيء.',                                             dhikr:'يَا قَهَّار'},
  {n:17, ar:'ٱلْوَهَّاب',   tr:'Al-Wahhab',        en:'The Generous Bestower — who gives freely and abundantly without any return.',                                          ar2:'كثير العطاء الذي يهب بلا مقابل.',                                                  dhikr:'يَا وَهَّاب'},
  {n:18, ar:'ٱلرَّزَّاق',   tr:'Ar-Razzaq',        en:'The Provider — who sustains and provides for every living creature.',                                                  ar2:'الذي يرزق كل مخلوق ويكفل قوته.',                                                  dhikr:'يَا رَزَّاق'},
  {n:19, ar:'ٱلْفَتَّاح',   tr:'Al-Fattah',        en:'The Opener — who opens the doors of mercy, victory, and provision.',                                                   ar2:'الذي يفتح أبواب الرحمة والرزق والنصر.',                                            dhikr:'يَا فَتَّاح'},
  {n:20, ar:'ٱلْعَلِيم',    tr:'Al-ʿAlim',          en:'The All-Knowing — whose knowledge encompasses all things, hidden and manifest.',                                      ar2:'الذي أحاط علمه بكل شيء جليٍّ وخفيٍّ.',                                            dhikr:'يَا عَلِيم'},
  {n:21, ar:'ٱلْقَابِض',    tr:'Al-Qabid',          en:'The Withholder — who constricts provision and takes souls by His wisdom.',                                            ar2:'الذي يقبض الأرواح ويضيِّق الرزق بحكمة.',                                          dhikr:'يَا قَابِض'},
  {n:22, ar:'ٱلْبَاسِط',    tr:'Al-Basit',          en:'The Extender — who expands provision and opens His hand to bestow generously.',                                       ar2:'الذي يبسط الرزق ويوسعه لمن يشاء.',                                                dhikr:'يَا بَاسِط'},
  {n:23, ar:'ٱلْخَافِض',    tr:'Al-Khafid',         en:'The Abaser — who lowers the arrogant and humbles the wrongdoers.',                                                    ar2:'الذي يخفض ويُذلُّ الجبَّارين والمتكبرين.',                                         dhikr:'يَا خَافِض'},
  {n:24, ar:'ٱلرَّافِع',    tr:'Ar-Rafiʿ',          en:'The Exalter — who raises the believers in rank and elevates the humble.',                                             ar2:'الذي يرفع المؤمنين درجات ويعلي أولياءه.',                                          dhikr:'يَا رَافِع'},
  {n:25, ar:'ٱلْمُعِز',     tr:'Al-Muʿizz',         en:'The Bestower of Honor — who grants dignity and glory to whomever He wills.',                                          ar2:'الذي يُعز من يشاء ويُكرم أولياءه.',                                                dhikr:'يَا مُعِز'},
  {n:26, ar:'ٱلْمُذِل',     tr:'Al-Mudhill',         en:'The Humiliator — who brings low and debases those who oppose truth.',                                                 ar2:'الذي يُذلُّ من يشاء ويُهين أعداءه.',                                               dhikr:'يَا مُذِل'},
  {n:27, ar:'ٱلسَّمِيع',    tr:'As-Samiʿ',           en:'The All-Hearing — who hears every sound and whisper, nothing escapes Him.',                                          ar2:'الذي يسمع كل شيء جهراً وسراً.',                                                   dhikr:'يَا سَمِيع'},
  {n:28, ar:'ٱلْبَصِير',    tr:'Al-Basir',            en:'The All-Seeing — whose sight encompasses all things visible and invisible.',                                         ar2:'الذي يُبصر كل شيء ظاهره وخفيه.',                                                  dhikr:'يَا بَصِير'},
  {n:29, ar:'ٱلْحَكَم',     tr:'Al-Hakam',             en:'The Judge — the ultimate arbitrator whose judgement is always just.',                                               ar2:'الحاكم العدل الذي لا رادَّ لحكمه.',                                                dhikr:'يَا حَكَم'},
  {n:30, ar:'ٱلْعَدْل',     tr:'Al-ʿAdl',              en:'The Just — perfectly equitable, whose every act is rooted in justice.',                                            ar2:'المتصف بالعدل التام في جميع أفعاله وأحكامه.',                                     dhikr:'يَا عَدْل'},
  {n:31, ar:'ٱللَّطِيف',    tr:'Al-Latif',             en:'The Subtle One — who is aware of the finest details and acts with gentle grace.',                                   ar2:'الذي يعلم دقائق الأمور ويُلطف بعباده.',                                            dhikr:'يَا لَطِيف'},
  {n:32, ar:'ٱلْخَبِير',    tr:'Al-Khabir',            en:'The All-Aware — who has precise knowledge of all inner realities and secrets.',                                     ar2:'العليم ببواطن الأمور وخفاياها.',                                                   dhikr:'يَا خَبِير'},
  {n:33, ar:'ٱلْحَلِيم',    tr:'Al-Halim',             en:'The Forbearing — who delays punishment and is never hastened by ignorance.',                                        ar2:'الذي لا يعجل بالعقوبة ويتأنى على العاصين.',                                        dhikr:'يَا حَلِيم'},
  {n:34, ar:'ٱلْعَظِيم',    tr:'Al-ʿAzim',             en:'The Magnificent — whose greatness, glory, and honor are beyond all measure.',                                      ar2:'الكبير في ذاته وصفاته الذي تعظُم منزلته.',                                        dhikr:'يَا عَظِيم'},
  {n:35, ar:'ٱلْغَفُور',    tr:'Al-Ghafur',            en:'The Forgiving — who pardons and covers the sins of His repentant servants.',                                        ar2:'الذي يستر الذنوب ويمحوها لمن تاب إليه.',                                           dhikr:'يَا غَفُور'},
  {n:36, ar:'ٱلشَّكُور',    tr:'Ash-Shakur',           en:'The Appreciative — who rewards abundant gratitude for even the smallest good deed.',                                ar2:'الذي يُجزل الثواب على القليل من العمل الصالح.',                                    dhikr:'يَا شَكُور'},
  {n:37, ar:'ٱلْعَلِيّ',    tr:'Al-ʿAliyy',            en:'The Most High — who is exalted above all creation in essence and attributes.',                                     ar2:'المتعالي على كل شيء في ذاته وصفاته.',                                              dhikr:'يَا عَلِيّ'},
  {n:38, ar:'ٱلْكَبِير',    tr:'Al-Kabir',             en:'The Grand — immeasurably great in His essence, majesty, and perfection.',                                           ar2:'الكبير في نفسه الذي تصغر الأشياء بالنسبة إليه.',                                  dhikr:'يَا كَبِير'},
  {n:39, ar:'ٱلْحَفِيظ',    tr:'Al-Hafiz',             en:'The Preserver — who protects, guards, and keeps everything safe from loss.',                                        ar2:'الحافظ لكل شيء من الضياع والزوال.',                                                dhikr:'يَا حَفِيظ'},
  {n:40, ar:'ٱلْمُقِيت',    tr:'Al-Muqit',             en:'The Nourisher — who provides and maintains sustenance for every creature.',                                         ar2:'الذي يقيت كل مخلوق ويُمسك قوته.',                                                 dhikr:'يَا مُقِيت'},
  {n:41, ar:'ٱلْحَسِيب',    tr:'Al-Hasib',             en:'The Reckoner — who takes complete account of all deeds and acts.',                                                  ar2:'الكافي الذي يحصي الأعمال ويحاسب عليها.',                                           dhikr:'يَا حَسِيب'},
  {n:42, ar:'ٱلْجَلِيل',    tr:'Al-Jalil',             en:'The Majestic — whose attributes of majesty and power are unparalleled.',                                            ar2:'ذو الجلال والعظمة الذي تُجلُّ صفاته.',                                             dhikr:'يَا جَلِيل'},
  {n:43, ar:'ٱلْكَرِيم',    tr:'Al-Karim',             en:'The Generous — whose giving is abundant and whose generosity knows no end.',                                        ar2:'الكثير الخير الجزيل العطاء.',                                                      dhikr:'يَا كَرِيم'},
  {n:44, ar:'ٱلرَّقِيب',    tr:'Ar-Raqib',             en:'The Watchful — who observes all things at all times without inattention.',                                          ar2:'المراقب لعباده الذي لا يغفل عن شيء.',                                              dhikr:'يَا رَقِيب'},
  {n:45, ar:'ٱلْمُجِيب',    tr:'Al-Mujib',             en:'The Responsive — who answers the call of every supplicant.',                                                        ar2:'الذي يُجيب دعاء من دعاه ولا يردُّه.',                                              dhikr:'يَا مُجِيب'},
  {n:46, ar:'ٱلْوَاسِع',    tr:'Al-Wasiʿ',             en:'The All-Encompassing — whose mercy, knowledge, and provision are boundless.',                                      ar2:'الذي وسعت رحمته وعلمه ورزقه كل شيء.',                                             dhikr:'يَا وَاسِع'},
  {n:47, ar:'ٱلْحَكِيم',    tr:'Al-Hakim',             en:'The All-Wise — who places everything in its proper place with perfect wisdom.',                                     ar2:'الذي يضع كل شيء في موضعه بحكمة بالغة.',                                           dhikr:'يَا حَكِيم'},
  {n:48, ar:'ٱلْوَدُود',    tr:'Al-Wadud',             en:'The Loving — who loves the righteous and is deeply loved by the believers.',                                        ar2:'المحبوب في ذاته المحب لأوليائه الصالحين.',                                         dhikr:'يَا وَدُود'},
  {n:49, ar:'ٱلْمَجِيد',    tr:'Al-Majid',             en:'The Glorious — whose glory and honor are supreme and without any equal.',                                           ar2:'العالي القدر الواسع المجد الذي لا نظير له.',                                       dhikr:'يَا مَجِيد'},
  {n:50, ar:'ٱلْبَاعِث',    tr:'Al-Baʿith',            en:'The Resurrector — who will raise the dead to life on the Day of Judgement.',                                       ar2:'الذي يبعث الخلق يوم القيامة للحساب.',                                              dhikr:'يَا بَاعِث'},
  {n:51, ar:'ٱلشَّهِيد',    tr:'Ash-Shahid',           en:'The Witness — who is present everywhere and testifies to all things.',                                              ar2:'الحاضر الذي لا يغيب عن شيء ويشهد كل شيء.',                                        dhikr:'يَا شَهِيد'},
  {n:52, ar:'ٱلْحَق',       tr:'Al-Haqq',              en:'The Truth — the absolute reality whose existence is necessary and eternal.',                                        ar2:'الثابت الوجود الذي لا يتغير ولا يزول.',                                            dhikr:'يَا حَق'},
  {n:53, ar:'ٱلْوَكِيل',    tr:'Al-Wakil',             en:'The Trustee — on whom all affairs may be entrusted with complete confidence.',                                      ar2:'الكفيل المتولي أمور عباده المتوكلين عليه.',                                        dhikr:'يَا وَكِيل'},
  {n:54, ar:'ٱلْقَوِيّ',    tr:'Al-Qawiyy',            en:'The Strong — whose power is absolute and can never be diminished.',                                                 ar2:'الشديد القوة الذي لا يعتريه ضعف ولا عجز.',                                        dhikr:'يَا قَوِيّ'},
  {n:55, ar:'ٱلْمَتِين',    tr:'Al-Matin',             en:'The Firm — whose strength and power are completely solid and unshakeable.',                                         ar2:'الشديد البطش المتين القوة الذي لا تنفد قدرته.',                                   dhikr:'يَا مَتِين'},
  {n:56, ar:'ٱلْوَلِيّ',    tr:'Al-Waliyy',            en:'The Protecting Friend — who guards the believers and draws them close.',                                            ar2:'الناصر المعين الذي يتولى المؤمنين بالنصر والحماية.',                               dhikr:'يَا وَلِيّ'},
  {n:57, ar:'ٱلْحَمِيد',    tr:'Al-Hamid',             en:'The Praiseworthy — who is deserving of all praise in every circumstance.',                                          ar2:'المحمود في أفعاله وصفاته على كل حال.',                                             dhikr:'يَا حَمِيد'},
  {n:58, ar:'ٱلْمُحْصِي',   tr:'Al-Muhsi',             en:'The Appraiser — who counts and records every single thing without omission.',                                      ar2:'الذي أحصى كل شيء بعلمه فلا يفوته شيء.',                                           dhikr:'يَا مُحْصِي'},
  {n:59, ar:'ٱلْمُبْدِئ',   tr:'Al-Mubdiʾ',            en:'The Originator — who begins creation from nothing with no prior model.',                                            ar2:'الذي ابتدأ الخلق وأوجده دون مثال سبق.',                                            dhikr:'يَا مُبْدِئ'},
  {n:60, ar:'ٱلْمُعِيد',    tr:'Al-Muʿid',             en:'The Restorer — who will restore creation to life after its ending.',                                                ar2:'الذي يُعيد الخلق بعد الفناء للبعث والحساب.',                                       dhikr:'يَا مُعِيد'},
  {n:61, ar:'ٱلْمُحْيِي',   tr:'Al-Muhyi',             en:'The Giver of Life — who bestows life and is the source of all living.',                                             ar2:'الذي بيده الحياة يُحيي من يشاء من خلقه.',                                         dhikr:'يَا مُحْيِي'},
  {n:62, ar:'ٱلْمُمِيت',    tr:'Al-Mumit',             en:'The Taker of Life — who causes death at the appointed time.',                                                       ar2:'الذي يُميت من يشاء متى شاء بأمره.',                                                dhikr:'يَا مُمِيت'},
  {n:63, ar:'ٱلْحَيّ',      tr:'Al-Hayy',              en:'The Ever-Living — who possesses perfect and eternal life with no beginning or end.',                                ar2:'الدائم الحياة الذي لا يموت ولا تأخذه سِنَة.',                                     dhikr:'يَا حَيّ'},
  {n:64, ar:'ٱلْقَيُّوم',   tr:'Al-Qayyum',            en:'The Self-Subsisting — who sustains all creation while depending on nothing.',                                       ar2:'القائم بنفسه القيِّم على كل شيء الحافظ له.',                                      dhikr:'يَا قَيُّوم'},
  {n:65, ar:'ٱلْوَاجِد',    tr:'Al-Wajid',             en:'The Finder — who finds what He wills instantly, for nothing is hard for Him.',                                     ar2:'الذي لا يعوزه شيء فيجد ما يريد متى أراد.',                                        dhikr:'يَا وَاجِد'},
  {n:66, ar:'ٱلْمَاجِد',    tr:'Al-Majid',             en:'The Noble — exalted in glory, whose majesty and generosity are immense.',                                           ar2:'الكريم الواسع الجود المتعالي في مجده وكرمه.',                                     dhikr:'يَا مَاجِد'},
  {n:67, ar:'ٱلْوَاحِد',    tr:'Al-Wahid',             en:'The One — uniquely singular with no partner, associate, or equal.',                                                 ar2:'الفرد الذي لا شريك له ولا مثيل ولا نظير.',                                        dhikr:'يَا وَاحِد'},
  {n:68, ar:'ٱلصَّمَد',     tr:'As-Samad',             en:'The Eternal Refuge — whom all of creation needs, while He needs nothing.',                                          ar2:'الذي يُصمد إليه في الحاجات وهو غني عن كل شيء.',                                   dhikr:'يَا صَمَد'},
  {n:69, ar:'ٱلْقَادِر',    tr:'Al-Qadir',             en:'The Capable — who has absolute power over everything, lacking nothing.',                                            ar2:'الذي يقدر على كل شيء ولا يعجزه شيء.',                                             dhikr:'يَا قَادِر'},
  {n:70, ar:'ٱلْمُقْتَدِر', tr:'Al-Muqtadir',          en:'The Powerful — who exercises His power to bring about what He wills.',                                              ar2:'النافذ القدرة الذي ينفذ أمره في خلقه.',                                            dhikr:'يَا مُقْتَدِر'},
  {n:71, ar:'ٱلْمُقَدِّم',  tr:'Al-Muqaddim',          en:'The Expediter — who brings forward whomever and whatever He wills.',                                                ar2:'الذي يُقدِّم ما يشاء من الأشياء والأشخاص.',                                        dhikr:'يَا مُقَدِّم'},
  {n:72, ar:'ٱلْمُؤَخِّر',  tr:'Al-Muʾakhkhir',        en:'The Delayer — who postpones and puts back whatever He wills with wisdom.',                                          ar2:'الذي يُؤخِّر من يشاء بحكمة بالغة.',                                                dhikr:'يَا مُؤَخِّر'},
  {n:73, ar:'ٱلْأَوَّل',    tr:'Al-Awwal',             en:'The First — who existed before all things, with no beginning before Him.',                                          ar2:'السابق الذي ليس قبله شيء.',                                                        dhikr:'يَا أَوَّل'},
  {n:74, ar:'ٱلْآخِر',      tr:'Al-Akhir',             en:'The Last — who endures after all things cease, with no end after Him.',                                             ar2:'الباقي بعد فناء كل شيء الذي لا آخر له.',                                           dhikr:'يَا آخِر'},
  {n:75, ar:'ٱلظَّاهِر',    tr:'Az-Zahir',             en:'The Manifest — who is evident through His signs, clear in His creation.',                                           ar2:'الغالب الذي ظهر بآياته وكل دليل يشير إليه.',                                      dhikr:'يَا ظَاهِر'},
  {n:76, ar:'ٱلْبَاطِن',    tr:'Al-Batin',             en:'The Hidden — whose essence is concealed from all perception and comprehension.',                                    ar2:'الخفي الذي احتجب عن الأبصار فلا تُدركه.',                                         dhikr:'يَا بَاطِن'},
  {n:77, ar:'ٱلْوَالِي',    tr:'Al-Wali',              en:'The Governor — who administers all the affairs of creation with authority.',                                         ar2:'المتولي لأمور خلقه المدبِّر لشؤونهم.',                                             dhikr:'يَا وَالِي'},
  {n:78, ar:'ٱلْمُتَعَالِي',tr:'Al-Mutaʿali',          en:'The Most Exalted — supremely above all attributes and all of creation.',                                            ar2:'المتعالي فوق كل شيء علواً مطلقاً.',                                                dhikr:'يَا مُتَعَالِي'},
  {n:79, ar:'ٱلْبَرّ',      tr:'Al-Barr',              en:'The Source of Goodness — whose kindness and benevolence are perfectly complete.',                                   ar2:'الكثير البر والإحسان الواسع الخير والفضل.',                                        dhikr:'يَا بَرّ'},
  {n:80, ar:'ٱلتَّوَّاب',   tr:'At-Tawwab',            en:'The Accepter of Repentance — who turns to His servants with mercy again and again.',                                ar2:'الذي يتوب على عباده ويقبل رجوعهم إليه.',                                           dhikr:'يَا تَوَّاب'},
  {n:81, ar:'ٱلْمُنْتَقِم', tr:'Al-Muntaqim',          en:'The Avenger — who takes just retribution from the wrongdoers with power.',                                          ar2:'الشديد الانتقام ممن يستحق العذاب من الجبارين.',                                   dhikr:'يَا مُنْتَقِم'},
  {n:82, ar:'ٱلْعَفُوّ',    tr:'Al-ʿAfuww',            en:'The Pardoner — who completely erases sins and wipes the slate entirely clean.',                                     ar2:'الذي يمحو الذنوب ويعفو عنها بالكلية.',                                             dhikr:'يَا عَفُوّ'},
  {n:83, ar:'ٱلرَّءُوف',    tr:'Ar-Raʾuf',             en:'The Compassionate — full of tender compassion and gentleness toward His servants.',                                  ar2:'الذي اتصف بالرأفة الشديدة والرحمة العظيمة.',                                      dhikr:'يَا رَؤُوف'},
  {n:84, ar:'مَالِكُ ٱلْمُلْك',tr:'Malik Al-Mulk',    en:'The Owner of Sovereignty — the sole owner of all kingdoms and dominions.',                                           ar2:'المالك للملك كله يُعطيه من يشاء وينزعه ممن يشاء.',                                dhikr:'يَا مَالِكَ الْمُلْك'},
  {n:85, ar:'ذُو ٱلْجَلَٰل',tr:'Dhu Al-Jalal',         en:'Lord of Majesty and Bounty — possessing both supreme glory and vast generosity.',                                   ar2:'صاحب الجلال والعظمة والإكرام والفضل.',                                             dhikr:'يَا ذَا الْجَلَالِ وَالْإِكْرَامِ'},
  {n:86, ar:'ٱلْمُقْسِط',   tr:'Al-Muqsit',            en:'The Equitable — who deals with perfect equity and impartiality in all affairs.',                                    ar2:'العادل في أحكامه الذي لا يظلم أحداً.',                                             dhikr:'يَا مُقْسِط'},
  {n:87, ar:'ٱلْجَامِع',    tr:'Al-Jamiʿ',             en:'The Gatherer — who will assemble all of creation on the Day of Resurrection.',                                      ar2:'الذي يجمع الخلائق يوم القيامة للحساب.',                                            dhikr:'يَا جَامِع'},
  {n:88, ar:'ٱلْغَنِيّ',    tr:'Al-Ghani',             en:'The Self-Sufficient — who is completely free of any need from creation.',                                            ar2:'الغني الكامل عن كل ما سواه الذي لا يحتاج إلى أحد.',                               dhikr:'يَا غَنِيّ'},
  {n:89, ar:'ٱلْمُغْنِي',   tr:'Al-Mughni',            en:'The Enricher — who enriches whomever He wills and relieves poverty.',                                               ar2:'الذي يُغني من يشاء من عباده ويُزيل الفقر.',                                       dhikr:'يَا مُغْنِي'},
  {n:90, ar:'ٱلْمَانِع',    tr:'Al-Maniʿ',             en:'The Preventer — who withholds what would cause harm to His servants.',                                               ar2:'الذي يمنع ما يشاء مما يضر عباده بحكمة.',                                          dhikr:'يَا مَانِع'},
  {n:91, ar:'ٱلضَّارّ',     tr:'Ad-Darr',              en:'The Distresser — who alone can afflict harm by His wisdom and decree.',                                              ar2:'الذي يضر من يشاء بما يشاء بحكمة وعدل.',                                           dhikr:'يَا ضَارّ'},
  {n:92, ar:'ٱلنَّافِع',    tr:'An-Nafiʿ',             en:'The Benefiter — who alone grants true benefit and good to whom He wills.',                                          ar2:'الذي ينفع من يشاء بما يشاء ويُعطي الخير.',                                        dhikr:'يَا نَافِع'},
  {n:93, ar:'ٱلنُّور',      tr:'An-Nur',               en:'The Light — the source of all light that illuminates the heavens and earth.',                                       ar2:'نور السماوات والأرض ومنور قلوب عباده.',                                            dhikr:'يَا نُور'},
  {n:94, ar:'ٱلْهَادِي',    tr:'Al-Hadi',              en:'The Guide — who guides whomever He wills to the straight path.',                                                     ar2:'الذي يهدي من يشاء إلى الصراط المستقيم.',                                          dhikr:'يَا هَادِي'},
  {n:95, ar:'ٱلْبَدِيع',    tr:'Al-Badiʿ',             en:'The Incomparable Originator — who creates with matchless design and artistry.',                                     ar2:'المبدع لخلقه على غير مثال سبق بأبدع صورة.',                                       dhikr:'يَا بَدِيع'},
  {n:96, ar:'ٱلْبَاقِي',    tr:'Al-Baqi',              en:'The Everlasting — who endures forever while all else perishes.',                                                     ar2:'الدائم البقاء الذي لا يفنى ولا ينتهي وجوده.',                                     dhikr:'يَا بَاقِي'},
  {n:97, ar:'ٱلْوَارِث',    tr:'Al-Warith',            en:'The Inheritor — to whom all of creation returns after everything has ended.',                                        ar2:'الذي يرث الأرض ومن عليها بعد فناء الخلق.',                                        dhikr:'يَا وَارِث'},
  {n:98, ar:'ٱلرَّشِيد',    tr:'Ar-Rashid',            en:'The Rightly Guiding — who directs all matters to their right end wisely.',                                          ar2:'الذي أرشد الخلق إلى ما فيه صلاحهم بحكمة.',                                        dhikr:'يَا رَشِيد'},
  {n:99, ar:'ٱلصَّبُور',    tr:'As-Sabur',             en:'The Patient — who does not hasten punishment but delays it with great wisdom.',                                     ar2:'الذي لا يعجل بالعقوبة بل يُمهل بحكمة ورحمة.',                                    dhikr:'يَا صَبُور'},
];

/* ═══ 114 SURAHS (verbatim from Phase 1) ═══ */
const SURAHS = [
  {n:1,  ar:'الفاتحة',       en:'Al-Fatihah',        tr:'The Opening',          v:7,   t:'M'},
  {n:2,  ar:'البقرة',        en:'Al-Baqarah',         tr:'The Cow',              v:286, t:'L'},
  {n:3,  ar:'آل عمران',      en:"Ali 'Imran",        tr:'Family of Imran',      v:200, t:'L'},
  {n:4,  ar:'النساء',        en:'An-Nisa',            tr:'The Women',            v:176, t:'L'},
  {n:5,  ar:'المائدة',       en:"Al-Ma'idah",        tr:'The Table Spread',     v:120, t:'L'},
  {n:6,  ar:'الأنعام',       en:"Al-An'am",          tr:'The Cattle',           v:165, t:'M'},
  {n:7,  ar:'الأعراف',       en:"Al-A'raf",          tr:'The Heights',          v:206, t:'M'},
  {n:8,  ar:'الأنفال',       en:'Al-Anfal',           tr:'The Spoils of War',    v:75,  t:'L'},
  {n:9,  ar:'التوبة',        en:'At-Tawbah',          tr:'The Repentance',       v:129, t:'L'},
  {n:10, ar:'يونس',          en:'Yunus',              tr:'Jonah',                v:109, t:'M'},
  {n:11, ar:'هود',           en:'Hud',                tr:'Hud',                  v:123, t:'M'},
  {n:12, ar:'يوسف',          en:'Yusuf',              tr:'Joseph',               v:111, t:'M'},
  {n:13, ar:'الرعد',         en:"Ar-Ra'd",           tr:'The Thunder',          v:43,  t:'L'},
  {n:14, ar:'إبراهيم',       en:'Ibrahim',            tr:'Abraham',              v:52,  t:'M'},
  {n:15, ar:'الحجر',         en:'Al-Hijr',            tr:'The Rocky Tract',      v:99,  t:'M'},
  {n:16, ar:'النحل',         en:'An-Nahl',            tr:'The Bee',              v:128, t:'L'},
  {n:17, ar:'الإسراء',       en:'Al-Isra',            tr:'The Night Journey',    v:111, t:'M'},
  {n:18, ar:'الكهف',         en:'Al-Kahf',            tr:'The Cave',             v:110, t:'M'},
  {n:19, ar:'مريم',          en:'Maryam',             tr:'Mary',                 v:98,  t:'M'},
  {n:20, ar:'طه',            en:'Taha',               tr:'Ta-Ha',                v:135, t:'M'},
  {n:21, ar:'الأنبياء',      en:'Al-Anbiya',          tr:'The Prophets',         v:112, t:'M'},
  {n:22, ar:'الحج',          en:'Al-Hajj',            tr:'The Pilgrimage',       v:78,  t:'L'},
  {n:23, ar:'المؤمنون',      en:"Al-Mu'minun",       tr:'The Believers',        v:118, t:'M'},
  {n:24, ar:'النور',         en:'An-Nur',             tr:'The Light',            v:64,  t:'L'},
  {n:25, ar:'الفرقان',       en:'Al-Furqan',          tr:'The Criterion',        v:77,  t:'M'},
  {n:26, ar:'الشعراء',       en:"Ash-Shu'ara",       tr:'The Poets',            v:227, t:'M'},
  {n:27, ar:'النمل',         en:'An-Naml',            tr:'The Ant',              v:93,  t:'M'},
  {n:28, ar:'القصص',         en:'Al-Qasas',           tr:'The Stories',          v:88,  t:'M'},
  {n:29, ar:'العنكبوت',      en:"Al-'Ankabut",       tr:'The Spider',           v:69,  t:'M'},
  {n:30, ar:'الروم',         en:'Ar-Rum',             tr:'The Romans',           v:60,  t:'M'},
  {n:31, ar:'لقمان',         en:'Luqman',             tr:'Luqman',               v:34,  t:'M'},
  {n:32, ar:'السجدة',        en:'As-Sajdah',          tr:'The Prostration',      v:30,  t:'M'},
  {n:33, ar:'الأحزاب',       en:'Al-Ahzab',           tr:'The Confederates',     v:73,  t:'L'},
  {n:34, ar:'سبأ',           en:'Saba',               tr:'Sheba',                v:54,  t:'M'},
  {n:35, ar:'فاطر',          en:'Fatir',              tr:'Originator',           v:45,  t:'M'},
  {n:36, ar:'يس',            en:'Ya-Sin',             tr:'Ya Sin',               v:83,  t:'M'},
  {n:37, ar:'الصافات',       en:'As-Saffat',          tr:'Those Ranged in Ranks',v:182, t:'M'},
  {n:38, ar:'ص',             en:'Sad',                tr:'The Letter Sad',       v:88,  t:'M'},
  {n:39, ar:'الزمر',         en:'Az-Zumar',           tr:'The Groups',           v:75,  t:'M'},
  {n:40, ar:'غافر',          en:'Ghafir',             tr:'The Forgiver',         v:85,  t:'M'},
  {n:41, ar:'فصلت',          en:'Fussilat',           tr:'Explained in Detail',  v:54,  t:'M'},
  {n:42, ar:'الشورى',        en:'Ash-Shura',          tr:'The Consultation',     v:53,  t:'M'},
  {n:43, ar:'الزخرف',        en:'Az-Zukhruf',         tr:'The Ornaments of Gold',v:89,  t:'M'},
  {n:44, ar:'الدخان',        en:'Ad-Dukhan',          tr:'The Smoke',            v:59,  t:'M'},
  {n:45, ar:'الجاثية',       en:'Al-Jathiyah',        tr:'The Crouching',        v:37,  t:'M'},
  {n:46, ar:'الأحقاف',       en:'Al-Ahqaf',           tr:'The Wind-Curved Sandhills',v:35,t:'M'},
  {n:47, ar:'محمد',          en:'Muhammad',           tr:'Muhammad',             v:38,  t:'L'},
  {n:48, ar:'الفتح',         en:'Al-Fath',            tr:'The Victory',          v:29,  t:'L'},
  {n:49, ar:'الحجرات',       en:'Al-Hujurat',         tr:'The Rooms',            v:18,  t:'L'},
  {n:50, ar:'ق',             en:'Qaf',                tr:'The Letter Qaf',       v:45,  t:'M'},
  {n:51, ar:'الذاريات',      en:'Adh-Dhariyat',       tr:'The Winnowing Winds',  v:60,  t:'M'},
  {n:52, ar:'الطور',         en:'At-Tur',             tr:'The Mount',            v:49,  t:'M'},
  {n:53, ar:'النجم',         en:'An-Najm',            tr:'The Star',             v:62,  t:'M'},
  {n:54, ar:'القمر',         en:'Al-Qamar',           tr:'The Moon',             v:55,  t:'M'},
  {n:55, ar:'الرحمن',        en:'Ar-Rahman',          tr:'The Beneficent',       v:78,  t:'L'},
  {n:56, ar:'الواقعة',       en:"Al-Waqi'ah",        tr:'The Inevitable',       v:96,  t:'M'},
  {n:57, ar:'الحديد',        en:'Al-Hadid',           tr:'The Iron',             v:29,  t:'L'},
  {n:58, ar:'المجادلة',      en:'Al-Mujadila',        tr:'The Pleading Woman',   v:22,  t:'L'},
  {n:59, ar:'الحشر',         en:'Al-Hashr',           tr:'The Exile',            v:24,  t:'L'},
  {n:60, ar:'الممتحنة',      en:'Al-Mumtahanah',      tr:'She That is to be Examined',v:13,t:'L'},
  {n:61, ar:'الصف',          en:'As-Saf',             tr:'The Ranks',            v:14,  t:'L'},
  {n:62, ar:'الجمعة',        en:"Al-Jumu'ah",        tr:'The Congregation',     v:11,  t:'L'},
  {n:63, ar:'المنافقون',     en:'Al-Munafiqun',       tr:'The Hypocrites',       v:11,  t:'L'},
  {n:64, ar:'التغابن',       en:'At-Taghabun',        tr:'Mutual Disillusion',   v:18,  t:'L'},
  {n:65, ar:'الطلاق',        en:'At-Talaq',           tr:'The Divorce',          v:12,  t:'L'},
  {n:66, ar:'التحريم',       en:'At-Tahrim',          tr:'The Prohibition',      v:12,  t:'L'},
  {n:67, ar:'الملك',         en:'Al-Mulk',            tr:'The Sovereignty',      v:30,  t:'M'},
  {n:68, ar:'القلم',         en:'Al-Qalam',           tr:'The Pen',              v:52,  t:'M'},
  {n:69, ar:'الحاقة',        en:'Al-Haqqah',          tr:'The Reality',          v:52,  t:'M'},
  {n:70, ar:'المعارج',       en:"Al-Ma'arij",        tr:'The Ascending Stairways',v:44,t:'M'},
  {n:71, ar:'نوح',           en:'Nuh',                tr:'Noah',                 v:28,  t:'M'},
  {n:72, ar:'الجن',          en:'Al-Jinn',            tr:'The Jinn',             v:28,  t:'M'},
  {n:73, ar:'المزمل',        en:'Al-Muzzammil',       tr:'The Enshrouded One',   v:20,  t:'M'},
  {n:74, ar:'المدثر',        en:'Al-Muddaththir',     tr:'The Cloaked One',      v:56,  t:'M'},
  {n:75, ar:'القيامة',       en:'Al-Qiyamah',         tr:'The Resurrection',     v:40,  t:'M'},
  {n:76, ar:'الإنسان',       en:'Al-Insan',           tr:'The Human',            v:31,  t:'L'},
  {n:77, ar:'المرسلات',      en:'Al-Mursalat',        tr:'The Emissaries',       v:50,  t:'M'},
  {n:78, ar:'النبأ',         en:'An-Naba',            tr:'The Tidings',          v:40,  t:'M'},
  {n:79, ar:'النازعات',      en:"An-Nazi'at",        tr:'Those Who Drag Forth',  v:46,  t:'M'},
  {n:80, ar:'عبس',           en:"'Abasa",            tr:'He Frowned',           v:42,  t:'M'},
  {n:81, ar:'التكوير',       en:'At-Takwir',          tr:'The Overthrowing',     v:29,  t:'M'},
  {n:82, ar:'الانفطار',      en:'Al-Infitar',         tr:'The Cleaving',         v:19,  t:'M'},
  {n:83, ar:'المطففين',      en:'Al-Mutaffifin',      tr:'The Defrauded',        v:36,  t:'M'},
  {n:84, ar:'الانشقاق',      en:'Al-Inshiqaq',        tr:'The Sundering',        v:25,  t:'M'},
  {n:85, ar:'البروج',        en:'Al-Buruj',           tr:'The Mansions of the Stars',v:22,t:'M'},
  {n:86, ar:'الطارق',        en:'At-Tariq',           tr:'The Morning Star',     v:17,  t:'M'},
  {n:87, ar:'الأعلى',        en:"Al-A'la",           tr:'The Most High',        v:19,  t:'M'},
  {n:88, ar:'الغاشية',       en:'Al-Ghashiyah',       tr:'The Overwhelming',     v:26,  t:'M'},
  {n:89, ar:'الفجر',         en:'Al-Fajr',            tr:'The Dawn',             v:30,  t:'M'},
  {n:90, ar:'البلد',         en:'Al-Balad',           tr:'The City',             v:20,  t:'M'},
  {n:91, ar:'الشمس',         en:'Ash-Shams',          tr:'The Sun',              v:15,  t:'M'},
  {n:92, ar:'الليل',         en:'Al-Layl',            tr:'The Night',            v:21,  t:'M'},
  {n:93, ar:'الضحى',         en:'Ad-Duha',            tr:'The Morning Hours',    v:11,  t:'M'},
  {n:94, ar:'الشرح',         en:'Ash-Sharh',          tr:'The Relief',           v:8,   t:'M'},
  {n:95, ar:'التين',         en:'At-Tin',             tr:'The Fig',              v:8,   t:'M'},
  {n:96, ar:'العلق',         en:"Al-'Alaq",          tr:'The Clot',             v:19,  t:'M'},
  {n:97, ar:'القدر',         en:'Al-Qadr',            tr:'The Power',            v:5,   t:'M'},
  {n:98, ar:'البينة',        en:'Al-Bayyinah',        tr:'The Clear Proof',      v:8,   t:'L'},
  {n:99, ar:'الزلزلة',       en:'Az-Zalzalah',        tr:'The Earthquake',       v:8,   t:'L'},
  {n:100,ar:'العاديات',      en:"Al-'Adiyat",        tr:'The Courser',          v:11,  t:'M'},
  {n:101,ar:'القارعة',       en:"Al-Qari'ah",        tr:'The Calamity',         v:11,  t:'M'},
  {n:102,ar:'التكاثر',       en:'At-Takathur',        tr:'The Rivalry in World Increase',v:8,t:'M'},
  {n:103,ar:'العصر',         en:"Al-'Asr",           tr:'The Declining Day',    v:3,   t:'M'},
  {n:104,ar:'الهمزة',        en:'Al-Humazah',         tr:'The Traducer',         v:9,   t:'M'},
  {n:105,ar:'الفيل',         en:'Al-Fil',             tr:'The Elephant',         v:5,   t:'M'},
  {n:106,ar:'قريش',          en:'Quraysh',            tr:'Quraysh',              v:4,   t:'M'},
  {n:107,ar:'الماعون',       en:"Al-Ma'un",          tr:'The Small Kindnesses',  v:7,   t:'M'},
  {n:108,ar:'الكوثر',        en:'Al-Kawthar',         tr:'A River in Paradise',  v:3,   t:'M'},
  {n:109,ar:'الكافرون',      en:'Al-Kafirun',         tr:'The Disbelievers',     v:6,   t:'M'},
  {n:110,ar:'النصر',         en:'An-Nasr',            tr:'The Divine Support',   v:3,   t:'L'},
  {n:111,ar:'المسد',         en:'Al-Masad',           tr:'The Palm Fibre',       v:5,   t:'M'},
  {n:112,ar:'الإخلاص',       en:'Al-Ikhlas',          tr:'The Sincerity',        v:4,   t:'M'},
  {n:113,ar:'الفلق',         en:'Al-Falaq',           tr:'The Daybreak',         v:5,   t:'M'},
  {n:114,ar:'الناس',         en:'An-Nas',             tr:'Mankind',              v:6,   t:'M'},
];

// Dzikr presets for the counter page.
const DHIKR_PRESETS = [
  { id: 'subhan',    ar: 'سُبْحَانَ اللَّه',            en: 'SubhanAllah',           arLabel: 'سبحان الله' },
  { id: 'alhamd',    ar: 'الْحَمْدُ لِلَّه',            en: 'Alhamdulillah',         arLabel: 'الحمد لله' },
  { id: 'akbar',     ar: 'اللَّهُ أَكْبَر',             en: 'Allahu Akbar',          arLabel: 'الله أكبر' },
  { id: 'tahlil',    ar: 'لَا إِلَٰهَ إِلَّا اللَّه',    en: 'La ilaha illa Allah',   arLabel: 'لا إله إلا الله' },
  { id: 'istighfar', ar: 'أَسْتَغْفِرُ اللَّه',          en: 'Astaghfirullah',        arLabel: 'أستغفر الله' },
  { id: 'salawat',   ar: 'صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ', en: 'Salawat',             arLabel: 'الصلاة على النبي' },
];

// Widely-transmitted adhkar collections (texts as commonly published; counts = common practice).
// No source citations are claimed. Transliteration only where standard.
const DHIKR_LIBRARY = [
  { id: 'morning', en: 'Morning', ar: 'الأذكار', items: [
    { id: 'm1', ar: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ', en: 'We have entered the morning and the dominion belongs to Allah', tr: 'Asbahna wa asbah al-mulk lillah', count: 1 },
    { id: 'm2', ar: 'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا', en: 'O Allah, by You we enter the morning and the evening', tr: 'Allahumma bika asbahna wa bika amsayna', count: 1 },
    { id: 'm3', ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', en: 'Glory be to Allah and praise Him', tr: 'SubhanAllahi wa bihamdih', count: 100 },
    { id: 'm4', ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ', en: 'In the name of Allah, with whose name nothing can cause harm', tr: 'Bismillah illadhi la yadurru…', count: 3 },
    { id: 'm5', ar: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', en: 'I seek Allah\'s forgiveness and turn to Him', tr: 'Astaghfirullah wa atubu ilayh', count: 100 },
  ]},
  { id: 'evening', en: 'Evening', ar: 'الأذكار', items: [
    { id: 'e1', ar: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ', en: 'We have entered the evening and the dominion belongs to Allah', tr: 'Amsayna wa amsa al-mulk lillah', count: 1 },
    { id: 'e2', ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ', en: 'O Allah, I ask You for wellbeing', tr: 'Allahumma inni as\'aluka al-\'afiyah', count: 1 },
    { id: 'e3', ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', en: 'I seek refuge in the perfect words of Allah from the evil of what He created', tr: 'A\'udhu bikalimatillah at-tammat…', count: 3 },
    { id: 'e4', ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', en: 'Glory be to Allah and praise Him', tr: 'SubhanAllahi wa bihamdih', count: 100 },
  ]},
  { id: 'afterprayer', en: 'After Prayer', ar: 'أذكار الصلاة', items: [
    { id: 'a1', ar: 'أَسْتَغْفِرُ اللَّهَ', en: 'I seek Allah\'s forgiveness', tr: 'Astaghfirullah', count: 3 },
    { id: 'a2', ar: 'اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ', en: 'O Allah, You are Peace and from You comes peace', tr: 'Allahumma anta as-salam…', count: 1 },
    { id: 'a3', ar: 'سُبْحَانَ اللَّهِ', en: 'Glory be to Allah', tr: 'SubhanAllah', count: 33 },
    { id: 'a4', ar: 'الْحَمْدُ لِلَّهِ', en: 'All praise is for Allah', tr: 'Alhamdulillah', count: 33 },
    { id: 'a5', ar: 'اللَّهُ أَكْبَر', en: 'Allah is the Greatest', tr: 'Allahu Akbar', count: 33 },
    { id: 'a6', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ', en: 'There is no god but Allah alone, without partner', tr: 'La ilaha illallahu wahdahu la sharika lah', count: 1 },
  ]},
  { id: 'sleep', en: 'Sleep', ar: 'أذكار النوم', items: [
    { id: 's1', ar: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا', en: 'In Your name, O Allah, I die and I live', tr: 'Bismika Allahumma amutu wa ahya', count: 1 },
    { id: 's2', ar: 'اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ', en: 'O Allah, I submit myself to You', tr: 'Allahumma aslamtu nafsi ilayk', count: 1 },
    { id: 's3', ar: 'قُلْ هُوَ اللَّهُ أَحَدٌ ۝ … (recite the three Quls)', en: 'Recite the three Quls (Al-Ikhlas, Al-Falaq, An-Nas)', tr: 'The three protective surahs', count: 3 },
    { id: 's4', ar: 'سُبْحَانَ اللَّهِ ۝ الْحَمْدُ لِلَّهِ ۝ اللَّهُ أَكْبَرُ', en: '33× SubhanAllah, 33× Alhamdulillah, 34× Allahu Akbar', tr: 'Tasbih before sleep', count: 100 },
  ]},
  { id: 'general', en: 'General', ar: 'أذكار عامة', items: [
    { id: 'g1', ar: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ', en: 'Glory be to Allah, praise be to Allah, there is no god but Allah, Allah is Greatest', tr: 'The four elevated phrases', count: 33 },
    { id: 'g2', ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', en: 'There is no power nor strength except by Allah', tr: 'La hawla wa la quwwata illa billah', count: 10 },
    { id: 'g3', ar: 'حَسْبِيَ اللَّهُ وَنِعْمَ الْوَكِيلُ', en: 'Allah suffices me — what an excellent Trustee', tr: 'Hasbiyallahu wa ni\'ma al-wakil', count: 7 },
    { id: 'g4', ar: 'رَبِّ زِدْنِي عِلْمًا', en: 'My Lord, increase me in knowledge', tr: 'Rabbi zidni \'ilma', count: 1 },
  ]},
];

// AlAdhan calculation method ids (renderer + scheduler share these).
const METHODS = [
  { id: '3',  en: 'Muslim World League', ar: 'رابطة العالم الإسلامي' },
  { id: '4',  en: 'Umm Al-Qura',         ar: 'أم القرى' },
  { id: '2',  en: 'ISNA',                ar: 'أمريكا الشمالية' },
  { id: '1',  en: 'Karachi',             ar: 'كراتشي' },
  { id: '5',  en: 'Egyptian GAAO',       ar: 'الهيئة المصرية' },
  { id: '8',  en: 'Gulf Region',         ar: 'منطقة الخليج' },
  { id: '9',  en: 'Kuwait',              ar: 'الكويت' },
  { id: '10', en: 'Qatar',               ar: 'قطر' },
];
