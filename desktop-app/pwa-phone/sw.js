const CACHE_NAME = 'giduscan-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bỏ qua các request WebSocket hoặc phương thức không phải GET
  if (event.request.method !== 'GET' || event.request.url.startsWith('ws')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Trả về kết quả bình thường nếu online
        return response;
      })
      .catch(() => {
        // Fallback offline nếu mất mạng
        return caches.match(event.request) || caches.match('./');
      })
  );
});