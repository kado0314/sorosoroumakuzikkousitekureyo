// main.js

// DOM要素の取得
const video = document.getElementById('webcamVideo');
const canvas = document.getElementById('processingCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValueSpan = document.getElementById('thresholdValue');

let lastFrameData = null;      // 基準フレームのピクセルデータを格納
let monitoringInterval = null; // 監視処理のインターバルID
let isMonitoring = false;      // 監視状態フラグ
let chartInstance = null;      // Chart.js インスタンス
const MAX_DATA_POINTS = 50;    // グラフに表示するデータポイントの最大数
const SENSITIVITY_MULTIPLIER = 7.65; // しきい値の調整係数 (100 * 7.65 = 約765でRGB最大差分合計)
const NOTIFICATION_PIXEL_PERCENTAGE = 0.005; // 0.5%以上のピクセル変化で通知

// =================================================================
// UI/チャート関連
// =================================================================

// 感度レベルスライダーの更新
thresholdSlider.addEventListener('input', () => {
    const value = parseInt(thresholdSlider.value);
    thresholdValueSpan.textContent = value;
    if (chartInstance) {
        // グラフのしきい値ラインもリアルタイムで更新
        const newThreshold = value * SENSITIVITY_MULTIPLIER;
        const dataSet = chartInstance.data.datasets[0].data;
        chartInstance.data.datasets[1].data = Array(dataSet.length).fill(newThreshold);
        chartInstance.update();
    }
});

// グラフの初期化
function initializeChart(initialThreshold) {
    if (chartInstance) chartInstance.destroy(); // 既存インスタンスを破棄
    
    const ctxChart = document.getElementById('changeChart').getContext('2d');
    const thresholdLineValue = initialThreshold * SENSITIVITY_MULTIPLIER;

    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [{
                label: '1ピクセルあたりの平均変化レベル',
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
                    max: 200, // 平均変化レベルの表示範囲を調整 (最大765だが平均は低い)
                    title: {
                        display: true,
                        text: '平均ピクセル差分 (0-765)'
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
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
    
    // グラフのしきい値ラインもデータ数に合わせて調整
    const currentThreshold = parseInt(thresholdSlider.value) * SENSITIVITY_MULTIPLIER;
    chartInstance.data.datasets[1].data = Array(dataSet.length).fill(currentThreshold);
    
    chartInstance.update();
}


// =================================================================
// 通知機能 (Notification API - キー不要)
// =================================================================

function showNotification(targetUrl) {
    const notification = new Notification('🚨 警告：動きを検出しました！', {
        body: '設定領域で画像の変化を検出。画面を確認してください。',
        icon: 'https://via.placeholder.com/128' 
    });

    notification.onclick = function() {
        window.open(targetUrl, '_blank');
        notification.close();
    };
}

function triggerNotificationLocal() {
    const notificationUrl = document.getElementById('notificationUrl').value || 'https://www.google.com/';

    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(notificationUrl);
            }
        });
    } else if (Notification.permission === 'granted') {
        showNotification(notificationUrl);
    }
}


// =================================================================
// 監視ロジック
// =================================================================

// Webカメラの起動
startButton.addEventListener('click', () => {
    if (isMonitoring) return;

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    const initialThreshold = parseInt(thresholdSlider.value);
    initializeChart(initialThreshold); // グラフを初期化

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
});

function startMonitoring() {
    isMonitoring = true;
    lastFrameData = null;
    monitoringInterval = setInterval(processFrame, 100); // 10FPSで処理
}

function processFrame() {
    if (!isMonitoring) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    if (!lastFrameData) {
        lastFrameData = new Uint8ClampedArray(currentFrameData);
        return;
    }

    const pixelChangeThreshold = parseInt(thresholdSlider.value);
    const thresholdValue = pixelChangeThreshold * SENSITIVITY_MULTIPLIER;
    
    let diffPixels = 0;
    let totalMagnitude = 0; // グラフ用：変化の総量を蓄積
    const totalPixels = (canvas.width * canvas.height);
    const pixelCount = currentFrameData.length / 4; // 総ピクセル数

    // 全ピクセルをチェックし、差分を計算
    for (let i = 0; i < currentFrameData.length; i += 4) {
        const diffR = Math.abs(currentFrameData[i] - lastFrameData[i]);
        const diffG = Math.abs(currentFrameData[i + 1] - lastFrameData[i + 1]);
        const diffB = Math.abs(currentFrameData[i + 2] - lastFrameData[i + 2]);
        
        const sumDiff = diffR + diffG + diffB;
        totalMagnitude += sumDiff;
        
        // ユーザー設定のしきい値を超えたピクセル数をカウント
        if (sumDiff > thresholdValue) { 
            diffPixels++;
        }
    }

    // グラフ更新: 1ピクセルあたりの平均変化量
    const averageChangeMagnitude = totalMagnitude / pixelCount;
    updateChart(averageChangeMagnitude); 

    // 通知判定: 変化したピクセル数が一定の割合を超えたら通知
    const changePercentage = diffPixels / totalPixels;
    if (changePercentage > NOTIFICATION_PIXEL_PERCENTAGE) {
        console.log(`!!! 変化検出: ${Math.round(changePercentage * 1000) / 10}% !!!`);
        triggerNotificationLocal(); 

        // 通知の誤爆を防ぐため、検出後は直前のフレームを新しい基準フレームとして保存
        lastFrameData = new Uint8ClampedArray(currentFrameData);
    } else {
        // 変化がなければ、次の比較のために現行フレームを基準として保存
        lastFrameData = new Uint8ClampedArray(currentFrameData);
    }
}
