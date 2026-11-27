import { useEffect, useId, useRef } from 'react';

/**
 * Integrates a floating overlay, modal, or drawer with the browser and mobile Back button.
 * - Pushes a history entry `{ __sanzarOverlay: id }` when `isOpen` becomes `true`.
 * - Listens to `popstate` so pressing Back closes the overlay instead of navigating away.
 * - Cleans up the pushed history entry with `window.history.back()` when closed via UI,
 *   only if the active history state is still this overlay's entry.
 */
export function useOverlayBackButton(
  isOpen: boolean,
  onClose: () => void,
  id?: string
): void {
  const autoId = useId();
  const overlayId = id ?? autoId;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const closedByPopstateRef = useRef(false);
  const backTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (backTimerRef.current !== null) {
      window.clearTimeout(backTimerRef.current);
      backTimerRef.current = null;
    }

    closedByPopstateRef.current = false;

    const currentOverlay = (window.history.state as { __sanzarOverlay?: string } | null)?.__sanzarOverlay;
    if (currentOverlay !== overlayId) {
      window.history.pushState({ __sanzarOverlay: overlayId }, '');
    }

    const onPopState = () => {
      const activeOverlay = (window.history.state as { __sanzarOverlay?: string } | null)?.__sanzarOverlay;
      if (activeOverlay !== overlayId) {
        closedByPopstateRef.current = true;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!closedByPopstateRef.current) {
        const stateOverlay = (window.history.state as { __sanzarOverlay?: string } | null)?.__sanzarOverlay;
        if (stateOverlay === overlayId) {
          backTimerRef.current = window.setTimeout(() => {
            backTimerRef.current = null;
            const latestOverlay = (window.history.state as { __sanzarOverlay?: string } | null)?.__sanzarOverlay;
            if (latestOverlay === overlayId) {
              window.history.back();
            }
          }, 0);
        }
      }
    };
  }, [isOpen, overlayId]);
}
