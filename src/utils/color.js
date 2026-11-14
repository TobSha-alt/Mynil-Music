const colorCache = new Map();

export async function extractDominantColor(imageUrl) {
  if (!imageUrl) return '16, 185, 129';
  if (colorCache.has(imageUrl)) return colorCache.get(imageUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = 24;
        canvas.height = 24;
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;

        let bestScore = -1;
        let bestR = 16;
        let bestG = 185;
        let bestB = 129;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
          // Prefer vibrant mid-bright colors
          if (lum < 35 || lum > 230) continue;
          const score = sat * 2.2 + (1 - Math.abs(lum - 135) / 135);
          if (score > bestScore) {
            bestScore = score;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }

        const rgb = `${bestR}, ${bestG}, ${bestB}`;
        colorCache.set(imageUrl, rgb);
        resolve(rgb);
      } catch {
        resolve('16, 185, 129');
      }
    };
    img.onerror = () => resolve('16, 185, 129');
    img.src = imageUrl;
  });
}
