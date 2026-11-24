// UI translations (English / Persian). The language is a user setting stored in
// chrome.storage.local ("language"), independent of the browser's locale.
// Static markup uses data-i18n / data-i18n-html / data-i18n-title / data-i18n-placeholder.

export const LANGUAGES = { en: { name: 'English', dir: 'ltr', locale: 'en-US' }, fa: { name: 'فارسی', dir: 'rtl', locale: 'fa-IR' } };

const plural = (n, one, other) => (n === 1 ? one : other);

const STRINGS = {
  en: {
    appName: 'WebRTC Internals Exporter',
    // recording
    'rec.start': 'Start Recording',
    'rec.stop': 'Stop Recording',
    'rec.on': 'Recording',
    'rec.off': 'Not recording',
    'rec.subOn': 'Capturing WebRTC activity in all tabs',
    'rec.subOff': 'Click “Start Recording” to begin capturing',
    'rec.pillTitleOn': 'Click to stop recording',
    'rec.pillTitleOff': 'Click to start recording',
    // popup
    'popup.active': 'active now',
    'popup.connections': 'connections',
    'popup.recorded': 'recorded',
    'popup.export': 'Export by time range…',
    'popup.import': 'Import a dump…',
    'popup.library': 'View imported data',
    'popup.settings': 'Settings',
    'popup.native': 'Open chrome://webrtc-internals',
    // units
    'unit.h': 'h', 'unit.m': 'm', 'unit.min': 'min', 'unit.s': 's',
    'size.B': 'B', 'size.KB': 'KB', 'size.MB': 'MB', 'size.GB': 'GB',
    // nav
    'nav.export': 'Export', 'nav.import': 'Import', 'nav.library': 'Imported data', 'nav.settings': 'Settings',
    // export
    'export.title': 'Export recorded data',
    'export.lede': 'While recording is on, the extension records WebRTC API calls, events and <code>getStats()</code> samples from every tab, just like <code>chrome://webrtc-internals</code>. Pick a time range and download it as a webrtc-internals dump.',
    'cap.span': 'Recorded span', 'cap.pcs': 'Peer connections', 'cap.samples': 'Stats samples', 'cap.events': 'Events',
    'cap.storage': 'Storage used', 'cap.refresh': 'Refresh', 'cap.none': 'No data yet',
    'range.title': '1. Time range',
    'range.p5': 'Last 5 min', 'range.p15': 'Last 15 min', 'range.p60': 'Last hour', 'range.all': 'Everything recorded',
    'range.from': 'From', 'range.to': 'To', 'range.invalid': 'Invalid range',
    'pcs.title': '2. Peer connections',
    'pcs.inRange': (p) => `(${p.n} in range)`,
    'pcs.all': 'All connections in range',
    'pcs.colPage': 'Page', 'pcs.colConn': 'Connection', 'pcs.colStarted': 'Started', 'pcs.colLast': 'Last activity', 'pcs.colStatus': 'Status',
    'pcs.conn': (p) => `tab ${p.tab} · #${p.n}${p.frame ? ` · frame ${p.frame}` : ''}`,
    'pcs.closed': 'closed', 'pcs.active': 'active', 'pcs.idle': 'idle',
    'pcs.empty': 'No peer connections were recorded in this time range. Click “Start Recording”, then open or reload a page that uses WebRTC, and they will show up here.',
    'out.title': '3. Output',
    'out.gum': 'Include getUserMedia / getDisplayMedia calls',
    'out.gz': 'Compress (.json.gz)',
    'out.download': 'Download export',
    'out.view': 'Open in viewer',
    'out.preparing': 'Preparing…',
    'out.exported': (p) => `Exported ${p.n} peer ${plural(p.n, 'connection', 'connections')} (${p.size} uncompressed).`,
    'out.opened': (p) => `Opened ${p.n} peer ${plural(p.n, 'connection', 'connections')} in the viewer (also saved under “Imported data”).`,
    'out.recName': (p) => `Recording ${p.from} – ${p.to}`,
    'err.range': 'Choose a valid time range (From must be before To).',
    'err.selectPc': 'Select at least one peer connection.',
    'err.nothing': 'Nothing was recorded in this time range.',
    // import
    'import.title': 'Import a dump',
    'import.lede': 'Import a file exported by this extension, or a dump saved from <code>chrome://webrtc-internals</code> ("Download the webrtc-internals dump", compressed or not). Imported data is kept separately from live recordings and opens in its own tab.',
    'import.drop': 'Drop files here',
    'import.choose': 'or click to choose',
    'import.reading': 'Reading…',
    'import.open': 'Open',
    'import.summary': (p) => `${p.n} peer ${plural(p.n, 'connection', 'connections')} · ${p.range} · ${p.size}`,
    'import.noTimes': 'no timestamps',
    'err.notJson': 'File is not valid JSON (or gzipped JSON).',
    'err.notDump': 'This file is not a webrtc-internals dump.',
    // library
    'lib.title': 'Imported data',
    'lib.lede': 'Archives stored in this browser. Open one to browse it in the webrtc-internals style viewer.',
    'lib.colName': 'Name', 'lib.colSource': 'Source', 'lib.colRecorded': 'Recorded', 'lib.colConns': 'Connections',
    'lib.colSize': 'Size', 'lib.colImported': 'Imported',
    'lib.srcCapture': 'Recorded', 'lib.srcNative': 'webrtc-internals', 'lib.srcExt': 'Extension file',
    'lib.open': 'Open', 'lib.download': 'Download', 'lib.delete': 'Delete',
    'lib.confirmDelete': (p) => `Delete “${p.name}” from imported data? This cannot be undone.`,
    'lib.empty': 'Nothing imported yet. <a href="#import">Import a file</a> or use “Open in viewer” on the Export page.',
    // settings
    'set.title': 'Settings',
    'set.recTitle': 'Recording',
    'set.recDesc': 'Instruments RTCPeerConnection and getUserMedia in every tab while recording is on. The extension stays idle until you click “Start Recording”. Pages opened before installing need a reload.',
    'set.intervalTitle': 'Stats sampling interval',
    'set.intervalDesc': 'How often getStats() is polled (webrtc-internals uses 1 s).',
    'set.retTitle': 'Keep recorded data for',
    'set.retDesc': 'Older samples are deleted automatically.',
    'set.ret30': '30 minutes', 'set.ret60': '1 hour', 'set.ret180': '3 hours', 'set.ret360': '6 hours',
    'set.ret720': '12 hours', 'set.ret1440': '24 hours', 'set.ret10080': '7 days', 'set.ret0': 'Forever',
    'set.dataTitle': 'Recorded data',
    'set.usage': (p) => `${p.pcs} peer connections, ${p.samples} stats samples, ${p.events} events.`,
    'set.clear': 'Delete all recorded data',
    'set.confirmClear': 'Delete all recorded WebRTC data? Imported files are not affected. This cannot be undone.',
    'set.langTitle': 'Language',
    'set.langDesc': 'Language of the extension interface.',
    'set.note': 'Data never leaves your computer: it is stored in this extension\'s IndexedDB and only written to files you export.',
    // viewer
    'v.title': 'WebRTC Internals (archived)',
    'v.badge': 'ARCHIVE',
    'v.importedData': 'Imported data',
    'v.importAnother': 'Import another file',
    'v.stateAt': 'State at',
    'v.first': 'Start of recording', 'v.back': 'Back 1 second', 'v.fwd': 'Forward 1 second', 'v.last': 'End of recording',
    'v.details': 'Recording details',
    'v.pcs': (p) => `${p.n} peer ${plural(p.n, 'connection', 'connections')}`,
    'v.gums': (p) => `${p.n} getUserMedia ${plural(p.n, 'entry', 'entries')}`,
    'v.metaImported': 'Imported', 'v.metaSource': 'Source',
    'v.srcCapture': 'Recorded by this extension', 'v.srcFile': 'Imported file',
    'v.end': 'end',
    'v.dumpSummary': 'Create a WebRTC-Internals dump',
    'v.from': 'From', 'v.to': 'To', 'v.full': 'Full range', 'v.toCursor': 'End at current time position',
    'v.dumpBtn': 'Download the "webrtc-internals dump"',
    'v.compress': 'Compress result',
    'v.dumpInfo': 'The "webrtc-internals" dump is a JSON file containing API calls, events and getStats data about RTCPeerConnection objects as well as getUserMedia/getDisplayMedia API calls. Only data inside the selected time range is included.',
    'v.original': 'Download the original imported file',
    'v.originalInfo': 'Byte-for-byte copy of the imported data (decompressed).',
    'v.badRange': 'Please choose a valid time range.',
    'v.noId': 'No imported dump selected. Open one from the "Imported data" page.',
    'v.notFound': (p) => `Imported dump #${p.id} was not found. It may have been deleted.`,
    'v.empty': 'This dump contains no peer connections or getUserMedia calls.',
    'v.gumTab': 'getUserMedia/getDisplayMedia',
    'v.callerOrigin': 'Caller origin:', 'v.callerPid': 'Caller process id:',
    'v.call': (p) => `${p.kind} call`, 'v.result': (p) => `${p.kind} result`, 'v.error': (p) => `${p.kind} error`,
    'v.time': 'Time:', 'v.audioC': 'Audio constraints:', 'v.videoC': 'Video constraints:',
    'v.streamId': 'Stream id:', 'v.audioTrack': 'Audio track:', 'v.videoTrack': 'Video track:',
    'v.errName': 'Error:', 'v.errMsg': 'Error message:',
    'v.noGum': 'No getUserMedia/getDisplayMedia calls in this dump.',
    'v.filterOrigin': 'Filter by origin including ',
    'v.iceState': 'ICE connection state', 'v.connState': 'Connection state', 'v.sigState': 'Signaling state',
    'v.pair': 'ICE Candidate pair: ', 'v.grid': 'ICE candidate grid',
    'v.colTime': 'Time', 'v.colEvent': 'Event',
    'v.tsTitle': (p) => `Timestamp: ${p.t}${p.delta !== undefined ? ` delta: ${p.delta}ms` : ''}`,
    'v.statsTables': 'Stats Tables',
    'v.filterTables': 'Filter statistics by type including ',
    'v.filterGraphs': 'Filter statistics graphs by type including ',
    'v.filterPh': 'separate multiple values by `,`',
    'v.noStats': 'No getStats data in this dump.',
    'v.statistics': (p) => `Statistics ${p.id}`,
    'v.graphsFor': (p) => `Stats graphs for ${p.label}`,
    'v.noNumeric': 'No numeric values to graph.',
    'v.stale': '(not reported at this time)',
    'v.copySdp': 'Copy description to clipboard',
    'v.gridHead': ['Candidate (pair) id', 'State / Candidate type', 'Network type / address', 'Port',
      'Protocol / candidate type', '(Pair) Priority', 'Bytes sent / received', 'STUN requests sent / responses received',
      'STUN requests received / responses sent', 'RTT', 'Last data sent / received', 'Last update'],
  },

  fa: {
    appName: 'خروجی‌گیر WebRTC Internals',
    'rec.start': 'شروع ضبط',
    'rec.stop': 'توقف ضبط',
    'rec.on': 'در حال ضبط',
    'rec.off': 'ضبط نمی‌شود',
    'rec.subOn': 'فعالیت WebRTC در همه زبانه‌ها ضبط می‌شود',
    'rec.subOff': 'برای شروع، روی «شروع ضبط» کلیک کنید',
    'rec.pillTitleOn': 'برای توقف ضبط کلیک کنید',
    'rec.pillTitleOff': 'برای شروع ضبط کلیک کنید',
    'popup.active': 'فعال',
    'popup.connections': 'اتصال',
    'popup.recorded': 'ضبط‌شده',
    'popup.export': 'خروجی بر اساس بازه زمانی…',
    'popup.import': 'وارد کردن فایل dump…',
    'popup.library': 'مشاهده داده‌های واردشده',
    'popup.settings': 'تنظیمات',
    'popup.native': 'باز کردن chrome://webrtc-internals',
    'unit.h': 'ساعت', 'unit.m': 'دقیقه', 'unit.min': 'دقیقه', 'unit.s': 'ثانیه',
    'size.B': 'بایت', 'size.KB': 'کیلوبایت', 'size.MB': 'مگابایت', 'size.GB': 'گیگابایت',
    'nav.export': 'خروجی', 'nav.import': 'ورود فایل', 'nav.library': 'داده‌های واردشده', 'nav.settings': 'تنظیمات',
    'export.title': 'خروجی گرفتن از داده‌های ضبط‌شده',
    'export.lede': 'وقتی ضبط روشن است، افزونه فراخوانی‌های API، رویدادها و نمونه‌های <code>getStats()</code> مربوط به WebRTC را از همه زبانه‌ها ضبط می‌کند؛ درست مانند <code>chrome://webrtc-internals</code>. یک بازه زمانی انتخاب کنید و آن را به‌صورت dump مربوط به webrtc-internals دانلود کنید.',
    'cap.span': 'بازه ضبط‌شده', 'cap.pcs': 'اتصال‌های همتا', 'cap.samples': 'نمونه‌های آمار', 'cap.events': 'رویدادها',
    'cap.storage': 'فضای استفاده‌شده', 'cap.refresh': 'به‌روزرسانی', 'cap.none': 'هنوز داده‌ای نیست',
    'range.title': '۱. بازه زمانی',
    'range.p5': '۵ دقیقه اخیر', 'range.p15': '۱۵ دقیقه اخیر', 'range.p60': 'یک ساعت اخیر', 'range.all': 'همه داده‌های ضبط‌شده',
    'range.from': 'از', 'range.to': 'تا', 'range.invalid': 'بازه نامعتبر',
    'pcs.title': '۲. اتصال‌های همتا',
    'pcs.inRange': (p) => `(${num(p.n)} اتصال در این بازه)`,
    'pcs.all': 'همه اتصال‌های داخل بازه',
    'pcs.colPage': 'صفحه', 'pcs.colConn': 'اتصال', 'pcs.colStarted': 'شروع', 'pcs.colLast': 'آخرین فعالیت', 'pcs.colStatus': 'وضعیت',
    'pcs.conn': (p) => `زبانه ${p.tab} · #${p.n}${p.frame ? ` · فریم ${p.frame}` : ''}`,
    'pcs.closed': 'بسته‌شده', 'pcs.active': 'فعال', 'pcs.idle': 'بی‌کار',
    'pcs.empty': 'در این بازه زمانی هیچ اتصال همتایی ضبط نشده است. روی «شروع ضبط» کلیک کنید، سپس صفحه‌ای را که از WebRTC استفاده می‌کند باز یا بارگذاری مجدد کنید تا اتصال‌ها اینجا نمایش داده شوند.',
    'out.title': '۳. خروجی',
    'out.gum': 'شامل فراخوانی‌های getUserMedia / getDisplayMedia',
    'out.gz': 'فشرده‌سازی (.json.gz)',
    'out.download': 'دانلود خروجی',
    'out.view': 'باز کردن در نمایشگر',
    'out.preparing': 'در حال آماده‌سازی…',
    'out.exported': (p) => `خروجی ${num(p.n)} اتصال همتا گرفته شد (${p.size} بدون فشرده‌سازی).`,
    'out.opened': (p) => `${num(p.n)} اتصال همتا در نمایشگر باز شد (در «داده‌های واردشده» هم ذخیره شد).`,
    'out.recName': (p) => `ضبط ${p.from} – ${p.to}`,
    'err.range': 'یک بازه زمانی معتبر انتخاب کنید («از» باید قبل از «تا» باشد).',
    'err.selectPc': 'دست‌کم یک اتصال همتا انتخاب کنید.',
    'err.nothing': 'در این بازه زمانی چیزی ضبط نشده است.',
    'import.title': 'وارد کردن فایل dump',
    'import.lede': 'فایلی را که با این افزونه گرفته شده، یا dumpی را که از <code>chrome://webrtc-internals</code> ذخیره شده («Download the webrtc-internals dump»، فشرده یا غیرفشرده) وارد کنید. داده‌های واردشده جدا از ضبط زنده نگهداری می‌شوند و در زبانه جداگانه‌ای باز می‌شوند.',
    'import.drop': 'فایل‌ها را اینجا رها کنید',
    'import.choose': 'یا برای انتخاب کلیک کنید',
    'import.reading': 'در حال خواندن…',
    'import.open': 'باز کردن',
    'import.summary': (p) => `${num(p.n)} اتصال همتا · ${p.range} · ${p.size}`,
    'import.noTimes': 'بدون زمان‌سنجی',
    'err.notJson': 'فایل JSON معتبر (یا JSON فشرده با gzip) نیست.',
    'err.notDump': 'این فایل یک dump از webrtc-internals نیست.',
    'lib.title': 'داده‌های واردشده',
    'lib.lede': 'بایگانی‌های ذخیره‌شده در این مرورگر. هر کدام را باز کنید تا در نمایشگری به سبک webrtc-internals مرور شود.',
    'lib.colName': 'نام', 'lib.colSource': 'منبع', 'lib.colRecorded': 'زمان ضبط', 'lib.colConns': 'اتصال‌ها',
    'lib.colSize': 'حجم', 'lib.colImported': 'زمان ورود',
    'lib.srcCapture': 'ضبط‌شده', 'lib.srcNative': 'webrtc-internals', 'lib.srcExt': 'فایل افزونه',
    'lib.open': 'باز کردن', 'lib.download': 'دانلود', 'lib.delete': 'حذف',
    'lib.confirmDelete': (p) => `«${p.name}» از داده‌های واردشده حذف شود؟ این کار قابل بازگشت نیست.`,
    'lib.empty': 'هنوز چیزی وارد نشده است. <a href="#import">یک فایل وارد کنید</a> یا در صفحه «خروجی» از «باز کردن در نمایشگر» استفاده کنید.',
    'set.title': 'تنظیمات',
    'set.recTitle': 'ضبط',
    'set.recDesc': 'تا زمانی که ضبط روشن است، RTCPeerConnection و getUserMedia در همه زبانه‌ها پایش می‌شوند. افزونه تا وقتی روی «شروع ضبط» کلیک نکنید غیرفعال می‌ماند. صفحه‌هایی که پیش از نصب باز شده‌اند باید دوباره بارگذاری شوند.',
    'set.intervalTitle': 'فاصله نمونه‌برداری آمار',
    'set.intervalDesc': 'هر چند وقت یک بار getStats() فراخوانی شود (webrtc-internals از ۱ ثانیه استفاده می‌کند).',
    'set.retTitle': 'مدت نگهداری داده‌های ضبط‌شده',
    'set.retDesc': 'نمونه‌های قدیمی‌تر به‌طور خودکار حذف می‌شوند.',
    'set.ret30': '۳۰ دقیقه', 'set.ret60': '۱ ساعت', 'set.ret180': '۳ ساعت', 'set.ret360': '۶ ساعت',
    'set.ret720': '۱۲ ساعت', 'set.ret1440': '۲۴ ساعت', 'set.ret10080': '۷ روز', 'set.ret0': 'همیشه',
    'set.dataTitle': 'داده‌های ضبط‌شده',
    'set.usage': (p) => `${p.pcs} اتصال همتا، ${p.samples} نمونه آمار، ${p.events} رویداد.`,
    'set.clear': 'حذف همه داده‌های ضبط‌شده',
    'set.confirmClear': 'همه داده‌های ضبط‌شده WebRTC حذف شوند؟ فایل‌های واردشده تغییری نمی‌کنند. این کار قابل بازگشت نیست.',
    'set.langTitle': 'زبان',
    'set.langDesc': 'زبان رابط کاربری افزونه.',
    'set.note': 'داده‌ها هرگز از رایانه شما خارج نمی‌شوند: در IndexedDB این افزونه ذخیره می‌شوند و فقط در فایل‌هایی که خودتان خروجی می‌گیرید نوشته می‌شوند.',
    'v.title': 'WebRTC Internals (بایگانی)',
    'v.badge': 'بایگانی',
    'v.importedData': 'داده‌های واردشده',
    'v.importAnother': 'وارد کردن فایل دیگر',
    'v.stateAt': 'وضعیت در',
    'v.first': 'ابتدای ضبط', 'v.back': 'یک ثانیه عقب', 'v.fwd': 'یک ثانیه جلو', 'v.last': 'انتهای ضبط',
    'v.details': 'جزئیات ضبط',
    'v.pcs': (p) => `${num(p.n)} اتصال همتا`,
    'v.gums': (p) => `${num(p.n)} مورد getUserMedia`,
    'v.metaImported': 'زمان ورود', 'v.metaSource': 'منبع',
    'v.srcCapture': 'ضبط‌شده با این افزونه', 'v.srcFile': 'فایل واردشده',
    'v.end': 'پایان',
    'v.dumpSummary': 'ایجاد dump از WebRTC-Internals',
    'v.from': 'از', 'v.to': 'تا', 'v.full': 'کل بازه', 'v.toCursor': 'پایان در موقعیت زمانی فعلی',
    'v.dumpBtn': 'دانلود «webrtc-internals dump»',
    'v.compress': 'فشرده‌سازی نتیجه',
    'v.dumpInfo': 'dump مربوط به «webrtc-internals» یک فایل JSON شامل فراخوانی‌های API، رویدادها و داده‌های getStats اشیای RTCPeerConnection و نیز فراخوانی‌های getUserMedia/getDisplayMedia است. فقط داده‌های داخل بازه زمانی انتخاب‌شده گنجانده می‌شوند.',
    'v.original': 'دانلود فایل اصلی واردشده',
    'v.originalInfo': 'رونوشت دقیق داده‌های واردشده (از حالت فشرده خارج‌شده).',
    'v.badRange': 'لطفاً یک بازه زمانی معتبر انتخاب کنید.',
    'v.noId': 'هیچ dump واردشده‌ای انتخاب نشده است. یکی را از صفحه «داده‌های واردشده» باز کنید.',
    'v.notFound': (p) => `dump واردشده #${p.id} پیدا نشد. ممکن است حذف شده باشد.`,
    'v.empty': 'این dump هیچ اتصال همتا یا فراخوانی getUserMedia ندارد.',
    'v.gumTab': 'getUserMedia/getDisplayMedia',
    'v.callerOrigin': 'مبدأ فراخواننده:', 'v.callerPid': 'شناسه فرایند فراخواننده:',
    'v.call': (p) => `فراخوانی ${p.kind}`, 'v.result': (p) => `نتیجه ${p.kind}`, 'v.error': (p) => `خطای ${p.kind}`,
    'v.time': 'زمان:', 'v.audioC': 'محدودیت‌های صدا:', 'v.videoC': 'محدودیت‌های ویدیو:',
    'v.streamId': 'شناسه جریان:', 'v.audioTrack': 'ترک صدا:', 'v.videoTrack': 'ترک ویدیو:',
    'v.errName': 'خطا:', 'v.errMsg': 'پیام خطا:',
    'v.noGum': 'در این dump هیچ فراخوانی getUserMedia/getDisplayMedia وجود ندارد.',
    'v.filterOrigin': 'فیلتر بر اساس مبدأ شامل ',
    'v.iceState': 'وضعیت اتصال ICE', 'v.connState': 'وضعیت اتصال', 'v.sigState': 'وضعیت سیگنالینگ',
    'v.pair': 'جفت کاندید ICE: ', 'v.grid': 'جدول کاندیدهای ICE',
    'v.colTime': 'زمان', 'v.colEvent': 'رویداد',
    'v.tsTitle': (p) => `زمان: ${p.t}${p.delta !== undefined ? ` فاصله: ${p.delta}ms` : ''}`,
    'v.statsTables': 'جدول‌های آمار',
    'v.filterTables': 'فیلتر آمار بر اساس نوع شامل ',
    'v.filterGraphs': 'فیلتر نمودارهای آمار بر اساس نوع شامل ',
    'v.filterPh': 'چند مقدار را با `,` جدا کنید',
    'v.noStats': 'این dump هیچ داده getStats ندارد.',
    'v.statistics': (p) => `آمار ${p.id}`,
    'v.graphsFor': (p) => `نمودارهای آمار برای ${p.label}`,
    'v.noNumeric': 'مقدار عددی برای رسم نمودار وجود ندارد.',
    'v.stale': '(در این زمان گزارش نشده است)',
    'v.copySdp': 'کپی توضیحات در کلیپ‌بورد',
    'v.gridHead': ['شناسه کاندید (جفت)', 'وضعیت / نوع کاندید', 'نوع شبکه / آدرس', 'درگاه',
      'پروتکل / نوع کاندید', 'اولویت (جفت)', 'بایت ارسالی / دریافتی', 'درخواست‌های STUN ارسالی / پاسخ‌های دریافتی',
      'درخواست‌های STUN دریافتی / پاسخ‌های ارسالی', 'RTT', 'آخرین ارسال / دریافت داده', 'آخرین به‌روزرسانی'],
  },
};

let current = 'en';

export const lang = () => current;
export const locale = () => LANGUAGES[current].locale;
export const dir = () => LANGUAGES[current].dir;

/** Format a number in the active language (Persian digits for fa). */
export function num(n, opts) {
  return typeof n === 'number' ? n.toLocaleString(LANGUAGES[current].locale, opts) : String(n);
}

export function t(key, params, language = current) {
  const table = STRINGS[language] || STRINGS.en;
  const v = key in table ? table[key] : STRINGS.en[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(params || {}) : v;
}

/** Translate static markup inside root. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((e) => { e.innerHTML = t(e.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((e) => { e.placeholder = t(e.dataset.i18nPlaceholder); });
}

function applyDocument() {
  document.documentElement.lang = current;
  document.documentElement.dir = dir();
  applyI18n(document);
}

/**
 * Load the saved language, translate the page, and reload the page when the
 * language changes elsewhere (popup/settings) so every view stays in sync.
 */
export async function initI18n() {
  const { language } = await chrome.storage.local.get({ language: 'en' });
  current = STRINGS[language] ? language : 'en';
  applyDocument();
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.language && ch.language.newValue !== current) location.reload();
  });
  return current;
}

export async function setLanguage(language) {
  if (!STRINGS[language]) return;
  await chrome.storage.local.set({ language });
}
