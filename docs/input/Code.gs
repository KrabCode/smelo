// Google Apps Script: add a session row to the poker spreadsheet
// Deploy > New deployment > Web app (Execute as: Me, Access: Anyone)

var SPREADSHEET_ID = '1mgmd5MHqA9bmzkF4kBt2hNDi3ZgdG0Gj_NNHPt0qB4Y';
var SECRET = 'add the secret here';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'no_post_data' });
    }
    var payload = JSON.parse(e.postData.contents);
    if (!payload || payload.secret !== SECRET) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Map player names to column indices (0-based)
    var colMap = {};
    for (var i = 0; i < headers.length; i++) {
      if (headers[i]) colMap[String(headers[i]).trim()] = i;
    }

    // Build new row: col 0 = empty, col 1 = date, rest = player amounts
    var entries = payload.entries || [];
    var rowLength = headers.length;

    // Check for new players and add columns
    for (var j = 0; j < entries.length; j++) {
      var name = String(entries[j].name).trim();
      if (!(name in colMap)) {
        // New player: add column header and row 2 SUM formula
        rowLength++;
        sheet.getRange(1, rowLength).setValue(name);
        var colLetter = columnToLetter(rowLength);
        sheet.getRange(2, rowLength).setFormula('=SUM(' + colLetter + '3:' + colLetter + '999)');
        colMap[name] = rowLength - 1;
      }
    }

    // Build the row array
    var newRow = [];
    for (var k = 0; k < rowLength; k++) newRow.push('');
    newRow[1] = payload.date || '';

    for (var m = 0; m < entries.length; m++) {
      var playerName = String(entries[m].name).trim();
      var col = colMap[playerName];
      if (col !== undefined) {
        newRow[col] = entries[m].amount;
      }
    }

    sheet.appendRow(newRow);

    // Set col A to =SUM(C:ABC) formula for the new row
    var newRowNum = sheet.getLastRow();
    sheet.getRange(newRowNum, 1).setFormula('=SUM(C' + newRowNum + ':ABC' + newRowNum + ')');

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function columnToLetter(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
