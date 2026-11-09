function doPost(event) {
  var properties = PropertiesService.getScriptProperties();
  var expectedToken = properties.getProperty("LENDY_SENDER_TOKEN");
  if (!expectedToken || expectedToken.length < 40) {
    return jsonResponse({
      success: false,
      error: "Sender token is not configured.",
    });
  }

  var payload;
  try {
    payload = JSON.parse(event.postData.contents);
  } catch (error) {
    return jsonResponse({ success: false, error: "Invalid JSON payload." });
  }

  if (typeof payload.token !== "string" || payload.token !== expectedToken) {
    return jsonResponse({ success: false, error: "Unauthorized sender." });
  }

  var recipient = typeof payload.to === "string" ? payload.to.trim() : "";
  var senderEmail =
    typeof payload.senderEmail === "string" ? payload.senderEmail.trim() : "";
  var subject = typeof payload.subject === "string" ? payload.subject : "";
  var message = typeof payload.text === "string" ? payload.text : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail) ||
    !subject ||
    subject.length > 200 ||
    !message ||
    message.length > 10000
  ) {
    return jsonResponse({ success: false, error: "Invalid email fields." });
  }

  try {
    var actualSender = Session.getEffectiveUser().getEmail();
    if (
      actualSender &&
      actualSender.toLowerCase() !== senderEmail.toLowerCase()
    ) {
      return jsonResponse({
        success: false,
        error: "The configured sender does not match the Apps Script owner.",
      });
    }

    GmailApp.sendEmail(recipient, subject, message, { name: "Lendy" });
    return jsonResponse({ success: true });
  } catch (error) {
    console.error("GmailApp could not send the approval email.", error);
    var errorMessage = String(error && error.message ? error.message : error);
    var userMessage = "Gmail send failed. Open Apps Script Executions for details.";
    if (/quota|too many times/i.test(errorMessage)) {
      userMessage = "The Gmail account reached its daily sending quota. Try again after the quota resets.";
    } else if (/permission|authorization|authoriz|not allowed/i.test(errorMessage)) {
      userMessage = "Gmail permission is missing. Run authorizeGmailSender in the Apps Script editor, then redeploy.";
    }
    return jsonResponse({
      success: false,
      error: userMessage,
    });
  }
}

function authorizeGmailSender() {
  GmailApp.getAliases();
  var remainingQuota = MailApp.getRemainingDailyQuota();
  console.log(
    "Gmail sender authorization is active. Remaining recipient quota: " +
      remainingQuota,
  );
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
