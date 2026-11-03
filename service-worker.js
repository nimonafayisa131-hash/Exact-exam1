/* =====================================================================
   SERVICE WORKER — WDDBA Exam System
   Hojii isaa: app-iin interneetii malee banamee hojjachuu akka danda'u
   gochuuf faayilota hunda (fi CDN library'oota) device irratti kuusa.

   Akkamitti hojjata:
   1. Install yeroo (Install gochuuf): faayilota hunda cache keessatti kuusa.
   2. Faayila isaa dhuunfaa (index.html, script.js, style.css):
      "network-first" — interneetiin yoo jiraate haaraa fidu; yoo hin jirre
      cache irraa ba'a.
   3. Library CDN (Firebase, pdf.js, Fonts): "cache-first" — al tokko
      download ta'e booda internet malee ni hojjata.
   4. Firebase DATA (firebaseio.com): asitti hin tuqamu. script.js ofii isaa
      offline queue fi localStorage'n qabata.

   Faayilota irra deebi'ee update gochuuf: CACHE_VERSION gara 'v2', 'v3'...
   jijjiiri — cache moofaan ofumaan haqama.
   ===================================================================== */

const CACHE_VERSION = 'v1';
const APP_CACHE = 'wddba-exam-app-' + CACHE_VERSION;   // faayilota app
const CDN_CACHE = 'wddba-exam-cdn-' + CACHE_VERSION;   // library alaa

// Faayilota app dhuunfaa (sirrii fakkaatu)
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './logo1.jpg'            // yoo hin jiraanne rakkoo hin uumu (gad jala ilaali)
];

// Library CDN — index.html keessatti fayyadamaman wajjin tokko ta'uu qaba
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-database-compat.js',
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap'
];

// ---------- INSTALL: faayilota hunda duraan kuusa ----------
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const appCache = await caches.open(APP_CACHE);
    // Faayila tokko tokko kuusuun yoo hafe (fkn. logo1.jpg hin jiru),
    // kaan hin dhaabu — tokko tokkoon kuusa.
    await Promise.all(APP_FILES.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await appCache.put(url, res);
      } catch (e) { /* ifuma hin ta'u */ }
    }));

    const cdnCache = await caches.open(CDN_CACHE);
    await Promise.all(CDN_FILES.map(async url => {
      try {
        // no-cors: <script> tag'n alaa fayyadamu waan ta'eef opaque response ni kuusama
        const res = await fetch(url, { mode: 'no-cors' });
        await cdnCache.put(url, res);
      } catch (e) { /* internet hin jiru — yeroo itti aanu runtime keessatti kuusama */ }
    }));

    await self.skipWaiting();
  })());
});

// ---------- ACTIVATE: cache moofaa haqa ----------
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, CDN_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith('wddba-exam-') && !keep.includes(k))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---------- FETCH ----------
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // POST/PUT/DELETE: hin tuqamu

  const url = new URL(req.url);

  // Firebase DATA (database): hin tuqamu — script.js ofii isaa offline qabata
  if (url.hostname.endsWith('firebaseio.com') ||
      url.hostname.endsWith('firebasedatabase.app') ||
      url.hostname === 'www.googleapis.com' ||
      url.hostname === 'firebase.googleapis.com') {
    return;
  }

  // Faayilota app (domain tokko)
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Library CDN fi Fonts
  if (url.hostname === 'cdnjs.cloudflare.com' ||
      url.hostname === 'www.gstatic.com' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
  }
});

// Network-first: internet yoo jiraate haaraa fidi (seekondii 4 booda cache fayyadami)
async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetchWithTimeout(req, 4000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    // Navigation (fuula banuu) yoo hin argamne index.html kenni
    if (req.mode === 'navigate') {
      const home = await cache.match('./index.html') || await cache.match('./');
      if (home) return home;
    }
    return new Response('Offline — faayilli kun hin kuufamne.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache-first: cache keessa yoo jiraate sana kenni; yoo hin jirre fidi fi kuusi
async function cacheFirst(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    // opaque (no-cors) response status 0 dha — ammas kuusuun ni danda'ama
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 503 });
  }
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(res => { clearTimeout(timer); resolve(res); },
                    err => { clearTimeout(timer); reject(err); });
  });
}
