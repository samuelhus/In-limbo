import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cloudinaryFit } from '@/lib/cloudinary';

const SWIPE_THRESHOLD = 120;

/**
 * PRD_Schat_of_Schroot.md §4.1: klik-en-sleep de kaart (framer-motion, al
 * aanwezig als dependency) of klik op een van de pijlen (zie SwipeArrows).
 * Bij `compact` (na swipe rechts): "foto verkleint tot net genoeg ruimte" —
 * geen volledige minimalisatie, dus een kleinere statische variant i.p.v.
 * een thumbnail, hieronder gerenderd voor de evaluatie-/keuzestappen.
 */
export default function SwipeCard({ listing, onSwipe, compact = false }) {
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
    if (info.offset.x < -SWIPE_THRESHOLD) onSwipe('left');
    else if (info.offset.x > SWIPE_THRESHOLD) onSwipe('right');
  };

  return (
    <div className="max-w-sm mx-auto px-4">
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
    </div>
  );
}
