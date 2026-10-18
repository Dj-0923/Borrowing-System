// Paste the config from Firebase console → Project settings → General →
// "Your apps" → the </> (web) app → SDK setup and configuration.
// Every device that loads this file with the same values shares the same
// live database — that's what makes the phone and the web dashboard sync.
// Enable Email/Password sign-in in Firebase Authentication and create admin
// accounts there; the dashboard does not contain a built-in account.
window.LENDY_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
