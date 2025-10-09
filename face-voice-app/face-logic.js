// 登録された特徴量を保持する配列。ページを閉じると消滅します。
let labeledFaceDescriptors = []; 
const MAX_PEOPLE = 10;
// 距離の閾値 (0.6は比較的緩い設定。値が小さいほど厳密になります)
const DISTANCE_THRESHOLD = 0.6; 

// -------------------------------------
// モデルのロード (GitHub Pages上の/modelsフォルダから)
// -------------------------------------
const loadModels = async () => {
    // 【重要】モデルパスを純粋な相対パスに修正 (baseタグが解決する)
    const MODELS_URL = 'models'; 
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL); // 顔検出
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL); // 顔の特徴点
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL); // 特徴量抽出
        console.log('顔認識モデルがロードされました');
    } catch (e) {
        console.error('モデルのロードに失敗しました。/modelsフォルダが正しく配置されているか確認してください。', e);
        const statusEl = document.getElementById('cameraStatus');
        if (statusEl) statusEl.textContent = '🚨 モデルロード失敗。/modelsフォルダを確認してください。';
        throw new Error("Face model loading failed.");
    }
};

// ... (その他の関数は変更なし) ...

// -------------------------------------
// 特徴量の抽出 (写真ファイルから)
// -------------------------------------
const extractDescriptors = async (imageFiles) => {
    const descriptors = [];
    for (const file of imageFiles) {
        const img = await faceapi.bufferToImage(file);
        // 顔検出と特徴量抽出を一度に行う
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
            descriptors.push(detection.descriptor);
        }
    }
    return descriptors;
};

// -------------------------------------
// 登録・削除・リスト更新
// -------------------------------------
const updateRegisteredList = () => {
    const listEl = document.getElementById('registeredList');
    const countEl = document.getElementById('registeredCount');
    listEl.innerHTML = ''; // リストをクリア
    
    labeledFaceDescriptors.forEach((desc, index) => {
        const li = document.createElement('li');
        li.textContent = `${desc.label} (画像${desc.descriptors.length}枚)`;
        
        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = () => {
            labeledFaceDescriptors.splice(index, 1);
            updateRegisteredList(); // リストを再描画
        };
        li.appendChild(deleteBtn);
        listEl.appendChild(li);
    });
    countEl.textContent = labeledFaceDescriptors.length;
};

const registerFace = async (name, imageFiles) => {
    if (labeledFaceDescriptors.length >= MAX_PEOPLE) {
        alert('登録できるのは10人までです。');
        return;
    }
    if (!name || imageFiles.length === 0) {
        alert('人物名と写真ファイルを選択してください。');
        return;
    }
    
    // 特徴量抽出を実行
    const descriptors = await extractDescriptors(imageFiles);
    if (descriptors.length === 0) {
        alert('画像から顔が検出できませんでした。');
        return;
    }

    // Labeled Face Descriptorsオブジェクトを作成し、メモリに一時保存
    const newLabeledDescriptor = new faceapi.LabeledFaceDescriptors(name, descriptors);
    labeledFaceDescriptors.push(newLabeledDescriptor);
    
    alert(`人物 ${name} の特徴量を登録しました。`);
    document.getElementById('personName').value = '';
    document.getElementById('imageUpload').value = '';
    updateRegisteredList();
};

// -------------------------------------
// リアルタイム顔認識
// -------------------------------------
const startFaceDetection = (videoEl, canvasEl, statusEl) => {
    const displaySize = { width: videoEl.width, height: videoEl.height };
    faceapi.matchDimensions(canvasEl, displaySize);
    
    // 認識ループを開始
    return setInterval(async () => {
        if (labeledFaceDescriptors.length === 0) {
            statusEl.textContent = '🟢 監視中... (登録人物がいません)';
            return;
        }
        
        // 登録された特徴量配列からFaceMatcherを作成
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, DISTANCE_THRESHOLD);
        
        // 映像から顔を検出、特徴点検出し、特徴量を抽出
        const detections = await faceapi.detectAllFaces(videoEl, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks()
            .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height); // キャンバスをクリア

        let isDangerousPersonDetected = false;
        let detectedPersonName = '未登録人物';

        resizedDetections.forEach(detection => {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            const label = bestMatch.label === 'unknown' ? '未登録人物' : bestMatch.label;
            
            let boxColor = 'blue';
            if (label !== '未登録人物') {
                boxColor = 'red'; // 特定の人物が来たら赤
                isDangerousPersonDetected = true;
                detectedPersonName = label;
            }
            
            // 検出ボックスの描画
            const drawBox = new faceapi.draw.DrawBox(detection.detection.box, { label: label, boxColor: boxColor });
            drawBox.draw(canvasEl);
        });

        // 状態メッセージの更新
        if (isDangerousPersonDetected) {
            statusEl.textContent = `🚨 警告！危険人物 (${detectedPersonName}) が検出されました！`;
        } else {
            statusEl.textContent = '🟢 監視中... (危険人物なし)';
        }

    }, 200); // 200ミリ秒 (5FPS) ごとに処理。PC性能に応じて調整してください。
};
