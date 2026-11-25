/* Service worker: offline shell + auto-update + (optional) Firebase push.
   Network-first: whenever the phone is online it loads the newest files from GitHub Pages,
   so every push to GitHub reaches all clients automatically. Bump CACHE on each release. */
var CACHE = 'vas-gst-1.11.2';
var SHARE = 'vas-share';   // files shared to the app (WhatsApp → Share → Vishal GST), read by index.html
var OFFICE = 'vas-office'; // v1.11: office.html puts 'flag' here on the office phone → shared files open office.html instead
var SHELL = ['./', 'index.html', 'office.html','core.js', 'api.js', 'detect.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== SHARE && k !== OFFICE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (url.origin === self.location.origin && /\/share-target\/?$/.test(url.pathname)) {
    e.respondWith(req.method === 'POST' ? takeShare(req) : Response.redirect(new URL('index.html', self.registration.scope).href, 303));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // cache:'no-cache' = always ask GitHub if the file changed (Pages sets max-age=600)
  e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(function (res) {
    var copy = res.clone();
    if (res.ok) caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); }); }));
});

/* ---- share target: Android share sheet POSTs the files here (manifest share_target).
   They are parked in the SHARE cache and the app opens with ?share=1 to ask which slot they go in. ---- */
function takeShare(req) {
  var flag = null, got = 0;
  return caches.open(OFFICE).then(function (c) { return c.match('flag'); }).catch(function () { return null; }).then(function (f) { flag = f; return req.formData(); }).then(function (fd) {
    var files = fd.getAll('files').filter(function (f) { return f && typeof f !== 'string' && f.size; });
    got = files.length;
    // v1.11.1 office phone: WhatsApp shares one document at a time, so shares within 30 min are collected in one basket
    var old = flag ? caches.open(SHARE).then(function (c) { return c.match('share/list'); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null);
    return old.then(function (prev) {
      var start = Date.now();
      // v1.11.2: every file carries its own share time (office.html leaves files of an older share unticked)
      var keep = (prev && start - prev.at < 30 * 60000 ? prev.files : []).map(function (x) { return x.at ? x : Object.assign({ at: prev.at }, x); });
      if (flag && !files.length) return null;   // nothing readable came: leave the basket as it is, the page says so (n=0)
      var list = files.map(function (f, i) { return { k: 'f' + start + '_' + i, name: f.name || ('file-' + (i + 1)), type: f.type || '', size: f.size, at: start }; });
      // the same file shared again (double tap / shared twice) replaces the earlier copy
      keep = keep.filter(function (x) { return !list.some(function (n) { return n.name === x.name && n.size === x.size; }); });
      return (keep.length ? caches.open(SHARE) : caches.delete(SHARE).then(function () { return caches.open(SHARE); })).then(function (c) {
        return Promise.all(files.map(function (f, i) { return c.put('share/' + list[i].k, new Response(f)); }))
          .then(function () { return c.put('share/list', new Response(JSON.stringify({ at: start, files: keep.concat(list) }))); });
      });
    });
  }).catch(function () {})
    .then(function () { return Response.redirect(new URL(flag ? 'office.html?share=1&n=' + got : 'index.html?share=1', self.registration.scope).href, 303); });
}

/* ---- push ---- */
try { importScripts('config.js'); } catch (e) {}
if (self.CONFIG && CONFIG.FIREBASE) {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp(CONFIG.FIREBASE);
  firebase.messaging();   // FCM shows "webpush.notification" messages by itself
}
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].focus();
    return self.clients.openWindow('./');
  }));
});
