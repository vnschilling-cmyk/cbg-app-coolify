import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const noProxy = '127.0.0.1,localhost,10.49.213.105';
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

export default defineConfig({ plugins: [tailwindcss(), sveltekit()] });
// Final Reload Trigger
