(function(window) {
    'use strict';

    const UIElements = {
        // ... 原有元素 ...
        weatherLocation: document.getElementById('weather-location'),
        weatherCondition: document.getElementById('weather-condition'),
        weatherTemp: document.getElementById('weather-temp'),
        realmName: document.getElementById('realm-name'),
        expBar: document.getElementById('exp-bar'),
        expCurrent: document.getElementById('exp-current'),
        expMax: document.getElementById('exp-max'),
        expRate: document.getElementById('exp-rate'),
        rateDetails: document.getElementById('rate-details'),
        breakthroughBtn: document.getElementById('breakthrough-btn'),
        narrativeLog: document.getElementById('narrative-log'),
        settingsBtn: document.getElementById('settings-btn'),
        visualArea: document.getElementById('visual-area'),
        playerImg: document.getElementById('player-img'),
        playerImgInput: document.getElementById('player-img-upload'),
        inventoryGrid: document.getElementById('inventory-grid'),
        itemTooltip: document.getElementById('item-tooltip'),
        addItemBtn: document.getElementById('add-item-btn'),
        gmModal: document.getElementById('gm-modal'),
        gmCancelBtn: document.getElementById('gm-cancel-btn'),
        gmConfirmBtn: document.getElementById('gm-confirm-btn'),
        gmInputs: { name: document.getElementById('gm-item-name'), icon: document.getElementById('gm-item-icon'), tags: document.getElementById('gm-item-tags'), desc: document.getElementById('gm-item-desc') },
        testAIBtn: document.getElementById('test-ai-btn'),
        apiKeyModal: document.getElementById('api-key-modal'),
        apiCancelBtn: document.getElementById('api-cancel-btn'),
        apiConfirmBtn: document.getElementById('api-confirm-btn'),
        apiKeyInput: document.getElementById('gemini-api-key'),
        storyLog: document.getElementById('story-log'),

        // --- 新增：性格相關 ---
        personalityRow: document.getElementById('personality-row'),
        currentPersonality: document.getElementById('current-personality'),
        personalityModal: document.getElementById('personality-modal'),
        persInput: document.getElementById('personality-input'),
        presetTagsContainer: document.getElementById('preset-tags'),
        persCancelBtn: document.getElementById('pers-cancel-btn'),
        persConfirmBtn: document.getElementById('pers-confirm-btn')
    };

    let onDeleteCallback = null;

    // ... (保留翻譯與天氣更新) ...
    function translateWeatherCode(code) { const weatherMap = { 0: "晴天 ☀️", 1: "晴時多雲 🌤️", 2: "多雲 🌥️", 3: "陰天 ☁️", 45: "霧 🌫️", 48: "霧 🌫️", 51: "毛毛雨 💧", 53: "毛毛雨 💧", 61: "雨天 🌧️", 63: "大雨 🌧️", 80: "陣雨 🌦️", 95: "雷雨 ⛈️" }; return weatherMap[code] || "未知天氣"; }
    function updateWeatherUI(location, condition, temp) { UIElements.weatherLocation.textContent = location; UIElements.weatherCondition.textContent = condition; UIElements.weatherTemp.textContent = temp; }
    
    // ... (保留修練 UI 更新) ...
    function updateCultivationUI(data) {
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

    // --- 新增：更新性格顯示 ---
    function updatePersonalityUI(personalityText) {
        UIElements.currentPersonality.textContent = personalityText;
    }

    // --- 新增：設定性格編輯器 ---
    function setupPersonalityEditor(onUpdatePersonality) {
        // 1. 綁定開啟 Modal
        UIElements.personalityRow.addEventListener('click', () => {
            // 填入當前值
            UIElements.persInput.value = UIElements.currentPersonality.textContent;
            UIElements.personalityModal.style.display = 'flex';
        });

        // 2. 生成預設標籤按鈕
        const presets = window.GameSettings.PERSONALITIES || [];
        UIElements.presetTagsContainer.innerHTML = '';
        presets.forEach(p => {
            const tag = document.createElement('span');
            tag.className = 'preset-tag';
            tag.textContent = p;
            tag.addEventListener('click', () => {
                UIElements.persInput.value = p; // 點擊自動填入
            });
            UIElements.presetTagsContainer.appendChild(tag);
        });

        // 3. 綁定關閉與確認
        UIElements.persCancelBtn.addEventListener('click', () => {
            UIElements.personalityModal.style.display = 'none';
        });

        UIElements.persConfirmBtn.addEventListener('click', () => {
            const newPersonality = UIElements.persInput.value.trim();
            if (newPersonality) {
                onUpdatePersonality(newPersonality);
                UIElements.personalityModal.style.display = 'none';
                addLog(`心性轉變：${newPersonality}`, "#00bcd4");
            }
        });
    }

    // ... (保留 updateInventoryUI, setupGMTools) ...
    function updateInventoryUI(inventory) {
        UIElements.inventoryGrid.innerHTML = '';
        const totalSlots = 16;
        for (let i = 0; i < totalSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            const item = inventory[i];
            if (item) {
                slot.innerHTML = `<span class="item-icon">${item.icon || '📦'}</span>`;
                slot.addEventListener('mouseenter', (e) => showItemTooltip(e, item));
                slot.addEventListener('mouseleave', hideItemTooltip);
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (confirm(`【GM 操作】\n確定要將「${item.name}」從存在中抹除嗎？`)) {
                        if (onDeleteCallback) onDeleteCallback(item.id);
                        hideItemTooltip();
                    }
                });
            }
            UIElements.inventoryGrid.appendChild(slot);
        }
    }

    function showItemTooltip(e, item) {
        const tooltip = UIElements.itemTooltip;
        tooltip.querySelector('.tooltip-title').textContent = item.name;
        tooltip.querySelector('.tooltip-tags').textContent = item.tags.join(', ');
        tooltip.querySelector('.tooltip-desc').textContent = item.description;
        tooltip.style.display = 'block';
        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = `${rect.right + 10}px`;
        tooltip.style.top = `${rect.top}px`;
    }
    function hideItemTooltip() { UIElements.itemTooltip.style.display = 'none'; }

    function setupGMTools(onAddItem, onDeleteItem) {
        onDeleteCallback = onDeleteItem;
        UIElements.addItemBtn.addEventListener('click', () => { UIElements.gmModal.style.display = 'flex'; });
        UIElements.gmCancelBtn.addEventListener('click', () => { UIElements.gmModal.style.display = 'none'; clearGMInputs(); });
        UIElements.gmConfirmBtn.addEventListener('click', () => {
            const name = UIElements.gmInputs.name.value.trim();
            if (!name) return alert("物品名稱不可為空");
            const newItem = { id: Date.now(), name: name, icon: UIElements.gmInputs.icon.value.trim() || '📦', tags: UIElements.gmInputs.tags.value.split(/[,，]/).map(t => t.trim()).filter(t => t), description: UIElements.gmInputs.desc.value.trim() || "這物品平平無奇，看不出什麼來歷。" };
            onAddItem(newItem);
            UIElements.gmModal.style.display = 'none';
            clearGMInputs();
            addLog(`【GM】賜予物品：${newItem.name}`, '#e91e63');
        });
    }
    function clearGMInputs() { UIElements.gmInputs.name.value = ''; UIElements.gmInputs.icon.value = '📦'; UIElements.gmInputs.tags.value = ''; UIElements.gmInputs.desc.value = ''; }

    // ... (保留 setupAITesting, setAITestingState, setupPlayerImageHandler, addLog, addStory, showFloatingExp) ...
    function setupAITesting(onTriggerAI) {
        let cachedKey = '';
        UIElements.testAIBtn.addEventListener('click', () => { if (cachedKey) { onTriggerAI(cachedKey); } else { UIElements.apiKeyModal.style.display = 'flex'; } });
        UIElements.apiCancelBtn.addEventListener('click', () => { UIElements.apiKeyModal.style.display = 'none'; });
        UIElements.apiConfirmBtn.addEventListener('click', () => { const key = UIElements.apiKeyInput.value.trim(); if (key) { cachedKey = key; UIElements.apiKeyModal.style.display = 'none'; onTriggerAI(cachedKey); } else { alert("請輸入 API Key"); } });
    }
    function setAITestingState(isLoading) {
        const btn = UIElements.testAIBtn;
        if (isLoading) { btn.disabled = true; btn.textContent = "☁️ 天道推演中..."; btn.style.opacity = "0.6"; btn.style.cursor = "not-allowed"; } 
        else { btn.disabled = false; btn.textContent = "🔮 測試 AI 天道"; btn.style.opacity = "1"; btn.style.cursor = "pointer"; }
    }
    function setupPlayerImageHandler(onImageChanged) {
        UIElements.playerImg.addEventListener('click', () => { UIElements.playerImgInput.click(); });
        UIElements.playerImgInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = function(event) { const base64String = event.target.result; updatePlayerImage(base64String); if (onImageChanged) onImageChanged(base64String); }; reader.readAsDataURL(file); } });
    }
    function updatePlayerImage(base64String) { if (base64String) { UIElements.playerImg.src = base64String; } }
    function addLog(text, color = '#bbb') {
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        p.innerHTML = `<span class="log-time">${time}</span> <span style="color: ${color}">${text}</span>`;
        UIElements.narrativeLog.appendChild(p);
        UIElements.narrativeLog.scrollTop = UIElements.narrativeLog.scrollHeight;
        if (UIElements.narrativeLog.children.length > 50) UIElements.narrativeLog.removeChild(UIElements.narrativeLog.firstChild);
    }
    function addStory(title, content, effect = null, color = '#ccc') {
        const entry = document.createElement('div');
        entry.className = 'story-entry';
        const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        let html = `<div class="story-title"><span>${title}</span><span>${time}</span></div><div class="story-content" style="color: ${color}">${content}</div>`;
        if (effect) { html += `<div class="story-effect">✨ ${effect}</div>`; }
        entry.innerHTML = html;
        if (title.includes("思考")) { entry.style.borderLeftColor = "#00bcd4"; } else { entry.style.borderLeftColor = color === '#f44336' ? '#f44336' : '#FFD700'; }
        UIElements.storyLog.appendChild(entry);
        UIElements.storyLog.scrollTop = UIElements.storyLog.scrollHeight;
        if (UIElements.storyLog.children.length > 20) { UIElements.storyLog.removeChild(UIElements.storyLog.firstChild); }
    }
    function showFloatingExp(amount) {
        const el = document.createElement('div');
        el.className = 'exp-float';
        el.textContent = `+${amount}`;
        const x = 50 + (Math.random() - 0.5) * 20; const y = 40; el.style.left = `${x}%`; el.style.top = `${y}%`;
        UIElements.visualArea.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    window.UIManager = {
        UIElements, translateWeatherCode, updateWeatherUI, updateCultivationUI, updateInventoryUI, setupGMTools, 
        setupAITesting, setAITestingState, setupPlayerImageHandler, updatePlayerImage, addLog, addStory, showFloatingExp,
        setupPersonalityEditor, updatePersonalityUI // Export
    };
})(window);