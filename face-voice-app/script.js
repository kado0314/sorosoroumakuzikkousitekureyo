// ... (コード全体は前の回答の最終決定版を使用) ...

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
});
