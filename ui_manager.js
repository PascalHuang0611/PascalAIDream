(function(window) {
    'use strict';

    function getEl(id) { return document.getElementById(id); }

    const UIElements = {
        // --- 基礎資訊 ---
        weatherLocation: getEl('weather-location'),
        weatherCondition: getEl('weather-condition'),
        weatherTemp: getEl('weather-temp'),
        realmName: getEl('realm-name'),
        
        // 金錢 (更新)
        moneyDisplay: getEl('money-display'),
        editMoneyBtn: getEl('edit-money-btn'),
        moneyModal: getEl('money-modal'),
        moneyInput: getEl('money-input'),
        moneyCancelBtn: getEl('money-cancel-btn'),
        moneyConfirmBtn: getEl('money-confirm-btn'),

        expBar: getEl('exp-bar'),
        expCurrent: getEl('exp-current'),
        expMax: getEl('exp-max'),
        expRate: getEl('exp-rate'),
        rateDetails: getEl('rate-details'),
        
        // --- 互動與日誌 ---
        breakthroughBtn: getEl('breakthrough-btn'),
        narrativeLog: getEl('narrative-log'),
        settingsBtn: getEl('settings-btn'),
        visualArea: getEl('visual-area'),
        playerImg: getEl('player-img'),
        playerImgInput: getEl('player-img-upload'),
        
        // --- 物品欄 ---
        inventoryGrid: getEl('inventory-grid'),
        itemTooltip: getEl('item-tooltip'),
        addItemBtn: getEl('add-item-btn'),
        
        // --- Modals ---
        gmModal: getEl('gm-modal'),
        gmCancelBtn: getEl('gm-cancel-btn'),
        gmConfirmBtn: getEl('gm-confirm-btn'),
        gmInputs: { name: getEl('gm-item-name'), icon: getEl('gm-item-icon'), tags: getEl('gm-item-tags'), desc: getEl('gm-item-desc') },
        
        testAIBtn: getEl('test-ai-btn'),
        apiKeyModal: getEl('api-key-modal'),
        apiCancelBtn: getEl('api-cancel-btn'),
        apiConfirmBtn: getEl('api-confirm-btn'),
        apiKeyInput: getEl('gemini-api-key'),
        
        // --- 性格編輯器 ---
        personalityRow: getEl('personality-row'),
        currentPersonality: getEl('current-personality'),
        personalityModal: getEl('personality-modal'),
        persInput: getEl('personality-input'),
        presetTagsContainer: getEl('preset-tags'),
        persCancelBtn: getEl('pers-cancel-btn'),
        persConfirmBtn: getEl('pers-confirm-btn'),

        // --- 世界觀編輯器 ---
        worldSettingRow: getEl('world-setting-row'),
        currentWorldSetting: getEl('current-world-setting'),
        worldSettingModal: getEl('world-setting-modal'),
        worldInput: getEl('world-input'),
        worldPresetTagsContainer: getEl('world-preset-tags'),
        worldCancelBtn: getEl('world-cancel-btn'),
        worldConfirmBtn: getEl('world-confirm-btn'),

        // --- 頁籤系統 ---
        storyTabsContainer: getEl('story-tabs-container'),
        storyContentContainer: getEl('story-content-container'),

        // --- 字數控制 ---
        storyLengthSlider: getEl('story-length-slider'),
        storyLenVal: getEl('story-len-val')
    };

    let onDeleteCallback = null;
    let roundCount = 0; 
    let activeTabId = null;

    // --- 輔助函式 ---
    function translateWeatherCode(code) { const weatherMap = { 0: "晴天 ☀️", 1: "晴時多雲 🌤️", 2: "多雲 🌥️", 3: "陰天 ☁️", 45: "霧 🌫️", 48: "霧 🌫️", 51: "毛毛雨 💧", 53: "毛毛雨 💧", 61: "雨天 🌧️", 63: "大雨 🌧️", 80: "陣雨 🌦️", 95: "雷雨 ⛈️" }; return weatherMap[code] || "未知天氣"; }
    function updateWeatherUI(location, condition, temp) { if(UIElements.weatherLocation) UIElements.weatherLocation.textContent = location; if(UIElements.weatherCondition) UIElements.weatherCondition.textContent = condition; if(UIElements.weatherTemp) UIElements.weatherTemp.textContent = temp; }
    
    // 更新金錢 UI
    function updateMoneyUI(amount) {
        if (!UIElements.moneyDisplay) return;
        UIElements.moneyDisplay.textContent = amount;
        if (amount < 0) {
            UIElements.moneyDisplay.classList.add('debt');
            UIElements.moneyDisplay.textContent = `${amount} (負債)`;
        } else {
            UIElements.moneyDisplay.classList.remove('debt');
        }
    }

    // 設定 GM 金錢修改器
    function setupMoneyEditor(onUpdateMoney) {
        if (!UIElements.editMoneyBtn) return;
        
        UIElements.editMoneyBtn.addEventListener('click', () => {
            // 抓取當前顯示的金額 (去掉文字部分)
            let currentVal = parseInt(UIElements.moneyDisplay.textContent);
            if (isNaN(currentVal)) currentVal = 0;
            UIElements.moneyInput.value = currentVal;
            UIElements.moneyModal.style.display = 'flex';
        });

        UIElements.moneyCancelBtn.addEventListener('click', () => {
            UIElements.moneyModal.style.display = 'none';
        });

        UIElements.moneyConfirmBtn.addEventListener('click', () => {
            const newVal = parseInt(UIElements.moneyInput.value);
            if (!isNaN(newVal)) {
                onUpdateMoney(newVal);
                UIElements.moneyModal.style.display = 'none';
                addLog(`【GM】命運修正：資產變更為 ${newVal} TWD`, '#FFD700');
            } else {
                alert("請輸入有效的數字");
            }
        });
    }

    function updateCultivationUI(data) {
        if (!UIElements.realmName) return;
        const { levelData, currentExp, isAwaitingTribulation, currentRate, rateBreakdown } = data;
        UIElements.realmName.textContent = levelData.fullDisplayName || levelData.displayName;
        UIElements.realmName.style.color = levelData.color;
        const percentage = Math.min(100, (currentExp / levelData.expRequired) * 100);
        UIElements.expBar.style.width = `${percentage}%`;
        UIElements.expCurrent.textContent = Math.floor(currentExp);
        UIElements.expMax.textContent = levelData.expRequired;
        UIElements.expRate.textContent = currentRate.toFixed(1);
        let tooltipHTML = `<div>基礎速度: +${rateBreakdown.base.toFixed(1)}</div>`;
        if (rateBreakdown.weather > 0) tooltipHTML += `<div style="color: #4caf50;">天氣加成: +${rateBreakdown.weather.toFixed(1)}</div>`;
        UIElements.rateDetails.innerHTML = tooltipHTML;
        if (isAwaitingTribulation) {
            UIElements.breakthroughBtn.textContent = "🔥 境界突破 🔥";
            UIElements.breakthroughBtn.disabled = false;
            UIElements.breakthroughBtn.classList.add('ready');
        } else {
            UIElements.breakthroughBtn.textContent = "修練中...";
            UIElements.breakthroughBtn.disabled = true;
            UIElements.breakthroughBtn.classList.remove('ready');
        }
    }

    // --- 開啟新一輪故事 (頁籤) ---
    function startNewStoryRound() {
        if (!UIElements.storyTabsContainer || !UIElements.storyContentContainer) {
            UIElements.storyTabsContainer = document.getElementById('story-tabs-container');
            UIElements.storyContentContainer = document.getElementById('story-content-container');
            if (!UIElements.storyTabsContainer) return null;
        }

        roundCount++;
        const tabId = `round-${roundCount}`;
        
        if (roundCount === 1) {
            UIElements.storyContentContainer.innerHTML = '';
        }

        const allTabs = UIElements.storyTabsContainer.querySelectorAll('.story-tab');
        if (allTabs.length >= 5) {
            const firstTab = allTabs[0];
            const firstContent = document.getElementById(firstTab.dataset.target);
            firstTab.remove();
            if (firstContent) firstContent.remove();
        }

        const tabBtn = document.createElement('div');
        tabBtn.className = 'story-tab active'; 
        tabBtn.textContent = `第 ${roundCount} 回`;
        tabBtn.dataset.target = tabId;
        tabBtn.addEventListener('click', () => switchStoryTab(tabId));
        UIElements.storyTabsContainer.appendChild(tabBtn);

        const contentDiv = document.createElement('div');
        contentDiv.id = tabId;
        contentDiv.className = 'story-cycle-content active';
        contentDiv.innerHTML = `<div class="sc-section"><div class="sc-title loading-dots">天道推演中</div></div>`;
        UIElements.storyContentContainer.appendChild(contentDiv);

        switchStoryTab(tabId);
        UIElements.storyTabsContainer.scrollLeft = UIElements.storyTabsContainer.scrollWidth;

        return tabId;
    }

    function switchStoryTab(tabId) {
        activeTabId = tabId;
        document.querySelectorAll('.story-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === tabId);
        });
        document.querySelectorAll('.story-cycle-content').forEach(div => {
            div.classList.toggle('active', div.id === tabId);
        });
    }

    function updateStoryContent(targetTabId, htmlContent) {
        if (!targetTabId) return;
        const targetDiv = document.getElementById(targetTabId);
        if (targetDiv) {
            targetDiv.innerHTML = htmlContent;
        }
    }

    function addStory(title, content, effect = null, color = '#ccc') {
        const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        let html = `
            <div class="sc-section" style="border-left-color: ${color === '#f44336' ? '#f44336' : '#FFD700'}; animation: fadeIn 0.5s ease;">
                <div class="sc-title" style="color: ${color};">${title} (${time})</div>
                <div class="sc-text">${content}</div>
                ${effect ? `<div class="sc-effect">✨ ${effect}</div>` : ''}
            </div>
        `;

        if (activeTabId) {
            const targetDiv = document.getElementById(activeTabId);
            if (targetDiv) {
                targetDiv.insertAdjacentHTML('beforeend', html);
                targetDiv.scrollTop = targetDiv.scrollHeight;
                return;
            }
        }
        addLog(`[${title}] ${content}`, color);
    }

    // --- 故事長度滑桿 ---
    function setupStoryLengthSlider() {
        if (UIElements.storyLengthSlider && UIElements.storyLenVal) {
            UIElements.storyLengthSlider.addEventListener('input', (e) => {
                UIElements.storyLenVal.textContent = e.target.value;
            });
        }
    }

    function getStoryLength() {
        return UIElements.storyLengthSlider ? parseInt(UIElements.storyLengthSlider.value) : 100;
    }

    // --- 性格編輯器 ---
    function updatePersonalityUI(personalityText) { if(UIElements.currentPersonality) UIElements.currentPersonality.textContent = personalityText; }
    function setupPersonalityEditor(onUpdatePersonality) {
        if(!UIElements.personalityRow) return;
        UIElements.personalityRow.addEventListener('click', () => { UIElements.persInput.value = UIElements.currentPersonality.textContent; UIElements.personalityModal.style.display = 'flex'; });
        const presets = window.GameSettings.PERSONALITIES || []; UIElements.presetTagsContainer.innerHTML = '';
        presets.forEach(p => { const tag = document.createElement('span'); tag.className = 'preset-tag'; tag.textContent = p; tag.addEventListener('click', () => { UIElements.persInput.value = p; }); UIElements.presetTagsContainer.appendChild(tag); });
        UIElements.persCancelBtn.addEventListener('click', () => { UIElements.personalityModal.style.display = 'none'; });
        UIElements.persConfirmBtn.addEventListener('click', () => { const newPersonality = UIElements.persInput.value.trim(); if (newPersonality) { onUpdatePersonality(newPersonality); UIElements.personalityModal.style.display = 'none'; addLog(`心性轉變：${newPersonality}`, "#00bcd4"); } });
    }

    // --- 世界觀編輯器 ---
    function updateWorldSettingUI(worldSettingText) { 
        if(UIElements.currentWorldSetting) {
            UIElements.currentWorldSetting.textContent = worldSettingText.length > 20 ? worldSettingText.substring(0, 20) + '...' : worldSettingText; 
            UIElements.currentWorldSetting.title = worldSettingText; 
        }
    }
    
    function setupWorldSettingEditor(onUpdateWorldSetting) {
        if(!UIElements.worldSettingRow) return;
        
        UIElements.worldSettingRow.addEventListener('click', () => { 
            UIElements.worldInput.value = UIElements.currentWorldSetting.title || UIElements.currentWorldSetting.textContent; 
            UIElements.worldSettingModal.style.display = 'flex'; 
        });

        const presets = window.GameSettings.WORLD_PRESETS || ["現代職場社畜 (預設)"]; 
        UIElements.worldPresetTagsContainer.innerHTML = '';
        presets.forEach(p => { 
            const tag = document.createElement('span'); 
            tag.className = 'preset-tag'; 
            tag.textContent = p; 
            tag.addEventListener('click', () => { UIElements.worldInput.value = p; }); 
            UIElements.worldPresetTagsContainer.appendChild(tag); 
        });

        UIElements.worldCancelBtn.addEventListener('click', () => { UIElements.worldSettingModal.style.display = 'none'; });
        
        UIElements.worldConfirmBtn.addEventListener('click', () => { 
            const newSetting = UIElements.worldInput.value.trim(); 
            if (newSetting) { 
                onUpdateWorldSetting(newSetting); 
                UIElements.worldSettingModal.style.display = 'none'; 
                addLog(`世界重塑：${newSetting}`, "#e91e63"); 
            } 
        });
    }

    function updateInventoryUI(inventory) {
        const grid = document.getElementById('inventory-grid');
        if (!grid) { console.error("Critical Error: 'inventory-grid' element not found in DOM."); return; }
        grid.innerHTML = ''; const totalSlots = 16;
        for (let i = 0; i < totalSlots; i++) {
            const slot = document.createElement('div'); slot.className = 'item-slot'; const item = inventory[i];
            if (item) { slot.innerHTML = `<span class="item-icon">${item.icon || '📦'}</span>`; slot.addEventListener('mouseenter', (e) => showItemTooltip(e, item)); slot.addEventListener('mouseleave', hideItemTooltip); slot.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm(`【GM 操作】\n確定要將「${item.name}」從存在中抹除嗎？`)) { if (onDeleteCallback && item.id) { onDeleteCallback(item.id); } else { console.error("Delete failed: Item has no ID or callback missing", item); if (onDeleteCallback && typeof item.id === 'undefined') { addLog("錯誤：該物品沒有靈魂烙印 (UID)，無法精確刪除。", "red"); } } hideItemTooltip(); } }); }
            grid.appendChild(slot);
        }
    }
    
    function showItemTooltip(e, item) { const tooltip = UIElements.itemTooltip; tooltip.querySelector('.tooltip-title').textContent = item.name; tooltip.querySelector('.tooltip-tags').textContent = item.tags.join(', '); tooltip.querySelector('.tooltip-desc').textContent = item.description; tooltip.style.display = 'block'; const rect = e.target.getBoundingClientRect(); tooltip.style.left = `${rect.right + 10}px`; tooltip.style.top = `${rect.top}px`; }
    function hideItemTooltip() { UIElements.itemTooltip.style.display = 'none'; }
    function setupGMTools(onAddItem, onDeleteItem) {
        onDeleteCallback = onDeleteItem;
        UIElements.addItemBtn.addEventListener('click', () => { UIElements.gmModal.style.display = 'flex'; });
        UIElements.gmCancelBtn.addEventListener('click', () => { UIElements.gmModal.style.display = 'none'; clearGMInputs(); });
        UIElements.gmConfirmBtn.addEventListener('click', () => { const name = UIElements.gmInputs.name.value.trim(); if (!name) return alert("物品名稱不可為空"); const newItem = { id: Date.now(), name: name, icon: UIElements.gmInputs.icon.value.trim() || '📦', tags: UIElements.gmInputs.tags.value.split(/[,，]/).map(t => t.trim()).filter(t => t), description: UIElements.gmInputs.desc.value.trim() || "這物品平平無奇，看不出什麼來歷。" }; onAddItem(newItem); UIElements.gmModal.style.display = 'none'; clearGMInputs(); addLog(`【GM】賜予物品：${newItem.name}`, '#e91e63'); });
    }
    function clearGMInputs() { UIElements.gmInputs.name.value = ''; UIElements.gmInputs.icon.value = '📦'; UIElements.gmInputs.tags.value = ''; UIElements.gmInputs.desc.value = ''; }

    function setupAITesting(onTriggerAI) {
        let cachedKey = '';
        UIElements.testAIBtn.addEventListener('click', () => { if (cachedKey) { onTriggerAI(cachedKey); } else { UIElements.apiKeyModal.style.display = 'flex'; } });
        UIElements.apiCancelBtn.addEventListener('click', () => { UIElements.apiKeyModal.style.display = 'none'; });
        UIElements.apiConfirmBtn.addEventListener('click', () => { const key = UIElements.apiKeyInput.value.trim(); if (key) { cachedKey = key; UIElements.apiKeyModal.style.display = 'none'; onTriggerAI(cachedKey); } else { alert("請輸入 API Key"); } });
    }
    function setAITestingState(isLoading) { const btn = UIElements.testAIBtn; if (isLoading) { btn.disabled = true; btn.textContent = "☁️ 天道推演中..."; btn.style.opacity = "0.6"; btn.style.cursor = "not-allowed"; } else { btn.disabled = false; btn.textContent = "🔮 測試 AI 天道"; btn.style.opacity = "1"; btn.style.cursor = "pointer"; } }

    function setupPlayerImageHandler(onImageChanged) {
        UIElements.playerImg.addEventListener('click', () => { UIElements.playerImgInput.click(); });
        UIElements.playerImgInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = function(event) { const base64String = event.target.result; updatePlayerImage(base64String); if (onImageChanged) onImageChanged(base64String); }; reader.readAsDataURL(file); } });
    }
    function updatePlayerImage(base64String) { if (base64String) { UIElements.playerImg.src = base64String; } }
    function addLog(text, color = '#bbb') { 
        if (!UIElements.narrativeLog) return;
        const p = document.createElement('p'); const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); p.innerHTML = `<span class="log-time">${time}</span> <span style="color: ${color}">${text}</span>`; UIElements.narrativeLog.appendChild(p); UIElements.narrativeLog.scrollTop = UIElements.narrativeLog.scrollHeight; if (UIElements.narrativeLog.children.length > 50) UIElements.narrativeLog.removeChild(UIElements.narrativeLog.firstChild); 
    }
    function showFloatingExp(amount) { 
        if (!UIElements.visualArea) return;
        const el = document.createElement('div'); el.className = 'exp-float'; el.textContent = `+${amount}`; const x = 50 + (Math.random() - 0.5) * 20; const y = 40; el.style.left = `${x}%`; el.style.top = `${y}%`; UIElements.visualArea.appendChild(el); setTimeout(() => el.remove(), 1500); 
    }

    window.UIManager = {
        UIElements, translateWeatherCode, updateWeatherUI, updateCultivationUI, updateInventoryUI, updateMoneyUI, setupMoneyEditor, // Export
        setupGMTools, setupAITesting, setAITestingState, setupPlayerImageHandler, updatePlayerImage, addLog, addStory, showFloatingExp,
        setupPersonalityEditor, updatePersonalityUI,
        setupWorldSettingEditor, updateWorldSettingUI, 
        startNewStoryRound, updateStoryContent,
        setupStoryLengthSlider, getStoryLength 
    };
})(window);