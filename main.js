// main.js (主要ロジック - 簡易化版)

// --- Service Worker & Push 通知の購読 ---
function urlBase64ToUint8Array(base64String) {
    // VAPIDキーをUint8Arrayに変換するユーティリティ関数
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('sw.js')
        .then(registration => {
            console.log('Service Worker registered!');
            return registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        })
        .then(subscription => {
            console.log('Push subscribed:', subscription);
            // サーバーに購読情報を送信
            fetch('/subscribe', {
                method: 'POST',
                body: JSON.stringify(subscription),
                headers: { 'content-type': 'application/json' }
            });
        })
        .catch(error => console.error('Push subscription failed:', error));
}

// --- Webカメラと画像処理 ---
const video = document.getElementById('webcamVideo');
const canvas = document.getElementById('processingCanvas');
const ctx = canvas.getContext('2d');
let lastFrameData = null; // 基準フレームを保存

// Webカメラ起動
document.getElementById('startButton').addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                // 監視処理を開始
                startMonitoring();
            };
        })
        .catch(err => console.error("Webカメラアクセスエラー:", err));
});

function startMonitoring() {
    let monitoringInterval = setInterval(processFrame, 100); // 100ms (10FPS)で処理
    document.getElementById('stopButton').addEventListener('click', () => {
        clearInterval(monitoringInterval);
        // ストリームの停止処理もここに入れる
    }, { once: true });
}

function processFrame() {
    // 映像をCanvasに描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (!lastFrameData) {
        // 最初のフレームを基準フレームとして保存
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        return;
    }

    // 簡易な差分検出ロジック
    let diffPixels = 0;
    const threshold = 50; // ユーザー設定の「レベル」（感度）に相当
    const areaMask = createMask(); // ユーザー設定の監視領域（マスク）を取得する関数

    // 全ピクセルをチェック
    for (let i = 0; i < currentFrameData.length; i += 4) {
        const x = (i / 4) % canvas.width;
        const y = Math.floor((i / 4) / canvas.width);

        // 監視領域外のピクセルはスキップ（ここでは簡略化のため、常に全画面チェック）
        // if (!areaMask[y][x]) continue; 

        // R, G, B値の差分合計
        const diffR = Math.abs(currentFrameData[i] - lastFrameData[i]);
        const diffG = Math.abs(currentFrameData[i + 1] - lastFrameData[i + 1]);
        const diffB = Math.abs(currentFrameData[i + 2] - lastFrameData[i + 2]);
        
        // 差分がしきい値を超えたら「変化あり」
        if (diffR + diffG + diffB > threshold * 3) {
            diffPixels++;
        }
    }

    // 変化したピクセル数が全体の一定割合を超えたら通知
    const totalPixels = (canvas.width * canvas.height);
    if (diffPixels / totalPixels > 0.005) { // 0.5%以上の変化で通知
        console.log("!!! 変化検出 !!!");
        triggerNotification();
    }

    // 現行フレームを次の比較のための基準フレームとして保存
    lastFrameData = new Uint8ClampedArray(currentFrameData);
}

function triggerNotification() {
    const url = document.getElementById('notificationUrl').value;
    
    // サーバーの通知APIを呼び出す
    fetch('/notify', {
        method: 'POST',
        body: JSON.stringify({ url: url }),
        headers: { 'content-type': 'application/json' }
    });
}

//  補足: 「自分以外」の映り込み処理について
// このロジックをTensorFlow.jsなどを使った物体認識/顔認識に置き換えるには、
// 非常に複雑なAIモデルの組み込みと学習処理が必要になります。処理負荷も高くなります。