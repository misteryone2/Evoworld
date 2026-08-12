import type { SpeciesRecord } from "../types";

/** A SpeciesRecord plus its direct children, forming a navigable tree. */
export interface SpeciesTreeNode {
  record: SpeciesRecord;
  children: SpeciesTreeNode[];
  /** Total number of descendants (children, grandchildren, ...), for a quick "how much did this lineage radiate" signal. */
  descendantCount: number;
}

/**
 * Turns the flat, append-only SpeciesRecord[] registry (as delivered in
 * every RenderFrame.speciesTree) into a set of root nodes (species with no
 * parent, i.e. the original seed population(s) of a world) with nested
 * children. Pure function, no React/DOM — kept in lib/ rather than
 * components/ so it can be unit tested directly and reused if the
 * visualization changes later.
 */
export function buildSpeciesTree(records: SpeciesRecord[]): SpeciesTreeNode[] {
  const nodeById = new Map<number, SpeciesTreeNode>();
  for (const record of records) {
    nodeById.set(record.speciesId, { record, children: [], descendantCount: 0 });
  }

  const roots: SpeciesTreeNode[] = [];
  for (const node of nodeById.values()) {
    const parentId = node.record.parentSpeciesId;
    const parent = parentId !== null ? nodeById.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children/roots by origin tick so the tree reads chronologically.
  const sortByOrigin = (a: SpeciesTreeNode, b: SpeciesTreeNode) => a.record.originTick - b.record.originTick;
  for (const node of nodeById.values()) node.children.sort(sortByOrigin);
  roots.sort(sortByOrigin);

  for (const node of nodeById.values()) node.descendantCount = countDescendants(node);

  return roots;
}

function countDescendants(node: SpeciesTreeNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

/** Flattens a tree back into a lookup by speciesId, useful for finding a node's ancestors/details by id. */
export function indexSpeciesTree(roots: SpeciesTreeNode[]): Map<number, SpeciesTreeNode> {
  const index = new Map<number, SpeciesTreeNode>();
  const visit = (node: SpeciesTreeNode) => {
    index.set(node.record.speciesId, node);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return index;
}
