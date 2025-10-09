// ======================================
// 1. 音声認識 (Web Speech API)
// ======================================
const startStopVoiceBtn = document.getElementById('startStopVoiceBtn');
const outputVoice = document.getElementById('outputVoice');
const voiceStatus = document.getElementById('voiceStatus');
const copyBtn = document.getElementById('copyBtn');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let isListening = false;
let recognition = null;

// [音声認識のロジックは変更なし。ボタンイベントはDOMContentLoaded内で設定]

// ======================================
// 2. カメラ制御 (MediaDevices API)
// ⚠️ 関数と変数をグローバルスコープで定義
// ======================================
const toggleCameraBtn = document.getElementById('toggleCameraBtn');
const webcamVideo = document.getElementById('webcamVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const cameraStatus = document.getElementById('cameraStatus');

let cameraStream = null;
let isCameraOn = false;
let detectionInterval = null;

// カメラ起動/停止を制御する関数 (DOMContentLoadedの外で定義)
const toggleCamera = async () => {
    // ... (関数の中身は前の回答と同じ) ...

    if (isCameraOn) {
        // カメラ停止
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        webcamVideo.style.display = 'none';
        overlayCanvas.style.display = 'none';
        cameraStatus.textContent = 'カメラはオフです';
        toggleCameraBtn.textContent = '通知ボタン (カメラ起動)';
        clearInterval(detectionInterval); // 認識処理の停止
        isCameraOn = false;
    } else {
        // カメラ起動
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            webcamVideo.srcObject = cameraStream;
            webcamVideo.style.display = 'block';
            overlayCanvas.style.display = 'block';
            cameraStatus.textContent = '🟢 カメラオン。モデルロード中...';
            toggleCameraBtn.textContent = '停止';
            isCameraOn = true;
            
            webcamVideo.onloadedmetadata = () => {
                // face-logic.jsで定義された関数を呼び出し、顔認識ループを開始
                detectionInterval = startFaceDetection(webcamVideo, overlayCanvas, cameraStatus); 
            };
        } catch (err) {
            console.error('カメラアクセスエラー:', err);
            cameraStatus.textContent = '🚨 カメラへのアクセスが拒否されました。';
            toggleCameraBtn.textContent = '通知ボタン (カメラ起動)';
        }
    }
};

// -------------------------------------
// 3. 初期化処理の集約 (イベントリスナー設定)
// -------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // 1. モデルロードの開始 (非同期で実行し、失敗しても後続処理を継続)
    loadModels().catch(error => {
        console.error("モデルロード全体が失敗しました。顔認識機能は動作しません。", error);
        // 顔認識関連のボタンを無効化
        document.getElementById('toggleCameraBtn').disabled = true;
        document.getElementById('registerFaceBtn').disabled = true;
    }); 

    // 2. カメラ起動/停止ボタンのイベント設定
    toggleCameraBtn.addEventListener('click', toggleCamera);
    
    // 3. 顔登録ボタンのイベント設定 
    document.getElementById('registerFaceBtn').addEventListener('click', () => {
        const name = document.getElementById('personName').value.trim();
        const files = document.getElementById('imageUpload').files;
        registerFace(name, files);
    });
    
    // 4. 登録リストの初期描画 
    updateRegisteredList();
    
    // 5. 音声認識ボタンのイベント設定
    if (recognition) {
        startStopVoiceBtn.addEventListener('click', () => {
            if (isListening) {
                isListening = false;
                recognition.stop();
            } else {
                outputVoice.value = '';
                recognition.start();
            }
        });
    }
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(outputVoice.value);
        copyBtn.textContent = '✅ コピー完了!';
        setTimeout(() => copyBtn.textContent = '📋 テキストをコピー', 1500);
    });
});
