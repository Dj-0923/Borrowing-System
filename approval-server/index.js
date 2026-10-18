const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const http = require("node:http");

const port = Number(process.env.PORT || 8080);
const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

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
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  });
  response.end(JSON.stringify(body));
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

async function approveRequest(data) {
  const requestId = data && data.requestId;
  const temporaryPassword = data && data.temporaryPassword;
  if (
    typeof requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,150}$/.test(requestId)
  ) {
    throw new HttpError(400, "A valid account request ID is required.");
  }
  if (
    typeof temporaryPassword !== "string" ||
    temporaryPassword.length < 8 ||
    temporaryPassword.length > 128
  ) {
    throw new HttpError(
      400,
      "The temporary password must be between 8 and 128 characters.",
    );
  }

  const requestRef = db.collection("accountRequests").doc(requestId);
  const requestSnapshot = await requestRef.get();
  if (!requestSnapshot.exists) {
    throw new HttpError(404, "The account request could not be found.");
  }

  const accountRequest = requestSnapshot.data();
  if (accountRequest.status !== "pending") {
    throw new HttpError(409, "This account request is no longer pending.");
  }
  if (
    typeof accountRequest.authUid !== "string" ||
    accountRequest.authUid.length === 0
  ) {
    throw new HttpError(
      409,
      "This request has no linked sign-in account. Ask the user to submit a new request.",
    );
  }

  const email = String(accountRequest.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(409, "The account request has an invalid email.");
  }

  let user;
  try {
    user = await auth.getUser(accountRequest.authUid);
    if (user.email?.toLowerCase() !== email) {
      throw new HttpError(
        409,
        "The request email does not match its Firebase Authentication account.",
      );
    }
    await auth.updateUser(user.uid, { password: temporaryPassword });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Could not set the temporary account password.", {
      requestId,
      authUid: accountRequest.authUid,
      error: error.message,
    });
    throw new HttpError(
      502,
      "Could not set the temporary password in Firebase Authentication.",
    );
  }

  const accountRef = db.collection("accounts").doc(user.uid);
  const now = Date.now();
  try {
    await db.runTransaction(async (transaction) => {
      const latestRequest = await transaction.get(requestRef);
      const current = latestRequest.data();
      if (
        !latestRequest.exists ||
        current.authUid !== user.uid ||
        current.status !== "pending"
      ) {
        throw new HttpError(
          409,
          "The account request changed before it could be approved.",
        );
      }

      const account = await transaction.get(accountRef);
      if (account.exists && account.data().status === "revoked") {
        throw new HttpError(
          409,
          "This user account is revoked and cannot be approved from this request.",
        );
      }
      transaction.set(
        accountRef,
        {
          id: user.uid,
          name: String(accountRequest.name || "").trim(),
          email,
          role: accountRequest.role === "faculty" ? "faculty" : "student",
          idNumber: String(accountRequest.idNumber || "").trim(),
          college: String(accountRequest.college || accountRequest.course || "").trim(),
          course: String(accountRequest.course || accountRequest.college || "").trim(),
          status: "active",
          mustChangePassword: true,
          createdAt: account.exists ? account.data().createdAt || now : now,
        },
        { merge: true },
      );
      transaction.update(requestRef, {
        status: "approved",
        accountId: user.uid,
        temporaryPassword,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Could not save the approved account.", {
      requestId,
      authUid: user.uid,
      error: error.message,
    });
    throw new HttpError(500, "Could not finish approving the account.");
  }

  return { success: true };
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
  const linkedQueries = await Promise.all([
    db.collection("loans").where("borrowerUid", "==", accountId).get(),
    accountRequests.where("authUid", "==", accountId).get(),
    accountRequests.where("accountId", "==", accountId).get(),
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
  for (const document of [
    ...linkedQueries[1].docs,
    ...linkedQueries[2].docs,
  ]) {
    requestReferences.set(document.ref.path, document.ref);
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

  const deletedLoans = await deleteDocuments(loanReferences);
  const deletedRequests = await deleteDocuments(requestReferences);

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
        "The linked records were deleted, but Firebase Authentication could not delete the sign-in account. Retry the delete action.",
      );
    }
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
    deletedRequests: requestReferences.size,
    authAccountDeleted: authAccountExists,
    ambiguousLegacyLoans,
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

  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Origin is not allowed." }));
    return;
  }

  if (request.method === "OPTIONS") {
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
    !["/approve-account", "/delete-account"].includes(request.url)
  ) {
    sendJson(response, 404, { error: "Endpoint not found." }, origin);
    return;
  }

  try {
    const adminUid = await requireAdmin(request);
    const data = await readJson(request);
    const result = request.url === "/approve-account"
      ? await approveRequest(data)
      : await deleteAccount(data, adminUid);
    sendJson(response, 200, result, origin);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) {
      console.error("Unhandled account approval error.", error);
    }
    sendJson(response, status, { error: error.message }, origin);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Lendy approval service listening on ${port}.`);
});
