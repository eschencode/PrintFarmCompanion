import p1sImage from '$lib/assets/p1s.png';
import h2sImage from '$lib/assets/H2S.png';

/** Returns the image asset URL for a printer model string. Defaults to P1S. */
export function getPrinterImage(model: any): string {
  if (model) {
    const modelLower = model.toLowerCase();
    if (modelLower.includes('h2s')) return h2sImage;
    if (modelLower.includes('p1s')) return p1sImage;
  }
  return p1sImage;
}
