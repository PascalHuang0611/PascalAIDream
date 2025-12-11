document.addEventListener('DOMContentLoaded', () => {

    const settings = window.GameSettings;
    const ui = window.UIManager;

    const SAVE_KEY = 'officeCultivation_v1';

    // --- 設定檔處理 ---
    const Config = {
        baseExpRate: settings?.BASE_SETTINGS?.base_exp_rate || 1.0,
        tickRate: settings?.BASE_SETTINGS?.tick_rate_ms || 1000,
        saveInterval: settings?.BASE_SETTINGS?.save_interval_ms || 5000,
        weatherInterval: settings?.BASE_SETTINGS?.weather_api_interval || 900000,
        cultivationData: settings?.CULTIVATION_DATA || [],
        aiConfig: settings?.AI_CONFIG || {}
    };

    if (Config.cultivationData.length === 0) {
        ui.addLog("嚴重錯誤：讀取不到境界數據", "red");
        return;
    }

    // --- 遊戲狀態 ---
    let state = {
        levelIndex: 0,           
        exp: 0,                  
        isAwaitingTribulation: false,
        playerImageData: null,
        inventory: [] 
    };

    let env = {
        temp: 25,
        humidity: 60,
        weatherCode: 0,
        locationName: "未知靈脈"
    };

    // --- API 呼叫核心 (Gemini) ---
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
            
            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("AI 內容被安全過濾器攔截，請嘗試較為溫和的劇情。");
            }

            let text = data.candidates[0].content.parts[0].text;
            text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");

            return JSON.parse(text); 

        } catch (error) {
            console.error("Gemini Call Failed:", error);
            ui.addLog(`AI 通訊失敗`, "red");
            ui.addStory("天道異常", `連結失敗：${error.message}`, null, "#f44336");
            return null;
        }
    }

    // --- 雙 AI 迴圈邏輯 ---
    async function triggerAIDualLoop(apiKey) {
        // 1. 鎖定按鈕
        ui.setAITestingState(true);

        try {
            const currentRealm = Config.cultivationData[state.levelIndex].displayName;
            const weatherStr = `${ui.translateWeatherCode(env.weatherCode)} (濕度${env.humidity}%)`;
            const inventoryStr = state.inventory.map(i => `- [ID:${i.id}] ${i.name} (${i.tags.join(',')})`).join('\n') || "背包空空如也";
            const personality = "貪財好色，但又極度怕死";
            
            // 境界列表字串
            const allRealmsList = [...new Set(Config.cultivationData.map(d => d.realmName))].join(' > ');

            ui.addStory("AI 1 (演員) 思考中...", "正在根據環境與背包決定行動...", null, "#00bcd4");

            let prompt1 = Config.aiConfig.PROMPT_ACTOR
                .replace('{all_realms}', allRealmsList)
                .replace('{realm}', currentRealm)
                .replace('{location}', env.locationName)
                .replace('{weather}', weatherStr)
                .replace('{temp}', env.temp)
                .replace('{inventory}', inventoryStr)
                .replace('{personality}', personality);

            const actorResult = await callGeminiAPI(prompt1, apiKey);
            if (!actorResult) return; // 錯誤已在 callGeminiAPI 處理，直接返回

            console.log("AI 1 Output:", actorResult);
            ui.addStory("角色意圖", actorResult.thought, null, "#aaa");

            let usedItemName = "無";
            let usedItemDesc = "空手";
            let usedItemId = null;

            if (actorResult.target_item_id) {
                const item = state.inventory.find(i => i.id == actorResult.target_item_id);
                if (item) {
                    usedItemName = item.name;
                    usedItemDesc = item.description;
                    usedItemId = item.id;
                }
            }

            ui.addStory("AI 2 (天道) 推演中...", `玩家試圖：${actorResult.intention_description}`, null, "#e91e63");

            let prompt2 = Config.aiConfig.PROMPT_DM
                .replace('{all_realms}', allRealmsList)
                .replace('{realm}', currentRealm)
                .replace('{weather}', weatherStr)
                .replace('{location}', env.locationName)
                .replace('{intention}', actorResult.intention_description)
                .replace('{item_name}', usedItemName)
                .replace('{item_desc}', usedItemDesc);

            const dmResult = await callGeminiAPI(prompt2, apiKey);
            if (!dmResult) return;

            console.log("AI 2 Output:", dmResult);

            const color = dmResult.result_type === 'success' ? '#4caf50' : (dmResult.result_type === 'failure' ? '#f44336' : '#FFD700');
            
            ui.addStory("天道裁決", dmResult.story, dmResult.effect_summary, color);

            // 處理物品變動
            let inventoryChanged = false;

            if (dmResult.new_item) {
                const newItem = { ...dmResult.new_item, id: Date.now() };
                if (!Array.isArray(newItem.tags)) newItem.tags = ["未知"];
                state.inventory.push(newItem);
                inventoryChanged = true;
                ui.addLog(`獲得物品：${newItem.name}`, "#FFD700");
                ui.addStory("獲得物品", `你獲得了 [${newItem.name}]！`, null, "#FFD700");
            }

            if (dmResult.remove_used_item && usedItemId) {
                state.inventory = state.inventory.filter(item => item.id !== usedItemId);
                inventoryChanged = true;
                ui.addLog(`失去物品：${usedItemName}`, "#f44336");
                ui.addStory("失去物品", `[${usedItemName}] 已損壞或消失。`, null, "#f44336");
            }

            if (inventoryChanged) {
                saveGame();
                ui.updateInventoryUI(state.inventory);
            }

        } catch (e) {
            console.error("Logic Error:", e);
            ui.addStory("系統錯誤", "推演邏輯發生未知錯誤", null, "#f44336");
        } finally {
            // 2. 解鎖按鈕 (無論成功失敗都會執行)
            ui.setAITestingState(false);
        }
    }

    // --- 標準遊戲迴圈 (Tick) ---
    function gameLoop() {
        if (state.isAwaitingTribulation) return; 

        const rate = calculateExpRate();
        const gain = rate.total;

        if (!isNaN(gain)) { state.exp += gain; }
        
        checkLevelUp();
        refreshUI(rate);

        if (gain > 0) { ui.showFloatingExp(gain.toFixed(1)); }
    }

    function calculateExpRate() {
        const base = Config.baseExpRate;
        let weatherBonus = 0;
        
        if (env.temp >= 15 && env.temp <= 32) weatherBonus += 0.5;
        if (env.humidity >= 40 && env.humidity <= 80) weatherBonus += 0.2;
        if ([51, 53, 61, 63, 80].includes(env.weatherCode)) weatherBonus += 1.0;
        if ([95, 96, 99].includes(env.weatherCode)) weatherBonus += 2.0;

        return { base: base, weather: weatherBonus, total: base + weatherBonus };
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
        if ([95, 96, 99].includes(env.weatherCode)) { successRate += 0.2; ui.addLog("天雷滾滾，渡劫成功率提升！", '#e91e63'); }
        const roll = Math.random();
        ui.addLog(`開始嘗試突破... (成功率: ${(successRate*100).toFixed(0)}%)`);
        ui.UIElements.breakthroughBtn.disabled = true;

        setTimeout(() => {
            if (roll < successRate) {
                ui.addLog("轟——！體內金丹運轉，霞光萬丈！", '#4caf50');
                performLevelUp();
            } else {
                ui.addLog("噗——！真氣逆行，突破失敗...", '#f44336');
                state.exp = Math.floor(state.exp * 0.8);
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
        ui.updateCultivationUI({ levelData: levelData, currentExp: state.exp, isAwaitingTribulation: state.isAwaitingTribulation, currentRate: rate.total, rateBreakdown: rate });
        ui.updateInventoryUI(state.inventory);
    }

    function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    function loadGame() {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                state = { ...state, ...parsed };
                if (!Array.isArray(state.inventory)) state.inventory = [];
                if (state.levelIndex >= Config.cultivationData.length) { state.levelIndex = 0; state.exp = 0; ui.addLog("存檔過舊重置。", "orange"); }
                if (state.playerImageData) ui.updatePlayerImage(state.playerImageData);
                ui.addLog("讀取修仙進度成功。");
            } catch (e) { console.error(e); ui.addLog("存檔損毀。", "red"); }
        } else {
            ui.addLog("歡迎來到職場修仙世界。");
            state.inventory.push({ id: Date.now(), name: "新手木劍", icon: "🗡️", tags: ["武器", "木屬性"], description: "一把普通的木劍，據說是隔壁老王小時候用過的。" });
        }
    }
    function clearSave() { if(confirm("確定重置？")) { localStorage.removeItem(SAVE_KEY); location.reload(); } }

    async function fetchWeather() {
        if (!navigator.geolocation) { ui.updateWeatherUI("瀏覽器不支援", "未知", "--"); return; }
        navigator.geolocation.getCurrentPosition(async (position) => {
            try {
                const lat = position.coords.latitude; const lon = position.coords.longitude;
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const geoData = await geoRes.json();
                env.locationName = geoData.address.city || geoData.address.town || "靈山某處";
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`);
                const weatherData = await weatherRes.json();
                env.temp = weatherData.current.temperature_2m;
                env.humidity = weatherData.current.relative_humidity_2m;
                env.weatherCode = weatherData.current.weather_code;
                const weatherStr = ui.translateWeatherCode(env.weatherCode);
                ui.updateWeatherUI(env.locationName, weatherStr, env.temp);
                ui.addLog(`偵測環境：${weatherStr}, ${env.temp}°C`);
                refreshUI(calculateExpRate());
            } catch (e) { console.error(e); ui.addLog("天氣感應失敗。", '#f44336'); }
        });
    }

    function init() {
        ui.setupPlayerImageHandler((base64Data) => { state.playerImageData = base64Data; saveGame(); ui.addLog("已更換法相！", "#FFD700"); });
        ui.setupGMTools((newItem) => { state.inventory.push(newItem); saveGame(); ui.updateInventoryUI(state.inventory); }, (itemId) => { state.inventory = state.inventory.filter(item => item.id !== itemId); saveGame(); ui.updateInventoryUI(state.inventory); ui.addLog("【GM】物品已抹除。", "#f44336"); });
        
        // --- 綁定 AI 測試 ---
        ui.setupAITesting((apiKey) => {
            triggerAIDualLoop(apiKey);
        });

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