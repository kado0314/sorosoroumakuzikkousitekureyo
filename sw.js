// sw.js
self.addEventListener('push', function(event) {
    const data = event.data.json().options;
    const title = event.data.json().title;
    
    event.waitUntil(
        self.registration.showNotification(title, {
            body: data.body,
            icon: '/icon.png', // 通知に表示するアイコン
            data: data.data // クリック時に使用するカスタムデータ（URLなど）
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    const notificationData = event.notification.data;
    event.notification.close();

    // 通知に設定したURLを取得（デフォルトはGoogle）
    const targetUrl = notificationData.url || 'https://www.google.com/';

    // 新しいウィンドウ/タブでURLを開く
    event.waitUntil(
        clients.openWindow(targetUrl)
    );
});