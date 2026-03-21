// Improved Service Worker Implementation
// Version: 2026-03-21 17:07:07 UTC

const CACHE_NAME = 'app-cache-v1';
const OPTIONAL_CACHE_NAME = 'optional-cache-v1';
const CRITICAL_ASSETS = [
    'index.html',
    'styles.css',
    'main.js'
];
const OPTIONAL_ASSETS = [
    'image1.png',
    'image2.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching critical assets');
            return cache.addAll(CRITICAL_ASSETS);
        })
    );
    // Skip waiting to activate the service worker immediately
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
});

self.addEventListener('fetch', event => {
    // Handle critical asset requests
    if (CRITICAL_ASSETS.includes(new URL(event.request.url).pathname)) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    console.log('[Service Worker] Found in cache:', event.request.url);
                    return cachedResponse;
                }
                return fetch(event.request).then(response => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                });
            })
        );
    } else if (OPTIONAL_ASSETS.includes(new URL(event.request.url).pathname)) {
        // Handle the optional assets
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