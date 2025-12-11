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
        // --- 可以在這裡手動修改模型名稱 (例如 gemini-2.0-flash-exp, gemini-1.5-pro 等) ---
        model_name: "gemini-2.5-flash", 

        // AI 1: 演員 (決定想做什麼)
        PROMPT_ACTOR: `
你正在扮演一個現代職場修仙遊戲的角色。
請根據目前的【狀態】與【背包物品】，決定你當下「最想做的一件事」。

【世界觀：境界階層】
{all_realms}

【角色狀態】
- 境界：{realm}
- 地點：{location}
- 天氣：{weather} (溫度 {temp}°C)

【背包物品】
{inventory}

【指示】
1. 請從背包中選擇一個物品來互動，或者選擇「不使用物品」單純進行環境互動。
2. 你的性格是「{personality}」。
3. 請回傳 JSON 格式，不要包含其他文字。

【JSON 格式範例】
{
  "thought": "看到下雨了，我想試試看能不能用這把傘吸收水靈氣。",
  "target_item_id": 123456789 (如果不使用物品則填 null),
  "action_type": "use_item" (或 "meditate", "explore"),
  "intention_description": "拿出斷掉的鐵劍，試圖引導雷電淬體"
}
`,
        // AI 2: 天道 (決定發生什麼事)
        PROMPT_DM: `
你是「職場修仙」遊戲的 GM (天道系統)。
玩家剛才產生了一個意圖，請根據他的行動、運氣以及物品的特性，生成一段有趣的結果。

【世界觀：境界階層】
{all_realms}

【當前情境】
- 玩家境界：{realm}
- 環境：{weather} @ {location}
- 玩家意圖：{intention}
- 使用物品：{item_name} ({item_desc})

【指示】
1. 生成一段 50 字以內的微型修仙故事。風格要幽默、荒謬，結合現代職場與修仙元素。
2. 判定結果是「吉 (成功)」還是「凶 (失敗/意外)」。
3. **物品變動判定 (重要)**：
   - 【獲得物品】：如果故事結果是獲得了新東西（如：貓系紅顏知己、寶物、垃圾），請在 "new_item" 欄位填寫物品資料。
   - 【失去物品】：如果故事描述玩家使用的物品（{item_name}）壞掉、遺失或被消耗，請在 "remove_used_item" 欄位填 true。
4. 請回傳 JSON 格式。

【JSON 格式範例】
{
  "story": "你試圖引雷淬體，結果劍炸了，但你卻意外練成了『靜電光環』，還撿到一塊焦黑的劍柄。",
  "result_type": "success" (或 "failure", "neutral"),
  "effect_summary": "獲得焦黑劍柄，失去鐵劍",
  "new_item": { 
      "name": "焦黑的劍柄", 
      "icon": "🗡️", 
      "tags": ["廢品", "紀念品"], 
      "description": "曾經是一把劍，現在只是個黑棒子，上面還殘留著天劫的氣息。" 
  }, // 若無獲得則 null
  "remove_used_item": true // 若物品沒壞則 false
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