// main.js に追加するローカル通知処理
function triggerNotificationLocal() {
    const notificationUrl = document.getElementById('notificationUrl').value || 'https://www.google.com/';

    // 1. ユーザーに通知の許可を求める（一度だけ必要）
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(notificationUrl);
            }
        });
    } else if (Notification.permission === 'granted') {
        // 2. 許可済みであれば通知を表示
        showNotification(notificationUrl);
    }
    // 'denied'（拒否）の場合は通知を表示しない
}

function showNotification(targetUrl) {
    // 3. デスクトップ通知の設定
    const notification = new Notification('🚨 警告：動きを検出しました！', {
        body: '設定された監視領域で画像の変化を検出。画面を確認してください。',
        icon: '/icon.png' // 通知に表示するアイコン
    });

    // 4. 通知クリック時のイベントハンドラを設定
    notification.onclick = function() {
        // 事前に登録したURLに遷移
        window.open(targetUrl, '_blank'); // 新しいGoogleウィンドウを開く処理
        notification.close();
    };
}
