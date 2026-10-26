/* ============================================================
   Vishal Accounting Services – GST Data Collection : CORE
   Shared logic. Runs in the browser (demo mode) AND in the
   Google Apps Script backend (copy this file as Core.gs).
   No DOM, no async, no modules – plain ES2019.
   ============================================================ */
var Core = (function () {
  var VERSION = '1.0.0';

  /* ---------- Platforms and the reports each one must send ----------
     perMonth:true  -> one report per month (quarterly client = 3 slots)
     optional:true  -> not counted in "बाकी" (missing)
     multi:true     -> many files expected (bills)                     */
  var PLATFORMS = {
    meesho: {
      label: 'Meesho', group: 'online', color: '#c2187a',
      reports: [
        { key: 'tcs_sales', name: 'TCS Sales Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip',
          hint: 'Meesho Supplier Panel → GST Report डाउनलोड करें (महीना चुनें). ZIP में से tcs_sales फाइल, या पूरी ZIP यहाँ डालें.' },
        { key: 'tcs_return', name: 'TCS Sales Return Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip',
          hint: 'उसी GST Report ZIP की tcs_sales_return फाइल. पूरी ZIP ऊपर डाल दी हो तो भी यहाँ डालें.' }
      ]
    },
    amazon: {
      label: 'Amazon', group: 'online', color: '#e88a00',
      reports: [
        { key: 'mtr_b2c', name: 'MTR B2C Report', perMonth: true, accept: '.csv,.xlsx,.xls,.zip',
          hint: 'Seller Central → Reports → Tax Document Library → GST MTR (B2C), महीना चुनें.' },
        { key: 'mtr_b2b', name: 'MTR B2B Report', perMonth: true, accept: '.csv,.xlsx,.xls,.zip',
          hint: 'उसी जगह से GST MTR (B2B). B2B सेल नहीं है तो भी खाली रिपोर्ट डाल दें.' }
      ]
    },
    flipkart: {
      label: 'Flipkart', group: 'online', color: '#2874f0',
      reports: [
        { key: 'sales', name: 'Sales Report', perMonth: true, accept: '.xlsx,.xls,.csv,.zip',
          hint: 'Seller Hub → Reports → Tax Reports → Sales Report, महीना चुनें.' },
        { key: 'gst', name: 'GST Report (GSTR-1)', perMonth: true, optional: true, accept: '.xlsx,.xls,.csv,.zip',
          hint: 'Seller Hub → Reports से GST/GSTR-1 Report (हो तो).' }
      ]
    },
    vyapar: {
      label: 'Vyapar', group: 'offline', color: '#e53935',
      reports: [
        { key: 'gstr1', name: 'GSTR-1 Report (Excel)', perMonth: false, accept: '.xlsx,.xls,.csv,.pdf,.json',
          hint: 'Vyapar → Reports → GSTR-1 → पूरी अवधि चुनकर Excel में Export करें.' }
      ]
    },
    tool: {
      label: 'हमारा GST Billing टूल', group: 'offline', color: '#00897b',
      reports: [
        { key: 'export', name: 'GST Excel / JSON / XML', perMonth: false, accept: '.xlsx,.xls,.csv,.json,.xml,.zip',
          hint: 'GST Billing → GSTR-1 पेज → Excel या JSON डाउनलोड करके यहाँ डालें.' }
      ]
    },
    pdf: {
      label: 'ऑफलाइन बिल (PDF)', group: 'offline', color: '#5d4037',
      reports: [
        { key: 'bills', name: 'सारे बिल – PDF / फोटो', perMonth: false, multi: true, accept: '.pdf,.jpg,.jpeg,.png,.zip',
          hint: 'इस अवधि के सारे सेल बिल. एक PDF में या अलग-अलग – जितने हों सब डालें.' }
      ]
    }
  };
  var PLATFORM_ORDER = ['meesho', 'amazon', 'flipkart', 'vyapar', 'tool', 'pdf'];

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
            name: r.name + (mid && months.length > 1 ? ' (' + monthLabel(mid).slice(0, 3) + ')' : ''),
            optional: !!r.optional, multi: !!r.multi, accept: r.accept, hint: r.hint
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
    (rec.files || []).forEach(function (f) { have[f.slot] = (have[f.slot] || 0) + 1; });
    var req = slots.filter(function (s) { return !s.optional; });
    var missing = req.filter(function (s) { return !have[s.id]; });
    var files = (rec.files || []).length;
    var data = rec.nil ? 'NIL'
      : rec.submittedAt ? 'SUBMITTED'
      : (req.length && !missing.length) ? 'COMPLETE'
      : files ? 'PARTIAL' : 'NONE';
    var fee = rec.fee == null ? null : num(rec.fee), paid = paidOf(rec);
    var last = (rec.files || []).reduce(function (m, f) { return f.at > m ? f.at : m; }, '');
    return {
      pid: pid, label: periodLabel(pid), data: data, required: req.length, done: req.length - missing.length,
      missing: missing.map(function (s) { return { id: s.id, plat: s.plat, name: s.name }; }),
      files: files, lastUpload: last, submittedAt: rec.submittedAt || '',
      work: rec.work || '', filed: rec.filed || {}, fee: fee, paid: paid,
      due: fee == null ? 0 : Math.max(0, num(fee - paid)), payClaim: rec.payClaim || null
    };
  }
  function missingText(sm) {
    var by = {};
    sm.missing.forEach(function (m) { (by[m.plat] = by[m.plat] || []).push(m.name); });
    return Object.keys(by).map(function (k) { return PLATFORMS[k].label + ': ' + by[k].join(', '); }).join(' | ');
  }

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
  function publicClient(c) {
    return { gstin: c.gstin, trade: c.trade, legal: c.legal, owner: c.owner, mobile: c.mobile, email: c.email, freq: c.freq,
      platforms: c.platforms, status: c.status, verified: !!c.verified, createdAt: c.createdAt, defaultFee: c.defaultFee,
      notes: c.notes || '', push: (c.pushTokens || []).length, state: gstinInfo(c.gstin).state };
  }
  function folderName(c) { return (str(c.trade, 60) || c.gstin).replace(/[\\\/:*?"<>|]/g, ' ') + ' ' + c.gstin; }
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
  function displayName(c) { return c.trade || c.legal || c.gstin; }

  /* ---------- message texts ---------- */
  function dataReminder(c, sm, settings) {
    var who = c.owner || displayName(c);
    var body = sm.files
      ? 'नमस्ते ' + who + ', ' + sm.label + ' के GST रिटर्न के लिए ' + sm.missing.length + ' रिपोर्ट अभी बाकी हैं – ' + missingText(sm) + '. सब डालकर "डेटा भेज दिया" दबाएँ.'
      : 'नमस्ते ' + who + ', ' + sm.label + ' का GST डेटा (Meesho / Amazon / Flipkart रिपोर्ट या बिल) ऐप में अपलोड करें. इस अवधि में कोई सेल नहीं थी तो "NIL" चुनें.';
    return { title: sm.label + ' का GST डेटा भेजें', body: body };
  }
  function payReminder(c, sm) {
    return { title: 'फीस बाकी: ₹' + sm.due, body: sm.label + ' का GST रिटर्न फाइल हो चुका है. कृपया ₹' + sm.due + ' का भुगतान करें. भुगतान कर दिया हो तो ऐप में "मैंने पेमेंट कर दिया" दबाएँ.' };
  }

  /* ---------- auth ---------- */
  function byToken(db, token) {
    token = str(token, 80);
    if (!token) fail('लॉगिन करें');
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
    if (!gstinValid(g)) fail('GSTIN सही नहीं है – दोबारा जाँचें');
    if (db.clients[g]) fail('यह GSTIN पहले से रजिस्टर है – लॉगिन करें');
    var mobile = str(q.mobile, 10);
    if (!/^[6-9]\d{9}$/.test(mobile)) fail('10 अंकों का मोबाइल नंबर डालें');
    var pin = str(q.pin, 6);
    if (!/^\d{4,6}$/.test(pin)) fail('PIN 4 से 6 अंकों का रखें');
    var trade = str(q.trade, 100);
    if (!trade) fail('फर्म / ट्रेड नाम डालें');
    var salt = ctx.uuid().slice(0, 8);
    var c = {
      gstin: g, trade: trade, legal: str(q.legal, 100), owner: str(q.owner, 80), mobile: mobile, email: str(q.email, 100),
      freq: q.freq === 'Q' ? 'Q' : 'M', platforms: cleanPlatforms(q.platforms), status: 'ACTIVE', verified: false,
      salt: salt, pinHash: pinHash(pin, salt), tokens: [], pushTokens: [], inbox: [], defaultFee: null, notes: '',
      createdAt: ctx.now.toISOString()
    };
    db.clients[g] = c;
    notifyClient(db, ctx, c, 'स्वागत है 🙏', db.settings.firm + ' के ऐप में आपका स्वागत है. हर महीने/तिमाही डेटा भेजने का रिमाइंडर यहीं आएगा.');
    notifyAdmin(db, ctx, 'REG', 'नया क्लाइंट: ' + trade, g + ' • ' + mobile + ' • ' + (c.freq === 'Q' ? 'Quarterly' : 'Monthly') + ' • ' + (c.platforms.map(function (p) { return PLATFORMS[p].label; }).join(', ') || 'कोई प्लेटफॉर्म नहीं'), g);
    return { sessions: [newSession(c, ctx)] };
  };
  A.login = function (db, q, ctx) {
    var id = str(q.id, 15).toUpperCase(), pin = str(q.pin, 6), out = [];
    Object.keys(db.clients).forEach(function (g) {
      var c = db.clients[g];
      if ((c.gstin === id || c.mobile === id) && c.pinHash === pinHash(pin, c.salt) && c.status !== 'BLOCKED') out.push(newSession(c, ctx));
    });
    if (!out.length) fail('GSTIN / मोबाइल या PIN गलत है');
    return { sessions: out };
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
      files: (rec.files || []).map(function (f) { return { id: f.id, slot: f.slot, name: f.name, size: f.size, at: f.at }; }),
      inbox: (c.inbox || []).slice(0, 30), unread: (c.inbox || []).filter(function (n) { return !n.read; }).length,
      dues: dues, settings: { upi: db.settings.upi, payeeName: db.settings.payeeName, phone: db.settings.phone, firm: db.settings.firm }
    };
  };
  function editableRec(db, c, pid) {
    if (!isPid(pid)) fail('अवधि सही नहीं');
    var rec = getRec(db, c.gstin, pid, true);
    if (rec.work === 'FILED') fail('इस अवधि का रिटर्न फाइल हो चुका है – बदलाव के लिए ऑफिस से बात करें');
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
    if (!slot) fail('यह रिपोर्ट आपकी प्रोफाइल में नहीं है');
    var name = str(q.name, 150).replace(/[\\\/:*?"<>|]/g, '_') || 'file';
    if (!q.b64) fail('फाइल खाली है');
    var size = Math.round(String(q.b64).length * 0.75);
    if (size > 30 * 1048576) fail('फाइल 30 MB से बड़ी है');
    var P = PLATFORMS[slot.plat];
    var stored = ctx.saveFile({
      folders: [folderName(c), periodLabel(pid), P.label],
      name: slot.name.replace(/[\\\/:*?"<>|]/g, ' ') + ' __ ' + name,
      mime: str(q.mime, 100) || 'application/octet-stream'
    }, q.b64);
    var f = { id: ctx.uuid(), slot: slot.id, name: name, size: size, mime: str(q.mime, 100), at: ctx.now.toISOString(), fileId: stored.fileId, url: stored.url || '' };
    rec.files.push(f);
    rec.nil = false;
    checkComplete(db, ctx, c, pid, rec);
    return { file: { id: f.id, slot: f.slot, name: f.name, size: f.size, at: f.at } };
  };
  A.deleteFile = function (db, q, ctx) {
    var c = byToken(db, q.token), rec = editableRec(db, c, str(q.pid, 10));
    var f = rec.files.filter(function (x) { return x.id === q.id; })[0];
    if (!f) fail('फाइल नहीं मिली');
    rec.files = rec.files.filter(function (x) { return x.id !== q.id; });
    ctx.deleteFile(f.fileId);
    if (rec.completeNotified && summary(c, q.pid, rec).data !== 'COMPLETE') rec.completeNotified = '';
    return {};
  };
  A.setNil = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = editableRec(db, c, pid);
    if (q.nil && rec.files.length) fail('इस अवधि में फाइलें अपलोड हैं. NIL के लिए पहले उन्हें हटाएँ.');
    rec.nil = !!q.nil;
    rec.submittedAt = rec.nil ? ctx.now.toISOString() : '';
    if (rec.nil) notifyAdmin(db, ctx, 'NIL', 'NIL रिटर्न: ' + displayName(c) + ' – ' + periodLabel(pid), c.gstin + ' ने बताया कि इस अवधि में कोई सेल नहीं है. पहले फाइल करें.', c.gstin);
    return {};
  };
  A.submit = function (db, q, ctx) {
    var c = byToken(db, q.token), pid = str(q.pid, 10), rec = editableRec(db, c, pid);
    var sm = summary(c, pid, rec);
    if (!rec.files.length) fail('पहले रिपोर्ट अपलोड करें, या कोई सेल नहीं थी तो NIL चुनें');
    if (sm.missing.length && !q.force) return { needConfirm: true, missing: sm.missing };
    rec.submittedAt = ctx.now.toISOString();
    rec.completeNotified = rec.completeNotified || rec.submittedAt;
    notifyAdmin(db, ctx, 'SUBMIT', displayName(c) + ' ने ' + sm.label + ' का डेटा भेजा', sm.done + '/' + sm.required + ' रिपोर्ट' + (sm.missing.length ? ' • बाकी: ' + missingText(sm) : ' • सब पूरा') + ' • ' + sm.files + ' फाइलें', c.gstin);
    return {};
  };
  A.unsubmit = function (db, q, ctx) {
    var c = byToken(db, q.token), rec = editableRec(db, c, str(q.pid, 10));
    if (rec.nil) fail('NIL हटाने के लिए NIL वाला टिक हटाएँ');
    rec.submittedAt = '';
    return {};
  };
  A.profile = function (db, q, ctx) {
    var c = byToken(db, q.token), changes = [];
    if (q.platforms) { var p = cleanPlatforms(q.platforms); if (p.join() !== (c.platforms || []).join()) { c.platforms = p; changes.push('प्लेटफॉर्म: ' + p.map(function (k) { return PLATFORMS[k].label; }).join(', ')); } }
    if (q.owner != null && str(q.owner, 80) !== c.owner) { c.owner = str(q.owner, 80); changes.push('नाम: ' + c.owner); }
    if (q.email != null && str(q.email, 100) !== c.email) { c.email = str(q.email, 100); changes.push('ईमेल: ' + c.email); }
    if (q.freq && (q.freq === 'Q' ? 'Q' : 'M') !== c.freq) { c.freq = q.freq === 'Q' ? 'Q' : 'M'; changes.push('रिटर्न: ' + (c.freq === 'Q' ? 'Quarterly' : 'Monthly')); }
    if (changes.length) notifyAdmin(db, ctx, 'PROFILE', displayName(c) + ' ने प्रोफाइल बदली', changes.join(' • '), c.gstin);
    return { client: publicClient(c) };
  };
  A.changePin = function (db, q, ctx) {
    var c = byToken(db, q.token);
    if (c.pinHash !== pinHash(str(q.old, 6), c.salt)) fail('पुराना PIN गलत है');
    if (!/^\d{4,6}$/.test(str(q.pin, 6))) fail('PIN 4 से 6 अंकों का रखें');
    c.pinHash = pinHash(str(q.pin, 6), c.salt);
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
    if (!(sm.due > 0)) fail('इस अवधि की कोई फीस बाकी नहीं');
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
      return { client: publicClient(c), summary: summary(c, pid, rec), totalDue: pend };
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
      client: publicClient(c),
      periods: pids.map(function (p) {
        var rec = all[p] || emptyRec();
        return { summary: summary(c, p, rec), slots: slotsFor(c, p), files: rec.files || [], payments: rec.payments || [] };
      })
    };
  };
  A.aUpdateClient = function (db, q) {
    var c = client(db, q.gstin), f = q.fields || {};
    ['trade', 'legal', 'owner', 'email', 'notes'].forEach(function (k) { if (f[k] != null) c[k] = str(f[k], k === 'notes' ? 500 : 100); });
    if (f.mobile != null) { if (!/^[6-9]\d{9}$/.test(str(f.mobile, 10))) fail('मोबाइल नंबर सही नहीं'); c.mobile = str(f.mobile, 10); }
    if (f.freq) c.freq = f.freq === 'Q' ? 'Q' : 'M';
    if (f.platforms) c.platforms = cleanPlatforms(f.platforms);
    if (f.defaultFee !== undefined) c.defaultFee = f.defaultFee === '' || f.defaultFee == null ? null : num(f.defaultFee);
    if (f.verified != null) c.verified = !!f.verified;
    if (f.status) c.status = f.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE';
    if (c.status === 'BLOCKED') c.tokens = [];
    return { client: publicClient(c) };
  };
  A.aResetPin = function (db, q) {
    var c = client(db, q.gstin), pin = str(q.pin, 6);
    if (!/^\d{4,6}$/.test(pin)) fail('PIN 4 से 6 अंकों का रखें');
    c.pinHash = pinHash(pin, c.salt); c.tokens = [];
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
    if (rec.filed.gstr1) rec.work = 'FILED';
    var label = periodLabel(pid);
    if (rec.work === 'PROCESS' && q.work === 'PROCESS' && !rec.processNotified) {
      rec.processNotified = ctx.now.toISOString();
      notifyClient(db, ctx, c, label + ': फाइलिंग शुरू', 'आपका ' + label + ' का डेटा मिल गया है, रिटर्न तैयार किया जा रहा है.');
    }
    if (rec.work === 'FILED' && !wasFiled) {
      if (rec.fee == null) rec.fee = c.defaultFee != null ? c.defaultFee : (num(db.settings.defaultFee) || null);
      var sm = summary(c, pid, rec), txt = (rec.nil ? 'NIL ' : '') + 'GSTR-1 फाइल हो गया ✓' + (rec.filed.gstr1 && rec.filed.gstr1.arn ? ' ARN: ' + rec.filed.gstr1.arn : '');
      if (sm.due > 0) txt += '. फीस ₹' + sm.due + ' – कृपया भुगतान करें.';
      notifyClient(db, ctx, c, label + ' का रिटर्न फाइल हो गया', txt);
      rec.payRemindAt = ctx.now.toISOString();
    }
    if (rec.filed.gstr3b && !rec.r3bNotified) {
      rec.r3bNotified = ctx.now.toISOString();
      notifyClient(db, ctx, c, label + ': GSTR-3B फाइल हो गया ✓', rec.filed.gstr3b.arn ? 'ARN: ' + rec.filed.gstr3b.arn : 'GSTR-3B भी फाइल हो गया.');
    }
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
    notifyClient(db, ctx, c, '₹' + amt + ' भुगतान मिला 🙏', sm.label + ' की फीस का ₹' + amt + ' मिल गया' + (sm.due > 0 ? '. बाकी ₹' + sm.due : '. धन्यवाद!'));
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
    notifyClient(db, ctx, c, 'पेमेंट नहीं मिला', periodLabel(pid) + ' की फीस का पेमेंट अभी हमें नहीं मिला है. कृपया जाँच लें.');
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
    return { sent: sent };
  };
  A.aSettings = function (db, q) {
    var s = db.settings, f = q.set;
    if (f) {
      if (f.remindDays != null) s.remindDays = String(f.remindDays).split(/[^0-9]+/).map(Number).filter(function (d) { return d >= 1 && d <= 28; });
      if (f.payEveryDays != null) s.payEveryDays = Math.max(1, Math.round(num(f.payEveryDays)) || 3);
      ['upi', 'payeeName', 'phone', 'firm'].forEach(function (k) { if (f[k] != null) s[k] = str(f[k], 100); });
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
  A.aInbox = function (db) { return { inbox: db.adminInbox.slice(0, 150) }; };
  A.aReadInbox = function (db) { db.adminInbox.forEach(function (n) { n.read = true; }); return {}; };
  A.aTick = function (db, q, ctx) { return tick(db, ctx, true); };
  A.aDeleteClient = function (db, q, ctx) {
    var c = client(db, q.gstin), all = db.periods[c.gstin] || {};
    Object.keys(all).forEach(function (p) { (all[p].files || []).forEach(function (f) { ctx.deleteFile(f.fileId); }); });
    delete db.periods[c.gstin]; delete db.clients[c.gstin];
    return {};
  };

  var READ_ONLY = { state: 1, aList: 1, aClient: 1, aInbox: 1, aPayments: 1 };

  /* ---------- daily reminders (Apps Script time trigger / admin button) ---------- */
  function tick(db, ctx, force) {
    var t = ist(ctx.now), s = db.settings, dataSent = 0, paySent = 0;
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
            var m = dataReminder(c, sm, s); notifyClient(db, ctx, c, m.title, m.body); dataSent++;
          }
        }
      }
      var all = db.periods[g] || {};
      Object.keys(all).forEach(function (p) {
        var r = all[p], sm2 = summary(c, p, r);
        if (sm2.due > 0 && r.work === 'FILED') {
          var days = r.payRemindAt ? (ctx.now - new Date(r.payRemindAt)) / 86400000 : 999;
          if (days >= (s.payEveryDays || 3) - 0.05) { var m3 = payReminder(c, sm2); notifyClient(db, ctx, c, m3.title, m3.body); r.payRemindAt = ctx.now.toISOString(); paySent++; }
        }
      });
    });
    if (dataSent || paySent) notifyAdmin(db, ctx, 'TICK', 'आज के रिमाइंडर भेजे गए', 'डेटा: ' + dataSent + ' • पेमेंट: ' + paySent);
    return { dataSent: dataSent, paySent: paySent };
  }

  /* ---------- entry point ----------
     ctx = { now:Date, uuid(), saveFile(meta,b64)->{fileId,url}, deleteFile(id),
             push(tokens,title,body,gstin), notifyAdmin(kind,title,body), adminKeyOk(key) } */
  function handle(db, q, ctx) {
    var action = String(q && q.action || '');
    try {
      if (!A[action]) fail('Unknown action: ' + action);
      if (action[0] === 'a' && action[1] === action[1].toUpperCase() && !ctx.adminKeyOk(q.adminKey)) fail('ADMIN_KEY_WRONG');
      var data = A[action](db, q, ctx);
      return { out: { ok: true, data: data, v: VERSION }, dirty: !READ_ONLY[action] };
    } catch (e) {
      return { out: { ok: false, error: e.user ? e.message : 'Server error: ' + e.message }, dirty: false };
    }
  }

  return {
    VERSION: VERSION, PLATFORMS: PLATFORMS, PLATFORM_ORDER: PLATFORM_ORDER, STATES: STATES,
    newDb: newDb, handle: handle, tick: tick,
    gstinValid: gstinValid, gstinInfo: gstinInfo, sha256: sha256,
    monthsOf: monthsOf, monthLabel: monthLabel, periodLabel: periodLabel, currentPid: currentPid, pidFor: pidFor,
    lastMonth: lastMonth, quarterOf: quarterOf, addMonth: addMonth, slotsFor: slotsFor, summary: summary, missingText: missingText
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
