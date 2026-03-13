// content.js — injected into job pages
// Listens for a scrape request from popup.js and responds with job details.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "scrape") return false;

  try {
    const data = scrapeJobDetails(); // defined in scraper.js (loaded first)
    sendResponse({ ok: true, data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }

  return true;
});
