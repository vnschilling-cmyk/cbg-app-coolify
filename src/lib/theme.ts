import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

function createThemeStore() {
    const defaultTheme: Theme = 'system';
    const initialTheme = browser ? (localStorage.getItem('theme') as Theme) || defaultTheme : defaultTheme;

    const { subscribe, set, update } = writable<Theme>(initialTheme);

    function applyTheme(theme: Theme) {
        if (!browser) return;

        const root = window.document.documentElement;
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) {
            root.classList.add('dark');
            root.style.backgroundColor = '#020617';
        } else {
            root.classList.remove('dark');
            root.style.backgroundColor = '#ffffff';
        }

        localStorage.setItem('theme', theme);
    }

    // Initialize theme
    if (browser) {
        applyTheme(initialTheme);

        // Listen for system theme changes if set to system
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            subscribe(currentTheme => {
                if (currentTheme === 'system') {
                    if (e.matches) {
                        window.document.documentElement.classList.add('dark');
                        window.document.documentElement.style.backgroundColor = '#020617';
                    } else {
                        window.document.documentElement.classList.remove('dark');
                        window.document.documentElement.style.backgroundColor = '#ffffff';
                    }
                }
            })();
        });
    }

    return {
        subscribe,
        set: (value: Theme) => {
            applyTheme(value);
            set(value);
        },
        update
    };
}

export const theme = createThemeStore();
