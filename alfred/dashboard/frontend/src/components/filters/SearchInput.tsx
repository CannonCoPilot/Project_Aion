import { useState, useEffect, useRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search by title, ID, or label...' }: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  };

  return (
    <input
      type="text"
      value={local}
      onChange={e => handleChange(e.target.value)}
      placeholder={placeholder}
      data-search-input
      className="w-full max-w-xs rounded bg-surface-1 border border-subtle px-3 py-1.5 text-sm text-primary placeholder-faint focus:border-accent-border focus:outline-none"
    />
  );
}
