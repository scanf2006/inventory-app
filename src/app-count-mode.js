/**
 * Full-screen stock count for phones.
 * Values are stored as the same expressions the rest of the app reads, e.g. "80+40-5".
 */
window.App = window.App || {};

App.CountMode = (() => {
  const SESSION_KEY = "lubricant_count_session";
  const LOW_STOCK_LITERS = 500; // Same default as scripts/daily-report/config.json
  const CHECK_RATIO = 0.4;
  const UNDO_MS = 5000;

  const TEMPLATE = `
    <div class="cm-topline"><span data-cm="date"></span><span class="cm-sync" data-cm="sync"></span><button class="cm-exit" data-cm="exitBtn" aria-label="Exit edit mode">Exit</button></div>
    <nav class="cm-tabs" data-cm="tabs" aria-label="Categories"></nav>

    <section class="cm-view" data-cm="countView" aria-label="Count">
      <div class="cm-rail" data-cm="rail" aria-label="Products in this category"></div>
      <div class="cm-product" data-cm="product">
        <div class="cm-head">
          <button class="cm-icon" data-cm="prev" aria-label="Previous product">‹</button>
          <button class="cm-title" data-cm="pickerBtn" aria-label="Choose a product">
            <div class="cm-name"><span data-cm="name"></span><span class="cm-caret" aria-hidden="true">▼</span></div>
            <div class="cm-pos" data-cm="pos"></div>
          </button>
          <button class="cm-icon" data-cm="skip" aria-label="Next product">›</button>
          <button class="cm-icon" data-cm="itemMenuBtn" aria-label="Product options">⋯</button>
        </div>
        <div class="cm-progress"><i data-cm="progress"></i></div>
        <div class="cm-readout">
          <div><div class="cm-label">This count</div><div class="cm-now" data-cm="now" aria-live="polite"></div></div>
          <div class="cm-last"><div class="cm-label">Last count</div><b data-cm="last"></b><span class="cm-delta" data-cm="delta"></span></div>
        </div>
        <div class="cm-tape" data-cm="tape" aria-label="Count entries"></div>
      </div>
      <div class="cm-empty" data-cm="emptyState" hidden>
        <div>No products in this category.</div>
        <button class="cm-primary" data-cm="emptyAdd">Add product</button>
      </div>
      <div class="cm-keypad" data-cm="keypad">
        <button class="cm-key" data-k="7">7</button><button class="cm-key" data-k="8">8</button><button class="cm-key" data-k="9">9</button><button class="cm-key op" data-k="back" aria-label="Backspace">⌫</button>
        <button class="cm-key" data-k="4">4</button><button class="cm-key" data-k="5">5</button><button class="cm-key" data-k="6">6</button><button class="cm-key op" data-k="-" aria-label="Subtract">−</button>
        <button class="cm-key" data-k="1">1</button><button class="cm-key" data-k="2">2</button><button class="cm-key" data-k="3">3</button><button class="cm-key op" data-k="*" aria-label="Multiply">×</button>
        <button class="cm-key" data-k="." aria-label="Decimal point">.</button><button class="cm-key" data-k="0">0</button><button class="cm-key op" data-k="+" aria-label="Add another amount">+</button><button class="cm-key next" data-k="next" data-cm="nextKey">Next</button>
      </div>
    </section>

    <section class="cm-view" data-cm="listView" aria-label="All products" hidden>
      <div class="cm-filters">
        <button class="cm-filter" data-filter="all">All</button>
        <button class="cm-filter" data-filter="todo">To count</button>
        <button class="cm-filter" data-filter="check">Check</button>
      </div>
      <div class="cm-scroll" data-cm="listRows"></div>
    </section>

    <section class="cm-view" data-cm="reviewView" aria-label="Review" hidden>
      <div class="cm-summary" data-cm="summary"></div>
      <div class="cm-scroll" data-cm="reviewRows"></div>
      <button class="cm-primary" data-cm="saveBtn">Save snapshot</button>
    </section>

    <nav class="cm-nav" aria-label="Main">
      <button data-view="count">Count</button>
      <button data-view="list">List</button>
      <button data-view="review">Review<span class="cm-badge" data-cm="badge" hidden></span></button>
      <button data-cm="moreBtn">More</button>
    </nav>

    <div class="cm-sheet-wrap" data-cm="checkSheet" role="dialog" aria-modal="true" hidden>
      <div class="cm-sheet">
        <h2>Check this count</h2>
        <p data-cm="checkText"></p>
        <div class="cm-sheet-actions">
          <button data-cm="fixBtn">Fix it</button>
          <button class="confirm" data-cm="keepBtn">Keep and continue</button>
        </div>
      </div>
    </div>

    <div class="cm-sheet-wrap" data-cm="pickerSheet" role="dialog" aria-modal="true" aria-label="Choose product" hidden>
      <div class="cm-sheet">
        <div class="cm-sheet-head"><h2>Choose product</h2><button class="cm-close" data-cm="pickerClose">Close</button></div>
        <div class="cm-picker-body" data-cm="pickerBody"></div>
      </div>
    </div>

    <div class="cm-sheet-wrap" data-cm="itemSheet" role="dialog" aria-modal="true" hidden>
      <div class="cm-sheet">
        <div class="cm-sheet-head"><h2 data-cm="itemTitle"></h2><button class="cm-close" data-cm="itemClose">Close</button></div>
        <div class="cm-menu">
          <button data-cm="renameBtn">Rename</button>
          <button class="danger" data-cm="deleteBtn">Delete</button>
        </div>
      </div>
    </div>

    <div class="cm-sheet-wrap" data-cm="deleteSheet" role="dialog" aria-modal="true" hidden>
      <div class="cm-sheet">
        <h2 data-cm="deleteTitle"></h2>
        <p data-cm="deleteText"></p>
        <div class="cm-sheet-actions">
          <button data-cm="deleteCancel">Cancel</button>
          <button class="danger" data-cm="deleteConfirm">Delete product</button>
        </div>
      </div>
    </div>

    <div class="cm-sheet-wrap" data-cm="moreSheet" role="dialog" aria-modal="true" hidden>
      <div class="cm-sheet">
        <div class="cm-sheet-head"><h2>More</h2><button class="cm-close" data-cm="moreClose">Close</button></div>
        <div class="cm-menu">
          <button data-more="add">Add product</button>
          <button data-more="sort" data-cm="sortBtn"></button>
          <button data-more="preview">Preview</button>
          <button data-more="pdf">Generate PDF</button>
          <button data-more="settings">Settings</button>
          <button data-more="newCount">Start new count</button>
          <button class="danger" data-more="reset" data-cm="resetBtn" style="grid-column: 1 / -1"></button>
        </div>
      </div>
    </div>

    <div class="cm-sheet-wrap top" data-cm="addSheet" role="dialog" aria-modal="true" hidden>
      <form class="cm-sheet" data-cm="addForm">
        <h2 data-cm="addTitle"></h2>
        <input class="cm-add-input" id="count-add-name" type="text" placeholder="New product name" list="master-product-list" autocomplete="off" aria-label="New product name">
        <div class="cm-sheet-actions">
          <button type="button" data-cm="addCancel">Cancel</button>
          <button type="submit" class="confirm">Add</button>
        </div>
      </form>
    </div>

    <div class="cm-toast" data-cm="toast" role="status" hidden><span data-cm="toastText"></span><button data-cm="toastAction">Undo</button></div>
  `;

  let root = null;
  let session = null;
  let view = "count";
  let filter = "all";
  let currentName = null;
  let editor = null;
  let pendingMove = null;
  let pendingDelete = null;
  let toastTimer = null;
  let toastUndo = null;
  let suspendRender = false;
  let railSignature = "";
  let railKey = "";
  let swipeStart = null;
  let wasDesktop = false;

  const $ = (name) => root.querySelector(`[data-cm="${name}"]`);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const U = () => App.Utils;
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const isBulk = (cat) => String(cat).toLowerCase().includes("bulk oil");
  const withUnit = (item, n) => `${fmt(n)}${isBulk(item.cat) ? " L" : ""}`;
  const today = () => new Date().toLocaleDateString("en-CA");

  // --- Session: what has been counted today on this phone ---

  const newSession = () => ({
    date: today(),
    baseline: { ...(App.State.inventory || {}) },
    counted: {},
    confirmed: {},
  });
  const saveSession = () => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn("Count session was not saved", e);
    }
  };
  const ensureSession = () => {
    if (!session) {
      try {
        session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      } catch (e) {
        session = null;
      }
    }
    if (!session?.baseline || !session.counted || session.date !== today()) {
      if (editor?.draft) return;
      session = newSession();
      saveSession();
    }
    session.confirmed = session.confirmed || {};
  };

  // --- Products ---

  const categories = () => (App.State.categoryOrder || []).filter((c) => App.State.products?.[c]);
  const catItems = (cat) => {
    let names = [...(App.State.products?.[cat] || [])];
    if (App.State.sortDirection === "asc") names.sort();
    else if (App.State.sortDirection === "desc") names.sort().reverse();
    if (pendingDelete?.cat === cat) names = names.filter((n) => n !== pendingDelete.name);
    return names.map((name) => ({ cat, name, key: U().getProductKey(cat, name) }));
  };
  const allItems = () => categories().flatMap(catItems);
  const rawOf = (item) => String(App.State.inventory?.[item.key] ?? "");
  const baseOf = (item) => String(session.baseline[item.key] ?? "");
  const isCounted = (item) => !!session.counted[item.key] && rawOf(item) !== "";
  const lastRaw = (item) => (isCounted(item) ? baseOf(item) : rawOf(item) || baseOf(item));
  const lastOf = (item) => U().safeEvaluate(lastRaw(item));
  const valueOf = (item) => U().safeEvaluate(rawOf(item));
  const isLow = (item, v = valueOf(item)) => isBulk(item.cat) && v < LOW_STOCK_LITERS;
  const isUnusual = (item, v) => {
    const last = lastOf(item);
    return last > 0 && Math.abs(v - last) / last >= CHECK_RATIO;
  };
  const needsCheck = (item) => {
    if (!isCounted(item)) return false;
    if (!U().evaluateExpression(rawOf(item)).valid) return true;
    const v = valueOf(item);
    return isUnusual(item, v) && session.confirmed[item.key] !== v;
  };

  const currentItem = () => {
    const cat = App.State.currentCategory;
    const list = catItems(cat);
    if (!list.length) {
      currentName = null;
      return null;
    }
    let item = list.find((i) => i.name === currentName);
    if (!item) {
      item = list.find((i) => !isCounted(i)) || list[0];
      currentName = item.name;
    }
    return item;
  };

  // --- Editor: the entries being typed for the current product ---

  const openEditor = (item) => {
    editor = {
      key: item?.key || "",
      parts: item && isCounted(item) ? U().splitExpression(rawOf(item)) : [],
      draft: "",
      sign: "+",
      insertAt: null,
    };
  };
  const cleanDraft = () => editor.draft.replace(/[*.]+$/, "");
  const liveParts = () => {
    const parts = [...editor.parts];
    const clean = cleanDraft();
    if (clean) parts.splice(editor.insertAt ?? parts.length, 0, { s: editor.sign, e: clean });
    return parts;
  };

  const syncEditor = (item) => {
    if (!editor || editor.key !== (item?.key || "")) {
      openEditor(item);
      return;
    }
    if (!item || editor.draft || editor.insertAt !== null) return;
    const expected = isCounted(item) ? U().splitExpression(rawOf(item)) : [];
    if (U().joinExpression(editor.parts) !== U().joinExpression(expected)) editor.parts = expected;
  };

  // Existing stock stays untouched until the first digit of a new count
  const writeEditor = () => {
    const item = currentItem();
    if (!item || editor.key !== item.key) return;
    const expr = U().joinExpression(liveParts());
    const wasCounted = isCounted(item);
    if (!expr && !wasCounted) return;

    let value = expr;
    if (expr) {
      if (!wasCounted) {
        const before = rawOf(item);
        if (before) session.baseline[item.key] = before;
      }
      session.counted[item.key] = true;
    } else {
      delete session.counted[item.key];
      value = baseOf(item);
    }
    delete session.confirmed[item.key];
    if (rawOf(item) !== value) window.updateValue(item.name, value, -1);
    saveSession();
  };

  const commit = () => {
    if (!editor) return;
    const clean = cleanDraft();
    if (clean) editor.parts.splice(editor.insertAt ?? editor.parts.length, 0, { s: editor.sign, e: clean });
    const changed = editor.draft !== "";
    editor.draft = "";
    editor.sign = "+";
    editor.insertAt = null;
    if (changed) writeEditor();
  };

  const press = (k) => {
    try {
      navigator.vibrate?.(6);
    } catch (e) {
      /* vibration is optional */
    }
    if (!currentItem()) return;
    if (/^\d$/.test(k)) {
      const factor = editor.draft.split("*").pop();
      if (factor === "0") editor.draft = editor.draft.slice(0, -1) + k;
      else if (editor.draft.length < 18) editor.draft += k;
    } else if (k === ".") {
      const factor = editor.draft.split("*").pop();
      if (!factor.includes(".")) editor.draft += factor ? "." : "0.";
    } else if (k === "*") {
      if (editor.draft && !/[*.]$/.test(editor.draft)) editor.draft += "*";
    } else if (k === "+" || k === "-") {
      if (editor.draft) commit();
      editor.sign = k;
    } else if (k === "back") {
      if (editor.draft) {
        editor.draft = editor.draft.slice(0, -1);
      } else if (editor.sign === "-") {
        editor.sign = "+";
      } else {
        const target = (editor.insertAt ?? editor.parts.length) - 1;
        if (target >= 0) {
          const [part] = editor.parts.splice(target, 1);
          editor.draft = part.e;
          editor.sign = part.s;
          editor.insertAt = target;
        }
      }
    } else if (k === "next") {
      commit();
      requestMove(nextTodo(), "next");
      return;
    }
    writeEditor();
    renderCount();
  };

  const editChip = (index) => {
    const anchor = editor.parts[index];
    commit();
    const at = editor.parts.indexOf(anchor);
    if (at < 0) return;
    const [part] = editor.parts.splice(at, 1);
    editor.draft = part.e;
    editor.sign = part.s;
    editor.insertAt = at;
    renderCount();
  };

  const clearCount = () => {
    const item = currentItem();
    if (!item) return;
    const previous = rawOf(item);
    const wasCounted = isCounted(item);
    editor.parts = [];
    editor.draft = "";
    editor.sign = "+";
    editor.insertAt = null;
    if (wasCounted) {
      delete session.counted[item.key];
      delete session.confirmed[item.key];
      const restored = baseOf(item);
      if (rawOf(item) !== restored) window.updateValue(item.name, restored, -1);
      saveSession();
    }
    renderCount();
    if (wasCounted) {
      showToast(`${item.name} count cleared`, () => {
        commit();
        App.State.currentCategory = item.cat;
        App.UI.renderTabs();
        session.counted[item.key] = true;
        window.updateValue(item.name, previous, -1);
        saveSession();
        currentName = item.name;
        openEditor(item);
        render();
      });
    }
  };

  // --- Navigation ---

  const nextTodo = () => {
    const item = currentItem();
    if (!item) return null;
    const sameCat = catItems(item.cat);
    const pos = sameCat.findIndex((i) => i.key === item.key);
    const ordered = [
      ...sameCat.slice(pos + 1),
      ...sameCat.slice(0, pos),
      ...allItems().filter((i) => i.cat !== item.cat),
    ];
    return ordered.find((i) => !isCounted(i)) || null;
  };

  const moveTo = (target, direction = "next") => {
    commit();
    if (!target) {
      setView("review");
      return;
    }
    App.State.currentCategory = target.cat;
    App.UI.renderTabs();
    currentName = target.name;
    openEditor(target.name ? currentItem() : null);
    view = "count";
    render();
    const product = $("product");
    product.classList.remove("slide-next", "slide-prev");
    void product.offsetWidth;
    product.classList.add(direction === "next" ? "slide-next" : "slide-prev");
  };

  const requestMove = (target, direction) => {
    commit();
    const item = currentItem();
    if (item && needsCheck(item)) {
      const v = valueOf(item);
      const last = lastOf(item);
      pendingMove = { target, direction };
      $("checkText").textContent = U().evaluateExpression(rawOf(item)).valid
        ? `${item.name} is ${withUnit(item, v)}. The last count was ${withUnit(item, last)}, a change of ${v > last ? "+" : "−"}${withUnit(item, Math.abs(v - last))}.`
        : `${item.name} has an entry that can't be calculated: ${rawOf(item)}`;
      $("checkSheet").hidden = false;
      $("keepBtn").focus();
      return;
    }
    moveTo(target, direction);
  };

  const jumpTo = (item) => {
    $("pickerSheet").hidden = true;
    const active = currentItem();
    if (active?.key === item.key) return;
    const list = allItems();
    const from = list.findIndex((i) => i.key === active?.key);
    const to = list.findIndex((i) => i.key === item.key);
    requestMove(item, to > from ? "next" : "prev");
  };

  const goToCategory = (cat) => {
    const list = catItems(cat);
    const target = list.find((i) => !isCounted(i)) || list[0] || { cat, name: null };
    requestMove(target, "next");
  };

  const stepBy = (offset) => {
    const item = currentItem();
    if (!item) return;
    const list = allItems();
    const index = list.findIndex((i) => i.key === item.key) + offset;
    if (index < 0) return;
    requestMove(list[index] || null, offset > 0 ? "next" : "prev");
  };

  const setView = (next) => {
    commit();
    view = next;
    render();
  };

  // --- Product actions ---

  const openItemMenu = () => {
    commit();
    const item = currentItem();
    if (!item) return;
    renderCount();
    $("itemTitle").textContent = item.name;
    $("itemSheet").hidden = false;
    $("itemClose").focus();
  };

  const moveSessionKey = (oldKey, newKey) => {
    ["baseline", "counted", "confirmed"].forEach((field) => {
      if (session[field][oldKey] === undefined) return;
      session[field][newKey] = session[field][oldKey];
      delete session[field][oldKey];
    });
  };

  const renameCurrent = () => {
    $("itemSheet").hidden = true;
    const item = currentItem();
    if (!item) return;
    const prods = App.State.products[item.cat];
    const index = prods.indexOf(item.name);
    suspendRender = true;
    try {
      window.renameProductInline(item.name);
    } finally {
      suspendRender = false;
    }
    const newName = prods[index];
    if (newName && newName !== item.name) {
      moveSessionKey(item.key, U().getProductKey(item.cat, newName));
      saveSession();
      currentName = newName;
      openEditor(currentItem());
      window.updateProductSuggestions?.();
    }
    render();
  };

  const openDelete = () => {
    $("itemSheet").hidden = true;
    const item = currentItem();
    if (!item) return;
    $("deleteTitle").textContent = `Delete ${item.name}?`;
    $("deleteText").textContent = rawOf(item)
      ? `This removes it from ${item.cat}, along with its stock of ${withUnit(item, valueOf(item))}.`
      : `This removes it from ${item.cat}.`;
    $("deleteSheet").hidden = false;
    $("deleteCancel").focus();
  };

  // The delete reaches the cloud only after the undo window closes
  const flushDelete = () => {
    if (!pendingDelete) return;
    const { cat, name, key, timer } = pendingDelete;
    clearTimeout(timer);
    pendingDelete = null;
    hideToast();
    ["baseline", "counted", "confirmed"].forEach((field) => delete session[field][key]);
    saveSession();
    window.deleteProduct(cat, name);
  };

  const deleteCurrent = () => {
    $("deleteSheet").hidden = true;
    flushDelete();
    const item = currentItem();
    if (!item) return;
    const sameCat = catItems(item.cat);
    const pos = sameCat.findIndex((i) => i.key === item.key);
    const neighbor = sameCat[pos + 1] || sameCat[pos - 1] || null;

    pendingDelete = { ...item, timer: setTimeout(flushDelete, UNDO_MS) };
    currentName = neighbor?.name || null;
    openEditor(neighbor);
    render();
    showToast(`${item.name} deleted`, () => {
      clearTimeout(pendingDelete?.timer);
      pendingDelete = null;
      App.State.currentCategory = item.cat;
      App.UI.renderTabs();
      currentName = item.name;
      openEditor(currentItem());
      render();
    }, UNDO_MS);
  };

  const openAdd = () => {
    commit();
    $("moreSheet").hidden = true;
    $("addTitle").textContent = `Add to ${App.State.currentCategory}`;
    const input = root.querySelector("#count-add-name");
    input.value = "";
    $("addSheet").hidden = false;
    input.focus();
  };

  const submitAdd = (event) => {
    event.preventDefault();
    const input = root.querySelector("#count-add-name");
    const name = input.value.trim();
    if (!name) return;
    const cat = App.State.currentCategory;
    if ((App.State.products[cat] || []).includes(name)) {
      App.UI.showToast("Product exists", "error");
      return;
    }
    suspendRender = true;
    try {
      window.submitQuickAdd("count-add-name");
    } finally {
      suspendRender = false;
    }
    window.updateProductSuggestions?.();
    input.blur();
    $("addSheet").hidden = true;
    currentName = name;
    openEditor(currentItem());
    view = "count";
    render();
  };

  const startNewCount = () => {
    App.UI.confirm("Start a new count? Stock values stay as they are.", () => {
      commit();
      session = newSession();
      saveSession();
      openEditor(currentItem());
      view = "count";
      render();
    });
  };

  const saveSnapshot = async () => {
    commit();
    flushDelete();
    const list = allItems();
    const open = list.filter((i) => !isCounted(i) || needsCheck(i)).length;
    const run = async () => {
      window.flushPendingSave();
      const saved = await App.Sync.saveSnapshot("Stock count");
      if (!saved) return;
      session = newSession();
      saveSession();
      openEditor(currentItem());
      render();
    };
    if (open) {
      App.UI.confirm(`Save snapshot with ${open} product${open === 1 ? "" : "s"} still open?`, run);
    } else {
      await run();
    }
  };

  const runMore = (action) => {
    commit();
    $("moreSheet").hidden = true;
    if (action === "add") openAdd();
    if (action === "sort") window.sortProductsToggle();
    if (action === "pdf") {
      window.flushPendingSave();
      document.getElementById("export-pdf-btn")?.click();
    }
    if (action === "settings") document.getElementById("manage-btn")?.click();
    if (action === "newCount") startNewCount();
    if (action === "reset") window.resetCategoryInventory();
    if (action === "preview") {
      flushDelete();
      window.toggleViewMode("preview");
    }
  };

  // Finish anything pending first, because locking removes this screen
  const exitEditing = () => {
    commit();
    flushDelete();
    hideToast();
    window.flushPendingSave?.();
    window.lockEditing();
  };

  // --- Toast ---

  const hideToast = () => {
    clearTimeout(toastTimer);
    toastUndo = null;
    if (root) $("toast").hidden = true;
  };
  const showToast = (message, undo, duration = 5000) => {
    clearTimeout(toastTimer);
    toastUndo = undo;
    $("toastText").textContent = message;
    $("toastAction").hidden = !undo;
    $("toast").hidden = false;
    toastTimer = setTimeout(hideToast, duration);
  };

  // --- Rendering ---

  const statusClass = (item) => {
    const active = currentItem();
    const counted = item.key === active?.key ? liveParts().length > 0 : isCounted(item);
    if (!counted) return "";
    return needsCheck(item) ? "flag" : "done";
  };

  const renderTabs = () => {
    const tabs = $("tabs");
    tabs.replaceChildren();
    categories().forEach((cat) => {
      const list = catItems(cat);
      const btn = el("button", "cm-tab", cat);
      btn.setAttribute("aria-current", String(App.State.currentCategory === cat));
      btn.append(el("small", "", `${list.filter(isCounted).length}/${list.length}`));
      btn.onclick = () => {
        if (App.State.currentCategory === cat && view === "count") return;
        goToCategory(cat);
      };
      tabs.append(btn);
    });
    tabs.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const renderRail = (item) => {
    const rail = $("rail");
    const list = catItems(App.State.currentCategory);
    const signature = JSON.stringify(list.map((i) => i.key));
    if (signature !== railSignature) {
      railSignature = signature;
      railKey = "";
      rail.replaceChildren(...list.map((i) => {
        const btn = el("button", "cm-rail-item", i.name);
        btn.dataset.key = i.key;
        btn.onclick = () => jumpTo(i);
        return btn;
      }));
    }
    [...rail.children].forEach((btn, index) => {
      btn.className = `cm-rail-item ${statusClass(list[index])}`.trim();
      btn.setAttribute("aria-current", String(list[index].key === item?.key));
    });
    if (railKey !== (item?.key || "")) {
      railKey = item?.key || "";
      const active = rail.querySelector('[aria-current="true"]');
      if (active) rail.scrollLeft = active.offsetLeft - rail.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
    }
  };

  const renderBadge = () => {
    const n = allItems().filter(needsCheck).length;
    $("badge").hidden = n === 0;
    $("badge").textContent = n;
  };

  const renderTape = () => {
    const tape = $("tape");
    tape.replaceChildren();
    const parts = editor.parts;
    const entryAt = editor.insertAt ?? parts.length;
    const label = (p, first) => `${p.s === "-" ? "−" : first ? "" : "+"}${p.e.replace(/\*/g, "×")}`;
    const addEntry = () => {
      const first = entryAt === 0;
      const text = editor.draft
        ? label({ s: editor.sign, e: editor.draft }, first)
        : editor.sign === "-" ? "−" : first ? "Enter amount" : "+";
      tape.append(el("span", `cm-chip entry${editor.draft ? "" : " empty"}`, text));
    };
    parts.forEach((p, i) => {
      if (i === entryAt) addEntry();
      const chip = el("button", `cm-chip${p.s === "-" ? " minus" : ""}`, label(p, i === 0 && entryAt !== 0));
      chip.setAttribute("aria-label", `Edit ${label(p, true)}`);
      chip.onclick = () => editChip(i);
      tape.append(chip);
    });
    if (entryAt >= parts.length) addEntry();
    if (liveParts().length) {
      const clear = el("button", "cm-clear", "Clear");
      clear.onclick = clearCount;
      tape.append(clear);
    }
    tape.scrollTop = tape.scrollHeight;
  };

  const renderCount = () => {
    const item = currentItem();
    syncEditor(item);
    $("product").hidden = !item;
    $("keypad").hidden = !item;
    $("emptyState").hidden = !!item;
    renderRail(item);
    renderTabs();
    renderBadge();
    if (!item) return;

    const list = catItems(item.cat);
    const everything = allItems();
    const parts = liveParts();
    const hasValue = parts.length > 0;
    const total = U().safeEvaluate(U().joinExpression(parts));
    const last = lastOf(item);

    $("name").textContent = item.name;
    $("pos").textContent = `${item.cat} · ${list.findIndex((i) => i.key === item.key) + 1} of ${list.length}`;
    $("progress").style.width = `${everything.length ? (everything.filter(isCounted).length / everything.length) * 100 : 0}%`;

    const now = $("now");
    now.textContent = hasValue ? fmt(total) : "–";
    if (hasValue && isBulk(item.cat)) now.append(el("span", "", "L"));
    $("last").textContent = lastRaw(item) ? withUnit(item, last) : "None";

    const delta = $("delta");
    const diff = Math.round((total - last) * 100) / 100;
    delta.className = "cm-delta";
    if (!hasValue) {
      delta.textContent = "Not counted";
    } else if (!U().evaluateExpression(U().joinExpression(parts)).valid) {
      delta.textContent = "Check entry";
      delta.classList.add("warn");
    } else if (isLow(item, total)) {
      delta.textContent = `Below ${LOW_STOCK_LITERS} L`;
      delta.classList.add("low");
    } else {
      delta.textContent = diff === 0 ? "No change" : `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`;
      if (isUnusual(item, total)) delta.classList.add("warn");
    }

    renderTape();
    const first = everything[0];
    $("prev").disabled = first?.key === item.key;
    $("nextKey").textContent = nextTodo() ? "Next" : "Review";
  };

  const statusPill = (item) => {
    if (!isCounted(item)) return el("span", "cm-pill todo", "To count");
    if (needsCheck(item)) return el("span", "cm-pill check", "Check");
    if (isLow(item)) return el("span", "cm-pill low", "Low");
    return el("span", "cm-pill ok", "Counted");
  };

  const productRow = (item) => {
    const row = el("button", "cm-row");
    const left = el("div");
    left.append(
      el("div", "cm-row-name", item.name),
      el("div", "cm-row-expr", isCounted(item)
        ? rawOf(item).replace(/\*/g, "×")
        : lastRaw(item) ? `Last ${withUnit(item, lastOf(item))}` : "No stock entered"),
    );
    const right = el("div", "cm-row-value", isCounted(item) ? withUnit(item, valueOf(item)) : "–");
    right.append(el("br"), statusPill(item));
    row.append(left, right);
    row.onclick = () => {
      commit();
      moveTo(item, "next");
    };
    return row;
  };

  const renderList = () => {
    root.querySelectorAll("[data-filter]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
    });
    const rows = $("listRows");
    const top = rows.scrollTop;
    rows.replaceChildren();
    const shown = allItems().filter((i) => (
      filter === "all" || (filter === "todo" ? !isCounted(i) : needsCheck(i))
    ));
    let lastCat = "";
    shown.forEach((item) => {
      if (item.cat !== lastCat) {
        rows.append(el("div", "cm-group", item.cat));
        lastCat = item.cat;
      }
      rows.append(productRow(item));
    });
    if (!shown.length) {
      rows.append(el("div", "cm-note", filter === "todo" ? "Every product is counted." : "No counts need checking."));
    }
    rows.scrollTop = top;
    renderTabs();
  };

  const renderReview = () => {
    const list = allItems();
    const todo = list.filter((i) => !isCounted(i));
    const check = list.filter(needsCheck);
    const low = list.filter((i) => isCounted(i) && isLow(i) && !check.includes(i));
    const summary = $("summary");
    summary.replaceChildren();
    [[list.length - todo.length, "Counted"], [check.length, "To check"], [todo.length, "To count"]].forEach(([n, label]) => {
      const stat = el("div", "cm-stat");
      stat.append(el("b", "", n), el("span", "", label));
      summary.append(stat);
    });
    const rows = $("reviewRows");
    const top = rows.scrollTop;
    rows.replaceChildren();
    const group = (title, items) => {
      if (!items.length) return;
      rows.append(el("div", "cm-group", title));
      items.forEach((item) => rows.append(productRow(item)));
    };
    group("Check these first", check);
    group(`Below ${LOW_STOCK_LITERS} L`, low);
    group("Not counted", todo);
    if (!check.length && !todo.length && !low.length) {
      rows.append(el("div", "cm-note", "All products are counted and look normal."));
    }
    rows.scrollTop = top;
    const open = todo.length + check.length;
    $("saveBtn").textContent = open ? `Save snapshot (${open} open)` : "Save snapshot";
    renderTabs();
  };

  const renderMoreLabels = () => {
    $("sortBtn").textContent = `Sort: ${String(App.State.sortDirection || "asc").toUpperCase()}`;
    $("resetBtn").textContent = `Reset ${App.State.currentCategory} to zero`;
  };

  const renderSync = () => {
    const status = document.querySelector("#sync-status span")?.textContent?.trim();
    $("sync").textContent = status || "";
  };

  const render = () => {
    if (!root || suspendRender) return;
    ensureSession();
    $("countView").hidden = view !== "count";
    $("listView").hidden = view !== "list";
    $("reviewView").hidden = view !== "review";
    root.querySelectorAll("[data-view]").forEach((b) => {
      if (b.dataset.view === view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (view === "count") renderCount();
    else syncEditor(currentItem());
    if (view === "list") renderList();
    if (view === "review") renderReview();
    renderBadge();
    renderSync();
    renderMoreLabels();
  };

  // --- Setup ---

  const bindEvents = () => {
    const keypad = $("keypad");
    keypad.addEventListener("pointerdown", (e) => {
      const key = e.target.closest("[data-k]");
      if (!key) return;
      e.preventDefault();
      press(key.dataset.k);
    });
    // detail is 0 only for keyboard activation; pointer taps were handled above
    keypad.addEventListener("click", (e) => {
      const key = e.target.closest("[data-k]");
      if (key && e.detail === 0) press(key.dataset.k);
    });

    $("exitBtn").onclick = exitEditing;
    $("prev").onclick = () => stepBy(-1);
    $("skip").onclick = () => stepBy(1);
    $("pickerBtn").onclick = openPicker;
    $("pickerClose").onclick = () => { $("pickerSheet").hidden = true; };
    $("itemMenuBtn").onclick = openItemMenu;
    $("itemClose").onclick = () => { $("itemSheet").hidden = true; };
    $("renameBtn").onclick = renameCurrent;
    $("deleteBtn").onclick = openDelete;
    $("deleteCancel").onclick = () => { $("deleteSheet").hidden = true; };
    $("deleteConfirm").onclick = deleteCurrent;
    $("moreBtn").onclick = () => {
      commit();
      renderMoreLabels();
      $("moreSheet").hidden = false;
      $("moreClose").focus();
    };
    $("moreClose").onclick = () => { $("moreSheet").hidden = true; };
    $("emptyAdd").onclick = openAdd;
    $("addCancel").onclick = () => { $("addSheet").hidden = true; };
    $("addForm").addEventListener("submit", submitAdd);
    $("saveBtn").onclick = saveSnapshot;
    $("toastAction").onclick = () => {
      const undo = toastUndo;
      hideToast();
      undo?.();
    };
    $("keepBtn").onclick = () => {
      const item = currentItem();
      if (item) session.confirmed[item.key] = valueOf(item);
      saveSession();
      $("checkSheet").hidden = true;
      const move = pendingMove;
      pendingMove = null;
      if (move) moveTo(move.target, move.direction);
    };
    $("fixBtn").onclick = () => {
      $("checkSheet").hidden = true;
      pendingMove = null;
      renderCount();
    };

    root.querySelectorAll("[data-view]").forEach((b) => {
      b.onclick = () => setView(b.dataset.view);
    });
    root.querySelectorAll("[data-filter]").forEach((b) => {
      b.onclick = () => {
        filter = b.dataset.filter;
        renderList();
      };
    });
    root.querySelectorAll("[data-more]").forEach((b) => {
      b.onclick = () => runMore(b.dataset.more);
    });
    ["pickerSheet", "itemSheet", "deleteSheet", "moreSheet", "addSheet"].forEach((name) => {
      const sheet = $(name);
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet) sheet.hidden = true;
      });
    });

    const product = $("product");
    product.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" && !e.target.closest("button")) {
        swipeStart = { x: e.clientX, y: e.clientY };
      }
    });
    product.addEventListener("pointerup", (e) => {
      if (!swipeStart) return;
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      stepBy(dx < 0 ? 1 : -1);
    });
    product.addEventListener("pointercancel", () => { swipeStart = null; });

    const syncStatus = document.getElementById("sync-status");
    if (syncStatus && typeof MutationObserver === "function") {
      new MutationObserver(renderSync).observe(syncStatus, { childList: true, characterData: true, subtree: true });
    }
  };

  const openPicker = () => {
    commit();
    renderCount();
    const body = $("pickerBody");
    body.replaceChildren();
    const active = App.State.currentCategory;
    const activeKey = currentItem()?.key;
    [active, ...categories().filter((c) => c !== active)].forEach((cat) => {
      const list = catItems(cat);
      if (!list.length) return;
      body.append(el("div", "cm-group", cat));
      const grid = el("div", "cm-grid");
      list.forEach((item) => {
        const tile = el("button", `cm-tile ${statusClass(item)}`.trim(), item.name);
        tile.setAttribute("aria-current", String(item.key === activeKey));
        tile.append(el("small", "", isCounted(item) ? withUnit(item, valueOf(item)) : "To count"));
        tile.onclick = () => jumpTo(item);
        grid.append(tile);
      });
      body.append(grid);
    });
    body.scrollTop = 0;
    $("pickerSheet").hidden = false;
    $("pickerClose").focus();
  };

  const mount = () => {
    if (root) return;
    root = el("div", "count-mode");
    root.innerHTML = TEMPLATE;
    document.getElementById("app").appendChild(root);
    $("date").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    bindEvents();
  };

  return {
    init: () => {
      wasDesktop = App.UI.isDesktop();
      const finishPending = () => {
        commit();
        flushDelete();
        window.flushPendingSave?.();
      };
      window.addEventListener("pagehide", finishPending);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") finishPending();
      });
      // Rotating a phone can cross the desktop breakpoint
      window.addEventListener("resize", () => {
        const isDesktop = App.UI.isDesktop();
        if (isDesktop === wasDesktop) return;
        wasDesktop = isDesktop;
        commit();
        window.updateAdminLoginUI?.();
        App.UI.renderInventory();
      });
    },

    show: () => {
      mount();
      root.hidden = false;
      document.body.classList.add("count-mode-active");
      render();
    },

    hide: () => {
      if (!root || root.hidden) return;
      commit();
      root.hidden = true;
      document.body.classList.remove("count-mode-active");
      // Called during a render, so the delete has to wait for that render to finish
      if (pendingDelete) setTimeout(flushDelete, 0);
    },
  };
})();
