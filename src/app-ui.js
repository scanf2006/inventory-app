/**
 * App UI Management and Rendering helper
 * Waycred Inventory v3.3 ES6+ Modularization
 */
window.App = window.App || {};

App.UI = {
  // Check if device layout is Desktop
  isDesktop: () => {
    if (App.State.isAdmin) return false;
    return window.innerWidth >= 768;
  },

  // Update cloud sync status badge in Settings
  updateSyncStatus: (status, isOnline) => {
    const el = document.getElementById("sync-status");
    if (el) {
      const span = el.querySelector("span");
      if (span) {
        span.innerText = status;
        if (isOnline) el.classList.add("online");
        else el.classList.remove("online");
      }
    }
  },

  // Display a floating toast message
  showToast: (message, type = "info") => {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icons = {
      success: "✅",
      error: "⚠️",
      info: "ℹ️",
    };
    const icon = icons[type] || icons.info;

    toast.innerHTML = `
      <span>${icon}</span>
      <span>${App.Utils.escapeHTML(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("hiding");
      toast.addEventListener("animationend", () => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, 3000);
  },

  // Custom modal-based confirmation dialog
  confirm: (msg, onConfirm, onCancel, options = {}) => {
    const overlay = document.getElementById("confirm-modal");
    const msgEl = document.getElementById("confirm-msg");
    const yesBtn = document.getElementById("confirm-yes-btn");
    const noBtn = document.getElementById("confirm-no-btn");

    if (!overlay || !msgEl || !yesBtn || !noBtn) {
      if (window.confirm(msg)) {
        onConfirm?.();
      } else {
        onCancel?.();
      }
      return;
    }

    msgEl.innerHTML = msg;

    // Customizable button text
    yesBtn.textContent = options.confirmText || "Yes";
    noBtn.textContent = options.cancelText || "No";

    // Show modal
    overlay.classList.remove("hidden");

    // Clean old listeners using cloneNode
    const newYes = yesBtn.cloneNode(true);
    const newNo = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);
    noBtn.parentNode.replaceChild(newNo, noBtn);

    newYes.onclick = () => {
      overlay.classList.add("hidden");
      onConfirm?.();
    };
    newNo.onclick = () => {
      overlay.classList.add("hidden");
      onCancel?.();
    };
  },
};
