// main.js

// DOM要素の取得
const video = document.getElementById('webcamVideo');
const overlayCanvas = document.getElementById('overlayCanvas'); // 新しいオーバーレイCanvas
const overlayCtx = overlayCanvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const personCountSlider = document.getElementById('personCountSlider');
const personCountValueSpan = document.getElementById('personCountValue');

let monitoringInterval = null;
let isMonitoring = false;
let model = null; // TensorFlow.js モデルを格納
let chartInstance = null;
const MAX_DATA_POINTS = 50;

// --- UI/チャート関連 ---

// 通知人数しきい値スライダーの更新
personCountSlider.addEventListener('input', () => {
    const value = parseInt(personCountSlider.value);
    personCountValueSpan.textContent = value;
    if (chartInstance) {
        // グラフのしきい値ラインもリアルタイムで更新
        const dataSet = chartInstance.data.datasets[0].data;
        chartInstance.data.datasets[1].data = Array(dataSet.length).fill(value);
        chartInstance.update();
    }
});

// グラフの初期化 (人数表示用に調整)
function initializeChart(initialCount) {
    if (chartInstance) chartInstance.destroy();
    
    const ctxChart = document.getElementById('changeChart').getContext('2d');

    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: Array(MAX_DATA_POINTS).fill(''),
            datasets: [{
                label: '検出人数',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.2,
                fill: true, // 塗りつぶし
                backgroundColor: 'rgba(75, 192, 192, 0.3)',
                pointRadius: 0
            }, {
                label: '通知しきい値',
                data: Array(MAX_DATA_POINTS).fill(initialCount),
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
                    max: 5, // Y軸の最大値を5人に設定
                    title: {
                        display: true,
                        text: '検出人数'
                    },
                    ticks: {
                        stepSize: 1 
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
function updateChart(detectedPeople) {
    if (!chartInstance) return;
    
    const dataSet = chartInstance.data.datasets[0].data;
    dataSet.push(detectedPeople);
    
    if (dataSet.length > MAX_DATA_POINTS) {
        dataSet.shift();
    }
    
    // しきい値ラインも更新
    const currentThreshold = parseInt(personCountSlider.value);
    chartInstance.data.datasets[1].data = Array(dataSet.length).fill(currentThreshold);
    
    chartInstance.update();
}


// --- 通知機能 (Notification API) ---

function showNotification(targetUrl, count) {
    const notification = new Notification('🚨 警告：規定人数以上の人物を検出！', {
        body: `現在 ${count} 人を検出しました。画面を確認してください。`,
        icon: 'https://via.placeholder.com/128' 
    });

    notification.onclick = function() {
        window.open(targetUrl, '_blank');
        notification.close();
    };
}

function triggerNotificationLocal(count) {
    const notificationUrl = document.getElementById('notificationUrl').value || 'https://www.google.com/';

    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification(notificationUrl, count);
            }
        });
    } else if (Notification.permission === 'granted') {
        showNotification(notificationUrl, count);
    }
}


// --- 監視/人物検出ロジック ---

// モデルの読み込みと監視の開始
startButton.addEventListener('click', async () => {
    if (isMonitoring) return;

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    startButton.textContent = 'モデル読み込み中...';
    startButton.disabled = true;

    try {
        // COCO-SSDモデルの読み込み
        model = await cocoSsd.load();
        
        const initialCount = parseInt(personCountSlider.value);
        initializeChart(initialCount);
        
        // Webカメラへのアクセス要求
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            startMonitoring();
            startButton.textContent = '監視スタート';
            stopButton.disabled = false;
            isMonitoring = true;
        };
    } catch (err) {
        console.error("エラーが発生しました:", err);
        alert("モデルの読み込みまたはWebカメラアクセスに失敗しました。");
        startButton.textContent = '監視スタート';
        startButton.disabled = false;
    }
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
    // Canvasをクリア
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    isMonitoring = false;
    startButton.disabled = false;
    stopButton.disabled = true;
});

function startMonitoring() {
    // 検出処理は負荷が高いため、ここでは約4FPS (250ms) で実行
    monitoringInterval = setInterval(detectFrame, 250); 
}

// フレームごとの検出処理
async function detectFrame() {
    if (!model || !isMonitoring) return;

    // 検出実行
    const predictions = await model.detect(video);
    
    // Canvasをクリアして、検出結果を描画
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    let personCount = 0;

    // 検出結果を処理
    predictions.forEach(prediction => {
        // 信頼度が高い「人」だけをカウント
        if (prediction.class === 'person' && prediction.score > 0.6) {
            personCount++;
            drawBoundingBox(prediction); // 検出枠を描画
        }
    });
    
    // グラフを更新
    updateChart(personCount);

    // 🌟 通知判定ロジック 🌟
    const requiredCount = parseInt(personCountSlider.value);

    if (personCount >= requiredCount) {
        console.log(`!!! 規定人数 (${requiredCount}人) 以上の人物 (${personCount}人) を検出 !!!`);
        triggerNotificationLocal(personCount); 
    }
}

// 検出されたオブジェクトの枠を描画
function drawBoundingBox(prediction) {
    const [x, y, width, height] = prediction.bbox;
    
    // 枠
    overlayCtx.strokeStyle = 'red';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(x, y, width, height);

    // ラベル
    overlayCtx.fillStyle = 'red';
    overlayCtx.font = '18px Arial';
    const text = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
    overlayCtx.fillText(text, x, y > 10 ? y - 5 : 10);
}
