// ===================================================================================
// 구글 API 연동 변수 설정
// ===================================================================================
// [중요] 구글 클라우드 콘솔(Google Cloud Console)에서 발급받은 클라이언트 ID를 입력하세요.
// 또한, 구글 콘솔의 "승인된 자바스크립트 출처(Authorized JavaScript origins)"에 
// Cloudflare 터널로 연결되는 도메인 주소(예: https://my-tunnel.trycloudflare.com)를 꼭 추가해야 합니다!
const GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"; 

let accessToken = null;
let tokenClient;

// ===================================================================================
// 설정 및 데이터 정의
// ===================================================================================
const DEFAULT_SEARCH_ENGINES = [
    { name: '구글', url: 'https://www.google.com/search?q=(query)' },
    { name: '네이버', url: 'https://search.naver.com/search.naver?ie=UTF-8&sm=whl_hty&query=(query)' },
    { name: '나무위키', url: 'https://namu.wiki/Search?q=(query)' },
    { name: '나무위키 문서', url: 'https://namu.wiki/w/(query)' }
];

let config = {
    autohide: true,
    hideDelay: 3000, 
    backgroundColor: 'rgba(0, 0, 0)',
    blur: true,
    tip: true,
    searchEngineIndex: 0, 
    searchEngines: [...DEFAULT_SEARCH_ENGINES]
};

// ===================================================================================
// IndexedDB (로컬 배경 이미지 캐시용)
// ===================================================================================
const DB_NAME = 'clockBackgroundDB';
const STORE_NAME = 'backgroundImages';
let localDB;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = event => {
            const tempDB = event.target.result;
            if (!tempDB.objectStoreNames.contains(STORE_NAME)) {
                tempDB.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = event => {
            localDB = event.target.result;
            resolve(localDB);
        };
        request.onerror = event => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function addImageToLocalDB(id, imageBlob) {
    if (!localDB) return Promise.reject("DB is not initialized.");
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put({ id: id, data: imageBlob });
        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

function deleteImageFromLocalDB(id) {
    if (!localDB) return Promise.reject("DB is not initialized.");
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

function loadImagesFromLocalDB() {
    if (!localDB) return Promise.reject("DB is not initialized.");
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result); 
        request.onerror = event => reject(event.target.error);
    });
}

function clearImagesFromLocalDB() {
    if (!localDB) return Promise.reject("DB is not initialized.");
    return new Promise((resolve, reject) => {
        const transaction = localDB.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

// ===================================================================================
// 유틸: 이미지를 Base64(JPEG)로 압축 (클라우드 용량 제한 해결)
// ===================================================================================
function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 1920;
                const MAX_HEIGHT = 1080;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                // 70% 화질 JPEG로 압축
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
        };
        reader.onerror = error => reject(error);
    });
}

async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
}


// ===================================================================================
// 구글 드라이브 동기화 API (Google Drive REST API)
// ===================================================================================

// 구글 로그인 클라이언트 초기화
function initGIS() {
    if (typeof google === 'undefined') {
        setTimeout(initGIS, 100);
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
            if (tokenResponse.error !== undefined) {
                alert("구글 로그인 실패: " + tokenResponse.error);
                return;
            }
            accessToken = tokenResponse.access_token;
            
            // 로그인 성공 시 UI 업데이트
            document.getElementById('user-info-text').textContent = "구글 드라이브 연동 완료!";
            document.getElementById('google-login-btn').classList.add('hidden');
            document.getElementById('google-logout-btn').classList.remove('hidden');
            document.getElementById('cloud-sync-area').classList.remove('hidden');
            
            // 자동 동기화 시도
            autoSyncFromDrive();
        },
    });
}

// 구글 드라이브에서 기존 백업 파일 ID 찾기
async function findBackupFileId() {
    const q = encodeURIComponent('name="newtab_settings_backup.json" and trashed=false');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
}

// 구글 드라이브에 JSON 텍스트를 파일로 업로드 (덮어쓰기 또는 새로 만들기)
async function uploadToDrive(jsonContent) {
    const fileId = await findBackupFileId();
    
    // Multipart 업로드 규칙 (바운더리 설정)
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const metadata = {
        name: 'newtab_settings_backup.json',
        mimeType: 'application/json'
    };

    const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonContent +
        close_delim;

    const method = fileId ? 'PATCH' : 'POST';
    const url = fileId 
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

    const res = await fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
    });
    
    if (!res.ok) throw new Error("업로드 실패");
    return await res.json();
}

// 구글 드라이브에서 백업 파일 다운로드
async function downloadFromDrive() {
    const fileId = await findBackupFileId();
    if (!fileId) return null;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!res.ok) throw new Error("다운로드 실패");
    return await res.json();
}

// 로그인 후 자동으로 가져오기
async function autoSyncFromDrive() {
    try {
        const backupData = await downloadFromDrive();
        if (backupData) {
            await applyBackupData(backupData);
            console.log("구글 드라이브에서 설정을 자동으로 불러왔습니다.");
        }
    } catch (e) {
        console.log("자동 동기화 중 오류 또는 파일 없음:", e);
    }
}

// 백업 데이터를 파싱하여 로컬에 적용하는 함수
async function applyBackupData(backupData) {
    if (backupData.config) {
        config = { ...config, ...backupData.config };
        saveLocalSettings();
    }
    
    if (backupData.images && Array.isArray(backupData.images)) {
        await clearImagesFromLocalDB();
        for (let imgObj of backupData.images) {
            const blob = await dataUrlToBlob(imgObj.dataUrl);
            await addImageToLocalDB(imgObj.id, blob);
        }
    }
    
    await applyAllSettings();
    updateSearchEngineDisplay();
    renderSearchEnginesList();
    renderImageManagementList();
}


// ===================================================================================
// 로컬 스토리지 (설정 캐시용)
// ===================================================================================
function loadLocalSettings() {
    const savedConfig = localStorage.getItem('clockConfig');
    if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
        if (!config.searchEngines || config.searchEngines.length === 0) {
            config.searchEngines = [...DEFAULT_SEARCH_ENGINES];
            config.searchEngineIndex = 0;
        }
        if (config.searchEngineIndex >= config.searchEngines.length) {
            config.searchEngineIndex = 0;
        }
    }
}

function saveLocalSettings() {
    localStorage.setItem('clockConfig', JSON.stringify(config));
}

// ===================================================================================
// UI 및 기능 초기화
// ===================================================================================
document.addEventListener('DOMContentLoaded', async () => {
    loadLocalSettings();
    await initDB();
    
    applyAllSettings();
    
    initializeAutohide();
    initializeClock();
    initializeEventListeners();
    renderSearchEnginesList();
    updateSearchEngineDisplay();
    setupBackgroundColorPicker();
    setupHideDelayInput(); 

    // 구글 API 초기화
    initGIS();
});


// ===================================================================================
// 이벤트 리스너 설정 (버튼 클릭 등)
// ===================================================================================
function initializeEventListeners() {
    
    // --- 구글 로그인 관련 이벤트 ---
    document.getElementById('google-login-btn').addEventListener('click', () => {
        if (!tokenClient) return alert("구글 API가 아직 로드되지 않았습니다.");
        tokenClient.requestAccessToken();
    });

    document.getElementById('google-logout-btn').addEventListener('click', () => {
        if (accessToken) {
            google.accounts.oauth2.revoke(accessToken, () => {
                accessToken = null;
                document.getElementById('user-info-text').textContent = "로그인되지 않았습니다.";
                document.getElementById('google-login-btn').classList.remove('hidden');
                document.getElementById('google-logout-btn').classList.add('hidden');
                document.getElementById('cloud-sync-area').classList.add('hidden');
                alert("로그아웃 되었습니다.");
            });
        }
    });

    document.getElementById('sync-to-cloud-btn').addEventListener('click', async () => {
        if (!accessToken) return alert("먼저 로그인해주세요.");
        try {
            const btn = document.getElementById('sync-to-cloud-btn');
            const originalText = btn.textContent;
            btn.textContent = "업로드 중...";
            btn.disabled = true;

            const records = await loadImagesFromLocalDB();
            const imageList = [];
            for (let record of records) {
                const b64 = await compressImageToBase64(record.data);
                imageList.push({ id: record.id, dataUrl: b64 });
            }

            const backupData = {
                config: config,
                images: imageList
            };

            await uploadToDrive(JSON.stringify(backupData));
            
            btn.textContent = originalText;
            btn.disabled = false;
            alert("구글 드라이브에 성공적으로 백업되었습니다!");
        } catch (e) {
            console.error(e);
            alert("동기화 업로드 실패");
            document.getElementById('sync-to-cloud-btn').disabled = false;
        }
    });

    document.getElementById('sync-from-cloud-btn').addEventListener('click', async () => {
        if (!accessToken) return alert("먼저 로그인해주세요.");
        try {
            const btn = document.getElementById('sync-from-cloud-btn');
            const originalText = btn.textContent;
            btn.textContent = "다운로드 중...";
            btn.disabled = true;

            const backupData = await downloadFromDrive();
            if (backupData) {
                await applyBackupData(backupData);
                alert("클라우드에서 데이터를 성공적으로 불러왔습니다.");
            } else {
                alert("드라이브에 저장된 설정 백업 파일이 없습니다.");
            }
            
            btn.textContent = originalText;
            btn.disabled = false;
        } catch (e) {
            console.error(e);
            alert("동기화 다운로드 실패");
            document.getElementById('sync-from-cloud-btn').disabled = false;
        }
    });

    // --- 기존 UI 이벤트 ---
    document.getElementById('changeBackgroundBtn')?.addEventListener('click', openBackgroundDialog);
    document.getElementById('resetBackgroundBtn')?.addEventListener('click', resetBackground);
    
    document.getElementById('blurToggle')?.addEventListener('change', (e) => {
        config.blur = e.target.checked;
        saveLocalSettings();
        applyBlurEffect();
    });

    document.getElementById('tipToggle')?.addEventListener('change', (e) => {
        config.tip = e.target.checked;
        saveLocalSettings();
        applyTipVisibility();
    });
    
    document.getElementById('settings-btn')?.addEventListener('click', () => toggleSettingsModal(true));
    document.getElementById('close-modal-btn')?.addEventListener('click', () => toggleSettingsModal(false));
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') toggleSettingsModal(false);
    });

    document.getElementById('add-engine-btn')?.addEventListener('click', addSearchEngine);
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('keydown', handleSearchInputKeydown);
    
    document.addEventListener('keydown', (event) => {
        if (document.activeElement === searchInput || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key.length === 1) {
            document.getElementById('ui-container').style.opacity = '1';
            searchInput.focus();
        }
    });
    
    document.getElementById('export-settings-btn')?.addEventListener('click', exportSettings);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input')?.addEventListener('change', importSettings);
    
    document.getElementById('search-engine-display')?.addEventListener('click', () => {
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveLocalSettings();
        searchInput.focus();
    });
}


// ===================================================================================
// UI 적용 관련 로직
// ===================================================================================

function setupHideDelayInput() {
    const input = document.getElementById('hide-delay-input');
    if (!input) return;
    input.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (val < 0) val = 0;
        config.hideDelay = val * 1000; 
        saveLocalSettings();
    });
}

async function applyAllSettings() {
    await applyBackground();
    applyBlurEffect();
    const blurToggle = document.getElementById('blurToggle');
    if(blurToggle) blurToggle.checked = config.blur;
    const tipToggle = document.getElementById('tipToggle');
    if(tipToggle) tipToggle.checked = config.tip;
    const bgColorPicker = document.getElementById('bg-color-picker');
    if(bgColorPicker) bgColorPicker.value = rgbToHex(config.backgroundColor);
    const hideDelayInput = document.getElementById('hide-delay-input');
    if(hideDelayInput) hideDelayInput.value = config.hideDelay / 1000;
    applyTipVisibility();
}

function applyTipVisibility() {
    const tip = document.getElementById('tip');
    if (tip) {
        tip.style.display = config.tip ? 'block' : 'none';
        // 브라우저 이용 관련 랜덤 팁 21개 TIP: + 1개 TMI: 내용
        const tips = [
            "TIP: 즐겨찾기 단축키는 Ctrl + D 입니다.",
            "TIP: 새 탭을 열려면 Ctrl + T 를 누르세요.",
            "TIP: 이전 페이지로 돌아가려면 Alt + 왼쪽 화살표 키를 누르세요.",
            "TIP: 다음 페이지로 이동하려면 Alt + 오른쪽 화살표 키를 누르세요.",
            "TIP: 페이지 내에서 검색하려면 Ctrl + F 를 누르세요.",
            "TIP: 전체 화면 모드로 전환하려면 F11 키를 누르세요.",
            "TIP: 탭 간 전환은 Ctrl + Tab 또는 Ctrl + Shift + Tab 으로 가능합니다.",
            "TIP: 다운로드한 파일은 보통 '다운로드' 폴더에 저장됩니다.",
            "TIP: 브라우저 설정에서 개인정보 보호 옵션을 확인하세요.",
            "TIP: 브라우저 확장 프로그램을 사용하여 기능을 확장할 수 있습니다.",
            "TIP: 시크릿 모드로 탐색하려면 Ctrl + Shift + N 을 누르세요.",
            "TIP: 페이지를 새로 고치려면 F5 키를 누르세요.",
            "TIP: 브라우저 히스토리를 보려면 Ctrl + H 를 누르세요.",
            "TIP: 열려 있는 모든 탭을 닫으려면 Ctrl + W 를 누르세요.",
            "TIP: 북마크 바를 표시하거나 숨기려면 Ctrl + Shift + B 를 누르세요.",
            "TIP: 브라우저에서 비밀번호를 저장하도록 설정할 수 있습니다.",
            "TIP: 팝업 차단 설정을 확인하여 원치 않는 팝업을 방지하세요.",
            "TIP: 브라우저에서 자동 완성 기능을 사용하여 양식을 빠르게 작성하세요.",
            "TIP: 브라우저의 개발자 도구를 열려면 F12 키를 누르세요.",
            "TIP: 페이지의 전체 내용을 캡처하려면 스크린샷 도구를 사용하세요.",
            "TIP: 검색엔진을 전환하려면 검색박스에서 위쪽, 아래쪽 화살표를 누르세요.",
            "TMI: 설정은 yure0211이 만들었습니다. 알아달라고요."
        ];
        tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
}

function initializeAutohide() {
    let hideTimeout;
    const uiContainer = document.getElementById('ui-container'); 
    const searchInput = document.getElementById('search-input');

    document.addEventListener('mousemove', () => {
        const modal = document.getElementById('settings-modal');
        if (modal && !modal.classList.contains('hidden')) {
            uiContainer.style.opacity = '1';
            clearTimeout(hideTimeout);
            return;
        }
        if (config.hideDelay <= 0) {
            uiContainer.style.opacity = '1';
            clearTimeout(hideTimeout);
            return;
        }
        if (config.autohide) {
            clearTimeout(hideTimeout);
            uiContainer.style.opacity = '1';
            hideTimeout = setTimeout(() => {
                const activeElement = document.activeElement;
                if (activeElement !== searchInput) {
                    if (modal && modal.classList.contains('hidden')) {
                        uiContainer.style.opacity = '0';
                    }
                }
            }, config.hideDelay);
        }
    });
}

function applyBlurEffect() {
    const itemBox = document.getElementById('item-box');
    if (config.blur) itemBox.classList.add('blur-effect');
    else itemBox.classList.remove('blur-effect');
}

async function applyBackground(specificImageBlob = null) {
    const backgroundElement = document.getElementById('background');
    backgroundElement.style.backgroundColor = config.backgroundColor;
    if (specificImageBlob) {
        const imageUrl = URL.createObjectURL(specificImageBlob);
        backgroundElement.style.backgroundImage = `url(${imageUrl})`;
        return;
    }
    try {
        const records = await loadImagesFromLocalDB();
        if (records.length > 0) {
            const randomIndex = Math.floor(Math.random() * records.length);
            const imageUrl = URL.createObjectURL(records[randomIndex].data);
            backgroundElement.style.backgroundImage = `url(${imageUrl})`;
        } else {
            backgroundElement.style.backgroundImage = 'none';
        }
    } catch (error) {
        console.error(error);
        backgroundElement.style.backgroundImage = 'none';
    }
}

function openBackgroundDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;

    input.onchange = async e => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        try {
            for(let file of files) {
                const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                await addImageToLocalDB(uniqueId, file);
            }
            await applyBackground(); 
            renderImageManagementList(); 
            alert(`${files.length}개의 이미지가 추가되었습니다.`);
        } catch (error) {
            console.error(error);
            alert("이미지 저장에 실패했습니다.");
        }
    };
    input.click();
}

async function resetBackground() {
    if(confirm("정말로 모든 배경 이미지를 삭제하시겠습니까?")) {
        try {
            await clearImagesFromLocalDB();
            await applyBackground();
            renderImageManagementList(); 
            alert("모든 이미지가 삭제되었습니다.");
        } catch (error) {
            console.error("초기화 실패:", error);
        }
    }
}

async function renderImageManagementList() {
    const container = document.getElementById('image-grid');
    if (!container) return;
    container.innerHTML = '';
    try {
        const records = await loadImagesFromLocalDB();
        if (records.length === 0) {
            container.innerHTML = '<p style="color:#888; grid-column: 1/-1; text-align:center;">저장된 이미지가 없습니다.</p>';
            return;
        }

        records.forEach(record => {
            const blobUrl = URL.createObjectURL(record.data);
            const wrapper = document.createElement('div');
            wrapper.className = 'image-item-wrapper';
            
            const img = document.createElement('img');
            img.src = blobUrl;
            img.className = 'image-thumbnail';
            
            const actions = document.createElement('div');
            actions.className = 'image-actions';
            
            const previewBtn = document.createElement('button');
            previewBtn.className = 'img-btn';
            previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            previewBtn.onclick = (e) => {
                e.stopPropagation();
                applyBackground(record.data); 
            };
            
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'img-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = blobUrl;
                const ext = record.data.type.split('/')[1] || 'png';
                a.download = `background_${record.id}.${ext}`;
                a.click();
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'img-btn del';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('이 이미지를 삭제하시겠습니까?')) {
                    await deleteImageFromLocalDB(record.id);
                    renderImageManagementList(); 
                }
            };

            actions.appendChild(previewBtn);
            actions.appendChild(downloadBtn);
            actions.appendChild(delBtn);
            
            wrapper.appendChild(img);
            wrapper.appendChild(actions);
            wrapper.addEventListener('click', () => applyBackground(record.data));
            container.appendChild(wrapper);
        });
    } catch (e) {
        console.error("이미지 목록 로드 실패", e);
    }
}

function initializeClock() {
    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        document.getElementById('hm').textContent = `${hours}:${minutes}`;
        document.getElementById('s').textContent = `${seconds}`;
        document.getElementById('date').textContent = `${now.getFullYear()}년 ${(now.getMonth() + 1).toString().padStart(2, '0')}월 ${now.getDate().toString().padStart(2, '0')}일 ${days[now.getDay()]}`;
    }
    setInterval(updateClock, 1000);
    updateClock();
}

function rgbToHex(rgb) {
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (!match) return '#000000'; 
    const toHex = (c) => {
        const hex = parseInt(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    return "#" + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
}

function toggleSettingsModal(show) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const uiContainer = document.getElementById('ui-container');
    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('visible'), 10);
        uiContainer.style.opacity = '1'; 
        renderSearchEnginesList();
        renderImageManagementList(); 
    } else {
        modal.classList.remove('visible');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function setupBackgroundColorPicker() {
    const picker = document.getElementById('bg-color-picker');
    if (!picker) return;
    picker.addEventListener('change', (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        config.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        saveLocalSettings();
        applyBackground();
    });
}

function updateSearchEngineDisplay() {
    const display = document.getElementById('search-engine-display');
    if (!display || !config.searchEngines[config.searchEngineIndex]) return;
    display.textContent = `검색엔진: ${config.searchEngines[config.searchEngineIndex].name}`;
    display.classList.add('highlighted');
    setTimeout(() => display.classList.remove('highlighted'), 100);
}

function renderSearchEnginesList() {
    const listContainer = document.getElementById('search-engines-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    config.searchEngines.forEach((engine, index) => {
        const item = document.createElement('div');
        item.className = 'engine-item';
        if (index === config.searchEngineIndex) item.classList.add('selected');
        item.innerHTML = `<span>${engine.name}: ${engine.url}</span> <button class="delete-btn" data-index="${index}"><i class="fas fa-times"></i></button>`;
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSearchEngine(parseInt(e.currentTarget.dataset.index, 10));
        });
        item.addEventListener('click', () => {
            config.searchEngineIndex = index;
            saveLocalSettings();
            updateSearchEngineDisplay();
            renderSearchEnginesList();
        });
        listContainer.appendChild(item);
    });
}

function addSearchEngine() {
    const nameInput = document.getElementById('new-engine-name');
    const urlInput = document.getElementById('new-engine-url');
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    if (!name || !url) return alert("내용을 입력하세요.");
    if (!url.includes('(query)') && !url.endsWith('//w/')) {
        url = url.includes('?') ? url + '&q=(query)' : url + '?q=(query)';
    }
    config.searchEngines.push({ name, url });
    saveLocalSettings();
    renderSearchEnginesList();
    nameInput.value = ''; urlInput.value = '';
}

function deleteSearchEngine(index) {
    if (config.searchEngines.length <= 1) return alert("최소 1개 필요");
    if (index < config.searchEngineIndex) config.searchEngineIndex--;
    else if (index === config.searchEngineIndex) config.searchEngineIndex = 0;
    config.searchEngines.splice(index, 1);
    saveLocalSettings();
    updateSearchEngineDisplay();
    renderSearchEnginesList();
}

function handleSearchInputKeydown(event) {
    const searchInput = event.target;
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        config.searchEngineIndex = (config.searchEngineIndex - 1 + config.searchEngines.length) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveLocalSettings();
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveLocalSettings();
    } else if (event.key === 'Enter') {
        if (searchInput.value.trim()) performSearch(searchInput.value.trim());
        searchInput.value = '';
        event.preventDefault();
    }
}

function performSearch(query) {
    const currentEngine = config.searchEngines[config.searchEngineIndex];
    let searchUrl = currentEngine.url.replace('(query)', encodeURIComponent(query));
    if (currentEngine.name === '나무위키 문서' && !currentEngine.url.includes('(query)')) {
        searchUrl = currentEngine.url + encodeURIComponent(query);
    }
    window.location.href = searchUrl;
}

// ===================================================================================
// 로컬 ZIP 파일 내보내기/가져오기
// ===================================================================================
async function exportSettings() {
    const zip = new window.JSZip();
    const settingsToExport = { ...config, hasBackgroundImages: false };
    
    try {
        const records = await loadImagesFromLocalDB();
        if (records.length > 0) {
            settingsToExport.hasBackgroundImages = true;
            records.forEach((record) => {
                const ext = record.data.type.split('/')[1] || 'png';
                zip.file(`backgrounds/${record.id}.${ext}`, record.data);
            });
        }
    } catch (e) { console.warn(e); }

    zip.file("settings.json", JSON.stringify(settingsToExport, null, 2));

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'clock_settings.zip';
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (e) { console.error(e); }
}

async function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const zip = await window.JSZip.loadAsync(file);
        const settingsFile = zip.file("settings.json");
        if (!settingsFile) return alert("settings.json 없음");
        
        const importedSettings = JSON.parse(await settingsFile.async("text"));
        config = { ...config, ...importedSettings };
        
        const importedImages = [];
        zip.folder("backgrounds").forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                const mimeMatch = relativePath.match(/\.([a-z0-9]+)$/i);
                const mime = mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : 'image/png';
                const id = relativePath.split('/').pop().replace(/\.[^/.]+$/, "");
                importedImages.push(zipEntry.async("blob").then(blob => ({
                    id: id,
                    data: new Blob([blob], { type: mime })
                })));
            }
        });

        if (importedImages.length > 0) {
            const imageObjects = await Promise.all(importedImages);
            await clearImagesFromLocalDB(); 
            for (let obj of imageObjects) {
                await addImageToLocalDB(obj.id, obj.data);
            }
        } else if (importedSettings.hasBackgroundImages === false) {
             await clearImagesFromLocalDB();
        } 
        
        saveLocalSettings();
        await applyAllSettings();
        updateSearchEngineDisplay();
        renderSearchEnginesList();
        renderImageManagementList();
        event.target.value = '';
        alert("로컬 ZIP 데이터 불러오기 완료");
    } catch (e) {
        console.error(e);
        alert("실패");
    }
}