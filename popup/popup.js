// popup.js

const input = document.getElementById("sheet-id");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");

// Load saved value
chrome.storage.sync.get("spreadsheetId", ({ spreadsheetId }) => {
  if (spreadsheetId) {
    input.value = spreadsheetId;
  }
});

saveBtn.addEventListener("click", () => {
  const value = input.value.trim();
  if (!value) {
    showStatus("Please paste your Spreadsheet ID.", false);
    return;
  }

  chrome.storage.sync.set({ spreadsheetId: value }, () => {
    showStatus("Saved!", true);
  });
});

function showStatus(msg, ok) {
  status.textContent = msg;
  status.className = "status " + (ok ? "ok" : "err");
  setTimeout(() => {
    status.textContent = "";
    status.className = "status";
  }, 3000);
}
