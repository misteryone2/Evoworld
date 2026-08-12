"use client";

import { useMemo } from "react";
import type { SpeciesRecord } from "../../types";
import { buildSpeciesTree, type SpeciesTreeNode } from "../../lib/speciesTree";
import { speciesColor } from "../../lib/speciesColor";

interface Props {
  speciesTree: SpeciesRecord[];
  selectedId: number | null;
  onSelect: (speciesId: number) => void;
}

/**
 * Renders the append-only species registry (SpeciesRecord[], already sent
 * in every RenderFrame — see world.getSpeciesTree()) as a genealogy tree.
 * No new simulation data is needed: this is purely a visualization of data
 * the engine already produces (v0.4 roadmap note).
 */
export function SpeciesTree({ speciesTree, selectedId, onSelect }: Props) {
  const roots = useMemo(() => buildSpeciesTree(speciesTree), [speciesTree]);

  if (roots.length === 0) {
    return <div className="species-tree-empty">Nessuna specie ancora registrata.</div>;
  }

  return (
    <ul className="species-tree" role="tree" aria-label="Albero genealogico delle specie">
      {roots.map((node) => (
        <SpeciesTreeItem key={node.record.speciesId} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function SpeciesTreeItem({ node, selectedId, onSelect }: { node: SpeciesTreeNode; selectedId: number | null; onSelect: (id: number) => void }) {
  const { record } = node;
  const isSelected = record.speciesId === selectedId;

  return (
    <li role="treeitem" aria-selected={isSelected}>
      <button
        type="button"
        className={`species-node${isSelected ? " selected" : ""}`}
        onClick={() => onSelect(record.speciesId)}
      >
        <span className="species-swatch" style={{ background: speciesColor(record.speciesId) }} aria-hidden="true" />
        <span className="species-id">#{record.speciesId}</span>
        <span className={`species-status ${record.alive ? "alive" : "extinct"}`}>{record.alive ? "viva" : "estinta"}</span>
        <span className="species-pop">{record.population.toLocaleString("it-IT")} ind.</span>
        {node.descendantCount > 0 && <span className="species-descendants">{node.descendantCount} discendenti</span>}
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <SpeciesTreeItem key={child.record.speciesId} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
