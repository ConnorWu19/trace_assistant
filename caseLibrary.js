// caseLibrary.js — Parser, Search & Storage Helper for Case Library
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CaseLibrary = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function splitLineTokens(line, delimiter) {
    if (delimiter === '\t') {
      return line.split('\t').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }
    // Simple CSV splitter respecting basic quotes
    const tokens = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        tokens.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    tokens.push(current.trim().replace(/^["']|["']$/g, ''));
    return tokens;
  }

  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
    let tabCount = 0;
    let commaCount = 0;
    let semiCount = 0;
    lines.forEach(line => {
      tabCount += (line.match(/\t/g) || []).length;
      commaCount += (line.match(/,/g) || []).length;
      semiCount += (line.match(/;/g) || []).length;
    });
    if (tabCount >= lines.length && tabCount >= commaCount) return '\t';
    if (commaCount >= lines.length) return ',';
    if (semiCount >= lines.length) return ';';
    return '\t';
  }

  /**
   * Scans rows to find the actual table header row (skipping banner/metadata rows).
   */
  function findHeaderRow(rows) {
    let bestRowIdx = -1;
    let maxScore = 0;

    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const row = rows[r];
      let score = 0;

      row.forEach(cell => {
        const c = String(cell || '').trim().toLowerCase();
        if (/test[\s_-]?case[\s_-]?name/.test(c)) score += 100;
        else if (/case[\s_-]?name|測項名稱/.test(c)) score += 80;
        else if (/planned[\s_-]?attended[\s_-]?time/.test(c)) score += 100;
        else if (/attended[\s_-]?time|planned[\s_-]?time/.test(c)) score += 60;
        else if (/in[\s_-]?minutes|minutes?|分鐘/.test(c)) score += 40;
        else if (/test[\s_-]?case[\s_-]?id/.test(c)) score += 60;
        else if (/case[\s_-]?id|tc[\s_-]?id/.test(c)) score += 50;
        else if (/^(id|tc|編號|代碼)$/.test(c)) score += 30;
        else if (/^(title|summary|name|測項|項目|名稱)$/.test(c)) score += 30;
        else if (/hours?|工時|時數|預估/.test(c)) score += 30;
      });

      if (score > maxScore) {
        maxScore = score;
        bestRowIdx = r;
      }
    }

    return { headerRowIdx: maxScore >= 40 ? bestRowIdx : -1, score: maxScore };
  }

  /**
   * Maps header cells to title, time, and id columns based on priority.
   */
  function mapColumns(headerTokens) {
    const colMap = {
      titleCol: -1,
      timeCol: -1,
      idCol: -1,
      isMinutesCol: false
    };

    const tokens = headerTokens.map(h => String(h || '').trim().toLowerCase());

    // 1. Detect Test Case Name (Title)
    // Priority 1: Exact "Test Case Name" or "測項名稱"
    colMap.titleCol = tokens.findIndex(h => /test[\s_-]?case[\s_-]?name/.test(h));
    if (colMap.titleCol === -1) {
      colMap.titleCol = tokens.findIndex(h => /case[\s_-]?name|測項名稱/.test(h));
    }
    if (colMap.titleCol === -1) {
      colMap.titleCol = tokens.findIndex(h => /^(test[\s_-]?case|title|summary|測項|名稱|項目)$/.test(h));
    }
    if (colMap.titleCol === -1) {
      colMap.titleCol = tokens.findIndex(h => /(title|summary|測項)/.test(h) && !/project|author|suite|tester/.test(h));
    }

    // 2. Detect Planned Attended Time in Minutes (Time)
    colMap.timeCol = tokens.findIndex(h => /planned[\s_-]?attended[\s_-]?time/.test(h));
    if (colMap.timeCol === -1) {
      colMap.timeCol = tokens.findIndex(h => /attended[\s_-]?time/.test(h));
    }
    if (colMap.timeCol === -1) {
      colMap.timeCol = tokens.findIndex(h => /planned[\s_-]?time/.test(h));
    }
    if (colMap.timeCol === -1) {
      colMap.timeCol = tokens.findIndex(h => /in[\s_-]?minutes|minutes?|分鐘/.test(h));
    }
    if (colMap.timeCol === -1) {
      colMap.timeCol = tokens.findIndex(h => /hours?|時數|工時|預估/.test(h));
    }
    if (colMap.timeCol === -1) {
      colMap.timeCol = tokens.findIndex(h => /time|duration|耗時/.test(h) && !/start|end|update|create/.test(h));
    }

    if (colMap.timeCol !== -1) {
      const headerText = tokens[colMap.timeCol];
      colMap.isMinutesCol = /min|分鐘/i.test(headerText);
    }

    // 3. Detect Test Case ID (optional)
    colMap.idCol = tokens.findIndex(h => /test[\s_-]?case[\s_-]?id/.test(h));
    if (colMap.idCol === -1) {
      colMap.idCol = tokens.findIndex(h => /case[\s_-]?id|tc[\s_-]?id|測項代碼|測項編號/.test(h));
    }
    if (colMap.idCol === -1) {
      colMap.idCol = tokens.findIndex(h => /^(case[\s_-]?id|id|tc|編號|代碼)$/.test(h));
    }
    if (colMap.idCol === -1) {
      colMap.idCol = tokens.findIndex(h => /test[\s_-]?case[\s_-]?no\.?|case[\s_-]?no\.?/.test(h));
    }

    // Avoid collision: titleCol and idCol must not be the same
    if (colMap.titleCol === colMap.idCol) {
      colMap.idCol = -1;
    }

    return colMap;
  }

  /**
   * Normalizes time into minutes, hours, and formatted display.
   */
  function parseTimeVal(val, isMinutesCol) {
    let num = 0;
    let explicitMinutes = isMinutesCol;

    if (typeof val === 'number') {
      num = isNaN(val) ? 0 : val;
    } else {
      const str = String(val || '').trim();
      if (!str) return { minutes: 60, hours: 1.0, timeDisplay: '60m (1.0h)' };
      if (/min|分/i.test(str)) explicitMinutes = true;
      const numMatch = str.match(/\d+(\.\d+)?/);
      num = numMatch ? parseFloat(numMatch[0]) : 0;
    }

    if (num <= 0) {
      return { minutes: 60, hours: 1.0, timeDisplay: '60m (1.0h)' };
    }

    let minutes = 0;
    let hours = 0;

    if (explicitMinutes || num > 20) {
      // Interpreted as minutes (e.g. 120, 60, 30, 45, 90)
      minutes = Math.round(num);
      hours = Math.round((minutes / 60) * 10) / 10;
    } else {
      // Interpreted as hours (e.g. 0.5, 1.0, 1.5, 2.0)
      hours = Math.round(num * 10) / 10;
      minutes = Math.round(hours * 60);
    }

    return {
      minutes,
      hours,
      timeDisplay: `${minutes}m (${hours.toFixed(1)}h)`
    };
  }

  const CaseLibrary = {
    /**
     * Parses an array of 2D row arrays into test case objects.
     * Extracts strictly Test Case Name and Planned Attended Time without concatenating other columns.
     * @param {Array<Array<any>>} rows
     * @returns {{ cases: Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string}>, totalParsed: number, errors: string[] }}
     */
    parseRows(rows) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { cases: [], totalParsed: 0, errors: ['內容無有效資料'] };
      }

      // Filter out completely empty rows
      const cleanRows = rows
        .map(r => Array.isArray(r) ? r.map(c => c === null || c === undefined ? '' : String(c).trim()) : [])
        .filter(r => r.some(c => c.length > 0));

      if (cleanRows.length === 0) {
        return { cases: [], totalParsed: 0, errors: ['表格內容為空'] };
      }

      const { headerRowIdx, score } = findHeaderRow(cleanRows);
      let startIndex = 0;
      let colMap = { titleCol: -1, timeCol: -1, idCol: -1, isMinutesCol: false };

      if (headerRowIdx !== -1) {
        startIndex = headerRowIdx + 1;
        colMap = mapColumns(cleanRows[headerRowIdx]);
      } else {
        // Fallback if no header row was detected:
        // Try column 0 as id or title, column 1 as title, column 2 as time
        if (cleanRows[0].length === 1) {
          colMap.titleCol = 0;
        } else if (cleanRows[0].length === 2) {
          colMap.titleCol = 0;
          colMap.timeCol = 1;
        } else {
          colMap.idCol = 0;
          colMap.titleCol = 1;
          colMap.timeCol = 2;
        }
      }

      // If titleCol still could not be determined, pick column with highest average string length
      if (colMap.titleCol === -1) {
        let maxAvgLen = -1;
        let bestCol = 0;
        const checkRows = cleanRows.slice(startIndex, startIndex + 10);
        const colCount = cleanRows[0].length;
        for (let c = 0; c < colCount; c++) {
          if (c === colMap.idCol || c === colMap.timeCol) continue;
          let totalLen = 0;
          checkRows.forEach(r => totalLen += (r[c] || '').length);
          const avgLen = totalLen / Math.max(checkRows.length, 1);
          if (avgLen > maxAvgLen) {
            maxAvgLen = avgLen;
            bestCol = c;
          }
        }
        colMap.titleCol = bestCol;
      }

      const parsedCases = [];
      const errors = [];
      let generatedCounter = 1;

      for (let i = startIndex; i < cleanRows.length; i++) {
        const tokens = cleanRows[i];
        if (tokens.length === 0 || tokens.every(t => !t)) continue;

        // Extract title (Test Case Name)
        let title = colMap.titleCol !== -1 && tokens[colMap.titleCol] !== undefined
          ? String(tokens[colMap.titleCol]).trim()
          : '';

        // If title is empty, this row has no valid test case name, skip it
        if (!title) continue;

        // Skip if this row is a repeated header row
        if (/test[\s_-]?case[\s_-]?name|測項名稱/i.test(title)) continue;

        // Extract time (Planned Attended Time in Minutes)
        const rawTime = colMap.timeCol !== -1 && tokens[colMap.timeCol] !== undefined
          ? tokens[colMap.timeCol]
          : null;
        const timeData = parseTimeVal(rawTime, colMap.isMinutesCol);

        // Extract id (Test Case ID) if available; otherwise generate one
        let id = '';
        if (colMap.idCol !== -1 && tokens[colMap.idCol] !== undefined) {
          id = String(tokens[colMap.idCol]).trim();
        }
        if (!id) {
          id = `TC-${String(generatedCounter).padStart(3, '0')}`;
        }
        generatedCounter++;

        parsedCases.push({
          id,
          title,
          hours: timeData.hours,
          minutes: timeData.minutes,
          timeDisplay: timeData.timeDisplay
        });
      }

      return {
        cases: parsedCases,
        totalParsed: parsedCases.length,
        errors
      };
    },

    /**
     * Parses pasted Excel (TSV) or CSV text into an array of case objects.
     * @param {string} rawText
     * @returns {{ cases: Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string}>, totalParsed: number, errors: string[] }}
     */
    parseImportText(rawText) {
      if (!rawText || typeof rawText !== 'string') {
        return { cases: [], totalParsed: 0, errors: ['內容為空'] };
      }

      const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) {
        return { cases: [], totalParsed: 0, errors: ['內容無有效文字行'] };
      }

      const delimiter = detectDelimiter(rawText);
      const rows = lines.map(line => splitLineTokens(line, delimiter));
      return this.parseRows(rows);
    },

    /**
     * Parses an Excel .xlsx or .xls file from ArrayBuffer or Buffer.
     * @param {ArrayBuffer|Buffer} arrayBuffer
     * @returns {{ cases: Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string}>, totalParsed: number, errors: string[] }}
     */
    parseXlsxArrayBuffer(arrayBuffer) {
      const xlsxLib = typeof XLSX !== 'undefined'
        ? XLSX
        : (typeof require !== 'undefined' ? require('./xlsx.mini.min.js') : null);

      if (!xlsxLib) {
        throw new Error('未載入 XLSX 解析核心 (xlsx.mini.min.js)');
      }

      const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(arrayBuffer);
      const wb = xlsxLib.read(arrayBuffer, { type: isBuffer ? 'buffer' : 'array' });

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        return { cases: [], totalParsed: 0, errors: ['Excel 檔案中找不到任何工作表'] };
      }

      // Find first sheet or sheet matching case/test/plan/測項
      let targetSheetName = wb.SheetNames[0];
      const matched = wb.SheetNames.find(n => /case|test|plan|測項|清單/i.test(n));
      if (matched) targetSheetName = matched;

      const sheet = wb.Sheets[targetSheetName];
      const rows = xlsxLib.utils.sheet_to_json(sheet, { header: 1 });
      return this.parseRows(rows);
    },

    /**
     * Fuzzy search cases with multi-token matching and relevance ranking.
     * Focuses on Test Case Name search matching.
     * @param {Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string}>} cases
     * @param {string} query
     * @returns {Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string, score: number}>}
     */
    fuzzySearch(cases, query) {
      if (!Array.isArray(cases) || cases.length === 0) return [];
      const trimmed = (query || '').trim().toLowerCase();
      if (!trimmed) {
        return cases.map(c => ({ ...c, score: 0 }));
      }

      const tokens = trimmed.split(/\s+/).filter(Boolean);
      const results = [];

      for (let i = 0; i < cases.length; i++) {
        const item = cases[i];
        const idLower = (item.id || '').toLowerCase();
        const titleLower = (item.title || '').toLowerCase();
        const combined = idLower + ' ' + titleLower;

        let matchesAll = true;
        let score = 0;

        for (const token of tokens) {
          const inTitle = titleLower.includes(token);
          const inId = idLower.includes(token);

          if (!inTitle && !inId) {
            matchesAll = false;
            break;
          }

          // Test Case Name matching takes high priority
          if (titleLower === token) score += 200;
          else if (titleLower.startsWith(token)) score += 100;
          else if (inTitle) score += 60;

          if (idLower === token) score += 80;
          else if (inId) score += 30;
        }

        if (matchesAll) {
          if (titleLower === trimmed) score += 150;
          else if (titleLower.includes(trimmed)) score += 80;
          if (idLower === trimmed) score += 50;

          results.push({
            ...item,
            score
          });
        }
      }

      results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
      return results;
    },

    /**
     * Merges new cases into an existing case library.
     * Uses title (or id if present) to deduplicate.
     * @param {Array} existingCases
     * @param {Array} newCases
     * @param {'merge'|'overwrite'} mode
     * @returns {Array}
     */
    mergeCases(existingCases = [], newCases = [], mode = 'merge') {
      if (mode === 'overwrite') {
        const map = new Map();
        newCases.forEach(c => {
          if (c && c.title) {
            const key = (c.id ? c.id + '::' : '') + c.title.toLowerCase();
            map.set(key, c);
          }
        });
        return Array.from(map.values());
      }

      const map = new Map();
      existingCases.forEach(c => {
        if (c && c.title) {
          const key = (c.id ? c.id + '::' : '') + c.title.toLowerCase();
          map.set(key, c);
        }
      });
      newCases.forEach(c => {
        if (c && c.title) {
          const key = (c.id ? c.id + '::' : '') + c.title.toLowerCase();
          map.set(key, { ...(map.get(key) || {}), ...c });
        }
      });
      return Array.from(map.values());
    },

    /**
     * Extracts cases from table rows in DOM.
     * @param {HTMLTableElement|Array<HTMLTableRowElement>|Document} container
     * @returns {Array<{id: string, title: string, hours: number, minutes: number, timeDisplay: string}>}
     */
    harvestFromDOM(container) {
      if (!container) return [];
      const rows = container.querySelectorAll ? container.querySelectorAll('tr') : [];
      if (!rows || rows.length === 0) return [];

      const rawRows = [];
      rows.forEach(r => {
        const cells = Array.from(r.children);
        rawRows.push(cells.map(c => (c.textContent || '').trim()));
      });

      const parsed = this.parseRows(rawRows);
      return parsed.cases;
    }
  };

  return CaseLibrary;
});
