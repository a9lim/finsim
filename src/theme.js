// Light/dark theme: persists to localStorage, respects prefers-color-scheme.

export function initTheme() {
    _toolbar.initTheme('shoals-theme');
}

export function toggleTheme() {
    _toolbar.toggleTheme('shoals-theme');
}
