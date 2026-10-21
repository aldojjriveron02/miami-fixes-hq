/* Miami Fixes HQ v1 — jobs, quotes, customers. Offline-first, localStorage. */
(function () {
  'use strict';
  var KEY = 'mfhq_v1';

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

  /* ---------- store ---------- */
  function seed() {
    var c1 = uid('c');
    return {
      customers: [
        { id: c1, name: 'Steave', phone: '(305) 490-5626', address: '8820 SW 54th St', notes: 'Accepted insulation 10/17.' }
      ],
      jobs: [],
      quotes: [
        { id: uid('q'), customerId: c1, title: 'Ductwork replacement', status: 'sent',
          created: '2026-10-17', items: [{ desc: 'Ductwork replacement — flat quote', amount: 5500 }] },
        { id: uid('q'), customerId: c1, title: 'Insulation', status: 'accepted',
          created: '2026-10-17', items: [{ desc: 'Insulation — flat quote', amount: 1981 }] }
      ]
    };
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    var s = seed(); save(s); return s;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { toast('Storage full — export a backup!'); } }
  var DB = load();
  function persist() { save(DB); }

  /* ---------- ui helpers ---------- */
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

  /* ---------- tabs ---------- */
  var tabBtns = document.querySelectorAll('#tabs button');
  tabBtns.forEach(function (b) { b.addEventListener('click', function () {
    tabBtns.forEach(function (x) { x.classList.remove('active'); });
    b.classList.add('active'); render(b.dataset.tab);
  }); });
  document.getElementById('today-line').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  function render(tab) {
    window.scrollTo(0, 0);
    ({ today: renderToday, jobs: renderJobs, quotes: renderQuotes, customers: renderCustomers })[tab]();
  }

  /* ---------- TODAY ---------- */
  function renderToday() {
    var t = todayStr();
    var todays = DB.jobs.filter(function (j) { return j.date === t && j.status !== 'done'; });
    var overdue = DB.jobs.filter(function (j) { return j.date && j.date < t && j.status !== 'done'; });
    var upcoming = DB.jobs.filter(function (j) { return j.date && j.date > t && j.status !== 'done'; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 5);
    var openQuotes = DB.quotes.filter(function (q) { return q.status === 'sent' || q.status === 'draft'; });
    var h = '';
    if (overdue.length) {
      h += '<div class="section-title">⚠️ Overdue (' + overdue.length + ')</div>';
      h += overdue.map(jobCard).join('');
    }
    h += '<div class="section-title">📋 Today (' + todays.length + ')</div>';
    h += todays.length ? todays.map(jobCard).join('') : '<div class="card muted">Nothing scheduled today.</div>';
    if (upcoming.length) {
      h += '<div class="section-title">🔜 Coming up</div>' + upcoming.map(jobCard).join('');
    }
    h += '<div class="section-title">📊 At a glance</div><div class="card"><div class="row"><span>Open quotes</span><b>' +
      openQuotes.length + '</b></div><div class="row"><span>Customers</span><b>' +
      DB.customers.length + '</b></div></div>';
    h += '<button class="btn" onclick="MF.newJob()">+ New Job</button>';
    h += '<button class="btn secondary" onclick="MF.backup()">⬇ Backup / Restore</button>';
    screen.innerHTML = h;
  }
  function jobCard(j) {
    var over = j.date && j.date < todayStr() && j.status !== 'done';
    return '<div class="card" onclick="MF.editJob(\'' + j.id + '\')">' +
      '<div class="row"><h3>' + esc(j.title || 'Job') + '</h3>' +
      '<span class="pill ' + (over ? 'overdue' : j.status) + '">' + (over ? 'overdue' : j.status.replace('-', ' ')) + '</span></div>' +
      '<div class="muted">' + esc(custName(j.customerId)) + ' · ' + fmtDate(j.date) + (j.time ? ' ' + esc(j.time) : '') + '</div>' +
      (j.price ? '<div class="money">' + money(j.price) + '</div>' : '') + '</div>';
  }

  /* ---------- JOBS ---------- */
  function renderJobs() {
    var t = todayStr();
    var open = DB.jobs.filter(function (j) { return j.status !== 'done'; })
      .sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
    var done = DB.jobs.filter(function (j) { return j.status === 'done'; }).slice(-20).reverse();
    var h = '<button class="btn" onclick="MF.newJob()">+ New Job</button>';
    h += '<div class="section-title">Open (' + open.length + ')</div>';
    h += open.length ? open.map(jobCard).join('') : '<div class="card muted">No open jobs.</div>';
    if (done.length) h += '<div class="section-title">Done</div>' + done.map(jobCard).join('');
    screen.innerHTML = h;
  }

  /* ---------- QUOTES ---------- */
  function renderQuotes() {
    var h = '<button class="btn" onclick="MF.newQuote()">+ New Quote</button>';
    var sorted = DB.quotes.slice().sort(function (a, b) { return a.created < b.created ? 1 : -1; });
    h += sorted.length ? sorted.map(function (q) {
      return '<div class="card" onclick="MF.editQuote(\'' + q.id + '\')">' +
        '<div class="row"><h3>' + esc(q.title || 'Quote') + '</h3>' +
        '<span class="pill ' + q.status + '">' + q.status + '</span></div>' +
        '<div class="muted">' + esc(custName(q.customerId)) + ' · ' + fmtDate(q.created) + '</div>' +
        '<div class="money">' + money(quoteTotal(q)) + '</div></div>';
    }).join('') : '<div class="card muted">No quotes yet.</div>';
    screen.innerHTML = h;
  }

  /* ---------- CUSTOMERS ---------- */
  function renderCustomers() {
    var h = '<button class="btn" onclick="MF.newCustomer()">+ New Customer</button>';
    var sorted = DB.customers.slice().sort(function (a, b) {
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    h += sorted.length ? sorted.map(function (c) {
      var jobs = DB.jobs.filter(function (j) { return j.customerId === c.id; }).length;
      return '<div class="card" onclick="MF.editCustomer(\'' + c.id + '\')">' +
        '<h3>' + esc(c.name) + '</h3>' +
        (c.phone ? '<div><a class="tel" href="tel:' + esc(c.phone.replace(/[^+\d]/g, '')) +
          '" onclick="event.stopPropagation()">' + esc(c.phone) + '</a></div>' : '') +
        (c.address ? '<div class="muted">' + esc(c.address) + '</div>' : '') +
        '<div class="muted">' + jobs + ' job' + (jobs === 1 ? '' : 's') + '</div></div>';
    }).join('') : '<div class="card muted">No customers yet.</div>';
    screen.innerHTML = h;
  }

  /* ---------- forms ---------- */
  function field(label, inner) { return '<label>' + label + '</label>' + inner; }
  function inp(id, val, ph, type) {
    return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') +
      '" placeholder="' + esc(ph || '') + '">'; }
  function customerSelect(id, val) {
    var h = '<select id="' + id + '"><option value="">— pick —</option>';
    DB.customers.forEach(function (c) {
      h += '<option value="' + c.id + '"' + (c.id === val ? ' selected' : '') + '>' + esc(c.name) + '</option>'; });
    return h + '</select>';
  }

  function jobForm(j) {
    j = j || {};
    openSheet('<h2>' + (j.id ? 'Edit Job' : 'New Job') + '</h2>' +
      field('Title', inp('f_title', j.title, 'e.g. Ductwork repair')) +
      field('Customer', customerSelect('f_customer', j.customerId)) +
      field('Address', inp('f_address', j.address, 'Street address')) +
      field('Date', inp('f_date', j.date || todayStr(), '', 'date')) +
      field('Time', inp('f_time', j.time, 'e.g. 9:00 AM')) +
      field('Price ($)', inp('f_price', j.price, '0', 'number')) +
      field('Status', '<select id="f_status">' + ['scheduled', 'in-progress', 'done'].map(function (s) {
        return '<option' + (j.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>') +
      field('Notes', '<textarea id="f_notes">' + esc(j.notes) + '</textarea>') +
      '<div class="btn-row"><button class="btn" onclick="MF.saveJob(\'' + (j.id || '') + '\')">Save</button>' +
      (j.id ? '<button class="btn danger" onclick="MF.delJob(\'' + j.id + '\')">Delete</button>' : '') + '</div>' +
      '<button class="btn secondary" onclick="MF.close()">Cancel</button>');
  }

  function quoteForm(q) {
    q = q || { items: [{ desc: '', amount: '' }] };
    var itemsHtml = q.items.map(function (it, i) {
      return '<div class="item-row"><input data-i="' + i + '" data-k="desc" value="' + esc(it.desc) +
        '" placeholder="Description"><input data-i="' + i + '" data-k="amount" type="number" value="' +
        esc(it.amount) + '" placeholder="$"></div>'; }).join('');
    openSheet('<h2>' + (q.id ? 'Edit Quote' : 'New Quote') + '</h2>' +
      field('Title', inp('f_title', q.title, 'e.g. Ductwork quote')) +
      field('Customer', customerSelect('f_customer', q.customerId)) +
      field('Line items', '<div id="f_items">' + itemsHtml + '</div>' +
        '<button class="btn small secondary" onclick="MF.addItem()">+ Add line</button>') +
      field('Status', '<select id="f_status">' + ['draft', 'sent', 'accepted', 'declined'].map(function (s) {
        return '<option' + (q.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>') +
      '<div class="btn-row"><button class="btn" onclick="MF.saveQuote(\'' + (q.id || '') + '\')">Save</button>' +
      (q.id ? '<button class="btn danger" onclick="MF.delQuote(\'' + q.id + '\')">Delete</button>' : '') + '</div>' +
      '<button class="btn secondary" onclick="MF.close()">Cancel</button>');
  }

  function customerForm(c) {
    c = c || {};
    var jobs = c.id ? DB.jobs.filter(function (j) { return j.customerId === c.id; }) : [];
    openSheet('<h2>' + (c.id ? esc(c.name) : 'New Customer') + '</h2>' +
      field('Name', inp('f_name', c.name, 'Full name')) +
      field('Phone', inp('f_phone', c.phone, '(305) 555-0100', 'tel')) +
      field('Address', inp('f_address', c.address, 'Street address')) +
...[truncated 5810 chars]