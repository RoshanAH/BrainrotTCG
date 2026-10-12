import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Card } from '../../data/cards';
import { CARD_RARITIES, getSetCards } from '../../data/cards';
import { getLatestSet, setCode } from '../../content/sets';
import { getPlayer } from '../../game/player';
import { findPackWithCard } from '../../game/history';
import { cardPreviewPath } from '../../game/previewLinks';
import { proofFor, pullUrl } from '../../game/pulls';
import { renderCardPoster } from '../../game/bragImage';
import SharePreviewSheet from './SharePreviewSheet';

interface CardShareSheetProps {
  card: Card;
  isHolo: boolean;
  onClose: () => void;
}

const RARITY_COLORS: Record<string, string> = {
  COMMON: '#b8b4bd',
  UNCOMMON: '#5fd38d',
  RARE: '#6aa8ff',
  EPIC: '#c08bff',
  LEGENDARY: '#ffa24d',
  BRAINROT: '#ffd23f',
};

/**
 * Share one card from your collection: a poster of the card, with a link to the pack it came from
 * when this device has that pack, so the card is as verifiable as the pull.
 */
const CardShareSheet = ({ card, isHolo, onClose }: CardShareSheetProps) => {
  const player = getPlayer();
  const set = getLatestSet(card.setId);
  const setName = set?.name ?? card.setId;
  const code = set ? setCode(set) : card.setId.toUpperCase();
  const cards = getSetCards(card.setId);
  const index = cards.findIndex((c) => c.key === card.key);
  const number = `${String(index + 1).padStart(3, '0')}/${String(cards.length).padStart(3, '0')}`;
  const cardId = card.key.split('/')[1];

  const pack = useMemo(() => findPackWithCard(player.publicKeyHex, card.setId, cardId, isHolo), [player.publicKeyHex, card.setId, cardId, isHolo]);
  const proof = useMemo(
    () => (pack ? proofFor({ setId: pack.setId, setVersion: pack.setVersion, nonce: pack.nonce, publicKeyHex: pack.key }) : undefined),
    [pack],
  );
  // The QR code opens the pull directly; the pasted link previews as this card.
  const url = proof ? pullUrl(proof) : undefined;
  const link = proof ? pullUrl(proof, cardPreviewPath(card.setId, cardId)) : undefined;
  const rarity = CARD_RARITIES[card.rarity];
  const text = `${card.name} (${rarity.name}${isHolo ? ', holo' : ''}) from ${setName} in Brainrot TCG${link ? `\n${link}` : ''}`;

  return (
    <SharePreviewSheet
      title={`Share ${card.name}`}
      subtitle={`${rarity.symbol} ${rarity.name}${isHolo ? ' · Holo' : ''} · ${code} ${number}`}
      makeImage={() =>
        renderCardPoster({
          card: {
            image: card.image,
            name: card.name,
            isHolo,
            rarityName: rarity.name,
            raritySymbol: rarity.symbol,
            rarityColor: RARITY_COLORS[card.rarity],
            number,
          },
          setName,
          setCode: code,
          setColor: set?.palette?.[0],
          playerName: player.name,
          fingerprint: player.fingerprint,
          url,
          cert: pack ? `${code} #${pack.nonce}` : undefined,
        })
      }
      imageName={`brainrot-${card.key.replace('/', '-')}${isHolo ? '-holo' : ''}.png`}
      url={link}
      text={text}
      onClose={onClose}
    >
      <p className="share-note">
        <ShieldCheck aria-hidden="true" />
        {url
          ? `The link opens the pack this ${isHolo ? 'holo ' : ''}card came from (ticket #${pack!.nonce}), re-checked on their device.`
          : "This card isn't in any pack this device has a record of (it came before verifiable pulls), so there's no link to prove it."}
      </p>
    </SharePreviewSheet>
  );
};

export default CardShareSheet;
