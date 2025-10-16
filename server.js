// server.js (Node.jsの例 - 簡易化のためエラー処理などは省略)
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// VAPIDキーを生成して使用
const publicVapidKey = 'YOUR_PUBLIC_VAPID_KEY_HERE'; // 実際のキーに置き換える
const privateVapidKey = 'YOUR_PRIVATE_VAPID_KEY_HERE'; // 実際のキーに置き換える

webpush.setVapidDetails(
    'mailto:you@example.com', // 連絡先メールアドレス
    publicVapidKey,
    privateVapidKey
);

// 購読情報を保存するリスト（本番ではDBを使用）
let subscriptions = [];

// 購読APIエンドポイント
app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    subscriptions.push(subscription);
    res.status(201).json({});
});

// 通知送信APIエンドポイント (フロントエンドから画像変化があった時に呼ばれる)
app.post('/notify', (req, res) => {
    const notificationPayload = JSON.stringify({
        title: '警告：人物の映り込みを検出しました！',
        options: {
            body: '設定された領域で動きが検出されました。',
            data: {
                url: req.body.url || 'https://www.google.com/' // カスタムURL
            }
        }
    });

    // 全ての購読者に通知を送信
    subscriptions.forEach(subscription => {
        webpush.sendNotification(subscription, notificationPayload)
            .catch(error => console.error('Push notification failed:', error));
    });

    res.status(200).json({ message: 'Notification sent' });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));