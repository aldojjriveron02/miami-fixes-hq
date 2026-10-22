/* Miami Fixes HQ v1 — jobs, quotes, customers. Offline-first, localStorage. */
(function () {
  'use strict';
  var KEY = 'mfhq_v1';
  var WORKER_URL = 'https://aldo-push.aldojjriveron.workers.dev'; // push server — live
  var VAPID_PUBLIC = 'BHiXPBXPBCUByybEGpRqjA2c-CjcqbdpEGFL_WAl8SyNF6t9akzF0hcen_wGEtmWs7Y31c_LiOIU1-cf5Hx4Ns4';

  function uid(p) { return p + Math.random().toString(36).slice(2, 9); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { n = Number(n) || 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function todayStr() { var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtDate(ds) { if (!ds) return '—';
    var p = ds.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

  function seed() {
    var c1 = uid('c');
    return {
      settings: { reviewLink: '' },
      customers: [
        { id: c1, name: 'Steave', phone: '(305) 490-5626', address: '8820 SW 54th St', notes: 'Accepted insulation 10/17.' }
      ],
      jobs: [],
      quotes: [
        { id: uid('q'), number: 'Q-001', customerId: c1, title: 'Ductwork replacement', status: 'sent',
          created: '2026-10-17', validUntil: '2026-11-16', deposit: 0,
          items: [{ desc: 'Ductwork replacement — flat quote', amount: 5500 }] },
        { id: uid('q'), number: 'Q-002', customerId: c1, title: 'Insulation', status: 'accepted',
          created: '2026-10-17', validUntil: '2026-11-16', deposit: 0,
          items: [{ desc: 'Insulation — flat quote', amount: 1981 }] }
      ]
    };
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); migrate(d); return d; } } catch (e) {}
    var s = seed(); save(s); return s;
  }
  function addDays(ds, n) { var p = String(ds || todayStr()).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nextQuoteNumber(d) { var mx = 0;
    d.quotes.forEach(function (q) { var m = /^Q-(\d+)$/.exec(q.number || ''); if (m) mx = Math.max(mx, +m[1]); });
    return 'Q-' + String(mx + 1).padStart(3, '0'); }
  function migrate(d) {
    var changed = false;
    if (!d.settings) { d.settings = { reviewLink: '' }; changed = true; }
    d.quotes.forEach(function (q) {
      if (!q.number) { q.number = nextQuoteNumber(d); changed = true; }
      if (!q.validUntil) { q.validUntil = addDays(q.created, 30); changed = true; }
      if (q.deposit == null) { q.deposit = 0; changed = true; }
    });
    if (changed) save(d);
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch (e) { toast('Storage full — export a backup!'); } }
  var DB = load();
  function persist() { save(DB); }

  var screen = document.getElementById('screen');
  function toast(msg) { var t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 2200); }
  function openSheet(html) {
    document.getElementById('sheet-body').innerHTML = html;
    document.getElementById('sheet').classList.remove('hidden');
    document.getElementById('sheet-backdrop').classList.remove('hidden');
  }
  function closeSheet() {
    document.getElementById('sheet').classList.add('hidden');
    document.getElementById('sheet-backdrop').classList.add('hidden');
  }
  document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);
  function custName(id) { var c = DB.customers.find(function (x) { return x.id === id; });
    return c ? c.name : '—'; }
  function quoteTotal(q) { return q.items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0); }
  function quoteText(q) {
    var lines = ['Miami Fixes — Quote ' + (q.number || '')];
    lines.push(q.title || 'Quote');
    if (q.customerId) lines.push('Customer: ' + custName(q.customerId));
    lines.push('----------------');
    q.items.forEach(function (it) { lines.push((it.desc || 'Item') + '  ' + money(it.amount)); });
    lines.push('----------------');
    lines.push('Total: ' + money(quoteTotal(q)));
    if (Number(q.deposit)) lines.push('Deposit: ' + money(q.deposit));
    if (q.validUntil) lines.push('Valid until: ' + fmtDate(q.validUntil));
    return lines.join('\n');
  }

  var tabBtns = document.querySelectorAll('#tabs button');
  tabBtns.forEach(function (b) { b.addEventListener('click', function () {
    tabBtns.forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); render(b.dataset.tab);
  }); });
  document.getElementById('today-line').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  function render(tab) {
    window.scrollTo(0, 0);
    if (tab === 'today') renderToday();
    else if (tab === 'jobs') renderJobs();
    else if (tab === 'quotes') renderQuotes();
    else renderCustomers();
  }

  function renderToday() {
    var t = todayStr();
    var todays = DB.jobs.filter(function (j) { return j.date === t && j.status !== 'done'; });
    var overdue = DB.jobs.filter(function (j) { return j.date && j.date < t && j.status !== 'done'; });
    var upcoming = DB.jobs.filter(function (j) { return j.date && j.date > t && j.status !== 'done'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 5);
    var openQuotes = DB.quotes.filter(function (q) { return q.status === 'sent' || q.status === 'draft'; });
    var unpaidJobs = DB.jobs.filter(function (j) { return j.status === 'done' && !j.paid && Number(j.price) > 0; });
    var unpaidTotal = unpaidJobs.reduce(function (s, j) { return s + (Number(j.price) || 0); }, 0);
    var staleQuotes = DB.quotes.filter(function (q) {
      return q.status === 'sent' && q.created && q.created <= addDays(todayStr(), -3); });
    var h = '';
    if (unpaidJobs.length) {
      h += '<div class="section-title">💰 Owed to you: ' + money(unpaidTotal) + '</div>' + unpaidJobs.map(function (j) {
        var c = DB.customers.find(function (x) { return x.id === j.customerId; });
        var tel = c && c.phone ? c.phone.replace(/[^+\d]/g, '') : '';
        return '<div class="card" onclick="MF.editJob(\'' + j.id + '\')"><div class="row"><h3>' +
          esc(j.title || 'Job') + '</h3><span class="pill overdue">unpaid</span></div>' +
          '<div class="muted">' + esc(c ? c.name : '—') + ' · ' + fmtDate(j.date) + '</div>' +
          '<div class="money">' + money(j.price) + '</div>' +
          (tel ? '<div class="btn-row"><a class="btn" href="tel:' + esc(tel) + '" onclick="event.stopPropagation()">📞 Call</a>' +
            '<a class="btn secondary" href="sms:' + esc(tel) + '?&body=' +
            encodeURIComponent('Hey ' + (c ? c.name : 'there') + ', it\'s Aldo from Miami Fixes — just a friendly nudge on the balance of ' +
              money(j.price) + ' for the work done ' + fmtDate(j.date) + '. Let me know when you can take care of it. Thanks! — Aldo') +
            '" onclick="event.stopPropagation()">💬 Nudge</a></div>' : '') + '</div>';
      }).join('');
    }
    if (staleQuotes.length) {
      h += '<div class="section-title">📞 Follow up (' + staleQuotes.length + ')</div>' + staleQuotes.map(function (q) {
        var c = DB.customers.find(function (x) { return x.id === q.customerId; });
        var tel = c && c.phone ? c.phone.replace(/[^+\d]/g, '') : '';
        return '<div class="card"><div class="row"><h3>' + esc(q.title || 'Quote') + '</h3>' +
          '<span class="pill sent">needs follow-up</span></div>' +
          '<div class="muted">' + esc(q.number || '') + ' · ' + esc(c ? c.name : '—') + ' · sent ' + fmtDate(q.created) + '</div>' +
          '<div class="money">' + money(quoteTotal(q)) + '</div>' +
          (tel ? '<div class="btn-row"><a class="btn" href="tel:' + esc(tel) + '">📞 Call</a>' +
            '<a class="btn secondary" href="sms:' + esc(tel) + '?&body=' +
            encodeURIComponent('Hey ' + (c ? c.name : 'there') + ', it\'s Aldo from Miami Fixes — just checking in on the quote I sent. Still interested? Happy to answer any questions. — Aldo') +
            '">💬 Text</a></div>' : '<div class="muted">No phone on file</div>') + '</div>';
      }).join('');
    }
    if (overdue.length) h += '<div class="section-title">Overdue (' + overdue.length + ')</div>' + overdue.map(jobCard).join('');
    h += '<div class="section-title">Today (' + todays.length + ')</div>';
    h += todays.length ? todays.map(jobCard).join('') : '<div class="card muted">Nothing scheduled today.</div>';
    if (upcoming.length) h += '<div class="section-title">Coming up</div>' + upcoming.map(jobCard).join('');
    h += '<div class="section-title">At a glance</div><div class="card"><div class="row"><span>Open quotes</span><b>' +
      openQuotes.length + '</b></div><div class="row"><span>Customers</span><b>' + DB.customers.length +
      '</b></div>';
    var monthPrefix = todayStr().slice(0, 7);
    var earnedMonth = DB.jobs.filter(function (j) { return j.status === 'done' && j.paid && (j.date || '').indexOf(monthPrefix) === 0; })
      .reduce(function (s, j) { return s + (Number(j.price) || 0); }, 0);
    var doneMonth = DB.jobs.filter(function (j) { return j.status === 'done' && (j.date || '').indexOf(monthPrefix) === 0; }).length;
    h += '<div class="row"><span>💰 Earned this month</span><b>' + money(earnedMonth) + '</b></div>' +
      '<div class="row"><span>Jobs done this month</span><b>' + doneMonth + '</b></div>' +
      (unpaidTotal > 0 ? '<div class="row"><span>💰 Owed to you</span><b>' + money(unpaidTotal) + '</b></div>' : '') +
      '</div>';
    h += '<button class="btn" onclick="MF.newJob()">+ New Job</button>';
    h += '<button class="btn secondary" onclick="MF.enablePush()">🔔 Enable notifications</button>';
    h += '<button class="btn secondary" onclick="MF.testBuzz()">🔔 Test buzz</button>';
    h += '<button class="btn secondary" onclick="MF.backupSheet()">Backup / Restore</button>';
    h += '<button class="btn secondary" onclick="MF.settingsSheet()">⚙️ Settings</button>';
    screen.innerHTML = h;
  }
  function jobCard(j) {
    var over = j.date && j.date < todayStr() && j.status !== 'done';
    return '<div class="card" onclick="MF.editJob(\'' + j.id + '\')">' +
      '<div class="row"><h3>' + esc(j.title || 'Job') + '</h3>' +
      '<span class="pill ' + (over ? 'overdue' : j.status) + '">' + (over ? 'overdue' : String(j.status).replace('-', ' ')) + '</span></div>' +
      '<div class="muted">' + esc(custName(j.customerId)) + ' - ' + fmtDate(j.date) + (j.time ? ' ' + esc(j.time) : '') + '</div>' +
      (j.price ? '<div class="money">' + money(j.price) + '</div>' : '') + '</div>';
  }

  function renderJobs() {
    var open = DB.jobs.filter(function (j) { return j.status !== 'done'; })
      .sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
    var done = DB.jobs.filter(function (j) { return j.status === 'done'; }).slice(-20).reverse();
    var h = '<button class="btn" onclick="MF.newJob()">+ New Job</button>';
    h += '<div class="section-title">Open (' + open.length + ')</div>';
    h += open.length ? open.map(jobCard).join('') : '<div class="card muted">No open jobs.</div>';
    if (done.length) h += '<div class="section-title">Done</div>' + done.map(jobCard).join('');
    screen.innerHTML = h;
  }

  function renderQuotes() {
    var h = '<button class="btn" onclick="MF.newQuote()">+ New Quote</button>';
    var sorted = DB.quotes.slice().sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    h += sorted.length ? sorted.map(function (q) {
      return '<div class="card" onclick="MF.editQuote(\'' + q.id + '\')">' +
        '<div class="row"><h3>' + esc(q.title || 'Quote') + '</h3>' +
        '<span class="pill ' + q.status + '">' + q.status + '</span></div>' +
        '<div class="muted">' + esc(q.number || '') + ' · ' + esc(custName(q.customerId)) + ' - ' + fmtDate(q.created) + '</div>' +
        '<div class="money">' + money(quoteTotal(q)) + '</div></div>';
    }).join('') : '<div class="card muted">No quotes yet.</div>';
    screen.innerHTML = h;
  }

  function renderCustomers() {
    var h = '<button class="btn" onclick="MF.newCustomer()">+ New Customer</button>';
    var sorted = DB.customers.slice().sort(function (a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    h += sorted.length ? sorted.map(function (c) {
      var jobs = DB.jobs.filter(function (j) { return j.customerId === c.id; }).length;
      var tel = c.phone ? c.phone.replace(/[^+\d]/g, '') : '';
      return '<div class="card" onclick="MF.editCustomer(\'' + c.id + '\')">' +
        '<h3>' + esc(c.name) + '</h3>' +
        (c.phone ? '<div><a class="tel" href="tel:' + esc(tel) + '" onclick="event.stopPropagation()">' + esc(c.phone) + '</a></div>' : '') +
        (c.address ? '<div class="muted">' + esc(c.address) + '</div>' : '') +
        '<div class="muted">' + jobs + ' job' + (jobs === 1 ? '' : 's') + '</div></div>';
    }).join('') : '<div class="card muted">No customers yet.</div>';
    screen.innerHTML = h;
  }

  function field(label, inner) { return '<label>' + label + '</label>' + inner; }
  function inp(id, val, ph, type) {
    return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') +
      '" placeholder="' + esc(ph || '') + '">'; }
  function customerSelect(id, val) {
    var h = '<select id="' + id + '"><option value="">- pick -</option>';
    DB.customers.forEach(function (c) {
      h += '<option value="' + c.id + '"' + (c.id === val ? ' selected' : '') + '>' + esc(c.name) + '</option>'; });
    return h + '</select>';
  }
  function statusSelect(id, val, opts) {
    return '<select id="' + id + '">' + opts.map(function (s) {
      return '<option value="' + s + '"' + (val === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>';
  }
  function formBtns(saveFn, id) {
    return '<div class="btn-row"><button class="btn" onclick="' + saveFn + '(\'' + (id || '') + '\')">Save</button>' +
      (id ? '<button class="btn danger" onclick="' + saveFn.replace('save', 'del') + '(\'' + id + '\')">Delete</button>' : '') +
      '</div><button class="btn secondary" onclick="MF.close()">Cancel</button>';
  }

  function jobForm(j) {
    j = j || {};
    openSheet('<h2>' + (j.id ? 'Edit Job' : 'New Job') + '</h2>' +
      field('Title', inp('f_title', j.title, 'e.g. Ductwork repair')) +
      field('Customer', customerSelect('f_customer', j.customerId)) +
      field('Address', inp('f_address', j.address, 'Street address')) +
      field('Date', inp('f_date', j.date || todayStr(), '', 'date')) +
      field('Time', inp('f_time', j.time, '09:00', 'time')) +
      field('Price ($)', inp('f_price', j.price, '0', 'number')) +
      field('Status', statusSelect('f_status', j.status || 'scheduled', ['scheduled', 'in-progress', 'done'])) +
      field('Notes', '<textarea id="f_notes">' + esc(j.notes) + '</textarea>') +
      formBtns('MF.saveJob', j.id) +
      (j.id ? '<button class="btn secondary" onclick="MF.cal(\'' + j.id + '\')">📅 Add to iPhone Calendar</button>' : '') +
      (j.id && j.status === 'done' ? '<button class="btn" onclick="MF.askReview(\'' + j.id + '\')">⭐ Ask for Google review</button>' : '') +
      (j.id && j.status === 'done' && !j.paid ? '<button class="btn" onclick="MF.markPaid(\'' + j.id + '\')">💰 Mark paid</button>' : '') +
      (j.id && j.status === 'done' && j.paid ? '<div class="card"><b>💰 Paid</b></div>' : ''));
  }

  function quoteForm(q) {
    q = q || { items: [{ desc: '', amount: '' }] };
    var itemsHtml = q.items.map(function (it, i) {
      return '<div class="item-row"><input data-i="' + i + '" data-k="desc" value="' + esc(it.desc) +
        '" placeholder="Description"><input data-i="' + i + '" data-k="amount" type="number" value="' +
        esc(it.amount) + '" placeholder="$"></div>'; }).join('');
    openSheet('<h2>' + (q.id ? 'Edit Quote' : 'New Quote') + '</h2>' +
      (q.id || q.number ? '<div class="muted">Quote ' + esc(q.number || nextQuoteNumber(DB)) + '</div>' : '') +
      field('Title', inp('f_title', q.title, 'e.g. Ductwork quote')) +
      field('Customer', customerSelect('f_customer', q.customerId)) +
      field('Line items', '<div id="f_items">' + itemsHtml + '</div>' +
        '<button class="btn small secondary" onclick="MF.addItem()">+ Add line</button>') +
      field('Deposit ($, optional)', inp('f_deposit', q.deposit || '', '0', 'number')) +
      field('Valid until', inp('f_valid', q.validUntil || addDays(todayStr(), 30), '', 'date')) +
      field('Status', statusSelect('f_status', q.status || 'draft', ['draft', 'sent', 'accepted', 'declined'])) +
      formBtns('MF.saveQuote', q.id) +
      (q.id ? '<button class="btn secondary" onclick="MF.shareQuote(\'' + q.id + '\')">📤 Share quote</button>' : '') +
      (q.id && q.status === 'accepted' ? '<button class="btn" onclick="MF.quoteToJob(\'' + q.id + '\')">🔧 Create job from this quote</button>' : ''));
  }

  function customerForm(c) {
    c = c || {};
    var jobs = c.id ? DB.jobs.filter(function (j) { return j.customerId === c.id; }) : [];
    var hist = jobs.length ? '<div class="section-title">Job history</div>' + jobs.map(function (j) {
      return '<div class="card"><b>' + esc(j.title || 'Job') + '</b><div class="muted">' +
        fmtDate(j.date) + (j.price ? ' - ' + money(j.price) : '') + '</div></div>'; }).join('') : '';
    openSheet('<h2>' + (c.id ? esc(c.name) : 'New Customer') + '</h2>' +
      field('Name', inp('f_name', c.name, 'Full name')) +
      field('Phone', inp('f_phone', c.phone, '(305) 555-0100', 'tel')) +
      field('Address', inp('f_address', c.address, 'Street address')) +
      field('Notes', '<textarea id="f_notes">' + esc(c.notes) + '</textarea>') + hist +
      formBtns('MF.saveCustomer', c.id));
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function currentTab() { var a = document.querySelector('#tabs button.active'); return a ? a.dataset.tab : 'today'; }

  /* ---------- Push notifications (shared push server) ---------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  function urlB64ToU8(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function jobEpoch(j) {
    if (!j.date) return 0;
    var t = new Date(j.date + 'T' + (j.time || '09:00') + ':00').getTime();
    return isNaN(t) ? 0 : t;
  }
  async function syncPushReminders() {
    try {
      var subRaw = localStorage.getItem('mfhq_push_sub');
      if (!subRaw || WORKER_URL.indexOf('REPLACE_ME') !== -1) return;
      var sub = JSON.parse(subRaw);
      var now = Date.now(), out = [];
      DB.jobs.forEach(function (j) {
        if (j.status === 'done') return;
        var ts = jobEpoch(j);
        if (!ts || ts <= now) return;
        var label = (j.title || 'Job') + ' — ' + custName(j.customerId);
        if (ts - 24 * 3600 * 1000 > now) out.push({ id: j.id + '-24h', title: '🔧 Tomorrow: ' + (j.title || 'Job'),
          body: custName(j.customerId) + ' · ' + fmtDate(j.date) + (j.time ? ' ' + j.time : ''), at: ts - 24 * 3600 * 1000 });
        if (ts - 30 * 60 * 1000 > now) out.push({ id: j.id + '-30m', title: '🔧 Starting soon: ' + (j.title || 'Job'),
          body: label + (j.address ? ' · ' + j.address : ''), at: ts - 30 * 60 * 1000 });
      });
      await fetch(WORKER_URL + '/reminders', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, reminders: out }) });
    } catch (e) {}
  }

  /* ---------- Add to iPhone Calendar (.ics) ---------- */
  function parseTime(t) {
    var m = String(t || '09:00').trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return '090000';
    var h = +m[1], ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + m[2] + '00';
  }
  function icsEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function icsFor(j) {
    if (!j.date) return null;
    var d = j.date.replace(/-/g, '');
    var t0 = parseTime(j.time);
    var h = +t0.slice(0, 2);
    var t1 = String((h + 1) % 24).padStart(2, '0') + t0.slice(2);
    var stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    var cname = custName(j.customerId);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Miami Fixes HQ//EN', 'BEGIN:VEVENT',
      'UID:' + j.id + '@miamifixeshq',
      'DTSTAMP:' + stamp,
      'DTSTART;TZID=America/New_York:' + d + 'T' + t0,
      'DTEND;TZID=America/New_York:' + d + 'T' + t1,
      'SUMMARY:' + icsEsc((j.title || 'Job') + ' — ' + cname),
      'LOCATION:' + icsEsc(j.address || ''),
      'DESCRIPTION:' + icsEsc([cname && ('Customer: ' + cname), j.price && ('Price: ' + money(j.price)), j.notes && ('Notes: ' + j.notes)].filter(Boolean).join('\n')),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc('Miami Fixes: ' + (j.title || 'Job')), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    return lines.join('\r\n');
  }

  window.MF = {
    close: closeSheet,
    newJob: function () { jobForm(); },
    editJob: function (id) { jobForm(DB.jobs.find(function (j) { return j.id === id; })); },
    saveJob: function (id) {
      var title = val('f_title'); if (!title) { toast('Give the job a title'); return; }
      var wasDone = false;
      if (id) { var ex = DB.jobs.find(function (x) { return x.id === id; }); wasDone = !!(ex && ex.status === 'done'); }
      var rec = { title: title, customerId: val('f_customer'), address: val('f_address'),
        date: val('f_date'), time: val('f_time'), price: Number(val('f_price')) || 0,
        status: val('f_status'), notes: val('f_notes') };
      var savedId = id;
      if (id) { var j = DB.jobs.find(function (x) { return x.id === id; }); for (var k in rec) j[k] = rec[k]; }
      else { rec.id = uid('j'); DB.jobs.push(rec); savedId = rec.id; }
      persist(); closeSheet(); render(currentTab());
      syncPushReminders();
      if (rec.status === 'done' && !wasDone) {
        var c = DB.customers.find(function (x) { return x.id === rec.customerId; });
        var cname = c ? c.name : 'the customer';
        openSheet('<h2>Job done! 🎉</h2>' +
          '<p>Want to ask ' + esc(cname) + ' for a Google review right now? ' +
          'This is when they\'re most likely to say yes.</p>' +
          '<div class="btn-row"><button class="btn" onclick="MF.askReview(\'' + savedId + '\')">⭐ Yes, text them</button></div>' +
          '<button class="btn secondary" onclick="MF.scheduleTuneup(\'' + savedId + '\')">📅 Tune-up reminder in 6 months</button>' +
          '<button class="btn secondary" onclick="MF.close()">Not now</button>');
      } else {
        toast('Job saved');
      }
    },
    scheduleTuneup: function (id) {
      var j = DB.jobs.find(function (x) { return x.id === id; });
      if (!j) return;
      var c = DB.customers.find(function (x) { return x.id === j.customerId; });
      var future = addDays(todayStr(), 180);
      var rec = { id: uid('j'), title: 'AC tune-up — ' + (c ? c.name : (j.title || 'returning customer')),
        customerId: j.customerId, address: j.address, date: future, time: '09:00',
        price: 0, status: 'scheduled', notes: '6-month tune-up follow-up from job: ' + (j.title || '') + ' (' + fmtDate(j.date) + ')' };
      DB.jobs.push(rec);
      persist(); closeSheet(); render(currentTab());
      toast('Tune-up scheduled for ' + fmtDate(future));
      syncPushReminders();
    },
    delJob: function (id) {
      if (!confirm('Delete this job?')) return;
      DB.jobs = DB.jobs.filter(function (j) { return j.id !== id; });
      persist(); closeSheet(); render(currentTab()); toast('Job deleted');
      syncPushReminders();
    },
    askReview: function (id) {
      var j = DB.jobs.find(function (x) { return x.id === id; });
      if (!j) return;
      var c = DB.customers.find(function (x) { return x.id === j.customerId; });
      if (!c || !c.phone) { toast('Add a phone number for this customer first'); return; }
      var link = (DB.settings && DB.settings.reviewLink) || '';
      var msg = 'Hey ' + c.name + ', it\'s Aldo from Miami Fixes — thanks for the business today! ' +
        'If you were happy with the work, a Google review would mean a lot. ' +
        (link ? 'Here\'s the link: ' + link : 'Just search "Miami Fixes" on Google and hit the review button. ') +
        'Thanks again! 🔧';
      var tel = c.phone.replace(/[^+\d]/g, '');
      window.location.href = 'sms:' + tel + '?&body=' + encodeURIComponent(msg);
    },
    settingsSheet: function () {
      var link = (DB.settings && DB.settings.reviewLink) || '';
      openSheet('<h2>Settings</h2>' +
        field('Google review link',
          inp('f_reviewlink', link, 'Paste your Google review link here') +
          '<p class="muted">Get it from your Google Business Profile: Ask for reviews, copy the link, paste it here. ' +
          'After each job, tap "Ask for Google review" and this link goes out in the text.</p>') +
        '<div class="btn-row"><button class="btn" onclick="MF.saveSettings()">Save</button></div>' +
        '<button class="btn secondary" onclick="MF.close()">Close</button>');
    },
    saveSettings: function () {
      if (!DB.settings) DB.settings = {};
      DB.settings.reviewLink = val('f_reviewlink');
      persist(); closeSheet(); toast('Settings saved');
    },
    markPaid: function (id) {
      var j = DB.jobs.find(function (x) { return x.id === id; });
      if (!j) return;
      j.paid = true; persist(); closeSheet(); render(currentTab()); toast('Marked paid 💰');
    },
    cal: function (id) {
      var j = DB.jobs.find(function (x) { return x.id === id; });
      if (!j) return;
      if (!j.date) { toast('Set a date first'); return; }
      var ics = icsFor(j);
      var blob = new Blob([ics], { type: 'text/calendar' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'job-' + j.date + '.ics';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 800);
      toast('Open the file to add it to your calendar');
    },
    newQuote: function () { quoteForm(); },
    editQuote: function (id) { quoteForm(DB.quotes.find(function (q) { return q.id === id; })); },
    addItem: function () {
      var box = document.getElementById('f_items');
      var i = box.children.length;
      var div = document.createElement('div'); div.className = 'item-row';
      div.innerHTML = '<input data-i="' + i + '" data-k="desc" placeholder="Description">' +
        '<input data-i="' + i + '" data-k="amount" type="number" placeholder="$">';
      box.appendChild(div);
    },
    saveQuote: function (id) {
      var title = val('f_title'); if (!title) { toast('Give the quote a title'); return; }
      var items = [];
      document.querySelectorAll('#f_items .item-row').forEach(function (row) {
        var d = row.querySelector('[data-k="desc"]').value.trim();
        var a = Number(row.querySelector('[data-k="amount"]').value) || 0;
        if (d || a) items.push({ desc: d, amount: a });
      });
      if (!items.length) { toast('Add at least one line item'); return; }
      var rec = { title: title, customerId: val('f_customer'), items: items,
        status: val('f_status'), created: todayStr(),
        deposit: Number(val('f_deposit')) || 0, validUntil: val('f_valid') || addDays(todayStr(), 30) };
      if (id) { var q = DB.quotes.find(function (x) { return x.id === id; });
        for (var k in rec) { if (k !== 'created' && k !== 'number') q[k] = rec[k]; }
        if (!q.number) q.number = nextQuoteNumber(DB);
      }
      else { rec.id = uid('q'); rec.number = nextQuoteNumber(DB); DB.quotes.push(rec); }
      persist(); closeSheet(); render(currentTab()); toast('Quote saved');
    },
    delQuote: function (id) {
      if (!confirm('Delete this quote?')) return;
      DB.quotes = DB.quotes.filter(function (q) { return q.id !== id; });
      persist(); closeSheet(); render(currentTab()); toast('Quote deleted');
    },
    quoteToJob: function (id) {
      var q = DB.quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      var rec = { id: uid('j'), title: q.title, customerId: q.customerId,
        date: todayStr(), time: '09:00', price: quoteTotal(q),
        status: 'scheduled', notes: 'From quote ' + (q.number || '') };
      DB.jobs.push(rec);
      persist(); closeSheet(); render(currentTab());
      toast('Job created from quote');
      syncPushReminders();
      jobForm(DB.jobs.find(function (x) { return x.id === rec.id; }));
    },
    shareQuote: function (id) {
      var q = DB.quotes.find(function (x) { return x.id === id; });
      if (!q) return;
      var text = quoteText(q);
      function copied() { toast('Quote copied — paste it in a text'); }
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(copied, copied);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); copied();
      }
    },
    newCustomer: function () { customerForm(); },
    editCustomer: function (id) { customerForm(DB.customers.find(function (c) { return c.id === id; })); },
    saveCustomer: function (id) {
      var name = val('f_name'); if (!name) { toast('Give the customer a name'); return; }
      var dupe = DB.customers.find(function (c) {
        return c.name.toLowerCase() === name.toLowerCase() && c.id !== id; });
      if (dupe && !confirm('You already have a customer named "' + dupe.name + '". Save anyway?')) return;
      var rec = { name: name, phone: val('f_phone'), address: val('f_address'), notes: val('f_notes') };
      if (id) { var c = DB.customers.find(function (x) { return x.id === id; }); for (var k in rec) c[k] = rec[k]; }
      else { rec.id = uid('c'); DB.customers.push(rec); }
      persist(); closeSheet(); render(currentTab()); toast('Customer saved');
    },
    delCustomer: function (id) {
      if (!confirm('Delete this customer and their jobs?')) return;
      DB.customers = DB.customers.filter(function (c) { return c.id !== id; });
      DB.jobs = DB.jobs.filter(function (j) { return j.customerId !== id; });
      DB.quotes = DB.quotes.filter(function (q) { return q.customerId !== id; });
      persist(); closeSheet(); render(currentTab()); toast('Customer deleted');
    },
    backupSheet: function () {
      openSheet('<h2>Backup / Restore</h2>' +
        '<p class="muted">Your data lives on this phone. Download a backup now and then so you never lose it.</p>' +
        '<button class="btn" onclick="MF.backup()">Download backup</button>' +
        '<label>Restore from file</label><input type="file" accept=".json" onchange="MF.restore(this)">' +
        '<button class="btn secondary" onclick="MF.close()">Close</button>');
    },
    backup: function () {
      var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'miami-fixes-backup-' + todayStr() + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500);
      toast('Backup downloaded');
    },
    restore: function (input) {      var f = input.files && input.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var d = JSON.parse(r.result);
          if (!d.customers || !d.jobs || !d.quotes) throw 0;
          DB = d; persist(); render(currentTab()); toast('Backup restored');
        } catch (e) { toast('That file is not a valid backup'); }
      };
      r.readAsText(f); input.value = '';
    },
    enablePush: async function () {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast("This browser can't do push"); return; }
        if (WORKER_URL.indexOf('REPLACE_ME') !== -1) { toast('Push server not connected yet'); return; }
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { toast('Allow notifications in Settings'); return; }
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC) });
        localStorage.setItem('mfhq_push_sub', JSON.stringify(sub));
        await fetch(WORKER_URL + '/subscribe', { method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subscription: sub, label: "Aldo's iPhone" }) });
        await syncPushReminders();
        toast("Notifications on — I'll buzz you");
        render(currentTab());
      } catch (e) { toast('Could not enable notifications'); }
    },
    testBuzz: async function () {
      var lines = [];
      lines.push('Push API: ' + (('PushManager' in window) ? 'yes' : 'MISSING'));
      var perm = (('Notification' in window) ? Notification.permission : 'no API');
      if (perm === 'default') {
        try { perm = await Notification.requestPermission(); } catch (e) {}
      }
      lines.push('Notification perm: ' + perm);
      try {
        if (!('serviceWorker' in navigator)) throw new Error('no service worker');
        var reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('SW not ready (timeout)')); }, 5000); })
        ]);
        lines.push('Service worker: ready');
        var sub = await reg.pushManager.getSubscription();
        lines.push('Push subscription: ' + (sub ? 'ACTIVE' : 'none yet'));
        await reg.showNotification('🔧 Test buzz', {
          body: 'If you see this, notifications work on your phone.',
          icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'mfhq-test' });
        lines.push('Test notification: SENT');
      } catch (e) { lines.push('PROBLEM: ' + e.message); }
      openSheet('<h2>Buzz test result</h2>' +
        lines.map(function (l) { return '<div class="card">' + esc(l) + '</div>'; }).join('') +
        '<p class="muted">Read me what it says, or screenshot it.</p>' +
        '<button class="btn secondary" onclick="MF.close()">Close</button>');
    }
  };

  render('today');
})();
