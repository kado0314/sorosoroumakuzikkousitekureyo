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

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
        isListening = true;
        startStopVoiceBtn.textContent = '停止';
        voiceStatus.textContent = '🟢 マイクがオン。話してください...';
    };

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + '。';
            } else {
                interimTranscript += transcript;
            }
        }
        outputVoice.value = finalTranscript + interimTranscript;
    };

    recognition.onend = () => {
        // ユーザーが明示的に停止していない場合、自動で再起動
        if (isListening) recognition.start();
        else voiceStatus.textContent = '待機中...';
    };

    recognition.onerror = (event) => {
        console.error('認識エラー:', event.error);
        voiceStatus.textContent = `🔴 エラーが発生しました: ${event.error}`;
        isListening = false;
        startStopVoiceBtn.textContent = '🔴 音声認識を開始';
    };

    startStopVoiceBtn.addEventListener('click', () => {
        if (isListening) {
            isListening = false;
            recognition.stop();
        } else {
            outputVoice.value = ''; // 開始時にテキストエリアをクリア
            recognition.start();
        }
    });
} else {
    voiceStatus.textContent = "🚨 ブラウザが音声認識APIに対応していません。";
    startStopVoiceBtn.disabled = true;
}

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(outputVoice.value);
    copyBtn.textContent = '✅ コピー完了!';
    setTimeout(() => copyBtn.textContent = '📋 テキストをコピー', 1500);
});


// ======================================
// 2. カメラ制御 (MediaDevices API)
// ======================================
const toggleCameraBtn = document.getElementById('toggleCameraBtn');
const webcamVideo = document.getElementById('webcamVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const cameraStatus = document.getElementById('cameraStatus');

let cameraStream = null;
let isCameraOn = false;
let detectionInterval = null; // face-logic.jsで定義されたインターバルIDを保持

// カメラ起動/停止を制御する関数
const toggleCamera = async () => {
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
            // カメラの許可を求める (音声は不要なのでaudio: false)
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            webcamVideo.srcObject = cameraStream;
            webcamVideo.style.display = 'block';
            overlayCanvas.style.display = 'block';
            cameraStatus.textContent = '🟢 カメラオン。モデルロード中...';
            toggleCameraBtn.textContent = '停止';
            isCameraOn = true;
            
            // 映像メタデータがロードされたら、顔認識を開始
            webcamVideo.onloadedmetadata = () => {
                // face-logic.jsの関数を呼び出し、顔認識ループを開始
                detectionInterval = startFaceDetection(webcamVideo, overlayCanvas, cameraStatus); 
            };
        } catch (err) {
            console.error('カメラアクセスエラー:', err);
            cameraStatus.textContent = '🚨 カメラへのアクセスが拒否されました。';
            toggleCameraBtn.textContent = '通知ボタン (カメラ起動)';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // face-logic.jsで定義されたモデルロード関数を呼び出し
    loadModels(); 
    toggleCameraBtn.addEventListener('click', toggleCamera);
});