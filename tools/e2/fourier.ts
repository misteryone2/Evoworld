/**
 * E2 — FFT locale, additiva e deterministica.
 *
 * Usata solo dalle procedure statistiche E2 (surrogati temporali e
 * cross-correlazione veloce). Nessuna dipendenza esterna e nessun effetto sul
 * motore, su E1 o sui formati di salvataggio.
 */

export interface Complex {
  re: number;
  im: number;
}

/** Restituisce la prima potenza di due >= `value`. */
export function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

const asComplex = (value: number | Complex): Complex =>
  typeof value === "number" ? { re: value, im: 0 } : { re: value.re, im: value.im };

/** FFT radix-2 in place su una copia; `inverse=true` applica il segno opposto e la normalizzazione. */
export function transform(values: Array<number | Complex>, inverse = false): Complex[] {
  const size = nextPowerOfTwo(values.length);
  const re = new Array<number>(size).fill(0);
  const im = new Array<number>(size).fill(0);
  for (let i = 0; i < values.length; i++) {
    const value = asComplex(values[i]);
    re[i] = value.re;
    im[i] = value.im;
  }

  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  const sign = inverse ? 2 : -2;
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (sign * Math.PI) / length;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    for (let offset = 0; offset < size; offset += length) {
      let factorRe = 1;
      let factorIm = 0;
      for (let k = 0; k < length / 2; k++) {
        const even = offset + k;
        const odd = even + length / 2;
        const oddRe = re[odd] * factorRe - im[odd] * factorIm;
        const oddIm = re[odd] * factorIm + im[odd] * factorRe;
        re[odd] = re[even] - oddRe;
        im[odd] = im[even] - oddIm;
        re[even] += oddRe;
        im[even] += oddIm;
        const nextRe = factorRe * stepRe - factorIm * stepIm;
        factorIm = factorRe * stepIm + factorIm * stepRe;
        factorRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < size; i++) {
      re[i] /= size;
      im[i] /= size;
    }
  }
  return re.map((real, index) => ({ re: real, im: im[index] }));
}

/** FFT diretta. */
export function fft(values: Array<number | Complex>): Complex[] {
  return transform(values, false);
}

/** Anti-trasformazione; restituisce la parte reale (l'immaginaria è rumore numerico). */
export function ifftReal(spectrum: Complex[]): number[] {
  return transform(spectrum, true).map((value) => value.re);
}

/** Spettro di ampiezza, usato come target dai surrogati IAAFT. */
export function amplitudeSpectrum(values: number[]): number[] {
  return fft(values).map((value) => Math.hypot(value.re, value.im));
}
