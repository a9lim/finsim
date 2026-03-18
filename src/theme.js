// Light/dark theme: persists to localStorage, respects prefers-color-scheme.

export function initTheme() {
    const saved = localStorage.getItem('shoals-theme');
    document.documentElement.dataset.theme = saved || 'light';

    // Follow system preference when user hasn't made an explicit choice.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('shoals-theme')) {
            document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
        }
    });
}

export function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('shoals-theme', next);
}
