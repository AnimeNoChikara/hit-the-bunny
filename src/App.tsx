import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";

// Assets (make sure these exist in src/assets)
import hitSfx from "./assets/hit.wav";
import missSfx from "./assets/miss.mp3";
import bunnyImg from "./assets/bunny.png";
import avatarPlaceholder from "./assets/avatar-placeholder.png";

// Supabase client (if used for leaderboard)
import { supabase } from "./lib/supabaseClient";

// ---------- Constants ----------
const HOLES_COUNT = 9;
const GAME_DURATION = 30; // seconds
const BUNNY_INTERVAL = 700; // ms
const MIN_POINTS_TO_MINT = 500;

type Route = "home" | "tasks" | "nft";

// ---------- Types ----------
type MiniAppUser = {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type LeaderboardEntry = {
  fid: number;
  username: string | null;
  display_name: string | null;
  best_score: number;
};

function BottomNav({ route, setRoute }: { route: Route; setRoute: (r: Route) => void; points: number }) {
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      <button className={`nav-item ${route === "home" ? "active" : ""}`} onClick={() => setRoute("home")} aria-label="Home">
        <img width="50" height="50" src="https://img.icons8.com/?size=100&id=NOLgNDi7UQdG&format=png&color=000000" alt="Home"/>
        <span>Home</span>
      </button>

      <button disabled className={`nav-item ${route === "tasks" ? "active" : ""}`} onClick={() => setRoute("tasks")} aria-label="Tasks">
        <img width="50" height="50" src="https://img.icons8.com/?size=100&id=HUj2B8hq1xUW&format=png&color=000000" alt="task"/>
        <span>Tasks</span>
      </button>

      <button disabled className={`nav-item ${route === "nft" ? "active" : ""}`} onClick={() => setRoute("nft")} aria-label="NFT">
        <img width="50" height="50" src="https://img.icons8.com/?size=100&id=SxB3taNaJxYE&format=png&color=000000" alt="NFT"/>
        <span>NFT</span>
      </button>
    </nav>
  );
}

// ---------- Page components ----------

function TasksPage({ points, onCompleteTask, onClaimPoints }: { points: number; onCompleteTask: (taskId: string) => void; onClaimPoints: (amt?: number) => void; }) {
  const tasks = [
    { id: "t1", title: "Daily login", points: 10, desc: "Login daily to earn points." },
    { id: "t2", title: "Play a match", points: 5, desc: "Finish one game." },
    { id: "t3", title: "Share score", points: 15, desc: "Share your score on Farcaster." },
  ];

  return (
    <div className="page page-tasks">
      <h3>Tasks & Points</h3>

      <div className="points-overview">
        <div>
          <div className="points-label">Your BUNNY Points</div>
          <div className="points-value">{points} pts</div>
        </div>
        <div className="points-actions">
          <button className="secondary-btn" onClick={() => onClaimPoints()} aria-label="View history">View history</button>
        </div>
      </div>

      <div className="tasks-list">
        {tasks.map((t) => (
          <div key={t.id} className="task-row">
            <div className="task-main">
              <div className="task-title">{t.title}</div>
              <div className="task-desc">{t.desc}</div>
            </div>
            <div className="task-actions">
              <div className="task-points">+{t.points}</div>
              <button className="primary-btn" onClick={() => onCompleteTask(t.id)}>Complete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NFTPage({ points, onMint, isMinting }: { points: number; onMint: () => Promise<void> | void; isMinting: boolean; }) {
  const eligible = points >= MIN_POINTS_TO_MINT;
  return (
    <div className="page page-nft">
      <h3>Mint NFT</h3>
      <p>Mint exclusive NFT when you reach at least <strong>{MIN_POINTS_TO_MINT} BUNNY points</strong>.</p>

      <div className="mint-card">
        <div className="mint-preview">🎨</div>
        <div className="mint-info">
          <div className="mint-title">Exclusive Bunny Token</div>
          <div className="mint-req">Required: {MIN_POINTS_TO_MINT} pts</div>
          <div className="mint-status">{eligible ? "You are eligible!" : `You need ${MIN_POINTS_TO_MINT - points} more points`}</div>
          <button className="primary-btn" disabled={!eligible || isMinting} onClick={() => onMint()}>
            {isMinting ? "Minting..." : eligible ? "Mint NFT" : "Not eligible"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------- Main component ----------
export default function App() {
  // --- user
  const [currentUser, setCurrentUser] = useState<MiniAppUser | null>(null);
  // game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);


  // routing & points
  const [route, setRoute] = useState<Route>("home");
  const [points, setPoints] = useState<number>(0);


  // minting
  const [isMinting, setIsMinting] = useState(false);

  // --- minting
  const handleMint = async () => {
    if (points < MIN_POINTS_TO_MINT) return;
    setIsMinting(true);
    try {
      // ===== PLACEHOLDER =====
      // Insert your mint logic here: call backend, sign tx, etc.
      // For demo we'll simulate network delay:
      await new Promise((res) => setTimeout(res, 1500));

      // On success: deduct points (or mark claimed)
      const newPoints = points - MIN_POINTS_TO_MINT;
      setPoints(newPoints);

      // optional: persist to supabase: upsert player_rewards with new unclaimed_points
      // await supabase.from('player_rewards').upsert({ fid: currentUser.fid, unclaimed_points: newPoints }, { onConflict: 'fid' });

      alert("Mint successful! Congratulations 🎉");
      // redirect to NFT page / show minted token link
    } catch (e) {
      console.error("mint failed", e);
      alert("Mint failed — please try again.");
    } finally {
      setIsMinting(false);
    }
  };

  // refs for timers
  const timerRef = useRef<number | null>(null);
  const bunnyRef = useRef<number | null>(null);

  // audio refs
  const bunnyPopRef = useRef<HTMLAudioElement | null>(null);
  const hitRef = useRef<HTMLAudioElement | null>(null);
  const missRef = useRef<HTMLAudioElement | null>(null);

  // score ref (for reading latest value in async functions)
  const scoreRef = useRef<number>(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // --- leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // --- pre-start & countdown
  const [isPreStartOpen, setIsPreStartOpen] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  // --- congrats modal
  const [isCongratsOpen, setIsCongratsOpen] = useState(false);

  // Beta notice popup
  const [showBetaNotice, setShowBetaNotice] = useState(true);


  // --- navbar / menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // close menu when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!isMenuOpen) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isMenuOpen]);

  // ---------- INIT: sdk + user + audio ----------
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await sdk.actions.ready();
      } catch (e) {
        // normal when running locally
      }

      try {
        const inMiniApp = await sdk.isInMiniApp();
        if (inMiniApp) {
          const context = await sdk.context;
          if (context?.user?.fid && mounted) {
            const u = context.user as MiniAppUser;
            setCurrentUser({
              fid: u.fid,
              username: u.username,
              displayName: u.displayName,
              pfpUrl: u.pfpUrl,
            });
          }
        }
      } catch (e) {
        console.warn("[init] failed to get sdk.context:", e);
      }

      // init audio
      try {
        hitRef.current = new Audio(hitSfx);
        if (hitRef.current) hitRef.current.volume = 0.8;

        missRef.current = new Audio(missSfx);
        if (missRef.current) missRef.current.volume = 0.4;
      } catch (e) {
        console.warn("[init] audio init failed", e);
      }
    };

    void init();

    return () => {
      mounted = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (bunnyRef.current) window.clearInterval(bunnyRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);

      [bunnyPopRef.current, hitRef.current, missRef.current].forEach((a) => {
        try {
          a?.pause();
          a?.removeAttribute("src");
        } catch {}
      });
    };
  }, []);

  // ---------- game timer (auto stop) ----------
  useEffect(() => {
    if (!isPlaying) return;

    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          void stopGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying]);

  // ---------- bunny movement ----------
  useEffect(() => {
    if (!isPlaying) return;

    if (bunnyRef.current) window.clearInterval(bunnyRef.current);

    bunnyRef.current = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * HOLES_COUNT);
      setActiveHole(randomIndex);

      if (bunnyPopRef.current) {
        bunnyPopRef.current.currentTime = 0;
        void bunnyPopRef.current.play().catch(() => {});
      }
    }, BUNNY_INTERVAL);

    return () => {
      if (bunnyRef.current) window.clearInterval(bunnyRef.current);
    };
  }, [isPlaying]);

  // ---------- leaderboard (load when opened) ----------
  useEffect(() => {
    if (!isLeaderboardOpen) return;
    void refreshLeaderboard();
  }, [isLeaderboardOpen]);

  // ---------- start sequence (countdown -> start) ----------
  const startSequence = () => {
    if (!currentUser) {
      alert("Open this game inside Farcaster/Base to have your account recognized 🟣");
      return;
    }

    setCountdown(3);
    if (countdownRef.current) window.clearInterval(countdownRef.current);

    countdownRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (!c) return null;
        if (c <= 1) {
          if (countdownRef.current) window.clearInterval(countdownRef.current);
          setCountdown(null);
          setIsPreStartOpen(false);
          // reset & start
          setScore(0);
          setTimeLeft(GAME_DURATION);
          setIsPlaying(true);
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  // ---------- stop game (no reward UI) ----------
  const stopGame = async () => {
    console.log("[stopGame] called, score (state):", scoreRef.current);

    setIsPlaying(false);
    setActiveHole(null);

    if (timerRef.current) window.clearInterval(timerRef.current);
    if (bunnyRef.current) window.clearInterval(bunnyRef.current);

    await saveScoreToLeaderboard();

    // Show professional congratulations modal
    setIsCongratsOpen(true);
  };

  const handleCompleteTask = async (taskId: string) => {
  // contoh: map task id ke poin
    const mapping: Record<string, number> = { t1: 10, t2: 5, t3: 15 };
    const reward = mapping[taskId] ?? 0;
    const newPoints = points + reward;
    setPoints(newPoints);

    // optional: persist to supabase
    try {
      if (currentUser) {
        await supabase
          .from("player_rewards")
          .upsert({ fid: currentUser.fid, unclaimed_points: newPoints }, { onConflict: "fid" });
      }
    } catch (e) {
      console.warn("persist rewards failed", e);
    }

    alert(`Task completed — you earned ${reward} points!`);
  };

  const handleClaimPoints = (amt?: number) => {
    // placeholder: open modal or show history
    alert("Feature coming soon: claim / withdraw points");
    console.log("Claiming:", amt); // now amt is used
  };


  // ---------- hole click ----------
  const handleHoleClick = (index: number) => {
    if (!isPlaying) return;

    if (index === activeHole) {
      setScore((s) => s + 1);
      setActiveHole(null);

      if (hitRef.current) {
        hitRef.current.currentTime = 0;
        void hitRef.current.play().catch(() => {});
      }
    } else {
      if (missRef.current) {
        missRef.current.currentTime = 0;
        void missRef.current.play().catch(() => {});
      }
    }
  };

  const handleOpenLeaderboard = () => setIsLeaderboardOpen(true);
  const handleCloseLeaderboard = () => {
    setIsLeaderboardOpen(false);
    setIsPreStartOpen(true);
    setCountdown(null);
    setTimeLeft(GAME_DURATION);
  };

  const progressPercent = (timeLeft / GAME_DURATION) * 100;

  // ---------- Supabase: leaderboard helpers ----------
  const refreshLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("fid, username, display_name, best_score")
        .order("best_score", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[refreshLeaderboard] error:", error);
        return;
      }

      setLeaderboard((data as LeaderboardEntry[]) || []);
    } catch (e) {
      console.error("[refreshLeaderboard] unexpected:", e);
    }
  };

  const saveScoreToLeaderboard = async () => {
    const finalScore = scoreRef.current;
    if (!currentUser) return;
    if (finalScore <= 0) return;

    const fid = currentUser.fid;
    const username = currentUser.username ?? null;
    const displayName = currentUser.displayName ?? null;

    try {
      const { data: existing, error: fetchError } = await supabase
        .from("leaderboard")
        .select("best_score")
        .eq("fid", fid)
        .maybeSingle();

      if (fetchError) {
        console.error("[saveScoreToLeaderboard] fetch error:", fetchError);
        return;
      }

      const existingBest = existing?.best_score ?? 0;
      if (finalScore <= existingBest) return;

      const { error: upsertError } = await supabase
        .from("leaderboard")
        .upsert(
          {
            fid,
            username,
            display_name: displayName,
            best_score: finalScore,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "fid" }
        );

      if (upsertError) {
        console.error("[saveScoreToLeaderboard] upsert error:", upsertError);
        return;
      }

      await refreshLeaderboard();
    } catch (e) {
      console.error("[saveScoreToLeaderboard] unexpected:", e);
    }
  };



  // ---------- render ----------
  return (
    <div className="app">
      {route === "home" && (
      <>
      {/* Navbar / Top bar */}
      <header className="top-bar">
        <div className="nav-left" ref={menuRef}>
          <button
            className="avatar-btn"
            onClick={() => setIsMenuOpen((s) => !s)}
            aria-label="Open profile menu"
          >
            <img
              src={currentUser?.pfpUrl ?? avatarPlaceholder}
              alt={currentUser?.displayName ?? currentUser?.username ?? "Profile"}
              className="top-avatar"
              onError={(e) => ((e.target as HTMLImageElement).src = avatarPlaceholder)}
            />
          </button>

          {/* dropdown menu (shows when isMenuOpen) */}
          {isMenuOpen && (
            <div className="menu-dropdown" role="menu">
              <div className="profile-card">
                <img
                  src={currentUser?.pfpUrl ?? avatarPlaceholder}
                  alt={currentUser?.displayName ?? currentUser?.username ?? "Profile"}
                  className="menu-avatar"
                  onError={(e) => ((e.target as HTMLImageElement).src = avatarPlaceholder)}
                />
                <div className="profile-info">
                  <div className="profile-name">{currentUser?.displayName ?? currentUser?.username ?? "Guest"}</div>
                  <div className="profile-handle">{currentUser?.username ? `@${currentUser.username}` : "@guest"}</div>
                  <div className="profile-fid">fid {currentUser?.fid ?? "-"}</div>
                </div>
              </div>
              <div className="menu-rewards">
                <div className="gift"><button className="gift"><i className="fa-solid fa-gift">  Rewards</i> (coming soon)</button></div>
              </div>
            </div>
          )}
        </div>

        <div className="nav-right">
          <button className="trophy-btn" onClick={handleOpenLeaderboard} aria-label="View leaderboard"><img width="40" height="40" src="https://img.icons8.com/arcade/64/trophy.png" alt="trophy"/></button>
        </div>
      </header>
      <section className="panel">
        <div className="info-bar">
          <div className="info-item">
            <span className="info-label">Time</span>
            <span className="info-value">{timeLeft}s</span>
          </div>
          <div className="info-item">
            <span className="info-label">Score</span>
            <span className="info-value">{score}</span>
          </div>
        </div>

        <div className="progress-wrapper">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </section>

      {/* Game area wrapper: local overlay only covers game card */}
      <div className="game-area-wrapper">
        <main className={`game-card ${((countdown !== null && countdown > 0) || isPreStartOpen) ? "blurred" : ""}`}>
          <div className="grid">
            {Array.from({ length: HOLES_COUNT }).map((_, index) => (
              <button
                key={index}
                className={`hole ${activeHole === index ? "active" : ""}`}
                onClick={() => handleHoleClick(index)}
                aria-label={`Hole ${index + 1}`}
              >
                {activeHole === index && (
                  <img src={bunnyImg} alt="Bunny" className="bunny bunny-in bunny-img" draggable={false} />
                )}
              </button>
            ))}
          </div>
      </main>

      {/* local overlay (only above game-card) */}
      {(isPreStartOpen || countdown) && (
        <div className="prestart-overlay local" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className={`prestart-card ${countdown ? "countdown-mode" : ""}`}>
            {countdown ? (
              <div className="countdown" aria-live="polite">{countdown}</div>
            ) : (
              <button className="primary-btn large" onClick={startSequence}>PLAY<img width="30" height="30" src="https://img.icons8.com/arcade/64/controller.png" alt="controller"/></button>
            )}
          </div>
        </div>
      )}
      </div>
      </> 
  )}
      <main className="content-area">
        {route === "home" && null /* or keep HomePage content if you have */ }
        {route === "tasks" && (
        <TasksPage
          points={points}
          onCompleteTask={handleCompleteTask}
          onClaimPoints={(amt?: number) => handleClaimPoints(amt)}
        />
      )}
        {route === "nft" && (<NFTPage points={points} onMint={handleMint} isMinting={isMinting} />)}
      </main>

      <BottomNav route={route} setRoute={setRoute} points={points} />
      
      {/* Controls: empty because overlay handles Play */}
      <div className="controls" aria-hidden={isPreStartOpen ? "true" : "false"} />
      {/* Leaderboard modal */}
      {isLeaderboardOpen && (
        <div className="modal-backdrop" onClick={handleCloseLeaderboard}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Leaderboard 🏆</h2>
              <button className="modal-close" onClick={handleCloseLeaderboard} aria-label="Close leaderboard">✕</button>
            </div>

            {leaderboard.length === 0 ? (
              <p className="modal-empty">No scores yet. Be the first!</p>
            ) : (
              <ul className="leaderboard-list">
                {leaderboard.map((entry, idx) => (
                  <li key={entry.fid} className="leaderboard-item">
                    <span className="lb-rank">{idx + 1}</span>
                    <span className="lb-name">{entry.display_name || entry.username || `fid ${entry.fid}`}</span>
                    <span className="lb-score">{entry.best_score}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Congratulations modal (professional) */}
      {isCongratsOpen && (
        <div className="modal-backdrop" onClick={() => setIsCongratsOpen(false)} role="dialog" aria-modal="true">
          <div className="congrats-modal" onClick={(e) => e.stopPropagation()} role="document" aria-labelledby="congrats-title">
            <div className="congrats-hero">
              <div className="congrats-trophy">🏆</div>
            </div>

            <div className="congrats-body">
              <h2 id="congrats-title" className="congrats-title">Congratulations! You did it 🎉</h2>
              <p className="congrats-sub">The round is over — your final score:</p>

              <div className="congrats-score" aria-live="polite">{scoreRef.current}</div>

              <p className="congrats-note">Great job! Try again to beat your record — or check the leaderboard.</p>

              <div className="congrats-actions">
                <button
                  className="primary-btn"
                  onClick={() => {
                    setIsCongratsOpen(false);
                    setIsPreStartOpen(true);
                    setTimeLeft(GAME_DURATION);
                  }}
                >
                  Play again
                </button>

                <button
                  className="secondary-btn"
                  onClick={() => {
                    setIsCongratsOpen(false);
                    setIsLeaderboardOpen(true);
                  }}
                >
                  View leaderboard
                </button>

                <button
                  className="secondary-btn"
                  onClick={async () => {
                    try {
                      const text = `I scored ${scoreRef.current} in Hit The Bunny! 🎯 Play Now and Earn The Future Reward https://hit-the-bunny.vercel.app/`;
                      const embeds = ["https://hit-the-bunny.vercel.app/"] as [string];
                      const res = await sdk.actions.composeCast({ text, embeds });
                      if (res?.cast) {
                        alert("Cast posted! 🎉");
                      } else {
                        // user cancelled
                        console.log("compose cancelled");
                      }
                    } catch (e) {
                      console.error(e);
                      // fallback: postMessage or copy text
                      const fallbackText = `I scored ${scoreRef.current} in Hit The Bunny! 🎯 https://hit-the-bunny.vercel.app/`;
                      try {
                        window.parent.postMessage({ type: "createCast", data: { cast: { text: fallbackText } } }, "*");
                      } catch {
                        await navigator.clipboard.writeText(fallbackText);
                        alert("Couldn't open composer — score copied to clipboard.");
                      }
                    }
                  }}
                >
                  Share
                </button>

              </div>
            </div>
            <button className="modal-close" aria-label="Close congratulations" onClick={() => setIsCongratsOpen(false)}>✕</button>
          </div>
        </div>
      )}
      {showBetaNotice && (
        <div className="beta-backdrop" onClick={() => setShowBetaNotice(false)}>
          <div className="beta-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="beta-title">Beta Notice</h2>
            <p className="beta-text">
              This application is currently in beta and still under active development.
              You may encounter bugs or unfinished features.
            </p>

            <button
              className="beta-btn"
              onClick={() => setShowBetaNotice(false)}
            >
              I Understand
            </button>
          </div>
        </div>
      )}

    </div>
  );
}