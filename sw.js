// Service Worker - inventory-app
// Version driven by cache name; update on each release
const CACHE_NAME = 'inv-aiden-v3.8.51';
const CRITICAL_ASSETS = [
    '/',
    '/index.html',
    '/src/main.js',
    '/src/app-config.js',
    '/src/app-utils.js',
    '/src/app-ui.js',
    '/src/app-ui-desktop.js',
    '/src/app-sync.js',
    '/src/app-data.js',
    '/src/app-v30.css',
    '/src/styles/01-tokens-base.css',
    '/src/styles/02-layout.css',
    '/src/styles/03-components.css',
    '/src/styles/04-responsive.css',
    '/manifest.json',
    '/assets/icon.svg',
    '/assets/vendor/html2pdf-0.10.1.bundle.min.js',
    '/assets/vendor/supabase-2.45.1.js',
    '/assets/vendor/chart-4.4.7.umd.min.js',
    '/assets/vendor/chartjs-plugin-datalabels-2.2.0.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching critical assets');
            return cache.addAll(CRITICAL_ASSETS);
        })
    );
    // Activate immediately without waiting
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== OPTIONAL_CACHE_NAME) {
                        console.log('[Service Worker] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control of all clients immediately
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    const path = url.pathname;

    // Critical assets: Network-first with cache fallback
    // Use pathname (no query string) as canonical cache key to avoid
    // mismatch between pre-cached "/src/main.js" and runtime "src/main.js?v=3.1.27"
    if (CRITICAL_ASSETS.includes(path)) {
        // Build a canonical request without query parameters for cache operations
        const canonicalUrl = url.origin + path;
        const canonicalRequest = new Request(canonicalUrl);

        event.respondWith(
            fetch(event.request).then(response => {
                // Successfully fetched from network, store under canonical key
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(canonicalRequest, responseClone);
                });
                return response;
            }).catch(() => {
                // Network failed, look up by canonical key (ignores ?v= params)
                return caches.match(canonicalRequest);
            })
        );
    }
});












