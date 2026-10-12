import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CardWithMeta } from '../cards/Card';
import type { Settings } from '../../types';
import type { SetDefinition } from '../../engine';
import { openPack, prefetchNextPack, type OpenedPack } from '../../game/pulls';
import { triggerRarityConfetti, triggerHoloSparkles } from '../../utils/confettiEffects';
import { usePackCutter } from '../../hooks/usePackCutter';
import { useAudio } from '../../hooks/useAudio';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { BRAINROT_VOICES, EFFECT_SOUNDS, CARD_FLIP_SRC } from '../../constants/audio';
import { effectsLevel } from '../../utils/settings';
import PackCuttingUI from './PackCuttingUI';
import CardRevealUI from './CardRevealUI';
import PackSummaryUI from './PackSummaryUI';
import { packImageUrl } from '../../content/art';
import { isBigPull, markNew, revealOrder } from '../../game/reveal';
import '../../styles/PackOpener.css';

const Motion = motion;

interface PreloadedAssets {
  brainrotVoices: HTMLAudioElement[];
  cardFlip: HTMLAudioElement;
  effects: HTMLAudioElement[];
}

interface PackOpenerProps {
  /** Called once every card has been revealed. */
  onOpen: (pack: OpenedPack) => void;
  onShare: (pack: OpenedPack) => void;
  /** True while a pack is being opened (its ticket is spent but it isn't recorded yet). */
  onBusyChange?: (busy: boolean) => void;
  set: SetDefinition;
  disabled?: boolean;
  settings: Settings;
  /** Whether the collection already had this card before the pack (for the NEW sticker). */
  isOwned?: (cardKey: string) => boolean;
}

const PackOpener = ({ onOpen, onShare, onBusyChange, set, disabled = false, settings, isOwned }: PackOpenerProps) => {
  const [isOpening, setIsOpening] = useState(false);
  const [openedPack, setOpenedPack] = useState<OpenedPack | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openedCards, setOpenedCards] = useState<CardWithMeta[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPackCut, setIsPackCut] = useState(false);
  const [preloadedAssets, setPreloadedAssets] = useState<PreloadedAssets | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const packDesign = packImageUrl(set.id);
  const [hasMovedMouse, setHasMovedMouse] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const effectsVolume = effectsLevel(settings.effectsVolume);

  const { playAndCleanup, preloadAudio, cleanupAudio, playRandom } = useAudio();

  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInteractionRef = useRef<() => void>(() => {});
  /** Whether this pack has been handed to onOpen; a pack is recorded once, however it's finished. */
  const recordedRef = useRef(false);

  const startOpening = useCallback(async () => {
    let pack: OpenedPack;
    try {
      // Usually instant: the ticket was mined while the pack was on screen.
      pack = await openPack(set);
    } catch (error) {
      console.error('Could not open pack', error);
      setOpenError('This pack refused to open. Try again!');
      setIsPackCut(false);
      return;
    }
    const brainrotVoices = preloadAudio(BRAINROT_VOICES);
    const cardFlip = preloadAudio([CARD_FLIP_SRC])[0];
    const effects = preloadAudio(EFFECT_SOUNDS);

    setPreloadedAssets({ brainrotVoices, cardFlip, effects });
    recordedRef.current = false;
    setOpenedPack(pack);
    // Shown rarest last, with NEW on cards the collection didn't have yet. The pack itself (and its
    // proof and history) keeps the engine's order.
    setOpenedCards(markNew(revealOrder(pack.cards), (key) => isOwned?.(key) ?? true));
    setCurrentIndex(0);
    setIsOpening(true);
  }, [set, preloadAudio, isOwned]);

  // Mine the next pack's ticket while this one is on screen.
  useEffect(() => {
    if (!isOpening) prefetchNextPack(set);
  }, [isOpening, set]);

  // A pack in progress has spent its ticket, so the app must not swap sets until it's recorded.
  useEffect(() => onBusyChange?.(isOpening), [isOpening, onBusyChange]);

  const handleCutComplete = useCallback(() => {
    setIsPackCut(true);
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
    }
    setOpenError(null);
    openTimeoutRef.current = window.setTimeout(() => {
      void startOpening();
    }, 460);
  }, [startOpening]);

  const {
    packRef,
    isCutting,
    cutPoints,
    sparks,
    resetCutState,
    completeCut,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    endCutAttempt,
    cleanup: cleanupCutter,
  } = usePackCutter({
    onCutComplete: handleCutComplete,
    isOpening,
    isPackCut,
    volume: effectsVolume,
  });

  const finishPack = useCallback(() => {
    if (preloadedAssets) {
      cleanupAudio(preloadedAssets.brainrotVoices);
      cleanupAudio([preloadedAssets.cardFlip]);
      cleanupAudio(preloadedAssets.effects);
    }
    setPreloadedAssets(null);
    setIsOpening(false);
    setOpenedPack(null);
    setOpenedCards([]);
    setCurrentIndex(0);
    setIsPackCut(false);
    setShowSummary(false);
    setHasMovedMouse(false);
    resetCutState();
  }, [resetCutState, preloadedAssets, cleanupAudio]);

  /** The pack as the engine dealt it, face up: what's recorded and shared (the reveal order is only for show). */
  const dealtPack = useCallback((): OpenedPack | null => (openedPack ? { ...openedPack, cards: openedPack.cards.map((card) => ({ ...card, isRevealed: true })) } : null), [openedPack]);

  const recordPack = useCallback(() => {
    const pack = dealtPack();
    if (!pack || recordedRef.current) return;
    recordedRef.current = true;
    onOpen(pack);
  }, [dealtPack, onOpen]);

  const nextCard = useCallback(() => {
    if (currentIndex < openedCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      recordPack();
      setShowSummary(true);
    }
  }, [currentIndex, openedCards, recordPack]);

  /** Reveal everything at once and go to the summary. */
  const skipAll = useCallback(() => {
    setOpenedCards(openedCards.map((card) => ({ ...card, isRevealed: true })));
    recordPack();
    setShowSummary(true);
  }, [openedCards, recordPack]);

  const closeSummary = useCallback(() => {
    finishPack();
  }, [finishPack]);

  const handleFlip = useCallback(() => {
    const currentCard = openedCards[currentIndex];
    if (!currentCard || !preloadedAssets) return;

    if (effectsVolume > 0) {
      playAndCleanup(preloadedAssets.cardFlip, effectsVolume);
      playRandom(preloadedAssets.effects, effectsVolume);
    }

    const newCards = [...openedCards];
    newCards[currentIndex].isRevealed = true;
    setOpenedCards(newCards);

    // A short buzz on phones: a tick for any card, a double for big pulls.
    if (typeof navigator.vibrate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigator.vibrate(isBigPull(currentCard.rarity) ? [18, 60, 30] : 8);
    }

    if (settings.particlesEnabled) {
      triggerRarityConfetti(currentCard.rarity);
      if (currentCard.isHolo) {
        triggerHoloSparkles();
      }
    }
  }, [openedCards, currentIndex, preloadedAssets, playAndCleanup, playRandom, settings, effectsVolume]);

  const handleInteraction = useCallback(() => {
    if (!isOpening) return;

    const currentItem = openedCards[currentIndex];
    if (currentItem && !currentItem.isRevealed) {
      handleFlip();
    } else {
      nextCard();
    }
  }, [isOpening, openedCards, currentIndex, handleFlip, nextCard]);

  // Keep ref updated for use in intervals (avoids stale closure)
  useEffect(() => {
    handleInteractionRef.current = handleInteraction;
  }, [handleInteraction]);

  // Use keyboard controls hook
  useKeyboardControls({
    isOpening,
    showSummary,
    disabled,
    onCloseSummary: closeSummary,
    onToggleAutoMode: () => setAutoMode(prev => !prev),
    handleInteractionRef,
  });

  // Play "what kind of brainrot" when a new card appears
  useEffect(() => {
    if (isOpening && preloadedAssets && openedCards[currentIndex] && !openedCards[currentIndex].isRevealed && effectsVolume > 0) {
      const timer = setTimeout(() => {
        playRandom(preloadedAssets.brainrotVoices, effectsVolume);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isOpening, currentIndex, preloadedAssets, openedCards, playRandom, effectsVolume]);

  // Hide mouse hint after user moves mouse
  useEffect(() => {
    if (!isOpening || hasMovedMouse) return;
    const handleMouseMove = () => setHasMovedMouse(true);
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isOpening, hasMovedMouse]);

  // Auto mode effect
  useEffect(() => {
    if (autoMode && !disabled) {
      autoIntervalRef.current = setInterval(() => {
        if (showSummary) {
          closeSummary();
        } else if (!isOpening && !isPackCut) {
          completeCut();
        } else if (isOpening) {
          handleInteraction();
        }
      }, 100);
    } else {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    }

    return () => {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    };
  }, [autoMode, disabled, showSummary, isOpening, isPackCut, closeSummary, completeCut, handleInteraction]);

  // Stop auto mode when disabled (adjusting state during render avoids an extra effect pass)
  if (disabled && autoMode) {
    setAutoMode(false);
  }

  // Pointer event listeners for cutting
  useEffect(() => {
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('blur', endCutAttempt);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('blur', endCutAttempt);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerEnd, endCutAttempt]);

  // Unmounted mid-reveal (the set list changed under it): the pack still goes to the collection.
  const recordOnUnmountRef = useRef(recordPack);
  useEffect(() => {
    recordOnUnmountRef.current = recordPack;
  }, [recordPack]);

  useEffect(() => () => recordOnUnmountRef.current(), []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
    }
    cleanupCutter();
  }, [cleanupCutter]);

  const currentCard = openedCards[currentIndex];

  return (
    <div className="pack-opener-container">
      <AnimatePresence mode="wait">
        {!isOpening ? (
          <Motion.div
            key="pack"
            initial={{ y: '-100vh', opacity: 0, rotate: -10 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 80,
              damping: 12,
              mass: 1
            }}
            className="pack-display"
          >
            <PackCuttingUI
              packRef={packRef}
              packDesign={packDesign}
              set={set}
              error={openError}
              isCutting={isCutting}
              isPackCut={isPackCut}
              cutPoints={cutPoints}
              sparks={settings.particlesEnabled ? sparks : []}
            />
          </Motion.div>
        ) : (
          <Motion.div
            key="opening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card-reveal-area"
          >
            {!showSummary ? (
              <CardRevealUI
                currentCard={currentCard}
                currentIndex={currentIndex}
                totalCards={openedCards.length}
                hasMovedMouse={hasMovedMouse}
                onInteraction={handleInteraction}
                onSkip={skipAll}
              />
            ) : (
              <PackSummaryUI
                openedCards={openedCards}
                set={set}
                onClose={closeSummary}
                onShare={openedPack ? () => onShare(dealtPack()!) : undefined}
              />
            )}
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PackOpener;
