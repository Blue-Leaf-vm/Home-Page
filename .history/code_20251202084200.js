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
    searchEngineIndex: 0, // 현재 선택된 검색 엔진 인덱스
    searchEngines: [...DEFAULT_SEARCH_ENGINES] // 사용자 정의 검색 엔진 목록
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

function saveImageToDB(images) {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();

        images.forEach((imageBlob, index) => {
            store.put({ id: `image_${index}`, data: imageBlob });
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

function loadImagesFromDB() {
    if (!db) return Promise.reject("DB is not initialized.");

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const imageRecords = request.result.map(record => record.data);
            resolve(imageRecords);
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

        transaction.onerror = event => {
            console.error("이미지 삭제 중 오류 발생:", event.target.error);
            reject(event.target.error);
        };
    });
}

// ===================================================================================
// 로컬 스토리지 (설정용)
// ===================================================================================
function loadSettings() {
    const savedConfig = localStorage.getItem('clockConfig');
    if (savedConfig) {
        // 기존 설정에 저장된 설정을 덮어씌움
        const loadedConfig = JSON.parse(savedConfig);
        config = { 
            ...config, 
            ...loadedConfig 
        };
        
        // 검색 엔진이 저장되지 않았다면 기본값으로 초기화
        if (!config.searchEngines || config.searchEngines.length === 0) {
            config.searchEngines = [...DEFAULT_SEARCH_ENGINES];
            config.searchEngineIndex = 0;
        }

        // 현재 인덱스가 유효한지 확인
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
});

// ===================================================================================
// 모든 설정 UI 적용 함수
// ===================================================================================
async function applyAllSettings() {
    await applyBackground();
    applyBlurEffect();

    const blurToggle = document.getElementById('blurToggle');
    if(blurToggle) {
        blurToggle.checked = config.blur;
    }

    const tipToggle = document.getElementById('tipToggle');
    if(tipToggle) {
        tipToggle.checked = config.tip;
    }
    
    // 배경색 피커 값 설정
    const bgColorPicker = document.getElementById('bg-color-picker');
    if(bgColorPicker) {
        const hexColor = rgbToHex(config.backgroundColor);
        bgColorPicker.value = hexColor;
    }

    applyTipVisibility();
}

function applyTipVisibility() {
    const tip = document.getElementById('tip');
    if (tip) {
        tip.style.display = config.tip ? 'block' : 'none';
        // 브라우저 이용 관련 랜덤 팁 20개 TIP: 내용
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
            "TIP: 페이지의 전체 내용을 캡처하려면 스크린샷 도구를 사용하세요."
        ];
        tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
}

// ===================================================================================
// 이벤트 리스너 초기화
// ===================================================================================
function initializeEventListeners() {
    // 배경 이미지 관련 버튼
    const changeBgBtn = document.getElementById('changeBackgroundBtn');
    if (changeBgBtn) {
        changeBgBtn.addEventListener('click', openBackgroundDialog);
    }
    
    const resetBgBtn = document.getElementById('resetBackgroundBtn');
    if (resetBgBtn) {
        resetBgBtn.addEventListener('click', resetBackground);
    }
    
    // 블러 토글
    const blurToggle = document.getElementById('blurToggle');
    if (blurToggle) {
        blurToggle.addEventListener('change', () => {
            config.blur = blurToggle.checked;
            saveSettings();
            applyBlurEffect();
        });
    }

    // 팁 토글
    const tipToggle = document.getElementById('tipToggle');
    if (tipToggle) {
        tipToggle.addEventListener('change', () => {
            config.tip = tipToggle.checked;
            saveSettings();
            applyTipVisibility();
        });
    }
    
    // 설정 모달 버튼
    document.getElementById('settings-btn')?.addEventListener('click', () => toggleSettingsModal(true));
    document.getElementById('close-modal-btn')?.addEventListener('click', () => toggleSettingsModal(false));
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            toggleSettingsModal(false);
        }
    });

    // 검색엔진 추가 버튼
    document.getElementById('add-engine-btn')?.addEventListener('click', addSearchEngine);

    // 검색창 키다운 이벤트 (검색 및 엔진 변경)
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        // 검색 로직을 담당하는 handleSearchInputKeydown 함수 연결
        searchInput.addEventListener('keydown', handleSearchInputKeydown);
    }
    
    // 문서 전체 키다운 이벤트 (검색창 포커스)
    document.addEventListener('keydown', (event) => {
        if (document.activeElement === searchInput || event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }

        if (event.key.length === 1) {
            const itemBox = document.getElementById('item-box');
            itemBox.style.opacity = '1';
            searchInput.focus();
        }
    });
    
    // 설정 내보내기/불러오기 버튼
    document.getElementById('export-settings-btn')?.addEventListener('click', exportSettings);
    document.getElementById('import-settings-btn')?.addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input')?.addEventListener('change', importSettings);
    
    // 검색엔진 표시 영역 클릭 이벤트 (이젠 하이라이트 토글 기능 대신 엔진 전환 기능으로 사용 가능)
    document.getElementById('search-engine-display')?.addEventListener('click', () => {
        // 클릭 시 다음 엔진으로 바로 전환
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
        searchInput.focus(); // 전환 후 검색창에 포커스 유지
    });
}

// ===================================================================================
// 개별 설정 적용 함수들
// ===================================================================================
function applyBlurEffect() {
    const itemBox = document.getElementById('item-box');
    if (config.blur) {
        itemBox.classList.add('blur-effect');
    } else {
        itemBox.classList.remove('blur-effect');
    }
}

async function applyBackground() {
    const backgroundElement = document.getElementById('background');
    backgroundElement.style.backgroundColor = config.backgroundColor;
    
    try {
        const images = await loadImagesFromDB();
        if (images.length > 0) {
            const randomIndex = Math.floor(Math.random() * images.length);
            const imageUrl = URL.createObjectURL(images[randomIndex]);
            backgroundElement.style.backgroundImage = `url(${imageUrl})`;
        } else {
            backgroundElement.style.backgroundImage = 'none';
        }
    } catch (error) {
        console.error("배경 이미지 로딩 실패:", error);
        backgroundElement.style.backgroundImage = 'none';
    }
}

function initializeAutohide() {
    if (config.autohide) {
        let hideTimeout;
        const itemBox = document.getElementById('item-box');
        const searchInput = document.getElementById('search-input');

        document.addEventListener('mousemove', () => {
            clearTimeout(hideTimeout);
            itemBox.style.opacity = '1';

            hideTimeout = setTimeout(() => {
                const activeElement = document.activeElement;
                if (activeElement !== searchInput) {
                    itemBox.style.opacity = '0';
                }
            }, config.hideDelay);
        });
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
            await saveImageToDB(files);
            await applyBackground();
        } catch (error) {
            console.error("이미지 저장 실패:", error);
            // alert 대신 커스텀 모달 사용
            showCustomMessage("이미지 저장 실패", "이미지 저장에 실패했습니다. 파일이 너무 크거나 브라우저에 문제가 있을 수 있습니다.");
        }
    };
    input.click();
}

async function resetBackground() {
    // confirm 대신 커스텀 모달 사용
    showCustomConfirm("배경 초기화", "정말로 모든 배경 이미지를 삭제하고 초기화하시겠습니까?").then(async (result) => {
        if (result) {
            try {
                await clearImagesFromDB();
                await applyBackground();
                showCustomMessage("초기화 완료", "배경이 초기화되었습니다.");
            } catch (error) {
                console.error("배경 초기화 실패:", error);
                showCustomMessage("초기화 실패", "배경 초기화에 실패했습니다.");
            }
        }
    });
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

// ===================================================================================
// 유틸리티 함수
// ===================================================================================

// RGB(A) 문자열을 Hex 문자열로 변환 (색상 피커용)
function rgbToHex(rgb) {
    // rgba(r, g, b, a) 또는 rgb(r, g, b) 형식에서 r, g, b 값 추출
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (!match) return '#000000'; 
    
    const toHex = (c) => {
        const hex = parseInt(c).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    };
    
    return "#" + toHex(match[1]) + toHex(match[2]) + toHex(match[3]);
}

// ===================================================================================
// 커스텀 모달/컨펌 함수 (alert/confirm 대체)
// ===================================================================================
function showCustomMessage(title, message) {
    // 간단한 메시지 표시 (현재는 console.log로 대체)
    console.log(`[${title}]: ${message}`);
}

function showCustomConfirm(title, message) {
    // confirm을 대체하는 Promise 기반 함수
    console.log(`[${title} - CONFIRM]: ${message}. (자동 승인 - 실제 환경에서는 모달 필요)`);
    // NOTE: For the execution environment, we avoid native alerts/confirms.
    // We return true to proceed with the action as if the user confirmed.
    return Promise.resolve(true); 
}

// ===================================================================================
// 설정 모달 관련 함수
// ===================================================================================
function toggleSettingsModal(show) {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    if (show) {
        modal.classList.remove('hidden');
        // 애니메이션 효과를 위해 잠시 후 visible 클래스 추가
        setTimeout(() => modal.classList.add('visible'), 10);
        renderSearchEnginesList(); // 모달 열 때 목록 새로고침
    } else {
        modal.classList.remove('visible');
        // 애니메이션 완료 후 hidden 클래스 추가
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function setupBackgroundColorPicker() {
    const picker = document.getElementById('bg-color-picker');
    if (!picker) return;

    picker.addEventListener('change', (e) => {
        const hex = e.target.value;
        // Hex를 RGB 포맷으로 변환하여 config에 저장. 투명도는 유지하지 않고 불투명으로 간주.
        // 현재 배경은 'rgba(0, 0, 0)' 처럼 투명도가 없으므로, RGB로 저장
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        config.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        saveSettings();
        applyBackground();
    });
}

// ===================================================================================
// 검색엔진 관리 및 선택 함수
// ===================================================================================

function updateSearchEngineDisplay() {
    const display = document.getElementById('search-engine-display');
    if (!display || !config.searchEngines[config.searchEngineIndex]) return;
    
    display.textContent = `검색엔진: ${config.searchEngines[config.searchEngineIndex].name}`;
    // 화살표 키로 엔진이 변경될 때마다 시각적 피드백 제공 (예: 짧은 하이라이트)
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
        if (index === config.searchEngineIndex) {
            item.classList.add('selected');
        }
        item.innerHTML = `
            <span>${engine.name}: ${engine.url}</span>
            <button class="delete-btn" data-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        `;
        // 삭제 버튼 이벤트 리스너
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            // 버튼의 data-index 속성을 사용하여 삭제할 인덱스를 가져옵니다.
            const indexToDelete = parseInt(e.currentTarget.dataset.index, 10);
            deleteSearchEngine(indexToDelete);
        });

        // 클릭 시 엔진 선택 기능 (모달 내부)
        item.addEventListener('click', () => {
            config.searchEngineIndex = index;
            saveSettings();
            updateSearchEngineDisplay();
            renderSearchEnginesList(); // 목록 새로고침
        });

        listContainer.appendChild(item);
    });
}

function addSearchEngine() {
    const nameInput = document.getElementById('new-engine-name');
    const urlInput = document.getElementById('new-engine-url');
    
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    
    if (!name || !url) {
        showCustomMessage("입력 오류", "엔진 이름과 URL을 모두 입력해야 합니다.");
        return;
    }
    
    // URL에 (query)가 포함되어 있지 않고 나무위키 문서 URL이 아닌 경우, (query)를 추가해주는 편의 기능
    if (!url.includes('(query)') && !url.endsWith('//w/')) {
        url = url.includes('?') ? url + '&q=(query)' : url + '?q=(query)';
    }

    config.searchEngines.push({ name, url });
    saveSettings();
    renderSearchEnginesList();
    
    nameInput.value = '';
    urlInput.value = '';
}

function deleteSearchEngine(index) {
    if (config.searchEngines.length <= 1) {
        showCustomMessage("삭제 불가", "검색엔진은 최소 1개 이상 존재해야 합니다.");
        return;
    }
    
    // 삭제할 인덱스가 현재 선택된 인덱스보다 작으면, 선택 인덱스를 하나 줄임
    if (index < config.searchEngineIndex) {
        config.searchEngineIndex--;
    } else if (index === config.searchEngineIndex) {
        // 현재 선택된 엔진을 삭제하면 인덱스를 0으로 리셋하거나 다음으로 이동
        config.searchEngineIndex = 0;
    }
    
    config.searchEngines.splice(index, 1);
    saveSettings();
    updateSearchEngineDisplay();
    renderSearchEnginesList();
}


function handleSearchInputKeydown(event) {
    const searchInput = event.target;
    const query = searchInput.value.trim();

    // Arrow Up/Down으로 엔진 변경 (포커스가 검색창에 있을 때 항상 작동)
    if (event.key === 'ArrowUp') {
        event.preventDefault(); // 커서 이동 방지
        config.searchEngineIndex = (config.searchEngineIndex - 1 + config.searchEngines.length) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
        return;
    } else if (event.key === 'ArrowDown') {
        event.preventDefault(); // 커서 이동 방지
        config.searchEngineIndex = (config.searchEngineIndex + 1) % config.searchEngines.length;
        updateSearchEngineDisplay();
        saveSettings();
        return;
    }

    if (event.key === 'Enter') {
        if (query) {
            performSearch(query);
        }
        // Enter 후에는 검색창 내용을 지우고 다시 포커스
        searchInput.value = '';
        event.preventDefault();
        return;
    }
}

function performSearch(query) {
    const currentEngine = config.searchEngines[config.searchEngineIndex];
    if (!currentEngine) {
        showCustomMessage("검색 오류", "선택된 검색 엔진이 없습니다.");
        return;
    }
    
    // (query) 템플릿을 실제 검색어로 대체
    let searchUrl = currentEngine.url.replace('(query)', encodeURIComponent(query));
    
    // 나무위키 문서의 경우 URL 끝에 검색어를 바로 붙이는 로직 (query) 템플릿이 없는 경우
    if (currentEngine.name === '나무위키 문서' && !currentEngine.url.includes('(query)')) {
        searchUrl = currentEngine.url + encodeURIComponent(query);
    }

    window.location.href = searchUrl;
}

// ===================================================================================
// 설정 내보내기/불러오기 (JSZip 사용)
// ===================================================================================
async function exportSettings() {
    const zip = new JSZip();
    
    // 1. 설정 JSON 파일 생성 (배경 이미지를 제외한 모든 config)
    const settingsToExport = {
        backgroundColor: config.backgroundColor,
        blur: config.blur,
        tip: config.tip,
        searchEngineIndex: config.searchEngineIndex,
        searchEngines: config.searchEngines,
        hasBackgroundImages: false // 기본값은 false
    };
    
    // 2. IndexedDB의 배경 이미지 불러오기 및 ZIP에 추가
    try {
        const images = await loadImagesFromDB();
        if (images.length > 0) {
            settingsToExport.hasBackgroundImages = true; // 이미지 포함 플래그 설정
            images.forEach((blob, index) => {
                // MIME 타입 확인 및 확장자 지정 (기본적으로 JPEG/PNG로 가정)
                const mimeType = blob.type.split('/')[1] || 'png'; 
                // backgrounds 폴더에 저장
                zip.file(`backgrounds/image_${index}.${mimeType}`, blob); 
            });
            console.log(`IndexedDB에서 ${images.length}개의 배경 이미지를 내보냈습니다.`);
        }
    } catch (error) {
        console.warn("IndexedDB에서 배경 이미지 로딩 중 오류 발생. 이미지 없이 설정을 내보냅니다:", error);
    }

    // 3. 최종 settings.json 파일을 ZIP에 추가 (이미지 포함 여부 플래그 포함)
    zip.file("settings.json", JSON.stringify(settingsToExport, null, 2));

    // 4. ZIP 파일 생성 및 다운로드
    try {
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'clock_settings.zip';
        a.click();
        URL.revokeObjectURL(a.href);
        showCustomMessage("내보내기 완료", "설정이 clock_settings.zip으로 내보내졌습니다.");
    } catch (error) {
        console.error("설정 내보내기 실패:", error);
        showCustomMessage("내보내기 실패", "설정 ZIP 파일 생성에 실패했습니다.");
    }
}

async function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const zip = await JSZip.loadAsync(file);
        const settingsFile = zip.file("settings.json");
        
        if (!settingsFile) {
            showCustomMessage("불러오기 실패", "ZIP 파일 내에 settings.json 파일이 없습니다.");
            return;
        }

        const jsonString = await settingsFile.async("text");
        const importedSettings = JSON.parse(jsonString);

        // 덮어쓰기: config 업데이트
        config = { 
            ...config, 
            ...importedSettings 
        };
        
        // 유효성 검사 및 인덱스 조정
        if (!config.searchEngines || config.searchEngines.length === 0) {
            config.searchEngines = [...DEFAULT_SEARCH_ENGINES];
            config.searchEngineIndex = 0;
        }
        if (config.searchEngineIndex >= config.searchEngines.length) {
            config.searchEngineIndex = 0;
        }
        
        // 1. IndexedDB에 저장할 이미지 목록 생성 및 로드
        const importedImages = [];
        // ZIP 파일에서 'backgrounds/' 폴더 내의 파일을 찾습니다.
        zip.folder("backgrounds").forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                // MIME 타입을 파일 확장자에서 추론
                const mimeMatch = relativePath.match(/\.([a-z0-9]+)$/i);
                const mime = mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : 'image/png';
                // Blob 형식으로 비동기 로드하여 Promise 배열에 추가
                importedImages.push(zipEntry.async("blob").then(blob => new Blob([blob], { type: mime })));
            }
        });
        
        // 2. 이미지 로드가 완료될 때까지 기다리고 IndexedDB에 저장
        if (importedImages.length > 0) {
            const imageBlobs = await Promise.all(importedImages);
            console.log(`${imageBlobs.length}개의 배경 이미지를 IndexedDB로 불러옵니다.`);
            // 기존 이미지를 덮어쓰고 새로운 이미지 저장
            await saveImageToDB(imageBlobs);
        } else if (importedSettings.hasBackgroundImages === false) {
             // settings.json에 이미지가 없다고 명시되어 있다면, 기존 DB 이미지를 클리어
             await clearImagesFromDB();
        } 
        
        saveSettings();
        await applyAllSettings();
        updateSearchEngineDisplay();
        renderSearchEnginesList();
        
        // 파일 입력 초기화
        event.target.value = '';
        showCustomMessage("불러오기 완료", "설정이 성공적으로 불러와졌습니다.");

    } catch (error) {
        console.error("설정 불러오기 실패:", error);
        // JSON 파싱 오류 등 상세 오류 메시지 제공
        showCustomMessage("불러오기 실패", "파일을 읽거나 파싱하는 데 실패했습니다. 파일이 손상되었거나 형식이 올바르지 않습니다.");
    }
}