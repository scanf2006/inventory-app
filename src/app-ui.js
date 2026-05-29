/**
 * App UI Management and Rendering engine
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.UI = {
  // --- Core UI Helpers ---
  isDesktop: () => window.innerWidth >= 768,
  isBulkOilCategory: () =>
    String(App.State.currentCategory || "").toLowerCase().includes("bulk oil"),

  updateSyncStatus: (status, isOnline) => {
    const el = document.getElementById("sync-status");
    const span = el?.querySelector("span");
    if (span) {
      span.innerText = status;
      const normalized = String(status || "").toLowerCase();
      const isSyncing = normalized.includes("saving") || normalized.includes("checking");
      const isLocalOnly =
        !isOnline &&
        (normalized.includes("local") ||
          normalized.includes("offline") ||
          normalized.includes("failed") ||
          normalized.includes("error"));

      el.classList.toggle("online", !!isOnline);
      el.classList.toggle("syncing", isSyncing);
      el.classList.toggle("local-only", isLocalOnly);
      if (isLocalOnly) {
        el.title = "Changes are saved locally. Tap to retry cloud sync.";
      } else {
        el.removeAttribute("title");
      }
    }
  },

  showToast: (message, type = "info") => {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "OK", error: "ERR", info: "INFO" };

    toast.innerHTML = `<span>${
      icons[type] || icons.info
    }</span><span>${App.Utils.escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("hiding");
      toast.addEventListener("animationend", () => toast.remove());
    }, 3000);
  },

  confirm: (msg, onConfirm, onCancel, options = {}) => {
    const overlay = document.getElementById("confirm-modal");
    const msgEl = document.getElementById("confirm-msg");
    const yesBtn = document.getElementById("confirm-yes-btn");
    const noBtn = document.getElementById("confirm-no-btn");

    if (!overlay || !msgEl || !yesBtn || !noBtn) {
      if (window.confirm(msg)) onConfirm?.();
      else onCancel?.();
      return;
    }

    msgEl.innerHTML = msg;
    yesBtn.textContent = options.confirmText || "Yes";
    noBtn.textContent = options.cancelText || "No";
    noBtn.style.display = options.hideCancel ? "none" : "inline-block";
    overlay.classList.remove("hidden");

    yesBtn.onclick = () => {
      overlay.classList.add("hidden");
      onConfirm?.();
    };
    noBtn.onclick = () => {
      overlay.classList.add("hidden");
      onCancel?.();
    };
  },

  // --- Global Rendering Engine ---

  renderTabs: () => {
    const tabNav = document.getElementById("category-tabs");
    if (!tabNav) return;
    tabNav.innerHTML = "";

    const { categoryOrder, currentCategory, products } = App.State;
    (categoryOrder || []).forEach((cat) => {
      if (!products[cat]) return;
      const btn = document.createElement("button");
      btn.className = `tab ${cat === currentCategory ? "active" : ""}`;
      btn.innerText = cat;
      btn.onclick = () => {
        App.State.currentCategory = cat;
        App.UI.renderTabs();
        App.UI.scheduleRenderInventory();
      };
      tabNav.appendChild(btn);
    });
  },

  scheduleRenderInventory: (() => {
    let rafId = null;
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        App.UI.renderInventory();
      });
    };
  })(),

  renderInventory: () => {
    const list = document.getElementById("inventory-list");
    if (!list) return;
    list.innerHTML = "";

    const {
      viewMode,
      currentCategory,
      products,
      inventory,
      sortDirection,
      mobileAdminUnlocked,
    } = App.State;
    const isPreview = viewMode === "preview" || App.UI.isDesktop();
    list.className = `inventory-list ${isPreview ? "preview-layout" : ""}`;

    const rawProducts = App.Utils.getCurrentProducts();
    if (!currentCategory || !rawProducts.length) {
      if (!currentCategory || !products[currentCategory]) {
        list.innerHTML = `<div class="empty-state">${App.Utils.escapeHTML(
          "Select or Add a Category",
        )}</div>`;
        return;
      }
    }

    const sortedProducts = [...rawProducts];
    if (sortDirection === "asc") sortedProducts.sort();
    else if (sortDirection === "desc") sortedProducts.sort().reverse();

    let displayProducts = sortedProducts;
    if (isPreview) {
      displayProducts = sortedProducts.filter((name) => {
        const key = App.Utils.getProductKey(currentCategory, name);
        return App.Utils.safeEvaluate(inventory[key] || "") > 0;
      });
    }

    App.UI.renderInventoryControls();
    App.UI.renderInventoryCount(displayProducts.length);

    // Reset button for Mobile Edit mode
    if (viewMode === "edit" && !App.UI.isDesktop()) {
      const resetWrapper = document.createElement("div");
      resetWrapper.style = "margin: 5px 0 15px 0;";
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn-delete danger-zone-reset w-full";
      resetBtn.style =
        "opacity: 0.8; font-size: 0.85rem; padding: 12px; border-radius: 12px;";
      resetBtn.textContent = `Reset ${currentCategory} to Zero`;
      resetBtn.onclick = () => window.resetCategoryInventory();
      resetWrapper.appendChild(resetBtn);
      list.appendChild(resetWrapper);
    }

    displayProducts.forEach((name, index) => {
      const key = App.Utils.getProductKey(currentCategory, name);
      const val = inventory[key] || "";
      const total = App.Utils.safeEvaluate(val);
      const isMobileEdit = !isPreview && !App.UI.isDesktop();

      const card = document.createElement("div");
      card.className = `item-card ${isPreview ? "preview-mode" : ""}`;
      // Mobile edit intentionally reuses preview visual language to reduce style drift.
      if (isMobileEdit) card.classList.add("preview-mode", "mobile-edit-card");

      const infoDiv = document.createElement("div");
      infoDiv.className = "item-info";

      const nameDiv = document.createElement("div");
      nameDiv.className = "item-name";
      nameDiv.textContent = name;
      if (!isPreview) {
        nameDiv.style.cursor = "pointer";
        nameDiv.onclick = () => window.renameProductInline(name);
      }

      const resultDiv = document.createElement("div");
      resultDiv.className = "item-result";
      resultDiv.id = `result-${index}`;
      resultDiv.innerHTML = `Total: <span class="highlight-total">${total}</span>`;

      if (isMobileEdit) {
        const headerDiv = document.createElement("div");
        headerDiv.className = "mobile-edit-header";

        const totalBadge = document.createElement("div");
        totalBadge.className = "mobile-edit-total";
        totalBadge.innerHTML = `Tot: <span class="mobile-edit-total-value">${total}</span>`;

        headerDiv.append(nameDiv, totalBadge);
        infoDiv.append(headerDiv);
      } else {
        infoDiv.append(nameDiv, resultDiv);
      }
      card.append(infoDiv);

      if (!isPreview) {
        const inputGroup = document.createElement("div");
        inputGroup.className = "input-group";
        if (isMobileEdit) inputGroup.classList.add("mobile-edit-input-group");

        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "tel";
        input.className = "item-input";
        input.value = val;
        input.placeholder = "0";
        input.oninput = (e) => {
          // Keep keyboard-specific transforms centralized via config-backed utility.
          const rules = {
            mapDashToMultiply: !!App.Config.INPUT_RULES?.MAP_DASH_TO_MULTIPLY,
            mapHashToMultiply: !!App.Config.INPUT_RULES?.MAP_HASH_TO_MULTIPLY,
          };
          const v = App.Utils.normalizeMathInput(e.target.value, rules);
          e.target.value = v;
          window.updateValue(name, v, index);
        };

        const delBtn = document.createElement("button");
        delBtn.className = "item-delete-btn";
        delBtn.textContent = "Del";
        delBtn.onclick = () => window.removeProductInline(name);

        inputGroup.append(input, delBtn);
        card.append(inputGroup);
      }
      list.appendChild(card);
    });

    if (viewMode === "edit" && !App.UI.isDesktop()) {
      App.UI.renderQuickAdd(list);
    }

    if (App.UI.isDesktop() && typeof App.UI.renderDesktopChartPanel === "function") {
      App.UI.renderDesktopChartPanel();
    }
  },

  renderInventoryControls: () => {
    const controls = document.getElementById("inventory-controls");
    if (!controls) return;
    controls.innerHTML = "";
    const { viewMode, sortDirection, mobileAdminUnlocked } = App.State;

    const bar = document.createElement("div");
    bar.className = "view-toggle-bar";

    const sortBtn = document.createElement("button");
    sortBtn.className = "btn-sort";
    sortBtn.textContent = `Sort: ${sortDirection.toUpperCase()}`;
    sortBtn.onclick = () => window.sortProductsToggle();

    const sortControl = document.createElement("div");
    sortControl.className = "segmented-control";
    sortControl.appendChild(sortBtn);

    bar.appendChild(sortControl);

    // v3.7.0: Display last inventory update time (with date) next to sort
    const displayTs = App.Utils.getLastInventoryDisplayTs();
    if (displayTs) {
      const timeLabel = document.createElement("div");
      timeLabel.className = "last-update-hint";
      const date = new Date(displayTs);
      const timeStr = date.toLocaleString([], { 
        month: "2-digit", 
        day: "2-digit", 
        hour: "2-digit", 
        minute: "2-digit",
        hour12: false
      });
      timeLabel.textContent = `Updated: ${timeStr}`;
      bar.appendChild(timeLabel);
    }

    if (App.UI.isDesktop() || mobileAdminUnlocked) {
      const viewControl = document.createElement("div");
      viewControl.className = "segmented-control";

      ["edit", "preview"].forEach((mode) => {
        const btn = document.createElement("button");
        btn.className = `btn-edit ${viewMode === mode ? "active" : ""}`;
        btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
        btn.onclick = () => window.toggleViewMode(mode);
        viewControl.appendChild(btn);
      });
      bar.appendChild(viewControl);
    }
    controls.appendChild(bar);
  },

  renderInventoryCount: (count) => {
    const list = document.getElementById("inventory-list");
    let badge = document.getElementById("inventory-count-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "inventory-count-badge";
      badge.className = "product-count-badge";
      badge.style = "text-align: center; margin: 15px 0 10px 0; font-size: 0.85rem; color: var(--text-muted); font-weight: 600; width: 100%;";
      list.parentNode.insertBefore(badge, list);
    }
    badge.innerText = `Products: ${count}`;
  },

  renderQuickAdd: (list) => {
    const wrapper = document.createElement("div");
    wrapper.className = "quick-add-wrapper";

    const card = document.createElement("div");
    card.className = "quick-add-card";
    card.innerHTML = "<span>+ Add Product</span>";
    card.onclick = () => window.showQuickAddForm();

    const formOuter = document.createElement("div");
    formOuter.id = "quick-add-form-container";
    formOuter.className = "hidden";

    wrapper.append(card, formOuter);
    list.appendChild(wrapper);
  },

  renderManageUI: () => {
    const cList = document.getElementById("category-manage-list");
    if (!cList) return;
    cList.innerHTML = "";

    (App.State.categoryOrder || []).forEach((cat, idx) => {
      const li = document.createElement("li");
      li.className = "manage-item";
      li.style = "display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(0,0,0,0.03); border-radius: 12px; margin-bottom: 8px; border: 1px solid var(--border-color);";

      const catSpan = document.createElement("span");
      catSpan.className = "category-name";
      catSpan.style = "font-weight: 500; font-size: 0.95rem; cursor: pointer;";
      catSpan.textContent = cat;
      catSpan.onclick = () => window.editCategory(cat);

      const actions = document.createElement("div");
      actions.className = "category-actions";
      actions.style = "display: flex; gap: 8px;";

      const upBtn = document.createElement("button");
      upBtn.className = "btn-sort";
      upBtn.innerHTML = "Up";
      if (idx === 0) {
        upBtn.disabled = true;
        upBtn.style.opacity = "0.3";
      }
      upBtn.onclick = (e) => { e.stopPropagation(); window.moveCategory(idx, -1); };

      const downBtn = document.createElement("button");
      downBtn.className = "btn-sort";
      downBtn.innerHTML = "Down";
      if (idx === App.State.categoryOrder.length - 1) {
        downBtn.disabled = true;
        downBtn.style.opacity = "0.3";
      }
      downBtn.onclick = (e) => { e.stopPropagation(); window.moveCategory(idx, 1); };

      const delBtn = document.createElement("button");
      delBtn.className = "btn-delete";
      delBtn.innerHTML = "Del";
      delBtn.onclick = (e) => { e.stopPropagation(); window.removeCategory(cat); };

      actions.append(upBtn, downBtn, delBtn);
      li.append(catSpan, actions);
      cList.appendChild(li);
    });
  },


  renderRecentUpdates: () => {
    const container = document.getElementById("recent-history-list");
    if (!container) return;
    container.innerHTML = "";

    const history = App.State.history || [];
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-state">No recent activity</div>';
      return;
    }

    history.forEach((rec) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const time = new Date(rec.timestamp).toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
      item.innerHTML = `
        <span class="history-cat">${App.Utils.escapeHTML(rec.category)}</span>
        <span class="history-product">[${App.Utils.escapeHTML(rec.product)}]</span>
        <span class="history-value">${App.Utils.escapeHTML(String(rec.value))}</span>
        <span class="history-time">${time}</span>
      `;
      container.appendChild(item);
    });
  },

  renderSnapshots: (snapshots) => {
    const container = document.getElementById("snapshot-list");
    if (!container) return;
    if (!snapshots || snapshots.length === 0) {
      container.innerHTML =
        '<div class="snapshot-empty">No snapshots yet</div>';
      return;
    }

    container.innerHTML = "";
    snapshots.forEach((snap) => {
      const d = new Date(snap.created_at);
      const dateStr = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timeStr = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const card = document.createElement("div");
      card.className = "snapshot-card";
      
      // Legacy Expand/Collapse Logic
      card.onclick = (e) => {
        const detail = card.querySelector(".snapshot-detail");
        if (detail) {
          detail.classList.toggle("hidden");
          return;
        }

        // Generate Details
        const detailDiv = document.createElement("div");
        detailDiv.className = "snapshot-detail";
        const data = snap.snapshot_data || {};
        
        const orderedCats = (App.State.categoryOrder || []).concat(
          Object.keys(data).filter(c => !App.State.categoryOrder?.includes(c))
        );

        let html = "";
        orderedCats.forEach((cat) => {
          const items = data[cat] || {};
          const itemKeys = Object.keys(items).filter(k => items[k] > 0);
          if (itemKeys.length === 0) return;

          html += `<div class="snapshot-cat-label">${App.Utils.escapeHTML(cat)}</div>`;
          html += `<div class="snapshot-items-grid">`;
          itemKeys.forEach((p) => {
            html += `<span class="snapshot-item">${App.Utils.escapeHTML(p)}: <b>${items[p]}</b></span>`;
          });
          html += `</div>`;
        });
        
        detailDiv.innerHTML = html;
        card.appendChild(detailDiv);
      };

      const noteHTML = snap.note
        ? `<span class="snapshot-note">${App.Utils.escapeHTML(snap.note)}</span>`
        : "";

      card.innerHTML = `
        <div class="snapshot-card-header" style="display: flex; justify-content: space-between; align-items: center; min-height: 24px;">
          <div style="display: flex; align-items: center;">
            <button class="edit-snapshot-btn" title="Edit Note" aria-label="Edit Note" style="background: none; border: none; cursor: pointer; color: #007aff; padding: 2px; margin-right: 6px; display: inline-flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M4 20H8L18.3 9.7C18.7 9.3 18.7 8.7 18.3 8.3L15.7 5.7C15.3 5.3 14.7 5.3 14.3 5.7L4 16V20Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12.5 7.5L16.5 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <span class="snapshot-time">${dateStr}</span>
            ${noteHTML}
          </div>
        </div>
      `;

      // Event Listeners for sub-buttons
      const editBtn = card.querySelector(".edit-snapshot-btn");
      if (editBtn) {
        editBtn.onclick = (e) => {
          e.stopPropagation();
          const n = prompt("Enter new note:", snap.note || "");
          if (n !== null && n !== snap.note) window.editSnapshotNote(snap.id, n.trim());
        };
      }

      container.appendChild(card);
    });
  },


  renderComparisonError: (msg) => {
    const el = document.getElementById("snapshot-compare-view");
    if (el) el.innerHTML = `<div class="snapshot-empty">${msg}</div>`;
  },

  renderComparison: (oldSnap, newSnap, label) => {
    const el = document.getElementById("snapshot-compare-view");
    if (!el) return;

    const fmt = (d) =>
      new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    const oldData = oldSnap.snapshot_data || {};
    const newData = newSnap.snapshot_data || {};

    const allCats = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const orderedCats = (App.State.categoryOrder || [])
      .concat([...allCats].filter((c) => !App.State.categoryOrder?.includes(c)))
      .filter((c) => allCats.has(c));

    let html = `
      <div class="compare-header">
        <span class="compare-label">${label} Comparison</span>
        <span class="compare-range">${fmt(oldSnap.created_at)} -> ${fmt(
      newSnap.created_at,
    )}</span>
      </div>
    `;

    orderedCats.forEach((cat) => {
      const oldItems = oldData[cat] || {};
      const newItems = newData[cat] || {};
      const allProds = new Set([
        ...Object.keys(oldItems),
        ...Object.keys(newItems),
      ]);

      const changes = [...allProds]
        .map((name) => {
          const o = oldItems[name] || 0;
          const n = newItems[name] || 0;
          return { name, old: o, new: n, diff: n - o };
        })
        .filter((c) => c.diff !== 0);

      if (changes.length > 0) {
        html += `
          <div class="compare-cat-section">
            <div class="compare-cat-title">${cat}</div>
            <div class="compare-grid">
              <div class="compare-row header">
                <span>Product</span><span>Was</span><span>Is</span><span>Diff</span>
              </div>
              ${changes
                .map(
                  (c) => `
                <div class="compare-row">
                  <span>${c.name}</span>
                  <span>${c.old}</span>
                  <span>${c.new}</span>
                  <span class="${c.diff > 0 ? "diff-plus" : "diff-minus"}">
                    ${c.diff > 0 ? "+" : ""}${c.diff}
                  </span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `;
      }
    });

    el.innerHTML = html;
  },

  renderCommonOilsCheckboxes: () => {
    const container = document.getElementById("common-oils-checkbox-list");
    if (!container) return;
    container.innerHTML = "";

    const allProducts = new Set();
    Object.keys(App.State.products).forEach((cat) => {
      if (cat.toLowerCase().includes("bulk oil")) {
        (App.State.products[cat] || []).forEach((p) => allProducts.add(p));
      }
    });

    const sorted = [...allProducts].sort();
    sorted.forEach((oil) => {
      const el = document.createElement("div");
      const isActive = App.State.commonOils.includes(oil);
      el.className = `checkbox-item ${isActive ? "active" : ""}`;
      el.innerText = oil;

      el.onclick = () => {
        const index = App.State.commonOils.indexOf(oil);
        if (index === -1) {
          App.State.commonOils.push(oil);
          el.classList.add("active");
        } else {
          App.State.commonOils.splice(index, 1);
          el.classList.remove("active");
        }
        window.saveToStorage(true);
        App.UI.renderDesktopChart();
      };
      container.appendChild(el);
    });
  },
};

window.showLiveHistory = () => {
  const msgs = App.State.liveMessages || [];
  if (msgs.length === 0) return;

  let html = "<div class='live-history-content'>";
  [...msgs]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .forEach((m) => {
      const text = typeof m === "string" ? m : m.text;
      const ts = typeof m === "string" ? Date.now() : m.ts;
      const time = new Date(ts).toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      html += `
      <div class="history-card">
        <div class="history-card-time">${time}</div>
        <div class="history-card-text">${App.Utils.escapeHTML(text)}</div>
      </div>
    `;
    });
  html += "</div>";

  App.UI.confirm(html, null, null, {
    confirmText: "Close",
    hideCancel: true,
  });
};


