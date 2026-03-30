import { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const STORAGE_KEY = "sr_flashcards_state_v1";
const NAV_ITEMS = ["Decks", "Add", "Browse", "Stats", "Settings"];
const DEFAULT_DAILY_GOAL = 20;
const DEFAULT_REVIEW_SETTINGS = { dailyReviewLimit: 200, newCardsPerDay: 20 };

const THEME_OPTIONS = [
  { id: "black", name: "Black", bg: "#000000", surface: "#0f0f0f", accent: "#7c7cff", text: "#f3f3f3" },
  { id: "white", name: "White", bg: "#ffffff", surface: "#f3f4f6", accent: "#2563eb", text: "#111827" },
  { id: "purple", name: "Purple", bg: "#1b1030", surface: "#261642", accent: "#a855f7", text: "#f5edff" },
  { id: "blue", name: "Blue", bg: "#071a2e", surface: "#0d243e", accent: "#3b82f6", text: "#e6f0ff" },
  { id: "rose-gold", name: "Rose Gold", bg: "#2a1719", surface: "#372022", accent: "#d4a373", text: "#fff1ec" },
  { id: "green", name: "Green", bg: "#0c1f17", surface: "#123126", accent: "#22c55e", text: "#e7fff1" },
  { id: "orange", name: "Orange", bg: "#2a1607", surface: "#3a220e", accent: "#f97316", text: "#fff1e6" }
];

function hexToRgb(hex) {
  const clean = hex.replace("#", "").trim();
  const normalized =
    clean.length === 3
      ? clean.split("").map((ch) => ch + ch).join("")
      : clean.slice(0, 6);
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return { r: 79, g: 70, b: 229 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

const DEFAULT_DECKS = [
  { id: "deck-1", name: "General", icon: null },
  { id: "deck-2", name: "Math", icon: null },
  { id: "deck-3", name: "Science", icon: null },
  { id: "deck-4", name: "Language", icon: null }
];

function createCard(front, back, deckId) {
  return {
    id: crypto.randomUUID(),
    front,
    back,
    deckId,
    state: "new",
    learningStep: 0,
    interval: 1,
    easeFactor: 2.5,
    dueTime: null,
    nextReview: null,
    lapses: 0,
    reviews: [],
    notes: [],
    dirty: true
  };
}

const LETTER_GRADIENTS = {
  A: "linear-gradient(135deg, #f97316, #ea580c)",
  B: "linear-gradient(135deg, #3b82f6, #2563eb)",
  C: "linear-gradient(135deg, #14b8a6, #0d9488)",
  D: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  E: "linear-gradient(135deg, #ec4899, #db2777)",
  F: "linear-gradient(135deg, #22c55e, #16a34a)",
  G: "linear-gradient(135deg, #a855f7, #9333ea)",
  H: "linear-gradient(135deg, #f59e0b, #d97706)",
  I: "linear-gradient(135deg, #06b6d4, #0891b2)",
  J: "linear-gradient(135deg, #ef4444, #dc2626)",
  K: "linear-gradient(135deg, #84cc16, #65a30d)",
  L: "linear-gradient(135deg, #6366f1, #4f46e5)",
  M: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  N: "linear-gradient(135deg, #f43f5e, #e11d48)",
  O: "linear-gradient(135deg, #fb923c, #ea580c)",
  P: "linear-gradient(135deg, #c084fc, #a855f7)",
  Q: "linear-gradient(135deg, #2dd4bf, #14b8a6)",
  R: "linear-gradient(135deg, #f87171, #ef4444)",
  S: "linear-gradient(135deg, #22c55e, #15803d)",
  T: "linear-gradient(135deg, #60a5fa, #3b82f6)",
  U: "linear-gradient(135deg, #fbbf24, #f59e0b)",
  V: "linear-gradient(135deg, #a78bfa, #8b5cf6)",
  W: "linear-gradient(135deg, #34d399, #10b981)",
  X: "linear-gradient(135deg, #fb7185, #f43f5e)",
  Y: "linear-gradient(135deg, #facc15, #eab308)",
  Z: "linear-gradient(135deg, #818cf8, #6366f1)"
};

function getLetterGradient(letter) {
  const upper = (letter || "A").toUpperCase();
  return LETTER_GRADIENTS[upper] || LETTER_GRADIENTS.A;
}

function getDateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatTime(ms) {
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60000))}m`;
  return `${Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)))}d`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

function formatDateOnly(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function hasCloze(text) {
  return /{{.+?}}/.test(text || "");
}

function renderClozeFront(text, reveal) {
  const source = text || "";
  const regex = /{{(.*?)}}/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`plain-${key++}`}>{source.slice(lastIndex, match.index)}</span>);
    }
    if (reveal) {
      nodes.push(
        <span key={`cloze-${key++}`} className="cloze-blue">
          {match[1]}
        </span>
      );
    } else {
      nodes.push(
        <span key={`blank-${key++}`} className="cloze-blank">
          ___
        </span>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < source.length) {
    nodes.push(<span key={`tail-${key++}`}>{source.slice(lastIndex)}</span>);
  }
  return nodes.length > 0 ? nodes : [<span key="empty">{source}</span>];
}

function buildDeckCounts(cards, deckId, nowMs) {
  let newCount = 0;
  let learnCount = 0;
  let dueCount = 0;
  cards.forEach((card) => {
    if (card.deckId !== deckId) return;
    if (card.state === "new") newCount += 1;
    if (card.state === "learning" && card.dueTime && card.dueTime <= nowMs) learnCount += 1;
    if (card.state === "review" && card.nextReview && Date.parse(card.nextReview) <= nowMs) dueCount += 1;
  });
  return { newCount, learnCount, dueCount };
}

function buildSessionQueue(cards, deckId, nowMs, limits = DEFAULT_REVIEW_SETTINGS) {
  const inDeck = cards.filter((card) => card.deckId === deckId);
  const newCards = inDeck
    .filter((card) => card.state === "new")
    .slice(0, Math.max(1, limits.newCardsPerDay))
    .map((card) => card.id);
  const learningDue = inDeck
    .filter((card) => card.state === "learning" && card.dueTime && card.dueTime <= nowMs)
    .sort((a, b) => a.dueTime - b.dueTime)
    .map((card) => card.id);
  const reviewDue = inDeck
    .filter((card) => card.state === "review" && card.nextReview && Date.parse(card.nextReview) <= nowMs)
    .sort((a, b) => Date.parse(a.nextReview) - Date.parse(b.nextReview))
    .map((card) => card.id);
  return [...newCards, ...learningDue, ...reviewDue].slice(0, Math.max(1, limits.dailyReviewLimit));
}

function hasPendingLearning(cards, deckId, nowMs) {
  return cards.some(
    (card) => card.deckId === deckId && card.state === "learning" && card.dueTime && card.dueTime > nowMs
  );
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.decks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getThemeById(themeId) {
  return THEME_OPTIONS.find((theme) => theme.id === themeId) || THEME_OPTIONS[0];
}

function getCardDueDateText(card) {
  if (card.state === "new") return "New";
  if (card.state === "learning" && card.dueTime) return formatDateOnly(new Date(card.dueTime).toISOString());
  if (card.state === "review" && card.nextReview) return formatDateOnly(card.nextReview);
  return "—";
}

function getSafeActiveDeckId(decks, currentId) {
  if (decks.some((deck) => deck.id === currentId)) return currentId;
  return decks[0]?.id || null;
}

export default function App() {
  const loaded = loadState();
  const [view, setView] = useState("Decks");
  const [decks, setDecks] = useState(loaded?.decks || DEFAULT_DECKS);
  const [cards, setCards] = useState(loaded?.cards || []);
  const [dailyGoal, setDailyGoal] = useState(loaded?.dailyGoal || DEFAULT_DAILY_GOAL);
  const [reviewSettings, setReviewSettings] = useState({
    dailyReviewLimit: loaded?.reviewSettings?.dailyReviewLimit || DEFAULT_REVIEW_SETTINGS.dailyReviewLimit,
    newCardsPerDay: loaded?.reviewSettings?.newCardsPerDay || DEFAULT_REVIEW_SETTINGS.newCardsPerDay
  });
  const [themeId, setThemeId] = useState(loaded?.themeId || "black");
  const [customColor, setCustomColor] = useState(loaded?.customColor || "#7c3aed");
  const [reviewedByDay, setReviewedByDay] = useState(loaded?.reviewedByDay || {});
  const [activeDeckId, setActiveDeckId] = useState(
    getSafeActiveDeckId(loaded?.decks || DEFAULT_DECKS, loaded?.activeDeckId || DEFAULT_DECKS[0].id)
  );
  const [inReview, setInReview] = useState(false);
  const [queue, setQueue] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [frontInput, setFrontInput] = useState("");
  const [backInput, setBackInput] = useState("");
  const [deckInput, setDeckInput] = useState(
    getSafeActiveDeckId(loaded?.decks || DEFAULT_DECKS, loaded?.activeDeckId || DEFAULT_DECKS[0].id)
  );
  const [addMode, setAddMode] = useState("regular");
  const [bulkDeckInput, setBulkDeckInput] = useState(
    getSafeActiveDeckId(loaded?.decks || DEFAULT_DECKS, loaded?.activeDeckId || DEFAULT_DECKS[0].id)
  );
  const [bulkText, setBulkText] = useState("");
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseSort, setBrowseSort] = useState({ key: "dueDate", direction: "asc" });
  const [deckDetailQuery, setDeckDetailQuery] = useState("");
  const [reviewTick, setReviewTick] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const [newDeckName, setNewDeckName] = useState("");
  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [statsOpen, setStatsOpen] = useState({
    overview: true,
    dailyActivity: true,
    weakCards: true,
    cardHealth: true,
    reviewHistory: true
  });
  const [selectedWeakCardId, setSelectedWeakCardId] = useState(null);
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [sessionInitialCount, setSessionInitialCount] = useState(0);
  const [sessionAnsweredCount, setSessionAnsweredCount] = useState(0);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState(loaded?.lastSyncedAt || null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | done | error
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (decks.length === 0) {
      setDecks(DEFAULT_DECKS);
      return;
    }
    const safe = getSafeActiveDeckId(decks, activeDeckId);
    if (safe !== activeDeckId) setActiveDeckId(safe);
    if (!decks.some((deck) => deck.id === deckInput)) setDeckInput(safe);
    if (!decks.some((deck) => deck.id === bulkDeckInput)) setBulkDeckInput(safe);
  }, [decks, activeDeckId, deckInput, bulkDeckInput]);

  useEffect(() => {
    const timer = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        decks,
        cards,
        dailyGoal,
        reviewSettings,
        themeId,
        customColor,
        reviewedByDay,
        activeDeckId,
        view,
        lastSyncedAt
      })
    );
  }, [decks, cards, dailyGoal, reviewSettings, themeId, customColor, reviewedByDay, activeDeckId, view, lastSyncedAt]);

  useEffect(() => {
    if (!inReview) return undefined;
    const timer = setInterval(() => {
      setReviewTick((n) => n + 1);
      setQueue((prev) => {
        const nowMs = Date.now();
        const existing = new Set(prev);
        const newlyDue = cards
          .filter(
            (card) =>
              card.deckId === activeDeckId &&
              card.state === "learning" &&
              card.dueTime &&
              card.dueTime <= nowMs &&
              !existing.has(card.id)
          )
          .sort((a, b) => a.dueTime - b.dueTime)
          .map((card) => card.id);
        if (newlyDue.length === 0) return prev;
        return [...newlyDue, ...prev];
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [inReview, cards, activeDeckId]);

  useEffect(() => {
    if (!inReview) return;
    if (queue.length > 0) return;
    const nowMs = Date.now();
    if (!hasPendingLearning(cards, activeDeckId, nowMs)) {
      setInReview(false);
      setShowAnswer(false);
      return;
    }
    const dueNow = cards
      .filter(
        (card) =>
          card.deckId === activeDeckId && card.state === "learning" && card.dueTime && card.dueTime <= nowMs
      )
      .sort((a, b) => a.dueTime - b.dueTime)
      .map((card) => card.id);
    if (dueNow.length > 0) setQueue(dueNow);
  }, [queue, cards, inReview, activeDeckId, reviewTick]);

  const nowMs = Date.now();
  const todayKey = getDateKey(nowMs);
  const reviewedToday = reviewedByDay[todayKey] || 0;

  // Build chart data for last 7 days
  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const dayMs = nowMs - i * 24 * 60 * 60 * 1000;
      const key = getDateKey(dayMs);
      const date = new Date(dayMs);
      const label = date.toLocaleDateString(undefined, { weekday: "short" });
      data.push({
        date: label,
        cards: reviewedByDay[key] || 0
      });
    }
    return data;
  }, [reviewedByDay, nowMs]);

  const deckStats = useMemo(() => {
    const stats = {};
    decks.forEach((deck) => {
      stats[deck.id] = buildDeckCounts(cards, deck.id, Date.now());
    });
    return stats;
  }, [cards, decks, reviewTick, clockTick]);

  const currentCard = useMemo(() => {
    const cardId = queue[0];
    return cards.find((card) => card.id === cardId) || null;
  }, [queue, cards]);

  const fallbackLearningCard = useMemo(() => {
    if (!inReview || queue.length > 0) return null;
    const candidates = cards
      .filter((card) => card.deckId === activeDeckId && card.state === "learning" && card.dueTime)
      .sort((a, b) => a.dueTime - b.dueTime);
    return candidates[0] || null;
  }, [inReview, queue.length, cards, activeDeckId]);

  const activeReviewCard = currentCard || fallbackLearningCard;

  const browseCards = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    const filtered = cards.filter((card) => {
      if (!q) return true;
      const deckName = decks.find((d) => d.id === card.deckId)?.name || "";
      return (
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q) ||
        card.state.toLowerCase().includes(q) ||
        deckName.toLowerCase().includes(q)
      );
    });
    const sorted = [...filtered].sort((a, b) => {
      const deckA = decks.find((d) => d.id === a.deckId)?.name || "";
      const deckB = decks.find((d) => d.id === b.deckId)?.name || "";
      const dueA =
        a.state === "learning" ? a.dueTime || Number.MAX_SAFE_INTEGER : Date.parse(a.nextReview || "9999-12-31");
      const dueB =
        b.state === "learning" ? b.dueTime || Number.MAX_SAFE_INTEGER : Date.parse(b.nextReview || "9999-12-31");
      const map = {
        front: a.front.localeCompare(b.front),
        back: a.back.localeCompare(b.back),
        deck: deckA.localeCompare(deckB),
        state: a.state.localeCompare(b.state),
        dueDate: dueA - dueB
      };
      const result = map[browseSort.key] ?? 0;
      return browseSort.direction === "asc" ? result : -result;
    });
    return sorted.slice(0, 400);
  }, [cards, decks, browseQuery, browseSort]);

  const deckDetailCards = useMemo(() => {
    const q = deckDetailQuery.trim().toLowerCase();
    return cards.filter((card) => {
      if (card.deckId !== activeDeckId) return false;
      if (!q) return true;
      return (
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q) ||
        card.state.toLowerCase().includes(q)
      );
    });
  }, [cards, activeDeckId, deckDetailQuery]);

  const activeTheme = getThemeById(themeId);
  const computedTheme =
    themeId === "custom"
      ? (() => {
          const { r, g, b } = hexToRgb(customColor);
          return {
            id: "custom",
            name: "Custom",
            bg: `rgb(${Math.max(0, r - 34)} ${Math.max(0, g - 34)} ${Math.max(0, b - 34)})`,
            surface: `rgb(${Math.max(0, r - 22)} ${Math.max(0, g - 22)} ${Math.max(0, b - 22)})`,
            accent: customColor,
            text: "#f8fafc"
          };
        })()
      : activeTheme;
  const themeStyle = {
    background: computedTheme.bg,
    color: computedTheme.text,
    "--accent": computedTheme.accent,
    "--surface": computedTheme.surface,
    "--bg": computedTheme.bg,
    "--text": computedTheme.text
  };

  const statsData = useMemo(() => {
    const now = Date.now();
    const today = new Date(now);
    const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).getTime();

    const allReviews = cards.flatMap((card) => card.reviews || []);
    const correct = allReviews.filter((r) => r.grade === "Hard" || r.grade === "Good" || r.grade === "Easy").length;
    const retentionRate = allReviews.length ? Math.round((correct / allReviews.length) * 100) : 0;

    const cardsDueToday = cards.filter((card) => {
      if (card.state === "new") return true;
      if (card.state === "learning" && card.dueTime) return card.dueTime <= endToday;
      if (card.state === "review" && card.nextReview) return Date.parse(card.nextReview) <= endToday;
      return false;
    }).length;

    let streak = 0;
    const probe = new Date(today);
    while (true) {
      const key = getDateKey(probe.getTime());
      if ((reviewedByDay[key] || 0) > 0) {
        streak += 1;
        probe.setDate(probe.getDate() - 1);
        continue;
      }
      if (streak === 0) {
        probe.setDate(probe.getDate() - 1);
        if ((today.getTime() - probe.getTime()) / (24 * 60 * 60 * 1000) > 1) break;
        continue;
      }
      break;
    }

    const days = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d.getTime());
      days.push({
        key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: reviewedByDay[key] || 0
      });
    }
    const total30 = days.reduce((sum, d) => sum + d.count, 0);
    const avgPerDay = Number((total30 / 30).toFixed(1));
    const maxDay = Math.max(1, ...days.map((d) => d.count));

    const weakCards = cards
      .filter((card) => card.lapses >= 3)
      .sort((a, b) => b.lapses - a.lapses);

    const healthWarnings = cards
      .filter((card) => (card.back || "").length > 200)
      .map((card) => ({
        id: card.id,
        front: card.front,
        length: card.back.length
      }));

    const reviewHistoryRows = cards
      .filter((card) => (card.reviews || []).length > 0)
      .map((card) => ({
        id: card.id,
        front: card.front,
        deckName: decks.find((deck) => deck.id === card.deckId)?.name || "Deck",
        reviews: [...card.reviews].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      }))
      .sort((a, b) => b.reviews[0].at.localeCompare(a.reviews[0].at));

    return {
      retentionRate,
      cardsReviewedToday: reviewedToday,
      cardsDueToday,
      streak,
      days,
      avgPerDay,
      maxDay,
      weakCards,
      healthWarnings,
      reviewHistoryRows
    };
  }, [cards, decks, reviewedByDay, reviewedToday, clockTick]);

  const selectedWeakCard = useMemo(
    () => statsData.weakCards.find((card) => card.id === selectedWeakCardId) || null,
    [statsData.weakCards, selectedWeakCardId]
  );

  function toggleStatsSection(sectionKey) {
    setStatsOpen((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  }

  function persistAfterReview(nextCards, nextReviewedByDay) {
    setCards(nextCards);
    setReviewedByDay(nextReviewedByDay);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        decks,
        cards: nextCards,
        dailyGoal,
        reviewSettings,
        themeId,
        customColor,
        reviewedByDay: nextReviewedByDay,
        activeDeckId,
        view,
        lastSyncedAt
      })
    );
  }

  async function syncToFirestore() {
    if (!user) return;
    setSyncBusy(true);
    setSyncStatus("syncing");

    const startTime = performance.now();
    console.log("[Sync] Starting...");

    try {
      const nowIso = new Date().toISOString();
      
      // Strip out large base64 icons to speed up sync
      const decksWithoutIcons = decks.map(({ icon, ...rest }) => rest);
      
      // Keep cards minimal
      const lightCards = cards.map((card) => {
        const { reviews, notes, ...rest } = card;
        return {
          ...rest,
          reviews: (reviews || []).slice(-3),
          notes: (notes || []).slice(-2)
        };
      });

      const payload = {
        decks: decksWithoutIcons,
        cards: lightCards,
        dailyGoal,
        reviewSettings,
        themeId,
        customColor,
        reviewedByDay,
        activeDeckId,
        lastSyncedAt: nowIso
      };

      console.log("[Sync] Payload size:", JSON.stringify(payload).length, "bytes");
      console.log("[Sync] Cards:", lightCards.length, "Decks:", decksWithoutIcons.length);

      // Add timeout - fail if takes more than 10 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Sync timeout after 10s")), 10000)
      );
      
      console.log("[Sync] Calling setDoc...");
      await Promise.race([
        setDoc(doc(db, "users", user.uid), payload),
        timeoutPromise
      ]);
      
      const elapsed = Math.round(performance.now() - startTime);
      console.log("[Sync] Completed in", elapsed, "ms");
      
      setLastSyncedAt(nowIso);
      setSyncStatus("done");
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      console.error("[Sync] Failed after", elapsed, "ms:", err.message || err);
      setSyncStatus("error");
    } finally {
      setSyncBusy(false);
    }
  }

  function startReviewSession(deckId = activeDeckId) {
    const initial = buildSessionQueue(cards, deckId, Date.now(), reviewSettings);
    setActiveDeckId(deckId);
    setQueue(initial);
    setShowAnswer(false);
    setIsEditingCard(false);
    setSessionInitialCount(initial.length);
    setSessionAnsweredCount(0);
    setInReview(true);
  }

  useEffect(() => {
    if (!inReview) return;
    setQueue((prev) => {
      if (prev.length <= reviewSettings.dailyReviewLimit) return prev;
      return prev.slice(0, reviewSettings.dailyReviewLimit);
    });
  }, [reviewSettings.dailyReviewLimit, inReview]);

  function addCard(event) {
    event.preventDefault();
    const front = frontInput.trim();
    const back = backInput.trim();
    if (!deckInput) return;
    if (addMode === "regular" && (!front || !back)) return;
    if (addMode === "cloze" && (!front || !hasCloze(front))) {
      window.alert("Cloze mode requires text with at least one {{...}} segment.");
      return;
    }
    const newCard = createCard(front, addMode === "regular" ? back : back || "", deckInput);
    setCards((prev) => [newCard, ...prev]);
    setFrontInput("");
    setBackInput("");
    setView("Decks");
  }

  function importBulkCards(event) {
    event.preventDefault();
    if (!bulkDeckInput) return;
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const imported = [];
    lines.forEach((line) => {
      const tabIndex = line.indexOf("\t");
      if (tabIndex < 1) return;
      const front = line.slice(0, tabIndex).trim();
      const back = line.slice(tabIndex + 1).trim();
      if (!front || !back) return;
      imported.push(createCard(front, back, bulkDeckInput));
    });
    if (imported.length === 0) return;
    setCards((prev) => [...imported, ...prev]);
    setBulkText("");
  }

  function createDeck(event) {
    event.preventDefault();
    const name = newDeckName.trim();
    if (!name) return;
    const deck = { id: crypto.randomUUID(), name, icon: null };
    setDecks((prev) => [deck, ...prev]);
    setActiveDeckId(deck.id);
    setDeckInput(deck.id);
    setNewDeckName("");
  }

  function renameDeck(deckId) {
    const current = decks.find((deck) => deck.id === deckId);
    if (!current) return;
    const value = window.prompt("Rename deck", current.name);
    if (value === null) return;
    const nextName = value.trim();
    if (!nextName) return;
    setDecks((prev) => prev.map((deck) => (deck.id === deckId ? { ...deck, name: nextName } : deck)));
  }

  function deleteDeck(deckId) {
    if (decks.length <= 1) {
      window.alert("At least one deck is required.");
      return;
    }
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;
    if (!window.confirm(`Delete "${deck.name}" and all its cards?`)) return;
    const remainingDecks = decks.filter((d) => d.id !== deckId);
    const safeNextDeck = remainingDecks[0];
    setDecks(remainingDecks);
    setCards((prev) => prev.filter((card) => card.deckId !== deckId));
    if (activeDeckId === deckId) setActiveDeckId(safeNextDeck.id);
    if (deckInput === deckId) setDeckInput(safeNextDeck.id);
    if (inReview && activeDeckId === deckId) {
      setInReview(false);
      setQueue([]);
      setShowAnswer(false);
      setIsEditingCard(false);
      setSessionInitialCount(0);
      setSessionAnsweredCount(0);
    }
  }

  function deleteCardFromBrowse(cardId, frontText) {
    const preview = (frontText || "").slice(0, 60);
    if (!window.confirm(`Delete this card permanently?\n\n${preview}`)) return;
    setCards((prev) => prev.filter((card) => card.id !== cardId));
  }

  function openDeckDetail(deckId) {
    setActiveDeckId(deckId);
    setDeckDetailQuery("");
    setView("DeckDetail");
  }

  function openAddForDeck(deckId) {
    setDeckInput(deckId);
    setView("Add");
  }

  function onIconUpload(deckId, file) {
    const reader = new FileReader();
    reader.onload = () => {
      const icon = typeof reader.result === "string" ? reader.result : null;
      if (!icon) return;
      setDecks((prev) => prev.map((deck) => (deck.id === deckId ? { ...deck, icon } : deck)));
    };
    reader.readAsDataURL(file);
  }

  function updateCardWithGrade(card, gradeLabel) {
    const now = Date.now();
    const reviewLog = { at: new Date(now).toISOString(), grade: gradeLabel };

    if (gradeLabel === "Again") {
      return {
        ...card,
        state: "learning",
        learningStep: 0,
        dueTime: now + 60 * 1000,
        nextReview: null,
        interval: 1,
        easeFactor: Math.max(1.3, Number((card.easeFactor - 0.2).toFixed(2))),
        lapses: card.lapses + 1,
        reviews: [...card.reviews, reviewLog]
      };
    }
    if (gradeLabel === "Hard") {
      return {
        ...card,
        state: "learning",
        learningStep: 1,
        dueTime: now + 6 * 60 * 1000,
        nextReview: null,
        interval: 1,
        easeFactor: Math.max(1.3, Number((card.easeFactor - 0.1).toFixed(2))),
        reviews: [...card.reviews, reviewLog]
      };
    }
    if (gradeLabel === "Good") {
      if (card.state === "learning" && card.learningStep >= 1) {
        return {
          ...card,
          state: "review",
          learningStep: 0,
          dueTime: null,
          interval: Math.max(1, card.interval),
          nextReview: new Date(now + Math.max(1, card.interval) * 24 * 60 * 60 * 1000).toISOString(),
          easeFactor: Number((card.easeFactor + 0.05).toFixed(2)),
          reviews: [...card.reviews, reviewLog]
        };
      }
      return {
        ...card,
        state: "learning",
        learningStep: 1,
        dueTime: now + 10 * 60 * 1000,
        nextReview: null,
        interval: 1,
        easeFactor: Number((card.easeFactor + 0.03).toFixed(2)),
        reviews: [...card.reviews, reviewLog]
      };
    }
    return {
      ...card,
      state: "review",
      learningStep: 0,
      dueTime: null,
      interval: 4,
      nextReview: new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString(),
      easeFactor: Number((card.easeFactor + 0.15).toFixed(2)),
      reviews: [...card.reviews, reviewLog]
    };
  }

  function gradeCurrentCard(gradeLabel) {
    if (!activeReviewCard) return;
    const updatedCards = cards.map((card) =>
      card.id === activeReviewCard.id ? updateCardWithGrade(card, gradeLabel) : card
    );
    const nextReviewedByDay = { ...reviewedByDay, [todayKey]: (reviewedByDay[todayKey] || 0) + 1 };
    persistAfterReview(updatedCards, nextReviewedByDay);
    setQueue((prev) => prev.slice(1));
    setShowAnswer(false);
    setIsEditingCard(false);
    setSessionAnsweredCount((n) => n + 1);
  }

  function saveCurrentEdit() {
    if (!activeReviewCard) return;
    const nextFront = editFront.trim();
    const nextBack = editBack.trim();
    if (!nextFront || !nextBack) return;
    setCards((prev) =>
      prev.map((card) =>
        card.id === activeReviewCard.id
          ? {
              ...card,
              front: nextFront,
              back: nextBack
            }
          : card
      )
    );
    setIsEditingCard(false);
  }

  function addNoteToCurrentCard() {
    if (!activeReviewCard) return;
    const note = noteInput.trim();
    if (!note) return;
    setCards((prev) =>
      prev.map((card) =>
        card.id === activeReviewCard.id
          ? {
            ...card,
            notes: [...(Array.isArray(card.notes) ? card.notes : []), note]
          }
          : card
      )
    );
    setNoteInput("");
  }

  function splitTextIntoTwo(text) {
    const value = (text || "").trim();
    if (!value) return null;
    const byLine = value.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (byLine.length >= 2) {
      const mid = Math.ceil(byLine.length / 2);
      return [byLine.slice(0, mid).join(" "), byLine.slice(mid).join(" ")];
    }
    const bySentence = value.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
    if (bySentence.length >= 2) {
      const mid = Math.ceil(bySentence.length / 2);
      return [bySentence.slice(0, mid).join(" "), bySentence.slice(mid).join(" ")];
    }
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length >= 4) {
      const mid = Math.ceil(words.length / 2);
      return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    }
    return null;
  }

  function splitCurrentCard() {
    if (!activeReviewCard) return;
    const splitFront = splitTextIntoTwo(activeReviewCard.front);
    if (!splitFront) {
      window.alert("Unable to split this card automatically. Add separators or longer text.");
      return;
    }
    const sharedBack = activeReviewCard.back || "";
    const baseNotes = Array.isArray(activeReviewCard.notes) ? activeReviewCard.notes : [];
    const cardA = createCard(splitFront[0], sharedBack, activeReviewCard.deckId);
    const cardB = createCard(splitFront[1], sharedBack, activeReviewCard.deckId);
    cardA.notes = [...baseNotes];
    cardB.notes = [...baseNotes];
    setCards((prev) => [cardA, cardB, ...prev.filter((card) => card.id !== activeReviewCard.id)]);
    setQueue((prev) => prev.slice(1));
    setShowAnswer(false);
    setIsEditingCard(false);
  }

  useEffect(() => {
    if (!inReview || !activeReviewCard) return;
    setEditFront(activeReviewCard.front || "");
    setEditBack(activeReviewCard.back || "");
    setNoteInput("");
  }, [inReview, activeReviewCard?.id]);

  useEffect(() => {
    if (!inReview) return undefined;
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!showAnswer && activeReviewCard) setShowAnswer(true);
        return;
      }
      if (!showAnswer || !activeReviewCard) return;
      if (event.key === "1") gradeCurrentCard("Again");
      if (event.key === "2") gradeCurrentCard("Hard");
      if (event.key === "3") gradeCurrentCard("Good");
      if (event.key === "4") gradeCurrentCard("Easy");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inReview, showAnswer, activeReviewCard, cards, reviewedByDay, todayKey]);

  function sortBrowseBy(key) {
    setBrowseSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
  }

  function getSortMarker(key) {
    if (browseSort.key !== key) return "";
    return browseSort.direction === "asc" ? " ▲" : " ▼";
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) return;

      // Simple single getDoc to load all user data
      try {
        const snap = await getDoc(doc(db, "users", nextUser.uid));
        if (!snap.exists()) return;

        const cloud = snap.data();
        // Merge cloud decks with local icons (icons stay local only)
        if (Array.isArray(cloud.decks)) {
          const localDecks = loadState()?.decks || [];
          const iconMap = {};
          localDecks.forEach((d) => { if (d.icon) iconMap[d.id] = d.icon; });
          setDecks(cloud.decks.map((d) => ({ ...d, icon: iconMap[d.id] || d.icon || null })));
        }
        if (Array.isArray(cloud.cards)) setCards(cloud.cards);
        if (typeof cloud.dailyGoal === "number") setDailyGoal(cloud.dailyGoal);
        if (cloud.reviewSettings) {
          setReviewSettings({
            dailyReviewLimit: cloud.reviewSettings.dailyReviewLimit || DEFAULT_REVIEW_SETTINGS.dailyReviewLimit,
            newCardsPerDay: cloud.reviewSettings.newCardsPerDay || DEFAULT_REVIEW_SETTINGS.newCardsPerDay
          });
        }
        if (typeof cloud.themeId === "string") setThemeId(cloud.themeId);
        if (typeof cloud.customColor === "string") setCustomColor(cloud.customColor);
        if (cloud.reviewedByDay && typeof cloud.reviewedByDay === "object") setReviewedByDay(cloud.reviewedByDay);
        if (typeof cloud.activeDeckId === "string") setActiveDeckId(cloud.activeDeckId);
        if (typeof cloud.lastSyncedAt === "string") setLastSyncedAt(cloud.lastSyncedAt);
      } catch (err) {
        console.error("Failed to load cloud data:", err);
      }
    });
    return () => unsub();
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    try {
      if (authMode === "signin") {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setAuthEmail("");
      setAuthPassword("");
      setView("Decks");
    } catch (error) {
      setAuthError(error.message || "Authentication failed");
    }
  }

  const activeDeckName = decks.find((deck) => deck.id === activeDeckId)?.name || "Deck";
  function exitReviewSession() {
    setInReview(false);
    setShowAnswer(false);
    setIsEditingCard(false);
    setView("Decks");
  }

  if (authLoading) {
    return <div className="app" style={themeStyle}><main className="panel"><h2>Loading...</h2></main></div>;
  }

  if (inReview) {
    const pendingFutureLearning = cards
      .filter(
        (card) =>
          card.deckId === activeDeckId && card.state === "learning" && card.dueTime && card.dueTime > Date.now()
      )
      .sort((a, b) => a.dueTime - b.dueTime);
    const nextDueIn = pendingFutureLearning[0] ? pendingFutureLearning[0].dueTime - Date.now() : null;
    const remaining = queue.length + (queue.length === 0 && activeReviewCard ? 1 : 0);
    const progressTotal = Math.max(sessionInitialCount, sessionAnsweredCount + remaining, 1);
    const progressPercent = Math.round((sessionAnsweredCount / progressTotal) * 100);

    return (
      <div className="app" style={themeStyle}>
        <div className="review-progress-wrap">
          <div className="review-progress-meta">
            <span>Progress</span>
            <span>{remaining} left</span>
          </div>
          <div className="review-progress-track">
            <div className="review-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="review-header">
          <div className="review-header-left">
            <button className="mini-btn" type="button" onClick={exitReviewSession}>
              Back to Decks
            </button>
            <span>{activeDeckName}</span>
          </div>
          <div>{remaining} in queue</div>
        </div>

        {activeReviewCard ? (
          <div className="review-card">
            <div className="review-toolbar">
              <button className="mini-btn" onClick={() => setIsEditingCard((v) => !v)} type="button">
                {isEditingCard ? "Cancel Edit" : "Edit"}
              </button>
              <button className="mini-btn" onClick={splitCurrentCard} type="button">
                Split Card
              </button>
            </div>

            {isEditingCard ? (
              <div className="review-edit-form">
                <textarea rows={4} value={editFront} onChange={(event) => setEditFront(event.target.value)} />
                <textarea rows={5} value={editBack} onChange={(event) => setEditBack(event.target.value)} />
                <button className="primary-btn" onClick={saveCurrentEdit} type="button">
                  Save Edit
                </button>
              </div>
            ) : (
              <>
                <h2>
                  {hasCloze(activeReviewCard.front)
                    ? renderClozeFront(activeReviewCard.front, showAnswer)
                    : activeReviewCard.front}
                </h2>
                {showAnswer && <p>{activeReviewCard.back}</p>}
                {!showAnswer && (
                  <button className="primary-btn" onClick={() => setShowAnswer(true)}>
                    Show Answer (Space)
                  </button>
                )}
              </>
            )}

            <div className="note-box">
              <label>Add Note</label>
              <textarea
                rows={2}
                placeholder="Add personal example or mnemonic..."
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
              />
              <button className="mini-btn" onClick={addNoteToCurrentCard} type="button">
                Save Note
              </button>
              {(activeReviewCard.notes || []).length > 0 && (
                <ul className="note-list">
                  {(activeReviewCard.notes || []).map((note, idx) => (
                    <li key={`${activeReviewCard.id}-note-${idx}`}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="waiting-box">
            <h3>Waiting for learning cards...</h3>
            <p>Session remains active until no pending learning cards exist.</p>
            {nextDueIn !== null && <p>Next card due in {formatTime(nextDueIn)}</p>}
          </div>
        )}

        {showAnswer && activeReviewCard && (
          <div className="grade-row">
            <button className="grade again" onClick={() => gradeCurrentCard("Again")}>
              <span>Again (1)</span>
              <small>1 min</small>
            </button>
            <button className="grade hard" onClick={() => gradeCurrentCard("Hard")}>
              <span>Hard (2)</span>
              <small>6 min</small>
            </button>
            <button className="grade good" onClick={() => gradeCurrentCard("Good")}>
              <span>Good (3)</span>
              <small>10 min</small>
            </button>
            <button className="grade easy" onClick={() => gradeCurrentCard("Easy")}>
              <span>Easy (4)</span>
              <small>4 days</small>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app" style={themeStyle}>
      <nav className="navbar">
        <div className="nav-left">
          {(user ? NAV_ITEMS : [...NAV_ITEMS, "Sign In"]).map((item) => (
            <button
              key={item}
              className={`nav-item ${view === item ? "active" : ""}`}
              onClick={() => setView(item)}
            >
              {item}
            </button>
          ))}
          {user ? (
            <>
              <button
                className={`nav-item sync-btn ${syncStatus === "error" ? "sync-error" : ""}`}
                onClick={syncToFirestore}
                disabled={syncBusy}
              >
                {syncStatus === "syncing" && <span className="sync-spinner" />}
                {syncStatus === "syncing" && "Syncing..."}
                {syncStatus === "done" && `Synced ✓`}
                {syncStatus === "error" && "Sync failed ✗"}
                {syncStatus === "idle" && "Sync"}
              </button>
              <button className="nav-item" onClick={() => signOut(auth)}>
                Sign Out
              </button>
            </>
          ) : null}
        </div>
      </nav>

      {view === "Decks" && (
        <main className="home">
          <section className="progress-panel">
            <div className="chart-header">
              <span className="chart-title">Cards Reviewed</span>
              <span className="chart-today">{reviewedToday} today</span>
            </div>
            <div className="activity-chart">
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#888", fontSize: 11 }}
                    axisLine={{ stroke: "#333" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#888", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1a1a",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      color: "#fff"
                    }}
                    labelStyle={{ color: "#aaa" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cards"
                    stroke="#7c3aed"
                    strokeWidth={2.5}
                    fill="url(#chartGradient)"
                    dot={{ r: 4, fill: "#7c3aed", stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: "#a78bfa", stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="streak-row">
              <span className="streak-icon">🔥</span>
              <span className="streak-count">{statsData.streak} day streak</span>
            </div>
            <button className="primary-btn pulse-glow" onClick={() => startReviewSession(activeDeckId)}>
              Start Reviewing
            </button>
          </section>

          <section className="deck-grid">
            {decks.map((deck) => {
              const stats = deckStats[deck.id] || { newCount: 0, learnCount: 0, dueCount: 0 };
              return (
                <article
                  className={`deck-tile ${activeDeckId === deck.id ? "selected" : ""}`}
                  key={deck.id}
                  onClick={() => openDeckDetail(deck.id)}
                >
                  <div className="deck-actions">
                    <button
                      className="deck-icon-edit"
                      title="Upload icon"
                      onClick={(event) => event.stopPropagation()}
                    >
                      ✎
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) onIconUpload(deck.id, file);
                          event.target.value = "";
                        }}
                      />
                    </button>
                  </div>
                  <div className="deck-body">
                    <div
                      className="icon-wrap"
                      style={deck.icon ? {} : { background: getLetterGradient(deck.name[0]) }}
                    >
                      {deck.icon ? (
                        <img src={deck.icon} alt={`${deck.name} icon`} />
                      ) : (
                        <span className="icon-letter">{deck.name[0]}</span>
                      )}
                    </div>
                    <div className="deck-info">
                      <div className="deck-name">{deck.name}</div>
                      <div className="counts">
                        <span>New {stats.newCount}</span>
                        <span>Learn {stats.learnCount}</span>
                        <span>Due {stats.dueCount}</span>
                      </div>
                      <div className="deck-controls" onClick={(event) => event.stopPropagation()}>
                        <button className="mini-btn" onClick={() => startReviewSession(deck.id)}>
                          Study
                        </button>
                        <button className="mini-btn" onClick={() => renameDeck(deck.id)}>
                          Rename
                        </button>
                        <button className="mini-btn danger" onClick={() => deleteDeck(deck.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <button
            className="fab"
            onClick={() => setShowNewDeckModal(true)}
            title="Create new deck"
          >
            +
          </button>

          {showNewDeckModal && (
            <div className="modal-overlay" onClick={() => setShowNewDeckModal(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <h3>Create New Deck</h3>
                <form
                  onSubmit={(e) => {
                    createDeck(e);
                    setShowNewDeckModal(false);
                  }}
                >
                  <input
                    value={newDeckName}
                    onChange={(event) => setNewDeckName(event.target.value)}
                    placeholder="Deck name"
                    autoFocus
                  />
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setShowNewDeckModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary-btn">
                      Create
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      )}

      {view === "Add" && (
        <main className="panel">
          <h2>Add Card</h2>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${addMode === "regular" ? "active" : ""}`}
              onClick={() => setAddMode("regular")}
              type="button"
            >
              Regular
            </button>
            <button
              className={`mode-btn ${addMode === "cloze" ? "active" : ""}`}
              onClick={() => setAddMode("cloze")}
              type="button"
            >
              Cloze
            </button>
          </div>
          <form className="add-form" onSubmit={addCard}>
            <select value={deckInput} onChange={(event) => setDeckInput(event.target.value)}>
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
            <textarea
              placeholder={addMode === "regular" ? "Front" : "Cloze text (e.g., Paris is the capital of {{France}}.)"}
              value={frontInput}
              onChange={(event) => setFrontInput(event.target.value)}
              rows={4}
            />
            <textarea
              placeholder={addMode === "regular" ? "Back" : "Back (optional notes/explanation)"}
              value={backInput}
              onChange={(event) => setBackInput(event.target.value)}
              rows={5}
            />
            {addMode === "cloze" && (
              <p className="hint">Wrap hidden text in double curly braces: {`{{word}}`}</p>
            )}
            <button className="primary-btn" type="submit">
              Save Card
            </button>
          </form>

          <section className="bulk-section">
            <h3>Bulk Import</h3>
            <form className="add-form" onSubmit={importBulkCards}>
              <select value={bulkDeckInput} onChange={(event) => setBulkDeckInput(event.target.value)}>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                placeholder={"front<TAB>back\nTerm 1\tDefinition 1\nTerm 2\tDefinition 2"}
              />
              <button className="primary-btn" type="submit">
                Import Cards
              </button>
            </form>
          </section>
        </main>
      )}

      {view === "DeckDetail" && (
        <main className="panel">
          <div className="deck-detail-top">
            <button className="mini-btn" type="button" onClick={() => setView("Decks")}>
              Back
            </button>
            <h2>{decks.find((deck) => deck.id === activeDeckId)?.name || "Deck"}</h2>
            <button className="primary-btn" type="button" onClick={() => openAddForDeck(activeDeckId)}>
              Add Card
            </button>
          </div>

          <input
            className="search"
            value={deckDetailQuery}
            onChange={(event) => setDeckDetailQuery(event.target.value)}
            placeholder="Search this deck..."
          />

          <div className="table-wrap">
            <table className="browse-table">
              <thead>
                <tr>
                  <th>Front</th>
                  <th>Back</th>
                  <th>State</th>
                  <th>Due Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deckDetailCards.map((card) => (
                  <tr key={card.id}>
                    <td>{card.front}</td>
                    <td>{card.back}</td>
                    <td>{card.state}</td>
                    <td>{getCardDueDateText(card)}</td>
                    <td>
                      <button
                        type="button"
                        className="browse-delete-btn"
                        title="Delete card"
                        onClick={() => deleteCardFromBrowse(card.id, card.front)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {view === "Browse" && (
        <main className="panel">
          <h2>Browse Cards</h2>
          <input
            className="search"
            value={browseQuery}
            onChange={(event) => setBrowseQuery(event.target.value)}
            placeholder="Search front/back/deck/state..."
          />
          <div className="table-wrap">
            <table className="browse-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => sortBrowseBy("front")}>Front{getSortMarker("front")}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => sortBrowseBy("back")}>Back{getSortMarker("back")}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => sortBrowseBy("deck")}>Deck{getSortMarker("deck")}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => sortBrowseBy("state")}>State{getSortMarker("state")}</button>
                  </th>
                  <th>
                    <button type="button" onClick={() => sortBrowseBy("dueDate")}>Due Date{getSortMarker("dueDate")}</button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {browseCards.map((card) => (
                  <tr key={card.id}>
                    <td>{card.front}</td>
                    <td>{card.back}</td>
                    <td>{decks.find((d) => d.id === card.deckId)?.name || "Deck"}</td>
                    <td>{card.state}</td>
                    <td>{getCardDueDateText(card)}</td>
                    <td>
                      <button
                        type="button"
                        className="browse-delete-btn"
                        title="Delete card"
                        onClick={() => deleteCardFromBrowse(card.id, card.front)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {view === "Stats" && (
        <main className="panel">
          <h2>Stats</h2>
          <section className="stats-section">
            <button className="stats-toggle" onClick={() => toggleStatsSection("overview")} type="button">
              <span>(1) Overview</span>
              <span>{statsOpen.overview ? "−" : "+"}</span>
            </button>
            {statsOpen.overview && (
              <div className="stats-grid-cards">
                <div className="stat-card">
                  <strong>{statsData.retentionRate}%</strong>
                  <span>Retention rate</span>
                </div>
                <div className="stat-card">
                  <strong>{statsData.cardsReviewedToday}</strong>
                  <span>Cards reviewed today</span>
                </div>
                <div className="stat-card">
                  <strong>{statsData.cardsDueToday}</strong>
                  <span>Cards due today</span>
                </div>
                <div className="stat-card">
                  <strong>{statsData.streak}</strong>
                  <span>Current streak</span>
                </div>
              </div>
            )}
          </section>

          <section className="stats-section">
            <button className="stats-toggle" onClick={() => toggleStatsSection("dailyActivity")} type="button">
              <span>(2) Daily Activity</span>
              <span>{statsOpen.dailyActivity ? "−" : "+"}</span>
            </button>
            {statsOpen.dailyActivity && (
              <div className="activity-wrap">
                <div className="activity-chart">
                  {statsData.days.map((day) => (
                    <div key={day.key} className="activity-col" title={`${day.label}: ${day.count}`}>
                      <div
                        className="activity-bar"
                        style={{ height: `${Math.max(4, (day.count / statsData.maxDay) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <p>Average cards/day (last 30 days): {statsData.avgPerDay}</p>
              </div>
            )}
          </section>

          <section className="stats-section">
            <button className="stats-toggle" onClick={() => toggleStatsSection("weakCards")} type="button">
              <span>(3) Weak Cards</span>
              <span>{statsOpen.weakCards ? "−" : "+"}</span>
            </button>
            {statsOpen.weakCards && (
              <div className="stats-list">
                {statsData.weakCards.length === 0 && <p>No weak cards (3+ lapses) right now.</p>}
                {statsData.weakCards.map((card) => (
                  <button
                    key={card.id}
                    className={`weak-item ${selectedWeakCardId === card.id ? "active" : ""}`}
                    onClick={() => setSelectedWeakCardId(card.id)}
                    type="button"
                  >
                    <span>{card.front}</span>
                    <span>{card.lapses} failures</span>
                  </button>
                ))}
                {selectedWeakCard && (
                  <div className="weak-detail">
                    <strong>Selected card answer:</strong>
                    <p>{selectedWeakCard.back}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="stats-section">
            <button className="stats-toggle" onClick={() => toggleStatsSection("cardHealth")} type="button">
              <span>(4) Card Health Warnings</span>
              <span>{statsOpen.cardHealth ? "−" : "+"}</span>
            </button>
            {statsOpen.cardHealth && (
              <div className="stats-list">
                {statsData.healthWarnings.length === 0 && <p>No long-answer warnings.</p>}
                {statsData.healthWarnings.map((item) => (
                  <div key={item.id} className="warning-item">
                    <strong>{item.front}</strong>
                    <p>Answer length: {item.length} chars. Suggestion: split into smaller cards.</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stats-section">
            <button className="stats-toggle" onClick={() => toggleStatsSection("reviewHistory")} type="button">
              <span>(5) Review History</span>
              <span>{statsOpen.reviewHistory ? "−" : "+"}</span>
            </button>
            {statsOpen.reviewHistory && (
              <div className="stats-list">
                {statsData.reviewHistoryRows.length === 0 && <p>No review history yet.</p>}
                {statsData.reviewHistoryRows.map((row) => (
                  <div key={row.id} className="history-card">
                    <div className="history-head">
                      <strong>{row.front}</strong>
                      <span>{row.deckName}</span>
                    </div>
                    <div className="history-log">
                      {row.reviews.map((entry, idx) => (
                        <div key={`${row.id}-${idx}`} className="history-row">
                          <span>{formatDateTime(entry.at)}</span>
                          <span>{entry.grade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {view === "Settings" && (
        <main className="panel">
          <h2>Settings</h2>

          {user && (
            <section className="stats-section account-section">
              <h3>Account</h3>
              <div className="account-row">
                <span className="account-email">{user.email}</span>
                <button className="mini-btn danger" onClick={() => signOut(auth)}>
                  Sign Out
                </button>
              </div>
            </section>
          )}

          <section className="stats-section">
            <h3>Daily Limits</h3>
            <div className="setting-card">
              <div>
                <strong>New cards per day</strong>
                <p>How many unseen cards can be introduced per day. Default is 20.</p>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  onClick={() =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      newCardsPerDay: Math.max(1, prev.newCardsPerDay - 1)
                    }))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={reviewSettings.newCardsPerDay}
                  onChange={(event) =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      newCardsPerDay: Math.max(1, Number(event.target.value) || 1)
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      newCardsPerDay: prev.newCardsPerDay + 1
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>

            <div className="setting-card">
              <div>
                <strong>Maximum reviews per day</strong>
                <p>Maximum number of cards shown in a review session. Default is 200.</p>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  onClick={() =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      dailyReviewLimit: Math.max(1, prev.dailyReviewLimit - 1)
                    }))
                  }
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={reviewSettings.dailyReviewLimit}
                  onChange={(event) =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      dailyReviewLimit: Math.max(1, Number(event.target.value) || 1)
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setReviewSettings((prev) => ({
                      ...prev,
                      dailyReviewLimit: prev.dailyReviewLimit + 1
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>
          </section>

          <section className="stats-section">
            <h3>Theme Colors</h3>
            <div className="theme-grid">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-circle ${themeId === theme.id ? "active" : ""}`}
                  title={theme.name}
                  type="button"
                  style={{ background: theme.id === "white" ? "#ffffff" : theme.id === "black" ? "#000000" : theme.accent }}
                  onClick={() => setThemeId(theme.id)}
                >
                  <span>{theme.name}</span>
                </button>
              ))}
              <label className={`theme-circle custom ${themeId === "custom" ? "active" : ""}`} title="Custom color">
                <input
                  type="color"
                  value={customColor}
                  onChange={(event) => {
                    setCustomColor(event.target.value);
                    setThemeId("custom");
                  }}
                />
                <span>Custom</span>
              </label>
            </div>
          </section>
        </main>
      )}

      {view === "Sign In" && (
        <main className="panel">
          <h2>{authMode === "signin" ? "Sign In" : "Sign Up"}</h2>
          <form className="add-form" onSubmit={submitAuth}>
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="Email"
              required
            />
            <input
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password"
              minLength={6}
              required
            />
            {authError && <p className="hint">{authError}</p>}
            <button className="primary-btn" type="submit">
              {authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
          <button
            className="mini-btn"
            type="button"
            onClick={() => setAuthMode((m) => (m === "signin" ? "signup" : "signin"))}
          >
            {authMode === "signin" ? "Need an account? Sign Up" : "Have an account? Sign In"}
          </button>
        </main>
      )}
    </div>
  );
}
