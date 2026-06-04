import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'aifred.activeMode';

export const ACTIVE_MODES = ['prod', 'ops'] as const;
export type ActiveMode = (typeof ACTIVE_MODES)[number];

function readStored(): ActiveMode {
  if (typeof window === 'undefined') return 'prod';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return (ACTIVE_MODES as readonly string[]).includes(v ?? '') ? (v as ActiveMode) : 'prod';
  } catch {
    return 'prod';
  }
}

export function useActiveMode() {
  const [active, setActiveState] = useState<ActiveMode>(readStored);

  const setActive = useCallback((mode: ActiveMode) => {
    setActiveState(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* localStorage may throw in private-mode or when quota exceeded; safe to ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setActive(active === 'prod' ? 'ops' : 'prod');
  }, [active, setActive]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle]);

  return { active, setActive, toggle };
}
