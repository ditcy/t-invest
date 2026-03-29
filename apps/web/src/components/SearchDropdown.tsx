import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type SearchDropdownOption = {
  id: string;
  label: string;
  description?: string | undefined;
  keywords?: string[] | undefined;
};

type SearchDropdownProps = {
  value: SearchDropdownOption | null;
  onSelect: (option: SearchDropdownOption) => void;
  loadOptions: (query: string) => Promise<SearchDropdownOption[]>;
  onQueryChange?: ((query: string) => void) | undefined;
  onSearchError?: ((message: string | null) => void) | undefined;
  placeholder?: string | undefined;
  storageKey?: string | undefined;
  recentLimit?: number | undefined;
  disabled?: boolean | undefined;
  minQueryLength?: number | undefined;
  noResultsText?: string | undefined;
};

const DEFAULT_RECENT_LIMIT = 5;
const DEFAULT_MIN_QUERY = 2;

const readRecent = (storageKey: string, recentLimit: number) => {
  if (typeof window === "undefined") {
    return [] as SearchDropdownOption[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is SearchDropdownOption => {
        return Boolean(
          item &&
            typeof item === "object" &&
            typeof (item as SearchDropdownOption).id === "string" &&
            typeof (item as SearchDropdownOption).label === "string"
        );
      })
      .slice(0, recentLimit);
  } catch {
    return [];
  }
};

const writeRecent = (storageKey: string, recentLimit: number, option: SearchDropdownOption) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = readRecent(storageKey, recentLimit);
    const next = [option, ...current.filter((item) => item.id !== option.id)].slice(0, recentLimit);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Ignore localStorage failures; search should remain usable.
  }
};

export function SearchDropdown({
  value,
  onSelect,
  loadOptions,
  onQueryChange,
  onSearchError,
  placeholder = "Search...",
  storageKey,
  recentLimit = DEFAULT_RECENT_LIMIT,
  disabled = false,
  minQueryLength = DEFAULT_MIN_QUERY,
  noResultsText = "No results"
}: SearchDropdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadOptionsRef = useRef(loadOptions);
  const [inputValue, setInputValue] = useState(value?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [showRecentOnOpen, setShowRecentOnOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchDropdownOption[]>([]);
  const [recent, setRecent] = useState<SearchDropdownOption[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const requestIdRef = useRef(0);

  useEffect(() => {
    loadOptionsRef.current = loadOptions;
  }, [loadOptions]);

  useEffect(() => {
    setInputValue(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    setRecent(readRecent(storageKey, recentLimit));
  }, [recentLimit, storageKey]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const query = inputValue.trim();
    if (showRecentOnOpen) {
      setResults([]);
      setIsLoading(false);
      setHighlightedIndex(0);
      return;
    }

    if (query.length < minQueryLength) {
      setResults([]);
      setIsLoading(false);
      setHighlightedIndex(0);
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    setIsLoading(true);

    const timeoutId = window.setTimeout(() => {
      void loadOptionsRef.current(query)
        .then((options) => {
          if (requestIdRef.current !== currentRequestId) {
            return;
          }

          onSearchError?.(null);
          setResults(options);
          setHighlightedIndex(0);
        })
        .catch((error: unknown) => {
          if (requestIdRef.current !== currentRequestId) {
            return;
          }

          onSearchError?.(error instanceof Error ? error.message : "Instrument search failed");
          setResults([]);
        })
        .finally(() => {
          if (requestIdRef.current === currentRequestId) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [inputValue, isOpen, minQueryLength, onSearchError, showRecentOnOpen]);

  const visibleOptions = useMemo(() => {
    const query = inputValue.trim();
    if (showRecentOnOpen || query.length < minQueryLength) {
      return recent;
    }

    return results;
  }, [inputValue, minQueryLength, recent, results, showRecentOnOpen]);

  const statusText = useMemo(() => {
    const query = inputValue.trim();
    if (showRecentOnOpen || query.length < minQueryLength) {
      return recent.length > 0 ? "Recent" : `Type at least ${minQueryLength} characters`;
    }

    if (isLoading) {
      return "Searching...";
    }

    return "Suggestions";
  }, [inputValue, isLoading, minQueryLength, recent.length, showRecentOnOpen]);

  const commitSelection = (option: SearchDropdownOption) => {
    onSelect(option);
    setInputValue(option.label);
    setIsOpen(false);
    setShowRecentOnOpen(true);
    setResults([]);
    setHighlightedIndex(0);

    if (storageKey) {
      writeRecent(storageKey, recentLimit, option);
      setRecent(readRecent(storageKey, recentLimit));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === "ArrowDown") {
        setIsOpen(true);
        setShowRecentOnOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(visibleOptions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter" && visibleOptions[highlightedIndex]) {
      event.preventDefault();
      commitSelection(visibleOptions[highlightedIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setShowRecentOnOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={`app-field border pr-10 transition-colors ${
          isOpen
            ? "rounded-t rounded-b-none border-cyan-400/70 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
            : "rounded border-neutral-700"
        }`}
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setIsOpen(true);
          setShowRecentOnOpen(true);
        }}
        onChange={(event) => {
          setInputValue(event.target.value);
          onQueryChange?.(event.target.value);
          setShowRecentOnOpen(false);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
        {isOpen ? "▲" : "▼"}
      </span>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-30 rounded-b-xl border border-t-0 border-cyan-400/70 bg-[#0d1118] shadow-[0_22px_60px_rgba(0,0,0,0.55),0_0_0_1px_rgba(34,211,238,0.08)]">
          <div className="border-b border-neutral-700 px-[var(--ui-compact-pad-x)] py-[var(--ui-compact-pad-y)] text-[11px] uppercase tracking-wide text-neutral-400">
            {statusText}
          </div>

          <div className="max-h-72 overflow-auto py-1">
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  className={`block w-full px-[var(--ui-compact-pad-x)] py-[var(--ui-compact-pad-y)] text-left transition-colors ${
                    index === highlightedIndex
                      ? "bg-cyan-400/14"
                      : "hover:bg-white/[0.04]"
                  }`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitSelection(option)}
                >
                  <div className="text-sm text-neutral-100">{option.label}</div>
                  {option.description ? (
                    <div className="mt-1 text-xs text-neutral-400">{option.description}</div>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-[var(--ui-compact-pad-x)] py-[var(--ui-card-pad)] text-sm text-neutral-400">
                {isLoading ? "Searching..." : noResultsText}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
