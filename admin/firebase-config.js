// Paste the config from Firebase console → Project settings → General →
// "Your apps" → the </> (web) app → SDK setup and configuration.
// Every device that loads this file with the same values shares the same
// live database — that's what makes the phone and the web dashboard sync.
// Enable Email/Password sign-in in Firebase Authentication and create admin
// accounts there; the dashboard does not contain a built-in account.
window.LENDY_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAcz3gdaWdrEd3aajqX9I9p36bkJ2ahN14",
  authDomain: "borrowing-system-lendy.firebaseapp.com",
  projectId: "borrowing-system-lendy",
  storageBucket: "borrowing-system-lendy.firebasestorage.app",
  messagingSenderId: "325712193434",
  appId: "1:325712193434:web:589e74cf477099b6b97c23"
};

// Set this to the deployed approval-server URL from FIREBASE_SETUP.md.
window.LENDY_APPROVAL_API_URL = "https://lendy-account-approval.onrender.com";
