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
    "Location", "Salary", "Posted Date", "Deadline",
  ];

  // Read first row to check if headers exist
  const range = encodeURIComponent(`${CONFIG.SHEET_NAME}!A1:G1`);
  const res = await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const existing = data.values?.[0] ?? [];

  // Re-run if headers are missing OR structure is outdated (e.g. no Location column)
  if (JSON.stringify(existing) === JSON.stringify(headers)) return;

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

  // Get sheet ID for formatting
  const metaRes = await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const sheet = meta.sheets?.find(
    (s) => s.properties.title === CONFIG.SHEET_NAME
  );
  if (!sheet) return;
  const sheetId = sheet.properties.sheetId;

  // Format header row: bold, dark background, white text, freeze row
  await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.18, green: 0.20, blue: 0.24 },
                  textFormat: {
                    bold: true,
                    fontSize: 11,
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                  },
                  horizontalAlignment: "CENTER",
                  verticalAlignment: "MIDDLE",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 32 },
              fields: "pixelSize",
            },
          },
        ],
      }),
    }
  );
}

async function appendToSheet(rowData) {
  const token = await getAuthToken();
  await ensureHeaderRow(token);

  const title = rowData.jobTitle ?? "";
  const url = rowData.url ?? "";
  const titleCell = title && url
    ? `=HYPERLINK("${url.replace(/"/g, '""')}","${title.replace(/"/g, '""')}")`
    : title || url;

  const row = [
    new Date().toISOString().split("T")[0], // Date Added (YYYY-MM-DD)
    titleCell,
    rowData.company ?? "",
    rowData.location ?? "",
    rowData.salary ?? "",
    rowData.postedDate ?? "",
    rowData.deadline ?? "",
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

  const resJson = await res.json();
  if (!res.ok) {
    throw new Error(resJson.error?.message ?? "Sheets API error");
  }

  // Get sheet ID for formatting
  const metaRes = await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const sheet = meta.sheets?.find((s) => s.properties.title === CONFIG.SHEET_NAME);
  if (!sheet) return resJson;
  const sheetId = sheet.properties.sheetId;

  // Parse the updated row index from response (e.g. "Shortlist!A8:G8" → row 8 → index 7)
  const updatedRange = resJson.updates?.updatedRange ?? "";
  const rowMatch = updatedRange.match(/!A(\d+)/);
  const rowIndex = rowMatch ? parseInt(rowMatch[1], 10) - 1 : null;

  const requests = [
    // Auto-resize all 7 columns to fit content
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 7 },
      },
    },
  ];

  // Center-align the new data row, white background
  if (rowIndex !== null) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 1, green: 1, blue: 1 },
            textFormat: { foregroundColor: { red: 0, green: 0, blue: 0 }, bold: false },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      },
    });
  }

  await fetch(
    `${SHEETS_API}/${CONFIG.SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );

  return resJson;
}

// ── Message listener ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "shortlist") return false;

  appendToSheet(message.data)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async response
});
