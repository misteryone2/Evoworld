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

/**
 * DFT esatta sulla lunghezza effettiva della serie.
 *
 * `fft()`/`transform()` restano radix-2 e vengono usati solo dalla
 * cross-correlazione, dove il padding è parte del metodo di convoluzione. Qui
 * invece la lunghezza N non può cambiare: le serie composite sono scomposte
 * con Cooley–Tukey a radix misto, mentre i primi sono trattati con l'algoritmo
 * di Rader. Nessun campione viene aggiunto, rimosso o troncato. I piani sono
 * memorizzati per evitare di ricalcolare fattorizzazioni e twiddle.
 */
const DIRECT_DFT_LIMIT = 32;

interface ForwardPlan {
  size: number;
  apply: (values: Array<number | Complex>) => Complex[];
}

const exactPlans = new Map<number, ForwardPlan>();

const multiplyComplex = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

const conjugate = (value: Complex): Complex => ({ re: value.re, im: -value.im });

const cis = (angle: number): Complex => ({ re: Math.cos(angle), im: Math.sin(angle) });

const isPowerOfTwo = (value: number): boolean => value >= 1 && nextPowerOfTwo(value) === value;

const smallestFactor = (value: number): number => {
  if (value < 2) return value;
  if (value % 2 === 0) return 2;
  for (let candidate = 3; candidate * candidate <= value; candidate += 2) {
    if (value % candidate === 0) return candidate;
  }
  return value;
};

const primitiveRoot = (prime: number): number => {
  for (let candidate = 2; candidate < prime; candidate++) {
    const seen = new Set<number>();
    let value = 1;
    for (let exponent = 0; exponent < prime - 1; exponent++) {
      value = (value * candidate) % prime;
      seen.add(value);
    }
    if (seen.size === prime - 1 && seen.has(1)) return candidate;
  }
  throw new Error(`No primitive root found for ${prime}`);
};

const directPlan = (size: number): ForwardPlan => {
  const real = new Float64Array(size * size);
  const imaginary = new Float64Array(size * size);
  for (let k = 0; k < size; k++) {
    for (let n = 0; n < size; n++) {
      const angle = (-2 * Math.PI * n * k) / size;
      real[k * size + n] = Math.cos(angle);
      imaginary[k * size + n] = Math.sin(angle);
    }
  }
  return {
    size,
    apply: (values) => {
      const result = new Array<Complex>(size);
      for (let k = 0; k < size; k++) {
        let re = 0;
        let im = 0;
        const offset = k * size;
        for (let n = 0; n < size; n++) {
          const value = asComplex(values[n]);
          const cosine = real[offset + n];
          const sine = imaginary[offset + n];
          re += value.re * cosine - value.im * sine;
          im += value.re * sine + value.im * cosine;
        }
        result[k] = { re, im };
      }
      return result;
    },
  };
};

const radixTwoPlan = (size: number): ForwardPlan => ({
  size,
  apply: (values) => transform(values, false),
});

/**
 * Rader: la DFT di un primo p diventa una convoluzione ciclica di lunghezza
 * p−1, che è sempre composta e quindi trattata senza padding.
 */
const raderPlan = (prime: number): ForwardPlan => {
  const length = prime - 1;
  const convolutionPlan = getPlan(length);
  const generator = primitiveRoot(prime);
  const powers = new Int32Array(length);
  const reverseExponent = new Int32Array(prime);
  let power = 1;
  for (let index = 0; index < length; index++) {
    powers[index] = power;
    reverseExponent[power] = (length - index) % length;
    power = (power * generator) % prime;
  }

  const kernel = new Array<Complex>(length);
  for (let index = 0; index < length; index++) {
    kernel[index] = cis((-2 * Math.PI * powers[index]) / prime);
  }
  const kernelSpectrum = convolutionPlan.apply(kernel);

  return {
    size: prime,
    apply: (values) => {
      const sequence = new Array<Complex>(length);
      for (let index = 0; index < length; index++) {
        sequence[reverseExponent[powers[index]]] = asComplex(values[powers[index]]);
      }
      const sequenceSpectrum = convolutionPlan.apply(sequence);
      const product = sequenceSpectrum.map((value, index) => multiplyComplex(value, kernelSpectrum[index]));
      const conjugated = convolutionPlan.apply(product.map(conjugate));
      const convolution = conjugated.map((value) => {
        const result = conjugate(value);
        return { re: result.re / length, im: result.im / length };
      });

      const head = asComplex(values[0]);
      let totalRe = head.re;
      let totalIm = head.im;
      for (let index = 1; index < prime; index++) {
        const value = asComplex(values[index]);
        totalRe += value.re;
        totalIm += value.im;
      }
      const result = new Array<Complex>(prime);
      result[0] = { re: totalRe, im: totalIm };
      for (let index = 0; index < length; index++) {
        result[powers[index]] = {
          re: head.re + convolution[index].re,
          im: head.im + convolution[index].im,
        };
      }
      return result;
    },
  };
};

const cooleyTukeyPlan = (size: number): ForwardPlan => {
  const factor = smallestFactor(size);
  const other = size / factor;
  const columnPlan = getPlan(other);
  const innerPlan = getPlan(factor);
  const twiddle: Complex[][] = Array.from({ length: factor }, (_, outer) =>
    Array.from({ length: other }, (_, k1) => cis((-2 * Math.PI * outer * k1) / size)));

  return {
    size,
    apply: (values) => {
      const columns: Complex[][] = [];
      for (let outer = 0; outer < factor; outer++) {
        const column = new Array<Complex>(other);
        for (let inner = 0; inner < other; inner++) {
          column[inner] = asComplex(values[outer + factor * inner]);
        }
        columns.push(columnPlan.apply(column));
      }
      const result = new Array<Complex>(size);
      for (let k1 = 0; k1 < other; k1++) {
        const inner = new Array<Complex>(factor);
        for (let outer = 0; outer < factor; outer++) {
          inner[outer] = multiplyComplex(columns[outer][k1], twiddle[outer][k1]);
        }
        const transformed = innerPlan.apply(inner);
        for (let k2 = 0; k2 < factor; k2++) result[k1 + other * k2] = transformed[k2];
      }
      return result;
    },
  };
};

function getPlan(size: number): ForwardPlan {
  if (size < 2) return {
    size,
    apply: (values) => [asComplex(values[0] ?? 0)],
  };
  const existing = exactPlans.get(size);
  if (existing) return existing;
  let plan: ForwardPlan;
  if (size <= DIRECT_DFT_LIMIT) plan = directPlan(size);
  else if (isPowerOfTwo(size)) plan = radixTwoPlan(size);
  else if (smallestFactor(size) === size) plan = raderPlan(size);
  else plan = cooleyTukeyPlan(size);
  exactPlans.set(size, plan);
  return plan;
}

/** Anti-trasformazione esatta sulla lunghezza effettiva dello spettro. */
export function exactTransform(values: Array<number | Complex>, inverse = false): Complex[] {
  const size = values.length;
  if (size === 0) return [];
  if (!inverse) return getPlan(size).apply(values);
  const forward = getPlan(size).apply(values.map((value) => conjugate(asComplex(value))));
  return forward.map((value) => {
    const conjugated = conjugate(value);
    return { re: conjugated.re / size, im: conjugated.im / size };
  });
}

/** Solo parte reale: la parte immaginaria dell'inversa è errore numerico. */
export function exactIfftReal(spectrum: Complex[]): number[] {
  return exactTransform(spectrum, true).map((value) => value.re);
}

/** Spettro di ampiezza alla lunghezza esatta, target dei surrogati IAAFT. */
export function exactAmplitudeSpectrum(values: number[]): number[] {
  return getPlan(values.length).apply(values).map((value) => Math.hypot(value.re, value.im));
}
