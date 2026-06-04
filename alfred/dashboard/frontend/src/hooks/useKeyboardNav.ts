import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../api/tasks';

interface UseKeyboardNavOptions {
  tasks: Task[];
  onClaim?: (taskId: string) => void;
  onClose?: (taskId: string) => void;
}

export function useKeyboardNav({ tasks, onClaim, onClose }: UseKeyboardNavOptions) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();

  const focusedTask = focusIndex >= 0 && focusIndex < tasks.length ? tasks[focusIndex] : null;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // / to focus search (always works)
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        searchInput?.focus();
        return;
      }

      // ? for help
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setHelpOpen(prev => !prev);
        return;
      }

      // Escape clears focus or closes help
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (isInput) { (target as HTMLInputElement).blur(); return; }
        setFocusIndex(-1);
        return;
      }

      if (isInput) return;

      // j/k navigation
      if (e.key === 'j') {
        e.preventDefault();
        setFocusIndex(prev => Math.min(prev + 1, tasks.length - 1));
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setFocusIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      // Enter to open focused task
      if (e.key === 'Enter' && focusedTask) {
        e.preventDefault();
        navigate(`/tasks/${focusedTask.id}`);
        return;
      }

      // c to claim
      if (e.key === 'c' && focusedTask && focusedTask.status === 'open') {
        e.preventDefault();
        onClaim?.(focusedTask.id);
        return;
      }

      // x to close
      if (e.key === 'x' && focusedTask && focusedTask.status !== 'closed') {
        e.preventDefault();
        onClose?.(focusedTask.id);
        return;
      }
    },
    [tasks, focusIndex, focusedTask, navigate, onClaim, onClose, helpOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset focus when tasks change
  useEffect(() => {
    setFocusIndex(-1);
  }, [tasks.length]);

  return { focusIndex, focusedTask, helpOpen, setHelpOpen };
}
