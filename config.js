// =====================================================================
//  SCAVENGER HUNT CONFIG — everything you'll want to edit lives here.
// =====================================================================
window.HUNT_CONFIG = {
  // Shown at the top of every page and on the printed QR signs.
  eventName: "Run Club Scavenger Hunt",

  // Public URL of the site, ending in a slash. The printed QR codes point here,
  // so set this BEFORE printing. (GitHub Pages: https://<user>.github.io/<repo>/)
  baseUrl: "https://ryanseidel.github.io/RunoClock-Halloween/",

  // From Supabase: Project Settings > Data API (URL) and Project Settings > API Keys
  // (the "anon" / "publishable" key). Both are safe to publish — Row Level Security
  // only lets visitors insert and read check-ins.
  supabaseUrl: "https://smqsehkworgiolzjjldg.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtcXNlaGt3b3JnaW9sempqbGRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzEzNzgsImV4cCI6MjEwODQ0NzM3OH0.1hwz6LlU_2HdKXvkvEqMleaFt4Uo9YOipoOViXsjxZ0",

  // true = spooky orange-and-black look, false = bright classic look.
  halloweenTheme: true,

  // Code for the START sign at the start line (index.html?cp=<startCode>).
  // Scanning it starts the runner's clock. Runners who skip it start their clock
  // at their first checkpoint. Set to "" to drop the start sign entirely.
  startCode: "tjpg7u",
  startMessage: "Your clock is running! Go find Checkpoint 1.",

  // How often the leaderboard reloads, and how often unsent check-ins retry.
  leaderboardRefreshSeconds: 15,
  syncRetrySeconds: 20,

  // The 5 checkpoints, in route order. "code" is what goes in the QR URL
  // (index.html?cp=<code>). These were randomly generated; if you change one,
  // reprint that checkpoint's QR code.
  // "message" is a fun note or mini challenge; "clue" hints at the NEXT checkpoint.
  // Replace the clues with hints about your real landmarks.
  checkpoints: [
    {
      code: "hzknft",
      name: "The Warm-Up Haunt",
      message: "You're off and running! Mini challenge: high-five the next runner you see.",
      clue: "Next, look for something that tells time but never runs."
    },
    {
      code: "a8urmn",
      name: "Pumpkin Patch Post",
      message: "Mini challenge: do your best zombie shuffle for 10 steps. Nobody's watching. Probably.",
      clue: "Water flows beneath your feet at the next stop. Cross with care!"
    },
    {
      code: "89u3p5",
      name: "Haunted Halfway",
      message: "Halfway there! Mini challenge: howl at the sky like a werewolf.",
      clue: "Seek the tallest tree that guards the path ahead."
    },
    {
      code: "79yfex",
      name: "Witch's Bend",
      message: "Legs feeling wobbly? That's just the curse. Mini challenge: 5 jumping jacks!",
      clue: "The final checkpoint waits where the path turns for home."
    },
    {
      code: "jpt3wr",
      name: "The Final Fright",
      message: "Last one! Sprint it in, you magnificent ghoul.",
      clue: "Head back to the start/finish and check the leaderboard!"
    }
  ]
};
