import { useState, useRef, useEffect, useCallback, useId } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DropdownMenuItemDef {
  type?: 'item';
  id: string;
  label: string;
  /** Optional icon rendered to the left of the label */
  icon?: React.ReactNode;
  /** Optional secondary description line beneath the label */
  description?: string;
  disabled?: boolean;
  /** Renders the item with danger (red) styling — use for destructive actions */
  danger?: boolean;
  onClick?: () => void;
}

export interface DropdownMenuDividerDef {
  type: 'divider';
  /** Optional section header label rendered above the divider line */
  label?: string;
}

export type DropdownMenuEntry = DropdownMenuItemDef | DropdownMenuDividerDef;

export interface DropdownMenuProps {
  /** The element that opens/closes the menu when clicked */
  trigger: React.ReactNode;
  items: DropdownMenuEntry[];
  /** Horizontal alignment of the dropdown panel relative to the trigger */
  align?: 'left' | 'right';
  /** Additional class names applied to the root wrapper */
  className?: string;
  /** Optional accessible label for the trigger button wrapper */
  'aria-label'?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isItem(entry: DropdownMenuEntry): entry is DropdownMenuItemDef {
  return entry.type !== 'divider';
}

function getSelectableItems(items: DropdownMenuEntry[]): DropdownMenuItemDef[] {
  return items.filter((e): e is DropdownMenuItemDef => isItem(e) && !e.disabled);
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DropdownMenu — reusable, keyboard-navigable dropdown for the dashboard.
 *
 * Usage:
 * ```tsx
 * <DropdownMenu
 *   trigger={<button>Open</button>}
 *   items={[
 *     { id: 'edit', label: 'Edit', onClick: handleEdit },
 *     { type: 'divider', label: 'Danger zone' },
 *     { id: 'delete', label: 'Delete', danger: true, onClick: handleDelete },
 *   ]}
 * />
 * ```
 *
 * Keyboard behaviour:
 * - `↑` / `↓`   — move focus between items
 * - `Home`       — jump to first item
 * - `End`        — jump to last item
 * - `Enter`/`Space` — activate the focused item
 * - `Escape`     — close menu, return focus to trigger
 * - `Tab`        — close menu (natural focus flow)
 */
export function DropdownMenu({
  trigger,
  items,
  align = 'right',
  className = '',
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const menuId = useId();
  const triggerId = useId();

  const selectableItems = getSelectableItems(items);

  // ── Close helpers ──────────────────────────────────────────────────────────

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setActiveId(null);
    if (returnFocus) {
      // Return keyboard focus to the trigger so screen-reader users aren't lost
      const focusTarget =
        (triggerRef.current?.querySelector('button, [role="button"], [tabindex="0"]') as HTMLElement | null) ??
        (triggerRef.current as HTMLElement | null);
      focusTarget?.focus?.();
    }
  }, []);

  // ── Outside-click / Escape handler ────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = (e as TouchEvent).touches?.[0]?.target ?? (e as MouseEvent).target;
      if (rootRef.current && !rootRef.current.contains(target as Node)) {
        close(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
      if (e.key === 'Tab') {
        // Let focus leave naturally but close the menu
        close(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  // ── Focus first item when menu opens ──────────────────────────────────────

  useEffect(() => {
    if (open && selectableItems.length > 0) {
      const firstId = selectableItems[0].id;
      setActiveId(firstId);
      // Defer to next tick so the menu has rendered
      requestAnimationFrame(() => {
        itemRefs.current.get(firstId)?.focus();
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard navigation inside the menu ───────────────────────────────────

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const ids = selectableItems.map((i) => i.id);
    const currentIdx = activeId != null ? ids.indexOf(activeId) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIdx = currentIdx < ids.length - 1 ? currentIdx + 1 : 0;
        const nextId = ids[nextIdx];
        setActiveId(nextId);
        itemRefs.current.get(nextId)?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : ids.length - 1;
        const prevId = ids[prevIdx];
        setActiveId(prevId);
        itemRefs.current.get(prevId)?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        const firstId = ids[0];
        if (firstId) {
          setActiveId(firstId);
          itemRefs.current.get(firstId)?.focus();
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        const lastId = ids[ids.length - 1];
        if (lastId) {
          setActiveId(lastId);
          itemRefs.current.get(lastId)?.focus();
        }
        break;
      }
    }
  }

  // ── Trigger click ─────────────────────────────────────────────────────────

  function handleTriggerClick(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  }

  // ── Item activation ───────────────────────────────────────────────────────

  function handleItemActivate(item: DropdownMenuItemDef) {
    item.onClick?.();
    close(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const alignClass = align === 'left' ? 'left-0' : 'right-0';

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      {/* Trigger wrapper — intercepts click/keyboard to manage open state */}
      <div
        ref={triggerRef}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        id={triggerId}
        // Make the wrapper itself non-focusable; the inner trigger element keeps its own focus
        tabIndex={-1}
        className="outline-none"
      >
        {trigger}
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={handleMenuKeyDown}
          className={`absolute ${alignClass} top-full mt-1 z-50 min-w-[11rem] w-max max-w-xs rounded-lg border border-subtle bg-surface-1 shadow-xl py-1 focus:outline-none`}
          // The panel itself is not focusable — focus lives on individual items
          tabIndex={-1}
        >
          {items.map((entry, idx) => {
            if (!isItem(entry)) {
              // Divider (with optional section header)
              return (
                <div key={`divider-${idx}`} role="separator" aria-orientation="horizontal">
                  {entry.label ? (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-disabled select-none">
                      {entry.label}
                    </div>
                  ) : (
                    <div className="my-1 border-t border-subtle" />
                  )}
                </div>
              );
            }

            const isActive = activeId === entry.id;
            const colorClass = entry.danger
              ? 'text-priority-critical hover:bg-surface-2 hover:text-priority-critical'
              : 'text-tertiary hover:bg-surface-2 hover:text-primary';

            return (
              <button
                key={entry.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(entry.id, el);
                  else itemRefs.current.delete(entry.id);
                }}
                role="menuitem"
                disabled={entry.disabled}
                aria-disabled={entry.disabled}
                data-active={isActive}
                onClick={() => handleItemActivate(entry)}
                onMouseEnter={() => setActiveId(entry.id)}
                onFocus={() => setActiveId(entry.id)}
                className={[
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  'flex items-start gap-2',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-border',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
                  colorClass,
                ].join(' ')}
              >
                {entry.icon && (
                  <span className="mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center opacity-70">
                    {entry.icon}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{entry.label}</span>
                  {entry.description && (
                    <span className="block text-[10px] text-faint mt-0.5 truncate">
                      {entry.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
