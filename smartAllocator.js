// smartAllocator.js — 7~8.5 小時智慧配時演算法 (Knapsack / Subset Sum with Pruning & High Entropy Randomization)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SmartAllocator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SmartAllocator = {
    /**
     * 計算配時組合建議
     * @param {Array<{id: string, title: string, hours: number}>} candidates - 候選測項庫
     * @param {number} currentHours - 目前已選取時數（例如 5.0，或全新生成時為 0）
     * @param {object} options - 選項配置
     * @returns {{ status: string, combinations: Array<{cases: Array, addedHours: number, totalHours: number, diffFromTarget: number, statusLabel: string}>, totalCombinationsFound: number, currentHours: number }}
     */
    allocate(candidates, currentHours = 0, options = {}) {
      const targetHours = options.targetHours || 8.0;
      const minTotal = options.minTotal || 7.0;
      const maxTotal = options.maxTotal || 8.5;
      const maxItems = options.maxItems || 5;

      const currentT = Math.round(currentHours * 10);
      const targetT = Math.round(targetHours * 10);
      const minTotalT = Math.round(minTotal * 10);
      const maxTotalT = Math.round(maxTotal * 10);

      // 若目前時數已在 7~8.5 小時安全合規範圍內
      if (currentT >= minTotalT && currentT <= maxTotalT) {
        return {
          status: 'already_compliant',
          message: `目前已選 ${currentHours.toFixed(1)}h，已在 7.0 ~ 8.5 小時安全合規範圍內！`,
          combinations: [],
          totalCombinationsFound: 0,
          currentHours
        };
      }

      // 若已超過 8.5 小時
      if (currentT > maxTotalT) {
        return {
          status: 'over_budget',
          message: `目前已選 ${currentHours.toFixed(1)}h，已超過 8.5 小時上限，建議減少部分測項。`,
          combinations: [],
          totalCombinationsFound: 0,
          currentHours
        };
      }

      const minNeededT = Math.max(0, minTotalT - currentT);
      const maxNeededT = Math.max(0, maxTotalT - currentT);

      // 過濾出工時有效且不單獨超標的候選測項
      const validPool = (candidates || [])
        .filter(c => {
          const h = typeof c.hours === 'number' ? c.hours : parseFloat(c.hours);
          return !isNaN(h) && h > 0 && Math.round(h * 10) <= maxNeededT;
        })
        .map(c => ({
          ...c,
          t: Math.round((typeof c.hours === 'number' ? c.hours : parseFloat(c.hours)) * 10)
        }));

      if (validPool.length === 0) {
        return {
          status: 'no_candidates',
          message: '測項庫中無合適時數之測項可供湊數。',
          combinations: [],
          totalCombinationsFound: 0,
          currentHours
        };
      }

      // 洗牌以注入隨機性 (Fisher-Yates Shuffle)
      function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      // 依隨機順序搜尋，避免每次固定挑選相同大測項
      const pool = shuffle(validPool);
      const results = [];
      const visitedSignatures = new Set();

      // 優先搜尋 2~5 種測項之組合，上限提升至 300 組以確保充分多樣性
      function dfs(idx, currentSumT, picked, minLen = 2, maxLen = 5) {
        if (results.length >= 300) return;

        // 測項數量介於 2~5 種測項
        if (picked.length >= minLen && picked.length <= maxLen) {
          if (currentSumT >= minNeededT && currentSumT <= maxNeededT) {
            const sig = picked.map(p => p.id || p.title).sort().join('::');
            if (!visitedSignatures.has(sig)) {
              visitedSignatures.add(sig);
              const addedH = Math.round((currentSumT / 10) * 10) / 10;
              const totalH = Math.round(((currentT + currentSumT) / 10) * 10) / 10;
              const diff = Math.round(Math.abs((currentT + currentSumT) - targetT)) / 10;
              results.push({
                cases: [...picked.map(({ t, ...item }) => item)],
                addedHours: addedH,
                totalHours: totalH,
                diffFromTarget: diff,
                itemCount: picked.length,
                statusLabel: totalH === 8.0 ? '完美 8.0h' : `合規 ${totalH}h`
              });
            }
          }
        }

        if (picked.length >= maxLen || currentSumT > maxNeededT || idx >= pool.length) {
          return;
        }

        for (let i = idx; i < pool.length; i++) {
          const item = pool[i];
          if (currentSumT + item.t > maxNeededT) continue;

          picked.push(item);
          dfs(i + 1, currentSumT + item.t, picked, minLen, maxLen);
          picked.pop();

          if (results.length >= 300) break;
        }
      }

      // 第 1 階段：鎖定隨機 2~5 種測項
      dfs(0, 0, [], 2, 5);

      // 若測項時數過極端導致無法在 2~5 項湊出，則放寬至 1~6 項保底
      if (results.length === 0) {
        dfs(0, 0, [], 1, 6);
      }

      if (results.length === 0) {
        return {
          status: 'no_combination',
          message: '無法從現有測項中湊出剛好介於 7.0 ~ 8.5 小時的組合，建議手動微調。',
          combinations: [],
          totalCombinationsFound: 0,
          currentHours
        };
      }

      // 隨機抽選邏輯：
      // 1. 隨機決定要取 2、3、4 或 5 項中的哪一種項目數
      const availableCounts = Array.from(new Set(results.map(r => r.itemCount)));
      const targetCount = availableCounts[Math.floor(Math.random() * availableCounts.length)];
      const targetMatches = results.filter(r => r.itemCount === targetCount);

      // 2. 在該項目數中，挑選與 8.0h 差距最近的候選群
      const minDiff = Math.min(...targetMatches.map(r => r.diffFromTarget));
      const optimalPool = targetMatches.filter(r => r.diffFromTarget <= Math.min(minDiff + 0.5, 1.0));

      // 3. 從最佳候選群中隨機挑選 1 組作為主要推薦
      const chosenOne = optimalPool[Math.floor(Math.random() * optimalPool.length)];

      // 其餘組合洗牌後保留備用列表（提供超過 30 組以上候選組合）
      const otherCombinations = shuffle(results.filter(r => r !== chosenOne));
      const finalCombinations = [chosenOne, ...otherCombinations.slice(0, 49)];

      return {
        status: 'success',
        message: `已成功隨機湊出合規配時組合（${chosenOne.cases.length} 個測項，合計 ${chosenOne.totalHours}h，共 ${results.length} 種組合）！`,
        combinations: finalCombinations,
        totalCombinationsFound: results.length,
        currentHours
      };
    },

    /**
     * 評估當前時數狀態等級 (7.0 ~ 8.5h 合規)
     * @param {number} hours
     * @returns {'warning'|'success'|'danger'}
     */
    evaluateStatus(hours) {
      if (hours < 7.0) return 'warning';
      if (hours <= 8.5) return 'success';
      return 'danger';
    }
  };

  return SmartAllocator;
});
