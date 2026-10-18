# In-app account approval with temporary passwords

Firebase remains on the Spark plan. A separately hosted Node.js service uses
Firebase Admin SDK to securely set the admin's temporary password and activate
the account. The mobile app displays the password in a copyable card while the
requester is signed in. No Resend account, custom email domain, Cloud Functions,
or Secret Manager is needed.

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
   | `ALLOWED_ORIGINS` | The exact admin dashboard origin(s), comma-separated, with no trailing slash |

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

The service account must be able to manage Firebase Authentication users and
read/write Firestore. Grant only the permissions needed for those tasks. The
service handles admin-approved account activation and confirmed full-account
deletion, including linked loan and account-request records.

## What users and admins will see

- A requester submits their details and stays signed in on a waiting screen.
- The admin approves the request and sets a temporary password in the admin
  dashboard.
- The service sets that password in Firebase Authentication, activates the
  account, marks `mustChangePassword: true`, and saves the temporary password
  on that request for the signed-in requester to read.
- The mobile app updates to show a card with the temporary password and a
  **Copy** button. After copying, the requester continues to Login and signs
  in with that password.
- The first successful sign-in opens **Set new password** before the
  homepage. Returning users who already changed their password go straight to
  the homepage.
- After the new password is set, the app removes the temporary password from
  the request document.

Firestore rules allow only the requester and admins to read account requests.
The mobile app must remain signed in to show the waiting screen and password
card. Closing and reopening the app should retain its Firebase sign-in. If the
requester manually signs out before approval, they will need help from an
administrator because the pending account's randomly generated password is
not shown to them.

Firebase Authentication and Firestore remain subject to Spark quotas. Render
is a separate service and has its own plan limits and availability.
