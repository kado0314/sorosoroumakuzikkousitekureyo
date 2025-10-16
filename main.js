// main.js

// DOM要素の取得
const video = document.getElementById('webcamVideo');
const canvas = document.getElementById('processingCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValueSpan = document.getElementById('thresholdValue');
const notificationTitleInput = document.getElementById('notificationTitle');
const notificationBodyInput = document.getElementById('notificationBody');

let lastFrameData = null;
let monitoringInterval = null;
let isMonitoring = false;
let chartInstance = null;

let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN_MS = 5000; // 5秒間隔

const MAX_DATA_POINTS = 50;


// =================================================================
// UI/チャート関連
// =================================================================

// 感度レベルスライダーの更新とグラフ更新
thresholdSlider.addEventListener('input', () => {
    const value = parseInt(thresholdSlider.value);
    thresholdValueSpan.textContent = value;
    if (chartInstance) {
        const newThreshold = value;
        const dataSet = chartInstance.data.datasets[0].data;
        chartInstance.data.datasets[1].data = Array(dataSet.length).fill(newThreshold);
        chartInstance.update();
    }
});

// グラフの初期化
function initializeChart(initialThreshold) {
    if (chartInstance) chartInstance.destroy();
    
    const ctxChart = document.getElementById('changeChart').getContext('2d');
    const thresholdLineValue = initialThreshold;

    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [{
                label: '平均ピクセル差分 (現在の変化)',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.2,
                fill: false,
                pointRadius: 0
            }, {
                label: '通知しきい値',
                data: Array(MAX_DATA_POINTS).fill(thresholdLineValue),
                borderColor: 'rgb(255, 99, 132)',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            animation: false,
            scales: {
                y: {
                    min: 0,
                    max: 200, 
                    title: {
                        display: true,
                        text: '平均ピクセル差分 (0-765)'
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}

// グラフデータの更新
function updateChart(averageChangeMagnitude) {
    if (!chartInstance) return;
    
    const dataSet = chartInstance.data.datasets[0].data;
    dataSet.push(averageChangeMagnitude);
    
    if (dataSet.length > MAX_DATA_POINTS) {
        dataSet.shift();
    }
    
    const currentThreshold = parseInt(thresholdSlider.value);
    chartInstance.data.datasets[1].data = Array(dataSet.length).fill(currentThreshold);
    
    chartInstance.update();
}


// =================================================================
// 通知機能 (Notification API)
// =================================================================

function showNotification(targetUrl) {
    const title = notificationTitleInput.value || '【通知タイトルなし】';
    const body = notificationBodyInput.value || '動きを検出しました。';

    const notification = new Notification(title, {
        body: body,
        icon: 'https://via.placeholder.com/128' 
    });

    // 🌟 修正: クリック時のアクションをユーザー選択に基づいて処理 🌟
    notification.onclick = function() {
        notification.close();
        
        // ユーザーの選択を読み取る
        const selectedAction = document.querySelector('input[name="openAction"]:checked').value;
        
        let target;
        if (selectedAction === 'window') {
            // 新しいウィンドウとして開くことをブラウザに推奨
            target = '_blank'; // ポップアップを許可しやすいよう、_blankを使用しつつサイズ指定などでウィンドウ感を出すことも可能ですが、ここではシンプルに
        } else {
            // 新しいタブとして開く
            target = '_blank';
        }
        
        // URLを開く。_blankは通常タブで開きますが、ウィンドウ名を設定することでウィンドウとして認識されやすくなります。
        // ここではtargetをシンプルに_blankとして、ブラウザのデフォルト処理に任せます。
        // ※「ウィンドウで開く」を確実に実行するには、window.open(url, 'WindowName', 'width=800,height=600')のように
        // 第3引数を使う必要がありますが、シンプルな切り替えのため、ここでは_blankで新しいタブ/ウィンドウを指示します。
        
        if (selectedAction === 'window') {
            // 新しいウィンドウとして開く (target nameで区別)
            window.open(targetUrl, 'NotificationWindow', 'width=800,height=600,noopener=yes');
        } else {
            // 新しいタブで開く
            window.open(targetUrl, '_blank');
        }
    };
    // 🌟 修正ここまで 🌟
}

function triggerNotificationLocal() {
    const currentTime = Date.now();
    if (currentTime - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) {
        console.log(`--- 通知クールダウン中 (${NOTIFICATION_COOLDOWN_MS / 1000}秒) ---`);
        return; 
    }

    const notificationUrl = document.getElementById('notificationUrl').value || 'https://www.google.com/';

    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(notificationUrl);
                lastNotificationTime = currentTime;
            }
        });
    } else if (Notification.permission === 'granted') {
        showNotification(notificationUrl);
        lastNotificationTime = currentTime;
    }
}


// =================================================================
// 監視ロジック
// =================================================================

startButton.addEventListener('click', () => {
    if (isMonitoring) return;

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    const initialThreshold = parseInt(thresholdSlider.value);
    initializeChart(initialThreshold);

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
            alert("Webカメラへのアクセスを許可してください。またはローカルサーバーからアクセスしてください。");
        });
});

stopButton.addEventListener('click', () => {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    lastFrameData = null;
    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    lastNotificationTime = 0;
});

function startMonitoring() {
    isMonitoring = true;
    lastFrameData = null;
    lastNotificationTime = 0;
    monitoringInterval = setInterval(processFrame, 100); 
}

function processFrame() {
    if (!isMonitoring) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (!lastFrameData) {
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        return;
    }

    let totalMagnitude = 0; 
    const pixelCount = (canvas.width * canvas.height);

    for (let i = 0; i < currentFrameData.length; i += 4) {
        const diffR = Math.abs(currentFrameData[i] - lastFrameData[i]);
        const diffG = Math.abs(currentFrameData[i + 1] - lastFrameData[i + 1]);
        const diffB = Math.abs(currentFrameData[i + 2] - lastFrameData[i + 2]);
        
        totalMagnitude += (diffR + diffG + diffB);
    }

    const averageChangeMagnitude = totalMagnitude / pixelCount;
    updateChart(averageChangeMagnitude); 

    const thresholdValue = parseInt(thresholdSlider.value);
    const difference = averageChangeMagnitude - thresholdValue;
    console.log(`平均変化: ${averageChangeMagnitude.toFixed(2)} | しきい値: ${thresholdValue} | 差: ${difference.toFixed(2)}`);
    
    if (averageChangeMagnitude > thresholdValue) {
        console.log(`>>> 通知トリガー発動!`);
        triggerNotificationLocal(); 

        lastFrameData = new Uint8ClampedArray(currentFrameData);
    } else {
        lastFrameData = new Uint8ClampedArray(currentFrameData);
    }
}
