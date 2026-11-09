# Account approval with emailed temporary passwords

The account approval flow uses a separately hosted Node.js service and the
Firebase Admin SDK to generate a temporary password, activate the account, and
email the password to the address on the approved request. The password is not
stored in Firestore or returned to the dashboard. The user must change it after
the first sign-in. Gmail SMTP is used for email delivery; this does not need
Resend or Cloud Functions. Push notifications are handled separately by the
Firebase Cloud Functions described below.

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
   | `EMAIL_USER` | The Gmail address that will send account emails |
   | `EMAIL_APP_PASSWORD` | A Google App Password for that Gmail account |

4. To create the service-account key, open Firebase Console → **Project
   settings → Service accounts → Generate new private key**. Store the
   downloaded key securely and enter its complete JSON only in Render's
   environment-variable field. Never commit it, put it in the admin app, or
   share it in chat. Anyone with this key can administer project data.
5. Set `ALLOWED_ORIGINS` to the exact origin where the admin dashboard is
   hosted, e.g. `https://your-admin-site.web.app`. For local testing, include
   the local web-server origin, e.g. `http://localhost:5500`. Do not use a
   `file://` URL.
6. Wait for deployment and copy the service's public HTTPS URL. Open
   `https://YOUR-SERVICE.onrender.com/health`; it should return
   `{"status":"ok"}`.
7. In `admin/firebase-config.js`, set
   `window.LENDY_APPROVAL_API_URL` to the service URL without a trailing slash,
   then publish the updated admin dashboard.

To create the Gmail App Password, enable 2-Step Verification on the sending
Google account, then create an App Password in that Google account's security
settings. Put the 16-character App Password in Render as `EMAIL_APP_PASSWORD`;
do not use the account's normal Gmail password. Keep both email values only in
Render's environment settings, never in source code or `admin/firebase-config.js`.
If the Render service already exists, add both values under that service's
**Environment** settings and redeploy. The approval service uses Gmail's
authenticated SMTP endpoint over TLS.

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

- A requester submits their details and stays signed in on a waiting screen.
- The admin approves the request. The service generates a random temporary
  password, activates the account, marks `mustChangePassword: true`, and emails
  the password to the same email address used by its Firebase Authentication
  account.
- The mobile app confirms that the password was emailed; it does not display
  or store the password. The requester signs in with the emailed password.
- The first successful sign-in opens **Set new password** before the
  homepage. Returning users who already changed their password go straight to
  the homepage.
- If email delivery fails, the account is still approved and the dashboard
  shows a resend action under **Requests & accounts → Accounts**. Resending
  generates a new temporary password and invalidates the previous one.

Firestore rules allow only the requester and admins to read account requests.
The mobile app must remain signed in to show request status. Closing and
reopening the app should retain its Firebase sign-in. If the requester signs
out before approval, they can still use the emailed temporary password after
the admin approves the request.

Firebase Authentication and Firestore remain subject to Spark quotas. Render
is a separate service and has its own plan limits and availability.
