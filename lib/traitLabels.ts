import type { TraitName } from "../types";

/** Italian display labels for every heritable trait, kept in one place so new traits only need to be added here once. */
export const TRAIT_LABELS: Record<TraitName, string> = {
  size: "Dimensione",
  speed: "Velocità",
  metabolism: "Metabolismo",
  vision: "Vista",
  fertility: "Fertilità",
  lifespan: "Longevità",
  carnivory: "Carnivoria",
  preferredTemperature: "Temperatura preferita",
  temperatureTolerance: "Tolleranza termica",
  preferredWater: "Umidità preferita",
  waterTolerance: "Tolleranza idrica",
  evasion: "Elusione",
  huntingSkill: "Acume predatorio",
};
