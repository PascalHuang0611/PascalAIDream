document.addEventListener('DOMContentLoaded', () => {

    const settings = window.GameSettings;
    const ui = window.UIManager;

    const SAVE_KEY = 'officeCultivation_v1';

    // ... (Config) ...
    const Config = {
        baseExpRate: settings?.BASE_SETTINGS?.base_exp_rate || 1.0,
        tickRate: settings?.BASE_SETTINGS?.tick_rate_ms || 1000,
        saveInterval: settings?.BASE_SETTINGS?.save_interval_ms || 5000,
        weatherInterval: settings?.BASE_SETTINGS?.weather_api_interval || 900000,
        cultivationData: settings?.CULTIVATION_DATA || [],
        personalities: settings?.PERSONALITIES || ["普通人"],
        worldPresets: settings?.WORLD_PRESETS || ["現代職場社畜 (預設)"],
        aiConfig: settings?.AI_CONFIG || {}
    };

    if (Config.cultivationData.length === 0) {
        ui.addLog("嚴重錯誤：讀取不到境界數據", "red");
        return;
    }

    let state = {
        levelIndex: 0,           
        exp: 0,                  
        isAwaitingTribulation: false,
        playerImageData: null,
        inventory: [],
        storyHistory: [], 
        personality: "貪財好色，但又極度怕死",
        worldSetting: "現代職場社畜 (黑色幽默)" 
    };

    let env = {
        temp: 25,
        humidity: 60,
        weatherCode: 0,
        locationName: "未知靈脈"
    };

    // --- 輔助函式：四捨五入至小數點第二位 ---
    function round(num) {
        return Math.round(num * 100) / 100;
    }

    // ... (callGeminiAPI) ...
    async function callGeminiAPI(prompt, apiKey) {
        const MODEL_NAME = Config.aiConfig.model_name || 'gemini-2.5-flash';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { response_mime_type: "application/json" }
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error ${response.status} (${errorData.error?.status || 'Unknown'}): ${errorData.error?.message || response.statusText}`);
            }
            
            const data = await response.json();
            if (!data.candidates || data.candidates.length === 0) { throw new Error("AI 內容被安全過濾器攔截。"); }
            let text = data.candidates[0].content.parts[0].text;
            text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
            return JSON.parse(text); 
        } catch (error) {
            console.error("Gemini Call Failed:", error);
            ui.addStory("天道異常", `連結失敗：${error.message}`, null, "#f44336");
            return null;
        }
    }

    // ... (triggerAIDualLoop 引用新的設定結構) ...
    async function triggerAIDualLoop(apiKey) {
        ui.setAITestingState(true);
        const currentRoundId = ui.startNewStoryRound();
        
        let currentRoundHTML = `<div class="sc-section"><div class="sc-title" style="color: #00bcd4;">AI 1 (演員) 思考中...</div><div class="sc-text loading-dots">正在觀察背包與環境...</div></div>`;
        ui.updateStoryContent(currentRoundId, currentRoundHTML);

        try {
            const currentRealm = Config.cultivationData[state.levelIndex].displayName;
            const weatherStr = `${ui.translateWeatherCode(env.weatherCode)} (濕度${env.humidity}%)`;
            const inventoryStr = state.inventory.map(i => `- [ID:${i.id}] ${i.name} [${i.tags.join(', ')}]\n  📖 記憶: ${i.description}`).join('\n') || "背包空空如也";
            const personality = state.personality || "普通人";
            const worldSetting = state.worldSetting || "現代職場社畜"; 
            const allRealmsList = [...new Set(Config.cultivationData.map(d => d.realmName))].join(' > ');
            const historyStr = state.storyHistory.slice(-5).map((s, i) => `${i+1}. ${s}`).join('\n') || "無近期記憶";
            
            const wordLimit = ui.getStoryLength();
            const itemCount = state.inventory.length;

            // --- 修改：從 Config 讀取動態指令 ---
            const dynamicRules = Config.aiConfig.DYNAMIC_INSTRUCTIONS || { 
                POOR: { actor: "找東西", dm: "給東西" }, 
                RICH: { actor: "用東西", dm: "拆東西" }, 
                NORMAL: { actor: "", dm: "" } 
            };

            let selectedRule = dynamicRules.NORMAL;
            if (itemCount <= 2) {
                selectedRule = dynamicRules.POOR;
            } else if (itemCount >= 8) {
                selectedRule = dynamicRules.RICH;
            }

            // 替換變數 {itemCount}
            const actorDynamicInstruction = selectedRule.actor.replace('{itemCount}', itemCount);
            const dmDynamicInstruction = selectedRule.dm.replace('{itemCount}', itemCount);

            // 注入 world_setting 與 動態指令
            let prompt1 = Config.aiConfig.PROMPT_ACTOR
                .replace('{world_setting}', worldSetting)
                .replace('{all_realms}', allRealmsList)
                .replace('{story_history}', historyStr)
                .replace('{realm}', currentRealm)
                .replace('{location}', env.locationName)
                .replace('{weather}', weatherStr)
                .replace('{temp}', env.temp)
                .replace('{inventory}', inventoryStr)
                .replace('{personality}', personality)
                .replace('{dynamic_instruction}', actorDynamicInstruction); // 使用 replace 替換 placeholder
            
            const actorResult = await callGeminiAPI(prompt1, apiKey);
            if (!actorResult) return;

            currentRoundHTML = `
                <div class="sc-section">
                    <div class="sc-title" style="color: #00bcd4;">角色意圖</div>
                    <div class="sc-actor-text">"${actorResult.thought}"</div>
                    <div class="sc-text">👉 ${actorResult.intention_description}</div>
                </div>
                <div class="sc-section">
                    <div class="sc-title" style="color: #e91e63;">AI 2 (天道) 推演中...</div>
                    <div class="sc-text loading-dots">正在計算物品因果...</div>
                </div>
            `;
            ui.updateStoryContent(currentRoundId, currentRoundHTML);

            let usedItemsDesc = "未使用物品";
            let usedItemIds = [];
            let targetIds = actorResult.target_item_ids;
            if (!targetIds && actorResult.target_item_id) { targetIds = [actorResult.target_item_id]; }

            if (Array.isArray(targetIds) && targetIds.length > 0) {
                const usedItemsInfo = [];
                targetIds.forEach(tid => {
                    const item = state.inventory.find(i => i.id == tid);
                    if (item) { 
                        usedItemsInfo.push(`【${item.name}】[${item.tags.join(', ')}]\n(說明: ${item.description})`);
                        usedItemIds.push(item.id); 
                    }
                });
                if (usedItemsInfo.length > 0) { usedItemsDesc = usedItemsInfo.join("\n + "); }
            }

            // 注入 world_setting 與 動態指令
            let prompt2 = Config.aiConfig.PROMPT_DM
                .replace('{world_setting}', worldSetting)
                .replace('{all_realms}', allRealmsList)
                .replace('{story_history}', historyStr)
                .replace('{realm}', currentRealm)
                .replace('{weather}', weatherStr)
                .replace('{location}', env.locationName)
                .replace('{intention}', actorResult.intention_description)
                .replace('{used_items_desc}', usedItemsDesc)
                .replace('{word_limit}', wordLimit)
                .replace('{dynamic_instruction}', dmDynamicInstruction); // 使用 replace 替換 placeholder

            const dmResult = await callGeminiAPI(prompt2, apiKey);
            if (dmResult.error) throw new Error(dmResult.error);

            const resultColor = dmResult.result_type === 'success' ? '#4caf50' : (dmResult.result_type === 'failure' ? '#f44336' : '#FFD700');
            
            currentRoundHTML = `
                <div class="sc-section">
                    <div class="sc-title" style="color: #00bcd4;">角色意圖</div>
                    <div class="sc-actor-text">"${actorResult.thought}"</div>
                    <div class="sc-text">👉 ${actorResult.intention_description}</div>
                </div>
                <div class="sc-section" style="border-left-color: ${resultColor}">
                    <div class="sc-title" style="color: ${resultColor};">天道裁決</div>
                    <div class="sc-text">${dmResult.story}</div>
                    ${dmResult.effect_summary ? `<div class="sc-effect">✨ ${dmResult.effect_summary}</div>` : ''}
                </div>
            `;
            ui.updateStoryContent(currentRoundId, currentRoundHTML);

            // 更新歷史記錄
            state.storyHistory.push(dmResult.story);
            if (state.storyHistory.length > 5) state.storyHistory.shift();

            const currentRealmData = Config.cultivationData[state.levelIndex];
            if (dmResult.exp_change_percentage && dmResult.exp_change_percentage !== 0) {
                const deltaPercentage = parseInt(dmResult.exp_change_percentage);
                if (!isNaN(deltaPercentage)) {
                    // 數值修正：計算變化量並四捨五入
                    const rawExpDelta = currentRealmData.expRequired * (deltaPercentage / 100);
                    const expDelta = round(rawExpDelta);

                    if (expDelta !== 0) {
                        if (state.isAwaitingTribulation && expDelta > 0) {
                            ui.addLog(`修為已至瓶頸，頓悟化為雲煙。`, "#aaa");
                        } else {
                            const oldExp = state.exp;
                            // 數值修正：加總後四捨五入
                            state.exp = round(state.exp + expDelta);

                            if (state.exp < 0) state.exp = 0;
                            if (state.exp > currentRealmData.expRequired) state.exp = currentRealmData.expRequired;
                            
                            // 計算實際變化量（顯示用）
                            const actualChange = round(state.exp - oldExp);
                            
                            if (actualChange > 0) {
                                ui.addLog(`天道賜福：修為增加 ${actualChange} (${deltaPercentage}%)`, "#4caf50");
                                ui.showFloatingExp(actualChange);
                            } else if (actualChange < 0) {
                                ui.addLog(`道心受損：修為減少 ${Math.abs(actualChange)} (${deltaPercentage}%)`, "#f44336");
                            }
                            checkLevelUp();
                            refreshUI(calculateExpRate());
                            saveGame(); // 重要事件後立即存檔
                        }
                    }
                }
            }

            let inventoryChanged = false;
            let newItemsList = dmResult.new_items;
            if (!newItemsList && dmResult.new_item) { newItemsList = [dmResult.new_item]; }

            if (Array.isArray(newItemsList) && newItemsList.length > 0) {
                newItemsList.forEach(itemData => {
                    const newItem = { ...itemData, id: Date.now() + Math.floor(Math.random()*1000) };
                    if (!Array.isArray(newItem.tags)) newItem.tags = ["未知"];
                    state.inventory.push(newItem);
                    ui.addLog(`獲得物品：${newItem.name}`, "#FFD700");
                });
                inventoryChanged = true;
            }

            if ((dmResult.remove_used_items || dmResult.remove_used_item) && usedItemIds.length > 0) {
                state.inventory = state.inventory.filter(item => !usedItemIds.includes(item.id));
                inventoryChanged = true;
                ui.addLog(`失去物品：${usedItemsDesc}`, "#f44336"); 
            }

            if (inventoryChanged) { saveGame(); ui.updateInventoryUI(state.inventory); }

        } catch (e) { 
            console.error("Logic Error:", e); 
            ui.updateStoryContent(currentRoundId, `<div class="sc-section"><div class="sc-title" style="color: #f44336;">系統錯誤</div><div class="sc-text">${e.message || "未知錯誤"}</div></div>`);
        } finally { 
            ui.setAITestingState(false); 
        }
    }

    // ... (gameLoop, calculateExpRate 等保持不變) ...
    function gameLoop() { 
        if (state.isAwaitingTribulation) return; 
        const rate = calculateExpRate(); 
        const gain = rate.total; 
        if (!isNaN(gain)) { 
            state.exp = round(state.exp + gain);
        } 
        checkLevelUp(); 
        refreshUI(rate); 
        if (gain > 0) { 
            ui.showFloatingExp(gain.toFixed(1)); 
        } 
    }

    function calculateExpRate() { 
        const base = Config.baseExpRate; 
        let weatherBonus = 0; 
        if (env.temp >= 15 && env.temp <= 32) weatherBonus += 0.5; 
        if (env.humidity >= 40 && env.humidity <= 80) weatherBonus += 0.2; 
        if ([51, 53, 61, 63, 80].includes(env.weatherCode)) weatherBonus += 1.0; 
        if ([95, 96, 99].includes(env.weatherCode)) weatherBonus += 2.0; 
        
        return { 
            base: base, 
            weather: round(weatherBonus), 
            total: round(base + weatherBonus) 
        }; 
    }

    function checkLevelUp() { 
        const currentLevelData = Config.cultivationData[state.levelIndex]; 
        if (!currentLevelData) return; 
        if (state.exp >= currentLevelData.expRequired) { 
            state.exp = currentLevelData.expRequired; 
            if (currentLevelData.isTribulationLevel) { 
                if (!state.isAwaitingTribulation) { 
                    state.isAwaitingTribulation = true; 
                    ui.addLog(`修為已至瓶頸，需進行【${currentLevelData.stageName}】突破！`, '#FFD700'); 
                } 
            } else { 
                performLevelUp(); 
            } 
        } 
    }

    function performLevelUp() { 
        if (state.levelIndex + 1 >= Config.cultivationData.length) { 
            ui.addLog("已達世界巔峰，獨孤求敗！", "#FFD700"); 
            return; 
        } 
        state.levelIndex++; 
        state.exp = 0; 
        state.isAwaitingTribulation = false; 
        const newLevel = Config.cultivationData[state.levelIndex]; 
        ui.addLog(`突破成功！晉升至【${newLevel.displayName}】`, '#00bcd4'); 
        saveGame(); 
    }

    function handleBreakthrough() { 
        if (!state.isAwaitingTribulation) return; 
        const currentLevelData = Config.cultivationData[state.levelIndex]; 
        let successRate = currentLevelData.tribulationSuccessRate; 
        if ([95, 96, 99].includes(env.weatherCode)) { 
            successRate += 0.2; 
            ui.addLog("天雷滾滾，渡劫成功率提升！", '#e91e63'); 
        } 
        const roll = Math.random(); 
        ui.addLog(`開始嘗試突破... (成功率: ${(successRate*100).toFixed(0)}%)`); 
        ui.UIElements.breakthroughBtn.disabled = true; 
        setTimeout(() => { 
            if (roll < successRate) { 
                ui.addLog("轟——！體內金丹運轉，霞光萬丈！", '#4caf50'); 
                performLevelUp(); 
            } else { 
                ui.addLog("噗——！真氣逆行，突破失敗...", '#f44336'); 
                // 數值修正：失敗懲罰後四捨五入
                state.exp = round(state.exp * 0.8); 
                state.isAwaitingTribulation = false; 
                ui.addLog("境界跌落，需重新累積靈氣。", '#888'); 
                refreshUI(calculateExpRate()); 
            } 
            saveGame(); 
            ui.UIElements.breakthroughBtn.disabled = false; 
        }, 1000); 
    }

    function refreshUI(rate) { 
        const levelData = Config.cultivationData[state.levelIndex]; 
        if (!levelData) return; 
        ui.updateCultivationUI({ 
            levelData: levelData, 
            currentExp: state.exp, // 傳入已四捨五入的 exp
            isAwaitingTribulation: state.isAwaitingTribulation, 
            currentRate: rate.total, 
            rateBreakdown: rate 
        }); 
        ui.updateInventoryUI(state.inventory); 
    }
    
    // --- 存檔系統 ---
    function saveGame() { 
        localStorage.setItem(SAVE_KEY, JSON.stringify(state)); 
    }
    
    // --- 讀檔系統 ---
    function loadGame() {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
                if (!Array.isArray(state.inventory)) state.inventory = [];
                if (!Array.isArray(state.storyHistory)) state.storyHistory = []; 
                
                // 確保舊存檔有 worldSetting
                if (!state.worldSetting) { 
                    state.worldSetting = "現代職場社畜 (預設)"; 
                }

                state.inventory.forEach(item => {
                    if (!item.id) item.id = Date.now() + Math.floor(Math.random() * 100000);
                });

                if (!state.personality) { const randomPersonality = Config.personalities[Math.floor(Math.random() * Config.personalities.length)]; state.personality = randomPersonality; ui.addLog(`性格覺醒：${state.personality}`, "#FFD700"); }
                if (state.levelIndex >= Config.cultivationData.length) { state.levelIndex = 0; state.exp = 0; ui.addLog("存檔過舊重置。", "orange"); }
                if (state.playerImageData) { ui.updatePlayerImage(state.playerImageData); const hintEl = document.querySelector('.edit-hint'); if (hintEl) hintEl.style.display = 'none'; }
                
                ui.addLog("讀取修仙進度成功。");
                
            } catch (e) { console.error(e); ui.addLog("存檔損毀。", "red"); }
        } else {
            ui.addLog("歡迎來到職場修仙世界。");
            const randomPersonality = Config.personalities[Math.floor(Math.random() * Config.personalities.length)];
            state.personality = randomPersonality;
            state.worldSetting = "現代職場社畜 (預設)"; // 初始值
            ui.addLog(`性格覺醒：${state.personality}`, "#FFD700");
        }
        ui.updatePersonalityUI(state.personality);
        ui.updateWorldSettingUI(state.worldSetting); // 更新 UI
    }
    
    function clearSave() { if(confirm("確定重置？")) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
    async function fetchWeather() { if (!navigator.geolocation) { ui.updateWeatherUI("瀏覽器不支援", "未知", "--"); return; } navigator.geolocation.getCurrentPosition(async (position) => { try { const lat = position.coords.latitude; const lon = position.coords.longitude; const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`); const geoData = await geoRes.json(); env.locationName = geoData.address.city || geoData.address.town || "靈山某處"; const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`); const weatherData = await weatherRes.json(); env.temp = weatherData.current.temperature_2m; env.humidity = weatherData.current.relative_humidity_2m; env.weatherCode = weatherData.current.weather_code; const weatherStr = ui.translateWeatherCode(env.weatherCode); ui.updateWeatherUI(env.locationName, weatherStr, env.temp); ui.addLog(`偵測環境：${weatherStr}, ${env.temp}°C`); refreshUI(calculateExpRate()); } catch (e) { console.error(e); ui.addLog("天氣感應失敗。", '#f44336'); } }); }

    function init() {
        ui.setupPlayerImageHandler((base64Data) => { state.playerImageData = base64Data; saveGame(); ui.addLog("已更換法相！", "#FFD700"); const hintEl = document.querySelector('.edit-hint'); if (hintEl) hintEl.style.display = 'none'; });
        ui.setupGMTools((newItem) => { state.inventory.push(newItem); saveGame(); ui.updateInventoryUI(state.inventory); }, (itemId) => { state.inventory = state.inventory.filter(item => item.id !== itemId); saveGame(); ui.updateInventoryUI(state.inventory); ui.addLog("【GM】物品已抹除。", "#f44336"); });
        
        ui.setupPersonalityEditor((newPersonality) => { state.personality = newPersonality; saveGame(); ui.updatePersonalityUI(newPersonality); });
        
        // 綁定新的世界觀編輯器
        ui.setupWorldSettingEditor((newSetting) => { state.worldSetting = newSetting; saveGame(); ui.updateWorldSettingUI(newSetting); });

        ui.setupStoryLengthSlider();
        
        ui.setupAITesting((apiKey) => { triggerAIDualLoop(apiKey); });
        loadGame();
        fetchWeather();
        ui.UIElements.breakthroughBtn.addEventListener('click', handleBreakthrough);
        ui.UIElements.settingsBtn.addEventListener('click', clearSave);
        setInterval(gameLoop, Config.tickRate);
        setInterval(saveGame, Config.saveInterval);
        setInterval(fetchWeather, Config.weatherInterval);
        refreshUI(calculateExpRate());
    }

    init();
});