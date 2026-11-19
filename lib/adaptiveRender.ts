import { LOD_HIGH_NONE } from "./animationLod";

/**
 * G3.1 — aggiornamenti adattivi della rappresentazione grafica.
 *
 * Il percorso predefinito resta identico a G3: ogni creatura viene riscritta
 * a ogni frame. Queste impostazioni sono OPT-IN (`refs.adaptive`) e possono
 * solo ridurre il lavoro del renderer: nessun valore della simulazione viene
 * letto per decidere o scritto per adattarsi.
 *
 * Le creature vicine vengono aggiornate ogni frame. Quelle lontane vengono
 * aggiornate a rotazione, una frazione per frame: gli slot delle istanze non
 * vengono ridefinite, quindi i dati dell'ultimo aggiornamento restano visibili
 * fino al successivo. Non esiste una coda di aggiornamenti arretrati.
 */

export interface AdaptiveRenderSettings {
  enabled: boolean;
  /** Distanza in scale della creatura oltre la quale si applica lo stride. */
  nearDistanceScales?: number;
  /** Una creatura lontana viene aggiornata ogni N frame (1 = ogni frame). */
  farStride?: number;
  /** Esclude dal disegno le creature dietro la camera (richiede `refs.camera`). */
  cullBehindCamera?: boolean;
  /** Margine in unità mondo oltre il piano della camera: evita popping sul bordo. */
  cullMarginUnits?: number;
}

export interface AdaptiveRenderState {
  /** Contatore di frame di rendering: avanza anche quando non ci sono dati nuovi. */
  frame: number;
  /** Ultimo dettaglio/capacità visti: un cambio richiede un refresh completo. */
  detail: number;
  capacity: number;
  /** Firma di fov/aspect: cambio di viewport o zoom => ricalssificazione LOD. */
  viewKey: number;
}

export interface AdaptiveRenderCounters {
  adaptive: boolean;
  /** Creature con scrittura completa in questo frame. */
  updated: number;
  /** Creature lontane che conservano i dati dell'ultimo aggiornamento. */
  skipped: number;
  /** Creature fuori visuale con istanze azzerate. */
  culled: number;
  lodNear: number;
  lodFar: number;
}

export const DEFAULT_NEAR_DISTANCE_SCALES = LOD_HIGH_NONE;
export const DEFAULT_FAR_STRIDE = 4;
export const DEFAULT_CULL_MARGIN_UNITS = 4;

export function createAdaptiveState(): AdaptiveRenderState {
  return { frame: 0, detail: -1, capacity: -1, viewKey: -1 };
}

export function farUpdateDue(frame: number, slot: number, stride: number): boolean {
  return frame % stride === slot % stride;
}
