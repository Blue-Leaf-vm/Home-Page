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
    hideDelay: 3000, // 기본값 3초
    backgroundColor: 'rgba(0, 0, 0)',
    blur: true,
    tip: true,
    searchEngineIndex: 0, 
    searchEngines: [...DEFAULT_SEARCH_ENGINES]
};

// ===================================================================================
// IndexedDB (배경 이미지용)
// ===================================================================================
const DB_NAME = 'clockBackgroundDB';
const STORE_NAME = 'backgroundImages';
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // keyPath를 'id'로 설정하여 고유 식별자 사용
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = event => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = event => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

// [변경] 이미지 추가 (기존 이미지 삭제 안함)
function addImageToDB(images) {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        images.forEach((imageBlob) => {
            // 고유 ID 생성 (타임스탬프 + 랜덤)
            const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            store.put({ id: uniqueId, data: imageBlob });
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

// [추가] 특정 이미지 삭제
function deleteImageFromDB(id) {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

// [변경] 반환값을 {id, data} 객체 배열로 변경 (관리 용이성 위해)
function loadImagesFromDB() {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result); // 전체 레코드({id, data}) 반환
        };

        request.onerror = event => reject(event.target.error);
    });
}

function clearImagesFromDB() {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();

        transaction.oncomplete = () => {
            console.log("모든 배경 이미지가 삭제되었습니다.");
            resolve();
        };

        transaction.onerror = event => reject(event.target.error);
    });
}

// ===================================================================================
// 로컬 스토리지 (설정용)
// ===================================================================================
function loadSettings() {
    const savedConfig = localStorage.getItem('clockConfig');
    if (savedConfig) {
        const loadedConfig = JSON.parse(savedConfig);
        config = { 
            ...config, 
            ...loadedConfig 
        };
        
        if (!config.searchEngines || config.searchEngines.length === 0) {
            config.searchEngines = [...DEFAULT_SEARCH_ENGINES];
            config.searchEngineIndex = 0;
        }

        if (config.searchEngineIndex >= config.searchEngines.length) {
            config.searchEngineIndex = 0;
        }
    }
}

function saveSettings() {
    localStorage.setItem('clockConfig', JSON.stringify(config));
}

// ===================================================================================
// UI 및 기능 초기화
// ===================================================================================
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    await initDB();
    
    applyAllSettings();
    
    initializeAutohide();
    initializeClock();
    initializeEventListeners();
    renderSearchEnginesList();
    updateSearchEngineDisplay();
    setupBackgroundColorPicker();
    setupHideDelayInput(); // [추가] 숨김 시간 설정 초기화
});

// ===================================================================================
// 설정 적용 함수
// ===================================================================================
async function applyAllSettings() {
    await applyBackground();
    applyBlurEffect();

    const blurToggle = document.getElementById('blurToggle');
    if(blurToggle) blurToggle.checked = config.blur;

    const tipToggle = document.getElementById('tipToggle');
    if(tipToggle) tipToggle.checked = config.tip;
    
    const bgColorPicker = document.getElementById('bg-color-picker');
    if(bgColorPicker) bgColorPicker.value = rgbToHex(config.backgroundColor);

    // [추가] 숨김 시간 인풋 값 설정 (밀리초 -> 초)
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

// ===================================================================================
// [변경] 자동 숨김 로직 (설정 버튼 포함 + 0초일 때 안숨김 + 모달 열리면 안숨김)
// ===================================================================================
function initializeAutohide() {
    let hideTimeout;
    const uiContainer = document.getElementById('ui-container'); // 모든 UI 포함 컨테이너
    const searchInput = document.getElementById('search-input');

    document.addEventListener('mousemove', () => {
        // 모달이 열려있으면 숨기지 않음
        const modal = document.getElementById('settings-modal');
        if (modal && !modal.classList.contains('hidden')) {
            uiContainer.style.opacity = '1';
            clearTimeout(hideTimeout);
            return;
        }

        // 숨김 시간이 0이면(비활성화) 숨기지 않음
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
                // 검색창 입력 중이거나 모달이 열려있으면 숨기지 않음
                if (activeElement !== searchInput) {
                    // 모달 체크 한 번 더 (타이머 끝난 시점)
                    if (modal && modal.classList.contains('hidden')) {
                        uiContainer.style.opacity = '0';
                    }
                }
            }, config.hideDelay);
        }
    });
}

// ===================================================================================
// 이벤트 리스너 초기화
// ===================================================================================
function initializeEventListeners() {
    // 배경 이미지 추가 버튼
    const changeBgBtn = document.getElementById('changeBackgroundBtn');
    if (changeBgBtn) {
        changeBgBtn.addEventListener('click', openBackgroundDialog);
    }
    
    // 배경 초기화 버튼
    const resetBgBtn = document.getElementById('resetBackgroundBtn');
    if (resetBgBtn) {
        resetBgBtn.addEventListener('click', resetBackground);
    }
    
    // 기타 토글 버튼들
    document.getElementById('blurToggle')?.addEventListener('change', (e) => {
        config.blur = e.target.checked;
        saveSettings();
        applyBlurEffect();
    });

    document.getElementById('tipToggle')?.addEventListener('change', (e) => {
        config.tip = e.target.checked;
        saveSettings();
        applyTipVisibility();
    });
    
    // 설정 모달 버튼
    document.getElementById('settings-btn')?.addEventListener('click', () => toggleSettingsModal(true));
    document.getElementById('close-modal-btn')?.addEventListener('click', () => toggleSettingsModal(false));
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            toggleSettingsModal(false);
        }
    });

    // 검색 관련
    document.getElementById('add-engine-btn')?.addEventListener('click', addSearchEngine);
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('keydown', handleSearchInputKeydown);
    
    // 문서 전체 키다운
    document.addEventListener('keydown', (event) => {
        if (document.activeElement === searchInput || event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key.length === 1) {
            document.getElementById('ui-container').style.opacity = '1';
            searchInput.focus();
        }
    });
    
    // 내보내기/가져오기
    document.getElementById('export-settings-btn')?.addEventListener('click', exportSettings);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input')?.addEventListener('change', importSettings);
    
    // 엔진 클릭
    document.getElementById('search-engine-display')?.addEventListener('click', () => {
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
        searchInput.focus();
    });
}

// [추가] 숨김 시간 설정 핸들러
function setupHideDelayInput() {
    const input = document.getElementById('hide-delay-input');
    if (!input) return;

    input.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (val < 0) val = 0;
        config.hideDelay = val * 1000; // 초 -> 밀리초
        saveSettings();
        // 설정 변경 즉시 반영 위해 기존 타이머 로직이 mousemove로 재실행되게 둠
    });
}

// ===================================================================================
// 기능 구현
// ===================================================================================

function applyBlurEffect() {
    const itemBox = document.getElementById('item-box');
    if (config.blur) itemBox.classList.add('blur-effect');
    else itemBox.classList.remove('blur-effect');
}

async function applyBackground(specificImageBlob = null) {
    const backgroundElement = document.getElementById('background');
    backgroundElement.style.backgroundColor = config.backgroundColor;
    
    if (specificImageBlob) {
        // 미리보기: 특정 이미지 강제 적용
        const imageUrl = URL.createObjectURL(specificImageBlob);
        backgroundElement.style.backgroundImage = `url(${imageUrl})`;
        return;
    }

    try {
        const records = await loadImagesFromDB();
        // records는 {id, data} 배열
        if (records.length > 0) {
            const randomIndex = Math.floor(Math.random() * records.length);
            const imageUrl = URL.createObjectURL(records[randomIndex].data);
            backgroundElement.style.backgroundImage = `url(${imageUrl})`;
        } else {
            backgroundElement.style.backgroundImage = 'none';
        }
    } catch (error) {
        console.error("배경 이미지 로딩 실패:", error);
        backgroundElement.style.backgroundImage = 'none';
    }
}

// [변경] 이미지 파일 추가 (IndexedDB에 추가)
function openBackgroundDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;

    input.onchange = async e => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        try {
            await addImageToDB(files); // [변경] save -> add
            await applyBackground(); // 하나라도 추가되면 바로 배경 갱신 시도
            renderImageManagementList(); // 목록 갱신
            showCustomMessage("저장 완료", `${files.length}개의 이미지가 추가되었습니다.`);
        } catch (error) {
            console.error("이미지 저장 실패:", error);
            showCustomMessage("오류", "이미지 저장에 실패했습니다.");
        }
    };
    input.click();
}

async function resetBackground() {
    showCustomConfirm("배경 초기화", "정말로 모든 배경 이미지를 삭제하시겠습니까?").then(async (result) => {
        if (result) {
            try {
                await clearImagesFromDB();
                await applyBackground();
                renderImageManagementList(); // 목록 갱신
                showCustomMessage("초기화 완료", "모든 이미지가 삭제되었습니다.");
            } catch (error) {
                console.error("실패:", error);
            }
        }
    });
}

// [추가] 이미지 관리 목록 렌더링 함수
async function renderImageManagementList() {
    const container = document.getElementById('image-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    try {
        const records = await loadImagesFromDB();
        
        if (records.length === 0) {
            container.innerHTML = '<p style="color:#888; grid-column: 1/-1; text-align:center;">저장된 이미지가 없습니다.</p>';
            return;
        }

        records.forEach(record => {
            const blobUrl = URL.createObjectURL(record.data);
            
            const wrapper = document.createElement('div');
            wrapper.className = 'image-item-wrapper';
            
            // 썸네일
            const img = document.createElement('img');
            img.src = blobUrl;
            img.className = 'image-thumbnail';
            
            // 동작 버튼들 컨테이너
            const actions = document.createElement('div');
            actions.className = 'image-actions';
            
            // 1. 미리보기(적용) 버튼
            const previewBtn = document.createElement('button');
            previewBtn.className = 'img-btn';
            previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            previewBtn.title = "이 이미지로 배경 변경";
            previewBtn.onclick = (e) => {
                e.stopPropagation();
                applyBackground(record.data); // 해당 Blob으로 배경 즉시 변경
            };
            
            // 2. 다운로드 버튼
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'img-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = "다운로드";
            downloadBtn.onclick = (e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = blobUrl;
                // MIME 타입으로 확장자 추측
                const ext = record.data.type.split('/')[1] || 'png';
                a.download = `background_${record.id}.${ext}`;
                a.click();
            };

            // 3. 삭제 버튼
            const delBtn = document.createElement('button');
            delBtn.className = 'img-btn del';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = "삭제";
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('이 이미지를 삭제하시겠습니까?')) {
                    await deleteImageFromDB(record.id);
                    renderImageManagementList(); // 목록 갱신
                    // 만약 현재 배경이 삭제된거라면 랜덤 갱신 필요할 수 있음
                    // 여기서는 편의상 그대로 둠
                }
            };

            actions.appendChild(previewBtn);
            actions.appendChild(downloadBtn);
            actions.appendChild(delBtn);
            
            wrapper.appendChild(img);
            wrapper.appendChild(actions);
            
            // 이미지 클릭시 미리보기와 동일하게 동작
            wrapper.addEventListener('click', () => applyBackground(record.data));
            
            container.appendChild(wrapper);
        });
        
    } catch (e) {
        console.error("이미지 목록 로드 실패", e);
        container.innerHTML = '<p>이미지 로드 실패</p>';
    }
}

// 시계 및 기타 유틸리티 함수들은 기존과 동일
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

function showCustomMessage(title, message) {
    // 실제 환경에서는 alert를 대체할 모달이 있으면 좋음
    alert(`[${title}] ${message}`); 
}

function showCustomConfirm(title, message) {
    return Promise.resolve(confirm(`[${title}] ${message}`));
}

function toggleSettingsModal(show) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    
    // [중요] 모달이 열리거나 닫힐 때 UI 투명도 즉시 제어
    const uiContainer = document.getElementById('ui-container');

    if (show) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('visible'), 10);
        uiContainer.style.opacity = '1'; // 모달 열면 UI 보이기
        
        renderSearchEnginesList();
        renderImageManagementList(); // [추가] 이미지 목록 렌더링
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
        saveSettings();
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
            saveSettings();
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
    if (!name || !url) return showCustomMessage("오류", "내용을 입력하세요.");
    if (!url.includes('(query)') && !url.endsWith('//w/')) {
        url = url.includes('?') ? url + '&q=(query)' : url + '?q=(query)';
    }
    config.searchEngines.push({ name, url });
    saveSettings();
    renderSearchEnginesList();
    nameInput.value = ''; urlInput.value = '';
}

function deleteSearchEngine(index) {
    if (config.searchEngines.length <= 1) return showCustomMessage("오류", "최소 1개 필요");
    if (index < config.searchEngineIndex) config.searchEngineIndex--;
    else if (index === config.searchEngineIndex) config.searchEngineIndex = 0;
    config.searchEngines.splice(index, 1);
    saveSettings();
    updateSearchEngineDisplay();
    renderSearchEnginesList();
}

function handleSearchInputKeydown(event) {
    const searchInput = event.target;
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        config.searchEngineIndex = (config.searchEngineIndex - 1 + config.searchEngines.length) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
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
// ZIP 관련 (이미지 관리 구조 변경으로 인한 로직 수정)
// ===================================================================================
async function exportSettings() {
    const zip = new JSZip();
    const settingsToExport = {
        backgroundColor: config.backgroundColor,
        blur: config.blur,
        tip: config.tip,
        searchEngineIndex: config.searchEngineIndex,
        searchEngines: config.searchEngines,
        hideDelay: config.hideDelay, // [추가]
        hasBackgroundImages: false
    };
    
    try {
        const records = await loadImagesFromDB();
        if (records.length > 0) {
            settingsToExport.hasBackgroundImages = true;
            records.forEach((record) => {
                // record.id와 data 사용
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
        const zip = await JSZip.loadAsync(file);
        const settingsFile = zip.file("settings.json");
        if (!settingsFile) return alert("settings.json 없음");
        
        const importedSettings = JSON.parse(await settingsFile.async("text"));
        config = { ...config, ...importedSettings };
        
        // 1. 이미지 로드 및 저장 (덮어쓰기 로직)
        const importedImages = [];
        zip.folder("backgrounds").forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                const mimeMatch = relativePath.match(/\.([a-z0-9]+)$/i);
                const mime = mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : 'image/png';
                // 파일명을 ID로 사용 (확장자 제거)
                const id = relativePath.split('/').pop().replace(/\.[^/.]+$/, "");
                
                importedImages.push(zipEntry.async("blob").then(blob => ({
                    id: id,
                    data: new Blob([blob], { type: mime })
                })));
            }
        });

        if (importedImages.length > 0) {
            const imageObjects = await Promise.all(importedImages);
            // 기존 DB 클리어 후 저장? 아니면 추가? 
            // "불러오기"는 보통 상태 복원이므로 기존을 날리고 덮어쓰는게 맞음
            await clearImagesFromDB(); 
            
            // saveImageToDB 대신 직접 저장 로직 사용 (ID 유지를 위해)
            if (!db) await initDB();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            imageObjects.forEach(obj => store.put(obj)); // {id, data} 저장
            await new Promise((res, rej) => {
                transaction.oncomplete = res;
                transaction.onerror = rej;
            });
        }

        saveSettings();
        await applyAllSettings();
        updateSearchEngineDisplay();
        renderSearchEnginesList();
        renderImageManagementList();
        event.target.value = '';
        alert("완료");
    } catch (e) {
        console.error(e);
        alert("실패");
    }
}