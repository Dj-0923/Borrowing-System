const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  buildBorrowerAssistantResponse,
  findInventoryCategory,
  fallbackBorrowerIntent,
  isBorrowerDomainQuestion,
} = require("./borrower-assistant");
const { isAllowedApiRequest } = require("./request-origin");
const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT || 8080);
const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const adminDirectory = path.resolve(__dirname, "../admin");
const staticContentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const renderOrigin = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : null;
const allowedOrigins = new Set(
  [
    ...(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    "https://borrowing-system-lendy.web.app",
    "https://borrowing-system-lendy.firebaseapp.com",
  ],
);
if (renderOrigin) allowedOrigins.add(renderOrigin);

if (!projectId) throw new Error("FIREBASE_PROJECT_ID must be configured.");
if (!serviceAccountJson) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be configured.");
}
if (allowedOrigins.size === 0) {
  throw new Error("ALLOWED_ORIGINS must contain the admin dashboard origin.");
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (error) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.", {
    cause: error,
  });
}
if (serviceAccount.project_id !== projectId) {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT_JSON project_id must match FIREBASE_PROJECT_ID.",
  );
}

initializeApp({
  credential: cert(serviceAccount),
  projectId,
});

const auth = getAuth();
const db = getFirestore();

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, body, origin) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (origin) {
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function serveAdminFile(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end();
    return true;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(adminDirectory, relativePath);
  if (!filePath.startsWith(adminDirectory + path.sep)) {
    response.writeHead(404);
    response.end();
    return true;
  }

  let content;
  try {
    content = await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return false;
    throw error;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": staticContentTypes[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : content);
  return true;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (oversized) return;
      body += chunk;
      if (body.length > 16_384) {
        oversized = true;
        body = "";
        reject(new HttpError(413, "Request body is too large."));
      }
    });
    request.on("end", () => {
      if (oversized) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

async function requireAdmin(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Sign in as an admin to continue.");

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, "The admin sign-in has expired. Sign in again.");
  }

  const admin = await db.collection("admins").doc(decodedToken.uid).get();
  if (!admin.exists || admin.data().role !== "admin") {
    throw new HttpError(403, "Admin access is required.");
  }
  return decodedToken.uid;
}

async function requireBorrower(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Sign in to use the assistant.");

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, "Your sign-in has expired. Sign in again.");
  }

  const account = await db.collection("accounts").doc(decodedToken.uid).get();
  const data = account.data();
  if (
    !account.exists ||
    data?.status !== "active" ||
    !["student", "faculty"].includes(data?.role)
  ) {
    throw new HttpError(403, "An active student or faculty account is required.");
  }
  return decodedToken.uid;
}

function getEmailSenderConfig() {
  const email = (process.env.EMAIL_USER || "").trim();
  const scriptUrl = (process.env.GMAIL_APPS_SCRIPT_URL || "").trim();
  const senderToken = (process.env.GMAIL_SENDER_TOKEN || "").trim();
  if (!email || !scriptUrl || !senderToken) {
    throw new HttpError(
      503,
      "Email delivery is not configured. Set EMAIL_USER, GMAIL_APPS_SCRIPT_URL, and GMAIL_SENDER_TOKEN on the approval service.",
    );
  }
  if (!isValidEmail(email) || senderToken.length < 40) {
    throw new HttpError(
      503,
      "The configured Gmail sender email or sender token is invalid.",
    );
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(scriptUrl);
  } catch {
    throw new HttpError(503, "GMAIL_APPS_SCRIPT_URL must be a valid HTTPS URL.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "script.google.com" ||
    !parsedUrl.pathname.includes("/macros/s/") ||
    !parsedUrl.pathname.endsWith("/exec")
  ) {
    throw new HttpError(503, "GMAIL_APPS_SCRIPT_URL must be a deployed Google Apps Script /exec URL.");
  }
  return { email, scriptUrl, senderToken };
}

async function sendEmailWithGmailScript({
  scriptUrl,
  senderToken,
  senderEmail,
  to,
  subject,
  text,
}) {
  let response;
  try {
    let url = scriptUrl;
    let options = {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: senderToken,
        senderEmail,
        to,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(20000),
    };

    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await fetch(url, options);
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("The Gmail sender returned a redirect without a destination.");
      }
      if (redirects === 5) {
        throw new Error("The Gmail sender exceeded the redirect limit.");
      }
      const redirectUrl = new URL(location, url);
      if (
        redirectUrl.protocol !== "https:" ||
        !["script.google.com", "script.googleusercontent.com"].includes(
          redirectUrl.hostname,
        )
      ) {
        throw new Error("The Gmail sender redirected to an unexpected host.");
      }
      url = redirectUrl;
      options = {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      };
    }
  } catch (error) {
    console.error("Could not reach the Gmail Apps Script sender.", {
      error: error.message,
    });
    throw new HttpError(502, "Could not connect to the Gmail email sender.");
  }

  const responseText = await response.text();
  let result;
  try {
    result = JSON.parse(responseText);
  } catch (error) {
    console.error("The Gmail sender returned a non-JSON response.", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      responsePreview: responseText.slice(0, 400),
    });
    throw new HttpError(
      502,
      "The Gmail email sender returned an invalid response. Check its deployment access and execution logs.",
    );
  }
  if (!response.ok || result.success !== true) {
    console.error("Gmail Apps Script could not send the message.", {
      status: response.status,
      error: typeof result.error === "string" ? result.error : "Unknown sender error.",
    });
    throw new HttpError(
      502,
      typeof result.error === "string"
        ? result.error
        : "Gmail could not send the temporary password email.",
    );
  }
}

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requestLockId(email) {
  return createHash("sha256").update(email).digest("hex");
}

async function deleteRequestCredentials(requestRef) {
  let deletedCount = 0;
  while (true) {
    const credentials = await requestRef
      .collection("privateCredentials")
      .limit(400)
      .get();
    if (credentials.empty) return deletedCount;

    const batch = db.batch();
    credentials.docs.forEach((credential) => batch.delete(credential.ref));
    await batch.commit();
    deletedCount += credentials.size;
  }
}

async function deleteSubcollectionDocuments(documentRef, collectionName) {
  let deletedCount = 0;
  while (true) {
    const snapshot = await documentRef.collection(collectionName).limit(400).get();
    if (snapshot.empty) return deletedCount;

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deletedCount += snapshot.size;
  }
}

async function releaseRequestEmailLock(email, requestId) {
  const lockRef = db.collection("accountRequestEmailLocks").doc(requestLockId(email));
  const lock = await lockRef.get();
  if (lock.exists && lock.data().requestId === requestId) {
    await lockRef.delete();
  }
}

async function createAccountRequest(data) {
  const email = normalizedEmail(data && data.email);
  const name = typeof (data && data.fullName) === "string"
    ? data.fullName.trim()
    : "";
  const role = data && data.role;
  const idNumber = typeof (data && data.idNumber) === "string"
    ? data.idNumber.trim()
    : "";
  const college = typeof (data && data.college) === "string"
    ? data.college.trim()
    : "";
  const gender = data && data.gender;
  const yearLevel = data && data.yearLevel;
  const block = data && data.block;

  if (!isValidEmail(email)) {
    throw new HttpError(400, "Enter a valid email address.", "invalid-email");
  }
  if (!name || name.length > 120 || !idNumber || idNumber.length > 80) {
    throw new HttpError(400, "Enter a valid name and ID number.", "invalid-details");
  }
  if (!["student", "faculty"].includes(role) || !college || college.length > 160) {
    throw new HttpError(400, "Choose a valid role and college.", "invalid-details");
  }
  if (!["Male", "Female"].includes(gender)) {
    throw new HttpError(400, "Choose a valid gender.", "invalid-details");
  }
  if (
    role === "student" &&
    (!["1st year", "2nd year", "3rd year", "4th year", "5th year"].includes(yearLevel) ||
      !["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].includes(block))
  ) {
    throw new HttpError(400, "Choose a valid year level and block.", "invalid-details");
  }

  const accounts = db.collection("accounts");
  const accountRequests = db.collection("accountRequests");
  const [matchingAccounts, matchingRequests] = await Promise.all([
    accounts.where("email", "==", email).limit(2).get(),
    accountRequests.where("email", "==", email).get(),
  ]);
  if (!matchingAccounts.empty) {
    throw new HttpError(409, "This email already belongs to an account.", "email-already-in-use");
  }
  if (matchingRequests.docs.some((request) => request.data().status !== "rejected")) {
    throw new HttpError(
      409,
      "There is already a request waiting for this email.",
      "request-already-pending",
    );
  }

  for (const oldRequest of matchingRequests.docs) {
    await deleteRequestCredentials(oldRequest.ref);
    await oldRequest.ref.delete();
    await releaseRequestEmailLock(email, oldRequest.id);
  }

  try {
    const existingUser = await auth.getUserByEmail(email);
    const [existingAccount, adminRecord] = await Promise.all([
      accounts.doc(existingUser.uid).get(),
      db.collection("admins").doc(existingUser.uid).get(),
    ]);
    if (
      existingAccount.exists ||
      (adminRecord.exists && adminRecord.data().role === "admin")
    ) {
      throw new HttpError(409, "This email already belongs to an account.", "email-already-in-use");
    }
    await auth.deleteUser(existingUser.uid);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code !== "auth/user-not-found") {
      console.error("Could not clear an old orphaned sign-in account.", {
        email,
        error: error.message,
      });
      throw new HttpError(502, "Could not check whether this email is available.");
    }
  }

  const requestId = randomBytes(18).toString("base64url");
  const statusToken = randomBytes(32).toString("base64url");
  const requestRef = accountRequests.doc(requestId);
  const lockRef = db.collection("accountRequestEmailLocks").doc(requestLockId(email));
  const now = Date.now();
  const requestData = {
    id: requestId,
    name,
    email,
    role,
    idNumber,
    college,
    gender,
    status: "pending",
    statusTokenHash: createHash("sha256").update(statusToken).digest("hex"),
    submittedAt: now,
    updatedAt: now,
    ...(role === "student" ? { yearLevel, block } : {}),
  };

  try {
    await db.runTransaction(async (transaction) => {
      const currentLock = await transaction.get(lockRef);
      if (currentLock.exists) {
        throw new HttpError(
          409,
          "There is already a request waiting for this email.",
          "request-already-pending",
        );
      }
      transaction.create(requestRef, requestData);
      transaction.create(lockRef, { requestId, email, createdAt: now });
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Could not save an account request.", { email, error: error.message });
    throw new HttpError(500, "Could not submit the account request.");
  }
  return { success: true, requestId, statusToken };
}

async function getAccountRequestStatus(data) {
  const requestId = data && data.requestId;
  const token = data && data.statusToken;
  if (
    typeof requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(requestId) ||
    typeof token !== "string" ||
    token.length < 32
  ) {
    throw new HttpError(400, "The account request status credentials are invalid.");
  }
  const requestRef = db.collection("accountRequests").doc(requestId);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) {
    throw new HttpError(404, "This request was removed or is no longer available.", "request-removed");
  }
  const request = snapshot.data();
  const tokenHash = request.statusTokenHash;
  const providedHash = createHash("sha256").update(token).digest("hex");
  if (
    typeof tokenHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(tokenHash) ||
    !timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(providedHash, "hex"))
  ) {
    throw new HttpError(403, "The account request status credentials are invalid.");
  }

  const approvalComplete =
    request.status === "approved" &&
    request.credentialEmailStatus === "sent";
  let temporaryPassword;
  if (approvalComplete) {
    const credential = await requestRef
      .collection("privateCredentials")
      .doc("temporary")
      .get();
    if (credential.exists) {
      temporaryPassword = credential.data().temporaryPassword;
    }
  }
  return {
    status: request.status === "approved" && !approvalComplete
      ? "pending"
      : request.status,
    name: request.name,
    email: request.email,
    credentialEmailStatus: request.credentialEmailStatus,
    ...(typeof temporaryPassword === "string" ? { temporaryPassword } : {}),
  };
}

async function sendTemporaryPassword(accountRequest, requestId, user, temporaryPassword) {
  const email = String(accountRequest.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new HttpError(409, "The account request has an invalid email.");
  }
  const senderConfig = getEmailSenderConfig();
  await auth.updateUser(user.uid, { password: temporaryPassword });
  const requestRef = db.collection("accountRequests").doc(requestId);
  await requestRef.collection("privateCredentials").doc("temporary").set({
    temporaryPassword,
    createdAt: Date.now(),
  });
  await sendEmailWithGmailScript({
    scriptUrl: senderConfig.scriptUrl,
    senderToken: senderConfig.senderToken,
    senderEmail: senderConfig.email,
    to: email,
    subject: "Your Lendy account is approved",
    text: [
      `Hello ${String(accountRequest.name || "there").trim()},`,
      "",
      "Your Lendy account request has been approved.",
      `Temporary password: ${temporaryPassword}`,
      "",
      "Sign in to the Lendy app with this password, then choose a new password.",
      "If you did not request this account, contact your administrator.",
    ].join("\n"),
  });
}

async function approveRequest(data) {
  const requestId = data && data.requestId;
  if (
    typeof requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(requestId)
  ) {
    throw new HttpError(400, "A valid account request ID is required.");
  }
  getEmailSenderConfig();

  const requestRef = db.collection("accountRequests").doc(requestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new HttpError(404, "The account request could not be found.");
  }

  const accountRequest = requestSnapshot.data();
  if (accountRequest.status !== "pending") {
    throw new HttpError(409, "This account request is no longer pending.");
  }
  const email = normalizedEmail(accountRequest.email);
  if (!isValidEmail(email)) {
    throw new HttpError(409, "The account request has an invalid email.");
  }

  const accountRef = db.collection("accounts");
  const temporaryPassword = randomBytes(18).toString("base64url");
  let user;
  let createdAuthUser = false;
  if (typeof accountRequest.authUid === "string" && accountRequest.authUid) {
    try {
      user = await auth.getUser(accountRequest.authUid);
      if (user.email?.toLowerCase() !== email) {
        throw new HttpError(409, "The request email does not match its sign-in account.");
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "auth/user-not-found") {
        throw new HttpError(502, "Could not verify the request sign-in account.");
      }
    }
  }
  if (!user) {
    try {
      const existingUser = await auth.getUserByEmail(email);
      const [existingAccount, adminRecord] = await Promise.all([
        accountRef.doc(existingUser.uid).get(),
        db.collection("admins").doc(existingUser.uid).get(),
      ]);
      if (
        existingAccount.exists ||
        (adminRecord.exists && adminRecord.data().role === "admin")
      ) {
        throw new HttpError(409, "This email already belongs to an account.");
      }
      throw new HttpError(
        409,
        "This email already has a sign-in account. Contact an administrator for help.",
        "email-already-in-use",
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "auth/user-not-found") {
        throw new HttpError(502, "Could not check the request email.");
      }
    }
    try {
      user = await auth.createUser({
        email,
        password: temporaryPassword,
        displayName: String(accountRequest.name || "").trim(),
      });
      createdAuthUser = true;
    } catch (error) {
      if (error.code === "auth/email-already-exists") {
        throw new HttpError(409, "This email already belongs to an account.");
      }
      console.error("Could not create the approved user's sign-in account.", {
        requestId,
        error: error.message,
      });
      throw new HttpError(502, "Could not create the approved user's sign-in account.");
    }
  }

  const userAccountRef = accountRef.doc(user.uid);
  let accountCreated = false;
  const now = Date.now();
  try {
    await db.runTransaction(async (transaction) => {
      const latestRequest = await transaction.get(requestRef);
      const current = latestRequest.data();
      if (
        !latestRequest.exists ||
        current.status !== "pending"
      ) {
        throw new HttpError(
          409,
          "The account request changed before it could be approved.",
        );
      }

      const account = await transaction.get(userAccountRef);
      if (account.exists) {
        throw new HttpError(
          409,
          account.data().status === "revoked"
            ? "This user account is revoked and cannot be approved from this request."
            : "This email already belongs to an account.",
        );
      }
      const lockRef = db
        .collection("accountRequestEmailLocks")
        .doc(requestLockId(email));
      const lock = await transaction.get(lockRef);
      if (lock.exists && lock.data().requestId !== requestId) {
        throw new HttpError(409, "Another request is already using this email.");
      }
      transaction.set(
        userAccountRef,
        {
          id: user.uid,
          name: String(accountRequest.name || "").trim(),
          email,
          role: accountRequest.role === "faculty" ? "faculty" : "student",
          idNumber: String(accountRequest.idNumber || "").trim(),
          college: String(accountRequest.college || accountRequest.course || "").trim(),
          course: String(accountRequest.course || accountRequest.college || "").trim(),
          ...(typeof accountRequest.gender === "string"
            ? { gender: accountRequest.gender }
            : {}),
          ...(accountRequest.role === "student"
            ? {
                ...(typeof accountRequest.yearLevel === "string"
                  ? { yearLevel: accountRequest.yearLevel }
                  : {}),
                ...(typeof accountRequest.block === "string"
                  ? { block: accountRequest.block }
                  : {}),
              }
            : {}),
          status: "active",
          mustChangePassword: true,
          createdAt: now,
        },
      );
      transaction.update(requestRef, {
        status: "approved",
        accountId: user.uid,
        authUid: user.uid,
        credentialEmailStatus: "sending",
        updatedAt: now,
      });
    });
    accountCreated = true;
  } catch (error) {
    if (createdAuthUser) {
      await auth.deleteUser(user.uid).catch((cleanupError) => {
        console.error("Could not remove a sign-in account after failed approval.", {
          requestId,
          authUid: user.uid,
          error: cleanupError.message,
        });
      });
    }
    if (error instanceof HttpError) throw error;
    console.error("Could not save the approved account.", {
      requestId,
      authUid: user.uid,
      error: error.message,
    });
    throw new HttpError(500, "Could not finish approving the account.");
  }

  try {
    await sendTemporaryPassword(accountRequest, requestId, user, temporaryPassword);
  } catch (error) {
    console.error("Could not email the approved account's temporary password.", {
      requestId,
      authUid: user.uid,
      error: error.message,
    });
    await deleteRequestCredentials(requestRef).catch((cleanupError) => {
      console.error("Could not remove temporary credentials after failed delivery.", {
        requestId,
        error: cleanupError.message,
      });
    });
    try {
      if (accountCreated) await userAccountRef.delete();
      if (createdAuthUser) await auth.deleteUser(user.uid);
      await requestRef.update({
        status: "pending",
        accountId: FieldValue.delete(),
        ...(createdAuthUser
          ? { authUid: FieldValue.delete() }
          : { authUid: user.uid }),
        credentialEmailStatus: FieldValue.delete(),
        credentialsEmailedAt: FieldValue.delete(),
        updatedAt: Date.now(),
      });
    } catch (cleanupError) {
      console.error("Could not roll back an approval with failed email delivery.", {
        requestId,
        authUid: user.uid,
        error: cleanupError.message,
      });
    }
    throw new HttpError(
      502,
      "The request was not approved because the temporary password email could not be sent. Check the email settings and try again.",
    );
  }

  try {
    await requestRef.update({
      credentialEmailStatus: "sent",
      credentialsEmailedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Temporary password was emailed, but approval status could not be finalized.", {
      requestId,
      error: error.message,
    });
    throw new HttpError(
      500,
      "The temporary password was emailed, but the approval status could not be finalized. Refresh the request list.",
    );
  }
  try {
    await releaseRequestEmailLock(email, requestId);
  } catch (error) {
    console.error("Could not clear the email lock after successful approval.", {
      requestId,
      error: error.message,
    });
    throw new HttpError(
      500,
      "The account was approved and its temporary password was emailed, but the request email lock could not be cleared.",
    );
  }
  return { success: true, emailSent: true };
}

async function rejectAccountRequest(data) {
  const requestId = data && data.requestId;
  if (
    typeof requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(requestId)
  ) {
    throw new HttpError(400, "A valid account request ID is required.");
  }

  const requestRef = db.collection("accountRequests").doc(requestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new HttpError(404, "The account request could not be found.");
  }
  const request = requestSnapshot.data();
  if (!["pending", "rejected"].includes(request.status)) {
    throw new HttpError(409, "Only pending or previously rejected requests can be rejected.");
  }

  let authAccountDeleted = true;
  let rejectedUser;
  if (typeof request.authUid === "string" && request.authUid) {
    try {
      rejectedUser = await auth.getUser(request.authUid);
      if (rejectedUser.email?.toLowerCase() !== normalizedEmail(request.email)) {
        throw new HttpError(409, "The rejected request is linked to a different email account.");
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error.code !== "auth/user-not-found") {
        throw new HttpError(502, "Could not verify the rejected request's sign-in account.");
      }
    }
  } else if (request.status === "rejected" && isValidEmail(request.email)) {
    try {
      rejectedUser = await auth.getUserByEmail(normalizedEmail(request.email));
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw new HttpError(502, "Could not verify the rejected request's sign-in account.");
      }
    }
  }

  if (rejectedUser) {
    const [existingAccount, adminRecord] = await Promise.all([
      db.collection("accounts").doc(rejectedUser.uid).get(),
      db.collection("admins").doc(rejectedUser.uid).get(),
    ]);
    if (existingAccount.exists || adminRecord.exists) {
      authAccountDeleted = false;
    } else {
      try {
        await auth.deleteUser(rejectedUser.uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") {
          console.error("Could not remove the rejected request's sign-in account.", {
            requestId,
            authUid: rejectedUser.uid,
            error: error.message,
          });
          throw new HttpError(
            502,
            "The sign-in account could not be removed, so the request was kept for cleanup. Retry the rejection.",
          );
        }
      }
    }
  }

  await deleteRequestCredentials(requestRef);
  await requestRef.delete();
  await releaseRequestEmailLock(normalizedEmail(request.email), requestId);
  return { success: true, requestDeleted: true, authAccountDeleted };
}

async function deleteAccount(data, adminUid) {
  const accountId = data && data.accountId;
  if (
    typeof accountId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)
  ) {
    throw new HttpError(400, "A valid account ID is required.");
  }
  if (accountId === adminUid) {
    throw new HttpError(403, "You cannot delete your own admin account.");
  }

  const accountRef = db.collection("accounts").doc(accountId);
  const accountSnapshot = await accountRef.get();
  if (!accountSnapshot.exists) {
    throw new HttpError(404, "The account could not be found.");
  }
  const account = accountSnapshot.data();
  if (!["student", "faculty"].includes(account.role)) {
    throw new HttpError(403, "Only student or faculty accounts can be deleted.");
  }

  let authAccountExists = true;
  try {
    await auth.getUser(accountId);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      authAccountExists = false;
    } else {
      throw new HttpError(
        502,
        "Could not verify the user's Firebase Authentication account.",
      );
    }
  }

  const accountRequests = db.collection("accountRequests");
  const accountEmail = normalizedEmail(account.email);
  const linkedQueries = await Promise.all([
    db.collection("loans").where("borrowerUid", "==", accountId).get(),
    accountRequests.where("authUid", "==", accountId).get(),
    accountRequests.where("accountId", "==", accountId).get(),
    isValidEmail(accountEmail)
      ? accountRequests.where("email", "==", accountEmail).get()
      : Promise.resolve({ docs: [] }),
  ]);

  let unlinkedLegacyLoans = [];
  let ambiguousLegacyLoans = 0;
  const name = typeof account.name === "string" ? account.name.trim() : "";
  if (name) {
    const [sameNameAccounts, namedLoans] = await Promise.all([
      db.collection("accounts").where("name", "==", name).get(),
      db.collection("loans").where("borrower", "==", name).get(),
    ]);
    const legacyLoans = namedLoans.docs.filter(
      (document) => !document.data().borrowerUid,
    );
    if (
      sameNameAccounts.size === 1 &&
      sameNameAccounts.docs[0].id === accountId
    ) {
      unlinkedLegacyLoans = legacyLoans;
    } else {
      ambiguousLegacyLoans = legacyLoans.length;
    }
  }

  const loanReferences = new Map();
  for (const document of [
    ...linkedQueries[0].docs,
    ...unlinkedLegacyLoans,
  ]) {
    loanReferences.set(document.ref.path, document.ref);
  }
  const requestReferences = new Map();
  const requestEmails = new Map();
  for (const document of [
    ...linkedQueries[1].docs,
    ...linkedQueries[2].docs,
    ...linkedQueries[3].docs,
  ]) {
    requestReferences.set(document.ref.path, document.ref);
    requestEmails.set(document.id, normalizedEmail(document.data().email));
  }

  async function deleteDocuments(references) {
    const documents = [...references.values()];
    for (let offset = 0; offset < documents.length; offset += 400) {
      const batch = db.batch();
      for (const reference of documents.slice(offset, offset + 400)) {
        batch.delete(reference);
      }
      await batch.commit();
    }
    return documents.length;
  }

  try {
    await accountRef.update({ status: "revoked" });
  } catch (error) {
    console.error("Could not disable the account before deletion.", {
      accountId,
      error: error.message,
    });
    throw new HttpError(500, "Could not disable the account before deletion.");
  }

  if (authAccountExists) {
    try {
      await auth.deleteUser(accountId);
    } catch (error) {
      console.error("Could not delete the user's Firebase Authentication account.", {
        accountId,
        error: error.message,
      });
      throw new HttpError(
        502,
        "Could not delete the Firebase Authentication account. The Firestore account was disabled; retry the delete action.",
      );
    }
  }

  let deletedNotifications;
  let deletedDevices;
  let deletedLoans;
  let deletedRequests;
  try {
    for (const requestRef of requestReferences.values()) {
      await deleteRequestCredentials(requestRef);
    }
    deletedNotifications = await deleteSubcollectionDocuments(
      accountRef,
      "notifications",
    );
    deletedDevices = await deleteSubcollectionDocuments(accountRef, "devices");
    deletedLoans = await deleteDocuments(loanReferences);
    deletedRequests = await deleteDocuments(requestReferences);
    for (const [requestId, requestEmail] of requestEmails) {
      if (isValidEmail(requestEmail)) {
        await releaseRequestEmailLock(requestEmail, requestId);
      }
    }
  } catch (error) {
    console.error("Could not completely remove the account's Firestore data.", {
      accountId,
      error: error.message,
    });
    throw new HttpError(
      500,
      "The sign-in account was deleted, but some Firestore records could not be removed. Retry the delete action.",
    );
  }

  try {
    await accountRef.delete();
  } catch (error) {
    console.error("Could not delete the user account profile.", {
      accountId,
      error: error.message,
    });
    throw new HttpError(
      500,
      "The sign-in account and linked records were deleted, but the account profile could not be removed. Retry the delete action.",
    );
  }

  return {
    success: true,
    deletedLoans,
    deletedRequests,
    deletedNotifications,
    deletedDevices,
    authAccountDeleted: authAccountExists,
    ambiguousLegacyLoans,
  };
}

const assistantOperations = new Set([
  "summary",
  "available_equipment",
  "overdue_loans",
  "pending_loans",
  "active_borrowers",
  "account_list",
  "account_created",
  "account_loans",
  "busiest_day",
]);
const assistantRequests = new Map();
const borrowerAssistantRequests = new Map();

const borrowerAssistantIntents = new Set([
  "how_to_borrow",
  "suggest_item",
  "available_items",
  "inventory_list",
  "item_status",
  "my_loan_deadlines",
  "unknown",
]);

function sanitizeBorrowerQuestion(question) {
  return question
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[EMAIL]",
    )
    .replace(/\+?\d(?:[\s().-]*\d){9,}/g, "[PHONE]")
    .replace(/\b[A-F0-9]{28,}\b/gi, "[ID]");
}

async function classifyBorrowerQuestion(question, equipment) {
  const fallback = fallbackBorrowerIntent(question, equipment);
  if (!isBorrowerDomainQuestion(question, equipment)) return fallback;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  const categories = [...new Set(
    equipment
      .map((item) => item.category)
      .filter((category) => typeof category === "string" && category.trim()),
  )];
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  let response;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          store: false,
          input: [
            "Classify the signed-in borrower's question and return only JSON.",
            `Allowed intents: ${[...borrowerAssistantIntents].join(", ")}.`,
            `Inventory categories from the backend: ${categories.join(", ") || "none"}.`,
            "Read and analyze the entire question before choosing an intent; do not classify based only on the first word.",
            "A generic question such as 'What is my name?' or 'Who are you?' is not an inventory question. Choose unknown; never return inventory results for personal or unrelated questions.",
            "Only use inventory intents when the question is actually about equipment, items, tools/devices, stock, availability, a known category/item, or a request/recommendation for something to borrow.",
            "Choose my_loan_deadlines only for the signed-in user's own active loan deadlines.",
            "Choose suggest_item whenever the user needs, wants, or is looking for equipment, including a use case. Infer a category only if it matches one of the backend categories above (for example, recording video can match a Camera category).",
            "Choose available_items for availability, inventory_list when the user asks what equipment exists, and item_status when they ask about one item's status or condition.",
            "Choose how_to_borrow for borrowing instructions. Choose unknown for general/off-topic questions; do not generate general answers.",
            "Set category only to an exact value from the backend categories above; otherwise use an empty string. Set itemQuery to a short exact item name, tag, or ID mentioned by the user, or an empty string.",
            "Question:",
            sanitizeBorrowerQuestion(question),
          ].join("\n"),
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: [...borrowerAssistantIntents],
                },
                category: { type: "string" },
                itemQuery: { type: "string", maxLength: 100 },
              },
              required: ["intent", "category", "itemQuery"],
            },
          },
        }),
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      console.warn("Gemini borrower classification timed out; using inventory-backed fallback.", {
        model,
      });
      return fallback;
    }
    console.warn("Gemini borrower classification failed; using inventory-backed fallback.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }

  if (!response.ok) {
    console.warn("Gemini rejected borrower classification; using inventory-backed fallback.", {
      status: response.status,
      model,
    });
    return fallback;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    console.warn("Gemini returned invalid borrower classification JSON; using fallback.", {
      model,
    });
    return fallback;
  }
  const text = payload.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    console.warn("Gemini returned unparseable borrower classification; using fallback.", {
      model,
    });
    return fallback;
  }
  if (
    !result ||
    !borrowerAssistantIntents.has(result.intent) ||
    typeof result.category !== "string" ||
    result.category.length > 50 ||
    typeof result.itemQuery !== "string" ||
    result.itemQuery.length > 100
  ) {
    console.warn("Gemini returned an invalid borrower intent; using inventory-backed fallback.", {
      model,
    });
    return fallback;
  }
  if (result.intent === "unknown" && fallback.intent !== "unknown") {
    return fallback;
  }
  const category = findInventoryCategory(result.category, equipment);
  if (result.category && !category) {
    console.warn("Gemini returned an unknown inventory category; using fallback.", {
      model,
    });
    return fallback;
  }
  return {
    ...result,
    category: category || fallback.category || "",
    itemQuery: result.itemQuery || fallback.itemQuery || "",
  };
}

async function answerBorrowerAssistant(data, borrowerUid) {
  const question = data && data.question;
  if (
    typeof question !== "string" ||
    question.trim().length === 0 ||
    question.length > 200
  ) {
    throw new HttpError(400, "Enter a question of no more than 200 characters.");
  }
  const now = Date.now();
  const recent = (borrowerAssistantRequests.get(borrowerUid) || [])
    .filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 10) {
    throw new HttpError(429, "Too many questions. Wait a minute and try again.");
  }
  borrowerAssistantRequests.set(borrowerUid, [...recent, now]);

  const equipmentSnapshot = await db.collection("equipment").get();
  const equipment = equipmentSnapshot.docs.map((document) => ({
    ...document.data(),
    id: document.id,
  }));
  const classification = await classifyBorrowerQuestion(
    question.trim(),
    equipment,
  );
  if (classification.intent === "my_loan_deadlines") {
    const snapshot = await db.collection("loans")
      .where("borrowerUid", "==", borrowerUid)
      .get();
    return {
      ...buildBorrowerAssistantResponse({
        intent: classification.intent,
        personalLoans: snapshot.docs.map((document) => document.data()),
      }),
    };
  }
  if (
    classification.intent === "available_items" ||
    classification.intent === "suggest_item" ||
    classification.intent === "inventory_list" ||
    classification.intent === "item_status"
  ) {
    const [approvedLoans, returnPendingLoans] = await Promise.all([
      db.collection("loans").where("status", "==", "approved").get(),
      db.collection("loans").where("status", "==", "return_pending").get(),
    ]);
    return {
      ...buildBorrowerAssistantResponse({
        intent: classification.intent,
        category: classification.category,
        itemQuery: classification.itemQuery,
        equipment,
        activeLoans: [
          ...approvedLoans.docs.map((document) => document.data()),
          ...returnPendingLoans.docs.map((document) => document.data()),
        ],
      }),
    };
  }
  return buildBorrowerAssistantResponse(classification);
}

function findEquipmentInQuestion(question, equipment) {
  return equipment.filter((item) => {
    const name = String(item.name || "").trim();
    return name && new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(name)}(?=$|[^a-z0-9])`,
      "i",
    ).test(question);
  }).filter((item, _, matches) => {
    const name = String(item.name || "").trim().toLowerCase();
    return !matches.some((other) => {
      const otherName = String(other.name || "").trim().toLowerCase();
      return otherName.length > name.length &&
        otherName.includes(name) &&
        new RegExp(
          `(^|[^a-z0-9])${escapeRegExp(otherName)}(?=$|[^a-z0-9])`,
          "i",
        ).test(question);
    });
  });
}

function equipmentBorrowerAnswer(matchingEquipment, loans, accounts, includeHistory) {
  if (matchingEquipment.length === 0) return null;
  const equipmentById = new Map(matchingEquipment.map((item) => [item.id, item]));
  const matchingLoans = loans.filter((loan) =>
    (loan.status === "approved" || loan.status === "returned") &&
    equipmentById.has(loan.equipmentId)
  );
  if (matchingLoans.length === 0) {
    const names = matchingEquipment.map((item) => item.name);
    return `No one is currently borrowing ${names.length === 1 ? names[0] : names.join(", ")}.`;
  }

  const currentLoans = matchingLoans.filter((loan) => loan.status === "approved");
  const loansToDescribe = includeHistory || currentLoans.length === 0
    ? matchingLoans
    : currentLoans;
  const descriptions = loansToDescribe.map((loan) => {
    const item = equipmentById.get(loan.equipmentId);
    const account = loan.borrowerUid
      ? accounts.find((entry) => entry.id === loan.borrowerUid)
      : null;
    const borrower = account?.name || loan.borrower || "Unknown borrower";
    if (loan.status === "returned") {
      return `${borrower} previously borrowed ${item.name}${loan.returnedOn ? ` (returned ${loan.returnedOn})` : ""}.`;
    }
    return `${borrower} is currently borrowing ${item.name}${loan.end ? ` (due ${loan.end})` : ""}.`;
  });
  if (currentLoans.length === 0 && !includeHistory) {
    return `No one is currently borrowing ${matchingEquipment.map((item) => item.name).join(", ")}. ${descriptions.join(" ")}`;
  }
  return descriptions.join(" ");
}

function vagueEquipmentQuestion(question) {
  return !/\b(?:who|what|when|where|why|how|is|are|can|does|did|do|available|borrow(?:ed|ing)?|borrower|due|overdue|status|location|category|maintenance|return(?:ed)?|loan|loans|inventory|count|many|list|show|tell|give)\b/i.test(question);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSensitiveValue(text, value, replacement) {
  const escaped = escapeRegExp(value.trim());
  if (!escaped) return text;
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "gi");
  return text.replace(pattern, (_, prefix) => `${prefix}${replacement}`);
}

function sanitizeQuestion(question, accounts) {
  let sanitized = question;
  const accountTokens = new Map();
  const orderedAccounts = accounts.slice().sort(
    (a, b) => String(b.name || "").length - String(a.name || "").length,
  );
  orderedAccounts.forEach((account, index) => {
    const token = `ACCOUNT_${index + 1}`;
    const values = [account.name, account.email, account.idNumber]
      .filter((value) => typeof value === "string" && value.trim());
    for (const value of values) {
      sanitized = replaceSensitiveValue(sanitized, value, `[${token}]`);
    }
    String(account.name || "").split(/\s+/).filter((part) => part.length >= 3)
      .forEach((part) => {
        const matchingAccounts = orderedAccounts.filter((entry) =>
          String(entry.name || "").split(/\s+/).some(
            (entryPart) => entryPart.toLowerCase() === part.toLowerCase(),
          )
        );
        const replacement = matchingAccounts.length === 1
          ? `[${token}]`
          : "[PERSON]";
        sanitized = replaceSensitiveValue(sanitized, part, replacement);
        if (replacement === `[${token}]` && sanitized.includes(replacement)) {
          accountTokens.set(token, account);
        }
      });
    if (sanitized.includes(`[${token}]`)) {
      accountTokens.set(token, account);
    }
  });
  sanitized = sanitized
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED]")
    .replace(/\b\+?\d[\d\s().-]{6,}\d\b/g, "[REDACTED]");
  const questionWords = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "did", "do",
    "does", "for", "from", "give", "has", "have", "how", "i", "in", "is",
    "it", "list", "me", "many", "my", "of", "on", "or", "please", "show",
    "tell", "the", "this", "to", "was", "what", "when", "where", "which",
    "who", "with", "available", "borrowed", "borrowing", "camera", "cameras",
    "computer", "computers", "device", "devices", "equipment", "item", "items",
    "laptop", "laptops", "loan", "loans", "overdue", "pending", "projector",
    "projectors", "request", "requests", "student", "students", "tablet",
    "tablets", "account", "accounts", "faculty", "staff", "people", "users",
    "returned", "sunday", "sundays", "monday", "mondays", "tuesday", "tuesdays",
    "wednesday", "wednesdays", "thursday", "thursdays", "friday", "fridays",
    "saturday", "saturdays", "january", "february", "march", "april", "may",
    "june", "july", "august", "september", "october", "november", "december",
  ]);
  sanitized = sanitized.replace(/\b[A-Z][a-z]{2,}\b/g, (word) =>
    questionWords.has(word.toLowerCase()) ? word : "[PERSON]"
  );
  return { question: sanitized.toLowerCase(), accountTokens };
}

async function classifyAssistantQuestion(question, accountTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "The AI assistant is not configured yet.");
  }

  const operations = [...assistantOperations];
  const tokens = [...accountTokens.keys()];
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const timeoutMs = 45_000;
  let response;
  try {
    response = await fetch(
      "https://generativelanguage.googleapis.com/v1/interactions",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        store: false,
        input: [
          "Convert the admin's question into up to three database query operations.",
          "Return only JSON matching the schema. Do not answer the question.",
          `Allowed operation types: ${operations.join(", ")}.`,
          "Use accountToken only when the question contains a supplied [ACCOUNT_n] token.",
          `Available account tokens: ${tokens.length ? tokens.join(", ") : "none"}.`,
          "Use category only when an equipment type/category is explicitly requested.",
          "For unrelated, unsupported, or unclear requests return an empty operations array.",
          "Question:",
          question,
        ].join("\n"),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              operations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: operations },
                    accountToken: { type: "string" },
                    category: { type: "string" },
                  },
                  required: ["type"],
                },
              },
            },
            required: ["operations"],
          },
        },
      }),
      },
    );
  } catch (error) {
    if (error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")) {
      console.warn("Gemini Interactions request timed out.", { model, timeoutMs });
      throw new HttpError(504, "The AI assistant request timed out. Please try again.");
    }
    throw error;
  }
  if (!response.ok) {
    const providerBody = await response.text();
    let providerError = null;
    try {
      providerError = JSON.parse(providerBody).error || null;
    } catch {
      providerError = null;
    }
    console.error("Gemini rejected the assistant request.", {
      status: response.status,
      model,
      providerStatus: providerError?.status || null,
      providerCode: providerError?.code || null,
      providerMessage: typeof providerError?.message === "string"
        ? providerError.message.replaceAll(apiKey, "[REDACTED]").slice(0, 400)
        : null,
    });
    if (response.status === 429) {
      throw new HttpError(429, "The AI assistant has reached its current usage limit. Try again later.");
    }
    if (response.status === 400 || response.status === 404) {
      throw new HttpError(502, "The AI assistant could not process that question.");
    }
    throw new HttpError(502, "The AI provider is temporarily unavailable.");
  }

  const payload = await response.json();
  const text = payload.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
  if (typeof text !== "string") {
    throw new HttpError(502, "The AI assistant returned an invalid response.");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new HttpError(502, "The AI assistant returned an invalid response.");
  }
  if (!parsed || !Array.isArray(parsed.operations) || parsed.operations.length > 3) {
    throw new HttpError(502, "The AI assistant returned an invalid query.");
  }

  return parsed.operations.filter((operation) =>
    operation &&
    assistantOperations.has(operation.type) &&
    (!operation.accountToken ||
      (typeof operation.accountToken === "string" &&
        accountTokens.has(operation.accountToken))) &&
    (!operation.category ||
      (typeof operation.category === "string" &&
        operation.category.length <= 50))
  );
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function accountCreatedDate(account) {
  const value = account.createdAt;
  const date = value && typeof value.toDate === "function"
    ? value.toDate()
    : value == null ? null : new Date(value);
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : null;
}

function runAssistantOperation(operation, data, accountTokens) {
  const today = manilaDate();
  const accounts = data.accounts;
  const equipment = data.equipment;
  const loans = data.loans;
  const approved = loans.filter((loan) => loan.status === "approved");
  const overdue = approved.filter(
    (loan) => typeof loan.end === "string" && loan.end < today,
  );
  const pending = loans.filter((loan) => loan.status === "pending");
  const token = operation.accountToken;
  const account = token ? accountTokens.get(token) : null;
  const category = String(operation.category || "").trim().toLowerCase();
  const equipmentMatches = (item) => !category ||
    `${item.category || ""} ${item.name || ""}`.toLowerCase().includes(category);
  const accountLoans = (target) => loans.filter((loan) =>
    target && (
      loan.borrowerUid === target.id ||
      (!loan.borrowerUid &&
        String(loan.borrower || "").trim().toLowerCase() ===
          String(target.name || "").trim().toLowerCase())
    )
  );
  const describeLoans = (records) => records.length
    ? records.slice(0, 20).map((loan) =>
      `${loan.name || "Unnamed item"} — ${loan.borrower || "Unknown borrower"} (${loan.status || "unknown"}${loan.end ? `, due ${loan.end}` : ""})`
    ).join("; ")
    : "none";

  switch (operation.type) {
    case "summary": {
      const borrowedIds = new Set(approved.map((loan) => loan.equipmentId));
      const available = equipment.filter((item) =>
        !item.maintenance && !borrowedIds.has(item.id)
      ).length;
      return `Inventory: ${equipment.length} total, ${available} available, ${borrowedIds.size} borrowed, ${equipment.filter((item) => item.maintenance).length} in maintenance. Loans: ${pending.length} pending, ${overdue.length} overdue.`;
    }
    case "available_equipment": {
      const borrowedIds = new Set(approved.map((loan) => loan.equipmentId));
      const matches = equipment.filter((item) =>
        equipmentMatches(item) &&
        !item.maintenance &&
        !borrowedIds.has(item.id)
      );
      return `${matches.length} available${category ? ` matching "${operation.category}"` : ""}: ${matches.slice(0, 30).map((item) => item.name || "Unnamed item").join(", ") || "none"}.`;
    }
    case "overdue_loans":
      return `${overdue.length} overdue loan(s): ${describeLoans(overdue)}.`;
    case "pending_loans":
      return `${pending.length} pending request(s): ${describeLoans(pending)}.`;
    case "active_borrowers": {
      const people = new Map();
      for (const loan of approved) {
        const borrowerAccount = loan.borrowerUid
          ? accounts.find((entry) => entry.id === loan.borrowerUid)
          : null;
        const name = borrowerAccount?.name || loan.borrower;
        if (name) people.set(loan.borrowerUid || name.trim().toLowerCase(), name);
      }
      return `${people.size} people currently borrowing: ${[...people.values()].join(", ") || "none"}.`;
    }
    case "account_list":
      return accounts.length
        ? `Accounts (${accounts.length}): ${accounts.slice(0, 50).map((entry) =>
          `${entry.name || "Unnamed"}${entry.role ? ` (${entry.role})` : ""}${accountCreatedDate(entry) ? `, created ${accountCreatedDate(entry)}` : ""}`
        ).join("; ")}.`
        : "There are no user accounts.";
    case "account_created":
      if (!account) return "Please include the account name so I can look up its creation date.";
      return accountCreatedDate(account)
        ? `${account.name || "That account"} was created on ${accountCreatedDate(account)}.`
        : `No creation date is saved for ${account.name || "that account"}.`;
    case "account_loans":
      if (!account) return "Please include the account name so I can look up its loans.";
      return `${account.name || "That account"}'s loans: ${describeLoans(accountLoans(account))}.`;
    case "busiest_day": {
      const counts = Array(7).fill(0);
      for (const loan of loans.filter((entry) =>
        entry.status === "approved" || entry.status === "returned"
      )) {
        const date = typeof loan.start === "string"
          ? new Date(`${loan.start}T00:00:00`)
          : null;
        if (date && !Number.isNaN(date.getTime())) counts[date.getDay()] += 1;
      }
      const busiest = Math.max(...counts);
      if (!busiest) return "There are no checkouts on record.";
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return `${days.filter((_, index) => counts[index] === busiest).join(" and ")} is busiest, with ${busiest} checkout(s) on record.`;
    }
    default:
      return "I can’t answer that from the available database information.";
  }
}

async function answerAssistant(data, adminUid) {
  const question = data && data.question;
  if (typeof question !== "string" || question.trim().length === 0 || question.length > 200) {
    throw new HttpError(400, "Enter a question of no more than 200 characters.");
  }
  const now = Date.now();
  const recent = (assistantRequests.get(adminUid) || [])
    .filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 10) {
    throw new HttpError(429, "Too many assistant questions. Wait a minute and try again.");
  }
  assistantRequests.set(adminUid, [...recent, now]);

  const accountSnapshot = await db.collection("accounts").get();
  const accounts = accountSnapshot.docs.map((document) => ({
    ...document.data(),
    id: document.id,
  }));
  const asksWhoBorrowed = /\bwho\b[\s\S]*\b(?:borrow(?:ed|ing)?|has|have|using|checked\s*out)\b/i.test(question);
  if (asksWhoBorrowed || vagueEquipmentQuestion(question)) {
    const equipmentSnapshot = await db.collection("equipment").get();
    const equipment = equipmentSnapshot.docs.map((document) => ({
      ...document.data(),
      id: document.id,
    }));
    const matchingEquipment = findEquipmentInQuestion(question, equipment);
    if (matchingEquipment.length > 0) {
      if (!asksWhoBorrowed && vagueEquipmentQuestion(question)) {
        const names = matchingEquipment.map((item) => item.name).join(", ");
        return {
          answer: `What would you like to know about ${names}? You can ask who borrowed it, whether it is available, or when it is due. For example: "Who borrowed the ${matchingEquipment[0].name}?"`,
        };
      }
      const loanSnapshot = await db.collection("loans").get();
      const loans = loanSnapshot.docs.map((document) => ({
        ...document.data(),
        id: document.id,
      }));
      const answer = equipmentBorrowerAnswer(
        matchingEquipment,
        loans,
        accounts,
        /\b(history|histor(?:y|ies|ical)|previous(?:ly)?|before|ever|past|returned)\b/i.test(question),
      );
      if (answer !== null) return { answer };
    }
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new HttpError(503, "The AI assistant is not configured yet.");
  }
  const { question: sanitizedQuestion, accountTokens } =
    sanitizeQuestion(question, accounts);
  const operations = await classifyAssistantQuestion(
    sanitizedQuestion,
    accountTokens,
  );
  if (operations.length === 0) {
    return { answer: "I couldn’t identify a supported database question. Try asking about equipment, loans, account names or dates, or a dashboard summary." };
  }
  const needsEquipment = operations.some((operation) =>
    ["summary", "available_equipment"].includes(operation.type)
  );
  const needsLoans = operations.some((operation) =>
    [
      "summary",
      "available_equipment",
      "overdue_loans",
      "pending_loans",
      "active_borrowers",
      "account_loans",
      "busiest_day",
    ].includes(operation.type)
  );
  const [equipmentSnapshot, loanSnapshot] = await Promise.all([
    needsEquipment ? db.collection("equipment").get() : null,
    needsLoans ? db.collection("loans").get() : null,
  ]);
  const dataSets = {
    accounts,
    equipment: (equipmentSnapshot?.docs || []).map((document) => ({
      ...document.data(),
      id: document.id,
    })),
    loans: (loanSnapshot?.docs || []).map((document) => ({
      ...document.data(),
      id: document.id,
    })),
  };
  return {
    answer: operations.map((operation) =>
      runAssistantOperation(operation, dataSets, accountTokens)
    ).join("\n"),
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  try {
    if (await serveAdminFile(request, response)) return;
  } catch (error) {
    console.error("Could not serve an admin dashboard file.", error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Could not load the admin dashboard.");
    return;
  }

  const origin = request.headers.origin;
  if (
    !isAllowedApiRequest({
      origin,
      method: request.method,
      pathname: request.url,
      allowedOrigins,
    })
  ) {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Origin is not allowed." }));
    return;
  }

  if (request.method === "OPTIONS") {
    if (!origin) {
      response.writeHead(400);
      response.end();
      return;
    }
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": origin,
      "Cache-Control": "no-store",
      "Vary": "Origin",
    });
    response.end();
    return;
  }
  if (
    request.method !== "POST" ||
    ![
      "/request-account",
      "/account-request-status",
      "/approve-account",
      "/reject-account",
      "/delete-account",
      "/assistant",
      "/borrower-assistant",
    ].includes(request.url)
  ) {
    sendJson(response, 404, { error: "Endpoint not found." }, origin);
    return;
  }

  try {
    const data = await readJson(request);
    if (request.url === "/request-account") {
      sendJson(response, 201, await createAccountRequest(data), origin);
      return;
    }
    if (request.url === "/account-request-status") {
      sendJson(response, 200, await getAccountRequestStatus(data), origin);
      return;
    }
    if (request.url === "/borrower-assistant") {
      const borrowerUid = await requireBorrower(request);
      sendJson(
        response,
        200,
        await answerBorrowerAssistant(data, borrowerUid),
        origin,
      );
      return;
    }
    const adminUid = await requireAdmin(request);
    const result = request.url === "/approve-account"
      ? await approveRequest(data)
      : request.url === "/reject-account"
        ? await rejectAccountRequest(data)
      : request.url === "/delete-account"
        ? await deleteAccount(data, adminUid)
        : await answerAssistant(data, adminUid);
    sendJson(response, 200, result, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) {
      console.error("Unhandled approval-service request error.", error);
    }
    sendJson(response, status, {
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    }, origin);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Lendy approval service listening on ${port}.`);
});
