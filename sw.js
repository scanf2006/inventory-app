// Service Worker - inventory-app
// Version driven by cache name; update on each release
const CACHE_NAME = 'inv-aiden-v3.1.27';
const OPTIONAL_CACHE_NAME = 'inv-aiden-opt-v1';
const CRITICAL_ASSETS = [
    '/',
    '/index.html',
    '/src/main.js',
    '/src/app-v30.css',
    '/manifest.json',
    '/assets/icon.svg'
];
const OPTIONAL_ASSETS = [
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2'
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
    const fullUrl = event.request.url;

    // Critical assets: Network-first with cache fallback (stale-while-revalidate)
    if (CRITICAL_ASSETS.includes(path)) {
        event.respondWith(
            fetch(event.request).then(response => {
                // Successfully fetched from network, update cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            }).catch(() => {
                // Network failed, fall back to cache
                return caches.match(event.request);
            })
        );
    } else if (OPTIONAL_ASSETS.includes(fullUrl) || OPTIONAL_ASSETS.includes(path)) {
        // Optional/CDN assets: Cache-first with network fallback (less critical)
        event.respondWith(
            caches.open(OPTIONAL_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    return cachedResponse || fetch(event.request).then(response => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
    }
});