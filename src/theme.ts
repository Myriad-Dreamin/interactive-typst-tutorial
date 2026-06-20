export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "interactive-typst-tutorial-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function isResolvedTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

function readStoredTheme(): ResolvedTheme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isResolvedTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: ResolvedTheme, source: "system" | "user") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeSource = source;
  document.documentElement.style.colorScheme = theme;
}

export function getCurrentTheme(): ResolvedTheme {
  const currentTheme = document.documentElement.dataset.theme;
  return isResolvedTheme(currentTheme) ? currentTheme : getSystemTheme();
}

export function initTheme(onChange: () => void) {
  const mediaQuery = window.matchMedia(DARK_QUERY);
  const storedTheme = readStoredTheme();

  applyTheme(storedTheme ?? getSystemTheme(), storedTheme ? "user" : "system");

  mediaQuery.addEventListener("change", () => {
    if (readStoredTheme()) {
      return;
    }

    applyTheme(getSystemTheme(), "system");
    onChange();
  });
}

export function toggleTheme(): ResolvedTheme {
  const nextTheme: ResolvedTheme = getCurrentTheme() === "dark" ? "light" : "dark";

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Theme persistence is optional; the applied theme still changes for this session.
  }

  applyTheme(nextTheme, "user");
  return nextTheme;
}
