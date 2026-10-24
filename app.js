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
    queue: "hunt.queue"    // check-in rows not yet saved to Supabase
  };

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

    if (!code) {
      renderHome();
    } else if (index === -1) {
      renderUnknownCode();
    } else if (!load(KEYS.runner, null)) {
      renderNameForm(function () { checkIn(index + 1); });
    } else {
      checkIn(index + 1);
    }

    flushQueue();
    setInterval(flushQueue, CFG.syncRetrySeconds * 1000);
    window.addEventListener("online", flushQueue);

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
      var runner = load(KEYS.runner, null);
      var found = load(KEYS.found, {});
      var isNew = !found[number];

      if (isNew) {
        var now = new Date().toISOString();
        found[number] = now;
        save(KEYS.found, found);
        var queue = load(KEYS.queue, []);
        queue.push({
          runner_id: runner.id,
          runner_name: runner.name,
          checkpoint: number,
          // Sent explicitly so a check-in that syncs late still records when it was scanned.
          created_at: now
        });
        save(KEYS.queue, queue);
      }

      if (Object.keys(found).length >= TOTAL) {
        renderFinish(found, isNew);
      } else {
        renderFound(number, found, isNew);
      }
      if (navigator.vibrate && isNew) navigator.vibrate(200);
    }

    function renderFound(number, found, isNew) {
      var cp = CFG.checkpoints[number - 1];
      var count = Object.keys(found).length;
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">' + (isNew ? "Nice one, " + escapeHtml(load(KEYS.runner).name) + "!" : "Already got this one!") + '</p>' +
          '<h1 class="big">Checkpoint ' + number + ' of ' + TOTAL + ' found!</h1>' +
          '<p class="cp-name">' + escapeHtml(cp.name) + '</p>' +
          progressHtml(found) +
          '<p class="count">' + count + ' of ' + TOTAL + ' found</p>' +
          '<div class="card card-message"><h2>Checkpoint ' + number + ' says…</h2><p>' + escapeHtml(cp.message) + '</p></div>' +
          '<div class="card card-clue"><h2>Clue to the next one</h2><p>' + escapeHtml(cp.clue) + '</p></div>' +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    function renderFinish(found, isNew) {
      var times = Object.keys(found).map(function (k) { return Date.parse(found[k]); });
      var total = Math.max.apply(null, times) - Math.min.apply(null, times);
      app.innerHTML =
        '<section class="screen finish">' +
          '<p class="kicker">' + (isNew ? "That's all of them!" : "You already finished!") + '</p>' +
          '<h1 class="big">You found all ' + TOTAL + '! 🏁</h1>' +
          progressHtml(found) +
          '<div class="card card-time"><h2>Your time</h2><p class="finish-time">' + formatDuration(total) + '</p>' +
            '<p class="small">First scan to last scan</p></div>' +
          '<a class="btn btn-primary" href="leaderboard.html">See the leaderboard</a>' +
          syncLineHtml() +
        '</section>';
      renderSync();
    }

    function renderHome() {
      var runner = load(KEYS.runner, null);
      var found = load(KEYS.found, {});
      var count = Object.keys(found).length;
      if (count >= TOTAL) return renderFinish(found, false);
      app.innerHTML =
        '<section class="screen">' +
          '<p class="kicker">' + (runner ? "Hey " + escapeHtml(runner.name) + "!" : "Welcome, runner!") + '</p>' +
          '<h1>Find all ' + TOTAL + ' checkpoints</h1>' +
          '<p>Scan the QR code at each mile marker with your phone camera to check in.</p>' +
          progressHtml(found) +
          '<p class="count">' + count + ' of ' + TOTAL + ' found</p>' +
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
        var e = byRunner[r.runner_id] || (byRunner[r.runner_id] = { id: r.runner_id, name: r.runner_name, cps: {}, first: t, last: t });
        e.name = r.runner_name;
        e.cps[r.checkpoint] = true;
        e.first = Math.min(e.first, t);
        e.last = Math.max(e.last, t);
      });
      return Object.keys(byRunner).map(function (id) {
        var e = byRunner[id];
        e.count = Object.keys(e.cps).length;
        e.elapsed = e.last - e.first;
        e.done = e.count >= TOTAL;
        return e;
      }).sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        if (a.done) return a.elapsed - b.elapsed;
        return a.last - b.last; // unfinished ties: whoever got there first
      });
    }

    function render(runners) {
      if (!runners.length) {
        list.innerHTML = '<p class="empty">No check-ins yet. Go find a checkpoint!</p>';
        return;
      }
      var medals = ["🥇", "🥈", "🥉"];
      list.innerHTML = '<ol class="board">' + runners.map(function (r, i) {
        var place = r.done && i < 3 ? medals[i] : String(i + 1);
        return '<li class="row' + (r.done ? " done" : "") + (me && me.id === r.id ? " me" : "") + '">' +
          '<span class="place">' + place + '</span>' +
          '<span class="who">' + escapeHtml(r.name) + (me && me.id === r.id ? ' <span class="you">you</span>' : "") + '</span>' +
          '<span class="found">' + r.count + '/' + TOTAL + '</span>' +
          '<span class="time">' + (r.done ? formatDuration(r.elapsed) : "") + '</span>' +
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
