/**
 * JSON Spark - Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const jsonInput = document.getElementById('json-input');
  const outputCode = document.getElementById('output-code');
  const outputTree = document.getElementById('output-tree');
  const spacingSelect = document.getElementById('spacing-select');
  const btnFormat = document.getElementById('btn-format');
  const btnMinify = document.getElementById('btn-minify');
  const btnClear = document.getElementById('btn-clear');
  const btnLoadSample = document.getElementById('btn-load-sample');
  const btnPaste = document.getElementById('btn-paste');
  const fileUpload = document.getElementById('file-upload');
  const dropZone = document.getElementById('drop-zone');
  
  // Validation Alert elements
  const validationAlert = document.getElementById('validation-alert');
  const validationErrorMsg = document.getElementById('validation-error-msg');
  const btnJumpToError = document.getElementById('btn-jump-to-error');
  
  // Mode selectors
  const btnModeCode = document.getElementById('btn-mode-code');
  const btnModeTree = document.getElementById('btn-mode-tree');
  const outputCodeContainer = document.getElementById('output-code-container');
  const outputTreeContainer = document.getElementById('output-tree-container');

  // Search elements
  const btnSearchToggle = document.getElementById('btn-search-toggle');
  const searchInputWrapper = document.getElementById('search-input-wrapper');
  const searchInput = document.getElementById('search-input');
  const btnSearchPrev = document.getElementById('btn-search-prev');
  const btnSearchNext = document.getElementById('btn-search-next');
  const searchMatchesCount = document.getElementById('search-matches-count');

  // Utilities
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');

  // History Elements
  const btnHistoryToggle = document.getElementById('btn-history-toggle');
  const sidebarHistory = document.getElementById('sidebar-history');
  const btnHistoryClose = document.getElementById('btn-history-close');
  const btnHistoryClear = document.getElementById('btn-history-clear');
  const historyList = document.getElementById('history-list');

  // Footer Stats
  const statStatus = document.getElementById('stat-status');
  const statSize = document.getElementById('stat-size');
  const statLines = document.getElementById('stat-lines');
  const statDepth = document.getElementById('stat-depth');

  // Toasts
  const toastContainer = document.getElementById('toast-container');

  // Application State
  let currentJsonObj = null;
  let formattedOutputText = '';
  let activeMode = 'code'; // 'code' or 'tree'
  let validationDebounceTimer = null;
  let searchMatches = [];
  let currentSearchIndex = -1;
  
  // Error state cache
  let errorLine = null;
  let errorCol = null;
  let errorPos = null;

  // Spacing helper
  function getSpacingValue() {
    const val = spacingSelect.value;
    return val === 'tab' ? '\t' : parseInt(val, 10);
  }

  // Toast notifications
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSVG = '';
    if (type === 'success') {
      iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSVG}<span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Byte size formatter
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Calculate Nesting Depth of JSON Object
  function getJsonDepth(obj) {
    if (obj === null || typeof obj !== 'object') return 0;
    let max = 0;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        max = Math.max(max, getJsonDepth(obj[i]));
      }
    } else {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          max = Math.max(max, getJsonDepth(obj[k]));
        }
      }
    }
    return max + 1;
  }

  // Parse error column and line from position
  function getLineColFromPos(text, pos) {
    const lines = text.slice(0, pos).split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, col };
  }

  // Parse Syntax Error details from try-catch
  function parseError(err, text) {
    let line = null;
    let col = null;
    let pos = null;
    const msg = err.message;

    // Browser parsing standard messages
    // V8/Chrome format: "at position 124"
    const posMatch = msg.match(/at position (\d+)/i);
    if (posMatch) {
      pos = parseInt(posMatch[1], 10);
      const details = getLineColFromPos(text, pos);
      line = details.line;
      col = details.col;
    } else {
      // Gecko/Firefox format: "line 4 column 9"
      const lineColMatch = msg.match(/line (\d+) column (\d+)/i);
      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10);
        col = parseInt(lineColMatch[2], 10);
      }
    }
    return { line, col, pos, msg };
  }

  // Highlight raw JSON syntax string
  function highlightJsonString(jsonStr) {
    // Escape HTML tags first
    const escaped = jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Regex for parsing tokens
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],:])/g,
      (match) => {
        let cls = 'json-punctuation';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
          } else {
            cls = 'json-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-null';
        } else if (/^-?\d/.test(match)) {
          cls = 'json-number';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  // Build collapsible recursive DOM Tree
  function buildTreeDOM(val, key = null, isLast = true) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';

    const type = typeof val;
    const isNull = val === null;
    const isArray = Array.isArray(val);
    const isObject = type === 'object' && !isNull && !isArray;

    // Key representation
    const keyHTML = key !== null ? `<span class="tree-key">"${escapeHtml(key)}"</span><span class="tree-colon">:</span>` : '';
    const commaHTML = isLast ? '' : '<span class="tree-comma">,</span>';

    if (isArray || isObject) {
      const openingBracket = isArray ? '[' : '{';
      const closingBracket = isArray ? ']' : '}';
      const size = isArray ? val.length : Object.keys(val).length;

      // Header row
      const rowHeader = document.createElement('div');
      rowHeader.className = 'tree-row';

      const arrowSVG = `<span class="tree-arrow"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></span>`;
      const indicatorText = isArray ? `${size} items` : `${size} keys`;

      rowHeader.innerHTML = `
        ${arrowSVG}
        ${keyHTML}
        <span class="tree-bracket">${openingBracket}</span>
        <span class="tree-collapsed-indicator hidden">${indicatorText}</span>
      `;
      nodeEl.appendChild(rowHeader);

      // Children block
      const childrenBlock = document.createElement('div');
      childrenBlock.className = 'tree-node-children';

      if (isArray) {
        val.forEach((item, idx) => {
          const childNode = buildTreeDOM(item, null, idx === val.length - 1);
          childrenBlock.appendChild(childNode);
        });
      } else {
        const keys = Object.keys(val);
        keys.forEach((k, idx) => {
          const childNode = buildTreeDOM(val[k], k, idx === keys.length - 1);
          childrenBlock.appendChild(childNode);
        });
      }
      nodeEl.appendChild(childrenBlock);

      // Closing Row
      const rowClosing = document.createElement('div');
      rowClosing.className = 'tree-row-closing';
      rowClosing.innerHTML = `
        <span class="tree-arrow empty"></span>
        <span class="tree-bracket">${closingBracket}</span>${commaHTML}
      `;
      nodeEl.appendChild(rowClosing);

    } else {
      // Primitive types
      const row = document.createElement('div');
      row.className = 'tree-row';

      let valueHTML = '';
      if (type === 'string') {
        valueHTML = `<span class="tree-value-string">"${escapeHtml(val)}"</span>`;
      } else if (type === 'number') {
        valueHTML = `<span class="tree-value-number">${val}</span>`;
      } else if (type === 'boolean') {
        valueHTML = `<span class="tree-value-boolean">${val}</span>`;
      } else if (isNull) {
        valueHTML = `<span class="tree-value-null">null</span>`;
      }

      row.innerHTML = `
        <span class="tree-arrow empty"></span>
        ${keyHTML}
        ${valueHTML}${commaHTML}
      `;
      nodeEl.appendChild(row);
    }

    return nodeEl;
  }

  // HTML escaping helper
  function escapeHtml(text) {
    return text
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Event Delegation for Tree Expansion
  outputTree.addEventListener('click', (e) => {
    const trigger = e.target.closest('.tree-arrow') || e.target.closest('.tree-collapsed-indicator');
    if (!trigger) return;

    const row = trigger.closest('.tree-row');
    if (!row) return;

    const childrenBlock = row.nextElementSibling;
    if (!childrenBlock || !childrenBlock.classList.contains('tree-node-children')) return;

    const arrow = row.querySelector('.tree-arrow');
    const indicator = row.querySelector('.tree-collapsed-indicator');

    if (childrenBlock.classList.contains('hidden')) {
      childrenBlock.classList.remove('hidden');
      if (arrow) arrow.classList.remove('collapsed');
      if (indicator) indicator.classList.add('hidden');
    } else {
      childrenBlock.classList.add('hidden');
      if (arrow) arrow.classList.add('collapsed');
      if (indicator) indicator.classList.remove('hidden');
    }
  });

  // Load sample data helper
  const sampleJsonObj = {
    appName: "JSON Spark",
    version: 1.0,
    active: true,
    author: {
      name: "Antigravity",
      role: "AI Pair Programmer",
      languages: ["HTML", "CSS", "JavaScript"]
    },
    features: [
      {
        name: "Interactive Tree Representation",
        usable: true,
        nestedStats: { performance: "excellent" }
      },
      {
        name: "Syntax Color Coding",
        usable: true
      },
      {
        name: "Live Error Pointers",
        usable: true
      }
    ],
    settings: null
  };

  btnLoadSample.addEventListener('click', () => {
    jsonInput.value = JSON.stringify(sampleJsonObj, null, 2);
    validateInputReactive();
    executeFormat();
    showToast('Loaded sample JSON!', 'success');
  });

  // Clear Editor Action
  btnClear.addEventListener('click', () => {
    jsonInput.value = '';
    outputCode.innerHTML = `<span class="json-placeholder">// Formatted JSON output will appear here...</span>`;
    outputTree.innerHTML = `<span class="json-placeholder">// Interactive JSON Tree will appear here...</span>`;
    
    // Reset state variables
    currentJsonObj = null;
    formattedOutputText = '';
    clearValidationAlert();
    resetStats();
    resetSearch();
    showToast('Workspace cleared', 'info');
  });

  function resetStats() {
    statStatus.innerText = 'Empty';
    statStatus.className = 'stat-value text-muted';
    statSize.innerText = '0 B';
    statLines.innerText = '0';
    statDepth.innerText = '0';
  }

  // Paste raw text directly from clipboard
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      jsonInput.value = text;
      validateInputReactive();
      executeFormat();
      showToast('Pasted clipboard data!', 'success');
    } catch (err) {
      showToast('Please paste using Ctrl+V. Clipboard access denied.', 'error');
    }
  });

  // Live Reactive Validation (Debounced)
  jsonInput.addEventListener('input', () => {
    clearTimeout(validationDebounceTimer);
    validationDebounceTimer = setTimeout(validateInputReactive, 400);
  });

  function validateInputReactive() {
    const rawVal = jsonInput.value.trim();
    if (!rawVal) {
      resetStats();
      clearValidationAlert();
      return;
    }

    try {
      const parsed = JSON.parse(rawVal);
      statStatus.innerText = 'Valid';
      statStatus.className = 'stat-value text-success';
      clearValidationAlert();
      currentJsonObj = parsed;
    } catch (err) {
      statStatus.innerText = 'Invalid';
      statStatus.className = 'stat-value text-error';
      // Do not display full visual alert overlays while typing (annoying UX)
      // We will cache details and only alert on Beautify/Minify clicks
      const details = parseError(err, rawVal);
      errorLine = details.line;
      errorCol = details.col;
      errorPos = details.pos;
    }
  }

  function clearValidationAlert() {
    validationAlert.classList.add('hidden');
    errorLine = null;
    errorCol = null;
    errorPos = null;
  }

  // Jump editor selection directly to the syntax mistake
  btnJumpToError.addEventListener('click', () => {
    if (errorLine !== null) {
      jsonInput.focus();
      
      let targetIndex = errorPos;
      if (targetIndex === null) {
        // Calculate index manually based on line/col
        const lines = jsonInput.value.split('\n');
        let indexAccumulator = 0;
        for (let i = 0; i < errorLine - 1; i++) {
          indexAccumulator += lines[i].length + 1; // include newlines
        }
        indexAccumulator += (errorCol - 1);
        targetIndex = indexAccumulator;
      }
      
      if (targetIndex !== null && targetIndex >= 0) {
        jsonInput.setSelectionRange(targetIndex, targetIndex + 1);
      }
    }
  });

  // Main formatting run
  function executeFormat() {
    const raw = jsonInput.value.trim();
    if (!raw) {
      showToast('Please enter some JSON to format', 'info');
      return;
    }

    resetSearch();

    try {
      const parsed = JSON.parse(raw);
      currentJsonObj = parsed;
      clearValidationAlert();

      // Indentation spacer logic
      const spacer = getSpacingValue();
      formattedOutputText = JSON.stringify(parsed, null, spacer);

      // Render view formats
      renderOutputViews();
      updateStats(raw.length, formattedOutputText, parsed);
      
      // Store history
      saveHistory(raw);

    } catch (err) {
      const details = parseError(err, raw);
      errorLine = details.line;
      errorCol = details.col;
      errorPos = details.pos;

      // Show the validation alert banner
      validationErrorMsg.innerText = `Line ${details.line}, Column ${details.col}: ${details.msg}`;
      validationAlert.classList.remove('hidden');
      
      // Update footer stats
      statStatus.innerText = 'Invalid';
      statStatus.className = 'stat-value text-error';

      showToast('JSON validation failed', 'error');
    }
  }

  btnFormat.addEventListener('click', executeFormat);

  // Minify operational handler
  btnMinify.addEventListener('click', () => {
    const raw = jsonInput.value.trim();
    if (!raw) {
      showToast('Please enter some JSON to minify', 'info');
      return;
    }

    resetSearch();

    try {
      const parsed = JSON.parse(raw);
      currentJsonObj = parsed;
      clearValidationAlert();

      // Compact representation
      formattedOutputText = JSON.stringify(parsed);
      
      // Minify doesn't show properly in tree structure, force Code mode
      activeMode = 'code';
      btnModeCode.classList.add('active');
      btnModeTree.classList.remove('active');
      outputCodeContainer.classList.remove('hidden');
      outputTreeContainer.classList.add('hidden');

      renderOutputViews();
      updateStats(raw.length, formattedOutputText, parsed);
      saveHistory(raw);

      showToast('JSON successfully minified!', 'success');
    } catch (err) {
      const details = parseError(err, raw);
      errorLine = details.line;
      errorCol = details.col;
      errorPos = details.pos;

      validationErrorMsg.innerText = `Line ${details.line}, Column ${details.col}: ${details.msg}`;
      validationAlert.classList.remove('hidden');

      statStatus.innerText = 'Invalid';
      statStatus.className = 'stat-value text-error';
      showToast('Minification failed', 'error');
    }
  });

  // Render text highlight & DOM tree views
  function renderOutputViews() {
    // 1. Text code highlighter
    outputCode.innerHTML = highlightJsonString(formattedOutputText);

    // 2. Interactive tree rendering
    outputTree.innerHTML = '';
    const treeRootNode = buildTreeDOM(currentJsonObj, null, true);
    outputTree.appendChild(treeRootNode);
  }

  // Update statistics layout in bottom bar
  function updateStats(inputLength, outputText, jsonObj) {
    statStatus.innerText = 'Valid';
    statStatus.className = 'stat-value text-success';
    statSize.innerText = formatBytes(outputText.length);
    
    const lines = outputText.split('\n').length;
    statLines.innerText = lines;
    
    const depth = getJsonDepth(jsonObj);
    statDepth.innerText = depth;
  }

  // Mode View Toggling (Code vs Tree view)
  btnModeCode.addEventListener('click', () => {
    activeMode = 'code';
    btnModeCode.classList.add('active');
    btnModeTree.classList.remove('active');
    outputCodeContainer.classList.remove('hidden');
    outputTreeContainer.classList.add('hidden');
    resetSearch();
  });

  btnModeTree.addEventListener('click', () => {
    if (!currentJsonObj) {
      showToast('Format or load JSON to view tree structure', 'info');
      return;
    }
    activeMode = 'tree';
    btnModeTree.classList.add('active');
    btnModeCode.classList.remove('active');
    outputTreeContainer.classList.remove('hidden');
    outputCodeContainer.classList.add('hidden');
    resetSearch();
  });

  // Spacing selector triggers layout re-format instantly if valid JSON present
  spacingSelect.addEventListener('change', () => {
    if (currentJsonObj) {
      executeFormat();
    }
  });

  // Drag and Drop file parsing
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  // Click file upload element
  fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds 5MB limit', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      jsonInput.value = e.target.result;
      validateInputReactive();
      executeFormat();
      showToast(`Successfully loaded: ${file.name}`, 'success');
    };
    reader.onerror = () => {
      showToast('Error reading the file', 'error');
    };
    reader.readAsText(file);
  }

  // Copy to clipboard controls
  btnCopy.addEventListener('click', async () => {
    if (!formattedOutputText) {
      showToast('Nothing to copy', 'info');
      return;
    }

    try {
      await navigator.clipboard.writeText(formattedOutputText);
      showToast('Copied to clipboard!', 'success');
      
      const originalHTML = btnCopy.innerHTML;
      btnCopy.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Copied!
      `;
      setTimeout(() => {
        btnCopy.innerHTML = originalHTML;
      }, 1500);
    } catch (err) {
      showToast('Failed to copy. Try manual copy.', 'error');
    }
  });

  // Download json file
  btnDownload.addEventListener('click', () => {
    if (!formattedOutputText) {
      showToast('Nothing to download', 'info');
      return;
    }

    try {
      const blob = new Blob([formattedOutputText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `formatted_${Date.now()}.json`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
      showToast('JSON file download started', 'success');
    } catch (err) {
      showToast('Download creation failed', 'error');
    }
  });

  // History operations (LocalStorage)
  function getHistory() {
    const rawHistory = localStorage.getItem('json_spark_history');
    return rawHistory ? JSON.parse(rawHistory) : [];
  }

  function saveHistory(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const list = getHistory();
    // Don't save duplicates of the immediately preceding save run
    if (list.length > 0 && list[0].text.trim() === trimmed) return;

    const item = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'}) + ' ' + new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric'}),
      size: text.length,
      text: text
    };

    list.unshift(item);
    if (list.length > 10) list.pop(); // Keep last 10 entries only
    
    localStorage.setItem('json_spark_history', JSON.stringify(list));
    renderHistoryList();
  }

  function renderHistoryList() {
    const list = getHistory();
    historyList.innerHTML = '';
    
    if (list.length === 0) {
      historyList.innerHTML = `<li class="history-empty">No formatted runs saved yet.</li>`;
      return;
    }

    list.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.dataset.id = item.id;
      
      const snippet = item.text.replace(/\s+/g, ' ').substring(0, 50);
      li.innerHTML = `
        <div class="history-item-header">
          <span class="history-time">${item.timestamp}</span>
          <span class="history-size">${formatBytes(item.size)}</span>
        </div>
        <div class="history-snippet">${escapeHtml(snippet)}...</div>
        <button class="btn-history-delete" title="Delete run from history">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;
      historyList.appendChild(li);
    });
  }

  // Sidebar interaction
  btnHistoryToggle.addEventListener('click', () => {
    renderHistoryList();
    sidebarHistory.classList.add('open');
  });

  btnHistoryClose.addEventListener('click', () => {
    sidebarHistory.classList.remove('open');
  });

  // History list interactions (event delegation)
  historyList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.btn-history-delete');
    const itemEl = e.target.closest('.history-item');
    
    if (deleteBtn) {
      e.stopPropagation();
      const id = itemEl.dataset.id;
      let list = getHistory();
      list = list.filter(item => item.id !== id);
      localStorage.setItem('json_spark_history', JSON.stringify(list));
      renderHistoryList();
      showToast('Deleted item from history', 'info');
      return;
    }

    if (itemEl) {
      const id = itemEl.dataset.id;
      const item = getHistory().find(item => item.id === id);
      if (item) {
        jsonInput.value = item.text;
        sidebarHistory.classList.remove('open');
        validateInputReactive();
        executeFormat();
        showToast('Restored JSON from history', 'success');
      }
    }
  });

  // Clear entire history list
  btnHistoryClear.addEventListener('click', () => {
    localStorage.removeItem('json_spark_history');
    renderHistoryList();
    showToast('History list cleared', 'info');
  });

  // Search Engine Logic
  btnSearchToggle.addEventListener('click', () => {
    const isHidden = searchInputWrapper.classList.contains('hidden');
    if (isHidden) {
      searchInputWrapper.classList.remove('hidden');
      searchInput.focus();
    } else {
      resetSearch();
    }
  });

  searchInput.addEventListener('input', () => {
    runSearch();
  });

  function resetSearch() {
    searchInputWrapper.classList.add('hidden');
    searchInput.value = '';
    searchMatchesCount.innerText = '0/0';
    searchMatches = [];
    currentSearchIndex = -1;
    
    // Clear marks on the screen by re-rendering views
    if (currentJsonObj) {
      renderOutputViews();
    }
  }

  function runSearch() {
    const query = searchInput.value.trim();
    
    // Re-render to wipe old marks
    if (currentJsonObj) {
      renderOutputViews();
    }

    if (!query) {
      searchMatches = [];
      currentSearchIndex = -1;
      searchMatchesCount.innerText = '0/0';
      return;
    }

    const activeContainer = activeMode === 'code' ? outputCode : outputTree;
    searchMatches = highlightTextNodes(activeContainer, query);
    
    if (searchMatches.length > 0) {
      currentSearchIndex = 0;
      searchMatches[currentSearchIndex].classList.add('current');
      searchMatches[currentSearchIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
      searchMatchesCount.innerText = `1/${searchMatches.length}`;
    } else {
      currentSearchIndex = -1;
      searchMatchesCount.innerText = '0/0';
    }
  }

  btnSearchNext.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    
    searchMatches[currentSearchIndex].classList.remove('current');
    currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
    searchMatches[currentSearchIndex].classList.add('current');
    
    searchMatches[currentSearchIndex].scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
    
    searchMatchesCount.innerText = `${currentSearchIndex + 1}/${searchMatches.length}`;
  });

  btnSearchPrev.addEventListener('click', () => {
    if (searchMatches.length === 0) return;

    searchMatches[currentSearchIndex].classList.remove('current');
    currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
    searchMatches[currentSearchIndex].classList.add('current');
    
    searchMatches[currentSearchIndex].scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });

    searchMatchesCount.innerText = `${currentSearchIndex + 1}/${searchMatches.length}`;
  });

  // DOM node traversal highlighting utility
  function highlightTextNodes(container, query) {
    if (!query) return [];
    
    const matchesList = [];
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex literals
    const regex = new RegExp(escapedQuery, 'gi');
    
    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue;
        if (regex.test(text)) {
          const parent = node.parentNode;
          if (parent.tagName === 'MARK' && parent.classList.contains('search-highlight')) {
            return;
          }
          
          const frag = document.createDocumentFragment();
          let lastIdx = 0;
          regex.lastIndex = 0;
          let match;
          
          while ((match = regex.exec(text)) !== null) {
            const matchIdx = match.index;
            const matchText = match[0];
            
            if (matchIdx > lastIdx) {
              frag.appendChild(document.createTextNode(text.slice(lastIdx, matchIdx)));
            }
            
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = matchText;
            frag.appendChild(mark);
            matchesList.push(mark);
            
            lastIdx = regex.lastIndex;
          }
          
          if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx)));
          }
          
          parent.replaceChild(frag, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
          // Clone children elements list to prevent dynamic DOM array shift bugs
          const children = Array.from(node.childNodes);
          children.forEach(child => traverse(child));
        }
      }
    }
    
    traverse(container);
    return matchesList;
  }
});
