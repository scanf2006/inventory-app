const CACHE_NAME = 'inv-aiden-v3.1.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './src/main.js?v=3.1.0',
    './src/app-v30.css?v=3.1.0',
    './manifest.json',
    './assets/icon.svg',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
    // 强制新 SW 立刻接管控制
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    // 立即接管客户端，使旧缓存得以在无刷新的情况下被丢弃
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // 可选：离线降级页面返回
            });
        })
    );
});
