// Erzeugt china-reise.ics aus den Daten in index.html.
// Aufruf: node .github/scripts/make_ics.js [alte-ics-für-nachtrag]
// Bestehende UIDs bleiben erhalten; Termine, die in der alten Datei fehlen, landen zusätzlich in china-reise-neu.ics.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = html.split('<script>')[1].split('</script>')[0];
const core = js.split('/* ===== Blatt =====')[0];
const ex = js.match(/const EX=\[[\s\S]*?\n\];/)[0];
const ctx = {Intl, Date, Math, JSON, Object, Set, String, Number, console, localStorage: {getItem: () => null, setItem() {}}};
vm.createContext(ctx);
vm.runInContext(core + '\n' + ex + '\nthis.out={D,DAYS,EX,allRows,short,times};', ctx);
const {D, EX, allRows, short, times} = ctx.out;

const oldFile = path.join(root, 'china-reise.ics');
const old = fs.existsSync(oldFile) ? fs.readFileSync(oldFile, 'utf8') : '';
const oldUid = {};
old.split('BEGIN:VEVENT').slice(1).forEach(b => {
  const g = k => (b.match(new RegExp('^' + k + ':(.*)$', 'm')) || [])[1];
  oldUid[g('SUMMARY') + '|' + g('DTSTART')] = g('UID');
});
const oldUids = new Set(Object.values(oldUid));

const esc = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const stamp = z(Date.now());
const rows = allRows();
const events = [];
rows.forEach((r, i) => {
  const it = r.it, landing = r.title.startsWith('Landung'), checkout = r.title.startsWith('Check-out');
  let end = r.ms + 36e5;
  if ((it.type === 'flight' || it.type === 'train') && !landing) {
    const a = times(it.arr)[0];
    if (a) { const [y, mo, d] = r.iso.split('-').map(Number), [h, mi] = a.split(':').map(Number); end = Date.UTC(y, mo - 1, d, h, mi) - 8 * 36e5; while (end <= r.ms) end += 864e5; }
  } else if (landing || it.type === 'hotel') end = r.ms + 30 * 6e4;
  const exItem = r.ex && EX.find(e => e.id === r.ex);
  const loc = exItem ? exItem.name + (exItem.zh ? ' ' + exItem.zh : '') : it.type === 'hotel' ? short(it) : it.type === 'box' ? it.to : it.from || it.place || it.to;
  const alarm = landing ? 0 : it.type === 'flight' ? 120 : it.type === 'train' ? 60 : it.type === 'car' ? 15 : checkout ? 60 : it.type === 'hotel' ? 0 : 30;
  const desc = (r.sub || '') + (it.to && it.type !== 'box' ? '\nZiel: ' + it.to : it.type === 'box' && it.todo ? '\n' + it.todo : '');
  const key = r.title + '|' + z(r.ms);
  const uid = oldUid[key] || `cr26-${it.id}-${r.time.replace(':', '')}@alexfeini.github.io`;
  events.push({uid, lines: [`DTSTART:${z(r.ms)}`, `DTEND:${z(end)}`, `SUMMARY:${esc(r.title)}`, `DESCRIPTION:${esc(desc)}`, `LOCATION:${esc(loc)}`], alarm, title: r.title});
});
// Aufgaben ohne Uhrzeit als ganztägige Termine
D.filter(x => x.type === 'box' && !x.dep).forEach(it => {
  const days = it.id === 'b1' ? 2 : 1, s = it.date.replace(/-/g, '');
  const e = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6) + days)).toISOString().slice(0, 10).replace(/-/g, '');
  events.push({uid: `cr26-${it.id}-tag@alexfeini.github.io`, lines: [`DTSTART;VALUE=DATE:${s}`, `DTEND;VALUE=DATE:${e}`, `SUMMARY:${esc(it.title)}`, `DESCRIPTION:${esc((it.when ? it.when + '\n' : '') + (it.todo || ''))}`, `LOCATION:${esc(it.from || '')}`], alarm: 0, title: it.title});
});
const cal = (list, name) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//China Reise 2026//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${name}`,
  ...list.flatMap(ev => ['BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${stamp}`, ...ev.lines,
    ...(ev.alarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:-PT${ev.alarm}M`, 'END:VALARM'] : []), 'END:VEVENT']),
  'END:VCALENDAR', ''].join('\r\n');
fs.writeFileSync(oldFile, cal(events, 'China Reise 2026'));
const fresh = events.filter(ev => !oldUids.has(ev.uid));
if (old && fresh.length) fs.writeFileSync(path.join(root, 'china-reise-neu.ics'), cal(fresh, 'China Reise 2026'));
console.log(`${events.length} Termine, davon neu: ${fresh.map(e => e.title).join(', ') || 'keine'}`);
