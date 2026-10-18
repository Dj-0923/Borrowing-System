(function () {
  'use strict';

  firebase.initializeApp(window.LENDY_FIREBASE_CONFIG);
  var auth = firebase.auth();

  var root = document.getElementById('app');
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var mode = 'signin'; // 'signin' | 'forgot'
  var busy = false, error = '', info = '';

  function eyeIcon(crossedOut) {
    return crossedOut
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 8 10 8a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function badge() {
  return '<div class="w-28 h-28 mx-auto rounded-full bg-card shadow-lg flex items-center justify-center mb-10">' +
    '<img src="Lendy.png" alt="Lendy" class="w-16 h-16 object-contain">' +
    '</div>';
}

  function card(inner) {
    return '<div class="w-full rounded-[32px] bg-card px-8 sm:px-14 pt-12 pb-12" style="box-shadow:0 30px 70px -20px rgba(14,79,68,.45), 0 10px 25px -10px rgba(14,79,68,.3)">' + inner + '</div>';
  }

  function signinBody() {
    return badge() +
      (error ? '<p class="text-sm t-bad text-center -mt-4 mb-6">' + esc(error) + '</p>' : '') +
      '<form id="signin-form" novalidate class="grid gap-7">' +
      '<div><label class="line-label text-sm" for="li-email">Email/Username</label>' +
      '<input id="li-email" name="email" class="line-input text-base py-2" autocomplete="username" placeholder="you@lendy.edu"></div>' +
      '<div><label class="line-label text-sm" for="li-pass">Password</label>' +
      '<div class="relative"><input id="li-pass" name="password" type="password" class="line-input text-base py-2 pr-9" autocomplete="current-password">' +
      '<button type="button" id="toggle-pass" class="absolute right-0 top-1/2 -translate-y-1/2 text-muted" aria-label="Show password">' + eyeIcon(false) + '</button></div></div>' +
      '<div class="flex items-center justify-between text-sm -mt-1">' +
      '<label class="flex items-center gap-2 text-muted"><input type="checkbox" id="remember" class="w-4 h-4" style="accent-color:var(--brand)"> Remember Me</label>' +
      '<button type="button" id="to-forgot" class="font-semibold" style="color:var(--brand)">Forgot password?</button></div>' +
      '<button type="submit" class="w-full rounded-full py-3.5 text-base font-semibold text-white mt-2 disabled:opacity-60" style="background:var(--btn-bg)"' + (busy ? ' disabled' : '') + '>' +
      (busy ? 'Signing in\u2026' : 'Sign in') + '</button>' +
      '</form>';
  }

  function forgotBody() {
    return '<div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5" style="background:var(--tint)">' +
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>' +
      '<h1 class="font-display font-bold text-xl text-center">Forgot your password?</h1>' +
      '<p class="text-sm text-muted text-center mt-2 max-w-[320px] mx-auto leading-relaxed">Enter your account email and we\u2019ll send a password reset link.</p>' +
      '<form id="forgot-form" novalidate class="grid gap-4 mt-6">' +
      '<div><label class="line-label text-sm" for="forgot-email">Email</label>' +
      '<input id="forgot-email" name="email" type="email" class="line-input text-base py-2" autocomplete="email" placeholder="you@school.edu"></div>' +
      (error ? '<p class="text-sm t-bad text-center">' + esc(error) + '</p>' : '') +
      (info ? '<p class="text-sm text-center mt-4" style="color:var(--ok-fg)">' + esc(info) + '</p>' : '') +
      '<button type="submit" class="btn btn-primary w-full"' + (busy ? ' disabled' : '') + '>' +
      (busy ? 'Sending\u2026' : 'Send reset link') + '</button></form>' +
      '<button type="button" id="to-signin" class="w-full text-center text-sm font-semibold mt-5" style="color:var(--brand)">\u2190 Back to sign in</button>';
  }

  function render() {
    root.innerHTML = card(mode === 'signin' ? signinBody() : forgotBody());
    wire();
    var first = root.querySelector('input');
    if (first) first.focus();
  }

  function wire() {
    var sf = document.getElementById('signin-form');
    if (sf) sf.addEventListener('submit', onSignIn);
    var ff = document.getElementById('forgot-form');
    if (ff) ff.addEventListener('submit', onForgotPassword);
    var toForgot = document.getElementById('to-forgot');
    if (toForgot) toForgot.addEventListener('click', function () { mode = 'forgot'; error = ''; info = ''; render(); });
    var toSignin = document.getElementById('to-signin');
    if (toSignin) toSignin.addEventListener('click', function () { mode = 'signin'; error = ''; render(); });
    var toggle = document.getElementById('toggle-pass');
    if (toggle) toggle.addEventListener('click', function () {
      var input = document.getElementById('li-pass');
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.innerHTML = eyeIcon(!showing);
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }

  function authError(err) {
    if (err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password') {
      return 'Incorrect email or password.';
    }
    if (err.code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (err.code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
    return err.message || 'Authentication failed. Check your Firebase configuration and try again.';
  }

  function onSignIn(ev) {
    ev.preventDefault();
    var email = document.getElementById('li-email').value.trim();
    var pass = document.getElementById('li-pass').value;
    var remember = document.getElementById('remember').checked;
    error = '';
    if (!email || !pass) { error = 'Enter your email and password.'; render(); return; }

    busy = true;
    render();
    auth.setPersistence(remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION)
      .then(function () { return auth.signInWithEmailAndPassword(email, pass); })
      .then(function () { location.replace('index.html'); })
      .catch(function (err) {
        error = authError(err);
        busy = false;
        render();
      });
  }

  function onForgotPassword(ev) {
    ev.preventDefault();
    var email = document.getElementById('forgot-email').value.trim();
    error = '';
    info = '';
    if (!email) { error = 'Enter your account email.'; render(); return; }

    busy = true;
    render();
    auth.sendPasswordResetEmail(email)
      .then(function () {
        busy = false;
        info = 'If an account exists for that email, a reset link has been sent.';
        render();
      })
      .catch(function (err) {
        busy = false;
        error = authError(err);
        render();
      });
  }

  auth.onAuthStateChanged(function (user) {
    if (user) location.replace('index.html');
  }, function (err) {
    error = authError(err);
    render();
  });
  render();
})();
