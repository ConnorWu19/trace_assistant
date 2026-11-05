// sidepanel.js — Trace Assistant Side Panel Controller
(function () {
  'use strict';

  // DOM Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIconSun = document.getElementById('themeIconSun');
  const themeIconMoon = document.getElementById('themeIconMoon');
  const totalCasesBadge = document.getElementById('totalCasesBadge');

  const tabSearchBtn = document.getElementById('tabSearchBtn');
  const tabImportBtn = document.getElementById('tabImportBtn');
  const searchView = document.getElementById('searchView');
  const importView = document.getElementById('importView');

  const caseSearchInput = document.getElementById('caseSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchResultCount = document.getElementById('searchResultCount');
  const caseListContainer = document.getElementById('caseListContainer');

  // Excel 檔案上傳元件
  const xlsxFileInput = document.getElementById('xlsxFileInput');
  const fileDropZone = document.getElementById('fileDropZone');
  const dropPrimaryText = document.getElementById('dropPrimaryText');
  const dropSubText = document.getElementById('dropSubText');
  const fileActionRow = document.getElementById('fileActionRow');
  const saveFileMergeBtn = document.getElementById('saveFileMergeBtn');
  const saveFileOverwriteBtn = document.getElementById('saveFileOverwriteBtn');
  const cancelFileBtn = document.getElementById('cancelFileBtn');
  const fileStatusMsg = document.getElementById('fileStatusMsg');

  const storageSummaryText = document.getElementById('storageSummaryText');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const clearLibraryBtn = document.getElementById('clearLibraryBtn');
  const sideToast = document.getElementById('sideToast');

  // 7~9 小時即時時數儀表板與湊數元件
  const allocatorStatusTag = document.getElementById('allocatorStatusTag');
  const allocatorHoursText = document.getElementById('allocatorHoursText');
  const allocatorBarFill = document.getElementById('allocatorBarFill');
  const smartAllocateBtn = document.getElementById('smartAllocateBtn');
  const copyTodayListBtn = document.getElementById('copyTodayListBtn');
  const copyPureIdsBtn = document.getElementById('copyPureIdsBtn');
  const clearTodayListBtn = document.getElementById('clearTodayListBtn');
  const allocationSuggestionBox = document.getElementById('allocationSuggestionBox');
  const suggTotalHours = document.getElementById('suggTotalHours');
  const closeSuggBtn = document.getElementById('closeSuggBtn');
  const suggCasesList = document.getElementById('suggCasesList');
  const applySuggBtn = document.getElementById('applySuggBtn');
  const copySuggIdsBtn = document.getElementById('copySuggIdsBtn');

  // 今日已選操作托盤
  const todayTray = document.getElementById('todayTray');
  const todayTrayBadge = document.getElementById('todayTrayBadge');
  const todayTrayList = document.getElementById('todayTrayList');

  let currentCases = [];
  let pendingFileCases = [];
  let todaySelectedCases = [];
  let currentSuggestion = null;
  let toastTimer = null;

  // --- 主題切換與同步 ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    // 同步更新瀏覽器外框與 Edge 側邊欄頂部 Header 顏色，消除死白
    const metaTheme = document.getElementById('themeColorMeta');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#090a0f' : '#ffffff');
    }
    const metaScheme = document.getElementById('colorSchemeMeta');
    if (metaScheme) {
      metaScheme.setAttribute('content', theme === 'dark' ? 'dark' : 'light');
    }

    if (theme === 'light') {
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    } else {
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    }
  }

  function initTheme() {
    chrome.storage.local.get(['theme'], (res) => {
      applyTheme(res.theme || 'dark');
    });

    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      chrome.storage.local.set({ theme: next });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.theme) {
        applyTheme(changes.theme.newValue);
      }
    });
  }

  // --- Toast 浮動提示 ---
  function showToast(msg, duration = 2000) {
    if (toastTimer) clearTimeout(toastTimer);
    sideToast.textContent = msg;
    sideToast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      sideToast.classList.add('hidden');
    }, duration);
  }

  // --- Tab 切換 ---
  function switchTab(target) {
    if (target === 'search') {
      tabSearchBtn.classList.add('active');
      tabSearchBtn.setAttribute('aria-selected', 'true');
      tabImportBtn.classList.remove('active');
      tabImportBtn.setAttribute('aria-selected', 'false');
      searchView.classList.remove('hidden');
      importView.classList.add('hidden');
      caseSearchInput.focus();
    } else {
      tabImportBtn.classList.add('active');
      tabImportBtn.setAttribute('aria-selected', 'true');
      tabSearchBtn.classList.remove('active');
      tabSearchBtn.setAttribute('aria-selected', 'false');
      importView.classList.remove('hidden');
      searchView.classList.add('hidden');
    }
  }

  // --- 載入與更新測項快取與今日工時選取 ---
  function getSelectedHours() {
    return todaySelectedCases.reduce((acc, c) => acc + (c.hours || 0), 0);
  }

  function updateAllocatorDashboard() {
    const total = Math.round(getSelectedHours() * 10) / 10;
    if (allocatorHoursText) {
      allocatorHoursText.textContent = `${total.toFixed(1)}h / 8.0h`;
    }

    const status = window.SmartAllocator
      ? window.SmartAllocator.evaluateStatus(total)
      : (total < 7.0 ? 'warning' : (total <= 8.5 ? 'success' : 'danger'));

    if (allocatorStatusTag) {
      allocatorStatusTag.className = `allocator-status-tag ${status}`;
      if (status === 'warning') allocatorStatusTag.textContent = '<7h 未達標';
      else if (status === 'success') allocatorStatusTag.textContent = '7~8.5h 合規';
      else allocatorStatusTag.textContent = '>8.5h 超標';
    }

    if (allocatorBarFill) {
      allocatorBarFill.className = `allocator-bar-fill ${status}`;
      // 10 小時為 100%
      const pct = Math.min(100, Math.round((total / 10.0) * 100));
      allocatorBarFill.style.width = `${pct}%`;
    }

    renderTodayTray();
  }

  // 渲染今日已選托盤 (Today Tray)
  function renderTodayTray() {
    if (!todayTray || !todayTrayList) return;
    if (todaySelectedCases.length === 0) {
      todayTray.classList.add('hidden');
      todayTrayList.innerHTML = '';
      return;
    }

    todayTray.classList.remove('hidden');
    if (todayTrayBadge) todayTrayBadge.textContent = `${todaySelectedCases.length} 項`;
    todayTrayList.innerHTML = '';

    todaySelectedCases.forEach(item => {
      const row = document.createElement('div');
      row.className = 'tray-item';

      const left = document.createElement('div');
      left.className = 'tray-item-left';

      const idRow = document.createElement('div');
      idRow.className = 'tray-id-row';

      const tcIdSpan = document.createElement('span');
      tcIdSpan.className = 'tray-tc-id num';
      tcIdSpan.textContent = item.id || '無ID';
      tcIdSpan.title = '點擊單獨複製此 TC ID';
      tcIdSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(item.id || item.title, `已複製 TC ID：${item.id || item.title}`);
      });
      idRow.appendChild(tcIdSpan);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tray-item-title';
      titleSpan.textContent = item.title;
      titleSpan.title = item.title;

      left.appendChild(idRow);
      left.appendChild(titleSpan);

      const right = document.createElement('div');
      right.className = 'tray-item-right';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'tray-time num';
      timeSpan.textContent = item.timeDisplay || `${item.hours}h`;

      const fillBtn = document.createElement('button');
      fillBtn.type = 'button';
      fillBtn.className = 'tray-btn-fill';
      fillBtn.textContent = '⚡ 填入';
      fillBtn.title = '填入目前網頁聚焦的輸入框';
      fillBtn.addEventListener('click', () => {
        fillCaseIntoActiveTab(item.id || item.title);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'tray-btn-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = '從今日清單移除';
      removeBtn.addEventListener('click', () => {
        toggleSelectCase(item, false);
      });

      right.appendChild(timeSpan);
      right.appendChild(fillBtn);
      right.appendChild(removeBtn);

      row.appendChild(left);
      row.appendChild(right);
      todayTrayList.appendChild(row);
    });
  }

  function saveTodaySelectedCases(cases, callback) {
    chrome.storage.local.set({ today_allocated_cases: cases }, () => {
      todaySelectedCases = cases;
      updateAllocatorDashboard();
      renderSearchResults(caseSearchInput.value);
      if (callback) callback();
    });
  }

  function toggleSelectCase(item, select) {
    if (select) {
      if (!todaySelectedCases.some(s => s.title === item.title)) {
        saveTodaySelectedCases([...todaySelectedCases, item]);
      }
    } else {
      saveTodaySelectedCases(todaySelectedCases.filter(s => s.title !== item.title));
    }
  }

  function loadCases(callback) {
    chrome.storage.local.get(['case_library', 'today_allocated_cases'], (res) => {
      const cases = Array.isArray(res.case_library) ? res.case_library : [];
      todaySelectedCases = Array.isArray(res.today_allocated_cases) ? res.today_allocated_cases : [];

      if (cases.length === 0) {
        fetch(chrome.runtime.getURL('default_cases.json'))
          .then((r) => r.json())
          .then((defaultCases) => {
            if (Array.isArray(defaultCases) && defaultCases.length > 0) {
              chrome.storage.local.set({ case_library: defaultCases }, () => {
                currentCases = defaultCases;
                updateLibraryStats();
                updateAllocatorDashboard();
                renderSearchResults(caseSearchInput.value);
                if (callback) callback(currentCases);
              });
            } else {
              currentCases = cases;
              updateLibraryStats();
              updateAllocatorDashboard();
              renderSearchResults(caseSearchInput.value);
              if (callback) callback(currentCases);
            }
          })
          .catch(() => {
            currentCases = cases;
            updateLibraryStats();
            updateAllocatorDashboard();
            renderSearchResults(caseSearchInput.value);
            if (callback) callback(currentCases);
          });
        return;
      }

      currentCases = cases;
      updateLibraryStats();
      updateAllocatorDashboard();
      renderSearchResults(caseSearchInput.value);
      if (callback) callback(currentCases);
    });
  }

  function saveCases(cases, callback) {
    chrome.storage.local.set({ case_library: cases }, () => {
      currentCases = cases;
      updateLibraryStats();
      updateAllocatorDashboard();
      renderSearchResults(caseSearchInput.value);
      if (callback) callback();
    });
  }

  function updateLibraryStats() {
    const count = currentCases.length;
    const countEl = document.getElementById('totalCasesCount');
    if (countEl) {
      countEl.textContent = count;
    } else {
      totalCasesBadge.innerHTML = `<span class="badge-dot" aria-hidden="true"></span><span class="badge-num" id="totalCasesCount">${count}</span><span class="badge-unit">個測項</span>`;
    }
    if (storageSummaryText) {
      storageSummaryText.innerHTML = `目前已快取 <strong class="highlight-count">${count}</strong> 筆測項`;
    }
  }

  // --- 渲染搜尋結果列表 ---
  function renderSearchResults(query = '') {
    const trimmed = (query || '').trim();
    clearSearchBtn.classList.toggle('hidden', trimmed.length === 0);

    const matches = window.CaseLibrary ? window.CaseLibrary.fuzzySearch(currentCases, trimmed) : currentCases;
    searchResultCount.innerHTML = trimmed
      ? `符合搜尋：<strong class="highlight-count">${matches.length}</strong> / ${currentCases.length} 個測項`
      : `共 <strong class="highlight-count">${matches.length}</strong> 個測項已載入`;

    caseListContainer.innerHTML = '';

    if (currentCases.length === 0) {
      caseListContainer.innerHTML = `
        <div class="empty-box">
          <span class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>
            </svg>
          </span>
          <div class="empty-title">尚無測項資料</div>
          <div class="empty-sub">請切換至「匯入與管理」頁籤匯入 Excel 測項檔案。</div>
        </div>
      `;
      return;
    }

    if (matches.length === 0) {
      caseListContainer.innerHTML = `
        <div class="empty-box">
          <span class="empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/>
              <path d="M16.5 16.5L20 20"/>
              <path d="M8 11h6"/>
            </svg>
          </span>
          <div class="empty-title">找不到相符的測項</div>
          <div class="empty-sub">嘗試縮短搜尋字詞，或輸入其他關鍵字。</div>
        </div>
      `;
      return;
    }

    // Render cards
    matches.forEach(item => {
      const card = document.createElement('div');
      card.className = 'case-card';

      const isSelected = todaySelectedCases.some(s => s.title === item.title);
      if (isSelected) card.classList.add('selected');

      const header = document.createElement('div');
      header.className = 'case-card-header';

      const checkWrap = document.createElement('label');
      checkWrap.className = 'case-card-check-wrap';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'case-checkbox';
      checkbox.checked = isSelected;
      checkbox.title = isSelected ? '已選入今日清單（點擊移除）' : '勾選加入今日工時計算';
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelectCase(item, checkbox.checked);
      });
      checkWrap.appendChild(checkbox);

      const badges = document.createElement('div');
      badges.className = 'case-badges';

      // 工時標籤（分鐘 + 小時）
      const timeBadge = document.createElement('span');
      timeBadge.className = 'case-time-badge num';
      timeBadge.textContent = item.timeDisplay || `${item.hours}h`;
      timeBadge.title = `工時：${item.minutes ? item.minutes + ' 分鐘' : item.hours + ' 小時'}`;
      badges.appendChild(timeBadge);

      // Case ID 標籤（若存在且不等於測項名稱）
      if (item.id && item.id !== item.title) {
        const idTag = document.createElement('span');
        idTag.className = 'case-id-tag num';
        idTag.textContent = item.id;
        idTag.title = '點擊複製 Case ID';
        idTag.addEventListener('click', (e) => {
          e.stopPropagation();
          copyToClipboard(item.id, `已複製 Case ID：${item.id}`);
        });
        badges.appendChild(idTag);
      }

      header.appendChild(checkWrap);
      header.appendChild(badges);

      // 測項名稱 Test Case Name（卡片主體）
      const titleEl = document.createElement('div');
      titleEl.className = 'case-title';
      titleEl.textContent = item.title;

      const actions = document.createElement('div');
      actions.className = 'case-card-actions';

      const copyNameBtn = document.createElement('button');
      copyNameBtn.type = 'button';
      copyNameBtn.className = 'btn-action';
      copyNameBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>複製測項</span>
      `;
      copyNameBtn.addEventListener('click', () => {
        copyToClipboard(item.title, `已複製測項：${item.title}`);
      });

      const fillBtn = document.createElement('button');
      fillBtn.type = 'button';
      fillBtn.className = 'btn-action btn-fill';
      fillBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>填入 TC ID</span>
      `;
      fillBtn.addEventListener('click', () => {
        fillCaseIntoActiveTab(item.id || item.title);
      });

      actions.appendChild(copyNameBtn);
      actions.appendChild(fillBtn);

      card.appendChild(header);
      card.appendChild(titleEl);
      card.appendChild(actions);

      caseListContainer.appendChild(card);
    });
  }

  // --- 剪貼簿與網頁填入 ---
  function copyToClipboard(text, successMsg) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg || `已複製：${text}`);
    }).catch(() => {
      showToast(`複製失敗：${text}`);
    });
  }

  function fillCaseIntoActiveTab(textToFill) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        copyToClipboard(textToFill);
        return;
      }
      const activeTab = tabs[0];
      chrome.tabs.sendMessage(activeTab.id, { type: 'FILL_CASE_ID', caseId: textToFill }, (res) => {
        if (chrome.runtime.lastError || !res || !res.filled) {
          copyToClipboard(textToFill);
          showToast(`已複製 TC ID：${textToFill}（請在網頁貼上）`);
        } else {
          showToast(`已填入 TC ID：${textToFill}（請點選選單項目）`);
        }
      });
    });
  }

  // --- Excel / CSV / JSON 檔案上傳解析 ---
  function resetFileZone() {
    pendingFileCases = [];
    xlsxFileInput.value = '';
    dropPrimaryText.textContent = '點擊選取或拖曳檔案至此';
    dropSubText.textContent = '支援 .xlsx, .xls, .csv, .json 檔案格式';
    fileActionRow.classList.add('hidden');
    fileStatusMsg.classList.add('hidden');
  }

  function handleFileSelect(file) {
    if (!file) return;
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();

    if (!['xlsx', 'xls', 'csv', 'json'].includes(ext)) {
      fileStatusMsg.classList.remove('hidden');
      fileStatusMsg.textContent = '不支援的檔案格式，請上傳 .xlsx、.xls、.csv 或 .json 檔案。';
      return;
    }

    dropPrimaryText.textContent = `已選取：${name}`;
    dropSubText.textContent = `${(file.size / 1024).toFixed(1)} KB · 正在解析中...`;
    fileStatusMsg.classList.add('hidden');

    const reader = new FileReader();

    if (ext === 'json') {
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const raw = Array.isArray(parsed) ? parsed : (parsed.cases || []);
          const cases = raw.filter(c => c && (c.title || c.id)).map((c, i) => {
            const hours = typeof c.hours === 'number' ? c.hours : (parseFloat(c.hours) || 1.0);
            const minutes = typeof c.minutes === 'number' ? c.minutes : Math.round(hours * 60);
            return {
              id: String(c.id || `TC-${String(i + 1).padStart(3, '0')}`).trim(),
              title: String(c.title || c.id).trim(),
              hours,
              minutes,
              timeDisplay: c.timeDisplay || `${minutes}m (${hours.toFixed(1)}h)`
            };
          });
          onFileParsed(name, { cases });
        } catch (err) {
          onFileParseError(new Error('JSON 格式錯誤，無法正確解析。'));
        }
      };
      reader.readAsText(file);
    } else if (ext === 'csv') {
      reader.onload = (e) => {
        try {
          const res = window.CaseLibrary ? window.CaseLibrary.parseImportText(e.target.result) : { cases: [] };
          onFileParsed(name, res);
        } catch (err) {
          onFileParseError(err);
        }
      };
      reader.readAsText(file);
    } else {
      reader.onload = (e) => {
        try {
          const res = window.CaseLibrary ? window.CaseLibrary.parseXlsxArrayBuffer(e.target.result) : { cases: [] };
          onFileParsed(name, res);
        } catch (err) {
          onFileParseError(err);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function onFileParsed(fileName, result) {
    if (!result || !result.cases || result.cases.length === 0) {
      dropSubText.textContent = '解析失敗：未找到有效資料';
      fileStatusMsg.classList.remove('hidden');
      fileStatusMsg.textContent = '無法從檔案中辨識測項。請確認檔案格式與內容是否包含測項資料。';
      fileActionRow.classList.add('hidden');
      pendingFileCases = [];
      return;
    }

    pendingFileCases = result.cases;
    dropSubText.textContent = `成功辨識 ${pendingFileCases.length} 筆測項，請點選下方儲存方式：`;
    fileActionRow.classList.remove('hidden');
    fileStatusMsg.classList.add('hidden');
  }

  function onFileParseError(err) {
    console.error('File parse error:', err);
    dropSubText.textContent = '解析過程發生錯誤';
    fileStatusMsg.classList.remove('hidden');
    fileStatusMsg.textContent = `解析失敗：${err.message || '未知錯誤'}`;
    fileActionRow.classList.add('hidden');
    pendingFileCases = [];
  }

  function saveFileCases(mode = 'merge') {
    if (!pendingFileCases || pendingFileCases.length === 0) return;
    const count = pendingFileCases.length;
    const merged = window.CaseLibrary ? window.CaseLibrary.mergeCases(currentCases, pendingFileCases, mode) : pendingFileCases;

    saveCases(merged, () => {
      showToast(`成功匯入 ${count} 筆測項！`);
      resetFileZone();
      setTimeout(() => switchTab('search'), 600);
    });
  }

  // --- 備份與清空 ---
  function exportJson() {
    if (currentCases.length === 0) {
      showToast('目前尚無測項可匯出');
      return;
    }
    const blob = new Blob([JSON.stringify(currentCases, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_cases_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已匯出 JSON 備份檔');
  }

  function clearLibrary() {
    if (currentCases.length === 0) return;
    if (confirm(`確定要清空目前快取的全部 ${currentCases.length} 筆測項嗎？`)) {
      saveCases([], () => {
        showToast('已清空測項字典');
      });
    }
  }

  // --- 7~8.5 小時智慧湊數與清單操作 ---
  function handleSmartAllocate() {
    const currentHours = getSelectedHours();
    const selectedTitles = new Set(todaySelectedCases.map(c => c.title));
    const unselectedCandidates = currentCases.filter(c => !selectedTitles.has(c.title));

    if (!window.SmartAllocator) return;

    const result = window.SmartAllocator.allocate(unselectedCandidates, currentHours);

    if (result.status === 'already_compliant' || result.status === 'over_budget' || result.status === 'no_candidates') {
      showToast(result.message);
      return;
    }

    if (result.status === 'no_combination') {
      showToast('未能湊出 7.0 ~ 8.5 小時組合，建議手動挑選部分測項');
      return;
    }

    currentSuggestion = result.combinations[0];
    if (suggTotalHours) suggTotalHours.textContent = `${currentSuggestion.totalHours.toFixed(1)}h`;
    if (suggCasesList) {
      suggCasesList.innerHTML = '';
      currentSuggestion.cases.forEach(c => {
        const itemEl = document.createElement('div');
        itemEl.className = 'sugg-item';

        const topEl = document.createElement('div');
        topEl.className = 'sugg-item-top';

        const idBadge = document.createElement('span');
        idBadge.className = 'sugg-tc-id num';
        idBadge.textContent = c.id || '無ID';
        idBadge.title = '點擊單獨複製此 TC ID';
        idBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          copyToClipboard(c.id || c.title, `已複製 TC ID：${c.id || c.title}`);
        });

        const timeBadge = document.createElement('span');
        timeBadge.className = 'case-time-badge num';
        timeBadge.textContent = c.timeDisplay || (c.hours + 'h');

        topEl.appendChild(idBadge);
        topEl.appendChild(timeBadge);

        const titleEl = document.createElement('div');
        titleEl.className = 'sugg-item-title';
        titleEl.textContent = c.title;
        titleEl.title = c.title;

        const btmEl = document.createElement('div');
        btmEl.className = 'sugg-item-bottom';

        const actionsEl = document.createElement('div');
        actionsEl.className = 'sugg-item-actions';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'sugg-btn-mini';
        copyBtn.textContent = '📋 複製 ID';
        copyBtn.addEventListener('click', () => {
          copyToClipboard(c.id || c.title, `已複製 TC ID：${c.id || c.title}`);
        });

        const fillBtn = document.createElement('button');
        fillBtn.type = 'button';
        fillBtn.className = 'sugg-btn-mini sugg-btn-fill';
        fillBtn.textContent = '⚡ 填入';
        fillBtn.title = '填入目前網頁欄位';
        fillBtn.addEventListener('click', () => {
          fillCaseIntoActiveTab(c.id || c.title);
        });

        actionsEl.appendChild(copyBtn);
        actionsEl.appendChild(fillBtn);
        btmEl.appendChild(actionsEl);

        itemEl.appendChild(topEl);
        itemEl.appendChild(titleEl);
        itemEl.appendChild(btmEl);
        suggCasesList.appendChild(itemEl);
      });
    }

    if (allocationSuggestionBox) {
      allocationSuggestionBox.classList.remove('hidden');
    }
  }

  function applySuggestion() {
    if (!currentSuggestion || !currentSuggestion.cases) return;
    const newSelected = [...todaySelectedCases, ...currentSuggestion.cases];
    saveTodaySelectedCases(newSelected, () => {
      if (allocationSuggestionBox) allocationSuggestionBox.classList.add('hidden');
      showToast(`已採用湊數組合！累計 ${currentSuggestion.totalHours.toFixed(1)}h (安全合規)`);
    });
  }

  function copyTodayList() {
    if (todaySelectedCases.length === 0) {
      showToast('今日尚未勾選任何測項');
      return;
    }
    const lines = todaySelectedCases.map((c, i) => {
      const idPrefix = c.id ? `[${c.id}] ` : '';
      return `${i + 1}. ${idPrefix}${c.title} — ${c.timeDisplay || (c.hours + 'h')}`;
    });
    const total = Math.round(getSelectedHours() * 10) / 10;
    lines.push(`\n合計工時：${total.toFixed(1)} 小時 (${todaySelectedCases.length} 個測項)`);
    copyToClipboard(lines.join('\n'), '已複製今日測項清單與工時（含 TC ID）！');
  }

  function copyTodayPureIds() {
    if (todaySelectedCases.length === 0) {
      showToast('今日尚未選取任何測項');
      return;
    }
    const ids = todaySelectedCases.map(c => c.id || c.title).filter(Boolean);
    copyToClipboard(ids.join('\n'), `已複製 ${ids.length} 個純 TC ID（可逐行貼上）！`);
  }

  function closeSuggestionBox() {
    if (allocationSuggestionBox) {
      allocationSuggestionBox.classList.add('hidden');
    }
    currentSuggestion = null;
  }

  function clearTodayList() {
    let closedSugg = false;
    if (allocationSuggestionBox && !allocationSuggestionBox.classList.contains('hidden')) {
      closeSuggestionBox();
      closedSugg = true;
    }

    if (todaySelectedCases.length > 0) {
      saveTodaySelectedCases([], () => {
        showToast(closedSugg ? '已重置選取工時並關閉湊數建議' : '已重置今日選取工時');
      });
      return;
    }

    if (closedSugg) {
      showToast('已關閉並清除湊數建議');
    } else {
      showToast('目前無任何選取工時或建議需重置');
    }
  }

  // --- 事件監聽綁定 ---
  function initEvents() {
    tabSearchBtn.addEventListener('click', () => switchTab('search'));
    tabImportBtn.addEventListener('click', () => switchTab('import'));

    // 智慧湊數與儀表板操作
    if (smartAllocateBtn) smartAllocateBtn.addEventListener('click', handleSmartAllocate);
    if (applySuggBtn) applySuggBtn.addEventListener('click', applySuggestion);
    if (closeSuggBtn) closeSuggBtn.addEventListener('click', closeSuggestionBox);
    if (copyTodayListBtn) copyTodayListBtn.addEventListener('click', copyTodayList);
    if (copyPureIdsBtn) copyPureIdsBtn.addEventListener('click', copyTodayPureIds);
    if (clearTodayListBtn) clearTodayListBtn.addEventListener('click', clearTodayList);

    // 鍵盤快捷鍵：Esc 快速關閉湊數建議彈窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (allocationSuggestionBox && !allocationSuggestionBox.classList.contains('hidden')) {
          closeSuggestionBox();
        }
      }
    });
    if (copySuggIdsBtn) {
      copySuggIdsBtn.addEventListener('click', () => {
        if (!currentSuggestion || !currentSuggestion.cases) return;
        const ids = currentSuggestion.cases.map(c => c.id || c.title).filter(Boolean);
        copyToClipboard(ids.join('\n'), `已複製推薦組合的 ${ids.length} 個純 TC ID！`);
      });
    }

    caseSearchInput.addEventListener('input', (e) => {
      renderSearchResults(e.target.value);
    });

    clearSearchBtn.addEventListener('click', () => {
      caseSearchInput.value = '';
      renderSearchResults('');
      caseSearchInput.focus();
    });

    // Excel 檔案拖曳與選取事件
    fileDropZone.addEventListener('click', () => xlsxFileInput.click());
    xlsxFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });

    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });

    fileDropZone.addEventListener('dragleave', () => {
      fileDropZone.classList.remove('dragover');
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    saveFileMergeBtn.addEventListener('click', () => saveFileCases('merge'));
    saveFileOverwriteBtn.addEventListener('click', () => saveFileCases('overwrite'));
    cancelFileBtn.addEventListener('click', resetFileZone);

    exportJsonBtn.addEventListener('click', exportJson);
    clearLibraryBtn.addEventListener('click', clearLibrary);
  }

  // --- 初始化流程 ---
  function init() {
    initTheme();
    initEvents();
    loadCases();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
