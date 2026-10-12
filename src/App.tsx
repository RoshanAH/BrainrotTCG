import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './styles/index.css';
import PackOpener from './components/pack/PackOpener';
import AchievementToasts from './components/achievements/AchievementToasts';
import AppNav, { type NavTarget } from './components/ui/AppNav';
import MyProfilePage from './components/profile/MyProfilePage';
import ProfileViewerPage from './components/profile/ProfileViewerPage';
import AchievementsPage from './components/achievements/AchievementsPage';
import HallOfFamePage from './components/pages/HallOfFamePage';
import SettingsPage from './components/pages/SettingsPage';
import CollectionBrowser from './components/collection/CollectionBrowser';
import SetPicker from './components/sets/SetPicker';
import ShareSheet, { type ShareTarget } from './components/share/ShareSheet';
import PullViewerPage from './components/share/PullViewerPage';
import { scoreCards } from './data/cards';
import { getAchievementById, Achievement } from './data/achievements';
import { CardWithMeta } from './components/cards/Card';
import { DEFAULT_SET_ID, SETS } from './content/sets';
import { extractProfile, extractProof } from './engine';
import type { OpenedPack } from './game/pulls';
import { importPlayer } from './game/player';
import { getStoredData } from './utils/storage';
import { CURRENT_DATA_VERSION, hydrateCollection, setDataVersion } from './utils/migrations';
import { STORAGE_KEYS } from './constants';
import {
  checkPackMilestones,
  checkCollectionAchievements,
  checkPackAchievements,
} from './utils/achievementChecks';
import type { CollectionItem, Stats, HallOfFameData, Settings, AchievementData } from './types';
import swedenSrc from './assets/audio/Sweden.mp3';

const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  particlesEnabled: true,
};

/** Save-file fields and where they live in localStorage. */
const SAVE_FIELDS = [
  ['collection', STORAGE_KEYS.COLLECTION],
  ['achievements', STORAGE_KEYS.ACHIEVEMENTS],
  ['stats', STORAGE_KEYS.STATS],
  ['hallOfFame', STORAGE_KEYS.HALL_OF_FAME],
  ['pulls', STORAGE_KEYS.PULLS],
  ['history', STORAGE_KEYS.HISTORY],
  ['settings', STORAGE_KEYS.SETTINGS],
] as const;

function App() {
  const [collection, setCollection] = useState<Record<string, CollectionItem>>(() => hydrateCollection(getStoredData(STORAGE_KEYS.COLLECTION, {})));
  const [achievements, setAchievements] = useState<Record<string, AchievementData | number>>(() => getStoredData(STORAGE_KEYS.ACHIEVEMENTS, {}));
  const [stats, setStats] = useState<Stats>(() => getStoredData(STORAGE_KEYS.STATS, { packsOpened: 0, holoCards: {}, highestPackValue: 0, highestPackCards: [] }));
  const [hallOfFame, setHallOfFame] = useState<HallOfFameData>(() => getStoredData(STORAGE_KEYS.HALL_OF_FAME, {}));

  const [settings, setSettings] = useState<Settings>(() => getStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS));

  const [isCollectionOpen, setIsCollectionOpen] = useState(false);
  const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
  const [isHallOfFameOpen, setIsHallOfFameOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notificationQueue, setNotificationQueue] = useState<Achievement[]>([]);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [viewProof, setViewProof] = useState<string | null>(() => extractProof(window.location.hash));
  const [viewProfile, setViewProfile] = useState<string | null>(() => extractProfile(window.location.hash));

  const playableSets = SETS.filter((s) => !s.archivedAt && (!s.draft || settings.showDraftSets));
  const [selectedSetId, setSelectedSetId] = useState<string>(() => localStorage.getItem(STORAGE_KEYS.SELECTED_SET) ?? DEFAULT_SET_ID);
  const selectedSet = playableSets.find((s) => s.id === selectedSetId) ?? playableSets.find((s) => s.id === DEFAULT_SET_ID) ?? playableSets[0];
  const selectSet = useCallback((setId: string) => {
    setSelectedSetId(setId);
    localStorage.setItem(STORAGE_KEYS.SELECTED_SET, setId);
  }, []);

  // Shared pull links: #/pull/<proof>
  useEffect(() => {
    const onHashChange = () => {
      setViewProof(extractProof(window.location.hash));
      setViewProfile(extractProfile(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const closePullViewer = useCallback(() => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setViewProof(null);
    setViewProfile(null);
  }, []);

  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  // Play background music on page load
  useEffect(() => {
    const bgMusic = new Audio(swedenSrc);
    bgMusic.volume = 0.05;
    bgMusic.loop = true;
    bgMusicRef.current = bgMusic;

    if (settings.soundEnabled) {
      bgMusic.play().catch(() => { });
    }

    return () => {
      bgMusic.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle sound toggle for background music
  useEffect(() => {
    if (bgMusicRef.current) {
      if (settings.soundEnabled) {
        bgMusicRef.current.play().catch(() => { });
      } else {
        bgMusicRef.current.pause();
      }
    }
  }, [settings.soundEnabled]);

  // Check retroactive achievements on mount
  useEffect(() => {
    // Use shared achievement checking functions
    const packAchievements = checkPackMilestones(stats.packsOpened || 0, achievements);
    const collectionAchievements = checkCollectionAchievements(collection, stats, achievements);

    const retroactiveAchievements = [...packAchievements, ...collectionAchievements];

    // Apply retroactive achievements (without notifications to avoid spam on load)
    if (retroactiveAchievements.length > 0) {
      const timestamp = Date.now();
      setAchievements(prev => {
        const next = { ...prev };
        retroactiveAchievements.forEach(id => {
          if (!next[id]) next[id] = timestamp;
        });
        localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(next));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  const unlockAchievement = useCallback((achievementId: string, pack?: CardWithMeta[]) => {
    const achievement = getAchievementById(achievementId);
    if (!achievement) return;

    let wasUnlocked = false;
    setAchievements(prev => {
      // Check inside functional update to avoid stale closure
      if (prev[achievementId]) return prev;

      wasUnlocked = true;
      const achievementData: AchievementData = {
        unlockedAt: Date.now(),
        pack: pack,
      };
      const next = { ...prev, [achievementId]: achievementData };
      localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(next));
      return next;
    });

    // Only add to notification queue if we actually unlocked it
    // Use setTimeout to ensure state has updated
    setTimeout(() => {
      if (wasUnlocked) {
        setNotificationQueue(prev => {
          // Prevent duplicates in queue
          if (prev.some(a => a.id === achievementId)) return prev;
          return [...prev, achievement];
        });
      }
    }, 0);
  }, []);

  const dismissNotifications = useCallback((ids: string[]) => {
    setNotificationQueue(prev => prev.filter(a => !ids.includes(a.id)));
  }, []);

  const openNav = useCallback((target: NavTarget) => {
    ({
      collection: setIsCollectionOpen,
      achievements: setIsAchievementsOpen,
      hallOfFame: setIsHallOfFameOpen,
      profile: setIsProfileOpen,
      settings: setIsSettingsOpen,
    })[target](true);
  }, []);

  const handleSettingsChange = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
  }, []);

  const handleImportSave = useCallback((data: string) => {
    try {
      const saveData = JSON.parse(data);

      // Validate save data structure
      if (!saveData.version || !saveData.exportedAt) {
        alert('Invalid save file format');
        return;
      }

      // Write everything, then reload: the loader runs any migrations an older save needs
      // (saves from before timeline sets use old card ids and the old score scale).
      for (const [field] of SAVE_FIELDS) {
        if (typeof saveData[field] === 'string') JSON.parse(saveData[field]); // reject corrupt files before writing anything
      }
      for (const [field, key] of SAVE_FIELDS) {
        if (typeof saveData[field] === 'string') localStorage.setItem(key, saveData[field]);
      }
      if (typeof saveData.player === 'string' && !importPlayer(saveData.player)) {
        alert('The player key in this save is invalid; keeping your current one.');
      }
      setDataVersion(typeof saveData.dataVersion === 'number' ? saveData.dataVersion : saveData.version === 1 ? 1 : CURRENT_DATA_VERSION);

      alert('Save imported successfully!');
      window.location.reload();
    } catch {
      alert('Failed to import save file. Please check the file format.');
    }
  }, []);

  const checkAllAchievements = useCallback((newCards: CardWithMeta[], updatedCollection: Record<string, CollectionItem>, updatedStats: Stats, currentAchievements: Record<string, AchievementData | number>) => {
    // Use shared achievement checking functions - pass current achievements to avoid stale state
    const packMilestones = checkPackMilestones(updatedStats.packsOpened, currentAchievements);
    const collectionAchievements = checkCollectionAchievements(updatedCollection, updatedStats, currentAchievements);
    const packAchievements = checkPackAchievements(newCards, currentAchievements);

    // Combine all achievements and unlock them with the pack data
    const allNewAchievements = [...packMilestones, ...collectionAchievements, ...packAchievements];
    allNewAchievements.forEach(id => unlockAchievement(id, newCards));
  }, [unlockAchievement]);

  const handlePackOpened = useCallback((pack: OpenedPack) => {
    const newCards = pack.cards;
    const pullRef = { setId: pack.setId, setVersion: pack.setVersion, nonce: pack.nonce, publicKeyHex: pack.publicKeyHex };
    const { points: packValue, hand: pokerHand, score } = scoreCards(newCards);

    // Update stats using functional update to avoid stale closure
    let updatedStats: Stats = stats;
    setStats(prev => {
      const newStats: Stats = {
        ...prev,
        packsOpened: (prev.packsOpened || 0) + 1,
        holoCards: { ...prev.holoCards }
      };

      // Update highest pack value - compare against previous state
      if (score > (prev.highestPackFlexValue || prev.highestPackValue || 0)) {
        newStats.highestPackFlexValue = score;
        newStats.highestPackBaseValue = packValue;
        newStats.highestPackMultiplier = pokerHand.multiplier;
        newStats.highestPackHandName = pokerHand.name;
        newStats.highestPackCards = newCards;
        newStats.highestPackRef = pullRef;
        newStats.highestPackLegacy = false;
      }

      // Track holo cards
      newCards.forEach(card => {
        if (card.isHolo) {
          newStats.holoCards[card.key] = true;
        }
      });

      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(newStats));
      updatedStats = newStats;
      return newStats;
    });

    // Update collection - track holo and normal counts separately
    let updatedCollection: Record<string, CollectionItem> = {};
    setCollection((prev) => {
      const next = { ...prev };

      // Count normal and holo cards separately
      const normalCounts: Record<string, number> = {};
      const holoCounts: Record<string, number> = {};
      newCards.forEach((card) => {
        if (card.isHolo) {
          holoCounts[card.key] = (holoCounts[card.key] || 0) + 1;
        } else {
          normalCounts[card.key] = (normalCounts[card.key] || 0) + 1;
        }
      });

      // Get all unique card IDs from this pack
      const cardIds = new Set(newCards.map(c => c.key));
      cardIds.forEach((cardId) => {
        const card = newCards.find(c => c.key === cardId);
        if (!card) return;
        const existing = next[cardId];
        next[cardId] = {
          card: { key: card.key, setId: card.setId, id: card.id, name: card.name, rarity: card.rarity, image: card.image },
          normalCount: (existing?.normalCount || 0) + (normalCounts[cardId] || 0),
          holoCount: (existing?.holoCount || 0) + (holoCounts[cardId] || 0),
        };
      });

      localStorage.setItem(STORAGE_KEYS.COLLECTION, JSON.stringify(next));
      updatedCollection = next;
      return next;
    });

    // Check Hall of Fame milestones
    const updatedHallOfFame = { ...hallOfFame };
    const cardCounts: Record<string, number> = {};
    newCards.forEach(c => {
      cardCounts[c.id] = (cardCounts[c.id] || 0) + 1;
    });
    const maxCount = Math.max(...Object.values(cardCounts));

    // First 4 of a kind
    if (maxCount >= 4 && !hallOfFame.first4OfAKind) {
      const cardId = Object.entries(cardCounts).find(([, count]) => count >= 4)?.[0];
      if (cardId) {
        updatedHallOfFame.first4OfAKind = {
          achieved: true,
          date: Date.now(),
          cardId
        };
      }
    }

    // First full house
    const counts = Object.values(cardCounts);
    const hasThree = counts.some(c => c >= 3);
    const hasTwo = counts.filter(c => c >= 2).length >= 2;
    if (hasThree && hasTwo && !hallOfFame.firstFullHouse) {
      updatedHallOfFame.firstFullHouse = {
        achieved: true,
        date: Date.now(),
        cards: cardCounts
      };
    }

    if (updatedHallOfFame !== hallOfFame) {
      setHallOfFame(updatedHallOfFame);
      localStorage.setItem(STORAGE_KEYS.HALL_OF_FAME, JSON.stringify(updatedHallOfFame));
    }

    // Check pack value achievements - unlockAchievement handles duplicates internally
    const packValueAchievements: string[] = [];
    // Thresholds are 10x the original Buhcoin-era ones (card points were scaled by 10).
    if (score === 50) packValueAchievements.push('pack_value_5');
    const PACK_SCORE_ACHIEVEMENTS: [number, string][] = [
      [500, 'pack_value_50'], [1_000, 'pack_value_100'], [5_000, 'pack_value_500'], [10_000, 'pack_value_1000'],
      [20_000, 'pack_value_2000'], [30_000, 'pack_value_3000'], [40_000, 'pack_value_4000'], [50_000, 'pack_value_5000'],
      [60_000, 'pack_value_6000'], [70_000, 'pack_value_7000'], [80_000, 'pack_value_8000'], [90_000, 'pack_value_9000'],
      [100_000, 'pack_value_10000'], [100_000_000, 'pack_value_max'],
    ];
    PACK_SCORE_ACHIEVEMENTS.forEach(([min, id]) => score >= min && packValueAchievements.push(id));
    packValueAchievements.forEach(id => unlockAchievement(id, newCards));

    // Check other achievements - get current state to avoid stale closure
    setAchievements(currentAchievements => {
      checkAllAchievements(newCards, updatedCollection || collection, updatedStats, currentAchievements);
      return currentAchievements;
    });
  }, [stats, hallOfFame, collection, checkAllAchievements, unlockAchievement]);

  const sharePack = useCallback((pack: OpenedPack) => {
    setShareTarget({ ref: { setId: pack.setId, setVersion: pack.setVersion, nonce: pack.nonce, publicKeyHex: pack.publicKeyHex }, cards: pack.cards, score: pack.score });
  }, []);

  // For the NEW sticker: the collection as it was before the pack being opened.
  const isOwned = useCallback((cardKey: string) => !!collection[cardKey], [collection]);

  // Progress shown on the counting achievements that are still locked.
  const achievementProgress = useMemo(() => {
    const packs = stats.packsOpened || 0;
    const items = Object.values(collection);
    const unique = items.length;
    const holos = items.reduce((n, item) => n + (item?.holoCount || 0), 0);
    const out: Record<string, [number, number, string]> = {};
    for (const n of [10, 41, 67, 100, 420, 1000]) out[`packs_${n}`] = [packs, n, 'packs'];
    for (const n of [5, 10]) out[`collect_${n}`] = [unique, n, 'cards'];
    for (const n of [25, 100]) out[`total_holos_${n}`] = [holos, n, 'holos'];
    return out;
  }, [stats.packsOpened, collection]);

  const isAnyModalOpen = isCollectionOpen || isAchievementsOpen || isHallOfFameOpen || isProfileOpen || isSettingsOpen || !!shareTarget || !!viewProof || !!viewProfile;

  return (
    <div className={`app ${packBusy ? 'is-focus' : ''}`}>
      <header className="app-header">
        <h1 className="app-logo" aria-label="Brainrot TCG">
          {'Brainrot TCG'.split('').map((char, i) =>
            char === ' ' ? (
              <span key={i} className="title-space" aria-hidden="true" />
            ) : (
              <span key={i} className="title-char" aria-hidden="true" style={{ animationDelay: `${i * 0.08}s` }}>
                {char}
              </span>
            ),
          )}
        </h1>
        <AppNav onOpen={openNav} />
      </header>

      <main className="app-main">
        <SetPicker sets={playableSets} selectedId={selectedSet.id} onSelect={selectSet} collection={collection} disabled={packBusy} />
        <PackOpener
          key={selectedSet.id}
          onOpen={handlePackOpened}
          onShare={sharePack}
          onBusyChange={setPackBusy}
          set={selectedSet}
          disabled={isAnyModalOpen}
          settings={settings}
          isOwned={isOwned}
        />
      </main>

      <AchievementToasts queue={notificationQueue} onDismiss={dismissNotifications} onOpen={() => setIsAchievementsOpen(true)} />

      {/* Achievements Page */}
      {isAchievementsOpen && (
        <AchievementsPage
          unlockedAchievements={achievements}
          onClose={() => setIsAchievementsOpen(false)}
          progress={achievementProgress}
        />
      )}

      {/* Hall of Fame Page */}
      {isHallOfFameOpen && (
        <HallOfFamePage
          onClose={() => setIsHallOfFameOpen(false)}
        />
      )}

      {isProfileOpen && (
        <MyProfilePage
          stats={stats}
          onClose={() => setIsProfileOpen(false)}
          onSharePull={(entry, cards) =>
            setShareTarget({
              ref: { setId: entry.setId, setVersion: entry.setVersion, nonce: entry.nonce, publicKeyHex: entry.key },
              cards,
              score: scoreCards(cards),
            })
          }
        />
      )}

      {/* Collection Browser */}
      {isCollectionOpen && (
        <CollectionBrowser
          collection={collection}
          onClose={() => setIsCollectionOpen(false)}
        />
      )}

      {shareTarget && <ShareSheet target={shareTarget} onClose={() => setShareTarget(null)} />}

      {viewProof && <PullViewerPage proof={viewProof} onClose={closePullViewer} />}

      {viewProfile && <ProfileViewerPage proof={viewProfile} onClose={closePullViewer} />}

      {/* Settings Page */}
      {isSettingsOpen && (
        <SettingsPage
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onClose={() => setIsSettingsOpen(false)}
          onImportSave={handleImportSave}
        />
      )}
    </div>
  );
}

export default App;
