Hidden input prototype

Files added:
- index.html — static page that either POSTS JSON to your Apps Script web app or simulates locally by storing rows in localStorage.
- Code.gs — Google Apps Script template (set SPREADSHEET_ID and SECRET before deploying).

Quick steps to test locally:
1. Open `docs/input/index.html` in your browser. (It's a static page; you can open the file directly.)
2. Check "Simulate locally" — submit rows and see them stored in the preview table.

To use with a real Google Sheet:
1. Create a new Google Apps Script project (https://script.google.com).
2. Replace `SPREADSHEET_ID` and `SECRET` in `Code.gs` with your spreadsheet ID and a random secret string.
3. Deploy > New deployment > Select "Web app". Set "Execute as" to "Me" and "Who has access" to "Anyone" (or a more restrictive setting that fits your needs).
4. Copy the web app URL and paste it into the Web app URL field on `docs/input/index.html`.
5. Enter the same secret in the form.

Security notes:
- The prototype uses a shared secret for simple protection. For production, prefer OAuth or an authenticated backend.
- Make sure your spreadsheet permissions and Apps Script deployment settings match your security needs.

