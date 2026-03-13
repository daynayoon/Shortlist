// background.js — service worker
// Handles OAuth token acquisition and Google Sheets API calls.

importScripts("config.js");

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

// ── Auth ──────────────────────────────────────────────────────

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive, scopes: [SCOPES] }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

// ── Sheets helpers ────────────────────────────────────────────

async function ensureHeaderRow(token) {
  const headers = [
    "Date Added", "Job Title", "Company",
    "Salary", "Posted Date", "Deadline", "URL",
  ];

  // Read first row to check if headers exist
  const range = encodeURIComponent(`${CONFIG.SHEET_NAME}!A1:G1`);
  const res = await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const existing = data.values?.[0] ?? [];

  if (existing[0] === "Date Added") return; // already set up

  // Write header row
  await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [headers] }),
    }
  );
}

async function appendToSheet(rowData) {
  const token = await getAuthToken();
  await ensureHeaderRow(token);

  const row = [
    new Date().toISOString().split("T")[0], // Date Added (YYYY-MM-DD)
    rowData.jobTitle ?? "",
    rowData.company ?? "",
    rowData.salary ?? "",
    rowData.postedDate ?? "",
    rowData.deadline ?? "",
    rowData.url ?? "",
  ];

  const range = encodeURIComponent(`${CONFIG.SHEET_NAME}!A:G`);
  const res = await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Sheets API error");
  }

  return await res.json();
}

// ── Message listener ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "shortlist") return false;

  appendToSheet(message.data)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});
