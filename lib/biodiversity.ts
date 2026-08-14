/**
 * Shannon diversity index (v0.9): a standard ecological measure of how
 * evenly a population is distributed across species, not just how many
 * species exist. Two planets with the same species count can have very
 * different diversity: one dominated by a single species with a few
 * stragglers scores much lower than one where every species has a roughly
 * comparable population.
 *
 * H = -sum(p_i * ln(p_i)) over species i, where p_i is species i's share
 * of the total population. H = 0 when only one species exists (or the
 * population is empty); H approaches ln(N) as N species become evenly
 * represented.
 */
export function shannonDiversityIndex(populations: number[]): number {
  const total = populations.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return 0;

  let h = 0;
  for (const p of populations) {
    if (p <= 0) continue;
    const share = p / total;
    h -= share * Math.log(share);
  }
  return h;
}
