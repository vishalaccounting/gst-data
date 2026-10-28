/* Report detection (browser only): reads an uploaded file's sheets/columns and says which
   marketplace report it is and for which month. Same rules as GST REPORT TOOL\app\Engine.ps1
   (Set-TableType). ZIPs are opened and every report inside is detected separately.
   Libraries load from cdnjs only when needed. */
var Detect = (function () {
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  // type -> [platform, report key, label]
  var TYPES = {
    MEESHO_SALE: ['meesho', 'tcs_sales', 'Meesho – TCS Sales'],
    MEESHO_RET: ['meesho', 'tcs_return', 'Meesho – TCS Sales Return'],
    MEESHO_INV: ['meesho', 'tax_invoice', 'Meesho – Tax Invoice Details'],
    AMZ_B2C: ['amazon', 'mtr_b2c', 'Amazon – MTR B2C'],
    AMZ_B2B: ['amazon', 'mtr_b2b', 'Amazon – MTR B2B'],
    AMZ_GSTR1: ['amazon', 'gstr1', 'Amazon – GSTR-1 (monthly GST) Report'],
    FK_SALES: ['flipkart', 'sales', 'Flipkart – Sales Report'],
    FK_GST: ['flipkart', 'gst', 'Flipkart – GSTR Return Report']
  };

  var loading = {};
  function load(src) {
    if (!loading[src]) loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { delete loading[src]; rej(new Error(window.UI_LANG === 'en' ? 'The file-check tool did not load – check your internet' : 'फाइल जाँचने का टूल लोड नहीं हुआ – इंटरनेट जाँचें')); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function mid(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }

  // month of a cell value: Date, 'YYYY-MM-DD…', Indian 'DD-MM-YYYY' / 'DD/MM/YY' (Amazon MTR CSV: "10/09/26 23:17" = 10 Sep)
  function monthOf(v) {
    if (v instanceof Date && !isNaN(v)) return mid(v.getFullYear(), v.getMonth() + 1);
    var s = String(v || ''), m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2];
    m = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4}|\d{2})\b/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12) return mid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2]);
    return '';
  }
  function mostCommon(list) {
    var c = {}, best = '', n = 0;
    list.forEach(function (k) { if (!k) return; c[k] = (c[k] || 0) + 1; if (c[k] > n) { n = c[k]; best = k; } });
    return best;
  }

  // sheets -> [{name, head:[lowercase], rows:[[…]]}]
  function readSheets(buf, csv) {
    // CSV: keep text as-is (the library would read "10/09/26" as US month/day)
    // every row is read: the taxable total (turnover) needs them all
    var wb = XLSX.read(buf, csv ? { type: 'array', raw: true } : { type: 'array', cellDates: true });
    return wb.SheetNames.map(function (n) {
      var ws = wb.Sheets[n], maxR = 0, maxC = 0;
      // Flipkart files declare a wrong sheet size (A1:BH1) – rebuild the range from the real cells
      Object.keys(ws).forEach(function (k) { if (k[0] === '!') return; var c = XLSX.utils.decode_cell(k); if (c.r > maxR) maxR = c.r; if (c.c > maxC) maxC = c.c; });
      if (maxR || maxC) ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      var a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      var h = -1;
      for (var r = 0; r < Math.min(10, a.length); r++) {
        if (a[r].filter(function (x) { return String(x).trim() !== ''; }).length >= 3) { h = r; break; }
      }
      return { name: n, head: h < 0 ? [] : a[h].map(function (x) { return String(x).trim().toLowerCase(); }), rows: h < 0 ? [] : a.slice(h + 1) };
    });
  }
  function has(sh, cols) { return cols.every(function (c) { return sh.head.indexOf(c) >= 0; }); }
  // taxable value total of a report (turnover estimate; returns / refunds are negative in Amazon & Flipkart files)
  function colSum(sh, test) {
    var i = -1;
    sh.head.some(function (h, k) { if (typeof test === 'string' ? h === test : test.test(h)) { i = k; return true; } return false; });
    if (i < 0) return null;
    var s = 0;
    sh.rows.forEach(function (r) { var v = parseFloat(String(r[i] == null ? '' : r[i]).replace(/[,₹\s]/g, '')); if (isFinite(v)) s += v; });
    return Math.round(s * 100) / 100;
  }
  function colMonth(sh, col) {
    var i = sh.head.indexOf(col);
    return i < 0 ? '' : mostCommon(sh.rows.map(function (r) { return monthOf(r[i]); }));
  }
  function meeshoMonth(sh) {   // financial_year + month_number columns are the report month
    var y = sh.head.indexOf('financial_year'), m = sh.head.indexOf('month_number');
    if (y >= 0 && m >= 0) {
      var k = mostCommon(sh.rows.map(function (r) { var yy = parseInt(r[y], 10), mm = parseInt(r[m], 10); return yy > 2000 && mm >= 1 && mm <= 12 ? mid(yy, mm) : ''; }));
      if (k) return k;
    }
    return colMonth(sh, 'order_date');
  }
  // month from file name: GSTR1-SEPTEMBER-2026-…, GSTR1-OCTOBER-DECEMBER-2025-…, …_2026-07-01_to_2026-07-31
  function nameMonths(name) {
    var u = String(name).toUpperCase(), m = new RegExp('(' + MONTHS.join('|') + ')-(?:(' + MONTHS.join('|') + ')-)?(\\d{4})').exec(u);
    if (m) {
      var a = MONTHS.indexOf(m[1]) + 1, b = m[2] ? MONTHS.indexOf(m[2]) + 1 : a, y = +m[3], out = [];
      if (b < a) return [mid(y, a)];
      for (var k = a; k <= b; k++) out.push(mid(y, k));
      return out;
    }
    m = /(\d{4})-(\d{2})-\d{2}_TO_(\d{4})-(\d{2})-\d{2}/.exec(u);
    if (m && m[1] + m[2] === m[3] + m[4]) return [m[1] + '-' + m[2]];
    return [];
  }

  function classify(name, sheets) {
    var names = sheets.map(function (s) { return s.name; });
    if (names.some(function (n) { return /^Section .* in GSTR-(1|8)$/i.test(n); })) return { type: 'FK_GST', months: nameMonths(name) };
    if (names.indexOf('B2C Small') >= 0 && names.indexOf('HSN Summary') >= 0) return { type: 'AMZ_GSTR1', months: nameMonths(name) };
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i], mo;
      if (has(sh, ['sub_order_num', 'end_customer_state_new', 'total_taxable_sale_value'])) {
        mo = meeshoMonth(sh);
        var ret = has(sh, ['cancel_return_date']), ms = colSum(sh, 'total_taxable_sale_value');
        return { type: ret ? 'MEESHO_RET' : 'MEESHO_SALE', months: mo ? [mo] : [], taxable: ms == null ? null : ret ? -ms : ms };
      }
      if (has(sh, ['suborder no.', 'invoice no.'])) { mo = colMonth(sh, 'order date'); return { type: 'MEESHO_INV', months: mo ? [mo] : [] }; }
      if (has(sh, ['transaction type', 'ship to state', 'tax exclusive gross'])) {
        mo = colMonth(sh, 'invoice date') || nameMonths(name)[0];
        return { type: has(sh, ['customer bill to gstid']) ? 'AMZ_B2B' : 'AMZ_B2C', months: mo ? [mo] : [], taxable: colSum(sh, 'tax exclusive gross') };
      }
      if (has(sh, ['event type', 'buyer invoice id'])) { mo = colMonth(sh, 'buyer invoice date') || colMonth(sh, 'order date'); return { type: 'FK_SALES', months: mo ? [mo] : [], taxable: colSum(sh, /^taxable value/) }; }
    }
    return { type: '', months: [] };
  }

  /* file -> Promise<[{file, type, months, label}]>  (a ZIP gives one entry per report inside;
     PDFs and other files inside a ZIP are skipped) */
  function inspect(file) {
    var e = ext(file.name);
    if (e === 'zip') {
      return Promise.all([load(JSZIP_URL), load(XLSX_URL)]).then(function () { return JSZip.loadAsync(file); }).then(function (zip) {
        var items = [];
        zip.forEach(function (path, entry) { if (!entry.dir && /\.(xlsx|xls|csv)$/i.test(path) && !/(^|\/)(__MACOSX|~\$)/.test(path)) items.push(entry); });
        return Promise.all(items.map(function (entry) {
          var nm = entry.name.split('/').pop();
          return entry.async('arraybuffer').then(function (buf) {
            var f = new File([buf], nm, { type: nm.toLowerCase().slice(-4) === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            return one(f, buf);
          });
        })).then(function (list) { return { zip: true, items: list, skipped: 0 }; });
      });
    }
    if (['xlsx', 'xls', 'csv'].indexOf(e) < 0) return Promise.resolve({ zip: false, items: [{ file: file, type: '', months: [], label: '', plain: true }] });
    return load(XLSX_URL).then(function () { return file.arrayBuffer(); }).then(function (buf) { return one(file, buf); })
      .then(function (it) { return { zip: false, items: [it] }; });
  }
  function one(file, buf) {
    var r;
    try { r = classify(file.name, readSheets(buf, ext(file.name) === 'csv')); } catch (er) { r = { type: '', months: [] }; }
    return { file: file, type: r.type, months: r.months, label: r.type ? TYPES[r.type][2] : '', taxable: r.taxable == null ? null : r.taxable };
  }

  return { TYPES: TYPES, inspect: inspect };
})();
