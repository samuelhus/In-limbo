import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cloudinaryFit } from '@/lib/cloudinary';

// Kleine afstand ("kleine swipebeweging") volstaat al, vooral belangrijk op
// mobiel waar het origineel 120px al snel te veel bleek: een vinger die een
// stuk over het scherm sleept, maar niet meteen 120px haalt, gaf voordien
// geen swipe. VELOCITY_THRESHOLD vangt daarnaast de korte, snelle "flick"
// op die de afstandsgrens niet haalt maar wel duidelijk een swipe bedoelt.
const SWIPE_DISTANCE_THRESHOLD = 60;
const SWIPE_VELOCITY_THRESHOLD = 500; // px/s

/**
 * PRD_Schat_of_Schroot.md §4.1: klik-en-sleep de kaart (framer-motion, al
 * aanwezig als dependency) over de volledige foto — de hele kaart is het
 * sleepvlak (drag="x" op de motion.div, de <img> zelf negeert pointer-events
 * zodat niets het slepen kan onderscheppen) — of klik op een van de knoppen
 * náást de foto (zie hieronder, PRD §8.4-toegankelijkheidsalternatief voor
 * het slepen).
 *
 * De vuilbak-/lampknop staan bewust náást de foto i.p.v. eronder: ze zijn
 * geen kind van de sleepbare motion.div (dat zou ze binnen de foto's eigen
 * grenzen houden, dus ór op de foto i.p.v. ernaast), maar een sibling in
 * deze buitenste, iets breder opgevulde wrapper (px-10 i.p.v. de gangbare
 * px-4) — zo vallen ze grotendeels in die extra zijmarge, met net het
 * stukje dat erover de foto-rand heen steekt als bewuste, kleine overlap.
 * Elke knop krijgt een eigen stroke/achtergrond (i.p.v. transparant) zodat
 * hij afsteekt tegen om het even welke onderliggende foto, plus een klein
 * pijltje ernaast dat naar buiten wijst (weg van de foto) om de
 * sleeprichting te verduidelijken.
 *
 * Bij `compact` (na swipe rechts): "foto verkleint tot net genoeg ruimte" —
 * geen volledige minimalisatie, dus een kleinere statische variant i.p.v.
 * een thumbnail, hieronder gerenderd voor de evaluatie-/keuzestappen. Geen
 * swipe-knoppen nodig in die variant (het spel is voor deze listing al
 * voorbij het slepen), dus gewone px-4.
 */
export default function SwipeCard({ listing, onSwipe, disabled = false, compact = false }) {
  const { t } = useTranslation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-10, 10]);
  const rejectOpacity = useTransform(x, [-140, -30, 0], [1, 0, 0]);
  const inspireOpacity = useTransform(x, [0, 30, 140], [0, 0, 1]);

  const photo = listing?.photos?.[0];

  if (compact) {
    return (
      <div className="max-w-sm mx-auto px-4 mb-6" data-testid="game-card-compact">
        <div
          className="relative w-full h-40 sm:h-48 overflow-hidden border border-border"
          style={{ borderRadius: 2 }}
        >
          {photo ? (
            <img
              src={cloudinaryFit(photo, 700, 500)}
              alt={listing.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">—</div>
          )}
        </div>
        <p className="font-medium mt-2 text-sm truncate">{listing?.title}</p>
      </div>
    );
  }

  const handleDragEnd = (_event, info) => {
    const pastDistance = Math.abs(info.offset.x) > SWIPE_DISTANCE_THRESHOLD;
    const pastVelocity = Math.abs(info.velocity.x) > SWIPE_VELOCITY_THRESHOLD;
    if (!pastDistance && !pastVelocity) return;
    onSwipe(info.offset.x < 0 ? 'left' : 'right');
  };

  return (
    <div className="max-w-sm mx-auto px-10 relative">
      <motion.div
        className="relative w-full aspect-[3/4] bg-surface border border-border overflow-hidden select-none cursor-grab active:cursor-grabbing"
        style={{ x, rotate, borderRadius: 2 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        data-testid="game-swipe-card"
      >
        {photo ? (
          <img
            src={cloudinaryFit(photo, 900, 1200)}
            alt={listing?.title}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">—</div>
        )}
        <motion.div
          style={{ opacity: rejectOpacity }}
          className="absolute top-6 left-6 border-2 border-destructive px-3 py-1 -rotate-12 pointer-events-none"
        >
          <span className="overline !text-destructive">{t('game.swipe.reject_stamp')}</span>
        </motion.div>
        <motion.div
          style={{ opacity: inspireOpacity }}
          className="absolute top-6 right-6 border-2 border-secondary px-3 py-1 rotate-12 pointer-events-none"
        >
          <span className="overline !text-secondary">{t('game.swipe.inspire_stamp')}</span>
        </motion.div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent p-4 pointer-events-none">
          <p className="text-white font-medium">{listing?.title}</p>
        </div>
      </motion.div>

      <button
        type="button"
        onClick={() => onSwipe('left')}
        disabled={disabled}
        aria-label={t('game.swipe.reject_label')}
        data-testid="game-swipe-left-btn"
        className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center gap-0.5 pl-1 pr-2 py-2 rounded-full bg-background border-2 border-destructive text-destructive shadow-md disabled:opacity-50"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        <Trash2 className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={() => onSwipe('right')}
        disabled={disabled}
        aria-label={t('game.swipe.inspire_label')}
        data-testid="game-swipe-right-btn"
        className="absolute top-1/2 -translate-y-1/2 right-0 flex items-center gap-0.5 pl-2 pr-1 py-2 rounded-full bg-background border-2 border-secondary text-secondary shadow-md disabled:opacity-50"
      >
        <Lightbulb className="w-5 h-5" />
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
