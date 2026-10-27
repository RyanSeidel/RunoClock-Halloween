// =====================================================================
//  SCAVENGER HUNT CONFIG — everything you'll want to edit lives here.
// =====================================================================
window.HUNT_CONFIG = {
  // Shown at the top of every page and on the printed QR signs.
  eventName: "RunO'Clock Scavenger Hunt",

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
  // Code for the FINISH sign at the finish line (index.html?cp=<finishCode>).
  // Scanning it stops the runner's clock; that's their time on the leaderboard.
  finishCode: "w3nd8k",

  startMessage: "⏱️ Your clock is running! Follow the chocolate river 🍫 and listen for a little orange worker with green hair. 🎶",

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
      name: "🍫 Wonka's Factory Floor 🍭",
      message: "🎶 Oompa loompa doompa-dee-doo, you found Checkpoint 1! 🎶 Mini challenge: Waddle like an Oompa Loompa for 10 steps! 🐧",
      clue: "🧔 Next, find a 542-year-old leader in a red hat 🎅 with a long white beard. He's feeling a little blue. 💙"
    },
    {
      code: "a8urmn",
      name: "🍄 Smurf Village 💙",
      message: "🍄 Welcome to the mushroom village! Mini challenge: say 'smurf' instead of one word in your next sentence. 💬",
      clue: "🌊 Next, seek the Water Hashira, a quiet swordsman ⚔️ who doesn't say much. 🤐"
    },
    {
      code: "89u3p5",
      name: "🌊 The Water Hashira's Post ⚔️",
      message: "🏃 Halfway there! Mini challenge: strike your best sword pose ⚔️. Total calm. No smiling. 😐",
      clue: "🔮 Double, double, toil and trouble. Next, find the one stirring the cauldron. 🧙"
    },
    {
      code: "79yfex",
      name: "🧙 The Witch's Cauldron 🧹",
      message: "🦵 Legs feeling wobbly? That's just the curse. 🪄 Mini challenge: cackle like a witch for 3 seconds! 🦇",
      clue: "🍄 Thank you, runner! But your princess is in another castle… 🏰 just up the road. 👑"
    },
    {
      code: "jpt3wr",
      name: "👑 Peach's Castle 🏰",
      message: "⭐ Last one! Mini challenge: do a Mario jump and yell 'Wahoo!' as you sprint in. 🍄",
      clue: "🎉 You saved the princess! Now sprint to the finish line 🏁 and scan the FINISH sign to stop your clock! ⏱️"
    }
  ]
};
