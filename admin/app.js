(function () {
  'use strict';

  var fsApp = firebase.initializeApp(window.LENDY_FIREBASE_CONFIG);
  var auth = fsApp.auth();
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      location.replace('login.html');
      return;
    }
    startDashboard(user);
  }, function (err) {
    document.getElementById('app').textContent =
      err.message || 'Could not verify your sign-in.';
  });

  function startDashboard(currentUser) {

  /* ---------- helpers ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAY_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CATEGORIES = { Computers: 'laptop', Cameras: 'camera', Tablets: 'tablet', Displays: 'projector', Robotics: 'cpu', Audio: 'headphones', Other: 'box' };
  var TAG_PREFIX = { Computers: 'LT', Cameras: 'CM', Tablets: 'TB', Displays: 'PJ', Robotics: 'RB', Audio: 'AU', Other: 'OT' };

  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var today = function () { return iso(new Date()); };
  var addDays = function (s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  var diffDays = function (a, b) { return Math.round((parse(a) - parse(b)) / 86400000); };
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
  var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
  var initials = function (name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'A';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  function userAvatar(account, sizeClass, textClass) {
    var image = typeof account.profileImage === 'string' &&
      /^data:image\/(?:jpeg|png|webp);base64,/i.test(account.profileImage);
    return image
      ? '<img src="' + esc(account.profileImage) + '" alt="" class="' + sizeClass + ' rounded-full object-cover shrink-0">'
      : '<span class="' + sizeClass + ' rounded-full flex items-center justify-center text-white font-display font-bold ' + textClass + ' shrink-0" style="background:var(--btn-bg)">' +
        esc(initials(account.name)) + '</span>';
  }

  /* ---------- icons ---------- */
  var ICONS = {
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    filecheck: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    scroll: '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
    laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    projector: '<path d="M5 7 3 5"/><path d="M9 6V3"/><path d="m13 7 2-2"/><circle cx="9" cy="13" r="3"/><path d="M11.83 12H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2.17"/><path d="M16 16h2"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M14 21h3"/><path d="M21 14v3"/><path d="M21 21h.01"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    chevronleft: '<path d="m15 18-6-6 6-6"/>',
    key: '<path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>'
  };
  var icon = function (name, cls) {
    return '<svg class="' + (cls || 'w-5 h-5') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.box) + '</svg>';
  };
  var catIcon = function (cat) { return CATEGORIES[cat] || 'box'; };

  /* ---------- firebase (shared, real-time database) ---------- */
  var fsdb = firebase.firestore();
  var equipmentCol = fsdb.collection('equipment');
  var loansCol = fsdb.collection('loans');
  var metaCol = fsdb.collection('meta');
  var requestsCol = fsdb.collection('accountRequests');
  var accountsCol = fsdb.collection('accounts');

  var profileDoc = metaCol.doc(currentUser.uid);
  var db = { equipment: [], loans: [], profile: null, accountRequests: [], accounts: [] };
  var loaded = { equipment: false, loans: false, profile: false, accountRequests: false, accounts: false };
  var syncError = null;

  function allLoaded() { return loaded.equipment && loaded.loans && loaded.profile && loaded.accountRequests && loaded.accounts; }

  function watch(col, key) {
    col.onSnapshot(function (snap) {
      db[key] = snap.docs.map(function (d) { return d.data(); });
      loaded[key] = true; syncError = null;
      if (allLoaded()) render();
    }, function (err) {
      syncError = err; render();
    });
  }
  watch(equipmentCol, 'equipment');
  watch(loansCol, 'loans');
  watch(requestsCol, 'accountRequests');
  watch(accountsCol, 'accounts');

  function defaultProfile() {
    var createdAt = currentUser.metadata && currentUser.metadata.creationTime
      ? new Date(currentUser.metadata.creationTime)
      : null;
    return {
      name: currentUser.displayName || currentUser.email || 'Administrator',
      role: 'Administrator',
      email: currentUser.email || '',
      memberSince: createdAt ? MON[createdAt.getMonth()] + ' ' + createdAt.getFullYear() : '—',
      photo: currentUser.photoURL || null
    };
  }
  function profileData() {
    var saved = db.profile || {};
    var fallback = defaultProfile();
    return {
      name: saved.name || fallback.name,
      role: fallback.role,
      email: fallback.email,
      memberSince: fallback.memberSince,
      photo: saved.photo || fallback.photo
    };
  }
  profileDoc.onSnapshot(function (doc) {
    db.profile = doc.exists ? doc.data() : null;
    loaded.profile = true; syncError = null;
    if (allLoaded()) render();
  }, function (err) { syncError = err; render(); });

  /* ---------- derived state ---------- */
  var eqById = function (id) { return db.equipment.find(function (e) { return e.id === id; }); };
  var activeLoanFor = function (id) { return db.loans.find(function (l) { return l.equipmentId === id && l.status === 'approved'; }); };
  var itemStatus = function (e) { return e.maintenance ? 'maintenance' : activeLoanFor(e.id) ? 'borrowed' : 'available'; };
  var loanStatus = function (l) { return (l.status === 'approved' && l.end < today()) ? 'overdue' : l.status; };
  var isCheckout = function (l) { return l.status === 'approved' || l.status === 'returned'; };
  var pendingRequests = function () { return db.accountRequests.filter(function (r) { return r.status === 'pending'; }); };
  /* Loans only store the borrower's typed name, not an account id, so this
     matches by name (case/space-insensitive). Two accounts sharing the exact
     same name would be matched together — a known limit of this simpler
     setup; linking by email would need the request-access flow to also
     collect email with every loan, which it doesn't today. */
  var normName = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  function loansFor(account) {
    var n = normName(account.name);
    return db.loans.filter(function (l) { return normName(l.borrower) === n; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }
  function userStatus(account) {
    if (account.status === 'revoked') return 'disabled';
    var mine = loansFor(account);
    if (mine.some(function (l) { return loanStatus(l) === 'overdue'; })) return 'overdue';
    if (mine.some(function (l) { return l.status === 'approved'; })) return 'borrowing';
    return 'active';
  }
  function userSummary(account) {
    var mine = loansFor(account), t = today();
    return {
      loans: mine,
      itemsOut: mine.filter(function (l) { return l.status === 'approved'; }).length,
      totalBorrowed: mine.filter(isCheckout).length,
      dueSoon: mine.filter(function (l) { return l.status === 'approved' && diffDays(l.end, t) >= 0 && diffDays(l.end, t) <= 2; }).length,
      returned: mine.filter(function (l) { return l.status === 'returned'; }).length,
      currentBorrowed: mine.filter(function (l) { return l.status === 'approved'; }).length
    };
  }

  function stats() {
    var s = { total: db.equipment.length, available: 0, borrowed: 0, maintenance: 0, out: 0, pending: 0, overdue: 0 };
    db.equipment.forEach(function (e) { s[itemStatus(e)]++; });
    db.loans.forEach(function (l) {
      if (l.status === 'approved') s.out++;
      if (l.status === 'pending') s.pending++;
      if (loanStatus(l) === 'overdue') s.overdue++;
    });
    return s;
  }

  function chartData(mode) {
    var t = today(), out = [], i;
    var live = db.loans.filter(isCheckout);
    if (mode === 'day') {
      for (i = 6; i >= 0; i--) {
        var d = addDays(t, -i);
        out.push({
          label: DAY[parse(d).getDay()], sub: fmt(d), isNow: i === 0,
          count: live.filter(function (l) { return l.start === d; }).length
        });
      }
    } else {
      var now = new Date();
      for (i = 11; i >= 0; i--) {
        var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var key = m.getFullYear() + '-' + pad(m.getMonth() + 1);
        out.push({
          label: MON[m.getMonth()], sub: MON[m.getMonth()] + ' ' + m.getFullYear(), isNow: i === 0,
          count: live.filter(function (l) { return l.start.indexOf(key) === 0; }).length
        });
      }
    }
    return out;
  }

  function buildNotifications() {
    var t = today(), out = [];
    db.loans.forEach(function (l) {
      var st = loanStatus(l);
      if (st === 'overdue') {
        var n = diffDays(t, l.end);
        out.push({ sev: 0, tone: 'bad', icon: 'alert', title: l.name + ' is ' + plural(n, 'day') + ' overdue',
          body: l.borrower + ' was due back ' + fmt(l.end) + '.', action: { label: 'Mark returned', act: 'return', id: l.id } });
      } else if (st === 'approved') {
        var d = diffDays(l.end, t);
        if (d === 0 || d === 1) {
          out.push({ sev: 1, tone: 'warn', icon: 'clock', title: l.name + ' is due ' + (d === 0 ? 'today' : 'tomorrow'),
            body: l.borrower + ' returns it ' + fmt(l.end) + '.', action: { label: 'Mark returned', act: 'return', id: l.id } });
        }
      } else if (st === 'pending') {
        out.push({ sev: 1, tone: 'warn', icon: 'filecheck', title: l.borrower + ' requested ' + l.name,
          body: fmt(l.start) + ' → ' + fmt(l.end), action: { label: 'Review', act: 'nav', view: 'approvals' } });
      } else if (st === 'returned' && l.returnedOn && diffDays(t, l.returnedOn) <= 2) {
        out.push({ sev: 3, tone: 'ok', icon: 'check', title: l.name + ' was returned',
          body: l.borrower + ' returned it ' + fmt(l.returnedOn) + '.' });
      }
    });
    db.equipment.filter(function (e) { return e.maintenance; }).forEach(function (e) {
      out.push({ sev: 2, tone: 'bad', icon: 'wrench', title: e.name + ' is in maintenance',
        body: 'Unavailable for borrowing until it is back in service.', action: { label: 'Back in service', act: 'maintenance-off', id: e.id } });
    });
    pendingRequests().forEach(function (r) {
      out.push({ sev: 1, tone: 'warn', icon: 'userplus', title: r.name + ' wants an account',
        body: r.email, action: { label: 'Review', act: 'nav', view: 'requests' } });
    });
    return out.sort(function (a, b) { return a.sev - b.sev; });
  }

  /* ---------- ui state ---------- */
  var state = {
    view: 'dashboard', lastView: null, chartMode: 'day', sidebarOpen: false, assistantOpen: false, modal: null,
    filter: { inventory: 'all', history: 'all', usersRole: 'all', usersCourse: 'all' }, q: { inventory: '', history: '', users: '' },
    tab: { requests: 'pending' },
    chat: [{ from: 'bot', text: "Hi, I'm the Lendy assistant. Ask me what's going on with the equipment." }]
  };
  var pendingConfirm = null;

  /* ---------- shared template pieces ---------- */
  var LABEL = { approved: 'Approved', overdue: 'Overdue', pending: 'Pending', returned: 'Returned', rejected: 'Rejected',
    available: 'Available', borrowed: 'Borrowed', maintenance: 'Maintenance', active: 'Active', revoked: 'Revoked',
    disabled: 'Disabled', borrowing: 'Borrowing' };
  var pill = function (st) { return '<span class="pill pill-' + st + '">' + LABEL[st] + '</span>'; };

  function pageHeader(title, sub, actions) {
    return '<div class="flex flex-wrap items-end justify-between gap-4">' +
      '<div><h1 class="font-display font-extrabold text-[2rem] sm:text-[2.35rem] xl:text-[2.9rem] leading-none tracking-tight">' + title + '</h1>' +
      '<p class="mt-3 text-sm xl:text-base text-muted">' + sub + '</p></div>' +
      (actions ? '<div class="flex flex-wrap gap-2">' + actions + '</div>' : '') + '</div>';
  }
  function sectionHead(title, note) {
    return '<div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">' +
      '<h2 class="font-display font-bold text-xl xl:text-2xl">' + title + '</h2>' +
      (note ? '<p class="text-xs text-muted">' + note + '</p>' : '') + '</div>';
  }
  function emptyState(ic, title, body, action) {
    return '<div class="rounded-2xl border border-dashed border-line bg-card px-6 py-10 text-center">' +
      '<div class="mx-auto w-12 h-12 rounded-full bg-tint text-brand flex items-center justify-center">' + icon(ic, 'w-6 h-6') + '</div>' +
      '<p class="mt-4 font-semibold">' + title + '</p>' +
      '<p class="mt-1 text-sm text-muted max-w-sm mx-auto">' + body + '</p>' +
      (action ? '<div class="mt-5">' + action + '</div>' : '') + '</div>';
  }
  function chip(label, count, active, action, value) {
    return '<button data-action="' + action + '" data-value="' + value + '" aria-pressed="' + active + '" class="chip ' + (active ? 'chip-on' : '') + '">' +
      label + '<span class="chip-n">' + count + '</span></button>';
  }
  function searchBox(key, placeholder) {
    return '<div class="relative flex-1 min-w-[200px] max-w-sm"><span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">' + icon('search', 'w-4 h-4') + '</span>' +
      '<input id="search-' + key + '" data-search="' + key + '" type="search" value="' + esc(state.q[key]) + '" placeholder="' + placeholder + '" class="field" style="padding-left:2.2rem" autocomplete="off"></div>';
  }
  var mediaTile = function (e, size) {
    var s = size || 'w-10 h-10';
    if (e && e.image) return '<span class="shrink-0 ' + s + ' rounded-xl overflow-hidden bg-tint"><img src="' + e.image + '" alt="" class="w-full h-full object-cover"></span>';
    return '<span class="shrink-0 ' + s + ' rounded-xl bg-tint text-brand flex items-center justify-center">' + icon(catIcon(e && e.category), 'w-5 h-5') + '</span>';
  };

  /* ---------- shell ---------- */
  function sidebar() {
    var s = stats();
    var p = db.profile || defaultProfile();
    var attention = buildNotifications().filter(function (n) { return n.sev <= 1; }).length;
    var items = [
      ['dashboard', 'Dashboard', 'chart', 0],
      ['approvals', 'Approval queue', 'filecheck', s.pending],
      ['requests', 'Requests', 'userplus', pendingRequests().length],
      ['inventory', 'Inventory', 'archive', 0],
      ['users', 'Users', 'users', 0],
      ['history', 'Borrowing history', 'scroll', 0],
      ['notifications', 'Notifications', 'bell', attention]
    ];
    return '<aside class="fixed inset-y-0 left-0 z-40 w-[266px] flex flex-col text-white transition-transform duration-200 ' +
      (state.sidebarOpen ? 'translate-x-0' : '-translate-x-full') + ' lg:translate-x-0" ' +
      'style="background:linear-gradient(180deg,var(--side-from),var(--side-to));padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)" aria-label="Main">' +
      '<div class="px-9 pt-8 pb-9 flex items-center gap-3">' + logo() +
      '<span class="font-display font-bold text-[1.6rem] tracking-tight">Lendy</span></div>' +
      '<nav class="px-5 flex flex-col gap-1.5">' +
      items.map(function (it) {
        return '<button data-action="nav" data-view="' + it[0] + '" class="nav-item" ' + (state.view === it[0] ? 'aria-current="page"' : '') + '>' +
          icon(it[2], 'w-5 h-5 shrink-0') + '<span>' + it[1] + '</span>' +
          (it[3] > 0 ? '<span class="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-400 text-emerald-950 text-[11px] font-bold flex items-center justify-center tnum">' + it[3] + '</span>' : '') +
          '</button>';
      }).join('') + '</nav>' +
      '<div class="mt-auto px-5 pb-6">' +
      '<button data-action="nav" data-view="profile" class="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition ' +
      (state.view === 'profile' ? 'ring-2 ring-inset ring-white/60' : 'hover:bg-white/10') + '" style="background:rgba(255,255,255,.16)">' +
      (p.photo
        ? '<span class="w-10 h-10 rounded-full overflow-hidden shrink-0"><img src="' + p.photo + '" alt="" class="w-full h-full object-cover"></span>'
        : '<span class="w-10 h-10 rounded-full bg-white/90 text-emerald-900 font-bold text-sm flex items-center justify-center shrink-0">' + esc(initials(p.name)) + '</span>') +
      '<div class="min-w-0"><p class="text-sm font-semibold leading-tight truncate">' + esc(p.name) + '</p><p class="text-xs text-white/75 leading-tight mt-0.5">Admin</p></div></button></div></aside>';
  }
  function logo() {
  return '<span class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">' +
    '<img src="Lendy.png" alt="Lendy" class="w-7 h-7 object-contain">' +
    '</span>';
}
  function mobileBar() {
    return '<header class="lg:hidden sticky z-30 flex items-center gap-3 px-4 h-14 bg-cream border-b border-line" style="top:env(safe-area-inset-top,0px)">' +
      '<button data-action="toggle-sidebar" class="w-9 h-9 -ml-1 rounded-lg flex items-center justify-center hover:bg-tint" aria-label="Open menu">' + icon('menu', 'w-5 h-5') + '</button>' +
      '<span class="font-display font-bold text-lg text-brand-deep">Lendy</span></header>';
  }

  /* ---------- views ---------- */
  var COLS = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_104px]';

  function viewDashboard() {
    var s = stats();
    var recent = db.loans.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).slice(0, 5);
    var cards = [
      ['Total equipment', s.total, 'inventory', '', false],
      ['Currently borrowed', s.out, 'history', 'active', false],
      ['Pending requests', s.pending, 'approvals', '', false],
      ['Overdue returns', s.overdue, 'history', 'overdue', s.overdue > 0]
    ];
    var showcase = db.equipment.slice().sort(function (a, b) {
      var order = { available: 0, borrowed: 1, maintenance: 2 };
      return order[itemStatus(a)] - order[itemStatus(b)];
    }).slice(0, 4);

    return pageHeader('Dashboard', 'A snapshot of equipment activity across campus.') +
      '<div class="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">' +
      cards.map(function (c) {
        return '<button data-action="nav" data-view="' + c[2] + '" data-filter="' + c[3] + '" class="text-left rounded-2xl bg-card border border-line shadow-soft px-5 py-5 xl:px-7 xl:py-7 transition hover:-translate-y-0.5">' +
          '<span class="block font-display font-medium text-[2.5rem] xl:text-[3.4rem] leading-none tnum ' + (c[4] ? 't-bad' : 'text-brand-deep') + '">' + c[1] + '</span>' +
          '<span class="block mt-2.5 text-sm xl:text-base text-muted">' + c[0] + '</span></button>';
      }).join('') + '</div>' +

      '<div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">' + borrowChart() + inventoryStatus(s) + '</div>' +

      '<section class="mt-10">' + sectionHead('Recent activity', 'Latest borrows and returns') +
      (recent.length ? activityTable(recent) :
        emptyState('inbox', 'No activity yet', 'Borrows, returns and requests will show up here as they happen.',
          db.equipment.length ? '<button class="btn btn-primary" data-action="open-request">' + icon('plus', 'w-4 h-4') + 'New request</button>' : '<button class="btn btn-primary" data-action="open-add">' + icon('plus', 'w-4 h-4') + 'Add equipment</button>')) +
      '</section>' +

      '<section class="mt-10">' + sectionHead('Items', 'Some cards students and faculty see when they browse') +
      (showcase.length ? '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">' + showcase.map(itemCard).join('') + '</div>' +
        (db.equipment.length > 4 ? '<div class="mt-4"><button class="btn btn-ghost" data-action="nav" data-view="inventory">See all ' + db.equipment.length + ' items</button></div>' : '')
        : emptyState('box', 'No equipment yet', 'Add your first item and it will appear here for borrowers to browse.',
          '<button class="btn btn-primary" data-action="open-add">' + icon('plus', 'w-4 h-4') + 'Add equipment</button>')) +
      '</section>';
  }

  function borrowChart() {
    var data = chartData(state.chartMode);
    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.count; })));
    var total = data.reduce(function (a, d) { return a + d.count; }, 0);
    var tog = function (m, label) {
      var on = state.chartMode === m;
      return '<button data-action="chart-mode" data-mode="' + m + '" aria-pressed="' + on + '" class="px-3 py-1 rounded-full text-[11px] font-semibold ' +
        (on ? 'bg-[color:var(--btn-bg)] text-white' : 'text-ink hover:bg-tint') + '">' + label + '</button>';
    };
    return '<div class="rounded-2xl border border-line bg-card shadow-soft p-5">' +
      '<div class="flex items-start justify-between gap-3"><div>' +
      '<h3 class="text-[13px] font-bold text-brand-deep">Borrow activity</h3>' +
      '<p class="text-[11px] text-muted mt-0.5">Items checked out, by period · ' + plural(total, 'checkout') + (state.chartMode === 'day' ? ' in the last 7 days' : ' in the last 12 months') + '</p></div>' +
      '<div class="inline-flex rounded-full border border-muted p-0.5 shrink-0" role="group" aria-label="Chart period">' + tog('day', 'Day') + tog('month', 'Month') + '</div></div>' +
      '<div class="plot mt-5 flex items-end gap-1.5 sm:gap-3 xl:gap-5 h-[190px] xl:h-[250px]">' +
      data.map(function (d) {
        var h = d.count === 0 ? '3px' : 'max(8px,calc(var(--plot-h) * ' + (d.count / max).toFixed(3) + '))';
        return '<div class="group flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5" title="' + esc(d.sub) + ': ' + plural(d.count, 'checkout') + '">' +
          '<span class="text-[11px] font-semibold text-brand-deep tnum ' + (d.count ? '' : 'opacity-0') + ' group-hover:opacity-100 transition-opacity">' + d.count + '</span>' +
          '<div class="w-full max-w-[36px] xl:max-w-[60px] rounded-t-md bar ' + (d.count === 0 ? 'bar-zero' : '') + '" style="height:' + h + '"></div>' +
          '<span class="text-[10px] sm:text-[11px] ' + (d.isNow ? 'font-bold text-ink' : 'font-medium text-muted') + '">' + d.label + '</span></div>';
      }).join('') + '</div></div>';
  }

  function inventoryStatus(s) {
    var seg = function (n, color) { return s.total ? '<span style="width:' + (n / s.total * 100) + '%;background:' + color + '"></span>' : ''; };
    var row = function (label, n, color) {
      return '<div class="flex items-center justify-between py-2.5 border-b border-line last:border-b-0 text-[13px]">' +
        '<span class="flex items-center gap-2.5"><i class="w-2 h-2 rounded-full" style="background:' + color + '"></i>' + label + '</span>' +
        '<span class="tnum">' + n + '</span></div>';
    };
    return '<div class="rounded-2xl border border-line bg-card shadow-soft p-5">' +
      '<h3 class="text-[13px] font-bold text-brand-deep">Inventory status</h3>' +
      '<p class="text-[11px] text-muted mt-0.5">Where everything stands right now</p>' +
      '<div class="mt-5 flex h-1.5 rounded-full overflow-hidden" style="background:var(--bar-track)" role="img" aria-label="' + s.available + ' available, ' + s.borrowed + ' borrowed, ' + s.maintenance + ' in maintenance">' +
      seg(s.available, 'var(--avail)') + seg(s.borrowed, 'var(--borrow)') + seg(s.maintenance, 'var(--maint)') + '</div>' +
      '<div class="mt-3">' + row('Available', s.available, 'var(--avail)') + row('Borrowed', s.borrowed, 'var(--borrow)') + row('Maintenance', s.maintenance, 'var(--maint)') + '</div></div>';
  }

  function activityTable(loans) {
    return '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[560px] rounded-2xl border border-line bg-card overflow-hidden">' +
      '<div class="grid ' + COLS + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>Equipment</span><span>Borrower</span><span>Dates</span><span class="text-right">Status</span></div>' +
      loans.map(function (l) {
        return '<div class="grid ' + COLS + ' gap-3 px-4 py-3.5 items-center text-[13px] border-t border-line">' +
          '<span class="truncate font-medium">' + esc(l.name) + '</span><span class="truncate">' + esc(l.borrower) + '</span>' +
          '<span class="tnum text-muted">' + fmt(l.start) + ' → ' + fmt(l.end) + '</span>' +
          '<span class="text-right">' + pill(loanStatus(l)) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function itemCard(e) {
    var st = itemStatus(e), al = activeLoanFor(e.id), foot;
    if (st === 'available') foot = '<span class="text-[11px] text-muted">Ready to borrow</span>';
    else if (st === 'borrowed') {
      var late = loanStatus(al) === 'overdue';
      foot = '<span class="text-[11px] ' + (late ? 't-bad font-semibold' : 'text-muted') + '">' + (late ? 'Late since ' : 'Back ') + fmt(al.end) + '</span>';
    } else foot = '<span class="text-[11px] text-muted">Being repaired</span>';
    return '<div class="rounded-2xl bg-card border border-line shadow-soft p-4 flex flex-col gap-3">' +
      mediaTile(e, 'w-11 h-11') +
      '<div class="min-w-0"><p class="font-semibold text-[15px] leading-snug">' + esc(e.name) + '</p><p class="text-xs text-muted mt-0.5">' + esc(e.category) + '</p></div>' +
      '<div class="mt-auto flex items-center justify-between gap-2">' + pill(st) + foot + '</div></div>';
  }

  function viewApprovals() {
    var list = db.loans.filter(function (l) { return l.status === 'pending'; })
      .sort(function (a, b) { return a.start.localeCompare(b.start); });
    var body;
    if (!list.length) {
      body = emptyState('check', "You're all caught up", 'New borrow requests will land here for you to approve or reject.');
    } else {
      body = '<div class="grid gap-3">' + list.map(function (l) {
        var e = eqById(l.equipmentId), st = e ? itemStatus(e) : 'maintenance', cur = e ? activeLoanFor(e.id) : null;
        var note = st === 'available' ? 'Ready to lend' : st === 'borrowed' ? 'On loan until ' + fmt(cur.end) : 'In maintenance';
        var days = diffDays(l.end, l.start) + 1;
        return '<div class="rounded-2xl bg-card border border-line shadow-soft p-4 sm:p-5 flex flex-wrap items-center gap-4">' +
          mediaTile(e, 'w-12 h-12') +
          '<div class="min-w-[180px] flex-1"><p class="font-semibold">' + esc(l.name) + (e ? ' <span class="text-xs font-normal text-muted">' + esc(e.tag) + '</span>' : '') + '</p>' +
          '<p class="text-sm text-muted mt-0.5">' + esc(l.borrower) + ' · <span class="tnum">' + fmt(l.start) + ' → ' + fmt(l.end) + '</span> · ' + plural(days, 'day') + '</p>' +
          '<p class="mt-2 flex items-center gap-2 text-xs text-muted">' + pill(st) + note + '</p></div>' +
          '<div class="flex gap-2 ml-auto">' +
          '<button class="btn btn-danger" data-action="reject" data-id="' + l.id + '">' + icon('x', 'w-4 h-4') + 'Reject</button>' +
          '<button class="btn btn-primary" data-action="approve" data-id="' + l.id + '" ' + (st !== 'available' ? 'disabled title="This item is not available to lend right now"' : '') + '>' + icon('check', 'w-4 h-4') + 'Approve</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    return pageHeader('Approval queue', list.length ? plural(list.length, 'request') + ' waiting for your review.' : 'Nothing is waiting for review.') +
      '<div class="mt-8">' + body + '</div>';
  }

  function fmtWhen(ms) {
    var d = new Date(ms), days = diffDays(today(), iso(d));
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    return MON[d.getMonth()] + ' ' + d.getDate();
  }
  var ROLE_LABEL = { student: 'Student', faculty: 'Faculty' };
  function rolePill(role) {
    var known = ROLE_LABEL[role] || 'Student';
    var color = role === 'faculty' ? 'purple' : 'blue';
    var vars = color === 'purple'
      ? 'color:#7c3aed;background:#f2e9ff;border-color:#d9c2ff'
      : 'color:#1d4ed8;background:#e5efff;border-color:#bfd7ff';
    return '<span class="pill" style="' + vars + '">' + known.toUpperCase() + '</span>';
  }
  function pendingTab() {
    var list = pendingRequests().slice().sort(function (a, b) { return a.submittedAt - b.submittedAt; });
    if (!list.length) {
      return emptyState('check', "You're all caught up", 'New access requests from students and faculty will show up here.');
    }
    var C = 'grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1.6fr)_100px_minmax(0,1.6fr)]';
    return '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[720px] rounded-2xl border border-line bg-card overflow-hidden">' +
      '<div class="grid ' + C + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>Name</span><span>Role</span><span>Email</span><span>Requested</span><span class="text-right">Action</span></div>' +
      list.map(function (r) {
        return '<div class="grid ' + C + ' gap-3 px-4 py-3.5 items-center text-[13px] border-t border-line">' +
          '<span class="truncate font-medium">' + esc(r.name) +
          (r.college ? '<span class="block text-[11px] text-muted">' + esc(r.college) + '</span>' : '') + '</span>' +
          '<span>' + rolePill(r.role) + '</span>' +
          '<span class="truncate text-muted">' + esc(r.email) +
          (r.idNumber ? '<span class="block text-[11px]">ID: ' + esc(r.idNumber) + '</span>' : '') + '</span>' +
          '<span class="text-muted">' + esc(fmtWhen(r.submittedAt)) + '</span>' +
          '<div class="flex justify-end gap-2">' +
          '<button class="btn btn-primary btn-sm" data-action="approve-request" data-id="' + r.id + '">' + icon('check', 'w-3.5 h-3.5') + 'Approve</button>' +
          '<button class="btn btn-danger btn-sm" data-action="reject-request" data-id="' + r.id + '">' + icon('x', 'w-3.5 h-3.5') + 'Reject</button></div></div>';
      }).join('') + '</div></div>';
  }
  function accountsTab() {
    var list = db.accounts.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) {
      return emptyState('userplus', 'No accounts yet', 'Approve a pending request and it will show up here as an active account.');
    }
    var C = 'grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1.6fr)_110px_44px]';
    return '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[680px] rounded-2xl border border-line bg-card overflow-hidden">' +
      '<div class="grid ' + C + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>Name</span><span>Role</span><span>Email</span><span>Status</span><span></span></div>' +
      list.map(function (a) {
        return '<div class="grid ' + C + ' gap-3 px-4 py-3.5 items-center text-[13px] border-t border-line">' +
          '<span class="truncate font-medium">' + esc(a.name) + '</span>' +
          '<span>' + rolePill(a.role) + '</span>' +
          '<span class="truncate text-muted">' + esc(a.email) + '</span>' +
          '<span>' + pill(a.status === 'revoked' ? 'revoked' : 'active') + '</span>' +
          '<button class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-tint text-muted" data-action="open-account" data-id="' + a.id + '" aria-label="Manage ' + esc(a.name) + '">\u22ee</button></div>';
      }).join('') + '</div></div>';
  }
  var COURSES = ['BS Computer Science', 'BS Education', 'BS Engineering', 'BS Information Technology', 'BS Multimedia Arts'];
  function roleToggle(key, label, active) {
    return '<button data-action="users-role" data-value="' + key + '" aria-pressed="' + active + '" class="px-4 py-2 rounded-xl text-sm font-semibold border ' +
      (active ? 'bg-[color:var(--btn-bg)] text-white border-transparent' : 'bg-card text-ink border-line hover:bg-tint') + '">' + label + '</button>';
  }
  function viewUsers() {
    var accounts = db.accounts;
    var roleFilter = state.filter.usersRole, course = state.filter.usersCourse, q = state.q.users.trim().toLowerCase();
    var cards = [
      ['Total users', accounts.length, false],
      ['Students', accounts.filter(function (a) { return a.role === 'student'; }).length, false],
      ['Faculty', accounts.filter(function (a) { return a.role === 'faculty'; }).length, false],
      ['With overdue returns', accounts.filter(function (a) { return userStatus(a) === 'overdue'; }).length, true]
    ];
    var rows = accounts.filter(function (a) {
      return (roleFilter === 'all' || a.role === roleFilter) &&
        (course === 'all' || a.course === course) &&
        (!q || (a.name + ' ' + a.email).toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var courseOptions = '<option value="all">All courses</option>' + COURSES.map(function (c) {
      return '<option value="' + esc(c) + '"' + (course === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    var table;
    if (rows.length) {
      var C = 'grid-cols-[minmax(0,1.6fr)_110px_minmax(0,1.5fr)_90px_120px_minmax(0,1.6fr)]';
      table = '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[900px] rounded-2xl border border-line bg-card overflow-hidden">' +
        '<div class="grid ' + C + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>User</span><span>Category</span><span>Course / Department</span><span>Items out</span><span>Status</span><span class="text-right">Actions</span></div>' +
        rows.map(function (a) {
          var st = userStatus(a), summary = userSummary(a);
          var disabled = a.status === 'revoked';
          return '<div class="grid ' + C + ' gap-3 px-4 py-3.5 items-center text-[13px] border-t border-line hover:bg-tint cursor-pointer" data-action="open-user" data-id="' + a.id + '">' +
            '<span class="flex items-center gap-3 min-w-0">' +
            userAvatar(a, 'w-9 h-9', 'text-xs') +
            '<span class="min-w-0"><span class="block font-medium truncate">' + esc(a.name) + '</span><span class="block text-[11px] text-muted truncate">' + esc(a.email) + '</span></span></span>' +
            '<span>' + rolePill(a.role) + '</span>' +
            '<span class="truncate text-muted">' + esc(a.course || '\u2014') + '</span>' +
            '<span class="tnum">' + summary.itemsOut + '</span>' +
            '<span>' + pill(st) + '</span>' +
            '<span class="flex items-center justify-end gap-2" data-stop-row>' +
            '<button class="btn btn-ghost btn-sm" data-action="reset-user-password" data-id="' + a.id + '">' + icon('key', 'w-3.5 h-3.5') + 'Reset password</button>' +
            '<button class="btn ' + (disabled ? 'btn-ghost' : 'btn-danger') + ' btn-sm" data-action="' + (disabled ? 'restore-account' : 'revoke-account') + '" data-id="' + a.id + '">' + (disabled ? 'Enable account' : 'Disable account') + '</button>' +
            '<button class="btn btn-danger btn-sm" data-action="delete-user-account" data-id="' + a.id + '">' + icon('trash', 'w-3.5 h-3.5') + 'Delete</button>' +
            '</span></div>';
        }).join('') + '</div></div>';
    } else if (!accounts.length) {
      table = emptyState('users', 'No users yet', 'Once you approve an account request, that person shows up here.');
    } else {
      table = emptyState('search', 'No matching users', 'Try another search or switch the filters back to All.');
    }

    return pageHeader('Users', 'Everyone who can borrow equipment, by category and course.') +
      '<div class="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">' +
      cards.map(function (c) {
        return '<div class="rounded-2xl bg-card border border-line shadow-soft px-5 py-5">' +
          '<span class="block font-display font-medium text-[2.2rem] leading-none tnum ' + (c[2] ? 't-bad' : 'text-brand-deep') + '">' + c[1] + '</span>' +
          '<span class="block mt-2.5 text-sm text-muted">' + c[0] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="mt-6 flex flex-wrap items-center gap-2">' +
      roleToggle('all', 'All', roleFilter === 'all') + roleToggle('student', 'Students', roleFilter === 'student') + roleToggle('faculty', 'Faculty', roleFilter === 'faculty') +
      '<select data-action="users-course" class="field w-auto ml-auto">' + courseOptions + '</select>' +
      searchBox('users', 'Search name or email') +
      '</div>' +
      '<div class="mt-5">' + table + '</div>' +
      '<p class="mt-3 text-xs text-muted">Showing ' + rows.length + ' of ' + accounts.length + ' users</p>';
  }

  function viewRequests() {
    var tab = state.tab.requests;
    var pendingCount = pendingRequests().length, accountsCount = db.accounts.length;
    var tabBtn = function (key, label, count) {
      var on = tab === key;
      return '<button data-action="requests-tab" data-tab="' + key + '" aria-pressed="' + on + '" class="px-4 py-2 rounded-xl text-sm font-semibold ' +
        (on ? 'bg-card shadow-soft' : 'text-muted hover:text-ink') + '">' + label + ' (' + count + ')</button>';
    };
    return pageHeader('Requests & accounts', 'Review access requests and manage who can sign in.') +
      '<div class="mt-8 inline-flex gap-1 p-1 rounded-2xl" style="background:var(--bar-track)">' +
      tabBtn('pending', 'Pending', pendingCount) + tabBtn('accounts', 'Accounts', accountsCount) + '</div>' +
      '<div class="mt-5">' + (tab === 'accounts' ? accountsTab() : pendingTab()) + '</div>';
  }


  function viewInventory() {
    var q = state.q.inventory.trim().toLowerCase(), f = state.filter.inventory;
    var all = db.equipment;
    var counts = { all: all.length, available: 0, borrowed: 0, maintenance: 0 };
    all.forEach(function (e) { counts[itemStatus(e)]++; });
    var rows = all.filter(function (e) {
      return (f === 'all' || itemStatus(e) === f) &&
        (!q || (e.name + ' ' + e.category + ' ' + e.tag).toLowerCase().indexOf(q) !== -1);
    });
    var C = 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.7fr)]';
    var table = '';
    if (rows.length) {
      table = '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[760px] rounded-2xl border border-line bg-card overflow-hidden">' +
        '<div class="grid ' + C + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>Equipment</span><span>Category</span><span>Status</span><span class="text-right">Actions</span></div>' +
        rows.map(function (e) {
          var st = itemStatus(e), al = activeLoanFor(e.id), sub = '';
          if (al) sub = '<p class="mt-1 text-[11px] ' + (loanStatus(al) === 'overdue' ? 't-bad font-semibold' : 'text-muted') + '">' + esc(al.borrower) + ' · due ' + fmt(al.end) + '</p>';
          var acts, qrBtn = '<button class="btn btn-ghost btn-sm" data-action="qr" data-id="' + e.id + '" aria-label="Print QR label for ' + esc(e.name) + '">' + icon('qr', 'w-3.5 h-3.5') + '</button>';
          if (st === 'borrowed') acts = '<button class="btn btn-ghost btn-sm" data-action="return" data-id="' + al.id + '">' + icon('undo', 'w-3.5 h-3.5') + 'Mark returned</button>' + qrBtn;
          else if (st === 'available') acts = '<button class="btn btn-ghost btn-sm" data-action="maintenance-on" data-id="' + e.id + '">' + icon('wrench', 'w-3.5 h-3.5') + 'Maintenance</button>' +
            qrBtn + '<button class="btn btn-ghost btn-sm" data-action="delete-item" data-id="' + e.id + '" aria-label="Remove ' + esc(e.name) + '">' + icon('trash', 'w-3.5 h-3.5') + '</button>';
          else acts = '<button class="btn btn-ghost btn-sm" data-action="maintenance-off" data-id="' + e.id + '">Back in service</button>' +
            qrBtn + '<button class="btn btn-ghost btn-sm" data-action="delete-item" data-id="' + e.id + '" aria-label="Remove ' + esc(e.name) + '">' + icon('trash', 'w-3.5 h-3.5') + '</button>';
          return '<div class="grid ' + C + ' gap-3 px-4 py-3 items-center text-[13px] border-t border-line">' +
            '<span class="flex items-center gap-3 min-w-0">' + mediaTile(e, 'w-9 h-9') + '<span class="min-w-0"><span class="block font-medium truncate">' + esc(e.name) + '</span><span class="block text-[11px] text-muted">' + esc(e.tag) + '</span></span></span>' +
            '<span class="text-muted">' + esc(e.category) + '</span>' +
            '<span><span>' + pill(st) + '</span>' + sub + '</span>' +
            '<span class="flex items-center justify-end gap-2">' + acts + '</span></div>';
        }).join('') + '</div></div>';
    } else if (!all.length) {
      table = emptyState('archive', 'Your inventory is empty', 'Add the equipment people can borrow. Everything on the dashboard updates as you go.',
        '<button class="btn btn-primary" data-action="open-add">' + icon('plus', 'w-4 h-4') + 'Add equipment</button>');
    } else {
      table = emptyState('search', 'No matching equipment', 'Try a different search or switch the filter back to All.');
    }
    return pageHeader('Inventory', plural(all.length, 'item') + ' registered. Track what is out, in, and being repaired.',
      '<button class="btn btn-primary" data-action="open-add">' + icon('plus', 'w-4 h-4') + 'Add equipment</button>') +
      '<div class="mt-8 flex flex-wrap items-center gap-2">' + searchBox('inventory', 'Search equipment') +
      chip('All', counts.all, f === 'all', 'inv-filter', 'all') + chip('Available', counts.available, f === 'available', 'inv-filter', 'available') +
      chip('Borrowed', counts.borrowed, f === 'borrowed', 'inv-filter', 'borrowed') + chip('Maintenance', counts.maintenance, f === 'maintenance', 'inv-filter', 'maintenance') +
      '</div><div class="mt-5">' + table + '</div>';
  }

  function viewHistory() {
    var q = state.q.history.trim().toLowerCase(), f = state.filter.history;
    var loans = db.loans.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    var counts = { all: loans.length, active: 0, pending: 0, overdue: 0, returned: 0, rejected: 0 };
    loans.forEach(function (l) {
      var st = loanStatus(l);
      if (st === 'approved' || st === 'overdue') counts.active++;
      if (counts[st] != null) counts[st]++;
    });
    var rows = loans.filter(function (l) {
      var st = loanStatus(l);
      var ok = f === 'all' || (f === 'active' ? (st === 'approved' || st === 'overdue') : st === f);
      return ok && (!q || (l.name + ' ' + l.borrower).toLowerCase().indexOf(q) !== -1);
    });
    var C = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_104px]';
    var table;
    if (rows.length) {
      table = '<div class="overflow-x-auto rounded-2xl shadow-soft"><div class="min-w-[640px] rounded-2xl border border-line bg-card overflow-hidden">' +
        '<div class="grid ' + C + ' gap-3 px-4 py-3 bg-head text-[13px] font-bold"><span>Equipment</span><span>Borrower</span><span>Dates</span><span class="text-center">Status</span></div>' +
        rows.map(function (l) {
          var st = loanStatus(l);
          return '<div class="grid ' + C + ' gap-3 px-4 py-3.5 items-center text-[13px] border-t border-line">' +
            '<span class="truncate font-medium">' + esc(l.name) + '</span><span class="truncate">' + esc(l.borrower) + '</span>' +
            '<span class="tnum text-muted">' + fmt(l.start) + ' → ' + fmt(l.end) + '</span>' +
            '<span class="text-center">' + pill(st) + '</span></div>';
        }).join('') + '</div></div>';
    } else {
      table = loans.length ? emptyState('search', 'Nothing matches', 'Try another search or clear the filter to see every borrow.')
        : emptyState('scroll', 'No borrowing history yet', 'Every request, approval and return is recorded here.');
    }
    return pageHeader('Borrowing history', 'Every request, approval and return, newest first.') +
      '<div class="mt-8 flex flex-wrap items-center gap-2">' + searchBox('history', 'Search item or borrower') +
      chip('All', counts.all, f === 'all', 'hist-filter', 'all') + chip('Active', counts.active, f === 'active', 'hist-filter', 'active') +
      chip('Pending', counts.pending, f === 'pending', 'hist-filter', 'pending') + chip('Overdue', counts.overdue, f === 'overdue', 'hist-filter', 'overdue') +
      chip('Returned', counts.returned, f === 'returned', 'hist-filter', 'returned') + chip('Rejected', counts.rejected, f === 'rejected', 'hist-filter', 'rejected') +
      '</div><div class="mt-5">' + table + '</div>';
  }

  function viewNotifications() {
    var notes = buildNotifications();
    var urgent = notes.filter(function (n) { return n.sev <= 1; }).length;
    var body;
    if (!notes.length) body = emptyState('bell', 'Nothing needs your attention', 'Overdue items, due dates, new requests and repairs will show up here.');
    else body = '<div class="grid gap-3">' + notes.map(function (n) {
      var act = '';
      if (n.action) act = '<button class="btn btn-ghost btn-sm ml-auto" data-action="' + n.action.act + '"' +
        (n.action.id ? ' data-id="' + n.action.id + '"' : '') + (n.action.view ? ' data-view="' + n.action.view + '"' : '') + '>' + n.action.label + '</button>';
      return '<div class="rounded-2xl bg-card border border-line shadow-soft p-4 flex items-center gap-4">' +
        '<span class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style="background:var(--' + n.tone + '-bg);color:var(--' + n.tone + '-fg)">' + icon(n.icon, 'w-5 h-5') + '</span>' +
        '<div class="min-w-0"><p class="font-semibold text-[15px] leading-snug">' + esc(n.title) + '</p><p class="text-sm text-muted mt-0.5">' + esc(n.body) + '</p></div>' + act + '</div>';
    }).join('') + '</div>';
    return pageHeader('Notifications', urgent ? plural(urgent, 'item') + ' need your attention.' : 'Nothing urgent right now.') + '<div class="mt-8">' + body + '</div>';
  }

  function detailRow(label, valueHtml) {
    return '<div class="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line last:border-b-0 text-sm">' +
      '<span class="text-muted">' + esc(label) + '</span><span class="font-medium text-right">' + valueHtml + '</span></div>';
  }
  function viewProfile() {
    var p = profileData();
    return pageHeader('Profile', 'View and manage your account details.') +
      '<div class="mt-8 grid gap-5 max-w-2xl">' +

      '<div class="rounded-2xl bg-card border border-line shadow-soft p-5 flex flex-wrap items-center gap-4">' +
      '<button class="relative shrink-0" data-action="open-edit-profile" aria-label="Change profile picture">' +
      (p.photo
        ? '<span class="block w-16 h-16 rounded-full overflow-hidden"><img src="' + p.photo + '" alt="" class="w-full h-full object-cover"></span>'
        : '<span class="flex w-16 h-16 rounded-full items-center justify-center font-display font-bold text-xl text-white" style="background:var(--btn-bg)">' + esc(initials(p.name)) + '</span>') +
      '<span class="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-card border border-line flex items-center justify-center text-brand shadow-soft">' + icon('pencil', 'w-3 h-3') + '</span>' +
      '</button>' +
      '<div class="min-w-0 flex-1">' +
      '<p class="font-display font-bold text-lg">' + esc(p.name) + '</p>' +
      '<span class="pill mt-1.5 inline-flex" style="color:var(--ok-fg);background:var(--ok-bg);border-color:var(--ok-bd)">Administrator</span>' +
      '<p class="text-xs text-muted mt-2">' + esc(p.email) + ' \u00b7 Member since ' + esc(p.memberSince) + '</p></div>' +
      '<button class="btn btn-ghost" data-action="open-edit-profile">' + icon('pencil', 'w-4 h-4') + 'Edit profile</button></div>' +

      '<div class="rounded-2xl bg-card border border-line shadow-soft overflow-hidden">' +
      detailRow('Full name', esc(p.name)) + detailRow('Role', esc(p.role)) +
      detailRow('Email', '<a href="mailto:' + esc(p.email) + '" class="underline underline-offset-2">' + esc(p.email) + '</a>') +
      '</div>' +

      '<div>' + sectionHead('Security') +
      '<div class="rounded-2xl bg-card border border-line shadow-soft p-4 flex flex-wrap items-center justify-between gap-3">' +
      '<div><p class="font-semibold text-sm">Password</p><p class="text-xs text-muted mt-0.5">Managed by Firebase Authentication</p></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="open-change-password">Reset password</button></div>' +
      '<div class="rounded-2xl bg-card border border-line shadow-soft p-4 flex flex-wrap items-center justify-between gap-3 mt-3">' +
      '<div><p class="font-semibold text-sm">Signed in as</p><p class="text-xs text-muted mt-0.5">' + esc(currentUser ? currentUser.email : '') + '</p></div>' +
      '<button class="btn btn-danger btn-sm" data-action="sign-out">Sign out</button></div></div>' +

      '</div>';
  }

  var VIEWS = { dashboard: viewDashboard, approvals: viewApprovals, requests: viewRequests, inventory: viewInventory, users: viewUsers, history: viewHistory, notifications: viewNotifications, profile: viewProfile };

  /* ---------- render ---------- */
  function centerScreen(inner) {
    return '<div class="min-h-screen flex items-center justify-center p-6 text-center">' + inner + '</div>';
  }
  function render() {
    if (syncError) {
      app.innerHTML = centerScreen(
        '<div class="max-w-sm"><p class="font-display font-bold text-xl">Can\u2019t reach Firebase</p>' +
        '<p class="text-sm text-muted mt-2">' + esc(syncError.message || 'Check your connection and try again.') + '</p>' +
        '<p class="text-xs text-muted mt-4">If this keeps happening, double-check firebase-config.js and your Firestore security rules.</p></div>');
      return;
    }
    if (!allLoaded()) {
      app.innerHTML = centerScreen('<p class="text-sm text-muted">Connecting to Firebase\u2026</p>');
      return;
    }
    var a = document.activeElement;
    var keep = (a && a.matches && a.matches('input[data-search]')) ? { id: a.id, pos: a.selectionStart } : null;
    var changed = state.lastView !== state.view;
    state.lastView = state.view;
    app.innerHTML =
      (state.sidebarOpen ? '<div data-action="toggle-sidebar" class="fixed inset-0 z-30 bg-black/40 lg:hidden"></div>' : '') +
      sidebar() +
      '<div class="lg:pl-[266px] min-h-full">' + mobileBar() +
      '<main class="' + (changed ? 'view-enter ' : '') + 'px-5 sm:px-8 lg:px-12 xl:px-16 pt-8 lg:pt-14 pb-28 max-w-[2000px]">' + VIEWS[state.view]() + '</main></div>';
    if (keep) {
      var el = document.getElementById(keep.id);
      if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* ignore */ } }
    }
    if (changed) window.scrollTo(0, 0);
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, tone) {
    var el = $('#toast-root');
    var bad = tone === 'bad';
    el.innerHTML = '<div class="pop fixed left-1/2 -translate-x-1/2 z-[60] max-w-[calc(100vw-2rem)] rounded-xl px-4 py-3 text-sm font-medium shadow-2xl flex items-center gap-2" role="status" ' +
      'style="bottom:calc(1.5rem + env(safe-area-inset-bottom,0px));background:' + (bad ? 'var(--bad-fg)' : '#0e4f44') + ';color:#fff">' +
      icon(bad ? 'alert' : 'check', 'w-4 h-4 shrink-0') + '<span>' + esc(msg) + '</span></div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.innerHTML = ''; }, 3200);
  }

  /* ---------- actions ----------
     Every action writes straight to Firestore. The onSnapshot listeners above
     pick the change up (on THIS device and every other device watching the
     same project) and call render() automatically, so there is no local
     mutate-then-render step any more. */
  function fail(msg) { return function (err) { toast(msg + ': ' + err.message, 'bad'); }; }

  function approve(id) {
    var l = db.loans.find(function (x) { return x.id === id; });
    if (!l || l.status !== 'pending') return;
    var e = eqById(l.equipmentId);
    if (!e) { toast('That item is no longer in the inventory.', 'bad'); return; }
    if (e.maintenance) { toast(e.name + ' is in maintenance and cannot be lent.', 'bad'); return; }
    var cur = activeLoanFor(e.id);
    if (cur) { toast(e.name + ' is still on loan until ' + fmt(cur.end) + '. Mark it returned first.', 'bad'); return; }
    loansCol.doc(id).update({ status: 'approved', updatedAt: Date.now() })
      .then(function () { toast('Approved ' + e.name + ' for ' + l.borrower + '.'); })
      .catch(fail('Could not approve the request'));
  }
  function reject(id) {
    var l = db.loans.find(function (x) { return x.id === id; });
    if (!l || l.status !== 'pending') return;
    loansCol.doc(id).update({ status: 'rejected', updatedAt: Date.now() })
      .then(function () { toast('Rejected the request from ' + l.borrower + '.'); })
      .catch(fail('Could not reject the request'));
  }
  function approveRequest(id) {
    var r = db.accountRequests.find(function (x) { return x.id === id; });
    if (!r || r.status !== 'pending') return;
    openModal({ type: 'approve-account', id: id });
  }
  function submitApproveRequest(form) {
    var requestId = form.dataset.requestId;
    var r = db.accountRequests.find(function (x) { return x.id === requestId; });
    if (!r || r.status !== 'pending') {
      return formError('This account request is no longer awaiting approval.');
    }
    if (!r.authUid) return formError('This request was created before the free-plan account flow. Ask the user to submit a new request.');
    var password = String(new FormData(form).get('temporaryPassword') || '');
    if (password.length < 8 || password.length > 128) {
      return formError('Temporary password must be between 8 and 128 characters.');
    }
    var submitButton = form.querySelector('button[type=submit]');
    if (submitButton) submitButton.disabled = true;
    var endpoint = String(window.LENDY_APPROVAL_API_URL || '').trim().replace(/\/+$/, '');
    if (!endpoint) {
      if (submitButton) submitButton.disabled = false;
      return formError('The account approval service URL is not configured. Follow FIREBASE_SETUP.md.');
    }
    auth.currentUser.getIdToken()
      .then(function (idToken) {
        return fetch(endpoint + '/approve-account', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + idToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requestId: requestId, temporaryPassword: password })
        });
      })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.error || 'Approval service returned HTTP ' + response.status + '.');
          return body;
        });
      })
      .then(function () {
        closeModal();
        render();
        toast('Approved the account. The temporary password is now available in the user’s app.');
      })
      .catch(function (err) {
        if (submitButton) submitButton.disabled = false;
        formError('Could not finish approval: ' + err.message);
      });
  }
  function rejectRequest(id) {
    var r = db.accountRequests.find(function (x) { return x.id === id; });
    if (!r || r.status !== 'pending') return;
    requestsCol.doc(id).update({ status: 'rejected', updatedAt: Date.now() })
      .then(function () { toast('Rejected the request from ' + r.name + '.'); })
      .catch(fail('Could not reject the request'));
  }
  function setAccountStatus(id, statusValue) {
    var a = db.accounts.find(function (x) { return x.id === id; });
    if (!a) return;
    accountsCol.doc(id).update({ status: statusValue })
      .then(function () { toast(statusValue === 'revoked' ? 'Revoked access for ' + a.name + '.' : 'Restored access for ' + a.name + '.'); })
      .catch(fail('Could not update the account'));
  }
  function requestAccountDeletion(id) {
    var a = db.accounts.find(function (x) { return x.id === id; });
    if (!a) return;
    pendingConfirm = function () { deleteUserAccount(id); };
    openModal({
      type: 'confirm',
      title: 'Permanently delete ' + a.name + '\u2019s account?',
      body: 'This deletes the sign-in account, profile, account requests, and linked borrowing records. Unlinked legacy loans are deleted only when this name belongs to one account; ambiguous records are kept to protect other users\u2019 history. This cannot be undone.',
      label: 'Delete permanently',
      danger: true
    });
  }
  function deleteUserAccount(id) {
    var a = db.accounts.find(function (x) { return x.id === id; });
    if (!a) {
      toast('Could not delete the account: it is no longer available.', 'bad');
      return;
    }
    if (currentUser && currentUser.uid === id) {
      toast('You cannot delete your own admin account.', 'bad');
      return;
    }
    var endpoint = String(window.LENDY_APPROVAL_API_URL || '').trim().replace(/\/+$/, '');
    if (!endpoint) {
      toast('Could not delete the account: the account service URL is not configured.', 'bad');
      return;
    }
    if (!auth.currentUser) {
      toast('Could not delete the account: the admin session has expired. Sign in again.', 'bad');
      return;
    }
    auth.currentUser.getIdToken()
      .then(function (idToken) {
        return fetch(endpoint + '/delete-account', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + idToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ accountId: id })
        });
      })
      .then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error(body.error || 'Account service returned HTTP ' + response.status + '.');
          return body;
        });
      })
      .then(function (result) {
        closeModal();
        if (result.ambiguousLegacyLoans) {
          toast('Deleted ' + a.name + '\u2019s account. ' + result.ambiguousLegacyLoans + ' unlinked legacy loan(s) were kept because the borrower name is shared.');
        } else {
          toast('Deleted ' + a.name + '\u2019s account and ' + result.deletedLoans + ' loan record(s).');
        }
      })
      .catch(fail('Could not delete the account'));
  }
  function markReturned(id) {
    var l = db.loans.find(function (x) { return x.id === id; });
    if (!l || l.status !== 'approved') return;
    loansCol.doc(id).update({ status: 'returned', returnedOn: today(), updatedAt: Date.now() })
      .then(function () { toast(l.name + ' marked as returned.'); })
      .catch(fail('Could not mark it returned'));
  }
  function setMaintenance(id, on) {
    var e = eqById(id); if (!e) return;
    if (on && activeLoanFor(id)) { toast('Return ' + e.name + ' before sending it to maintenance.', 'bad'); return; }
    equipmentCol.doc(id).update({ maintenance: on })
      .then(function () { toast(on ? e.name + ' moved to maintenance.' : e.name + ' is back in service.'); })
      .catch(fail('Could not update the item'));
  }
  function deleteItem(id) {
    var e = eqById(id); if (!e || activeLoanFor(id)) return;
    var batch = fsdb.batch();
    db.loans.forEach(function (l) {
      if (l.equipmentId === id && l.status === 'pending') batch.update(loansCol.doc(l.id), { status: 'rejected', updatedAt: Date.now() });
    });
    batch.delete(equipmentCol.doc(id));
    batch.commit()
      .then(function () { toast('Removed ' + e.name + ' from the inventory.'); })
      .catch(fail('Could not remove the item'));
  }

  /* ---------- modals ---------- */
  var modalHead = function (title, sub) {
    return '<div class="flex items-start justify-between gap-4"><div><h2 class="font-display font-bold text-xl xl:text-2xl">' + title + '</h2>' +
      (sub ? '<p class="text-sm text-muted mt-1">' + sub + '</p>' : '') + '</div>' +
      '<button data-action="close-modal" class="w-8 h-8 -mr-2 -mt-1 rounded-lg flex items-center justify-center text-muted hover:bg-tint" aria-label="Close">' + icon('x', 'w-4 h-4') + '</button></div>';
  };

  function requestForm(m) {
    var avail = db.equipment.filter(function (e) { return itemStatus(e) === 'available'; });
    if (!avail.length) {
      return modalHead('New borrow request') +
        '<p class="text-sm text-muted mt-3">' + (db.equipment.length ? 'Nothing is available to borrow right now. Mark an item returned or bring one back from maintenance.' : 'There is no equipment yet. Add an item first.') + '</p>' +
        '<div class="mt-5 flex justify-end gap-2"><button class="btn btn-ghost" data-action="close-modal">Close</button>' +
        (!db.equipment.length ? '<button class="btn btn-primary" data-action="open-add">Add equipment</button>' : '') + '</div>';
    }
    var t = today();
    return modalHead('New borrow request', 'Requests go to the approval queue unless you approve them now.') +
      '<form data-form="request" novalidate class="mt-5 grid gap-4">' +
      '<div><label class="lbl" for="f-item">Equipment</label><select id="f-item" name="equipmentId" class="field">' +
      avail.map(function (e) { return '<option value="' + e.id + '"' + (e.id === m.prefill ? ' selected' : '') + '>' + esc(e.name) + ' (' + esc(e.tag) + ')</option>'; }).join('') + '</select></div>' +
      '<div><label class="lbl" for="f-borrower">Borrower</label><input id="f-borrower" name="borrower" class="field" placeholder="Student or faculty name" maxlength="60" autocomplete="off"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
      '<div><label class="lbl" for="f-start">Borrow from</label><input id="f-start" name="start" type="date" class="field" value="' + t + '" min="' + t + '"></div>' +
      '<div><label class="lbl" for="f-end">Return by</label><input id="f-end" name="end" type="date" class="field" value="' + addDays(t, 3) + '" min="' + t + '"></div></div>' +
      '<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="instant" class="w-4 h-4" style="accent-color:var(--brand)"> Approve now (walk-up checkout)</label>' +
      '<p id="form-error" class="text-sm t-bad min-h-[1.25rem]" role="alert"></p>' +
      '<div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Create request</button></div></form>';
  }
  function addForm() {
    return modalHead('Add equipment', 'New items start as available.') +
      '<form data-form="add" novalidate class="mt-5 grid gap-4">' +
      '<div><label class="lbl" for="f-name">Name</label><input id="f-name" name="name" class="field" placeholder="e.g. Sony A7 Camera" maxlength="60" autocomplete="off"></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
      '<div><label class="lbl" for="f-cat">Category</label><select id="f-cat" name="category" class="field">' +
      Object.keys(CATEGORIES).map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="lbl" for="f-tag">Asset tag <span class="font-normal">(optional)</span></label><input id="f-tag" name="tag" class="field" placeholder="Auto-generated" maxlength="16" autocomplete="off"></div></div>' +
      '<div><label class="lbl" for="f-image">Photo <span class="font-normal">(optional)</span></label>' +
      '<div class="flex items-center gap-3">' +
      '<span id="image-preview" class="shrink-0 w-14 h-14 rounded-xl bg-tint text-brand flex items-center justify-center overflow-hidden">' + icon('box', 'w-6 h-6') + '</span>' +
      '<input id="f-image" name="image" type="file" accept="image/*" class="field" style="padding:.5rem .7rem"></div>' +
      '<p class="text-[11px] text-muted mt-1.5">JPG or PNG. It\u2019s resized automatically before saving.</p></div>' +
      '<p id="form-error" class="text-sm t-bad min-h-[1.25rem]" role="alert"></p>' +
      '<div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Add equipment</button></div></form>';
  }
  function confirmBody(m) {
    return modalHead(esc(m.title)) + '<p class="text-sm text-muted mt-3">' + esc(m.body) + '</p>' +
      '<div class="mt-6 flex justify-end gap-2"><button class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
      '<button class="btn ' + (m.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm-yes">' + esc(m.label) + '</button></div>';
  }
  function approveAccountForm(m) {
    var request = db.accountRequests.find(function (x) { return x.id === m.id; });
    if (!request || request.status !== 'pending') {
      return modalHead('Request unavailable') +
        '<p class="text-sm text-muted mt-3">This account request is no longer awaiting approval.</p>' +
        '<div class="mt-6 flex justify-end"><button class="btn btn-ghost" data-action="close-modal">Close</button></div>';
    }
    return modalHead('Approve account',
      'Set a temporary password for ' + esc(request.name) + '.') +
      '<p class="text-sm text-muted mt-3">After approval, the user will see the temporary password in the mobile app and must change it after signing in.</p>' +
      '<form data-form="approve-account" data-request-id="' + esc(request.id) + '" novalidate class="mt-5 grid gap-4">' +
      '<div><label class="lbl" for="approval-password">Temporary password</label>' +
      '<input id="approval-password" name="temporaryPassword" type="text" class="field" minlength="8" maxlength="128" autocomplete="off" required>' +
      '<p class="text-[11px] text-muted mt-1">Use 8 to 128 characters. The user must change it at first login.</p></div>' +
      '<p id="form-error" class="text-sm t-bad min-h-[1.25rem]" role="alert"></p>' +
      '<div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Approve and show password</button></div></form>';
  }
  function itemUrl(id) {
    // item.html lives next to index.html, so this works wherever the app is hosted.
    return location.href.replace(/[^/]*$/, '') + 'item.html?id=' + encodeURIComponent(id);
  }
  function qrBody(m) {
    var e = eqById(m.id);
    if (!e) return modalHead('Item not found') + '<p class="text-sm text-muted mt-3">This item may have been removed from the inventory.</p>' +
      '<div class="mt-6 flex justify-end"><button class="btn btn-ghost" data-action="close-modal">Close</button></div>';
    var url = itemUrl(e.id);
    var qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(url);
    return modalHead('QR label', m.justAdded ? e.name + ' was added \u2014 print this and stick it on the item.' : 'Print this and stick it on the item.') +
      '<div class="qr-print mt-4 flex flex-col items-center text-center gap-2 rounded-2xl border border-line p-5">' +
      '<img src="' + qrImg + '" alt="QR code for ' + esc(e.name) + '" class="w-44 h-44 rounded-lg" width="176" height="176">' +
      '<p class="font-display font-bold mt-1">' + esc(e.name) + '</p>' +
      '<p class="text-xs text-muted">' + esc(e.tag) + '</p></div>' +
      '<p class="text-xs text-muted mt-3 break-all">' + esc(url) + '</p>' +
      '<div class="mt-5 flex flex-wrap justify-end gap-2">' +
      '<a class="btn btn-ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Open item page</a>' +
      '<button type="button" class="btn btn-primary" data-action="print-qr">Print label</button></div>';
  }
  function editProfileForm() {
    var p = profileData();
    return modalHead('Edit profile') +
      '<form data-form="edit-profile" novalidate class="mt-5 grid gap-4">' +
      '<div><label class="lbl" for="p-photo">Profile picture</label>' +
      '<div class="flex items-center gap-3">' +
      '<span id="profile-photo-preview" class="shrink-0 w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-white font-display font-bold" style="background:var(--btn-bg)">' +
      (p.photo ? '<img src="' + p.photo + '" alt="" class="w-full h-full object-cover">' : esc(initials(p.name))) + '</span>' +
      '<input id="p-photo" name="photo" type="file" accept="image/*" class="field" style="padding:.5rem .7rem"></div>' +
      '<p class="text-[11px] text-muted mt-1.5">JPG or PNG, resized automatically.</p></div>' +
      '<div><label class="lbl" for="p-name">Full name</label><input id="p-name" name="name" class="field" value="' + esc(p.name) + '" maxlength="60" autocomplete="off"></div>' +
      '<p class="text-xs text-muted">Account email: ' + esc(p.email) + '</p>' +
      '<p id="form-error" class="text-sm t-bad min-h-[1.25rem]" role="alert"></p>' +
      '<div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></form>';
  }
  function changePasswordBody() {
    return modalHead('Change password') +
      '<p class="text-sm text-muted mt-3">Send a password reset link to ' + esc(currentUser.email || 'your account email') + '.</p>' +
      '<div class="mt-6 flex justify-end gap-2"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="send-password-reset">Send reset link</button></div>';
  }
  function accountBody(m) {
    var a = db.accounts.find(function (x) { return x.id === m.id; });
    if (!a) return modalHead('Account not found') + '<p class="text-sm text-muted mt-3">This account may have already been removed.</p>' +
      '<div class="mt-6 flex justify-end"><button class="btn btn-ghost" data-action="close-modal">Close</button></div>';
    var revoked = a.status === 'revoked';
    return modalHead(a.name, esc(a.email)) +
      '<div class="mt-4 flex flex-wrap items-center gap-2">' + rolePill(a.role) + pill(revoked ? 'revoked' : 'active') + '</div>' +
      '<div class="mt-4 rounded-xl border border-line p-3 flex items-center justify-between">' +
      '<span class="text-xs text-muted">Access code</span><span class="font-display font-bold tracking-widest">' + esc(a.code) + '</span></div>' +
      '<div class="mt-6 flex flex-wrap justify-end gap-2">' +
      '<button class="btn btn-ghost" data-action="' + (revoked ? 'restore-account' : 'revoke-account') + '" data-id="' + a.id + '">' + (revoked ? 'Restore access' : 'Revoke access') + '</button>' +
      '<button class="btn btn-danger" data-action="delete-user-account" data-id="' + a.id + '">Delete account</button></div>';
  }
  function userDetailBody(m) {
    var a = db.accounts.find(function (x) { return x.id === m.id; });
    if (!a) return modalHead('User not found') + '<p class="text-sm text-muted mt-3">This account may have already been removed.</p>' +
      '<div class="mt-6 flex justify-end"><button class="btn btn-ghost" data-action="close-modal">Close</button></div>';
    var s = userSummary(a);
    var recent = s.loans.slice(0, 5);
    var statCard = function (n, label, bad) {
      return '<div class="rounded-xl border border-line p-3">' +
        '<span class="block font-display font-bold text-2xl leading-none ' + (bad ? 't-bad' : 'text-brand-deep') + '">' + n + '</span>' +
        '<span class="block mt-1.5 text-xs text-muted">' + label + '</span></div>';
    };
    var detailRow = function (label, value) {
      return '<div class="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0">' +
        '<span class="text-xs text-muted">' + label + '</span><span class="text-right text-sm font-medium break-words">' + esc(value || '\u2014') + '</span></div>';
    };
    var profile = a.profileImage
      ? '<img src="' + esc(a.profileImage) + '" alt="' + esc(a.name) + ' profile photo" class="w-16 h-16 rounded-full object-cover border-2 border-white shadow">'
      : '<span class="w-16 h-16 rounded-full flex items-center justify-center text-white font-display font-bold text-lg" style="background:var(--btn-bg)">' + esc(initials(a.name)) + '</span>';
    var college = a.college || a.course;
    return '<div class="-m-6 mb-5 px-6 py-4 rounded-t-2xl text-white flex items-center gap-3" style="background:var(--btn-bg)">' +
      '<button data-action="close-modal" class="w-7 h-7 -ml-1 rounded-md flex items-center justify-center hover:bg-white/15" aria-label="Back">' + icon('chevronleft', 'w-5 h-5') + '</button>' +
      '<h2 class="font-display font-bold text-lg truncate">' + esc(a.name) + '</h2></div>' +
      '<div class="px-1">' +
      '<div class="flex items-center gap-4"><div class="shrink-0">' + profile + '</div><div class="min-w-0"><p class="font-semibold truncate">' + esc(a.name) + '</p><p class="text-xs text-muted break-all">' + esc(a.email || '\u2014') + '</p>' + rolePill(a.role) + '</div></div>' +
      '<div class="mt-4 rounded-xl border border-line px-3">' +
      detailRow('Gender', a.gender) +
      detailRow('Email', a.email) +
      detailRow(a.role === 'faculty' ? 'College / Department' : 'College', college) +
      detailRow('Year level', a.yearLevel) +
      detailRow('Block', a.block) +
      '</div>' +
      '<p class="text-xs font-bold uppercase tracking-wide text-muted mt-5">Recent borrowings</p>' +
      (recent.length
        ? '<div class="mt-2 rounded-xl border border-line divide-y divide-[color:var(--line)] overflow-hidden">' +
          recent.map(function (l) {
            var st = loanStatus(l);
            return '<div class="p-3"><div class="flex items-center justify-between gap-2"><span class="font-medium text-sm truncate">' + esc(l.name) + '</span>' + pill(st) + '</div>' +
              '<p class="text-xs text-muted mt-1">' + (st === 'returned' ? 'Returned ' + fmt(l.returnedOn || l.end) : fmt(l.start) + ' \u2192 ' + fmt(l.end)) + '</p></div>';
          }).join('') + '</div>'
        : '<p class="text-sm text-muted mt-2">No borrowing activity yet.</p>') +
      '<p class="text-xs font-bold uppercase tracking-wide text-muted mt-5">Borrowing summary</p>' +
      '<div class="mt-2 grid grid-cols-2 gap-3">' +
      statCard(s.totalBorrowed, 'Total borrowed') + statCard(s.dueSoon, 'Due soon', s.dueSoon > 0) +
      statCard(s.returned, 'Returned') + statCard(s.currentBorrowed, 'Current borrowed') +
      '</div></div>';
  }
  function renderModal() {
    var m = state.modal, root = $('#modal-root');
    if (!m) { root.innerHTML = ''; return; }
    var inner = m.type === 'request' ? requestForm(m) : m.type === 'add' ? addForm() : m.type === 'qr' ? qrBody(m) :
      m.type === 'edit-profile' ? editProfileForm() : m.type === 'change-password' ? changePasswordBody() :
      m.type === 'account' ? accountBody(m) : m.type === 'user-detail' ? userDetailBody(m) : confirmBody(m);
    root.innerHTML = '<div data-action="backdrop" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" style="padding-bottom:calc(1rem + env(safe-area-inset-bottom,0px))">' +
      '<div role="dialog" aria-modal="true" class="pop w-full max-w-md max-h-full overflow-y-auto rounded-2xl bg-card border border-line p-6 shadow-2xl">' + inner + '</div></div>';
    var first = root.querySelector('input:not([type=checkbox]), select');
    if (first) first.focus(); else { var b = root.querySelector('.btn-primary, .btn-danger'); if (b) b.focus(); }
  }
  function openModal(m) { state.modal = m; renderModal(); }
  function closeModal() { state.modal = null; pendingConfirm = null; renderModal(); }
  function formError(msg) { var el = $('#form-error'); if (el) el.textContent = msg; }

  function submitRequest(form) {
    var f = new FormData(form), t = today();
    var equipmentId = f.get('equipmentId'), borrower = String(f.get('borrower') || '').trim();
    var start = f.get('start'), end = f.get('end'), instant = f.get('instant') === 'on';
    var e = eqById(equipmentId);
    if (!e || itemStatus(e) !== 'available') return formError('That item is not available right now. Pick another one.');
    if (!borrower) return formError("Enter the borrower's name.");
    if (!start || !end) return formError('Choose both a borrow date and a return date.');
    if (start < t) return formError('The borrow date cannot be in the past.');
    if (end < start) return formError('The return date must be on or after the borrow date.');
    var ref = loansCol.doc();
    ref.set({ id: ref.id, equipmentId: e.id, name: e.name, borrower: borrower, start: start, end: end,
      status: instant ? 'approved' : 'pending', returnedOn: null, updatedAt: Date.now() })
      .then(function () {
        closeModal();
        toast(instant ? e.name + ' checked out to ' + borrower + '.' : 'Request for ' + e.name + ' sent to the approval queue.');
      })
      .catch(function (err) { formError('Could not save: ' + err.message); });
  }
  /* Shrinks a picked photo to a small JPEG data URI so it fits comfortably
     inside a Firestore document (1 MiB limit per doc). Good enough for a
     thumbnail-sized equipment photo; not meant for full-resolution storage. */
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(null); return; }
      if (!/^image\//.test(file.type)) { reject(new Error('That file is not an image.')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that photo.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not read that photo.')); };
        img.onload = function () {
          var scale = Math.min(1, (maxDim || 480) / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function submitAdd(form) {
    var f = new FormData(form);
    var name = String(f.get('name') || '').trim(), catRaw = f.get('category');
    if (!name) return formError('Give the item a name.');
    var cat = CATEGORIES[catRaw] ? catRaw : 'Other';
    var file = form.elements.image && form.elements.image.files[0];
    var submitBtn = form.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;
    compressImage(file)
      .then(function (imageData) {
        var ref = equipmentCol.doc();
        var tag = String(f.get('tag') || '').trim().toUpperCase() || ((TAG_PREFIX[cat] || 'OT') + '-' + ref.id.slice(0, 4).toUpperCase());
        return ref.set({ id: ref.id, name: name, category: cat, tag: tag, maintenance: false, image: imageData || null }).then(function () { return ref.id; });
      })
      .then(function (newId) {
        toast('Added ' + name + ' to the inventory.');
        openModal({ type: 'qr', id: newId, justAdded: true }); // show its unique QR label right away, ready to print
      })
      .catch(function (err) {
        if (submitBtn) submitBtn.disabled = false;
        formError(err.message);
      });
  }

  function submitEditProfile(form) {
    var f = new FormData(form);
    var name = String(f.get('name') || '').trim();
    if (!name) return formError('Enter your name.');
    var current = profileData();
    var file = form.elements.photo && form.elements.photo.files[0];
    var submitBtn = form.querySelector('button[type=submit]');
    if (submitBtn) submitBtn.disabled = true;
    compressImage(file, 240, 0.8)
      .then(function (photoData) {
        return profileDoc.set({ name: name, photo: photoData || current.photo || null });
      })
      .then(function () { closeModal(); toast('Profile updated.'); })
      .catch(function (err) {
        if (submitBtn) submitBtn.disabled = false;
        formError(err.message);
      });
  }

  /* ---------- assistant ---------- */
  var ASK = [['overdue', "What's overdue?"], ['available', "What's available?"], ['pending', 'Pending requests'], ['busiest', 'Busiest day'], ['summary', 'Quick summary']];
  function answer(key) {
    var s = stats(), t = today(), list;
    if (key === 'overdue') {
      list = db.loans.filter(function (l) { return loanStatus(l) === 'overdue'; });
      return list.length ? plural(list.length, 'item') + ' overdue: ' + list.map(function (l) { return l.name + ' (' + l.borrower + ', ' + diffDays(t, l.end) + 'd late)'; }).join('; ') + '.' : 'Nothing is overdue right now.';
    }
    if (key === 'available') {
      list = db.equipment.filter(function (e) { return itemStatus(e) === 'available'; });
      return list.length ? list.length + ' of ' + s.total + ' available: ' + list.map(function (e) { return e.name; }).join(', ') + '.' : 'Nothing is available to borrow right now.';
    }
    if (key === 'pending') {
      list = db.loans.filter(function (l) { return l.status === 'pending'; });
      return list.length ? plural(list.length, 'request') + ' waiting: ' + list.map(function (l) { return l.borrower + ' wants ' + l.name + ' (' + fmt(l.start) + ')'; }).join('; ') + '.' : 'No pending requests. The approval queue is clear.';
    }
    if (key === 'busiest') {
      var by = [0, 0, 0, 0, 0, 0, 0];
      db.loans.filter(isCheckout).forEach(function (l) { by[parse(l.start).getDay()]++; });
      var top = Math.max.apply(null, by);
      return top ? DAY_LONG[by.indexOf(top)] + ' are busiest, with ' + plural(top, 'checkout') + ' on record.' : 'There are no checkouts on record yet.';
    }
    return s.total + ' items: ' + s.available + ' available, ' + s.borrowed + ' borrowed, ' + s.maintenance + ' in maintenance. ' +
      s.pending + ' pending and ' + s.overdue + ' overdue.';
  }
  function answerFreeText(text) {
    var t = text.toLowerCase();
    var key = /overdue|late/.test(t) ? 'overdue'
      : /available|free|open/.test(t) ? 'available'
      : /pending|waiting|queue|request/.test(t) ? 'pending'
      : /busiest|busy|popular|peak/.test(t) ? 'busiest'
      : /summary|overview|status|how.*(going|things)/.test(t) ? 'summary'
      : null;
    if (key) return answer(key);
    return "I don't have a ready answer for that yet \u2014 I can only check equipment status, pending requests, overdue items, the busiest day, and a quick summary. Try one of the buttons above, or rephrase around one of those.";
  }
  function submitAssistant(form) {
    var input = document.getElementById('assistant-input');
    var text = input.value.trim();
    if (!text) return;
    state.chat.push({ from: 'me', text: text }, { from: 'bot', text: answerFreeText(text) });
    renderAssistant();
    var again = document.getElementById('assistant-input');
    if (again) again.focus();
  }
  function renderAssistant() {
    var root = $('#assistant-root');
    var panel = '';
    if (state.assistantOpen) {
      panel = '<div class="pop fixed right-4 sm:right-5 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl bg-card border border-line shadow-2xl flex flex-col overflow-hidden" style="bottom:calc(5.75rem + env(safe-area-inset-bottom,0px))" role="dialog" aria-label="Lendy assistant">' +
        '<div class="flex items-center justify-between px-4 py-3 text-white" style="background:linear-gradient(90deg,var(--side-from),var(--side-to))"><span class="font-display font-bold">Ask Lendy</span>' +
        '<button data-action="assistant-toggle" class="w-7 h-7 rounded-md flex items-center justify-center hover:bg-white/15" aria-label="Close assistant">' + icon('x', 'w-4 h-4') + '</button></div>' +
        '<div id="chat-log" class="p-4 grid gap-2.5 max-h-[38vh] overflow-y-auto text-sm">' +
        state.chat.map(function (m) {
          return m.from === 'me'
            ? '<div class="justify-self-end max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-white" style="background:var(--btn-bg)">' + esc(m.text) + '</div>'
            : '<div class="justify-self-start max-w-[90%] rounded-2xl rounded-bl-md px-3.5 py-2 bg-tint">' + esc(m.text) + '</div>';
        }).join('') + '</div>' +
        '<div class="px-4 pb-3 flex flex-wrap gap-2">' + ASK.map(function (a) { return '<button class="chip" data-action="assistant-ask" data-key="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' +
        '<form id="assistant-form" class="px-4 pb-4 flex gap-2 border-t border-line pt-3">' +
        '<input id="assistant-input" type="text" class="field flex-1" placeholder="Ask about equipment\u2026" autocomplete="off" maxlength="200">' +
        '<button type="submit" class="w-10 h-10 shrink-0 rounded-xl text-white flex items-center justify-center" style="background:var(--btn-bg)" aria-label="Send">' + icon('send', 'w-4 h-4') + '</button>' +
        '</form></div>';
    }
    root.innerHTML = panel +
      '<button data-action="assistant-toggle" class="fixed right-4 sm:right-5 z-40 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-xl transition hover:scale-105" ' +
      'style="bottom:calc(1.25rem + env(safe-area-inset-bottom,0px));background:#0e5a4d;box-shadow:0 0 0 3px #22917e inset,0 10px 24px -8px rgba(0,0,0,.4)" aria-label="' + (state.assistantOpen ? 'Close' : 'Open') + ' assistant" aria-expanded="' + state.assistantOpen + '">' +
      icon('bot', 'w-7 h-7') + '</button>';
    var log = $('#chat-log'); if (log) log.scrollTop = log.scrollHeight;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action, id = el.dataset.id;
    switch (a) {
      case 'nav':
        state.view = el.dataset.view; state.sidebarOpen = false;
        if (state.view === 'history') { state.filter.history = el.dataset.filter || 'all'; state.q.history = ''; }
        if (state.view === 'inventory') { state.filter.inventory = 'all'; state.q.inventory = ''; }
        if (state.view === 'users') { state.filter.usersRole = 'all'; state.filter.usersCourse = 'all'; state.q.users = ''; }
        render(); break;
      case 'toggle-sidebar': state.sidebarOpen = !state.sidebarOpen; render(); break;
      case 'chart-mode': state.chartMode = el.dataset.mode; render(); break;
      case 'inv-filter': state.filter.inventory = el.dataset.value; render(); break;
      case 'hist-filter': state.filter.history = el.dataset.value; render(); break;
      case 'approve': approve(id); break;
      case 'reject': reject(id); break;
      case 'approve-request': approveRequest(id); break;
      case 'reject-request': rejectRequest(id); break;
      case 'requests-tab': state.tab.requests = el.dataset.tab; render(); break;
      case 'open-account': openModal({ type: 'account', id: id }); break;
      case 'users-role': state.filter.usersRole = el.dataset.value; render(); break;
      case 'open-user': openModal({ type: 'user-detail', id: id }); break;
      case 'revoke-account': setAccountStatus(id, 'revoked'); closeModal(); break;
      case 'restore-account': setAccountStatus(id, 'active'); closeModal(); break;
      case 'reset-user-password':
        var account = db.accounts.find(function (x) { return x.id === id; });
        if (!account || !account.email) {
          toast('Could not send the password reset email: account email is unavailable.', 'bad');
          break;
        }
        auth.sendPasswordResetEmail(account.email)
          .then(function () { toast('Password reset email sent to ' + account.email + '.'); })
          .catch(fail('Could not send the password reset email'));
        break;
      case 'delete-user-account':
      case 'remove-account':
        requestAccountDeletion(id);
        break;
      case 'return': markReturned(id); break;
      case 'maintenance-on': setMaintenance(id, true); break;
      case 'maintenance-off': setMaintenance(id, false); break;
      case 'delete-item':
        var e = eqById(id); if (!e) break;
        pendingConfirm = function () { deleteItem(id); };
        openModal({ type: 'confirm', title: 'Remove ' + e.name + '?', body: 'It will leave the inventory and any pending requests for it will be rejected. Past borrows stay in the history.', label: 'Remove item', danger: true });
        break;
      case 'open-request': openModal({ type: 'request', prefill: id }); break;
      case 'open-add': openModal({ type: 'add' }); break;
      case 'qr': openModal({ type: 'qr', id: id }); break;
      case 'print-qr': window.print(); break;
      case 'open-edit-profile': openModal({ type: 'edit-profile' }); break;
      case 'open-change-password': openModal({ type: 'change-password' }); break;
      case 'send-password-reset':
        auth.sendPasswordResetEmail(currentUser.email)
          .then(function () { closeModal(); toast('Password reset email sent.'); })
          .catch(fail('Could not send the password reset email'));
        break;
      case 'sign-out':
        pendingConfirm = function () {
          auth.signOut().then(function () { location.replace('login.html'); })
            .catch(fail('Could not sign out'));
        };
        openModal({ type: 'confirm', title: 'Sign out?', body: 'You\u2019ll need to sign back in to manage equipment and requests.', label: 'Sign out', danger: true });
        break;
      case 'backdrop': if (ev.target === el) closeModal(); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-yes': var fn = pendingConfirm; closeModal(); if (fn) fn(); break;
      case 'assistant-toggle': state.assistantOpen = !state.assistantOpen; renderAssistant(); break;
      case 'assistant-ask':
        var q = ASK.find(function (x) { return x[0] === el.dataset.key; });
        state.chat.push({ from: 'me', text: q[1] }, { from: 'bot', text: answer(q[0]) });
        renderAssistant(); break;
    }
  });
  document.addEventListener('input', function (ev) {
    var k = ev.target && ev.target.dataset && ev.target.dataset.search;
    if (k) { state.q[k] = ev.target.value; render(); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.dataset && ev.target.dataset.action === 'users-course') {
      state.filter.usersCourse = ev.target.value; render(); return;
    }
    if (ev.target && ev.target.name === 'start') {
      var end = ev.target.form.elements.end;
      end.min = ev.target.value;
      if (end.value < ev.target.value) end.value = ev.target.value;
    }
    if (ev.target && ev.target.id === 'f-image') {
      var prev = $('#image-preview'), file = ev.target.files[0];
      if (!prev) return;
      if (!file || !/^image\//.test(file.type)) { prev.innerHTML = icon('box', 'w-6 h-6'); return; }
      var reader = new FileReader();
      reader.onload = function () { prev.innerHTML = '<img src="' + reader.result + '" class="w-full h-full object-cover" alt="">'; };
      reader.readAsDataURL(file);
    }
    if (ev.target && ev.target.id === 'p-photo') {
      var pprev = $('#profile-photo-preview'), pfile = ev.target.files[0];
      if (!pprev || !pfile || !/^image\//.test(pfile.type)) return;
      var preader = new FileReader();
      preader.onload = function () { pprev.innerHTML = '<img src="' + preader.result + '" class="w-full h-full object-cover" alt="">'; };
      preader.readAsDataURL(pfile);
    }
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.target;
    if (form.dataset.form === 'request') submitRequest(form);
    else if (form.dataset.form === 'add') submitAdd(form);
    else if (form.dataset.form === 'approve-account') submitApproveRequest(form);
    else if (form.dataset.form === 'edit-profile') submitEditProfile(form);
    else if (form.id === 'assistant-form') submitAssistant(form);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (state.modal) closeModal();
    else if (state.assistantOpen) { state.assistantOpen = false; renderAssistant(); }
    else if (state.sidebarOpen) { state.sidebarOpen = false; render(); }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });

  render();
  renderAssistant();
  }
})();
