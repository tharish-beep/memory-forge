import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

// ============================================================================
// STORAGE KEYS
// ============================================================================
const STORAGE_KEY = "sm2_flashcards_v2";
const HISTORY_KEY = "sm2_review_history_v2";
const SETTINGS_KEY = "sm2_settings_v2";
const DECKS_KEY = "sm2_decks_v2";
const THEME_KEY = "sm2_theme_v2";

// ============================================================================
// CONSTANTS
// ============================================================================
const DEFAULT_SETTINGS = {
  dailyReviewLimit: 100,
  newCardsPerDay: 20
};

const DEFAULT_DECK = {
  id: "default",
  name: "Default Deck",
  icon: "📚",
  createdAt: new Date().toISOString()
};

const THEME_PRESETS = {
  black: {
    bgPrimary: "#000000",
    bgSecondary: "#0d0d0d",
    bgCard: "#141414",
    bgCardHover: "#1b1b1b",
    borderColor: "#2a2a2a",
    textPrimary: "#f5f5f5",
    textSecondary: "#a0a0a0",
    textMuted: "#707070",
    ringBg: "#1c1c1c",
    accent: "#7c5cff",
    accentLight: "#9d7fff",
    accentGlow: "rgba(124, 92, 255, 0.3)",
    accentGradient: "linear-gradient(135deg, #7c5cff, #5c8cff)"
  },
  white: {
    bgPrimary: "#ffffff",
    bgSecondary: "#f5f5f7",
    bgCard: "#ffffff",
    bgCardHover: "#f0f0f3",
    borderColor: "#d7d7de",
    textPrimary: "#16161a",
    textSecondary: "#45454d",
    textMuted: "#777786",
    ringBg: "#e4e4ea",
    accent: "#4b57d1",
    accentLight: "#6672ea",
    accentGlow: "rgba(75, 87, 209, 0.22)",
    accentGradient: "linear-gradient(135deg, #4b57d1, #6f8cff)"
  },
  purple: {
    bgPrimary: "#120a1f",
    bgSecondary: "#1a1029",
    bgCard: "#221537",
    bgCardHover: "#2a1c44",
    borderColor: "#3d2a5a",
    textPrimary: "#f2ebff",
    textSecondary: "#b39ccf",
    textMuted: "#8b78a6",
    ringBg: "#2a1d3f",
    accent: "#8a4dff",
    accentLight: "#b088ff",
    accentGlow: "rgba(138, 77, 255, 0.3)",
    accentGradient: "linear-gradient(135deg, #8a4dff, #6f7cff)"
  },
  blue: {
    bgPrimary: "#071425",
    bgSecondary: "#0c1c33",
    bgCard: "#122744",
    bgCardHover: "#183253",
    borderColor: "#294a72",
    textPrimary: "#e8f2ff",
    textSecondary: "#9bb9de",
    textMuted: "#7390b2",
    ringBg: "#193150",
    accent: "#2f80ff",
    accentLight: "#68a6ff",
    accentGlow: "rgba(47, 128, 255, 0.3)",
    accentGradient: "linear-gradient(135deg, #2f80ff, #45c2ff)"
  },
  "rose-gold": {
    bgPrimary: "#201617",
    bgSecondary: "#2a1d1e",
    bgCard: "#352728",
    bgCardHover: "#433132",
    borderColor: "#5a4344",
    textPrimary: "#fff3f1",
    textSecondary: "#d8b8b1",
    textMuted: "#b1918a",
    ringBg: "#3b2b2c",
    accent: "#c27a7a",
    accentLight: "#d79a9a",
    accentGlow: "rgba(194, 122, 122, 0.3)",
    accentGradient: "linear-gradient(135deg, #c27a7a, #d6a58f)"
  },
  green: {
    bgPrimary: "#08160f",
    bgSecondary: "#0e2117",
    bgCard: "#153023",
    bgCardHover: "#1b3d2d",
    borderColor: "#295540",
    textPrimary: "#e9fff3",
    textSecondary: "#9fceb5",
    textMuted: "#79a88f",
    ringBg: "#1c3b2d",
    accent: "#2ea86b",
    accentLight: "#64c991",
    accentGlow: "rgba(46, 168, 107, 0.3)",
    accentGradient: "linear-gradient(135deg, #2ea86b, #4fd39a)"
  },
  orange: {
    bgPrimary: "#1f1208",
    bgSecondary: "#2b1a0e",
    bgCard: "#382312",
    bgCardHover: "#472d18",
    borderColor: "#5d3f24",
    textPrimary: "#fff3e8",
    textSecondary: "#d9b79b",
    textMuted: "#b48e73",
    ringBg: "#3f2918",
    accent: "#ff8a3d",
    accentLight: "#ffb070",
    accentGlow: "rgba(255, 138, 61, 0.3)",
    accentGradient: "linear-gradient(135deg, #ff8a3d, #ffb347)"
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getDateKey(date = new Date()) {
  return date.toISOString().split("T")[0];
}

function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

function getDaysFromNowDate(days) {
  const future = new Date();
  future.setDate(future.getDate() + days);
  future.setHours(0, 0, 0, 0);
  return future.toISOString();
}

function hasCloze(text) {
  return /\{\{[^{}]+\}\}/.test(text || "");
}

function renderClozeText(text, reveal) {
  const source = text || "";
  const parts = source.split(/(\{\{[^{}]+\}\})/g).filter(Boolean);
  return parts.map((part, index) => {
    if (/^\{\{[^{}]+\}\}$/.test(part)) {
      const clozeContent = part.slice(2, -2);
      return reveal ? (
        <span key={index} className="cloze-highlight">
          {clozeContent}
        </span>
      ) : (
        <span key={index} className="cloze-blank">
          ___
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function createCard(front, back, type = "regular", deckId = "default") {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    front,
    back,
    type,
    deckId,
    state: "new",
    learningStep: 0,
    interval: 1,
    easeFactor: 2.5,
    dueTime: null,
    nextReview: null,
    lapses: 0,
    reviews: [],
    notes: "",
    createdAt: now
  };
}

function recordReview(history) {
  const today = getDateKey();
  return { ...history, [today]: (history[today] || 0) + 1 };
}

// ============================================================================
// REVIEW ENGINE - Core State Transition Logic
// ============================================================================
function applyRating(card, rating) {
  const now = Date.now();
  const updated = { ...card };
  updated.reviews = [...(card.reviews || []), { date: new Date().toISOString(), rating }];

  if (card.state === "new") {
    if (rating === "easy") {
      // Graduate immediately to review with 4 day interval
      updated.state = "review";
      updated.learningStep = null;
      updated.interval = 4;
      updated.nextReview = getDaysFromNowDate(4);
      updated.dueTime = null;
    } else if (rating === "good") {
      // Start learning step 0 (will advance to step 1)
      updated.state = "learning";
      updated.learningStep = 0;
      updated.dueTime = now + 60 * 1000; // 1 minute
      updated.nextReview = null;
    } else if (rating === "hard") {
      // Start learning but with 6 min interval
      updated.state = "learning";
      updated.learningStep = 0;
      updated.dueTime = now + 6 * 60 * 1000;
      updated.nextReview = null;
    } else {
      // Again
      updated.state = "learning";
      updated.learningStep = 0;
      updated.dueTime = now + 60 * 1000;
      updated.nextReview = null;
      updated.lapses = (updated.lapses || 0) + 1;
    }
  } else if (card.state === "learning") {
    if (rating === "again") {
      updated.learningStep = 0;
      updated.dueTime = now + 60 * 1000;
      updated.lapses = (updated.lapses || 0) + 1;
    } else if (rating === "hard") {
      // Keep current step, 6 min interval
      updated.dueTime = now + 6 * 60 * 1000;
    } else if (rating === "good") {
      if (updated.learningStep === 0) {
        // Advance to step 1, 10 min interval
        updated.learningStep = 1;
        updated.dueTime = now + 10 * 60 * 1000;
      } else {
        // Graduate to review
        updated.state = "review";
        updated.learningStep = null;
        updated.interval = 1;
        updated.nextReview = getTomorrowDate();
        updated.dueTime = null;
      }
    } else if (rating === "easy") {
      // Graduate immediately with 4 day interval
      updated.state = "review";
      updated.learningStep = null;
      updated.interval = 4;
      updated.nextReview = getDaysFromNowDate(4);
      updated.dueTime = null;
    }
  } else if (card.state === "review") {
    if (rating === "again") {
      // Lapse - back to learning
      updated.state = "learning";
      updated.learningStep = 0;
      updated.dueTime = now + 60 * 1000;
      updated.nextReview = null;
      updated.lapses = (updated.lapses || 0) + 1;
    } else if (rating === "hard") {
      updated.interval = Math.max(1, Math.round(updated.interval * 1.2));
      updated.easeFactor = Math.max(1.3, updated.easeFactor * 0.85);
      updated.nextReview = getDaysFromNowDate(updated.interval);
    } else if (rating === "good") {
      updated.interval = Math.max(1, Math.round(updated.interval * updated.easeFactor));
      updated.nextReview = getDaysFromNowDate(updated.interval);
    } else if (rating === "easy") {
      updated.interval = Math.max(1, Math.round(updated.interval * updated.easeFactor * 1.3));
      updated.easeFactor = Math.min(2.5, updated.easeFactor + 0.15);
      updated.nextReview = getDaysFromNowDate(updated.interval);
    }
  }

  return updated;
}

function getButtonIntervals(card) {
  const now = Date.now();
  
  if (card.state === "new") {
    return {
      again: "< 1m",
      hard: "6m",
      good: "1m",
      easy: "4d"
    };
  } else if (card.state === "learning") {
    if (card.learningStep === 0) {
      return {
        again: "< 1m",
        hard: "6m",
        good: "10m",
        easy: "4d"
      };
    } else {
      return {
        again: "< 1m",
        hard: "6m",
        good: "Graduate",
        easy: "4d"
      };
    }
  } else {
    // Review card - simulate the intervals
    const simAgain = applyRating(card, "again");
    const simHard = applyRating(card, "hard");
    const simGood = applyRating(card, "good");
    const simEasy = applyRating(card, "easy");
    
    return {
      again: "< 1m",
      hard: `${simHard.interval}d`,
      good: `${simGood.interval}d`,
      easy: `${simEasy.interval}d`
    };
  }
}

// ============================================================================
// LOCAL STORAGE
// ============================================================================
function loadLocalCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function loadLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadLocalDecks() {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    const decks = raw ? JSON.parse(raw) : [DEFAULT_DECK];
    if (!decks.find((d) => d.id === "default")) {
      decks.unshift(DEFAULT_DECK);
    }
    return decks;
  } catch {
    return [DEFAULT_DECK];
  }
}

function saveLocalDecks(decks) {
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

function loadLocalTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw && THEME_PRESETS[raw] ? raw : "black";
  } catch {
    return "black";
  }
}

function saveLocalTheme(themeName) {
  localStorage.setItem(THEME_KEY, themeName);
}

// ============================================================================
// STATS VIEW COMPONENT
// ============================================================================
function StatsView({ history, cards }) {
  const todayKey = getDateKey();
  const todayCount = history[todayKey] || 0;

  const last30Days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    last30Days.push({ date: key, count: history[key] || 0 });
  }

  const totalReviews = Object.values(history).reduce((sum, count) => sum + count, 0);
  const daysWithReviews = Object.keys(history).length;
  const avgPerDay = daysWithReviews > 0 ? (totalReviews / daysWithReviews).toFixed(1) : 0;

  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    if (history[key]) streak++;
    else break;
  }

  const maxCount = Math.max(...last30Days.map((d) => d.count), 1);

  return (
    <div className="stats-container">
      <h2>Statistics</h2>
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{todayCount}</div>
          <div className="stat-label">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalReviews}</div>
          <div className="stat-label">Total Reviews</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{avgPerDay}</div>
          <div className="stat-label">Avg/Day</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{streak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
      </div>

      <h3>Last 30 Days</h3>
      <div className="chart-container">
        {last30Days.map((d) => (
          <div key={d.date} className="chart-bar-wrapper">
            <div
              className="chart-bar"
              style={{ height: `${(d.count / maxCount) * 150}px` }}
              title={`${d.date}: ${d.count} reviews`}
            />
            <div className="chart-bar-label">{d.count || ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// AUTH VIEW COMPONENT
// ============================================================================
function AuthView({ onSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-form">
        <h2>{isSignUp ? "Sign Up" : "Sign In"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? "Already have an account?" : "Create new account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [decks, setDecks] = useState([DEFAULT_DECK]);
  const [reviewHistory, setReviewHistory] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [themeName, setThemeName] = useState("black");
  const [currentView, setCurrentView] = useState("decks");
  const [studying, setStudying] = useState(false);
  const [studyingDeckId, setStudyingDeckId] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  // Add card form
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("default");
  const [cardMode, setCardMode] = useState("regular");
  const [bulkText, setBulkText] = useState("");

  // Deck creation
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckIcon, setNewDeckIcon] = useState("📖");

  // Browse view
  const [searchQuery, setSearchQuery] = useState("");

  // Edit modal
  const [editingCard, setEditingCard] = useState(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Notes during review
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Session queue
  const [sessionQueue, setSessionQueue] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());

  const fileInputRefs = useRef({});

  // ============================================================================
  // AUTH OBSERVER
  // ============================================================================
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (!u) {
        setCards(loadLocalCards());
        setDecks(loadLocalDecks());
        setReviewHistory(loadLocalHistory());
        setSettings(loadLocalSettings());
        setThemeName(loadLocalTheme());
      }
    });
    return unsub;
  }, []);

  // ============================================================================
  // FIREBASE SYNC (REAL-TIME LISTENER)
  // ============================================================================
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setCards(d.cards || []);
        const loadedDecks = d.decks || [DEFAULT_DECK];
        if (!loadedDecks.find((dk) => dk.id === "default")) loadedDecks.unshift(DEFAULT_DECK);
        setDecks(loadedDecks);
        setReviewHistory(d.reviewHistory || {});
        setSettings({ ...DEFAULT_SETTINGS, ...d.settings });
        setThemeName(d.theme && THEME_PRESETS[d.theme] ? d.theme : loadLocalTheme());
      } else {
        // New user - no cloud data yet
        const lc = loadLocalCards();
        const ld = loadLocalDecks();
        const lh = loadLocalHistory();
        const ls = loadLocalSettings();
        const lt = loadLocalTheme();
        setCards(lc);
        setDecks(ld);
        setReviewHistory(lh);
        setSettings(ls);
        setThemeName(lt);
      }
    });
    return unsub;
  }, [user]);

  // ============================================================================
  // THEME APPLICATION
  // ============================================================================
  useEffect(() => {
    const preset = THEME_PRESETS[themeName] || THEME_PRESETS.black;
    const root = document.documentElement;
    root.style.setProperty("--bg-primary", preset.bgPrimary);
    root.style.setProperty("--bg-secondary", preset.bgSecondary);
    root.style.setProperty("--bg-card", preset.bgCard);
    root.style.setProperty("--bg-card-hover", preset.bgCardHover);
    root.style.setProperty("--border-color", preset.borderColor);
    root.style.setProperty("--text-primary", preset.textPrimary);
    root.style.setProperty("--text-secondary", preset.textSecondary);
    root.style.setProperty("--text-muted", preset.textMuted);
    root.style.setProperty("--ring-bg", preset.ringBg);
    root.style.setProperty("--accent", preset.accent);
    root.style.setProperty("--accent-light", preset.accentLight);
    root.style.setProperty("--accent-glow", preset.accentGlow);
    root.style.setProperty("--accent-gradient", preset.accentGradient);
    saveLocalTheme(themeName);
  }, [themeName]);

  // ============================================================================
  // BEFORE UNLOAD SYNC
  // ============================================================================
  useEffect(() => {
    const handleBeforeUnload = () => {
      persistLocal();
      if (user) {
        syncToCloud(false);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user, cards, decks, reviewHistory, settings, themeName]);

  // ============================================================================
  // SESSION QUEUE BUILDER & 5-SECOND POLLING
  // ============================================================================
  useEffect(() => {
    if (!studying) return;

    // Initial queue build
    buildQueue();

    // 5-second polling to reinsert due learning cards
    const interval = setInterval(() => {
      setNowTick(Date.now());
      const now = Date.now();
      const deckCards = studyingDeckId
        ? cards.filter((c) => (c.deckId || "default") === studyingDeckId)
        : cards;

      // Find learning cards that are now due but not in queue
      const queueIds = new Set(sessionQueue.map((c) => c.id));
      const dueLearning = deckCards.filter(
        (c) =>
          c.state === "learning" &&
          c.dueTime !== null &&
          c.dueTime <= now &&
          !queueIds.has(c.id)
      );

      if (dueLearning.length > 0) {
        // Insert at front of queue
        setSessionQueue((prev) => [...dueLearning, ...prev]);
      }

      // Check if session should end
      checkSessionEnd();
    }, 5000);

    return () => clearInterval(interval);
  }, [studying, studyingDeckId, cards]);

  function buildQueue() {
    const now = Date.now();
    const deckCards = studyingDeckId
      ? cards.filter((c) => (c.deckId || "default") === studyingDeckId)
      : cards;

    const newCards = deckCards.filter((c) => c.state === "new").slice(0, settings.newCardsPerDay);
    const learningCards = deckCards.filter(
      (c) => c.state === "learning" && c.dueTime !== null && c.dueTime <= now
    );
    const today = getDateKey();
    const reviewCards = deckCards.filter(
      (c) => c.state === "review" && c.nextReview && c.nextReview <= today
    );

    setSessionQueue([...newCards, ...learningCards, ...reviewCards].slice(0, settings.dailyReviewLimit));
  }

  function checkSessionEnd() {
    const now = Date.now();
    const deckCards = studyingDeckId
      ? cards.filter((c) => (c.deckId || "default") === studyingDeckId)
      : cards;

    // Session ends only if queue is empty AND no learning cards with future dueTime exist
    const futureLearning = deckCards.filter(
      (c) => c.state === "learning" && c.dueTime !== null && c.dueTime > now
    );

    if (sessionQueue.length === 0 && futureLearning.length === 0) {
      setStudying(false);
      setStudyingDeckId(null);
    }
  }

  // ============================================================================
  // DECK STATS (NEW, LEARN, DUE)
  // ============================================================================
  const deckSummaries = useMemo(() => {
    const now = Date.now();
    const today = getDateKey();

    return decks.map((deck) => {
      const deckCards = cards.filter((c) => (c.deckId || "default") === deck.id);
      const newCount = deckCards.filter((c) => c.state === "new").length;
      const learnCount = deckCards.filter(
        (c) => c.state === "learning" && c.dueTime !== null && c.dueTime <= now
      ).length;
      const dueCount = deckCards.filter(
        (c) => c.state === "review" && c.nextReview && c.nextReview <= today
      ).length;
      const totalCards = deckCards.length;

      return {
        ...deck,
        totalCards,
        newCount,
        learnCount,
        dueCount
      };
    });
  }, [decks, cards, nowTick]);

  const todayReviewed = useMemo(() => {
    const today = getDateKey();
    return reviewHistory[today] || 0;
  }, [reviewHistory]);

  const dailyProgress = useMemo(() => {
    const percent = Math.min(100, Math.round((todayReviewed / settings.dailyReviewLimit) * 100));
    return percent;
  }, [todayReviewed, settings.dailyReviewLimit]);

  // ============================================================================
  // PERSISTENCE HELPERS
  // ============================================================================
  function persistLocal(c = cards, h = reviewHistory, s = settings, d = decks, theme = themeName) {
    saveLocalCards(c);
    saveLocalHistory(h);
    saveLocalSettings(s);
    saveLocalDecks(d);
    saveLocalTheme(theme);
  }

  async function syncToCloud(showStatus = true, payload = null) {
    if (!user) return false;
    const data = payload || { cards, reviewHistory, settings, decks, themeName };
    if (showStatus) setSyncing(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        cards: data.cards,
        decks: data.decks,
        reviewHistory: data.reviewHistory,
        settings: data.settings,
        theme: data.themeName
      });
      if (showStatus) {
        setLastSyncedAt(new Date().toISOString());
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      if (showStatus) setSyncing(false);
    }
  }

  function updateCards(next) {
    setCards(next);
    persistLocal(next, reviewHistory, settings, decks, themeName);
  }

  function updateDecks(nextDecks) {
    setDecks(nextDecks);
    persistLocal(cards, reviewHistory, settings, nextDecks, themeName);
  }

  function handleSync() {
    if (user) {
      syncToCloud(true, { cards, reviewHistory, settings, decks, themeName });
    }
  }

  // ============================================================================
  // CARD ACTIONS
  // ============================================================================
  function handleAddCard(e) {
    e.preventDefault();
    const f = front.trim();
    const b = back.trim();
    if (!f) return;

    if (cardMode === "cloze") {
      if (!hasCloze(f)) return;
      updateCards([createCard(f, b, "cloze", selectedDeckId), ...cards]);
    } else {
      if (!b) return;
      updateCards([createCard(f, b, "regular", selectedDeckId), ...cards]);
    }

    setFront("");
    setBack("");
  }

  function handleBulkImport(e) {
    e.preventDefault();
    const lines = bulkText
      .trim()
      .split("\n")
      .filter((l) => l.includes("\t"));
    const newC = lines
      .map((l) => {
        const [f, b] = l.split("\t");
        return f?.trim() && b?.trim()
          ? createCard(f.trim(), b.trim(), "regular", selectedDeckId)
          : null;
      })
      .filter(Boolean);
    if (newC.length) {
      updateCards([...newC, ...cards]);
      setBulkText("");
    }
  }

  function handleDelete(id) {
    updateCards(cards.filter((c) => c.id !== id));
  }

  // ============================================================================
  // REVIEW ACTIONS
  // ============================================================================
  const currentCard = sessionQueue[0] || null;
  const buttonIntervals = currentCard ? getButtonIntervals(currentCard) : null;

  function handleRating(rating) {
    if (!currentCard) return;

    const updated = applyRating(currentCard, rating);
    const nextCards = cards.map((c) => (c.id === currentCard.id ? updated : c));
    const nextHistory = recordReview(reviewHistory);

    setCards(nextCards);
    setReviewHistory(nextHistory);
    persistLocal(nextCards, nextHistory, settings, decks, themeName);

    // Remove from queue
    setSessionQueue((prev) => prev.slice(1));
    setShowAnswer(false);
    setShowNoteInput(false);
    setNoteText("");

    // Check if session should end
    setTimeout(() => checkSessionEnd(), 100);
  }

  function openEditModal(card) {
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back || "");
    setEditNotes(card.notes || "");
  }

  function saveCardEdit() {
    if (!editingCard) return;
    const updated = cards.map((c) =>
      c.id === editingCard.id
        ? { ...c, front: editFront.trim(), back: editBack.trim(), notes: editNotes.trim() }
        : c
    );
    updateCards(updated);
    setEditingCard(null);
  }

  function splitCard() {
    if (!editingCard) return;
    const newCard = createCard(
      editFront.trim() + " (Part 2)",
      editBack.trim(),
      editingCard.type,
      editingCard.deckId || "default"
    );
    const updated = cards.map((c) =>
      c.id === editingCard.id ? { ...c, front: c.front + " (Part 1)", notes: editNotes.trim() } : c
    );
    updateCards([newCard, ...updated]);
    setEditingCard(null);
  }

  function addNoteToCard() {
    if (!currentCard || !noteText.trim()) return;
    const existingNotes = currentCard.notes || "";
    const newNotes = existingNotes ? `${existingNotes}\n\n${noteText.trim()}` : noteText.trim();
    const updated = cards.map((c) => (c.id === currentCard.id ? { ...c, notes: newNotes } : c));
    updateCards(updated);
    setNoteText("");
    setShowNoteInput(false);
  }

  // ============================================================================
  // DECK ACTIONS
  // ============================================================================
  function createDeck(e) {
    e.preventDefault();
    const name = newDeckName.trim();
    if (!name) return;
    const deck = {
      id: crypto.randomUUID(),
      name,
      icon: newDeckIcon.trim() || "📖",
      createdAt: new Date().toISOString()
    };
    const nextDecks = [...decks, deck];
    updateDecks(nextDecks);
    setSelectedDeckId(deck.id);
    setNewDeckName("");
    setNewDeckIcon("📖");
    setShowCreateDeck(false);
  }

  function triggerDeckIconUpload(deckId, e) {
    e.stopPropagation();
    const input = fileInputRefs.current[deckId];
    if (input) input.click();
  }

  function handleDeckIconUpload(deckId, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif"].includes(file.type)) return;

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = String(reader.result || "");
      const nextDecks = decks.map((deck) =>
        deck.id === deckId ? { ...deck, iconImage: imageData } : deck
      );
      updateDecks(nextDecks);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function applyTheme(theme) {
    if (!THEME_PRESETS[theme]) return;
    setThemeName(theme);
    persistLocal(cards, reviewHistory, settings, decks, theme);
  }

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  const handleKeyDown = useCallback(
    (e) => {
      if (!studying || editingCard) return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;

      if (e.code === "Space" && !showAnswer) {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer && currentCard) {
        if (e.key === "1") handleRating("again");
        else if (e.key === "2") handleRating("hard");
        else if (e.key === "3") handleRating("good");
        else if (e.key === "4") handleRating("easy");
      }
    },
    [studying, showAnswer, editingCard, currentCard]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ============================================================================
  // RENDER: AUTH LOADING
  // ============================================================================
  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        Loading...
      </div>
    );
  }

  // ============================================================================
  // RENDER: STUDY SCREEN
  // ============================================================================
  if (studying && currentCard) {
    return (
      <div className="study-screen">
        <div className="study-header">
          <button
            className="btn-secondary"
            onClick={() => {
              setStudying(false);
              setStudyingDeckId(null);
              setShowAnswer(false);
              setShowNoteInput(false);
              setSessionQueue([]);
            }}
          >
            ← Back
          </button>
          <span className="study-title">
            {decks.find((d) => d.id === (studyingDeckId || "default"))?.name || "Deck"}
          </span>
          <div className="study-header-right">
            <button className="edit-card-btn" onClick={() => openEditModal(currentCard)}>
              ✏️ Edit
            </button>
            <span className="study-progress">{sessionQueue.length} remaining</span>
          </div>
        </div>

        <div className="card-display">
          <div className="card-question">
            {currentCard.type === "cloze"
              ? renderClozeText(currentCard.front, false)
              : currentCard.front}
          </div>
          {currentCard.notes && <div className="card-notes-display">📝 {currentCard.notes}</div>}
          {showAnswer && (
            <>
              <div className="card-divider" />
              {currentCard.type === "cloze" ? (
                <div className="card-answer">{renderClozeText(currentCard.front, true)}</div>
              ) : (
                <div className="card-answer">{currentCard.back}</div>
              )}
              {currentCard.type === "cloze" && currentCard.back?.trim() && (
                <div className="card-answer-note">{currentCard.back}</div>
              )}
            </>
          )}
          {!showAnswer && (
            <button className="show-answer-btn" onClick={() => setShowAnswer(true)}>
              Show Answer <span className="shortcut-hint">(Space)</span>
            </button>
          )}
        </div>

        {showAnswer && (
          <>
            <div className="review-actions">
              {!showNoteInput ? (
                <button className="add-note-btn" onClick={() => setShowNoteInput(true)}>
                  + Add Note
                </button>
              ) : (
                <div className="note-input-row">
                  <input
                    type="text"
                    className="note-input"
                    placeholder="Add personal example or note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addNoteToCard()}
                  />
                  <button className="btn-primary" onClick={addNoteToCard}>
                    Save
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowNoteInput(false);
                      setNoteText("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="answer-buttons">
              <button className="answer-btn again" onClick={() => handleRating("again")}>
                Again<span className="interval">{buttonIntervals.again}</span>
                <span className="shortcut-key">1</span>
              </button>
              <button className="answer-btn hard" onClick={() => handleRating("hard")}>
                Hard<span className="interval">{buttonIntervals.hard}</span>
                <span className="shortcut-key">2</span>
              </button>
              <button className="answer-btn good" onClick={() => handleRating("good")}>
                Good<span className="interval">{buttonIntervals.good}</span>
                <span className="shortcut-key">3</span>
              </button>
              <button className="answer-btn easy" onClick={() => handleRating("easy")}>
                Easy<span className="interval">{buttonIntervals.easy}</span>
                <span className="shortcut-key">4</span>
              </button>
            </div>
          </>
        )}

        {editingCard && (
          <div className="modal-overlay" onClick={() => setEditingCard(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Edit Card</h3>
              <div className="form-field">
                <label>Front</label>
                <textarea rows={3} value={editFront} onChange={(e) => setEditFront(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Back</label>
                <textarea rows={3} value={editBack} onChange={(e) => setEditBack(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Personal notes or examples"
                />
              </div>
              <div className="modal-actions">
                <button className="btn-primary" onClick={saveCardEdit}>
                  Save
                </button>
                <button className="btn-secondary" onClick={splitCard}>
                  Split into 2 Cards
                </button>
                <button className="btn-secondary" onClick={() => setEditingCard(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDER: MAIN VIEWS
  // ============================================================================
  return (
    <>
      <nav className="top-nav">
        <div className="nav-left">
          <button
            className={`nav-btn ${currentView === "decks" ? "active" : ""}`}
            onClick={() => setCurrentView("decks")}
          >
            Decks
          </button>
          <button
            className={`nav-btn ${currentView === "add" ? "active" : ""}`}
            onClick={() => setCurrentView("add")}
          >
            Add
          </button>
          <button
            className={`nav-btn ${currentView === "browse" ? "active" : ""}`}
            onClick={() => setCurrentView("browse")}
          >
            Browse
          </button>
          <button
            className={`nav-btn ${currentView === "stats" ? "active" : ""}`}
            onClick={() => setCurrentView("stats")}
          >
            Stats
          </button>
          <button
            className={`nav-btn ${currentView === "personalization" ? "active" : ""}`}
            onClick={() => setCurrentView("personalization")}
          >
            Personalization
          </button>
        </div>
        <div className="nav-right">
          {syncing && <span className="sync-indicator">Syncing...</span>}
          {!syncing && lastSyncedAt && (
            <span className="sync-indicator">Synced {new Date(lastSyncedAt).toLocaleTimeString()}</span>
          )}
          {user ? (
            <>
              <span className="user-badge">{user.email}</span>
              <button className="nav-btn" onClick={handleSync}>
                Sync
              </button>
              <button className="nav-btn" onClick={() => signOut(auth)}>
                Sign Out
              </button>
            </>
          ) : (
            <button className="nav-btn" onClick={() => setCurrentView("auth")}>
              Sign In
            </button>
          )}
        </div>
      </nav>

      <div className="main-container">
        {currentView === "decks" && (
          <div className="home-screen">
            <div className="progress-ring-container">
              <svg className="progress-ring" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7c5cff" />
                    <stop offset="100%" stopColor="#5c8cff" />
                  </linearGradient>
                </defs>
                <circle className="progress-ring-bg" cx="100" cy="100" r="85" />
                <circle
                  className="progress-ring-fill"
                  cx="100"
                  cy="100"
                  r="85"
                  strokeDasharray={2 * Math.PI * 85}
                  strokeDashoffset={2 * Math.PI * 85 * (1 - dailyProgress / 100)}
                />
              </svg>
              <div className="progress-center">
                <div className="progress-percent">
                  {dailyProgress}
                  <span className="progress-percent-sign">%</span>
                </div>
                <div className="progress-label">Daily Goal</div>
              </div>
            </div>

            <div className="today-stats">
              <p>
                <strong>{todayReviewed}</strong> cards reviewed today
              </p>
            </div>

            <div className="deck-actions">
              <button className="btn-primary" onClick={() => { setStudying(true); setStudyingDeckId(null); }}>
                Start Reviewing All
              </button>
              <button className="btn-secondary" onClick={() => setShowCreateDeck(!showCreateDeck)}>
                Create Deck
              </button>
            </div>

            {showCreateDeck && (
              <form className="create-deck-form" onSubmit={createDeck}>
                <div className="form-field">
                  <label>Deck Name</label>
                  <input
                    type="text"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="e.g. Spanish Vocabulary"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Icon (emoji)</label>
                  <input
                    type="text"
                    value={newDeckIcon}
                    onChange={(e) => setNewDeckIcon(e.target.value)}
                    placeholder="📖"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">
                    Create
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowCreateDeck(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="deck-grid">
              {deckSummaries.map((deck) => (
                <div
                  key={deck.id}
                  className="deck-card"
                  onClick={() => {
                    setStudyingDeckId(deck.id);
                    setStudying(true);
                  }}
                >
                  <button
                    className="deck-icon-edit"
                    onClick={(e) => triggerDeckIconUpload(deck.id, e)}
                    title="Change deck icon"
                  >
                    ✎
                  </button>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[deck.id] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    style={{ display: "none" }}
                    onChange={(e) => handleDeckIconUpload(deck.id, e)}
                  />
                  <div className="deck-icon">
                    {deck.iconImage ? (
                      <img
                        src={deck.iconImage}
                        alt={`${deck.name} icon`}
                        className="deck-icon-image"
                      />
                    ) : (
                      deck.icon || "📚"
                    )}
                  </div>
                  <div className="deck-card-name">{deck.name}</div>
                  <div className="deck-card-counts">
                    <span className="count-new">{deck.newCount} New</span>
                    <span className="count-learn">{deck.learnCount} Learn</span>
                    <span className="count-due">{deck.dueCount} Due</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === "add" && (
          <div className="form-section">
            <h2>Add Flashcard</h2>
            <div className="mode-toggle">
              <button
                className={cardMode === "regular" ? "active" : ""}
                onClick={() => setCardMode("regular")}
              >
                Regular
              </button>
              <button
                className={cardMode === "cloze" ? "active" : ""}
                onClick={() => setCardMode("cloze")}
              >
                Cloze Deletion
              </button>
            </div>

            <form onSubmit={handleAddCard}>
              <div className="form-field">
                <label>Deck</label>
                <select value={selectedDeckId} onChange={(e) => setSelectedDeckId(e.target.value)}>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>
                  {cardMode === "cloze" ? "Text with {{cloze}}" : "Front"}
                </label>
                <textarea
                  rows={3}
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  placeholder={
                    cardMode === "cloze"
                      ? "The {{mitochondria}} is the powerhouse of the cell"
                      : "What is the capital of France?"
                  }
                  required
                />
              </div>
              <div className="form-field">
                <label>{cardMode === "cloze" ? "Extra Info (optional)" : "Back"}</label>
                <textarea
                  rows={3}
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  placeholder={cardMode === "cloze" ? "Additional context..." : "Paris"}
                  required={cardMode === "regular"}
                />
              </div>
              <button type="submit" className="btn-primary">
                Add Card
              </button>
            </form>

            <h3 style={{ marginTop: "32px" }}>Bulk Import</h3>
            <form onSubmit={handleBulkImport}>
              <div className="form-field">
                <label>Paste tab-separated cards (front→tab→back per line)</label>
                <textarea
                  rows={8}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"What is 2+2?\t4\nCapital of Spain?\tMadrid"}
                />
              </div>
              <button type="submit" className="btn-primary">
                Import
              </button>
            </form>
          </div>
        )}

        {currentView === "browse" && (
          <>
            <h2>Browse Cards</h2>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="card-table">
              <div className="card-table-header">
                <span>Front</span>
                <span>Back</span>
                <span>State</span>
                <span>Action</span>
              </div>
              {cards
                .filter((c) => {
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  return (
                    (c.front || "").toLowerCase().includes(query) ||
                    (c.back || "").toLowerCase().includes(query)
                  );
                })
                .slice(0, 100)
                .map((card) => (
                  <div key={card.id} className="card-row">
                    <span className="front">{card.front}</span>
                    <span className="back">{card.back}</span>
                    <span className="state">{card.state}</span>
                    <button className="delete-btn" onClick={() => handleDelete(card.id)}>
                      Delete
                    </button>
                  </div>
                ))}
              {cards.length === 0 && (
                <div className="empty-state">No cards yet. Add some to get started!</div>
              )}
            </div>
          </>
        )}

        {currentView === "stats" && <StatsView history={reviewHistory} cards={cards} />}

        {currentView === "personalization" && (
          <div className="form-section">
            <h3>Theme Colors</h3>
            <div className="theme-picker">
              {[
                { key: "black", label: "Black", color: "#000000" },
                { key: "white", label: "White", color: "#FFFFFF", border: "1px solid #cccccc" },
                { key: "purple", label: "Purple", color: "#8a4dff" },
                { key: "blue", label: "Blue", color: "#2f80ff" },
                { key: "rose-gold", label: "Rose Gold", color: "#c27a7a" },
                { key: "green", label: "Green", color: "#2ea86b" },
                { key: "orange", label: "Orange", color: "#ff8a3d" }
              ].map((theme) => (
                <div key={theme.key} className="theme-item">
                  <button
                    className={`theme-circle ${themeName === theme.key ? "active" : ""}`}
                    onClick={() => applyTheme(theme.key)}
                    title={theme.label}
                    style={{ background: theme.color, border: theme.border || undefined }}
                  />
                  <span className="theme-item-label">{theme.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === "auth" && <AuthView onSuccess={() => setCurrentView("decks")} />}
      </div>
    </>
  );
}
