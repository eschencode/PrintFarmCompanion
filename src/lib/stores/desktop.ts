import { readable } from 'svelte/store';
import { browser } from '$app/environment';

declare global {
	interface Window {
		__IS_DESKTOP__?: boolean;
		__PFC_DESKTOP_VERSION__?: string;
		__FILE_HANDLER_TOKEN__?: string;
	}
}

export const isDesktop = readable<boolean>(false, (set) => {
	if (browser && window.__IS_DESKTOP__ === true) set(true);
});

export const desktopVersion = readable<string | null>(null, (set) => {
	if (browser && window.__PFC_DESKTOP_VERSION__) set(window.__PFC_DESKTOP_VERSION__);
});
