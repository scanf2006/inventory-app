/**
 * App UI Management and Rendering helper
 * Waycred Inventory v3.2 Modularization
 */
window.App = window.App || {};

App.UI = {
  // Check if device layout is Desktop
  isDesktop: function () {
    if (App.State.isAdmin) return false;
    return window.innerWidth >= 768;
  },

  // Update cloud sync status badge in Settings
  updateSyncStatus: function (status, isOnline) {
    var el = document.getElementById("sync-status");
    if (el) {
      var span = el.querySelector("span");
      if (span) {
        span.innerText = status;
        if (isOnline) el.classList.add("online");
        else el.classList.remove("online");
      }
    }
  },

  // Display a floating toast message
  showToast: function (message, type) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    if (!container) return;

    var toast = document.createElement("div");
    toast.className = "toast " + type;

    var icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "⚠️";

    toast.innerHTML =
      "<span>" +
      icon +
      "</span><span>" +
      App.Utils.escapeHTML(message) +
      "</span>";
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add("hiding");
      toast.addEventListener("animationend", function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, 3000);
  },

  // Custom modal-based confirmation dialog
  confirm: function (msg, onConfirm, onCancel, options) {
    options = options || {};
    var overlay = document.getElementById("confirm-modal");
    var msgEl = document.getElementById("confirm-msg");
    var yesBtn = document.getElementById("confirm-yes-btn");
    var noBtn = document.getElementById("confirm-no-btn");

    if (!overlay || !msgEl || !yesBtn || !noBtn) {
      if (window.confirm(msg)) {
        if (onConfirm) onConfirm();
      } else if (onCancel) {
        onCancel();
      }
      return;
    }

    msgEl.innerHTML = msg;

    // Customizable button text
    yesBtn.textContent = options.confirmText || "Yes";
    noBtn.textContent = options.cancelText || "No";

    // Show modal
    overlay.classList.remove("hidden");

    // Clean old listeners
    var newYes = yesBtn.cloneNode(true);
    var newNo = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);
    noBtn.parentNode.replaceChild(newNo, noBtn);

    newYes.onclick = function () {
      overlay.classList.add("hidden");
      if (onConfirm) onConfirm();
    };
    newNo.onclick = function () {
      overlay.classList.add("hidden");
      if (onCancel) onCancel();
    };
  },
};
