(function () {
  'use strict';

  /* Public, no-login form: a student or faculty member types their name and
     email, it lands in Firestore as a pending account request, and the admin
     approves or rejects it from the "Account requests" page in app.js. */

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var root = document.getElementById('app');
  function card(inner) {
    return '<div class="w-full max-w-md rounded-2xl bg-card border border-line shadow-soft p-6">' + inner + '</div>';
  }

  firebase.initializeApp(window.LENDY_FIREBASE_CONFIG);
  var requestsCol = firebase.firestore().collection('accountRequests');

  var submitted = false;

  function render() {
    var body = '<p class="text-xs text-muted">Lendy</p>' +
      '<h1 class="font-display font-bold text-2xl mt-1">Request access</h1>' +
      '<p class="text-sm text-muted mt-2">Tell the admin who you are and they\u2019ll review your request.</p>';

    if (submitted) {
      body += '<p class="text-sm mt-5" style="color:var(--ok-fg)">Thanks \u2014 your request has been sent. An admin will review it shortly.</p>';
    } else {
      body += '<form id="request-form" class="mt-5 grid gap-4" novalidate>' +
        '<div><label class="lbl" for="ra-name">Full name</label><input id="ra-name" name="name" class="field" placeholder="Your full name" maxlength="60" autocomplete="name"></div>' +
        '<div><label class="lbl" for="ra-role">I am a</label><select id="ra-role" name="role" class="field"><option value="student">Student</option><option value="faculty">Faculty</option></select></div>' +
        '<div><label class="lbl" for="ra-course">Course / Department</label><select id="ra-course" name="course" class="field">' +
        '<option>BS Computer Science</option><option>BS Education</option><option>BS Engineering</option>' +
        '<option>BS Information Technology</option><option>BS Multimedia Arts</option><option>Other</option></select></div>' +
        '<div><label class="lbl" for="ra-email">Email</label><input id="ra-email" name="email" type="email" class="field" placeholder="you@school.edu" autocomplete="email"></div>' +
        '<p id="form-error" class="text-sm t-bad min-h-[1.1rem]" role="alert"></p>' +
        '<button type="submit" class="btn btn-primary">Send request</button></form>';
    }
    root.innerHTML = card(body);
    var form = document.getElementById('request-form');
    if (form) form.addEventListener('submit', onSubmit);
  }

  function onSubmit(ev) {
    ev.preventDefault();
    var name = document.getElementById('ra-name').value.trim();
    var role = document.getElementById('ra-role').value;
    var course = document.getElementById('ra-course').value;
    var email = document.getElementById('ra-email').value.trim();
    var errEl = document.getElementById('form-error');
    errEl.textContent = '';
    if (!name) { errEl.textContent = 'Enter your full name.'; return; }
    if (!email || email.indexOf('@') === -1) { errEl.textContent = 'Enter a valid email address.'; return; }

    var btn = ev.target.querySelector('button[type=submit]');
    btn.disabled = true;
    var ref = requestsCol.doc();
    ref.set({ id: ref.id, name: name, role: role, course: course, email: email, status: 'pending', submittedAt: Date.now(), updatedAt: Date.now() })
      .then(function () { submitted = true; render(); })
      .catch(function (err) { btn.disabled = false; errEl.textContent = err.message; });
  }

  render();
})();
