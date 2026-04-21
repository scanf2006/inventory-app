/**
 * Data Export, Import and PDF Service
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Data = {
  exportPDF: async () => {
    const pdfArea = document.getElementById("pdf-template");
    const pdfContent = document.getElementById("pdf-content");
    const pdfDate = document.getElementById("pdf-date");
    if (!pdfArea || !pdfContent || !pdfDate) return;

    pdfDate.innerText = `Report Date: ${new Date().toLocaleString()}`;
    pdfContent.innerHTML = "";
    let hasData = false;

    const { categoryOrder, products, inventory } = App.State;

    (categoryOrder || []).forEach((cat) => {
      const allProducts = products[cat] || [];
      if (allProducts.length > 0) {
        hasData = true;
        const block = document.createElement("div");
        block.className = "pdf-category-block";

        let unitSuffix = "";
        const catLower = cat.toLowerCase();
        if (catLower.includes("bulk oil")) unitSuffix = " (L)";
        else if (catLower.includes("case oil")) unitSuffix = " (Cases)";

        block.innerHTML = `<div class="pdf-category-title">${App.Utils.escapeHTML(
          cat,
        )}${unitSuffix}</div>`;

        const grid = document.createElement("div");
        grid.className = "pdf-grid";

        allProducts.forEach((name) => {
          const key = App.Utils.getProductKey(cat, name);
          const total = App.Utils.safeEvaluate(inventory[key]);
          const item = document.createElement("div");
          item.className = "pdf-grid-item";
          item.innerHTML = `<span class="p-name">${App.Utils.escapeHTML(
            name,
          )}</span><span class="p-val">${total}</span>`;
          grid.appendChild(item);
        });

        // Add spacer if odd number of items for grid alignment
        if (allProducts.length % 2 !== 0) {
          const spacer = document.createElement("div");
          spacer.className = "pdf-grid-item";
          spacer.innerHTML = "<span></span><span></span>";
          grid.appendChild(spacer);
        }

        block.appendChild(grid);
        pdfContent.appendChild(block);
      }
    });

    if (!hasData) return App.UI.showToast("No data to export", "info");

    pdfArea.classList.remove("hidden");

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const fileName = `Waycred_Inventory_Report_${dateStr}.pdf`;

    try {
      await html2pdf()
        .set({
          margin: 10,
          filename: fileName,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(pdfArea)
        .save();

      App.UI.showToast("PDF Exported", "success");
    } catch (err) {
      console.error("PDF Export failed:", err);
      App.UI.showToast("Export failed", "error");
    } finally {
      pdfArea.classList.add("hidden");
    }
  },

  exportJSON: () => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleString();

    const data = {
      products: App.State.products,
      inventory: App.State.inventory,
      categoryOrder: App.State.categoryOrder,
      exportDate: timeStr,
      version: App.Config.VERSION,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.UI.showToast("Data Exported", "success");
  },

  importJSON: (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.products || !data.inventory) {
          throw new Error("Invalid inventory file format");
        }

        // Exact replacement strategy
        App.State.products = {};
        Object.keys(data.products).forEach((cat) => {
          App.State.products[cat] = [...data.products[cat]];
        });

        App.State.inventory = { ...data.inventory };
        if (data.categoryOrder) {
          App.State.categoryOrder = [...data.categoryOrder];
        }

        App.State.lastInventoryUpdate = Date.now();
        
        // Finalize import
        if (typeof window.saveToStorage === 'function') window.saveToStorage(true);
        if (typeof window.initializeCategory === 'function') window.initializeCategory();
        
        App.UI.renderTabs();
        App.UI.renderInventory();
        App.UI.renderManageUI();
        App.UI.showToast("Data Imported Successfully", "success");
      } catch (err) {
        console.error("Import error:", err);
        App.UI.showToast("Import Failed: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  },

  purgeZeroStock: () => {
    let count = 0;
    const { products, inventory } = App.State;

    Object.keys(products).forEach((cat) => {
      const originalList = products[cat];
      const filteredList = originalList.filter((name) => {
        const key = App.Utils.getProductKey(cat, name);
        const valStr = inventory[key] || "";
        const total = App.Utils.safeEvaluate(valStr);
        if (total === 0) {
          delete inventory[key];
          count++;
          return false;
        }
        return true;
      });
      products[cat] = filteredList;
    });

    if (count > 0) {
      if (typeof window.saveToStorage === 'function') window.saveToStorage(true);
      App.UI.renderInventory();
      App.UI.showToast(`Purged ${count} zero-stock item(s)`, "success");
    } else {
      App.UI.showToast("No zero-stock items found", "info");
    }
  },
};
