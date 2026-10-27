/**
 * Jarvis - Drive koprusu (Google Apps Script)
 * 1) ANAHTAR'i kendi uydurdugun bir sifreyle degistir.
 * 2) Dagit > Yeni dagitim > Web uygulamasi > Calistiran: Ben, Erisim: Herkes.
 */
var ANAHTAR = "BURAYA-KENDI-SIFRENI-YAZ";
var KOK_AD = "Jarvis";
var ALT = ["ham", "ornek", "malzeme", "bitti"];

function kok_() {
  var it = DriveApp.getRootFolder().getFoldersByName(KOK_AD);
  var kok = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(KOK_AD);
  var ids = { kok: kok.getId() };
  ALT.forEach(function (a) {
    var f = kok.getFoldersByName(a);
    ids[a] = (f.hasNext() ? f.next() : kok.createFolder(a)).getId();
  });
  return ids;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.anahtar !== ANAHTAR) return cikti_({ hata: "yetkisiz" });
  if (p.islem === "kurulum" || p.islem === "token") {
    var k = kok_();
    return cikti_({ token: ScriptApp.getOAuthToken(), klasorler: k });
  }
  return cikti_({ hata: "bilinmeyen islem" });
}

function cikti_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Ilk calistirmada izin istemesi icin: bu fonksiyonu bir kez "Calistir" ile calistir.
function izinVer() {
  Logger.log(JSON.stringify(kok_()));
}
