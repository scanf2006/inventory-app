/**
 * Data Export, Import and PDF Service
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.Data = {
  exportPDF: async () => {
    const reportDate = new Date().toLocaleString();
    const lastUpdatedTs = App.Utils.getLastInventoryDisplayTs
      ? App.Utils.getLastInventoryDisplayTs()
      : (App.State.lastInventoryUpdate || 0);
    const lastUpdatedText = lastUpdatedTs
      ? new Date(lastUpdatedTs).toLocaleString()
      : "N/A";

    const { categoryOrder, products, inventory } = App.State;
    const sections = [];

    (categoryOrder || []).forEach((cat) => {
      const allProducts = products[cat] || [];
      if (allProducts.length === 0) return;

      // Report should only include items with inventory > 0.
      const visibleProducts = allProducts
        .map((name) => {
          const key = App.Utils.getProductKey(cat, name);
          const total = App.Utils.safeEvaluate(inventory[key]);
          return { name, total };
        })
        .filter((it) => it.total > 0);

      if (visibleProducts.length === 0) return;

      let unitSuffix = "";
      const catLower = cat.toLowerCase();
      if (catLower.includes("bulk oil")) unitSuffix = " (L)";
      else if (catLower.includes("case oil")) unitSuffix = " (Cases)";

      sections.push({
        title: `${cat}${unitSuffix}`,
        items: visibleProducts,
      });
    });

    if (sections.length === 0) return App.UI.showToast("No data to export", "info");

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const fileName = `Waycred_Inventory_Report_${dateStr}.pdf`;

    try {
      const jsPDFCtor =
        window.jspdf?.jsPDF ||
        window.jsPDF ||
        window.html2pdf?.__private__?.jsPDF;
      if (!jsPDFCtor) throw new Error("jsPDF not available");

      const pdf = new jsPDFCtor({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const lineH = 6;
      let y = margin;

      const drawHeader = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        pdf.text("Waycred Inventory Report", margin, y);
        y += 7;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`Report Date: ${reportDate}`, margin, y);
        const lastUpdatedLabel = `Last Updated: ${lastUpdatedText}`;
        const txtW = pdf.getTextWidth(lastUpdatedLabel);
        pdf.text(lastUpdatedLabel, pageWidth - margin - txtW, y);
        y += 6;
      };

      const ensureSpace = (needed) => {
        if (y + needed <= pageHeight - margin) return;
        pdf.addPage();
        y = margin;
        drawHeader();
      };

      drawHeader();

      sections.forEach((section) => {
        ensureSpace(10);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text(section.title, margin, y);
        y += lineH;

        section.items.forEach(({ name, total }) => {
          ensureSpace(6);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9.5);
          pdf.text(String(name), margin + 2, y);
          const v = String(total);
          const vw = pdf.getTextWidth(v);
          pdf.text(v, pageWidth - margin - vw, y);
          y += 5.2;
        });

        y += 3;
      });

      pdf.save(fileName);

      App.UI.showToast("PDF Exported", "success");
    } catch (err) {
      console.error("PDF Export failed:", err);
      App.UI.showToast("Export failed", "error");
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
