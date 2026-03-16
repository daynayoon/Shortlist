# Job Shortlist Extension

Chrome extension to save job postings directly to Google Sheets.

## Setup

1. Create a Google Cloud project → enable Sheets API → create OAuth 2.0 credentials
2. Copy your Client ID and Spreadsheet ID into `config.js`
3. Go to `chrome://extensions` → enable Developer mode → Load unpacked → select this folder

## Usage

Navigate to a job posting → click the extension icon → hit **Shortlist**.
Job details are scraped and appended as a new row in your sheet.

## Supported Sites

LinkedIn, Indeed, Workday, Greenhouse, Lever (+ generic fallback for others)

## Sheet Columns

| Date Added | Job Title | Company | Salary | Posted Date | Deadline | URL |
