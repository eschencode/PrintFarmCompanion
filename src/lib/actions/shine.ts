import type { Action } from 'svelte/action';

/**
 * Svelte action that tracks mouse position and exposes it as CSS custom properties
 * (`--shine-x`, `--shine-y`, `--shine-opacity`) for a radial gradient hover effect.
 * The consuming element's CSS must define the actual gradient using these variables.
 */
export const shine: Action<HTMLElement> = (node) => {
  function onMove(e: MouseEvent) {
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--shine-x', `${e.clientX - rect.left}px`);
    node.style.setProperty('--shine-y', `${e.clientY - rect.top}px`);
    node.style.setProperty('--shine-opacity', '1');
  }
  function onLeave() {
    node.style.setProperty('--shine-opacity', '0');
  }
  node.addEventListener('mousemove', onMove);
  node.addEventListener('mouseleave', onLeave);
  return {
    destroy() {
      node.removeEventListener('mousemove', onMove);
      node.removeEventListener('mouseleave', onLeave);
    }
  };
};
