/* ============================================================
   Vishal Accounting Services – GST Data Collection : BACKEND
   Google Apps Script Web App. Files go to Google Drive:
     GST DATA COLLECTION / <Firm GSTIN> / <Period> / <Platform> / file
   Database = db.json in the same Drive folder.
   Needs Core.gs = exact copy of app/core.js.
   Script Properties (Project Settings → Script properties):
     ADMIN_KEY    – password for admin.html (setup() creates one)
     ADMIN_EMAIL  – where "डेटा आ गया / NIL / पेमेंट" emails go (optional)
     APP_URL      – GitHub Pages link of the client app (for notification click)
     FCM_SA       – Firebase service-account JSON (optional, for push notifications)
   ============================================================ */
var PROPS = PropertiesService.getScriptProperties();
var ROOT_NAME = 'GST DATA COLLECTION';

/* ---------- one-time setup: Run ▶ setup ---------- */
function setup() {
  var root = rootFolder();
  dbFile();
  if (!PROPS.getProperty('ADMIN_KEY')) PROPS.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  if (!PROPS.getProperty('ADMIN_EMAIL')) PROPS.setProperty('ADMIN_EMAIL', Session.getEffectiveUser().getEmail());
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyTick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyTick').timeBased().everyDays(1).atHour(9).inTimezone('Asia/Kolkata').create();
  Logger.log('Drive folder: ' + root.getUrl());
  Logger.log('ADMIN_KEY: ' + PROPS.getProperty('ADMIN_KEY'));
  Logger.log('अब Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) करें.');
}

/* ---------- web endpoints ---------- */
function doGet() { return json({ ok: true, app: 'Vishal GST Data', v: Core.VERSION }); }
function doPost(e) {
  var q;
  try { q = JSON.parse(e.postData.contents); } catch (x) { return json({ ok: false, error: 'Bad request' }); }
  return json(run(function (db, ctx) { return Core.handle(db, q, ctx); }));
}
function dailyTick() {
  run(function (db, ctx) { Core.tick(db, ctx, false); return { out: {}, dirty: true }; });
}

function run(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'सर्वर व्यस्त है – थोड़ी देर में फिर कोशिश करें' };
  var ctx = makeCtx(), res;
  try {
    var db = loadDb();
    res = fn(db, ctx);
    if (res.dirty) saveDb(db);
  } finally { lock.releaseLock(); }
  flush(ctx);                       // push + email after the lock is released
  return res.out;
}

/* ---------- storage ---------- */
function rootFolder() {
  var id = PROPS.getProperty('ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(ROOT_NAME), f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  PROPS.setProperty('ROOT_ID', f.getId());
  return f;
}
function dbFile() {
  var id = PROPS.getProperty('DB_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (e) {} }
  var f = rootFolder().createFile('db.json', JSON.stringify(Core.newDb()), 'application/json');
  PROPS.setProperty('DB_ID', f.getId());
  return f;
}
function loadDb() { return JSON.parse(dbFile().getBlob().getDataAsString('UTF-8')); }
function saveDb(db) {
  var f = dbFile(), today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  if (PROPS.getProperty('BACKUP_DAY') !== today) {          // one backup copy per day
    var bk = subFolder(rootFolder(), '_backup');
    f.makeCopy('db_' + today + '.json', bk);
    PROPS.setProperty('BACKUP_DAY', today);
    var old = bk.getFiles(), list = [];
    while (old.hasNext()) list.push(old.next());
    list.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; }).slice(60).forEach(function (x) { x.setTrashed(true); });
  }
  f.setContent(JSON.stringify(db));
}
function subFolder(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

/* ---------- ctx for Core ---------- */
function makeCtx() {
  var ctx = { now: new Date(), _push: [], _mail: [] };
  ctx.uuid = function () { return Utilities.getUuid(); };
  ctx.adminKeyOk = function (k) { var a = PROPS.getProperty('ADMIN_KEY'); return !!a && k === a; };
  ctx.saveFile = function (meta, b64) {
    var folder = rootFolder();
    meta.folders.forEach(function (n) { folder = subFolder(folder, n); });
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), meta.mime, meta.name);
    var f = folder.createFile(blob);
    return { fileId: f.getId(), url: f.getUrl() };
  };
  ctx.deleteFile = function (id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} };
  ctx.push = function (tokens, title, body) { ctx._push.push({ tokens: tokens.slice(), title: title, body: body }); };
  ctx.notifyAdmin = function (kind, title, body) { if (kind !== 'TICK') ctx._mail.push({ title: title, body: body }); };
  return ctx;
}
function flush(ctx) {
  var to = PROPS.getProperty('ADMIN_EMAIL');
  if (to && ctx._mail.length) {
    try {
      var subj = ctx._mail.length === 1 ? ctx._mail[0].title : ctx._mail.length + ' नई सूचनाएँ – GST Data';
      MailApp.sendEmail(to, '[VAS] ' + subj, ctx._mail.map(function (m) { return m.title + '\n' + m.body; }).join('\n\n'));
    } catch (e) { console.warn('mail', e); }
  }
  if (ctx._push.length && PROPS.getProperty('FCM_SA')) {
    try { sendPushes(ctx._push); } catch (e) { console.warn('push', e); }
  }
}

/* ---------- Firebase Cloud Messaging (HTTP v1) ---------- */
function fcmToken(sa) {
  var cache = CacheService.getScriptCache(), hit = cache.get('fcm_at');
  if (hit) return hit;
  var now = Math.floor(Date.now() / 1000);
  var enc = function (o) { return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, ''); };
  var head = enc({ alg: 'RS256', typ: 'JWT' });
  var claim = enc({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + claim, sa.private_key)).replace(/=+$/, '');
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig } });
  var at = JSON.parse(r.getContentText()).access_token;
  cache.put('fcm_at', at, 3300);
  return at;
}
function sendPushes(list) {
  var sa = JSON.parse(PROPS.getProperty('FCM_SA')), at = fcmToken(sa), link = PROPS.getProperty('APP_URL') || '';
  var reqs = [];
  list.forEach(function (p) {
    p.tokens.forEach(function (t) {
      reqs.push({
        url: 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + at }, muteHttpExceptions: true,
        payload: JSON.stringify({ message: { token: t, webpush: { notification: { title: p.title, body: p.body, icon: link ? link + 'icon-192.png' : undefined }, fcm_options: link ? { link: link } : undefined } } })
      });
    });
  });
  for (var i = 0; i < reqs.length; i += 50) UrlFetchApp.fetchAll(reqs.slice(i, i + 50));
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
