(function(window) {
    'use strict';

    // --- 1. 基礎遊戲參數 ---
    const BASE_SETTINGS = {
        base_exp_rate: 1.0,
        tick_rate_ms: 1000,
        save_interval_ms: 5000,
        weather_api_interval: 900000
    };

    // --- 2. 渡劫參數 ---
    const TRIBULATION_SETTINGS = {
        base_success_rate: 0.5,
        weather_bonus_multiplier: 0.5,
        weather_code_multiplier: 0.3
    };

    // --- 3. 境界定義 ---
    const REALM_DEFINITIONS = [
        { name: "煉氣期", baseExp: 50, successRate: 0.95, color: "#9E9E9E" },
        { name: "築基期", baseExp: 200, successRate: 0.90, color: "#E0E0E0" },
        { name: "結丹期", baseExp: 1000, successRate: 0.85, color: "#A5D6A7" },
        { name: "元嬰期", baseExp: 5000, successRate: 0.80, color: "#90CAF9" },
        { name: "化神期", baseExp: 20000, successRate: 0.70, color: "#CE93D8" },
        { name: "煉虛期", baseExp: 100000, successRate: 0.60, color: "#FFCC80" },
        { name: "合體期", baseExp: 500000, successRate: 0.50, color: "#FFB74D" },
        { name: "大乘期", baseExp: 2000000, successRate: 0.40, color: "#FF8A65" },
        { name: "渡劫期", baseExp: 10000000, successRate: 0.30, color: "#E57373" },
        { name: "真仙境", baseExp: 50000000, successRate: 0.20, color: "#4DD0E1" }
    ];

    const CULTIVATION_DATA = [];

    // --- 4. 自動生成詳細境界數據 ---
    (function generateCultivationData() {
        function lightenHexColor(hex, percent) {
            hex = hex.replace(/^\s*#|\s*$/g, '');
            if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const newR = Math.min(255, r + Math.floor((255 - r) * (percent / 100)));
            const newG = Math.min(255, g + Math.floor((255 - g) * (percent / 100)));
            const newB = Math.min(255, b + Math.floor((255 - b) * (percent / 100)));
            return '#' + newR.toString(16).padStart(2, '0') + newG.toString(16).padStart(2, '0') + newB.toString(16).padStart(2, '0');
        }

        REALM_DEFINITIONS.forEach((realm, realmIndex) => {
            for (let layer = 1; layer <= 10; layer++) {
                let stageName = "";
                let isTribulationLevel = false;
                let stageColor = realm.color;
                
                if (layer >= 1 && layer <= 3) {
                    stageName = "前期";
                    if (layer === 3) isTribulationLevel = true;
                } else if (layer >= 4 && layer <= 6) {
                    stageName = "中期";
                    stageColor = lightenHexColor(realm.color, 20);
                    if (layer === 6) isTribulationLevel = true;
                } else if (layer >= 7 && layer <= 9) {
                    stageName = "後期";
                    stageColor = lightenHexColor(realm.color, 40);
                    if (layer === 9) isTribulationLevel = true;
                } else {
                    stageName = "大圓滿";
                    const nextRealm = REALM_DEFINITIONS[realmIndex + 1];
                    stageColor = nextRealm ? nextRealm.color : "#FFFFFF";
                    isTribulationLevel = true;
                }

                const expRequired = Math.floor(realm.baseExp * Math.pow(1.2, layer - 1));
                let successRate = realm.successRate;
                if (layer === 10 && realmIndex + 1 < REALM_DEFINITIONS.length) {
                   successRate = REALM_DEFINITIONS[realmIndex + 1].successRate;
                }

                CULTIVATION_DATA.push({
                    realmName: realm.name,
                    stageName: stageName,
                    layer: layer,
                    displayName: `${realm.name} ${stageName} (第${layer}層)`,
                    fullDisplayName: `${realm.name} ${stageName} (第${layer}層)`,
                    expRequired: expRequired,
                    isTribulationLevel: isTribulationLevel,
                    tribulationSuccessRate: successRate,
                    color: stageColor,
                    realmIndex: realmIndex
                });
            }
        });
    })();

    // --- 性格列表 ---
    const PERSONALITIES = [
        "貪財好色，但又極度怕死",
        "正義感爆棚的熱血笨蛋",
        "深思熟慮，不做沒有把握的事",
        "性格孤僻，只對修練感興趣",
        "滑頭滑腦，擅長見風轉舵",
        "慈悲為懷，連螞蟻都不忍心踩死",
        "腹黑心機，為了變強不擇手段"
    ];

    // --- 世界觀/風格預設列表 ---
    const WORLD_PRESETS = [
        "現代大學生 (風格：吐槽、搞笑、戀愛)",
        "現代職場社畜 (風格：黑色幽默、無奈)",
        "霍格華茲魔法學生 (風格：奇幻、校園)",
        "末日喪屍生存者 (風格：緊張、血腥、黑暗)",
        "賽博龐克駭客 (風格：高科技、低生活、霓虹)",
        "古代後宮宮鬥 (風格：勾心鬥角、文言文)",
        "精神病院患者 (風格：瘋狂、不可名狀、克蘇魯)",
        "異世界轉生勇者 (風格：熱血、王道、RPG)"
    ];

    // --- AI 提示詞設定 ---
    const AI_CONFIG = {
        model_name: "gemini-2.5-flash", 

        // AI 1: 演員 (決定想做什麼)
        PROMPT_ACTOR: `
你正在扮演一個【{world_setting}】世界觀下的修仙遊戲角色。
請根據【經濟狀況】、【背包物品的記憶】、【當前狀態】與【近期經歷】，決定你當下「最想做的一件事」。

【世界觀與風格設定】
{world_setting}

【修仙境界階層】
{all_realms}

【角色狀態】
- 境界：{realm}
- 地點：{location}
- 天氣：{weather} (溫度 {temp}°C)
- 性格：{personality}
- **經濟狀況：{money} TWD** (若為負數則代表【負債中】)

【背包物品 (重點！請仔細閱讀物品的記憶)】
{inventory}

【近期經歷 (輔助參考)】
{story_history}

【指示】
1. **最高優先權**：請優先根據「物品的記憶/說明」來產生行動聯想。
2. **金錢觀念**：
   - 若**富有** (金錢高)，傾向於「購買」、「揮霍」、「投資」或「享受」。
   - 若**貧窮**或**負債** (金錢低或負數)，傾向於「打工」、「乞討」、「省錢」或「鋌而走險」。
3. 從背包中選擇物品來互動 (可複選)，或者選擇「不使用物品」。
4. **【重要】動態指引**：
{dynamic_instruction}

5. 請回傳 JSON 格式。

【JSON 格式範例】
{
  "thought": "我現在負債累累，連泡麵都吃不起了... 看到地上有個硬幣，要不要撿起來？",
  "target_item_ids": [], 
  "action_type": "search", 
  "intention_description": "低頭尋找地上是否有遺落的零錢，試圖緩解債務危機"
}
`,
        // AI 2: 天道 (決定發生什麼事)
        PROMPT_DM: `
你是本遊戲的 GM (天道系統)。
玩家剛才產生了一個意圖，請根據他的【物品特性】、【經濟狀況】、【近期經歷】與行動，生成一段有趣的結果。

【世界觀與風格設定】
{world_setting}

【修仙境界階層】
{all_realms}

【當前情境】
- 玩家境界：{realm}
- 環境：{weather} @ {location}
- 玩家意圖：{intention}
- **玩家金錢：{money} TWD**

【使用物品詳情 (故事核心)】
{used_items_desc}

【近期經歷 (輔助參考)】
{story_history}

【指示】
1. **核心規則**：故事的發展必須與「物品的說明(記憶)」有強烈關聯。
2. 風格請嚴格遵守【世界觀設定】。
3. **字數控制**：請將故事長度控制在 **{word_limit} 字** 左右。
4. **物品變動判定 (請慷慨！)**：
   - 【獲得物品】：修仙界遍地是寶（或垃圾）。
     - 請在 "new_items" 陣列中填寫。
   - 【失去物品】：若玩家使用的物品損壞、遺失或消耗，請將 "remove_used_items" 設為 true。

5. **【重要】變動判定 (請根據劇情邏輯判斷，不需強制每次發生)**：
   - **修為變動 (exp_change_percentage)**：
     - 若只是普通對話或無效行動，請填 0 或不回傳。
     - 若有修練、頓悟、戰鬥或奇遇，請填寫百分比整數 (如 5 或 -10)。
   - **金錢變動 (money_change)**：
     - 若無金錢交易或損益，請填 0 或不回傳。
     - 若有打工、購買、撿到錢或賠償，請填寫整數金額 (如 +1500 或 -500)。

6. **【重要】動態法則**：
{dynamic_instruction}

【JSON 格式範例】
{
  "story": "你試圖在便利商店打工，結果因為修為太低，不小心把收銀機變成了青蛙，被店長扣薪水。",
  "result_type": "failure", // success, failure, neutral
  "effect_summary": "打工失敗，賠償店長",
  "new_items": [],
  "remove_used_items": false,
  "exp_change_percentage": 2, // 可選，無變動時可為 0
  "money_change": -500 // 可選，無變動時可為 0
}
`,
        // 動態指令庫
        DYNAMIC_INSTRUCTIONS: {
            POOR: {
                actor: `【物資匱乏模式 (目前僅 {itemCount} 件)】\n你的背包空蕩蕩的！請展現對物質的極度渴望。請將「尋找、搜索、獲取」物品設為最高優先級行動。`,
                dm: `【物資匱乏模式 (目前僅 {itemCount} 件)】\n玩家現在窮得叮噹響。請大幅提高「發現新物品」的機率，並盡量避免讓玩家失去現有物品。`
            },
            RICH: {
                actor: `【庫存過剩模式 (目前 {itemCount} 件)】\n你的背包太重了！請豪邁地使用物品。請將「使用、消耗、贈送」物品設為最高優先級行動。`,
                dm: `【庫存過剩模式 (目前 {itemCount} 件)】\n玩家背包快爆了。請大幅提高「物品損壞、遺失、消耗」的機率，並嚴格控制新物品的掉落。`
            },
            NORMAL: {
                actor: `【物資平衡模式】\n請根據當下情境自由決定行動。`,
                dm: `【物資平衡模式】\n維持正常的物品獲取與消耗機率。`
            }
        }
    };

    // --- 匯出設定到全域 ---
    window.GameSettings = {
        BASE_SETTINGS,
        TRIBULATION_SETTINGS,
        CULTIVATION_DATA,
        PERSONALITIES,
        WORLD_PRESETS, 
        AI_CONFIG
    };

})(window);