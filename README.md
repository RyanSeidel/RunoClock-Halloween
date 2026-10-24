# Run Club QR Scavenger Hunt

A phone-friendly QR scavenger hunt for a 2-mile route with 5 checkpoints and a shared live leaderboard. It's plain HTML, CSS and JavaScript, so there's no build step, and it's hosted on GitHub Pages. Check-ins are stored in Supabase.

| File | What it is |
|---|---|
| `config.js` | **The only file you need to edit:** event name, checkpoints, messages, clues, Supabase keys, site URL, theme |
| `index.html` | The page each QR code opens: name entry, check-in, progress, finish screen |
| `leaderboard.html` | Live leaderboard that auto-refreshes every 15 seconds |
| `print.html` | Printable QR signs: START, 5 checkpoints, and a leaderboard sign |
| `app.js`, `style.css` | App logic and styles |

## How it works

- Each QR code opens `index.html?cp=<code>`. The codes are random 6-character strings, so runners can't guess the URLs.
- On their first scan, a runner types their name once. The name and a random runner ID are saved on their phone.
- Each scan records a check-in and shows "Checkpoint X of 5 found!", progress dots, that checkpoint's message, and a clue to the next one. Scanning the same checkpoint again doesn't count twice.
- **Timing:** runners scan the START sign at the start line, which starts their clock. A live running clock shows on every checkpoint screen and stops when they find their 5th checkpoint. If someone skips the START sign, their clock starts at their first checkpoint.
- After all 5 are found, the runner sees their total time and a link to the leaderboard. The leaderboard shows finished times, plus live ticking times for runners still out on the course.
- **Weak signal:** check-ins are saved on the phone first and then sent to Supabase. If a check-in can't be sent, it stays queued. The app retries on every page load, every 20 seconds, and whenever the phone comes back online. A status line shows "✓ Synced" or "will sync when online". The time of each check-in is the time it was scanned, even if it syncs later.

---

## 1. Set up Supabase (about 10 minutes, free tier)

1. Go to <https://supabase.com> and sign up. Signing in with GitHub is the easiest option.
2. Click **New project**. Pick your organization, give the project a name (e.g. `run-club-hunt`), set a database password (save it somewhere, though you won't need it for this app), and choose the region closest to you. Leave the Data API enabled. Click **Create new project** and wait about a minute while it provisions.
3. In the left sidebar, open **SQL Editor**, click **New query**, paste in the SQL below, and click **Run**. You should see "Success. No rows returned".

```sql
-- Check-ins for the run club scavenger hunt
create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  runner_id   text not null check (char_length(runner_id) between 1 and 64),
  runner_name text not null check (char_length(runner_name) between 1 and 40),
  checkpoint  int  not null check (checkpoint between 0 and 5),  -- 0 = START scan
  created_at  timestamptz not null default now(),
  constraint checkins_runner_checkpoint_unique unique (runner_id, checkpoint)
);

-- Row Level Security: anonymous visitors may INSERT and SELECT only.
-- With no UPDATE or DELETE policies, those operations are always denied.
alter table public.checkins enable row level security;

create policy "Anyone can check in"
  on public.checkins for insert
  to anon
  with check (true);

create policy "Anyone can read the leaderboard"
  on public.checkins for select
  to anon
  using (true);

grant select, insert on public.checkins to anon;
revoke update, delete, truncate on public.checkins from anon;
```

   **Already created the table before the START sign existed?** Run this once to allow checkpoint 0:

   ```sql
   alter table public.checkins drop constraint if exists checkins_checkpoint_check;
   alter table public.checkins add constraint checkins_checkpoint_check check (checkpoint between 0 and 5);
   ```

4. **Find your project URL:** open **Project Settings** (the gear icon at the bottom of the sidebar), then **Data API**. Copy the **Project URL**. It looks like `https://abcdefghijklmnop.supabase.co`.
5. **Find your anon key:** in **Project Settings**, open **API Keys**. Copy the **anon public** key, a long string that starts with `eyJ...`. Newer projects may show a **Publishable key** starting with `sb_publishable_...` instead, and that works too.
   **Never** use the `service_role` or **secret** key. It bypasses all security and must not go on a public website.

> The anon/publishable key is meant to be public. It's safe in `config.js` because Row Level Security allows only inserting and reading check-ins.

> **Free-tier note:** Supabase pauses free projects after about a week with no activity. Open the leaderboard a day or two before the race to make sure it's awake. If it's paused, click **Restore** in the Supabase dashboard.

## 2. Fill in `config.js`

Open `config.js` and edit:

- `supabaseUrl` and `supabaseAnonKey`: paste the values from steps 4 and 5.
- `baseUrl`: your GitHub Pages address, ending in `/`. It's already set to `https://ryanseidel.github.io/RunoClock-Halloween/`.
- `eventName`: shown at the top of every page and on the printed signs.
- `halloweenTheme`: set to `true` for orange and black, or `false` for the bright classic look.
- `checkpoints`: the 5 checkpoints in route order. Each one has:
  - `code`: the random code in the QR URL. Five codes are already generated. If you change one, reprint that sign.
- `startCode`: the code for the START sign, also already generated. Set it to `""` if you don't want a start sign.
  - `name`: a fun display name.
  - `message`: a short message or mini challenge shown when the checkpoint is scanned.
  - `clue`: a hint about where the **next** checkpoint is. **Replace the sample clues with hints about your real landmarks.**

## 3. Deploy to GitHub Pages

1. Commit and push all the files to the `main` branch of this repo.
2. On GitHub, open the repo and go to **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Choose branch **main** and folder **/ (root)**, then click **Save**.
4. Wait 1 to 2 minutes. The site will be live at `https://ryanseidel.github.io/RunoClock-Halloween/`. Each time you push a change, it redeploys automatically within a minute or two.

## 4. Test before race day

Do this a few days before October 28.

1. **Local test (optional):** from the project folder, run `npx serve` (needs Node.js) or `python -m http.server 8000`, then open:
   - `http://localhost:8000/index.html?cp=hzknft` (checkpoint 1)
   - `http://localhost:8000/index.html?cp=a8urmn` (checkpoint 2)
   - `http://localhost:8000/index.html?cp=89u3p5` (checkpoint 3)
   - `http://localhost:8000/index.html?cp=79yfex` (checkpoint 4)
   - `http://localhost:8000/index.html?cp=jpt3wr` (checkpoint 5)
   - `http://localhost:8000/leaderboard.html`

   `npx serve` uses port 3000 instead of 8000.
2. **Test on the live site with your phone:** open `print.html` on your computer and scan each QR code from the screen with your phone. Check that:
   - the first scan asks for your name, and later scans don't
   - rescanning a checkpoint shows "Already got this one!" and doesn't add to your count
   - after all 5, the finish screen shows a time, and you appear on the leaderboard as complete
3. **Test the weak-signal path** in a desktop browser. Open DevTools, go to **Network**, right-click any request, and choose **Block request domain** (or use the **Network request blocking** panel to block `*supabase.co*`). Then open a checkpoint URL. You should still see the success screen, with "1 check-in saved on this phone, will sync when online". Unblock the domain, and within about 20 seconds the status should change to "✓ Synced".
4. **Test the tablet:** open `leaderboard.html` on the tablet you'll use at the start/finish and make sure it's readable from a few feet away.
5. **Clear your test data:**
   - On each test phone, open `index.html?reset=1` and confirm. This clears the saved name and progress.
   - In Supabase, open **SQL Editor** and run `delete from public.checkins;`. The SQL editor has full access, so it isn't blocked by the anon-only policies.

## 5. Print the QR codes

1. Open `https://ryanseidel.github.io/RunoClock-Halloween/print.html` in a desktop browser. If you open it from localhost, the codes will point to `baseUrl` in config.js, which is fine, but double-check that it's your live URL.
2. Scan each code on screen with your phone to confirm it opens the right checkpoint.
3. Click **Print all**. Use Letter paper, portrait orientation, "Default" margins, and 100% scale (turn off "Fit to page"). You'll get 7 pages, each with a QR code about 4¾ inches wide: the START sign for the start line, the 5 checkpoints, and a leaderboard sign for the start/finish area.
4. Weatherproof the signs if you can: use sheet protectors or laminate them. Avoid glossy plastic directly over the code in direct sun, because glare makes scanning harder. Mount them at chest height.

## Notes and limits

- **Progress is per phone.** A runner who switches phones or clears their browser data starts over. A different browser on the same phone, such as Chrome instead of the camera app's browser, also counts as a separate phone. Tell runners to use their normal camera app to scan every time.
- **It's honor-system security.** The random codes stop casual URL guessing, but the anon key is public, so someone determined could insert fake rows. For a club fun run, that's fine. If someone does, delete the bad rows in the SQL editor.
- The leaderboard shows each runner's most recent name. Two runners with the same name appear as two separate rows.
