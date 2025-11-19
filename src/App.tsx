import { useEffect, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import "./App.css";

// Assets (make sure these exist in src/assets)
import hitSfx from "./assets/hit.wav";
import missSfx from "./assets/miss.mp3";
import popSfx from "./assets/bunny-pop.mp3";
import bunnyImg from "./assets/bunny.png";
import avatarPlaceholder from "./assets/avatar-placeholder.png";

// Supabase client (if used for leaderboard)
import { supabase } from "./lib/supabaseClient";

// ---------- Constants ----------
const HOLES_COUNT = 9;
const GAME_DURATION = 30; // seconds
const BUNNY_INTERVAL = 700; // ms

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

// ---------- Main component ----------
export default function App() {
  // --- user
  const [currentUser, setCurrentUser] = useState<MiniAppUser | null>(null);

  // --- game state
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [activeHole, setActiveHole] = useState<number | null>(null);

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
        bunnyPopRef.current = new Audio(popSfx);
        if (bunnyPopRef.current) bunnyPopRef.current.volume = 0.5;

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
      {/* Navbar / Top bar */}
      <header className="top-bar">
        <div className="nav-left" ref={menuRef}>
          <button
            className={`menu-btn ${isMenuOpen ? "open" : ""}`}
            onClick={() => setIsMenuOpen((s) => !s)}
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-label="Open menu"
          ><i className="fi fi-br-menu-burger"></i>
          </button>
          {/* profile avatar only in topbar */}
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
          <button className="trophy-btn" onClick={handleOpenLeaderboard} aria-label="View leaderboard">🏆</button>
        </div>
      </header>

      {/* Panel info */}
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
                <button className="primary-btn large" onClick={startSequence}>Play game</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls: empty because overlay handles Play */}
      <div className="controls" aria-hidden={isPreStartOpen ? "true" : "false"} />

      {/* Result text (show when game is finished & overlay not covering) */}
      {!isPlaying && timeLeft === 0 && !isPreStartOpen && (
        <p className="result-text">Game over! Your score: {score}</p>
      )}

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
                  onClick={() => {
                    const text = `I scored ${scoreRef.current} in Hit The Bunny! 🎯`;
                    if ((navigator as any).share) {
                      (navigator as any).share({ title: "Hit The Bunny score", text }).catch(() => {});
                    } else {
                      navigator.clipboard?.writeText(text).then(() => {
                        alert("Score copied to clipboard!");
                      }).catch(() => {
                        alert("Unable to share — copy manually: " + text);
                      });
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
      <footer className="footer">
        0.1.6
      </footer>
    </div>
  );
}
