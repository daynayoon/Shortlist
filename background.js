// background.js — Service worker: OAuth + Sheets API

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SHORTLIST") {
    handleShortlist(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function handleShortlist(payload) {
  const { spreadsheetId } = await chrome.storage.sync.get("spreadsheetId");
  if (!spreadsheetId) {
    return { success: false, error: "NO_SPREADSHEET_ID" };
  }

  let token;
  try {
    token = await getAuthToken(true);
  } catch (e) {
    console.error("[Shortlist] Auth failed:", e);
    return { success: false, error: "Auth failed" };
  }

  const { jobTitle, company, date, link } = payload;
  // Append to A:E (includes Status column)
  const range = "Sheet1!A:E";
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  let response = await fetch(appendUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[jobTitle, company, date, link, "None"]] }),
  });

  // Retry once on 401
  if (response.status === 401) {
    await removeCachedToken(token);
    try {
      token = await getAuthToken(true);
      response = await fetch(appendUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [[jobTitle, company, date, link, "None"]] }),
      });
    } catch (e) {
      return { success: false, error: "Auth failed" };
    }
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Shortlist] Sheets API error ${response.status}:`, text);
    return { success: false, error: `Sheets error ${response.status}` };
  }

  // Get the row number that was just appended from the response
  const result = await response.json();
  const updatedRange = result.updates?.updatedRange ?? "";
  // updatedRange looks like "Sheet1!A5:E5" — extract the row number
  const rowMatch = updatedRange.match(/:E(\d+)$/);
  const rowIndex = rowMatch ? parseInt(rowMatch[1], 10) - 1 : null; // 0-based

  // Fire-and-forget: resize columns + add status dropdown
  Promise.all([
    autoResizeColumns(token, spreadsheetId),
    rowIndex !== null ? addStatusDropdown(token, spreadsheetId, rowIndex) : Promise.resolve(),
  ]).catch(() => {});

  return { success: true };
}

async function autoResizeColumns(token, spreadsheetId) {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          autoResizeDimensions: {
            dimensions: { sheetId: 0, dimension: "COLUMNS", startIndex: 0, endIndex: 5 },
          },
        }],
      }),
    }
  );
}

async function addStatusDropdown(token, spreadsheetId, rowIndex) {
  // Set data validation (dropdown) on column E of the new row
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          setDataValidation: {
            range: {
              sheetId: 0,
              startRowIndex: rowIndex,
              endRowIndex: rowIndex + 1,
              startColumnIndex: 4, // column E
              endColumnIndex: 5,
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [
                  { userEnteredValue: "None" },
                  { userEnteredValue: "Applied" },
                  { userEnteredValue: "Interviewed" },
                ],
              },
              showCustomUi: true,
              strict: true,
            },
          },
        }],
      }),
    }
  );
}

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}
