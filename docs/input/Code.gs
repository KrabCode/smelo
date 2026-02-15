// Google Apps Script: append posted JSON rows to a spreadsheet
// Usage: set SPREADSHEET_ID and SECRET then Deploy > New deployment > Web app
// Execute as: Me, Who has access: Anyone

var SPREADSHEET_ID = 'REPLACE_WITH_SPREADSHEET_ID';
var SECRET = 'REPLACE_WITH_SECRET';

function doPost(e){
  try{
    if(!e || !e.postData || !e.postData.contents){
      return ContentService.createTextOutput(JSON.stringify({ok:false,error:'no_post_data'})).setMimeType(ContentService.MimeType.JSON);
    }
    var payload = JSON.parse(e.postData.contents);
    if(!payload || payload.secret !== SECRET){
      return ContentService.createTextOutput(JSON.stringify({ok:false,error:'unauthorized'})).setMimeType(ContentService.MimeType.JSON);
    }
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Sheet1') || ss.getSheets()[0];
    // Build a row: timestamp, player, amount, note
    var row = [ new Date(), payload.player || '', payload.amount || '', payload.note || '' ];
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

