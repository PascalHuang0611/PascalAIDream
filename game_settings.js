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
        weather_bonus_multiplier: 0.5
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
        REALM_DEFINITIONS.forEach((realm, realmIndex) => {
            for (let layer = 1; layer <= 10; layer++) {
                let stageName = "";
                let isTribulationLevel = false;
                
                if (layer >= 1 && layer <= 3) {
                    stageName = "前期";
                    if (layer === 3) isTribulationLevel = true;
                } else if (layer >= 4 && layer <= 6) {
                    stageName = "中期";
                    if (layer === 6) isTribulationLevel = true;
                } else if (layer >= 7 && layer <= 9) {
                    stageName = "後期";
                    if (layer === 9) isTribulationLevel = true;
                } else {
                    stageName = "大圓滿";
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
                    displayName: `${realm.name} ${stageName}`,
                    fullDisplayName: `${realm.name} ${stageName} (第${layer}層)`,
                    expRequired: expRequired,
                    isTribulationLevel: isTribulationLevel,
                    tribulationSuccessRate: successRate,
                    color: realm.color,
                    realmIndex: realmIndex
                });
            }
        });
    })();

    // --- 新增：AI 提示詞設定 ---
    const AI_CONFIG = {
        model_name: "gemini-2.5-flash", 

        // AI 1: 演員 (決定想做什麼)
        PROMPT_ACTOR: `
你正在扮演一個現代職場修仙遊戲的角色。
請根據【近期記憶】、【當前狀態】與【背包物品】，決定你當下「最想做的一件事」。

【世界觀：境界階層】
{all_realms}

【近期記憶 (前情提要)】
{story_history}

【角色狀態】
- 境界：{realm}
- 地點：{location}
- 天氣：{weather} (溫度 {temp}°C)

【背包物品】
{inventory}

【指示】
1. 請從背包中選擇物品來互動 (可複選)，或者選擇「不使用物品」單純進行環境互動。
2. 你的性格是「{personality}」。
3. 請回傳 JSON 格式，不要包含其他文字。

【JSON 格式範例】
{
  "thought": "剛剛被雷劈了有點痛，看著手裡的鐵劍和回復藥，我想先喝藥再用劍引雷。",
  "target_item_ids": [123456, 789012], // 想要使用的物品 ID 列表 (可多個，若不使用則填 [])
  "action_type": "use_item",
  "intention_description": "喝下過期牛奶，並揮舞斷劍試圖驅趕野狗"
}
`,
        // AI 2: 天道 (決定發生什麼事)
        PROMPT_DM: `
你是「職場修仙」遊戲的 GM (天道系統)。
玩家剛才產生了一個意圖，請根據他的【近期經歷】、行動、運氣以及物品的特性，生成一段有趣的結果。

【世界觀：境界階層】
{all_realms}

【近期經歷 (上下文)】
{story_history}

【當前情境】
- 玩家境界：{realm}
- 環境：{weather} @ {location}
- 玩家意圖：{intention}
- 使用物品：{used_items_desc}

【指示】
1. 生成一段 50 字以內的微型修仙故事。風格要幽默、荒謬，結合現代職場與修仙元素。
2. 故事要有連貫性，參考近期經歷。
3. **物品變動判定**：
   - 【獲得物品】：支援一次獲得多個。請在 "new_items" 陣列中填寫。
   - 【失去物品】：若玩家使用的物品損壞、遺失或消耗，請將 "remove_used_items" 設為 true。
4. 請回傳 JSON 格式。

【JSON 格式範例】
{
  "story": "你試圖同時使用火符和汽油，結果引發了連鎖爆炸，雖然灰頭土臉，但意外炸出了一個前輩遺留的保險箱。",
  "result_type": "success", // success, failure, neutral
  "effect_summary": "獲得神秘保險箱，失去火符、汽油",
  "new_items": [
      { 
          "name": "神秘保險箱", 
          "icon": "🧰", 
          "tags": ["寶箱", "未知"], 
          "description": "不知道密碼，搖起來有匡噹聲。" 
      }
  ],
  "remove_used_items": true // 是否移除本次使用的所有物品
}
`
    };

    window.GameSettings = {
        BASE_SETTINGS,
        TRIBULATION_SETTINGS,
        CULTIVATION_DATA,
        AI_CONFIG // Export
    };

})(window);