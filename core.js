/* ============================================================
   Vishal Accounting Services – GST Data Collection : CORE
   Shared logic. Runs in the browser (demo mode) AND in the
   Google Apps Script backend (copy this file as Core.gs).
   No DOM, no async, no modules – plain ES2019.
   ============================================================ */
var Core = (function () {
  var VERSION = '1.6.0';

  /* ---------- language: client picks हिंदी or English (q.lang per request, c.lang for notifications).
     T(hi, en) returns the text for the current LANG. The office / admin side always stays Hindi. ---------- */
  var LANG = 'hi';
  function setLang(l) { LANG = l === 'en' ? 'en' : 'hi'; return LANG; }
  function T(hi, en) { return LANG === 'en' && en != null ? en : hi; }
  // run fn with the client's own language (notifications, reminders), then restore
  function asClient(c, fn) { var was = LANG; setLang(c && c.lang); try { return fn(); } finally { LANG = was; } }

  /* ---------- Platforms and the reports each one must send ----------
     perMonth:true  -> one report per month (quarterly client = 3 slots)
     optional:true  -> not counted in "बाकी" (missing)
     multi:true     -> many files expected (bills)                     */
  var PLATFORMS = {
    meesho: {
      label: 'Meesho', group: 'online', color: '#c2187a',
      reports: [
        { key: 'tcs_sales', name: 'TCS Sales Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip', detect: 'MEESHO_SALE',
          hint: 'Meesho Supplier Panel → GST Report डाउनलोड करें (महीना चुनें). पूरी ZIP (gst_…zip) डाल दें – tcs_sales और tcs_sales_return दोनों अपने आप सही खाने में चली जाएँगी.',
          hintEn: 'Meesho Supplier Panel → download the GST Report (choose the month). Upload the whole ZIP (gst_…zip) – tcs_sales and tcs_sales_return go to the right boxes by themselves.' },
        { key: 'tcs_return', name: 'TCS Sales Return Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip', detect: 'MEESHO_RET',
          hint: 'उसी GST Report ZIP की tcs_sales_return फाइल.', hintEn: 'The tcs_sales_return file from the same GST Report ZIP.' },
        { key: 'tax_invoice', name: 'Tax Invoice Details', perMonth: true, accept: '.xlsx,.xls,.csv,.zip', detect: 'MEESHO_INV',
          hint: 'Meesho → Tax Invoice डाउनलोड करें (…_TAX_INVOICE.zip). पूरी ZIP या उसमें की Tax_invoice_details.xlsx डालें.',
          hintEn: 'Meesho → download Tax Invoice (…_TAX_INVOICE.zip). Upload the whole ZIP or the Tax_invoice_details.xlsx inside it.' }
      ]
    },
    amazon: {
      label: 'Amazon', group: 'online', color: '#e88a00',
      reports: [
        { key: 'mtr_b2c', name: 'MTR B2C Report', perMonth: true, accept: '.csv,.xlsx,.xls,.zip', detect: 'AMZ_B2C',
          hint: 'Seller Central → Reports → Tax Document Library → GST MTR (B2C), महीना चुनें. CSV या ZIP दोनों चलेंगी.',
          hintEn: 'Seller Central → Reports → Tax Document Library → GST MTR (B2C), choose the month. CSV or ZIP both work.' },
        { key: 'mtr_b2b', name: 'MTR B2B Report', perMonth: true, accept: '.csv,.xlsx,.xls,.zip', detect: 'AMZ_B2B',
          hint: 'उसी जगह से GST MTR (B2B). B2B सेल नहीं है तो भी खाली रिपोर्ट डाल दें.',
          hintEn: 'GST MTR (B2B) from the same place. Upload it even if it is empty (no B2B sales).' },
        { key: 'gstr1', name: 'GST Report (GSTR-1)', perMonth: true, accept: '.xlsx,.xls,.zip', detect: 'AMZ_GSTR1',
          hint: 'Seller Central → Reports → Tax Document Library → GST Report (Ready to file GSTR-1). फाइल का नाम GSTR1-महीना-… होता है.',
          hintEn: 'Seller Central → Reports → Tax Document Library → GST Report (Ready to file GSTR-1). The file name looks like GSTR1-MONTH-….' }
      ]
    },
    flipkart: {
      label: 'Flipkart', group: 'online', color: '#2874f0',
      reports: [
        { key: 'sales', name: 'Sales Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip', detect: 'FK_SALES',
          hint: 'Seller Hub → Reports → Tax Reports → Sales Report, महीना चुनें.', hintEn: 'Seller Hub → Reports → Tax Reports → Sales Report, choose the month.' },
        { key: 'gst', name: 'GSTR Return Report', perMonth: true, accept: '.xlsx,.xls,.zip', detect: 'FK_GST',
          hint: 'Seller Hub → Reports → Tax Reports → GST Report (GSTR-1 & GSTR-8 वाली), महीना चुनें.',
          hintEn: 'Seller Hub → Reports → Tax Reports → GST Report (the GSTR-1 & GSTR-8 one), choose the month.' }
      ]
    },
    vyapar: {
      label: 'Vyapar', group: 'offline', color: '#e53935',
      reports: [
        { key: 'gstr1', name: 'GSTR-1 Report (Excel)', perMonth: false, accept: '.xlsx,.xls,.csv,.pdf,.json',
          hint: 'Vyapar → Reports → GSTR-1 → पूरी अवधि चुनकर Excel में Export करें.', hintEn: 'Vyapar → Reports → GSTR-1 → choose the full period and Export to Excel.' }
      ]
    },
    tool: {
      label: 'हमारा GST Billing टूल', labelEn: 'Our GST Billing tool', group: 'offline', color: '#00897b',
      reports: [
        { key: 'export', name: 'GST Excel / JSON / XML', perMonth: false, accept: '.xlsx,.xls,.csv,.json,.xml,.zip',
          hint: 'GST Billing → GSTR-1 पेज → Excel या JSON डाउनलोड करके यहाँ डालें.', hintEn: 'GST Billing → GSTR-1 page → download Excel or JSON and upload it here.' }
      ]
    },
    pdf: {
      label: 'ऑफलाइन बिल (PDF)', labelEn: 'Offline bills (PDF)', group: 'offline', color: '#5d4037',
      reports: [
        { key: 'bills', name: 'सारे बिल – PDF / फोटो', nameEn: 'All bills – PDF / photo', perMonth: false, multi: true, accept: '.pdf,.jpg,.jpeg,.png,.zip',
          hint: 'इस अवधि के सारे सेल बिल. एक PDF में या अलग-अलग – जितने हों सब डालें.', hintEn: 'All sale bills of this period – in one PDF or separate files. Upload all of them.' }
      ]
    },
    other: {
      label: 'अन्य फाइलें', labelEn: 'Other files', group: 'offline', color: '#6b7280',
      reports: [
        { key: 'files', name: 'कोई और डेटा (Excel / PDF / फोटो)', nameEn: 'Any other data (Excel / PDF / photo)', perMonth: false, multi: true, optional: true, accept: '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.json,.zip',
          hint: 'जो ऊपर किसी खाने में नहीं आता – जैसे दूसरी वेबसाइट की रिपोर्ट, खरीद बिल, या ऑफिस ने जो माँगा हो.',
          hintEn: 'Anything that does not fit a box above – e.g. another website\'s report, purchase bills, or what the office asked for.' }
      ]
    }
  };
  var PLATFORM_ORDER = ['meesho', 'amazon', 'flipkart', 'vyapar', 'tool', 'pdf', 'other'];

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var STATES = { '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh' };

  /* ---------- small helpers ---------- */
  function fail(msg) { var e = new Error(msg); e.user = true; throw e; }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
  function num(v) { var n = Math.round(Number(v) * 100) / 100; return isFinite(n) ? n : 0; }
  function ist(now) { var d = new Date(now.getTime() + 19800000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), iso: d.toISOString().slice(0, 10) }; }

  /* ---------- GSTIN ---------- */
  var GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function gstinValid(g) {
    g = String(g || '').toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    var sum = 0;
    for (var i = 0; i < 14; i++) {
      var p = GST_CHARS.indexOf(g[i]) * (i % 2 ? 2 : 1);
      sum += Math.floor(p / 36) + (p % 36);
    }
    return GST_CHARS[(36 - (sum % 36)) % 36] === g[14];
  }
  function gstinInfo(g) { g = String(g || '').toUpperCase(); return { state: STATES[g.slice(0, 2)] || '', pan: g.slice(2, 12) }; }

  /* ---------- periods ----------
     Monthly id  : '2026-09'
     Quarterly id: '2026-Q2'  (FY 2026-27, Q2 = Jul–Sep; Q4 = Jan–Mar of next year) */
  function monthId(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }
  function addMonth(id, k) { var y = +id.slice(0, 4), m = +id.slice(5, 7) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return monthId(y, m + 1); }
  function quarterOf(mid) { var y = +mid.slice(0, 4), m = +mid.slice(5, 7); return (m >= 4 ? y : y - 1) + '-Q' + (m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4); }
  function isPid(p) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(p) || /^\d{4}-Q[1-4]$/.test(p); }
  function monthsOf(pid) {
    if (pid.indexOf('Q') < 0) return [pid];
    var fy = +pid.slice(0, 4), q = +pid.slice(-1);
    var s = q < 4 ? monthId(fy, 4 + (q - 1) * 3) : monthId(fy + 1, 1);
    return [s, addMonth(s, 1), addMonth(s, 2)];
  }
  function monthLabel(mid) { return MON[+mid.slice(5, 7) - 1] + ' ' + mid.slice(0, 4); }
  function periodLabel(pid) {
    var ms = monthsOf(pid);
    if (ms.length === 1) return monthLabel(ms[0]);
    return MON[+ms[0].slice(5, 7) - 1] + '–' + MON[+ms[2].slice(5, 7) - 1] + ' ' + ms[2].slice(0, 4);
  }
  // same names as GST REPORT TOOL Get-Period: FY '2026-27', label 'SEP 2026' / 'JUL-AUG-SEP 2026'
  function fyOf(mid) { var y = +mid.slice(0, 4), m = +mid.slice(5, 7), s = m >= 4 ? y : y - 1; return s + '-' + String((s + 1) % 100).padStart(2, '0'); }
  function periodDirs(pid) {
    var ms = monthsOf(pid), last = ms[ms.length - 1];
    return { fy: fyOf(last), label: ms.map(function (m) { return MON[+m.slice(5, 7) - 1].toUpperCase(); }).join('-') + ' ' + last.slice(0, 4) };
  }
  function pidFor(freq, mid) { return freq === 'Q' ? quarterOf(mid) : mid; }
  function lastMonth(now) { var t = ist(now); return addMonth(monthId(t.y, t.m), -1); }
  // The period clients should be sending now (last finished month / last finished quarter)
  function currentPid(freq, now) {
    var lm = lastMonth(now);
    if (freq !== 'Q') return lm;
    var q = quarterOf(lm);
    return monthsOf(q)[2] === lm ? q : quarterOf(addMonth(monthsOf(q)[0], -1));
  }
  // Data reminders only run in the month right after the period ends
  function isCollectionMonth(freq, pid, now) { var ms = monthsOf(pid); return ms[ms.length - 1] === lastMonth(now); }
  function periodChoices(freq, now, n) {
    var t = ist(now), cur = monthId(t.y, t.m), out = [], seen = {};
    var running = pidFor(freq, cur);
    out.push(running); seen[running] = 1;
    var m = cur;
    while (out.length < (n || 8)) {
      m = addMonth(m, -1);
      var p = pidFor(freq, m);
      if (!seen[p]) { seen[p] = 1; out.push(p); }
    }
    return out;
  }

  /* ---------- slots (what must be uploaded) ---------- */
  function slotsFor(client, pid) {
    var out = [], months = monthsOf(pid);
    PLATFORM_ORDER.forEach(function (pk) {
      if ((client.platforms || []).indexOf(pk) < 0) return;
      var P = PLATFORMS[pk];
      P.reports.forEach(function (r) {
        var list = r.perMonth ? months : [null];
        list.forEach(function (mid) {
          out.push({
            id: pk + '.' + r.key + (mid ? '.' + mid : ''), plat: pk, key: r.key, month: mid,
            name: T(r.name, r.nameEn) + (mid && months.length > 1 ? ' (' + monthLabel(mid).slice(0, 3) + ')' : ''),
            optional: !!r.optional, multi: !!r.multi, accept: r.accept, hint: T(r.hint, r.hintEn), detect: r.detect || ''
          });
        });
      });
    });
    return out;
  }
  function emptyRec() { return { nil: false, files: [], submittedAt: '', work: '', filed: {}, fee: null, payments: [], payClaim: null }; }
  function getRec(db, gstin, pid, create) {
    var all = db.periods[gstin] || (create ? (db.periods[gstin] = {}) : null);
    if (!all) return emptyRec();
    if (!all[pid]) { if (!create) return emptyRec(); all[pid] = emptyRec(); }
    return all[pid];
  }
  function paidOf(rec) { return (rec.payments || []).reduce(function (s, p) { return s + num(p.amt); }, 0); }
  function summary(client, pid, rec) {
    var slots = slotsFor(client, pid), have = {};
    (rec.files || []).forEach(function (f) { (f.covers || [f.slot]).forEach(function (s) { have[s] = (have[s] || 0) + 1; }); });
    var req = slots.filter(function (s) { return !s.optional; });
    var missing = req.filter(function (s) { return !have[s.id]; });
    var files = (rec.files || []).length;
    var data = rec.nil ? 'NIL'
      : rec.submittedAt ? 'SUBMITTED'
      : (req.length && !missing.length) ? 'COMPLETE'
      : files ? 'PARTIAL' : 'NONE';
    var fee = rec.fee == null ? null : num(rec.fee), paid = paidOf(rec);
    var last = (rec.files || []).reduce(function (m, f) { return f.at > m ? f.at : m; }, '');
    // turnover: office figure (entered at filing) wins; else the sum the app read from the marketplace reports
    var auto = null;
    (rec.files || []).forEach(function (f) { if (f.taxable != null) auto = num((auto || 0) + f.taxable); });
    return {
      pid: pid, label: periodLabel(pid), data: data, required: req.length, done: req.length - missing.length,
      missing: missing.map(function (s) { return { id: s.id, plat: s.plat, name: s.name }; }),
      files: files, lastUpload: last, submittedAt: rec.submittedAt || '',
      work: rec.work || '', filed: rec.filed || {}, fee: fee, paid: paid,
      due: fee == null ? 0 : Math.max(0, num(fee - paid)), payClaim: rec.payClaim || null,
      autoTurnover: auto, turnover: rec.nil ? 0 : rec.turnover != null ? rec.turnover : auto,
      returns: (rec.returns || []).map(function (r) { return { id: r.id, kind: r.kind, name: r.name, size: r.size, at: r.at }; })
    };
  }
  function missingText(sm) {
    var by = {};
    sm.missing.forEach(function (m) { (by[m.plat] = by[m.plat] || []).push(m.name); });
    return Object.keys(by).map(function (k) { return platLabel(k) + ': ' + by[k].join(', '); }).join(' | ');
  }
  function platLabel(k) { var P = PLATFORMS[k]; return P ? T(P.label, P.labelEn) : k; }

  /* ---------- SHA-256 (pure JS, sync – same result in browser and Apps Script) ---------- */
  function sha256(input) {
    var ascii = unescape(encodeURIComponent(String(input)));
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = 4294967296, i, j, result = '', words = [], bitLen = ascii.length * 8;
    var hash = [], k = [], pc = 0, comp = {};
    for (var cand = 2; pc < 64; cand++) {
      if (!comp[cand]) {
        for (i = 0; i < 313; i += cand) comp[i] = cand;
        hash[pc] = (Math.pow(cand, 0.5) * maxWord) | 0;
        k[pc++] = (Math.pow(cand, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), old = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? '0' : '') + b.toString(16); }
    return result;
  }
  function pinHash(pin, salt) { return sha256('VAS|' + salt + '|' + pin); }

  /* ---------- database ---------- */
  function newDb() {
    return {
      v: 1, clients: {}, periods: {}, adminInbox: [], meta: {},
      settings: { remindDays: [1, 5, 8], payEveryDays: 3, defaultFee: 0, upi: '', payeeName: 'Vishal Accounting Services', phone: '9359076851', firm: 'Vishal Accounting Services' }
    };
  }
  /* Office naming rule = how the office saves the phone contact:
     contact person (who talks to us) → GST holder (legal name as per PAN) → firm (trade name).
     e.g. husband talks for wife's GST: "Ramesh Kumar Sunita Devi Shree Traders". Repeats are dropped. */
  function fullName(c) {
    var parts = [c.owner, c.legal, c.trade].map(function (s) { return str(s, 100).replace(/\s+/g, ' '); }), out = [], seen = {};
    parts.forEach(function (s, i) {
      var k = s.toUpperCase();
      // "Amit" + "Amit Patil" → just "Amit Patil"
      var inNext = parts.some(function (o, j) { return j > i && o.toUpperCase().indexOf(k + ' ') === 0; });
      if (s && !seen[k] && !inNext) { seen[k] = 1; out.push(s); }
    });
    return out.join(' ') || c.gstin;
  }
  function publicClient(c) {
    return { gstin: c.gstin, trade: c.trade, legal: c.legal, owner: c.owner, mobile: c.mobile, email: c.email, freq: c.freq,
      platforms: c.platforms, status: c.status, verified: !!c.verified, createdAt: c.createdAt, defaultFee: c.defaultFee,
      notes: c.notes || '', push: (c.pushTokens || []).length, state: gstinInfo(c.gstin).state, pan: gstinInfo(c.gstin).pan, fullName: fullName(c) };
  }
  // dashboard view: also the PIN (kept so the office can tell a client who forgot it; set on register/login/PIN change)
  function adminClient(c, db, ctx) {
    var o = publicClient(c); o.pin = c.pin || ''; o.pinReqAt = c.pinReqAt || ''; o.folder = folderName(c); o.lastLogin = c.lastLogin || '';
    o.tds = !!c.tds; o.advtax = !!c.advtax; o.annual = !!c.annual; o.refCode = refCode(c);
    if (db) {
      var rb = c.referredBy && db.clients[c.referredBy];
      o.referredBy = rb ? { gstin: rb.gstin, name: fullName(rb) } : null;
      o.referrals = referralsOf(db, c).map(function (x) { return { gstin: x.gstin, name: fullName(x), at: x.createdAt }; });
      o.docs = (c.docs || []).map(docView); o.docReq = c.docReq || null;
      if (ctx) { var fs = +fyOf(lastMonth(ctx.now)).slice(0, 4); o.fyTurnover = fyTurnover(db, c, fs); o.prevFyTurnover = fyTurnover(db, c, fs - 1); }
    }
    return o;
  }
  // Drive folder: "<CONTACT LEGAL TRADE> <GSTIN>", fixed at registration (c.folder); renamed on the server when the office edits the names
  function newFolderName(c) { return (fullName(c) + ' ' + c.gstin).replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 140); }
  function folderName(c) { return c.folder || ((str(c.trade, 60) || c.gstin).replace(/[\\\/:*?"<>|]/g, ' ') + ' ' + c.gstin); }
  function notifyClient(db, ctx, c, title, body) {
    c.inbox = c.inbox || [];
    c.inbox.unshift({ id: ctx.uuid(), at: ctx.now.toISOString(), title: title, body: body, read: false });
    c.inbox = c.inbox.slice(0, 40);
    if ((c.pushTokens || []).length) ctx.push(c.pushTokens, title, body, c.gstin);
  }
  function notifyAdmin(db, ctx, kind, title, body, gstin) {
    db.adminInbox.unshift({ id: ctx.uuid(), at: ctx.now.toISOString(), kind: kind, title: title, body: body, gstin: gstin || '', read: false });
    db.adminInbox = db.adminInbox.slice(0, 300);
    ctx.notifyAdmin(kind, title, body);
  }
  function displayName(c) { return fullName(c); }

  /* ---------- message texts ---------- */
  function dataReminder(c, sm, settings) {
    var who = c.owner || displayName(c);
    var body = sm.files
      ? T('नमस्ते ' + who + ', ' + sm.label + ' के GST रिटर्न के लिए ' + sm.missing.length + ' रिपोर्ट अभी बाकी हैं – ' + missingText(sm) + '. सब डालकर "डेटा भेज दिया" दबाएँ.',
        'Hello ' + who + ', ' + sm.missing.length + ' report(s) are still pending for your ' + sm.label + ' GST return – ' + missingText(sm) + '. Upload them all and tap "Data sent".')
      : T('नमस्ते ' + who + ', ' + sm.label + ' का GST डेटा (Meesho / Amazon / Flipkart रिपोर्ट या बिल) ऐप में अपलोड करें. इस अवधि में कोई सेल नहीं थी तो "NIL" चुनें.',
        'Hello ' + who + ', please upload your ' + sm.label + ' GST data (Meesho / Amazon / Flipkart reports or bills) in the app. If there were no sales in this period, choose "NIL".');
    return { title: T(sm.label + ' का GST डेटा भेजें', 'Send your ' + sm.label + ' GST data'), body: body };
  }
  function payReminder(c, sm) {
    return { title: T('फीस बाकी: ₹', 'Fee due: ₹') + sm.due, body: T(sm.label + ' का GST रिटर्न फाइल हो चुका है. कृपया ₹' + sm.due + ' का भुगतान करें. भुगतान कर दिया हो तो ऐप में "मैंने पेमेंट कर दिया" दबाएँ.',
      'Your ' + sm.label + ' GST return has been filed. Please pay ₹' + sm.due + '. If you have already paid, tap "I have paid" in the app.') };
  }

  /* ---------- auth ---------- */
  function byToken(db, token) {
    token = str(token, 80);
    if (!token) fail(T('लॉगिन करें', 'Please log in'));
    for (var g in db.clients) { if ((db.clients[g].tokens || []).indexOf(token) >= 0) return db.clients[g]; }
    fail('SESSION_EXPIRED');
  }
  function newSession(c, ctx) {
    var t = ctx.uuid().replace(/-/g, '') + ctx.uuid().replace(/-/g, '').slice(0, 8);
    c.tokens = [t].concat(c.tokens || []).slice(0, 6);
    return { gstin: c.gstin, trade: displayName(c), token: t };
  }
  function cleanPlatforms(list) { return (Array.isArray(list) ? list : []).filter(function (p) { return PLATFORMS[p]; }); }

  /* ---------- client actions ---------- */
  var A = {};
  A.register = function (db, q, ctx) {
    var g = str(q.gstin, 15).toUpperCase();
    if (!gstinValid(g)) fail(T('GSTIN सही नहीं है – दोबारा जाँचें', 'This GSTIN is not valid – please check it'));
    if (db.clients[g]) fail(T('यह GSTIN पहले से रजिस्टर है – लॉगिन करें', 'This GSTIN is already registered – please log in'));
    var mobile = str(q.mobile, 10);
    if (!/^[6-9]\d{9}$/.test(mobile)) fail(T('10 अंकों का मोबाइल नंबर डालें', 'Enter a 10-digit mobile number'));
    var pin = str(q.pin, 6);
    if (!/^\d{4,6}$/.test(pin)) fail(T('PIN 4 से 6 अंकों का रखें', 'PIN must be 4 to 6 digits'));
    var trade = str(q.trade, 100);
    if (!trade) fail(T('फर्म / ट्रेड नाम डालें', 'Enter the firm / trade name'));
    if (!str(q.legal, 100)) fail(T('GST में जिसका नाम है (लीगल नाम) वो डालें', 'Enter the GST holder\'s (legal) name'));
    if (!str(q.owner, 80)) fail(T('आपका नाम डालें (जो ऑफिस से बात करेंगे)', 'Enter your name (the person who talks to the office)'));
    var salt = ctx.uuid().slice(0, 8);
    var c = {
      gstin: g, trade: trade, legal: str(q.legal, 100), owner: str(q.owner, 80), mobile: mobile, email: str(q.email, 100),
      freq: q.freq === 'Q' ? 'Q' : 'M', platforms: cleanPlatforms(q.platforms), status: 'ACTIVE', verified: false,
      salt: salt, pinHash: pinHash(pin, salt), pin: pin, tokens: [], pushTokens: [], inbox: [], defaultFee: null, notes: '',
      createdAt: ctx.now.toISOString(), lang: LANG
    };
    c.folder = newFolderName(c);
    var ref = byRef(db, q.ref);
    if (ref) c.referredBy = ref.gstin;
    db.clients[g] = c;
    if (ref) {
      asClient(ref, function () { notifyClient(db, ctx, ref, T('🎉 आपके रेफरल से नया क्लाइंट जुड़ा', '🎉 A new client joined through your referral'), fullName(c) + T(' आपके लिंक से जुड़े. धन्यवाद! ', ' joined through your link. Thank you! ') + (db.settings.refReward || '')); });
      notifyAdmin(db, ctx, 'REF', 'रेफरल: ' + fullName(c) + ' ← ' + fullName(ref), 'नया क्लाइंट ' + fullName(ref) + ' के रेफरल से आया', g);
    }
    notifyClient(db, ctx, c, T('स्वागत है 🙏', 'Welcome 🙏'), T(db.settings.firm + ' के ऐप में आपका स्वागत है. हर महीने/तिमाही डेटा भेजने का रिमाइंडर यहीं आएगा.', 'Welcome to the ' + db.settings.firm + ' app. Your monthly/quarterly data reminders will come here.'));
    notifyAdmin(db, ctx, 'REG', 'नया क्लाइंट: ' + fullName(c), g + ' • ' + mobile + ' • ' + (c.freq === 'Q' ? 'Quarterly' : 'Monthly') + ' • ' + (c.platforms.map(function (p) { return PLATFORMS[p].label; }).join(', ') || 'कोई प्लेटफॉर्म नहीं') + (c.lang === 'en' ? ' • English' : ''), g);
    return { sessions: [newSession(c, ctx)] };
  };
  A.login = function (db, q, ctx) {
    var id = str(q.id, 15).toUpperCase(), pin = str(q.pin, 6), out = [];
    Object.keys(db.clients).forEach(function (g) {
      var c = db.clients[g];
      if ((c.gstin === id || c.mobile === id) && c.pinHash === pinHash(pin, c.salt) && c.status !== 'BLOCKED') { c.pin = pin; c.pinReqAt = ''; c.lastLogin = ctx.now.toISOString(); if (q.lang) c.lang = LANG; out.push(newSession(c, ctx)); }
    });
    if (!out.length) fail(T('GSTIN / मोबाइल या PIN गलत है', 'Wrong GSTIN / mobile or PIN'));
    return { sessions: out };
  };
  // "PIN भूल गए?" – tells the office (dashboard + email). Max once per 10 minutes per client.
  A.forgotPin = function (db, q, ctx) {
    var id = str(q.id, 15).toUpperCase(), list = [];
    Object.keys(db.clients).forEach(function (g) { var c = db.clients[g]; if (c.gstin === id || c.mobile === id) list.push(c); });
    if (!list.length) fail(T('ये GSTIN / मोबाइल रजिस्टर नहीं है – पहले "नया रजिस्ट्रेशन" करें', 'This GSTIN / mobile is not registered – please use "New registration" first'));
    list.forEach(function (c) {
      if (c.pinReqAt && ctx.now - new Date(c.pinReqAt) < 600000) return;
      c.pinReqAt = ctx.now.toISOString();
      notifyAdmin(db, ctx, 'PIN', displayName(c) + ' PIN भूल गए', c.gstin + ' • ' + c.mobile + ' – डैशबोर्ड में क्लाइंट खोलकर PIN WhatsApp करें', c.gstin);
    });
    return { phone: db.settings.phone };
  };
  A.logout = function (db, q) { var c = byToken(db, q.token); c.tokens = c.tokens.filter(function (t) { return t !== q.token; }); return {}; };
  A.state = function (db, q, ctx) {
    var c = byToken(db, q.token);
    var choices = periodChoices(c.freq, ctx.now, 8);
    var cur = currentPid(c.freq, ctx.now);
    var pid = isPid(q.pid || '') ? q.pid : cur;
    var all = db.periods[c.gstin] || {};
    var rec = getRec(db, c.gstin, pid, false);
    var dues = Object.keys(all).map(function (p) { return summary(c, p, all[p]); }).filter(function (s) { return s.due > 0; });
    return {
      client: publicClient(c), pid: pid, current: cur,
      periods: choices.map(function (p) { var s = summary(c, p, all[p] || emptyRec()); return { pid: p, label: s.label, data: s.data, work: s.work, done: s.done, required: s.required, running: p === choices[0] && p !== cur }; }),
      summary: summary(c, pid, rec), slots: slotsFor(c, pid),
      files: (rec.files || []).map(function (f) { return { id: f.id, slot: f.slot, covers: f.covers, name: f.name, size: f.size, at: f.at }; }),
      inbox: (c.inbox || []).slice(0, 30), unread: (c.inbox || []).filter(function (n) { return !n.read; }).length,
      dues: dues, settings: { upi: db.settings.upi, payeeName: db.settings.payeeName, phone: db.settings.phone, firm: db.settings.firm },
      due: duesFor(db, c, ctx.now, 5, 60).slice(0, 8),
      docs: (c.docs || []).map(function (d) { var v = docView(d); delete v.url; delete v.fileId; return v; }), docReq: c.docReq || null, docTypes: docTypes(),
      refCode: refCode(c), referrals: referralsOf(db, c).length, refReward: db.settings.refReward || '',
      fyTurnover: fyTurnover(db, c, +fyOf(lastMonth(ctx.now)).slice(0, 4)),
      // English fields are optional: an item without them shows its Hindi text in both languages
      content: contentFor(db).map(function (x) { return { id: x.id, kind: x.kind, icon: x.icon, title: T(x.title, x.titleEn || null), body: T(x.body, x.bodyEn || null), img: x.img, price: T(x.price, x.priceEn || null), partner: x.partner, cta: T(x.cta, x.ctaEn || null), link: x.link, pinned: x.pinned, at: x.at }; })
    };
  };
  function editableRec(db, c, pid) {
    if (!isPid(pid)) fail(T('अवधि सही नहीं', 'Wrong period'));
    var rec = getRec(db, c.gstin, pid, true);
    if (rec.work === 'FILED') fail(T('इस अवधि का रिटर्न फाइल हो चुका है – बदलाव के लिए ऑफिस से बात करें', 'The return for this period is already filed – talk to the office for any change'));
    return rec;
  }
  function checkComplete(db, ctx, c, pid, rec) {
    var sm = summary(c, pid, rec);
    if (sm.data === 'COMPLETE' && !rec.completeNotified) {
      rec.completeNotified = ctx.now.toISOString();
      notifyAdmin(db, ctx, 'COMPLETE', displayName(c) + ' – ' + sm.label + ' का डेटा पूरा', 'सारी ' + sm.required + ' रिपोर्ट अपलोड हो गईं. फाइलिंग शुरू कर सकते हैं.', c.gstin);
    }
  }
  A.upload = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = editableRec(db, c, pid);
    var slot = slotsFor(c, pid).filter(function (s) { return s.id === q.slot; })[0];
    if (!slot) fail(T('यह रिपोर्ट आपकी प्रोफाइल में नहीं है', 'This report is not in your profile'));
    var name = str(q.name, 150).replace(/[\\\/:*?"<>|]/g, '_') || 'file';
    if (!q.b64) fail(T('फाइल खाली है', 'The file is empty'));
    var size = Math.round(String(q.b64).length * 0.75);
    if (size > 30 * 1048576) fail(T('फाइल 30 MB से बड़ी है', 'The file is larger than 30 MB'));
    if (rec.files.some(function (x) { return x.slot === slot.id && x.name === name && Math.abs(x.size - size) < 4; })) fail(T('ये फाइल ' + slot.name + ' में पहले से अपलोड है', 'This file is already uploaded in ' + slot.name));
    var P = PLATFORMS[slot.plat];
    // GST REPORT TOOL layout: <client>\<FY>\<PERIOD>\INPUT\  (the tool reads every report in INPUT by its columns)
    var pd = periodDirs(pid);
    var stored = ctx.saveFile({
      folders: [folderName(c), pd.fy, pd.label, 'INPUT'],
      name: (slot.month && monthsOf(pid).length > 1 ? MON[+slot.month.slice(5, 7) - 1].toUpperCase() + '_' : '') + name,
      mime: str(q.mime, 100) || 'application/octet-stream'
    }, q.b64);
    var f = { id: ctx.uuid(), slot: slot.id, name: name, size: size, mime: str(q.mime, 100), at: ctx.now.toISOString(), fileId: stored.fileId, url: stored.url || '',
      taxable: q.taxable == null || q.taxable === '' || !isFinite(Number(q.taxable)) ? null : num(q.taxable),
      type: str(q.ftype, 20), months: (Array.isArray(q.fmonths) ? q.fmonths : []).map(function (m) { return str(m, 7); }).slice(0, 12) };
    // one quarterly report (e.g. Amazon GSTR1-OCTOBER-DECEMBER) can fill the same report's slot for every month
    if (Array.isArray(q.covers)) {
      var ids = slotsFor(c, pid).map(function (s) { return s.id; });
      var cov = q.covers.filter(function (s) { return ids.indexOf(s) >= 0 && s.split('.').slice(0, 2).join('.') === slot.plat + '.' + slot.key; });
      if (cov.length > 1) f.covers = cov;
    }
    rec.files.push(f);
    rec.nil = false;
    checkComplete(db, ctx, c, pid, rec);
    return { file: { id: f.id, slot: f.slot, covers: f.covers, name: f.name, size: f.size, at: f.at } };
  };
  A.deleteFile = function (db, q, ctx) {
    var c = byToken(db, q.token), rec = editableRec(db, c, str(q.pid, 10));
    var f = rec.files.filter(function (x) { return x.id === q.id; })[0];
    if (!f) fail(T('फाइल नहीं मिली', 'File not found'));
    rec.files = rec.files.filter(function (x) { return x.id !== q.id; });
    ctx.deleteFile(f.fileId);
    if (rec.completeNotified && summary(c, q.pid, rec).data !== 'COMPLETE') rec.completeNotified = '';
    return {};
  };
  A.setNil = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = editableRec(db, c, pid);
    if (q.nil && rec.files.length) fail(T('इस अवधि में फाइलें अपलोड हैं. NIL के लिए पहले उन्हें हटाएँ.', 'Files are uploaded for this period. Remove them first to mark NIL.'));
    rec.nil = !!q.nil;
    rec.submittedAt = rec.nil ? ctx.now.toISOString() : '';
    if (rec.nil) notifyAdmin(db, ctx, 'NIL', 'NIL रिटर्न: ' + displayName(c) + ' – ' + periodLabel(pid), c.gstin + ' ने बताया कि इस अवधि में कोई सेल नहीं है. पहले फाइल करें.', c.gstin);
    return {};
  };
  A.submit = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = editableRec(db, c, pid);
    var sm = summary(c, pid, rec);
    if (!rec.files.length) fail(T('पहले रिपोर्ट अपलोड करें, या कोई सेल नहीं थी तो NIL चुनें', 'Upload your reports first, or choose NIL if there were no sales'));
    if (sm.missing.length && !q.force) return { needConfirm: true, missing: sm.missing };
    rec.submittedAt = ctx.now.toISOString();
    rec.completeNotified = rec.completeNotified || rec.submittedAt;
    notifyAdmin(db, ctx, 'SUBMIT', displayName(c) + ' ने ' + sm.label + ' का डेटा भेजा', sm.done + '/' + sm.required + ' रिपोर्ट' + (sm.missing.length ? ' • बाकी: ' + missingText(sm) : ' • सब पूरा') + ' • ' + sm.files + ' फाइलें', c.gstin);
    return {};
  };
  A.unsubmit = function (db, q, ctx) {
    var c = byToken(db, q.token), rec = editableRec(db, c, str(q.pid, 10));
    if (rec.nil) fail(T('NIL हटाने के लिए NIL वाला टिक हटाएँ', 'To remove NIL, switch off the NIL toggle'));
    rec.submittedAt = '';
    return {};
  };
  A.profile = function (db, q, ctx) {
    var c = byToken(db, q.token), changes = [];
    if (q.lang) c.lang = LANG;   // app language (notifications follow it); not an office-visible change
    if (q.platforms) { var p = cleanPlatforms(q.platforms); if (p.join() !== (c.platforms || []).join()) { c.platforms = p; changes.push('प्लेटफॉर्म: ' + p.map(function (k) { return PLATFORMS[k].label; }).join(', ')); } }
    if (q.owner != null && str(q.owner, 80) !== c.owner) { c.owner = str(q.owner, 80); changes.push('नाम: ' + c.owner); }
    if (q.email != null && str(q.email, 100) !== c.email) { c.email = str(q.email, 100); changes.push('ईमेल: ' + c.email); }
    if (q.freq && (q.freq === 'Q' ? 'Q' : 'M') !== c.freq) { c.freq = q.freq === 'Q' ? 'Q' : 'M'; changes.push('रिटर्न: ' + (c.freq === 'Q' ? 'Quarterly' : 'Monthly')); }
    if (changes.length) notifyAdmin(db, ctx, 'PROFILE', displayName(c) + ' ने प्रोफाइल बदली', changes.join(' • '), c.gstin);
    return { client: publicClient(c) };
  };
  A.changePin = function (db, q, ctx) {
    var c = byToken(db, q.token);
    if (c.pinHash !== pinHash(str(q.old, 6), c.salt)) fail(T('पुराना PIN गलत है', 'The old PIN is wrong'));
    if (!/^\d{4,6}$/.test(str(q.pin, 6))) fail(T('PIN 4 से 6 अंकों का रखें', 'PIN must be 4 to 6 digits'));
    c.pinHash = pinHash(str(q.pin, 6), c.salt); c.pin = str(q.pin, 6);
    return {};
  };
  A.pushToken = function (db, q) {
    var c = byToken(db, q.token), t = str(q.fcm, 400);
    if (t && (c.pushTokens || []).indexOf(t) < 0) c.pushTokens = [t].concat(c.pushTokens || []).slice(0, 5);
    return {};
  };
  A.readInbox = function (db, q) { var c = byToken(db, q.token); (c.inbox || []).forEach(function (n) { n.read = true; }); return {}; };
  A.claimPaid = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = getRec(db, c.gstin, pid, false);
    var sm = summary(c, pid, rec);
    if (!(sm.due > 0)) fail(T('इस अवधि की कोई फीस बाकी नहीं', 'No fee is due for this period'));
    rec.payClaim = { at: ctx.now.toISOString(), note: str(q.note, 150) };
    notifyAdmin(db, ctx, 'PAYCLAIM', displayName(c) + ' ने पेमेंट किया (जाँचें)', sm.label + ' • ₹' + sm.due + (rec.payClaim.note ? ' • ' + rec.payClaim.note : ''), c.gstin);
    return {};
  };

  /* ---------- admin actions (need adminKey) ---------- */
  function client(db, g) { var c = db.clients[str(g, 15).toUpperCase()]; if (!c) fail('क्लाइंट नहीं मिला'); return c; }
  A.aList = function (db, q, ctx) {
    var month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : lastMonth(ctx.now);
    var rows = Object.keys(db.clients).map(function (g) {
      var c = db.clients[g], pid = pidFor(c.freq, month);
      var rec = getRec(db, g, pid, false);
      var pend = 0, all = db.periods[g] || {};
      Object.keys(all).forEach(function (p) { pend += summary(c, p, all[p]).due; });
      return { client: adminClient(c, db, ctx), summary: summary(c, pid, rec), totalDue: pend };
    });
    return { month: month, label: monthLabel(month), rows: rows, unread: db.adminInbox.filter(function (n) { return !n.read; }).length };
  };
  A.aClient = function (db, q, ctx) {
    var c = client(db, q.gstin), all = db.periods[c.gstin] || {};
    var pids = Object.keys(all);
    var cur = currentPid(c.freq, ctx.now);
    if (pids.indexOf(cur) < 0) pids.push(cur);
    if (q.pid && isPid(q.pid) && pids.indexOf(q.pid) < 0) pids.push(q.pid);
    pids.sort().reverse();
    return {
      client: adminClient(c, db, ctx), dues: duesFor(db, c, ctx.now, 30, 90), docTypes: DOC_TYPES,
      periods: pids.map(function (p) {
        var rec = all[p] || emptyRec();
        return { summary: summary(c, p, rec), slots: slotsFor(c, p), files: rec.files || [], payments: rec.payments || [] };
      })
    };
  };
  A.aUpdateClient = function (db, q, ctx) {
    var c = client(db, q.gstin), f = q.fields || {};
    ['trade', 'legal', 'owner', 'email', 'notes'].forEach(function (k) { if (f[k] != null) c[k] = str(f[k], k === 'notes' ? 500 : 100); });
    if (f.mobile != null) { if (!/^[6-9]\d{9}$/.test(str(f.mobile, 10))) fail('मोबाइल नंबर सही नहीं'); c.mobile = str(f.mobile, 10); }
    if (f.freq) c.freq = f.freq === 'Q' ? 'Q' : 'M';
    if (f.platforms) c.platforms = cleanPlatforms(f.platforms);
    if (f.defaultFee !== undefined) c.defaultFee = f.defaultFee === '' || f.defaultFee == null ? null : num(f.defaultFee);
    if (f.verified != null) c.verified = !!f.verified;
    ['tds', 'advtax', 'annual'].forEach(function (k) { if (f[k] != null) c[k] = !!f[k]; });
    if (f.status) c.status = f.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE';
    if (c.status === 'BLOCKED') c.tokens = [];
    // names changed → rename the client's Drive folder to the office naming rule
    var nf = newFolderName(c), of = folderName(c);
    if (nf !== of) { if (ctx.renameFolder) ctx.renameFolder(of, nf); c.folder = nf; }
    return { client: adminClient(c, db, ctx) };
  };
  A.aResetPin = function (db, q) {
    var c = client(db, q.gstin), pin = str(q.pin, 6);
    if (!/^\d{4,6}$/.test(pin)) fail('PIN 4 से 6 अंकों का रखें');
    c.pinHash = pinHash(pin, c.salt); c.pin = pin; c.pinReqAt = ''; c.tokens = [];
    return {};
  };
  A.aSetWork = function (db, q, ctx) {
    var c = client(db, q.gstin), pid = str(q.pid, 10);
    if (!isPid(pid)) fail('अवधि सही नहीं');
    var rec = getRec(db, c.gstin, pid, true), wasFiled = rec.work === 'FILED';
    rec.filed = rec.filed || {};
    ['gstr1', 'gstr3b'].forEach(function (k) {
      if (q[k] === undefined) return;
      rec.filed[k] = q[k] && (q[k].arn || q[k].date) ? { arn: str(q[k].arn, 30), date: str(q[k].date, 10) || ist(ctx.now).iso } : null;
      if (!rec.filed[k]) delete rec.filed[k];
    });
    if (q.work !== undefined) rec.work = ['', 'PROCESS', 'FILED'].indexOf(q.work) >= 0 ? q.work : rec.work;
    if (q.turnover !== undefined) rec.turnover = q.turnover === '' || q.turnover == null ? null : num(q.turnover);
    if (rec.filed.gstr1) rec.work = 'FILED';
    var label = periodLabel(pid);
    asClient(c, function () {
      if (rec.work === 'PROCESS' && q.work === 'PROCESS' && !rec.processNotified) {
        rec.processNotified = ctx.now.toISOString();
        notifyClient(db, ctx, c, label + T(': फाइलिंग शुरू', ': filing started'), T('आपका ' + label + ' का डेटा मिल गया है, रिटर्न तैयार किया जा रहा है.', 'We have received your ' + label + ' data. Your return is being prepared.'));
      }
      if (rec.work === 'FILED' && !wasFiled) {
        if (rec.fee == null) rec.fee = c.defaultFee != null ? c.defaultFee : (num(db.settings.defaultFee) || null);
        var sm = summary(c, pid, rec), txt = (rec.nil ? 'NIL ' : '') + T('GSTR-1 फाइल हो गया ✓', 'GSTR-1 filed ✓') + (rec.filed.gstr1 && rec.filed.gstr1.arn ? ' ARN: ' + rec.filed.gstr1.arn : '');
        if (sm.due > 0) txt += T('. फीस ₹' + sm.due + ' – कृपया भुगतान करें.', '. Fee ₹' + sm.due + ' – please pay.');
        notifyClient(db, ctx, c, T(label + ' का रिटर्न फाइल हो गया', label + ' return filed'), txt);
        rec.payRemindAt = ctx.now.toISOString();
      }
      if (rec.filed.gstr3b && !rec.r3bNotified) {
        rec.r3bNotified = ctx.now.toISOString();
        notifyClient(db, ctx, c, label + T(': GSTR-3B फाइल हो गया ✓', ': GSTR-3B filed ✓'), rec.filed.gstr3b.arn ? 'ARN: ' + rec.filed.gstr3b.arn : T('GSTR-3B भी फाइल हो गया.', 'GSTR-3B is filed too.'));
      }
    });
    checkTurnover(db, ctx, c);
    return { summary: summary(c, pid, rec) };
  };
  A.aSetFee = function (db, q) {
    var c = client(db, q.gstin), pid = str(q.pid, 10);
    if (!isPid(pid)) fail('अवधि सही नहीं');
    var rec = getRec(db, c.gstin, pid, true);
    rec.fee = q.fee === '' || q.fee == null ? null : num(q.fee);
    return { summary: summary(c, pid, rec) };
  };
  A.aAddPayment = function (db, q, ctx) {
    var c = client(db, q.gstin), pid = str(q.pid, 10), rec = getRec(db, c.gstin, pid, true);
    var amt = num(q.amt);
    if (!(amt > 0)) fail('रकम डालें');
    rec.payments.push({ id: ctx.uuid(), amt: amt, mode: str(q.mode, 20) || 'UPI', note: str(q.note, 100), date: str(q.date, 10) || ist(ctx.now).iso, at: ctx.now.toISOString() });
    rec.payClaim = null;
    var sm = summary(c, pid, rec);
    asClient(c, function () { notifyClient(db, ctx, c, '₹' + amt + T(' भुगतान मिला 🙏', ' payment received 🙏'), T(sm.label + ' की फीस का ₹' + amt + ' मिल गया' + (sm.due > 0 ? '. बाकी ₹' + sm.due : '. धन्यवाद!'), 'Received ₹' + amt + ' for the ' + sm.label + ' fee' + (sm.due > 0 ? '. Balance ₹' + sm.due : '. Thank you!'))); });
    return { summary: sm };
  };
  A.aDeletePayment = function (db, q) {
    var c = client(db, q.gstin), pid = str(q.pid, 10), rec = getRec(db, c.gstin, pid, true);
    rec.payments = (rec.payments || []).filter(function (p) { return p.id !== q.id; });
    return { summary: summary(c, pid, rec) };
  };
  A.aRejectClaim = function (db, q, ctx) {
    var c = client(db, q.gstin), pid = str(q.pid, 10), rec = getRec(db, c.gstin, pid, true);
    rec.payClaim = null;
    asClient(c, function () { notifyClient(db, ctx, c, T('पेमेंट नहीं मिला', 'Payment not received'), T(periodLabel(pid) + ' की फीस का पेमेंट अभी हमें नहीं मिला है. कृपया जाँच लें.', 'We have not received the payment for the ' + periodLabel(pid) + ' fee yet. Please check.')); });
    return {};
  };
  A.aMessage = function (db, q, ctx) {
    var title = str(q.title, 80), body = str(q.body, 500);
    if (!title && !body) fail('मैसेज लिखें');
    (q.gstins || []).forEach(function (g) { notifyClient(db, ctx, client(db, g), title || db.settings.firm, body); });
    return { sent: (q.gstins || []).length };
  };
  A.aRemind = function (db, q, ctx) {
    var month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : lastMonth(ctx.now), sent = 0;
    (q.gstins || []).forEach(function (g) {
      var c = client(db, g);
      asClient(c, function () {
      if (q.kind === 'pay') {
        var all = db.periods[c.gstin] || {};
        Object.keys(all).forEach(function (p) {
          var sm = summary(c, p, all[p]);
          if (sm.due > 0) { var m = payReminder(c, sm); notifyClient(db, ctx, c, m.title, m.body); all[p].payRemindAt = ctx.now.toISOString(); sent++; }
        });
      } else {
        var pid = pidFor(c.freq, month), sm = summary(c, pid, getRec(db, c.gstin, pid, false));
        if (sm.data === 'NONE' || sm.data === 'PARTIAL') { var m2 = dataReminder(c, sm, db.settings); notifyClient(db, ctx, c, m2.title, m2.body); sent++; }
      }
      });
    });
    return { sent: sent };
  };
  A.aSettings = function (db, q) {
    var s = db.settings, f = q.set;
    if (f) {
      if (f.remindDays != null) s.remindDays = String(f.remindDays).split(/[^0-9]+/).map(Number).filter(function (d) { return d >= 1 && d <= 28; });
      if (f.payEveryDays != null) s.payEveryDays = Math.max(1, Math.round(num(f.payEveryDays)) || 3);
      ['upi', 'payeeName', 'phone', 'firm', 'refReward', 'appUrl'].forEach(function (k) { if (f[k] != null) s[k] = str(f[k], 200); });
      if (f.defaultFee != null) s.defaultFee = num(f.defaultFee);
    }
    return { settings: s };
  };
  A.aPayments = function (db) {
    var rows = [];
    Object.keys(db.periods).forEach(function (g) {
      var c = db.clients[g]; if (!c) return;
      var all = db.periods[g];
      Object.keys(all).forEach(function (p) {
        var r = all[p];
        if (r.fee == null && !(r.payments || []).length) return;
        rows.push({ client: publicClient(c), summary: summary(c, p, r), payments: r.payments || [], payRemindAt: r.payRemindAt || '' });
      });
    });
    return { rows: rows };
  };
  // office sets its own easy-to-remember admin password (stored by the host: Script Properties / demo db)
  A.aSetAdminKey = function (db, q, ctx) {
    var k = String(q.newKey == null ? '' : q.newKey);
    if (k.length < 6) fail('पासवर्ड कम से कम 6 अक्षर का रखें');
    if (k.length > 60 || /\s/.test(k)) fail('पासवर्ड में स्पेस न डालें (60 अक्षर तक)');
    ctx.setAdminKey(k);
    return {};
  };
  A.aInbox = function (db) { return { inbox: db.adminInbox.slice(0, 150) }; };
  A.aReadInbox = function (db) { db.adminInbox.forEach(function (n) { n.read = true; }); return {}; };
  A.aTick = function (db, q, ctx) { return tick(db, ctx, true); };
  A.aDeleteClient = function (db, q, ctx) {
    var c = client(db, q.gstin), all = db.periods[c.gstin] || {};
    Object.keys(all).forEach(function (p) { (all[p].files || []).forEach(function (f) { ctx.deleteFile(f.fileId); }); });
    delete db.periods[c.gstin]; delete db.clients[c.gstin];
    return {};
  };

  /* ---------- due dates ----------
     GST: monthly GSTR-1 11th / GSTR-3B 20th of next month. QRMP: GSTR-1 13th and GSTR-3B 22nd (category X states) /
     24th (others) after the quarter, PMT-06 25th for months 1-2. TDS (deductors only): deposit 7th (March: 30 Apr),
     returns 31 Jul / 31 Oct / 31 Jan / 31 May. GSTR-9 > ₹2 Cr, GSTR-9C > ₹5 Cr: 31 Dec. ITR 31 Jul. Advance tax 15 Jun/Sep/Dec/Mar.
     Government extensions: db.settings.dueExt[key] = 'YYYY-MM-DD' (set from the dashboard calendar). */
  var X_STATES = ['22', '23', '24', '25', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37'];
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { while (m > 12) { m -= 12; y++; } return y + '-' + p2(m) + '-' + p2(d); }
  function crore(n) { return '₹' + (n / 1e7).toFixed(2) + T(' करोड़', ' Cr'); }
  function rawDues(db, c, fromMid, toMid) {
    var out = [], x = c.gstin.slice(0, 2), mid = fromMid;
    function add(key, type, title, date, desc, pid) { out.push({ key: key, type: type, title: title, date: (db.settings.dueExt || {})[key] || date, desc: desc, pid: pid || '' }); }
    while (mid <= toMid) {
      var y = +mid.slice(0, 4), m = +mid.slice(5, 7), lab = monthLabel(mid);
      if (c.freq !== 'Q') {
        add('GSTR1:' + mid, 'GSTR1', 'GSTR-1 (' + lab + ')', ymd(y, m + 1, 11), T('बिक्री का रिटर्न – डेटा पहले भेजें', 'Sales return – send your data before this'), mid);
        add('GSTR3B:' + mid, 'GSTR3B', 'GSTR-3B (' + lab + ')', ymd(y, m + 1, 20), T('टैक्स भरने का रिटर्न – टैक्स बना हो तो पेमेंट तैयार रखें', 'Tax payment return – keep the payment ready if tax is due'), mid);
      } else {
        var q = quarterOf(mid), qm = monthsOf(q);
        if (qm[2] === mid) {
          add('GSTR1:' + q, 'GSTR1', 'GSTR-1 (' + periodLabel(q) + ')', ymd(y, m + 1, 13), T('तिमाही बिक्री का रिटर्न – डेटा पहले भेजें', 'Quarterly sales return – send your data before this'), q);
          add('GSTR3B:' + q + ':' + (X_STATES.indexOf(x) >= 0 ? 'X' : 'Y'), 'GSTR3B', 'GSTR-3B (' + periodLabel(q) + ')', ymd(y, m + 1, X_STATES.indexOf(x) >= 0 ? 22 : 24), T('तिमाही टैक्स रिटर्न', 'Quarterly tax return'), q);
        } else add('PMT06:' + mid, 'PMT06', T('PMT-06 टैक्स जमा (', 'PMT-06 tax payment (') + lab + ')', ymd(y, m + 1, 25), T('QRMP – इस महीने का टैक्स 25 तारीख तक जमा करें (टैक्स बना हो तो)', 'QRMP – pay this month\'s tax by the 25th (if any tax is due)'), '');
      }
      if (c.tds) add('TDSPAY:' + mid, 'TDS', T('TDS जमा (', 'TDS payment (') + lab + ')', m === 3 ? ymd(y, 4, 30) : ymd(y, m + 1, 7), T('काटा हुआ TDS सरकार को जमा करें', 'Deposit the TDS you deducted with the government'), '');
      if (c.tds && [6, 9, 12, 3].indexOf(m) >= 0) add('TDSRET:' + mid, 'TDS', T('TDS रिटर्न (24Q/26Q) – तिमाही ', 'TDS return (24Q/26Q) – quarter ') + lab, m === 12 ? ymd(y + 1, 1, 31) : m === 3 ? ymd(y, 5, 31) : ymd(y, m + 1, 31), T('तिमाही TDS रिटर्न', 'Quarterly TDS return'), '');
      if (c.advtax && [6, 9, 12, 3].indexOf(m) >= 0) add('ADV:' + mid, 'ADV', T('एडवांस टैक्स किस्त (', 'Advance tax instalment (') + lab + ')', ymd(y, m, 15), T('इनकम टैक्स की एडवांस किस्त', 'Income tax advance instalment'), '');
      if (m === 7) add('ITR:' + y, 'ITR', 'ITR – FY ' + (y - 1) + '-' + p2(y % 100), ymd(y, 7, 31), T('इनकम टैक्स रिटर्न (बिना ऑडिट वाले) – डॉक्यूमेंट तिजोरी में बैंक स्टेटमेंट डालें', 'Income tax return (non-audit) – put your bank statement in the document vault'), '');
      if (m === 12) {
        var fy = fyTurnover(db, c, y - 1);
        if (fy.total >= 2e7 || c.annual) add('GSTR9:' + (y - 1), 'GSTR9', T('GSTR-9 सालाना रिटर्न – FY ', 'GSTR-9 annual return – FY ') + fy.fy, ymd(y, 12, 31), T('टर्नओवर ₹2 करोड़ से ऊपर – सालाना रिटर्न ज़रूरी', 'Turnover above ₹2 Cr – annual return required'), '');
        if (fy.total >= 5e7) add('GSTR9C:' + (y - 1), 'GSTR9', 'GSTR-9C – FY ' + fy.fy, ymd(y, 12, 31), T('टर्नओवर ₹5 करोड़ से ऊपर – reconciliation statement ज़रूरी', 'Turnover above ₹5 Cr – reconciliation statement required'), '');
      }
      mid = addMonth(mid, 1);
    }
    return out;
  }
  function dueDone(db, c, d) {
    if ((c.dueDone || {})[d.key]) return true;
    if (!d.pid) return false;
    var rec = getRec(db, c.gstin, d.pid, false);
    return d.type === 'GSTR1' ? rec.work === 'FILED' : d.type === 'GSTR3B' ? !!(rec.filed && rec.filed.gstr3b) : false;
  }
  function duesFor(db, c, now, back, ahead) {
    var t = ist(now), today = t.iso, from = ymd(t.y, t.m, t.d), cur = monthId(t.y, t.m);
    var lo = new Date(Date.parse(today) - back * 86400000).toISOString().slice(0, 10), hi = new Date(Date.parse(today) + ahead * 86400000).toISOString().slice(0, 10);
    return rawDues(db, c, addMonth(cur, -3), addMonth(cur, 2)).filter(function (d) { return d.date >= lo && d.date <= hi; })
      .map(function (d) { d.done = dueDone(db, c, d); d.days = Math.round((Date.parse(d.date) - Date.parse(from)) / 86400000); return d; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  /* ---------- turnover (GSTR-9 / 9C / e-invoice / QRMP limits) ---------- */
  function fyTurnover(db, c, fyStart) {
    var all = db.periods[c.gstin] || {}, total = 0, months = 0;
    Object.keys(all).forEach(function (p) {
      var ms = monthsOf(p), mStart = +ms[0].slice(0, 4) * 12 + +ms[0].slice(5, 7), lo = fyStart * 12 + 4, hi = fyStart * 12 + 15;
      if (mStart < lo || mStart > hi) return;
      var t = summary(c, p, all[p]).turnover;
      if (t != null) { total += t; months += ms.length; }
    });
    return { fy: fyStart + '-' + p2((fyStart + 1) % 100), total: num(total), months: months, projected: months ? num(total / months * 12) : null };
  }
  var LIMITS = [
    { lim: 2e7, key: 'gstr9', text: 'GSTR-9 (सालाना रिटर्न) ज़रूरी हो जाएगा – 31 दिसंबर तक.', textEn: 'GSTR-9 (annual return) becomes required – by 31 December.' },
    { lim: 5e7, key: 'gstr9c', text: 'GSTR-9C ज़रूरी, e-invoice ज़रूरी, और अगले साल से Quarterly (QRMP) नहीं चलेगा – Monthly रिटर्न.', textEn: 'GSTR-9C and e-invoicing become required, and from next year Quarterly (QRMP) is not allowed – Monthly returns.' }
  ];
  function checkTurnover(db, ctx, c) {
    var fs = +fyOf(lastMonth(ctx.now)).slice(0, 4), t = fyTurnover(db, c, fs);
    c.alerts = c.alerts || {};
    LIMITS.forEach(function (L) {
      var k = t.fy + ':' + L.key; if (c.alerts[k]) return;
      var actual = t.total >= L.lim, proj = !actual && t.months >= 3 && t.projected >= L.lim;
      if (!actual && !proj) return;
      c.alerts[k] = ctx.now.toISOString();
      function head() { return (actual ? T('टर्नओवर ', 'Turnover ') + crore(t.total) : T('साल का अनुमानित टर्नओवर ', 'Expected yearly turnover ') + crore(t.projected)) + ' (FY ' + t.fy + ', ' + T('', 'above ') + crore(L.lim).replace('.00', '') + T(' से ऊपर', '') + ')'; }
      asClient({ lang: 'hi' }, function () { notifyAdmin(db, ctx, 'TURNOVER', fullName(c) + ': ' + head(), L.text, c.gstin); });
      asClient(c, function () { notifyClient(db, ctx, c, T('📈 आपका टर्नओवर बढ़ रहा है', '📈 Your turnover is growing'), head() + '. ' + T(L.text + ' हम आपको समय पर याद दिलाएँगे.', L.textEn + ' We will remind you in time.')); });
    });
    return t;
  }

  /* ---------- referral: code = 6 letters from the GSTIN (same every time, nothing stored) ---------- */
  function refCode(c) { return sha256('REF|' + c.gstin).slice(0, 6).toUpperCase(); }
  function byRef(db, code) { code = str(code, 10).toUpperCase(); if (!code) return null; for (var g in db.clients) if (refCode(db.clients[g]) === code) return db.clients[g]; return null; }
  function referralsOf(db, c) { return Object.keys(db.clients).map(function (g) { return db.clients[g]; }).filter(function (x) { return x.referredBy === c.gstin; }); }

  /* ---------- document vault ---------- */
  var DOC_TYPES = {
    pan: 'PAN कार्ड', aadhaar: 'आधार कार्ड (आगे-पीछे)', gst_cert: 'GST सर्टिफिकेट', photo: 'पासपोर्ट साइज़ फोटो',
    bank: 'बैंक पासबुक / कैंसल चेक', address: 'दुकान / ऑफिस का एड्रेस प्रूफ (बिजली बिल / रेंट एग्रीमेंट)', msme: 'उद्यम (MSME) सर्टिफिकेट',
    fssai: 'फूड लाइसेंस (FSSAI)', bank_stmt: 'बैंक स्टेटमेंट (पूरे साल का – ITR के लिए)', form16: 'फॉर्म 16 (नौकरी है तो)', other: 'कोई और डॉक्यूमेंट'
  };
  var DOC_TYPES_EN = {
    pan: 'PAN card', aadhaar: 'Aadhaar card (front and back)', gst_cert: 'GST certificate', photo: 'Passport size photo',
    bank: 'Bank passbook / cancelled cheque', address: 'Shop / office address proof (electricity bill / rent agreement)', msme: 'Udyam (MSME) certificate',
    fssai: 'Food licence (FSSAI)', bank_stmt: 'Bank statement (full year – for ITR)', form16: 'Form 16 (if salaried)', other: 'Any other document'
  };
  function docTypes() { return LANG === 'en' ? DOC_TYPES_EN : DOC_TYPES; }
  function docView(d) { return { id: d.id, type: d.type, label: docTypes()[d.type] || d.type, name: d.name, size: d.size, at: d.at, url: d.url || '', fileId: d.fileId }; }
  A.docUpload = function (db, q, ctx) {
    var c = byToken(db, q.token), type = DOC_TYPES[q.type] ? q.type : 'other';
    if (!q.b64) fail(T('फाइल खाली है', 'The file is empty'));
    var name = str(q.name, 120).replace(/[\\\/:*?"<>|]/g, '_') || 'document';
    var size = Math.round(String(q.b64).length * 0.75);
    if (size > 20 * 1048576) fail(T('फाइल 20 MB से बड़ी है', 'The file is larger than 20 MB'));
    var st = ctx.saveFile({ folders: [folderName(c), 'KYC DOCUMENTS'], name: DOC_TYPES[type].replace(/[\\\/:*?"<>|()]/g, ' ').trim() + ' - ' + name, mime: str(q.mime, 100) || 'application/octet-stream' }, q.b64);
    c.docs = c.docs || [];
    c.docs.push({ id: ctx.uuid(), type: type, name: name, size: size, mime: str(q.mime, 100), at: ctx.now.toISOString(), fileId: st.fileId, url: st.url || '' });
    if (c.docReq && c.docReq.types) {
      var before = c.docReq.types.length;
      c.docReq.types = c.docReq.types.filter(function (t) { return t !== type; });
      if (before && !c.docReq.types.length) { notifyAdmin(db, ctx, 'DOCS', fullName(c) + ' ने सारे माँगे गए डॉक्यूमेंट दे दिए', c.docReq.note || '', c.gstin); c.docReq = null; }
    }
    return {};
  };
  A.docDelete = function (db, q, ctx) {
    var c = byToken(db, q.token), d = (c.docs || []).filter(function (x) { return x.id === q.id; })[0];
    if (!d) fail(T('नहीं मिला', 'Not found'));
    c.docs = c.docs.filter(function (x) { return x.id !== q.id; }); ctx.deleteFile(d.fileId);
    return {};
  };
  A.aDocRequest = function (db, q, ctx) {
    var c = client(db, q.gstin), types = (q.types || []).filter(function (t) { return DOC_TYPES[t]; });
    if (!types.length) { c.docReq = null; return {}; }
    c.docReq = { types: types, note: str(q.note, 300), at: ctx.now.toISOString() };
    asClient(c, function () { notifyClient(db, ctx, c, T('📁 ये डॉक्यूमेंट भेजें', '📁 Please send these documents'), (c.docReq.note ? c.docReq.note + ': ' : '') + types.map(function (t) { return docTypes()[t]; }).join(', ') + T('. ऐप में "डॉक्यूमेंट तिजोरी" में अपलोड करें.', '. Upload them in the app\'s "Document vault".')); });
    return {};
  };

  /* ---------- filed return PDFs (GSTR-3B etc.) → client's app; kept in Drive, not on the office PC ---------- */
  A.aReturnUpload = function (db, q, ctx) {
    var c = client(db, q.gstin), pid = str(q.pid, 10);
    if (!isPid(pid)) fail('अवधि सही नहीं');
    if (!q.b64) fail('फाइल खाली है');
    var kind = ['GSTR3B', 'GSTR1', 'OTHER'].indexOf(q.kind) >= 0 ? q.kind : 'OTHER', rec = getRec(db, c.gstin, pid, true), pd = periodDirs(pid);
    var name = str(q.name, 120).replace(/[\\\/:*?"<>|]/g, '_') || kind + '.pdf';
    rec.returns = rec.returns || [];
    var dup = rec.returns.filter(function (r) { return r.name === name && r.kind === kind; })[0];
    if (dup) { rec.returns = rec.returns.filter(function (r) { return r !== dup; }); ctx.deleteFile(dup.fileId); }   // re-upload replaces
    var st = ctx.saveFile({ folders: [folderName(c), pd.fy, pd.label, 'FILED RETURNS'], name: name, mime: 'application/pdf' }, q.b64);
    rec.returns.push({ id: ctx.uuid(), kind: kind, name: name, size: Math.round(String(q.b64).length * 0.75), at: ctx.now.toISOString(), fileId: st.fileId, url: st.url || '' });
    rec.filed = rec.filed || {};
    if (kind === 'GSTR3B' && !rec.filed.gstr3b) rec.filed.gstr3b = { arn: str(q.arn, 30), date: ist(ctx.now).iso };
    if (kind === 'GSTR3B') rec.r3bNotified = rec.r3bNotified || ctx.now.toISOString();
    asClient(c, function () { notifyClient(db, ctx, c, periodLabel(pid) + ': ' + (kind === 'GSTR3B' ? T('GSTR-3B फाइल हो गया ✓', 'GSTR-3B filed ✓') : kind === 'GSTR1' ? T('GSTR-1 की कॉपी', 'GSTR-1 copy') : T('नया डॉक्यूमेंट', 'New document')), T('PDF ऐप में आ गई है – होम पर "' + periodLabel(pid) + '" खोलकर डाउनलोड करें.', 'The PDF is in the app – open "' + periodLabel(pid) + '" on the home screen to download it.')); });
    return { summary: summary(c, pid, rec) };
  };
  A.aReturnDelete = function (db, q, ctx) {
    var c = client(db, q.gstin), rec = getRec(db, c.gstin, str(q.pid, 10), true);
    var r = (rec.returns || []).filter(function (x) { return x.id === q.id; })[0];
    if (r) { rec.returns = rec.returns.filter(function (x) { return x.id !== q.id; }); ctx.deleteFile(r.fileId); }
    return {};
  };
  // client downloads one of their own files (document vault / filed return) – sent through the server, Drive stays private
  A.fileGet = function (db, q, ctx) {
    var c = byToken(db, q.token), f = (c.docs || []).filter(function (x) { return x.id === q.id; })[0];
    if (!f) { var all = db.periods[c.gstin] || {}; Object.keys(all).forEach(function (p) { (all[p].returns || []).forEach(function (r) { if (r.id === q.id) f = r; }); }); }
    if (!f) fail(T('फाइल नहीं मिली', 'File not found'));
    return { name: f.name, mime: f.mime || 'application/pdf', fileId: f.fileId, b64: ctx.readFile ? ctx.readFile(f.fileId) : null };
  };

  /* ---------- office calendar ---------- */
  A.aCalendar = function (db, q, ctx) {
    var back = Math.min(60, Math.max(0, num(q.back) || 10)), ahead = Math.min(120, Math.max(1, num(q.ahead) || 45)), rows = {};
    Object.keys(db.clients).forEach(function (g) {
      var c = db.clients[g]; if (c.status !== 'ACTIVE') return;
      duesFor(db, c, ctx.now, back, ahead).forEach(function (d) {
        var k = d.key.replace(/:[XY]$/, '') + '|' + d.date;
        var r = rows[k] || (rows[k] = { key: d.key, type: d.type, title: d.title, date: d.date, days: d.days, desc: d.desc, done: [], pending: [] });
        (d.done ? r.done : r.pending).push({ gstin: g, name: fullName(c), mobile: c.mobile, ownKey: d.key });
      });
    });
    return { rows: Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.title.localeCompare(b.title); }), ext: db.settings.dueExt || {} };
  };
  A.aDueExt = function (db, q) {
    db.settings.dueExt = db.settings.dueExt || {};
    (q.keys || []).forEach(function (k) { k = str(k, 40); if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) db.settings.dueExt[k] = q.date; else delete db.settings.dueExt[k]; });
    return {};
  };
  A.aDueDone = function (db, q) {
    var c = client(db, q.gstin); c.dueDone = c.dueDone || {};
    if (q.done) c.dueDone[str(q.key, 40)] = true; else delete c.dueDone[str(q.key, 40)];
    return {};
  };
  function dueTick(db, ctx) {
    var t = ist(ctx.now), sent = 0, soon = {};
    var OFF = { GSTR1: [3, 0], GSTR3B: [3, 0], PMT06: [3, 0], TDS: [3, 0], ADV: [7, 0], ITR: [30, 7, 0], GSTR9: [30, 7, 0] };
    Object.keys(db.clients).forEach(function (g) {
      var c = db.clients[g]; if (c.status !== 'ACTIVE') return;
      c.dueSent = c.dueSent || {};
      // office digest in Hindi, the client's reminder in the client's language
      asClient({ lang: 'hi' }, function () { duesFor(db, c, ctx.now, 0, 31).forEach(function (d) { if (!d.done && d.days <= 3) { var k = d.title + '|' + d.date; (soon[k] = soon[k] || []).push(fullName(c)); } }); });
      asClient(c, function () { duesFor(db, c, ctx.now, 0, 31).forEach(function (d) {
        if (d.done) return;
        if ((OFF[d.type] || [0]).indexOf(d.days) < 0 || c.dueSent[d.key + ':' + d.days]) return;
        if (d.type === 'GSTR1') { var sm = summary(c, d.pid, getRec(db, g, d.pid, false)); if (sm.data === 'NIL' || sm.data === 'SUBMITTED' || sm.data === 'COMPLETE') return; }
        c.dueSent[d.key + ':' + d.days] = ctx.now.toISOString();
        notifyClient(db, ctx, c, '📅 ' + d.title + ' – ' + (d.days ? d.days + T(' दिन बाकी', ' day(s) left') : T('आज आखिरी तारीख', 'last date today')), d.desc + T(' (आखिरी तारीख ', ' (last date ') + d.date.split('-').reverse().join('-') + ')');
        sent++;
      }); });
      checkTurnover(db, ctx, c);
    });
    var lines = Object.keys(soon).sort().map(function (k) { return k.split('|')[0] + ' – ' + k.split('|')[1].split('-').reverse().join('-') + ': ' + soon[k].length + ' क्लाइंट बाकी'; });
    if (lines.length) notifyAdmin(db, ctx, 'DUE', '📅 अगले 3 दिन की ड्यू डेट', lines.join(' • '));
    return sent;
  }

  /* ---------- app content: learning/offers, news, services, FAQ + leads ----------
     item = { id, kind: learn|news|service|faq, title, body, icon, img, price, partner, cta, link, pinned, active, order, at } */
  var KINDS = { learn: 'सीखें / ऑफर', news: 'न्यूज़ / अपडेट', service: 'हमारी सेवाएँ', faq: 'सवाल-जवाब' };
  function seedContent() {
    var t = '2026-10-28T00:00:00.000Z', o = 0;
    function it(kind, icon, title, body, cta, en) {
      o++;
      return { id: 'seed-' + kind + '-' + o, kind: kind, icon: icon, title: title, body: body, img: '', price: '', partner: '', cta: cta || '', link: '', pinned: false, active: true, order: o, at: t,
        titleEn: en[0], bodyEn: en[1], ctaEn: cta ? 'Enquire' : '', priceEn: '' };
    }
    var ASK = 'पूछताछ करें';
    return [
      it('service', '🧾', 'GST रजिस्ट्रेशन', 'नया GST नंबर – कागज़ात से लेकर सर्टिफिकेट तक सब हम करेंगे.', ASK, ['GST registration', 'A new GST number – we handle everything from documents to the certificate.']),
      it('service', '📅', 'GST रिटर्न फाइलिंग', 'GSTR-1, GSTR-3B, Meesho / Amazon / Flipkart का TCS मिलान, NIL रिटर्न – हर महीने / तिमाही.', ASK, ['GST return filing', 'GSTR-1, GSTR-3B, Meesho / Amazon / Flipkart TCS matching, NIL returns – every month / quarter.']),
      it('service', '💰', 'इनकम टैक्स रिटर्न (ITR)', 'बिज़नेस, नौकरी या दोनों – सही ITR फॉर्म, रिफंड और नोटिस का जवाब.', ASK, ['Income tax return (ITR)', 'Business, salary or both – the right ITR form, refunds and replies to notices.']),
      it('service', '🏭', 'MSME / उद्यम रजिस्ट्रेशन', 'उद्यम सर्टिफिकेट – लोन, सब्सिडी और सरकारी योजनाओं के लिए ज़रूरी.', ASK, ['MSME / Udyam registration', 'Udyam certificate – needed for loans, subsidies and government schemes.']),
      it('service', '🍲', 'फूड लाइसेंस (FSSAI)', 'खाने-पीने का सामान बेचते हैं? Basic / State / Central FSSAI लाइसेंस.', ASK, ['Food licence (FSSAI)', 'Selling food items? Basic / State / Central FSSAI licence.']),
      it('service', '🏢', 'प्राइवेट लिमिटेड कंपनी रजिस्ट्रेशन', 'नई कंपनी – नाम, DIN, DSC, MOA/AOA, PAN/TAN सब शामिल.', ASK, ['Private limited company registration', 'A new company – name, DIN, DSC, MOA/AOA, PAN/TAN all included.']),
      it('service', '🤝', 'LLP रजिस्ट्रेशन', 'पार्टनरशिप बिज़नेस के लिए LLP – कम खर्च, कम झंझट.', ASK, ['LLP registration', 'LLP for partnership businesses – low cost, little paperwork.']),
      it('service', '™️', 'ट्रेडमार्क रजिस्ट्रेशन', 'अपने ब्रांड का नाम / लोगो सुरक्षित करें – Amazon Brand Registry के लिए भी.', ASK, ['Trademark registration', 'Protect your brand name / logo – also needed for Amazon Brand Registry.']),
      it('service', '📒', 'अकाउंटिंग और बुककीपिंग', 'खरीद-बिक्री, स्टॉक, P&L – पूरा हिसाब हम रखेंगे.', ASK, ['Accounting and bookkeeping', 'Purchases, sales, stock, P&L – we keep all your accounts.']),
      it('faq', '🔐', 'ऐप में लॉगिन कैसे करें?', 'लॉगिन पेज पर अपना GSTIN या मोबाइल नंबर और PIN डालें. पहली बार हैं तो "नया रजिस्ट्रेशन" करें. फोन "Password सेव करें?" पूछे तो Save दबाएँ – अगली बार अपने आप भर जाएगा.', '',
        ['How do I log in?', 'On the login page enter your GSTIN or mobile number and your PIN. First time? Use "New registration". If the phone asks "Save password?", tap Save – it fills in by itself next time.']),
      it('faq', '🔑', 'PIN भूल गया तो क्या करूँ?', 'लॉगिन पेज पर "PIN भूल गए?" दबाएँ – ऑफिस को WhatsApp चला जाएगा और हम आपको PIN बता देंगे.', '',
        ['I forgot my PIN. What now?', 'Tap "Forgot PIN?" on the login page – a WhatsApp goes to the office and we will tell you your PIN.']),
      it('faq', '🛍️', 'Meesho की रिपोर्ट कहाँ से डाउनलोड करें?', 'Meesho Supplier Panel → GST Report से महीने की ZIP (gst_…zip) और Tax Invoice ZIP डाउनलोड करें. दोनों ZIP सीधे Meesho सेक्शन में डाल दें – ऐप अंदर की फाइलें खुद सही खाने में डाल देगा.', '',
        ['Where do I download Meesho reports?', 'Meesho Supplier Panel → GST Report: download the month\'s ZIP (gst_…zip) and the Tax Invoice ZIP. Upload both ZIPs straight into the Meesho section – the app puts the files inside into the right boxes.']),
      it('faq', '📦', 'Amazon की रिपोर्ट कहाँ से डाउनलोड करें?', 'Seller Central → Reports → Tax Document Library से MTR B2C, MTR B2B और GST Report (GSTR1-महीना) डाउनलोड करें. CSV या ZIP दोनों चलेंगी.', '',
        ['Where do I download Amazon reports?', 'Seller Central → Reports → Tax Document Library: download MTR B2C, MTR B2B and the GST Report (GSTR1-MONTH). CSV or ZIP both work.']),
      it('faq', '🛒', 'Flipkart की रिपोर्ट कहाँ से डाउनलोड करें?', 'Seller Hub → Reports → Tax Reports से Sales Report और GST (GSTR Return) Report – दोनों उसी महीने की डाउनलोड करें.', '',
        ['Where do I download Flipkart reports?', 'Seller Hub → Reports → Tax Reports: download the Sales Report and the GST (GSTR Return) Report, both for the same month.']),
      it('faq', '❌', 'मेरी फाइल क्यों नहीं ली गई?', 'ऐप हर फाइल अंदर से जाँचता है. गलत प्लेटफॉर्म की रिपोर्ट (जैसे Meesho की फाइल Flipkart में), गलत महीने की रिपोर्ट या पहले से डाली हुई फाइल नहीं ली जाती. जो कारण लिखा आए उसके हिसाब से सही फाइल डालें. फाइल के अंदर कुछ न बदलें.', '',
        ['Why was my file not accepted?', 'The app checks every file inside. A report of the wrong platform (e.g. a Meesho file in Flipkart), of the wrong month, or a file already uploaded is not taken. Follow the reason shown and upload the right file. Do not change anything inside the file.']),
      it('faq', '🧾', 'ऑफलाइन बिल, Vyapar या कोई और फाइल कैसे भेजूँ?', 'होम पर नीचे "कुछ और भी भेजना है?" में Vyapar, ऑफलाइन बिल (PDF) या "अन्य फाइलें" जोड़ें, फिर उसमें फाइल / फोटो अपलोड करें.', '',
        ['How do I send offline bills, Vyapar or other files?', 'At the bottom of the home screen, under "Anything else to send?", add Vyapar, Offline bills (PDF) or "Other files", then upload the file / photo there.']),
      it('faq', '0️⃣', 'इस महीने कोई सेल नहीं हुई तो?', 'होम पर "इस अवधि में कोई सेल नहीं हुई?" वाला टिक चालू करें. हम आपका NIL रिटर्न सबसे पहले फाइल करेंगे.', '',
        ['No sales this month?', 'Switch on "No sales in this period?" on the home screen. We file NIL returns first.']),
      it('faq', '⏰', 'डेटा कब तक भेजना है?', 'हर महीने 1 से 8 तारीख तक पिछले महीने का डेटा भेजें. Quarterly वाले तिमाही खत्म होने के बाद वाले महीने में (जैसे Jul–Sep का डेटा अक्टूबर में). सब डालकर "डेटा पूरा भेज दिया" दबाएँ.', '',
        ['By when should I send my data?', 'Send last month\'s data between the 1st and 8th of every month. Quarterly clients send in the month after the quarter ends (e.g. Jul–Sep data in October). Upload everything and tap "All data sent".']),
      it('faq', '✅', 'रिटर्न फाइल हुआ, कैसे पता चलेगा?', 'फाइल होते ही ऐप में सूचना आएगी और होम पर ARN नंबर दिखेगा.', '',
        ['How will I know my return is filed?', 'You get a notification in the app as soon as it is filed, and the ARN shows on the home screen.']),
      it('faq', '💳', 'फीस कैसे भरें?', 'रिटर्न फाइल होने के बाद होम पर फीस दिखेगी – "UPI से पे करें" दबाएँ. पेमेंट कर दिया हो तो "मैंने पेमेंट कर दिया" दबाएँ.', '',
        ['How do I pay the fee?', 'After the return is filed the fee shows on the home screen – tap "Pay by UPI". If you have already paid, tap "I have paid".']),
      it('faq', '🏬', 'मेरे पास एक से ज़्यादा GST नंबर हैं?', 'हर GST नंबर का अलग रजिस्ट्रेशन करें. ☰ मेनू → "दूसरी फर्म जोड़ें" से एक ही फोन में सब फर्म रख सकते हैं.', '',
        ['I have more than one GST number?', 'Register each GST number separately. With ☰ menu → "Add another firm" you can keep all firms on one phone.']),
      it('faq', '📲', 'ऐप इंस्टॉल और अपडेट कैसे करें?', 'लिंक Chrome में खोलें → "इंस्टॉल" (iPhone: Share → Add to Home Screen). अपडेट अपने आप आते हैं, कुछ नहीं करना.', '',
        ['How do I install and update the app?', 'Open the link in Chrome → "Install" (iPhone: Share → Add to Home Screen). Updates come by themselves, nothing to do.']),
      it('faq', '📎', 'WhatsApp पर आई रिपोर्ट कैसे भेजूँ?', 'WhatsApp में फाइल को दबाकर रखें → Share → "Vishal GST" चुनें. ऐप खुलेगा, Meesho / Amazon / Flipkart की रिपोर्ट अपने आप सही खाने में जाएगी, बाकी फाइल के लिए खाना चुनें और अपलोड दबाएँ. (Android फोन पर)', '',
        ['How do I send a report I got on WhatsApp?', 'In WhatsApp, press and hold the file → Share → choose "Vishal GST". The app opens; Meesho / Amazon / Flipkart reports go to the right box by themselves, for other files pick the box and tap Upload. (Android phones)'])
    ];
  }
  function ensure(db) {
    if (!db.content) db.content = seedContent();
    if (!db.leads) db.leads = [];
    // v1.6: give the default items their English text (only if the office has not edited the Hindi), and add new default FAQs
    if (!db.meta.seedEn) {
      db.meta.seedEn = 1;
      seedContent().forEach(function (s) {
        var x = db.content.filter(function (i) { return i.id === s.id; })[0];
        if (!x) { if (s.icon === '📎') db.content.push(s); return; }
        if (!x.titleEn && x.title === s.title && x.body === s.body) { x.titleEn = s.titleEn; x.bodyEn = s.bodyEn; x.ctaEn = x.cta === s.cta ? s.ctaEn : ''; }
      });
    }
  }
  function contentFor(db) {
    return db.content.filter(function (x) { return x.active; }).sort(function (a, b) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.kind === 'news' || a.kind === 'learn' ? (b.at || '').localeCompare(a.at || '') : (a.order || 0) - (b.order || 0));
    });
  }
  A.lead = function (db, q, ctx) {
    var c = byToken(db, q.token), item = db.content.filter(function (x) { return x.id === q.id; })[0];
    if (!item) fail(T('ये जानकारी अब उपलब्ध नहीं है', 'This item is no longer available'));
    var dup = db.leads.filter(function (l) { return l.gstin === c.gstin && l.itemId === item.id && ctx.now - new Date(l.at) < 86400000; })[0];
    if (!dup) {
      db.leads.unshift({ id: ctx.uuid(), at: ctx.now.toISOString(), gstin: c.gstin, itemId: item.id, kind: item.kind, title: item.title, status: 'NEW', note: '' });
      db.leads = db.leads.slice(0, 1000);
      notifyAdmin(db, ctx, 'LEAD', fullName(c) + ' – ' + item.title, (KINDS[item.kind] || '') + ' • ' + c.mobile + ' • ' + c.gstin, c.gstin);
    }
    return { link: item.link || '' };
  };
  A.aContent = function (db) {
    var names = {};
    db.leads.forEach(function (l) { var c = db.clients[l.gstin]; if (c) names[l.gstin] = { name: fullName(c), mobile: c.mobile }; });
    return { content: db.content, leads: db.leads, names: names, kinds: KINDS };
  };
  A.aContentSave = function (db, q, ctx) {
    var f = q.item || {}, kind = KINDS[f.kind] ? f.kind : '';
    if (!kind) fail('प्रकार चुनें');
    if (!str(f.title, 150)) fail('शीर्षक डालें');
    var it = f.id ? db.content.filter(function (x) { return x.id === f.id; })[0] : null, isNew = !it;
    if (!it) { it = { id: ctx.uuid(), at: ctx.now.toISOString(), order: db.content.length + 1 }; db.content.push(it); }
    it.kind = kind; it.title = str(f.title, 150); it.body = str(f.body, 3000); it.icon = str(f.icon, 8);
    it.img = str(f.img, 600); it.price = str(f.price, 60); it.partner = str(f.partner, 80); it.cta = str(f.cta, 40);
    // optional English text for clients who use the app in English
    if (f.titleEn !== undefined) { it.titleEn = str(f.titleEn, 150); it.bodyEn = str(f.bodyEn, 3000); it.ctaEn = str(f.ctaEn, 40); it.priceEn = str(f.priceEn, 60); }
    it.link = /^https?:\/\//i.test(str(f.link, 500)) ? str(f.link, 500) : ''; it.pinned = !!f.pinned; it.active = f.active !== false;
    if (f.order != null && f.order !== '') it.order = num(f.order);
    var sent = 0;
    if (q.notify && it.active) {
      Object.keys(db.clients).forEach(function (g) {
        var c = db.clients[g]; if (c.status !== 'ACTIVE') return;
        var en = c.lang === 'en' && it.titleEn;
        notifyClient(db, ctx, c, (kind === 'news' ? '📰 ' : kind === 'learn' ? '🎓 ' : '') + (en ? it.titleEn : it.title), (en ? it.bodyEn || it.body : it.body).slice(0, 160)); sent++;
      });
      it.notifiedAt = ctx.now.toISOString();
    }
    return { item: it, isNew: isNew, sent: sent };
  };
  A.aContentDelete = function (db, q) { db.content = db.content.filter(function (x) { return x.id !== q.id; }); return {}; };
  A.aContentImage = function (db, q, ctx) {
    if (!q.b64) fail('फोटो खाली है');
    if (String(q.b64).length > 2.8e6) fail('फोटो 2 MB से छोटी रखें');
    return { url: ctx.saveImage(q.b64, str(q.mime, 40) || 'image/jpeg', str(q.name, 80) || 'image.jpg') };
  };
  A.aLeadUpdate = function (db, q) {
    var l = db.leads.filter(function (x) { return x.id === q.id; })[0];
    if (!l) fail('नहीं मिला');
    if (q.status) l.status = ['NEW', 'TALKED', 'WON', 'CLOSED'].indexOf(q.status) >= 0 ? q.status : l.status;
    if (q.note != null) l.note = str(q.note, 300);
    return { lead: l };
  };

  var READ_ONLY = { state: 1, aList: 1, aClient: 1, aInbox: 1, aPayments: 1, aContent: 1, aCalendar: 1, fileGet: 1 };

  /* ---------- daily reminders (Apps Script time trigger / admin button) ---------- */
  function tick(db, ctx, force) {
    var t = ist(ctx.now), s = db.settings, dataSent = 0, paySent = 0;
    setLang('hi');   // office side; each client's texts switch with asClient
    if (db.meta.lastTick === t.iso && !force) return { skipped: true };
    db.meta.lastTick = t.iso;
    var dataDay = (s.remindDays || []).indexOf(t.d) >= 0;
    Object.keys(db.clients).forEach(function (g) {
      var c = db.clients[g];
      if (c.status !== 'ACTIVE') return;
      if (dataDay || force) {
        var pid = currentPid(c.freq, ctx.now);
        if (isCollectionMonth(c.freq, pid, ctx.now)) {
          var rec = getRec(db, g, pid, false), sm = summary(c, pid, rec);
          if ((sm.data === 'NONE' || sm.data === 'PARTIAL') && rec.work !== 'FILED') {
            asClient(c, function () { var m = dataReminder(c, summary(c, pid, rec), s); notifyClient(db, ctx, c, m.title, m.body); }); dataSent++;
          }
        }
      }
      var all = db.periods[g] || {};
      Object.keys(all).forEach(function (p) {
        var r = all[p], sm2 = summary(c, p, r);
        if (sm2.due > 0 && r.work === 'FILED') {
          var days = r.payRemindAt ? (ctx.now - new Date(r.payRemindAt)) / 86400000 : 999;
          if (days >= (s.payEveryDays || 3) - 0.05) { asClient(c, function () { var m3 = payReminder(c, summary(c, p, r)); notifyClient(db, ctx, c, m3.title, m3.body); }); r.payRemindAt = ctx.now.toISOString(); paySent++; }
        }
      });
    });
    var dueSent = dueTick(db, ctx);
    if (dataSent || paySent || dueSent) notifyAdmin(db, ctx, 'TICK', 'आज के रिमाइंडर भेजे गए', 'डेटा: ' + dataSent + ' • पेमेंट: ' + paySent + ' • ड्यू डेट: ' + dueSent);
    return { dataSent: dataSent, paySent: paySent, dueSent: dueSent };
  }

  /* ---------- entry point ----------
     ctx = { now:Date, uuid(), saveFile(meta,b64)->{fileId,url}, deleteFile(id),
             push(tokens,title,body,gstin), notifyAdmin(kind,title,body), adminKeyOk(key) } */
  function handle(db, q, ctx) {
    var action = String(q && q.action || '');
    setLang(q && q.lang);
    try {
      if (!A[action]) fail('Unknown action: ' + action);
      ensure(db);
      if (action[0] === 'a' && action[1] === action[1].toUpperCase() && !ctx.adminKeyOk(q.adminKey)) fail('ADMIN_KEY_WRONG');
      var data = A[action](db, q, ctx);
      return { out: { ok: true, data: data, v: VERSION }, dirty: !READ_ONLY[action] };
    } catch (e) {
      return { out: { ok: false, error: e.user ? e.message : 'Server error: ' + e.message }, dirty: false };
    }
  }

  return {
    VERSION: VERSION, PLATFORMS: PLATFORMS, PLATFORM_ORDER: PLATFORM_ORDER, STATES: STATES, KINDS: KINDS, DOC_TYPES: DOC_TYPES, periodDirs: periodDirs, isPid: isPid,
    newDb: newDb, handle: handle, tick: tick,
    gstinValid: gstinValid, gstinInfo: gstinInfo, sha256: sha256,
    monthsOf: monthsOf, monthLabel: monthLabel, periodLabel: periodLabel, currentPid: currentPid, pidFor: pidFor,
    lastMonth: lastMonth, quarterOf: quarterOf, addMonth: addMonth, slotsFor: slotsFor, summary: summary, missingText: missingText,
    setLang: setLang, T: T, platLabel: platLabel
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
