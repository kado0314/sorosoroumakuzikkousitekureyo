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
const cooldownTimeSecInput = document.getElementById('cooldownTimeSec'); // 🌟 追加: クールダウン設定
const statusDisplay = document.getElementById('statusDisplay');         // 🌟 追加: ステータス表示


let lastFrameData = null;
let monitoringInterval = null;
let isMonitoring = false;
let chartInstance = null;

let lastNotificationTime = 0;
// 以前の固定値は削除し、cooldownTimeSecInputから動的に取得します

let hasNotifiedSinceStart = false; 

const MAX_DATA_POINTS = 50;


// =================================================================
// ユーティリティ/UI表示
// =================================================================

// 🌟 新規追加: ステータス表示を更新する関数 🌟
function updateStatusDisplay(isCooldown = false) {
    if (!isMonitoring) {
        statusDisplay.textContent = '監視停止中です';
        statusDisplay.classList.remove('cooldown-active');
        return;
    }
    
    if (hasNotifiedSinceStart) {
        statusDisplay.textContent = '!!! 検出済み - 監視を停止してください !!!';
        statusDisplay.classList.add('cooldown-active');
        return;
    }

    if (isCooldown) {
        const cooldownTime = parseInt(cooldownTimeSecInput.value) || 5;
        const elapsed = Date.now() - lastNotificationTime;
        const remaining = Math.max(0, cooldownTime * 1000 - elapsed);
        
        statusDisplay.textContent = `通知クールダウン中... (${(remaining / 1000).toFixed(1)}秒 残り)`;
        statusDisplay.classList.add('cooldown-active');
    } else {
        statusDisplay.textContent = '監視中 - 変化を検出していません';
        statusDisplay.classList.remove('cooldown-active');
    }
}


// グラフ関連 (変更なし)
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

function initializeChart(initialThreshold) {
    if (chartInstance) chartInstance.destroy();
    
    const ctxChart = document.getElementById('changeChart').getContext('2d');
    const thresholdLineValue = initialThreshold;
    // ... (Chart.js設定は変更なし) ...
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

    notification.onclick = function() {
        notification.close();
        
        const selectedAction = document.querySelector('input[name="openAction"]:checked').value;
        
        if (selectedAction === 'window') {
            window.open(targetUrl, 'NotificationWindow', 'width=800,height=600,noopener=yes');
        } else {
            window.open(targetUrl, '_blank');
        }
    };
}

function triggerNotificationLocal() {
    // 🌟 一度通知済みなら即座に終了 (完全停止ロジック) 🌟
    if (hasNotifiedSinceStart) {
        updateStatusDisplay(false); // 停止表示に切り替え
        return;
    }
    
    const currentTime = Date.now();
    // 🌟 修正: ユーザー設定のクールダウン時間を取得 🌟
    const cooldownTimeSec = parseInt(cooldownTimeSecInput.value) || 5;
    const cooldownTimeMS = cooldownTimeSec * 1000;

    // クールダウンチェック
    if (currentTime - lastNotificationTime < cooldownTimeMS) {
        updateStatusDisplay(true); // クールダウン中表示に切り替え
        return; 
    }

    const notificationUrl = document.getElementById('notificationUrl').value || 'https://www.google.com/';

    // 通知を送信し、フラグを立てるためのヘルパー関数
    const sendAndSetFlag = () => {
        showNotification(notificationUrl);
        lastNotificationTime = currentTime;
        // hasNotifiedSinceStart = true; // 連続通知を停止するロジックは無効化
        console.log(`!!! 通知を送信しました。次の通知まで${cooldownTimeSec}秒間クールダウンします。 !!!`);
    };

    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                sendAndSetFlag();
            }
        });
    } else if (Notification.permission === 'granted') {
        sendAndSetFlag();
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
    hasNotifiedSinceStart = false; 
    updateStatusDisplay(); // 停止表示に更新
});

function startMonitoring() {
    isMonitoring = true;
    lastFrameData = null;
    lastNotificationTime = 0;
    hasNotifiedSinceStart = false; 
    monitoringInterval = setInterval(processFrame, 100); 
    updateStatusDisplay(); // 監視中表示に更新
}

function processFrame() {
    if (!isMonitoring) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (!lastFrameData) {
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        updateStatusDisplay(false); // 監視中表示を維持
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
    
    // 🌟 クールダウン表示の更新 🌟
    const cooldownTimeSec = parseInt(cooldownTimeSecInput.value) || 5;
    const cooldownTimeMS = cooldownTimeSec * 1000;
    const isCooldownActive = Date.now() - lastNotificationTime < cooldownTimeMS;

    if (averageChangeMagnitude > thresholdValue) {
        if (!isCooldownActive) {
            console.log(`>>> 通知トリガー発動!`);
            triggerNotificationLocal(); 
        } else {
            // トリガー条件は満たしているがクールダウン中
            updateStatusDisplay(true); 
        }

        lastFrameData = new Uint8ClampedArray(currentFrameData);
    } else {
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        // クールダウン中でない、またはクールダウンが終了したばかりなら、通常の監視中に戻す
        if (!isCooldownActive && isMonitoring) {
            updateStatusDisplay(false);
        } else if (isCooldownActive) {
             updateStatusDisplay(true); // クールダウン中を維持
        }
    }
}
