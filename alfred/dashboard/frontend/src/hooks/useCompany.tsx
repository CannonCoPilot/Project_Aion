import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

interface CompanyContextValue {
  company: string;
  setCompany: (slug: string) => void;
  isFiltered: boolean;
}

const CompanyContext = createContext<CompanyContextValue>({
  company: 'all',
  setCompany: () => {},
  isFiltered: false,
});

const STORAGE_KEY = 'selectedCompany';

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();

  // Initialize: URL param > localStorage > "all"
  const [company, setCompanyState] = useState(() => {
    const fromUrl = params.get('company');
    if (fromUrl) return fromUrl;
    try {
      return localStorage.getItem(STORAGE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });

  // Sync URL param on mount if localStorage had a value but URL didn't
  useEffect(() => {
    if (company !== 'all' && !params.get('company')) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('company', company);
          return next;
        },
        { replace: true },
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setCompany = useCallback(
    (slug: string) => {
      setCompanyState(slug);
      try {
        if (slug === 'all') {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, slug);
        }
      } catch {
        // localStorage unavailable
      }
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (slug === 'all') {
            next.delete('company');
          } else {
            next.set('company', slug);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Sync state from URL param changes (browser back/forward)
  const urlCompany = params.get('company');
  if (urlCompany && urlCompany !== company) {
    setCompanyState(urlCompany);
    try {
      localStorage.setItem(STORAGE_KEY, urlCompany);
    } catch {
      // ignore
    }
  }

  return (
    <CompanyContext.Provider value={{ company, setCompany, isFiltered: company !== 'all' }}>
      {children}
    </CompanyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompany() {
  return useContext(CompanyContext);
}
