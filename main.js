// main.js

// DOM要素の取得
const video = document.getElementById('webcamVideo');
const canvas = document.getElementById('processingCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValueSpan = document.getElementById('thresholdValue');

let lastFrameData = null; // 基準フレームのピクセルデータを格納
let monitoringInterval = null; // 監視処理のインターバルID
let isMonitoring = false; // 監視状態フラグ

// 感度レベルスライダーの更新
thresholdSlider.addEventListener('input', () => {
    thresholdValueSpan.textContent = thresholdSlider.value;
});

// =================================================================
// 通知機能 (Notification API)
// =================================================================

function showNotification(targetUrl) {
    // 1. デスクトップ通知の設定
    const notification = new Notification('🚨 警告：動きを検出しました！', {
        body: '設定領域で画像の変化を検出。画面を確認してください。',
        icon: 'https://via.placeholder.com/128' // 適切なアイコンURLに置き換えてください
    });

    // 2. 通知クリック時のイベントハンドラを設定
    notification.onclick = function() {
        // 事前に登録したURLに遷移 (新しいウィンドウ/タブで開く)
        window.open(targetUrl, '_blank');
        notification.close();
    };
}

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
    // 'denied'（拒否）の場合は何もしない
}

// =================================================================
// 監視ロジック
// =================================================================

// Webカメラの起動
startButton.addEventListener('click', () => {
    if (isMonitoring) return;

    // 通知許可を事前に確認/要求
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Webカメラへのアクセス要求
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                startMonitoring();
                startButton.disabled = true;
                stopButton.disabled = false;
            };
        })
        .catch(err => {
            console.error("Webカメラアクセスエラー:", err);
            alert("Webカメラへのアクセスを許可してください。");
        });
});

// 監視の停止
stopButton.addEventListener('click', () => {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    if (video.srcObject) {
        // ストリームの停止
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    lastFrameData = null;
    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
});

function startMonitoring() {
    isMonitoring = true;
    lastFrameData = null; // 監視開始時に基準フレームをリセット

    // 100ms（1秒間に10回）間隔でフレームを処理
    monitoringInterval = setInterval(processFrame, 100); 
}

function processFrame() {
    if (!isMonitoring) return;

    // 映像をCanvasに描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (!lastFrameData) {
        // 最初のフレームを基準フレームとして保存し、処理を終了
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        console.log("監視を開始しました。");
        return;
    }

    // 感度レベルの取得 (ユーザー設定)
    const pixelChangeThreshold = parseInt(thresholdSlider.value); // 10〜100

    let diffPixels = 0;
    const totalPixels = (canvas.width * canvas.height);

    // 全ピクセルをチェック
    for (let i = 0; i < currentFrameData.length; i += 4) {
        // R, G, B値の差分合計
        const diffR = Math.abs(currentFrameData[i] - lastFrameData[i]);
        const diffG = Math.abs(currentFrameData[i + 1] - lastFrameData[i + 1]);
        const diffB = Math.abs(currentFrameData[i + 2] - lastFrameData[i + 2]);
        
        // 差分がしきい値を超えたら「変化あり」
        // しきい値の最大値はR/G/Bそれぞれ255*3 = 765
        if (diffR + diffG + diffB > pixelChangeThreshold * 7.65) { // 7.65を乗じて 10(低感度)〜765(高感度)に調整
            diffPixels++;
        }
    }

    // 変化したピクセル数が全体の一定割合を超えたら通知
    const changePercentage = diffPixels / totalPixels;
    if (changePercentage > 0.005) { // 例: 全体の0.5%以上のピクセルが変化したら
        console.log(`!!! 変化検出: ${Math.round(changePercentage * 1000) / 10}% !!!`);
        triggerNotificationLocal(); 

        // 通知後、直後のフレームを新しい基準として保存し、通知の連続を防ぐ（シンプルな制御）
        lastFrameData = new Uint8ClampedArray(currentFrameData);
    } else {
        // 変化が少なければ、現行フレームを次の比較のための基準フレームとして保存
        lastFrameData = new Uint8ClampedArray(currentFrameData);
    }
}
