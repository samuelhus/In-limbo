import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Toegankelijkheids-basis voor de custom fixed-overlay modals in de app
 * (Lightbox, ApplyModal, ReportListingModal) — geen van alle gebouwd op
 * Radix' eigen ui/dialog.jsx, dat dit gratis zou regelen. Vult aan wat een
 * <dialog>/Radix Dialog anders al zou doen: focus bij het openen naar de
 * modal verplaatsen, Tab binnen de modal houden (focus trap, anders loopt
 * Tab gewoon door naar de onderliggende pagina), Escape sluit de modal, en
 * focus teruggeven aan het element dat de modal opende zodra hij weer
 * dichtgaat.
 *
 * Gebruik: const panelRef = useModalA11y(onClose); <div ref={panelRef} role="dialog" aria-modal="true">
 */
export function useModalA11y(onClose) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const container = containerRef.current;
    const focusables = () => Array.from(container?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
    const alreadyFocusedInside = container && document.activeElement && container.contains(document.activeElement);
    if (!alreadyFocusedInside) {
      (focusables()[0] || container)?.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused.current?.focus) previouslyFocused.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
}
