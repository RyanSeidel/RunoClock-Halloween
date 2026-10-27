// Scavenger hunt app: check-in flow (index.html) and leaderboard (leaderboard.html).
// Needs config.js loaded first.
(function () {
  "use strict";

  var CFG = window.HUNT_CONFIG;
  var TOTAL = CFG.checkpoints.length;
  var SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  var NETWORK_TIMEOUT_MS = 10000;
  var KEYS = {
    runner: "hunt.runner", // { id, name }
    found: "hunt.found",   // { "<checkpoint number>": "<ISO time of first scan>" }
    start: "hunt.start",   // ISO time the START sign was scanned
    finish: "hunt.finish", // ISO time the FINISH sign was scanned
    queue: "hunt.queue"    // check-in rows not yet saved to Supabase
  };
  var START_CHECKPOINT = 0;   // stored in Supabase as checkpoint 0
  var FINISH_CHECKPOINT = 99; // stored in Supabase as checkpoint 99

  document.documentElement.setAttribute("data-theme", CFG.halloweenTheme ? "halloween" : "classic");

  // ---------------------------------------------------------------- helpers

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full or blocked; nothing we can do */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  // crypto.randomUUID only exists on https:// and localhost, so testing from a
  // phone over plain http on your Wi-Fi needs the fallback.
  function newRunnerId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  // Every element with data-since="<ms timestamp>" shows a live, ticking elapsed time.
  function tickClocks() {
    document.querySelectorAll("[data-since]").forEach(function (el) {
      el.textContent = formatDuration(Date.now() - Number(el.getAttribute("data-since")));
    });
  }

  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, NETWORK_TIMEOUT_MS);
      })
    ]);
  }

  // ---------------------------------------------------------------- supabase

  var db = null;
  var scriptLoading = null;

  function supabaseConfigured() {
    return CFG.supabaseUrl && CFG.supabaseAnonKey &&
      CFG.supabaseUrl.indexOf("YOUR-") === -1 && CFG.supabaseAnonKey.indexOf("YOUR-") === -1;
  }

  // Loads supabase-js from the CDN on demand. If the load fails (weak signal),
  // the next call tries again instead of giving up for the whole visit.
  function getDb() {
    if (db) return Promise.resolve(db);
    if (!supabaseConfigured()) return Promise.reject(new Error("Supabase not configured"));
    if (!scriptLoading) {
      scriptLoading = new Promise(function (resolve, reject) {
        if (window.supabase) return resolve();
        var s = document.createElement("script");
        s.src = SUPABASE_JS;
        s.onload = resolve;
        s.onerror = function () {
          s.remove();
          scriptLoading = null;
          reject(new Error("Could not load supabase-js"));
        };
        document.head.appendChild(s);
      });
    }
    return withTimeout(scriptLoading).then(function () {
      db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
        auth: { persistSession: false }
      });
      return db;
    });
  }

  // ---------------------------------------------------------------- check-in page

  function initHunt() {
    var app = document.getElementById("app");
    var params = new URLSearchParams(location.search);

    if (params.has("reset")) {
      if (confirm("Clear your name and progress on this phone? Unsynced check-ins will be lost.")) {
        Object.keys(KEYS).forEach(function (k) { localStorage.removeItem(KEYS[k]); });
      }
      history.replaceState(null, "", location.pathname);
      params = new URLSearchParams();
    }

    var code = (params.get("cp") || "").trim().toLowerCase();
    var index = -1;
    CFG.checkpoints.forEach(function (cp, i) {
      if (cp.code.toLowerCase() === code) index = i;
    });

    var action = null;
    if (CFG.startCode && code === CFG.startCode.toLowerCase()) {
      action = startClock;
    } else if (CFG.finishCode && code === CFG.finishCode.toLowerCase()) {
      action = stopClock;
    } else if (index !== -1) {
      action = function () { checkIn(index + 1); };
    }

    if (!code) {
      renderHome();
    } else if (!action) {
      renderUnknownCode();
    } else if (!load(KEYS.runner, null)) {
      renderNameForm(action);
    } else {
      action();
    }

    flushQueue();
    setInterval(flushQueue, CFG.syncRetrySeconds * 1000);
    setInterval(tickClocks, 1000);
    window.addEventListener("online", flushQueue);

    function queueCheckIn(number, time) {
      var runner = load(KEYS.runner, null);
      var queue = load(KEYS.queue, []);
      queue.push({
        runner_id: runner.id,
        runner_name: runner.name,
        checkpoint: number,
        // Sent explicitly so a check-in that syncs late still records when it was scanned.
        created_at: time
      });
      save(KEYS.queue, queue);
    }

    // Clock starts at the START scan, or at the first checkpoint for runners who skipped it.
    function startTime(found) {
      var start = load(KEYS.start, null);
      if (start) return Date.parse(start);
      var times = Object.keys(found).map(function (k) { return Date.parse(found[k]); });
      return times.length ? Math.min.apply(null, times) : null;
    }

    function clockHtml(found) {
      var since = startTime(found);
      if (since === null) return "";
      var finish = load(KEYS.finish, null);
      if (finish) {
        return '<div class="card card-time"><h2>Your time</h2>' +
          '<p class="big-time">' + formatDuration(Date.parse(finish) - since) + '</p></div>';
      }
      return '<div class="card card-time"><h2>Running time</h2>' +
        '<p class="big-time" data-since="' + since + '">' + formatDuration(Date.now() - since) + '</p></div>';
    }

    function startClock() {
      var found = load(KEYS.found, {});
      var alreadyRunning = startTime(found) !== null;
      if (!alreadyRunning) {
        var now = new Date().toISOString();
        save(KEYS.start, now);
        queueCheckIn(START_CHECKPOINT, now);
        if (navigator.vibrate) navigator.vibrate(200);
      }
      if (load(KEYS.finish, null)) return renderFinish(found, false);
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">' + (alreadyRunning ? "Your clock is already running!" : "Ready, set…") + '</p>' +
          '<h1 class="big">GO, ' + escapeHtml(load(KEYS.runner).name) + '!</h1>' +
          clockHtml(found) +
          progressHtml(found) +
          '<div class="card card-message"><p>' + escapeHtml(CFG.startMessage) + '</p></div>' +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    // FINISH sign at the finish line: stops the clock. Only the first scan counts.
    function stopClock() {
      var found = load(KEYS.found, {});
      var isNew = !load(KEYS.finish, null);
      if (isNew) {
        var now = new Date().toISOString();
        save(KEYS.finish, now);
        queueCheckIn(FINISH_CHECKPOINT, now);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
      renderFinish(found, isNew);
    }

    // ---- screens

    function renderNameForm(onDone) {
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">You found a checkpoint!</p>' +
          '<h1>What\'s your name?</h1>' +
          '<p>We\'ll remember it on this phone, so you only type it once.</p>' +
          '<form id="name-form" class="name-form">' +
            '<label for="name" class="visually-hidden">Your name</label>' +
            '<input id="name" name="name" type="text" maxlength="40" autocomplete="name" ' +
              'autocapitalize="words" placeholder="Your name" required>' +
            '<button type="submit" class="btn btn-primary">Let\'s go!</button>' +
          '</form>' +
        '</section>';
      var form = document.getElementById("name-form");
      var input = document.getElementById("name");
      input.focus();
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = input.value.trim().replace(/\s+/g, " ").slice(0, 40);
        if (!name) return input.focus();
        save(KEYS.runner, { id: newRunnerId(), name: name });
        onDone();
      });
    }

    function checkIn(number) {
      var found = load(KEYS.found, {});
      var isNew = !found[number];

      if (isNew) {
        var now = new Date().toISOString();
        found[number] = now;
        save(KEYS.found, found);
        queueCheckIn(number, now);
      }

      renderFound(number, found, isNew);
      if (navigator.vibrate && isNew) navigator.vibrate(200);
    }

    function renderFound(number, found, isNew) {
      // Lets style.css give each checkpoint its own colors ([data-cp="1"] etc.).
      document.documentElement.setAttribute("data-cp", number);
      var cp = CFG.checkpoints[number - 1];
      var count = Object.keys(found).length;
      var nextCard = '<div class="card card-clue"><h2>Clue to the next one</h2><p>' + escapeHtml(cp.clue) + '</p></div>';
      if (count >= TOTAL && !load(KEYS.finish, null)) {
        // The last checkpoint's clue points to the finish; if they found them out of order, say so plainly.
        var toFinish = number === TOTAL ? cp.clue :
          "All " + TOTAL + " found! Head to the finish line and scan the FINISH sign to stop your clock.";
        nextCard = '<div class="card card-clue"><h2>Head for the finish! 🏁</h2><p>' + escapeHtml(toFinish) + '</p></div>';
      }
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">' + (isNew ? "Nice one, " + escapeHtml(load(KEYS.runner).name) + "!" : "Already got this one!") + '</p>' +
          '<h1 class="big">Checkpoint ' + number + ' of ' + TOTAL + ' found!</h1>' +
          '<p class="cp-name">' + escapeHtml(cp.name) + '</p>' +
          progressHtml(found) +
          '<p class="count">' + count + ' of ' + TOTAL + ' found</p>' +
          clockHtml(found) +
          '<div class="card card-message"><h2>Checkpoint ' + number + ' says…</h2><p>' + escapeHtml(cp.message) + '</p></div>' +
          nextCard +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    function renderFinish(found, isNew) {
      var count = Object.keys(found).length;
      var since = startTime(found);
      var total = Date.parse(load(KEYS.finish)) - since;
      app.innerHTML =
        '<section class="screen finish">' +
          '<p class="kicker">' + (isNew ? "You crossed the finish line!" : "You already finished!") + '</p>' +
          '<h1 class="big">' + (count >= TOTAL ? "You found all " + TOTAL + "! 🏁" : "Finished! 🏁") + '</h1>' +
          progressHtml(found) +
          '<p class="count">' + count + ' of ' + TOTAL + ' found</p>' +
          (since === null ? "" :
            '<div class="card card-time"><h2>Your time</h2><p class="big-time">' + formatDuration(total) + '</p>' +
            '<p class="small">' + (load(KEYS.start, null) ? "Start to finish" : "First checkpoint to finish") + '</p></div>') +
          '<a class="btn btn-primary" href="leaderboard.html">See the leaderboard</a>' +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    function renderHome() {
      var runner = load(KEYS.runner, null);
      var found = load(KEYS.found, {});
      var count = Object.keys(found).length;
      if (load(KEYS.finish, null)) return renderFinish(found, false);
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">' + (runner ? "Hey " + escapeHtml(runner.name) + "!" : "Welcome, runner!") + '</p>' +
          '<h1>' + (count >= TOTAL ? "All found! Head to the finish 🏁" : "Find all " + TOTAL + " checkpoints") + '</h1>' +
          '<p>Scan the QR code at each mile marker with your phone camera to check in.</p>' +
          progressHtml(found) +
          '<p class="count">' + count + ' of ' + TOTAL + ' found</p>' +
          clockHtml(found) +
          '<a class="btn btn-secondary" href="leaderboard.html">Leaderboard</a>' +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    function renderUnknownCode() {
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">Hmm…</p>' +
          '<h1>That code isn\'t one of ours</h1>' +
          '<p>Try scanning the QR code again. If it keeps happening, find a race volunteer.</p>' +
          '<a class="btn btn-secondary" href="index.html">My progress</a>' +
        '</section>';
    }
  }

  function progressHtml(found) {
    var dots = "";
    for (var i = 1; i <= TOTAL; i++) {
      var on = !!found[i];
      dots += '<li class="dot' + (on ? " on" : "") + '" aria-label="Checkpoint ' + i +
        (on ? " found" : " not found yet") + '">' + (on ? "✓" : i) + "</li>";
    }
    return '<ol class="dots">' + dots + "</ol>";
  }

  // ---------------------------------------------------------------- offline queue

  var flushing = false;

  function syncLineHtml() {
    return '<p id="sync" class="sync" role="status"></p>';
  }

  function renderSync() {
    var el = document.getElementById("sync");
    if (!el) return;
    var pending = load(KEYS.queue, []).length;
    var state, text;
    if (!supabaseConfigured()) {
      state = "warn"; text = "Saved on this phone (leaderboard not set up yet)";
    } else if (!pending) {
      state = "ok"; text = "✓ Synced";
    } else if (flushing) {
      state = "busy"; text = "Syncing…";
    } else {
      state = "warn";
      text = pending + " check-in" + (pending === 1 ? "" : "s") + " saved on this phone, will sync when online";
    }
    el.className = "sync sync-" + state;
    el.textContent = text;
  }

  function rowKey(row) { return row.runner_id + "#" + row.checkpoint; }

  function flushQueue() {
    if (flushing || !load(KEYS.queue, []).length || !supabaseConfigured()) {
      renderSync();
      return Promise.resolve();
    }
    flushing = true;
    renderSync();
    var sent = {};
    return getDb()
      .then(function (client) {
        // One row at a time so a single duplicate or bad row can't block the rest.
        return load(KEYS.queue, []).reduce(function (chain, row) {
          return chain.then(function () {
            return withTimeout(client.from("checkins").insert(row)).then(function (res) {
              // 23505 = unique violation: this check-in was already saved earlier.
              if (!res.error || res.error.code === "23505") sent[rowKey(row)] = true;
            });
          });
        }, Promise.resolve());
      })
      .catch(function () { /* offline or timed out; leave the rest queued */ })
      .then(function () {
        // Re-read the queue in case a new check-in was added while we were sending.
        save(KEYS.queue, load(KEYS.queue, []).filter(function (row) { return !sent[rowKey(row)]; }));
        flushing = false;
        renderSync();
      });
  }

  // ---------------------------------------------------------------- leaderboard page

  function initLeaderboard() {
    var list = document.getElementById("board");
    var updated = document.getElementById("updated");
    var me = load(KEYS.runner, null);

    if (!supabaseConfigured()) {
      list.innerHTML = '<p class="empty">Add your Supabase URL and anon key to config.js to turn on the leaderboard.</p>';
      return;
    }

    // Send any of this phone's queued check-ins first so they show up right away.
    flushQueue().then(refresh);
    setInterval(function () { flushQueue().then(refresh); }, CFG.leaderboardRefreshSeconds * 1000);
    setInterval(tickClocks, 1000);

    function fetchAll(client) {
      var PAGE = 1000;
      var rows = [];
      function page(from) {
        return withTimeout(
          client.from("checkins")
            .select("runner_id, runner_name, checkpoint, created_at")
            .order("created_at", { ascending: true })
            .range(from, from + PAGE - 1)
        ).then(function (res) {
          if (res.error) throw res.error;
          rows = rows.concat(res.data);
          return res.data.length === PAGE ? page(from + PAGE) : rows;
        });
      }
      return page(0);
    }

    function refresh() {
      return getDb()
        .then(fetchAll)
        .then(function (rows) {
          render(rank(rows));
          updated.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
          updated.className = "updated";
        })
        .catch(function () {
          updated.textContent = "Can't reach the leaderboard right now, retrying…";
          updated.className = "updated updated-error";
        });
    }

    function rank(rows) {
      var byRunner = {};
      rows.forEach(function (r) {
        var t = Date.parse(r.created_at);
        var e = byRunner[r.runner_id] || (byRunner[r.runner_id] = { id: r.runner_id, cps: {}, first: Infinity, last: -Infinity, finish: null });
        e.name = r.runner_name;
        if (r.checkpoint === FINISH_CHECKPOINT) { e.finish = t; return; }
        e.first = Math.min(e.first, t); // includes the START scan, so the clock starts there
        if (r.checkpoint === START_CHECKPOINT) return;
        e.cps[r.checkpoint] = true;
        e.last = Math.max(e.last, t);
      });
      return Object.keys(byRunner).map(function (id) {
        var e = byRunner[id];
        e.count = Object.keys(e.cps).length;
        e.done = e.finish !== null; // the clock stops at the FINISH scan
        if (e.done && e.first === Infinity) e.first = e.finish; // only scanned FINISH
        e.elapsed = e.done ? e.finish - e.first : 0;
        return e;
      }).sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        if (a.done !== b.done) return a.done ? -1 : 1;
        if (a.done) return a.elapsed - b.elapsed;
        // Unfinished ties: whoever got there first (or started first, if no checkpoints yet).
        return a.count ? a.last - b.last : a.first - b.first;
      });
    }

    function render(runners) {
      if (!runners.length) {
        list.innerHTML = '<p class="empty">No check-ins yet. Go find a checkpoint!</p>';
        return;
      }
      var medals = ["🥇", "🥈", "🥉"];
      list.innerHTML = '<ol class="board">' + runners.map(function (r, i) {
        var place = r.done && r.count >= TOTAL && i < 3 ? medals[i] : String(i + 1);
        return '<li class="row' + (r.done ? " done" : "") + (me && me.id === r.id ? " me" : "") + '">' +
          '<span class="place">' + place + '</span>' +
          '<span class="who">' + escapeHtml(r.name) + (me && me.id === r.id ? ' <span class="you">you</span>' : "") + '</span>' +
          '<span class="found">' + r.count + '/' + TOTAL + '</span>' +
          (r.done
            ? '<span class="time">' + formatDuration(r.elapsed) + '</span>'
            : '<span class="time running" data-since="' + r.first + '">' + formatDuration(Date.now() - r.first) + '</span>') +
        '</li>';
      }).join("") + '</ol>';
    }
  }

  // ---------------------------------------------------------------- boot

  document.querySelectorAll("[data-event-name]").forEach(function (el) {
    el.textContent = CFG.eventName;
  });
  var page = document.body.getAttribute("data-page");
  if (page === "hunt") initHunt();
  if (page === "leaderboard") initLeaderboard();
})();
