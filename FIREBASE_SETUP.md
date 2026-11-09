# Account approval with emailed temporary passwords

The account approval flow uses a separately hosted Node.js service and the
Firebase Admin SDK. Submitting a request creates a pending Firestore request,
but does not create a Firebase Authentication user. Only after admin approval
does the service create the sign-in account, generate a temporary password,
and email it to the requester. The approval is rolled back if the email cannot
be sent. Email is sent by a small Google Apps Script web app using Gmail over
HTTPS, so the Render Free service does not need SMTP access. Push notifications
are handled separately by the Firebase Cloud Functions described below.

## Configure Firebase

1. In Firebase Console, enable **Authentication → Sign-in method → Email /
   Password** and create an admin user.
2. From `mobile`, configure the app for project `borrowing-system-lendy`:

   ```powershell
   flutterfire configure --project=borrowing-system-lendy
   ```

   Select the platforms used by the app.
3. Copy the Firebase **Web app** configuration into
   `admin/firebase-config.js`.
4. In Firestore, create `admins/{ADMIN_AUTH_UID}` for the admin user from step
   1, with this document data:

   ```json
   { "role": "admin" }
   ```

   The document ID must be the Firebase Authentication UID.
5. Deploy the Firestore rules from the repository root:

   ```powershell
   firebase login
   firebase deploy --only firestore:rules --project borrowing-system-lendy
   ```

## Deploy the approval service to Render

The repository includes a Render Blueprint in `render.yaml`.

1. Push the project changes to the GitHub branch you want to deploy.
2. In Render, choose **New → Blueprint**, connect this repository, and select
   that branch. Render reads `render.yaml` and creates the
   `lendy-account-approval` service. Choose the free plan if offered; Render's
   plan availability and limits can change.
3. When prompted, provide:

   | Variable | Value |
   | --- | --- |
   | `FIREBASE_PROJECT_ID` | `borrowing-system-lendy` |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | The complete JSON for a Firebase service-account key |
   | `GEMINI_API_KEY` | A Gemini API key from Google AI Studio |
   | `ALLOWED_ORIGINS` | The exact admin dashboard origin(s), comma-separated, with no trailing slash |
   | `EMAIL_USER` | The Gmail address owned by the Apps Script sender |
   | `GMAIL_APPS_SCRIPT_URL` | The deployed Apps Script web app URL ending in `/exec` |
   | `GMAIL_SENDER_TOKEN` | A random secret shared with the Apps Script project |

4. To create the service-account key, open Firebase Console → **Project
   settings → Service accounts → Generate new private key**. Store the
   downloaded key securely and enter its complete JSON only in Render's
   environment-variable field. Never commit it, put it in the admin app, or
   share it in chat. Anyone with this key can administer project data.
5. The production dashboard origins
   `https://borrowing-system-lendy.web.app` and
   `https://borrowing-system-lendy.firebaseapp.com` are allowed automatically.
   Add any custom dashboard domain or local web-server origin (e.g.
   `http://localhost:5500`) to `ALLOWED_ORIGINS`, comma-separated. Use exact
   origins with no trailing slash; do not use a `file://` URL. For Flutter web
   development, localhost and loopback origins are also allowed automatically
   for the public account-request and request-status endpoints only.
6. Wait for deployment and copy the service's public HTTPS URL. Open
   `https://YOUR-SERVICE.onrender.com/health`; it should return
   `{"status":"ok"}`.
7. In `admin/firebase-config.js`, set
   `window.LENDY_APPROVAL_API_URL` to the service URL without a trailing slash,
   then publish the updated admin dashboard.

### Configure free Gmail sending

1. Sign in to [Google Apps Script](https://script.google.com/) with the Gmail
   account that should send the temporary-password messages and create a
   project.
2. Replace the starter code with the contents of
   `approval-server/gmail-sender.gs`, then save the project.
3. Generate a long random token locally, for example:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Keep the output private. In Apps Script **Project Settings → Script
   Properties**, add `LENDY_SENDER_TOKEN` with this value. Add the same value
   to Render as `GMAIL_SENDER_TOKEN`. Never paste the token into chat or commit
   it to the repository.
4. In Apps Script, choose **Deploy → New deployment → Web app**. Set **Execute
   as** to your account, and **Who has access** to **Anyone** so Render can call
   it without a Google sign-in. Deploy, approve the requested Gmail permission,
   and copy the web app URL ending in `/exec`. Do not share that URL with the
   token.
5. In Render's service **Environment** settings, set `EMAIL_USER` to the same
   Gmail address that owns the script and set `GMAIL_APPS_SCRIPT_URL` to the
   deployed `/exec` URL. Remove the old `EMAIL_APP_PASSWORD` variable; it is no
   longer used.
6. Save the environment changes and redeploy the Render service. Apps Script
   uses the Gmail account's sending quota; a free consumer account is generally
   limited to 100 email recipients per day. See the current
   [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).

If **Anyone** is not available when deploying the Apps Script web app, the
Google account's organization policy may block anonymous access. Use a personal
Gmail account or configure an HTTPS email provider instead.

If Render logs report that the Gmail sender returned an invalid response,
confirm the Apps Script deployment is a **Web app** set to **Execute as: Me**
and **Who has access: Anyone**. After changing the script code, edit the
existing deployment to use a new version, or create a new deployment, then
update `GMAIL_APPS_SCRIPT_URL` in Render if the URL changed. Check the Apps
Script **Executions** page for authorization or Gmail quota errors.

To authorize Gmail sending explicitly, select `authorizeGmailSender` in the
Apps Script editor's function dropdown and click **Run**. Approve the Gmail
permission prompt. A successful execution logs the remaining daily recipient
quota. Then update the web app deployment to the latest code version and
redeploy Render.

The admin assistant uses Gemini only to turn an admin's question into a
restricted set of supported database queries. The service verifies the admin,
reads the relevant Firestore collections, and formats the answer itself; it
does not send Firestore records or query results to Gemini. Before sending a
question, it replaces matching account names, emails, and ID numbers with
temporary tokens and removes email addresses and phone-number-like values.
The Gemini key stays in Render and must never be added to dashboard JavaScript.
The service uses Gemini 3.8 Flash through the Interactions API with storage
disabled (`store: false`); only sanitized questions are sent to the model.

The free Gemini tier has usage limits, and Google may use unpaid-service
prompts to improve its products. Do not include personal or confidential
details in a question. Review Google's current [Gemini API terms](https://ai.google.dev/gemini-api/terms)
and [pricing and free-tier limits](https://ai.google.dev/gemini-api/docs/pricing)
before enabling it. If the key is missing or the free quota is exhausted, the
existing local answers continue to work, but questions requiring AI will show
an error.

The service account must be able to manage Firebase Authentication users and
read/write Firestore. Grant only the permissions needed for those tasks. The
service handles admin-approved account activation and confirmed full-account
deletion, including linked loan and account-request records.

## Enable mobile notifications

The mobile app registers its FCM device token in Firestore. The functions in
`functions/` send approval, rejection, and return-status push notifications,
and send daily due/overdue reminders. Deploying these functions is required for
those server-generated alerts to arrive while the app is closed:

1. Enable billing for the Firebase project (the Blaze plan is required for
   Cloud Functions and the scheduled reminder job). Review Firebase pricing
   and set a budget alert before enabling billing; usage may incur charges.
2. From the repository root, install the Functions dependencies and deploy:

   ```powershell
   cd functions
   npm install
   cd ..
   firebase deploy --only functions --project borrowing-system-lendy
   ```
3. Allow notifications for Lendy in the device's system settings. Sign in and
   open the app with internet access so it can register the device token and
   sync loan data.

The app also schedules local return-date reminders on the device. Once a loan
has synced and its reminder is scheduled, that reminder does not need internet
or the app to be running. A server-side change (such as an admin approving a
request) cannot be known by an offline device at the time it happens. FCM may
deliver that push after the device reconnects, but it cannot show immediately
while offline. Android may also defer alarms for an app that has been force
stopped; open the app again to resume them.

## What users and admins will see

- A requester submits their details. The pending request is saved in Firestore,
  while the email remains absent from Firebase Authentication.
- The mobile app checks request status using a private status token saved on
  that device; the requester does not need a Firebase sign-in while waiting.
- When an admin approves the request, the service creates the Firebase
  Authentication user and active account, marks `mustChangePassword: true`,
  generates the temporary password, and emails it to the requester. The app
  can also display the password after email delivery is confirmed.
- The first successful sign-in opens **Set new password** before the
  homepage. Returning users who already changed their password go straight to
  the homepage.
- After the new password is set, the app deletes the requester-only temporary
  credential document.
- If email delivery fails, the service removes the new account and returns the
  request to pending so the admin can retry approval after fixing email
  settings.
- When an admin rejects a request, the service deletes its Firestore request
  and releases the email lock. Since no Authentication user was created for a
  pending request, the same email is available for a new request.

Firestore rules let admins manage account requests; requesters use the
approval service and their device-local status token instead of reading
pending request documents directly. Legacy rejected requests are cleaned up
through the approval service, including removal of any old linked sign-in
account.

When an admin permanently deletes an account, the approval service disables
the account first, then removes its Firebase Authentication user, account
profile, linked loan records, notifications, device registrations, related
account requests and their temporary credentials, and request-email locks.
If cleanup is interrupted, the account remains disabled so the admin can retry
the delete action.

Firebase Authentication and Firestore remain subject to Spark quotas. Render
is a separate service and has its own plan limits and availability.
