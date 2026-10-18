(function () {
  'use strict';

  /* This file is intentionally separate from app.js: it's the page a QR code
     opens for anyone (students, faculty — no login), so it only ever reads
     one item and lets someone request to borrow it. It never touches
     approve/reject/maintenance/delete — those stay admin-only in app.js. */

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var today = function () { return iso(new Date()); };
  var addDays = function (s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  var fmt = function (s) {
    var d = parse(s);
    var base = MON[d.getMonth()] + ' ' + d.getDate();
    return d.getFullYear() === new Date().getFullYear() ? base : base + ', ' + d.getFullYear();
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var LABEL = { available: 'Available', borrowed: 'Borrowed', maintenance: 'Maintenance' };

  var root = document.getElementById('app');
  var id = new URLSearchParams(location.search).get('id');

  function card(inner) {
    return '<div class="w-full max-w-md rounded-2xl bg-card border border-line shadow-soft p-6">' + inner + '</div>';
  }

  if (!id) {
    root.innerHTML = card('<p class="font-display font-bold text-lg">No item specified</p>' +
      '<p class="text-sm text-muted mt-2">Scan an item\u2019s QR code to open its page here.</p>');
    return;
  }

  firebase.initializeApp(window.LENDY_FIREBASE_CONFIG);
  var fsdb = firebase.firestore();
  var equipmentCol = fsdb.collection('equipment');
  var loansCol = fsdb.collection('loans');

  var equipment = null, loans = [], loadedEq = false, loadedLoans = false, fatalError = null, submitted = false;

  equipmentCol.doc(id).onSnapshot(function (doc) {
    equipment = doc.exists ? doc.data() : null;
    loadedEq = true; render();
  }, function (err) { fatalError = err; render(); });

  loansCol.where('equipmentId', '==', id).onSnapshot(function (snap) {
    loans = snap.docs.map(function (d) { return d.data(); });
    loadedLoans = true; render();
  }, function (err) { fatalError = err; render(); });

  function activeLoan() { return loans.find(function (l) { return l.status === 'approved'; }); }
  function status() {
    if (!equipment) return null;
    if (equipment.maintenance) return 'maintenance';
    return activeLoan() ? 'borrowed' : 'available';
  }

  function render() {
    if (fatalError) {
      root.innerHTML = card('<p class="font-display font-bold text-lg">Can\u2019t load this item</p>' +
        '<p class="text-sm text-muted mt-2">' + esc(fatalError.message) + '</p>');
      return;
    }
    if (!loadedEq || !loadedLoans) { root.innerHTML = card('<p class="text-sm text-muted">Loading\u2026</p>'); return; }
    if (!equipment) {
      root.innerHTML = card('<p class="font-display font-bold text-lg">Item not found</p>' +
        '<p class="text-sm text-muted mt-2">This QR code doesn\u2019t match anything in the inventory right now.</p>');
      return;
    }

    var st = status(), al = activeLoan(), body = '';
    if (equipment.image) body += '<img src="' + equipment.image + '" alt="" class="w-full h-44 object-cover rounded-xl mb-4">';
    body += '<p class="text-xs text-muted">' + esc(equipment.category) + ' \u00b7 ' + esc(equipment.tag) + '</p>';
    body += '<h1 class="font-display font-bold text-2xl mt-1 leading-tight">' + esc(equipment.name) + '</h1>';
    body += '<span class="pill pill-' + st + ' mt-3 inline-flex">' + LABEL[st] + '</span>';

    if (st === 'borrowed') {
      body += '<p class="text-sm text-muted mt-4">This item is on loan right now. It\u2019s due back ' + fmt(al.end) + '.</p>';
    } else if (st === 'maintenance') {
      body += '<p class="text-sm text-muted mt-4">This item is being serviced and isn\u2019t available to borrow right now.</p>';
    } else if (submitted) {
      body += '<p class="text-sm mt-4" style="color:var(--ok-fg)">Request sent \u2014 an admin will review it shortly.</p>';
    } else {
      var t = today();
      body += '<form id="borrow-form" class="mt-5 grid gap-3" novalidate>' +
        '<div><label class="lbl" for="q-borrower">Your name</label><input id="q-borrower" name="borrower" class="field" placeholder="Full name" maxlength="60" autocomplete="off"></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="lbl" for="q-start">Borrow from</label><input id="q-start" name="start" type="date" class="field" value="' + t + '" min="' + t + '"></div>' +
        '<div><label class="lbl" for="q-end">Return by</label><input id="q-end" name="end" type="date" class="field" value="' + addDays(t, 3) + '" min="' + t + '"></div></div>' +
        '<p id="form-error" class="text-sm t-bad min-h-[1.1rem]" role="alert"></p>' +
        '<button type="submit" class="btn btn-primary">Request to borrow</button></form>';
    }
    root.innerHTML = card(body);

    var form = document.getElementById('borrow-form');
    if (!form) return;
    form.addEventListener('submit', onSubmit);
    form.elements.start.addEventListener('change', function () {
      form.elements.end.min = form.elements.start.value;
      if (form.elements.end.value < form.elements.start.value) form.elements.end.value = form.elements.start.value;
    });
  }

  function onSubmit(ev) {
    ev.preventDefault();
    var form = ev.target, errEl = document.getElementById('form-error');
    var borrower = form.elements.borrower.value.trim(), start = form.elements.start.value, end = form.elements.end.value, t = today();
    errEl.textContent = '';
    if (status() !== 'available') { errEl.textContent = 'This item is no longer available.'; render(); return; }
    if (!borrower) { errEl.textContent = 'Enter your name.'; return; }
    if (!start || !end) { errEl.textContent = 'Choose both dates.'; return; }
    if (start < t) { errEl.textContent = 'The borrow date can\u2019t be in the past.'; return; }
    if (end < start) { errEl.textContent = 'The return date must be on or after the borrow date.'; return; }

    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    var ref = loansCol.doc();
    ref.set({
      id: ref.id, equipmentId: id, name: equipment.name, borrower: borrower, start: start, end: end,
      status: 'pending', returnedOn: null, updatedAt: Date.now()
    }).then(function () {
      submitted = true; render();
    }).catch(function (err) {
      btn.disabled = false; errEl.textContent = err.message;
    });
  }

  render();
})();
