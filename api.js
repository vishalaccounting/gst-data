/* Transport: Google Apps Script backend, or a DEMO backend that runs Core in this browser. */
var API = (function () {
  var DEMO = !CONFIG.API_URL || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);   // local testing never touches the live server

  /* ---------- demo backend (localStorage db + IndexedDB files) ---------- */
  var DB_KEY = 'vas_demo_db';
  function idb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('vas_demo_files', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('f'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbDo(mode, fn) {
    return idb().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('f', mode), st = tx.objectStore('f'), out = fn(st);
        tx.oncomplete = function () { res(out && out.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function demoCall(q) {
    var db;
    try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { db = null; }
    if (!db) db = Core.newDb();
    var pending = [];
    var ctx = {
      now: new Date(), uuid: uuid,
      saveFile: function (meta, b64) {
        var id = 'demo-' + uuid();
        pending.push(idbDo('readwrite', function (st) { return st.put({ meta: meta, b64: b64 }, id); }));
        return { fileId: id, url: 'demo:' + id };
      },
      deleteFile: function (id) { if (id) pending.push(idbDo('readwrite', function (st) { return st.delete(id); })); },
      push: function (tokens, title, body) { console.log('[demo push]', title, body); },
      notifyAdmin: function (kind, title, body) { console.log('[demo admin]', kind, title, body); },
      adminKeyOk: function (k) { return k === 'admin'; }
    };
    var r = Core.handle(db, q, ctx);
    if (r.dirty) localStorage.setItem(DB_KEY, JSON.stringify(db));
    return Promise.all(pending).then(function () { return r.out; });
  }

  /* ---------- real backend ---------- */
  function remoteCall(q) {
    return fetch(CONFIG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // simple request → no CORS preflight
      body: JSON.stringify(q)
    }).then(function (r) {
      if (!r.ok) throw new Error('सर्वर से जवाब नहीं मिला (' + r.status + ')');
      return r.json();
    }, function () { throw new Error('इंटरनेट कनेक्शन जाँचें'); });
  }

  function call(action, params) {
    var q = Object.assign({ action: action }, params || {});
    return (DEMO ? demoCall(q) : remoteCall(q)).then(function (out) {
      if (!out.ok) { var e = new Error(out.error); e.code = out.error; throw e; }
      return out.data;
    });
  }

  // demo only: get an uploaded file back as a Blob (real mode uses Google Drive links)
  function demoFile(id) {
    return idbDo('readonly', function (st) { return st.get(id); }).then(function (rec) {
      if (!rec) throw new Error('फाइल नहीं मिली');
      var bin = atob(rec.b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return { name: rec.meta.name, blob: new Blob([arr], { type: rec.meta.mime }) };
    });
  }

  function fileToB64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { rej(new Error('फाइल पढ़ी नहीं जा सकी')); };
      fr.readAsDataURL(file);
    });
  }

  return { DEMO: DEMO, call: call, demoFile: demoFile, fileToB64: fileToB64 };
})();
