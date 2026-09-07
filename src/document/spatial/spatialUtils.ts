import type { DocumentTextRegion } from "../types";

export function centerX(region: DocumentTextRegion): number {
  return region.x + region.width / 2;
}

export function centerY(region: DocumentTextRegion): number {
  return region.y + region.height / 2;
}

export function right(region: DocumentTextRegion): number {
  return region.x + region.width;
}

export function bottom(region: DocumentTextRegion): number {
  return region.y + region.height;
}

export function getTextHeight(region: DocumentTextRegion): number {
  return region.height;
}

export function distance(a: DocumentTextRegion, b: DocumentTextRegion): number {
  const dx = centerX(a) - centerX(b);
  const dy = centerY(a) - centerY(b);
  return Math.sqrt(dx * dx + dy * dy);
}

function samePage(a: DocumentTextRegion, b: DocumentTextRegion): boolean {
  return a.page === b.page;
}

export function getRegionsInSameRow(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
  tolerance = 0.7,
): DocumentTextRegion[] {
  const limit = Math.max(4, origin.height * tolerance);
  return regions
    .filter(
      (r) =>
        r.id !== origin.id &&
        samePage(r, origin) &&
        Math.abs(centerY(r) - centerY(origin)) <= limit,
    )
    .sort((a, b) => a.x - b.x);
}

export function getRegionsRight(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
): DocumentTextRegion[] {
  return getRegionsInSameRow(origin, regions).filter((r) => r.x >= right(origin) - origin.height * 0.5);
}

export function getRegionsLeft(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
): DocumentTextRegion[] {
  return getRegionsInSameRow(origin, regions)
    .filter((r) => right(r) <= origin.x + origin.height * 0.5)
    .sort((a, b) => b.x - a.x);
}

export function getRegionsBelow(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
  maxRows = 2.5,
): DocumentTextRegion[] {
  return regions
    .filter(
      (r) =>
        r.id !== origin.id &&
        samePage(r, origin) &&
        r.y >= bottom(origin) - origin.height * 0.4 &&
        r.y - bottom(origin) <= origin.height * maxRows &&
        right(r) > origin.x - origin.height &&
        r.x < right(origin) + origin.height * 8,
    )
    .sort((a, b) => a.y - b.y);
}

export function getRegionsAbove(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
  maxRows = 2.5,
): DocumentTextRegion[] {
  return regions
    .filter(
      (r) =>
        r.id !== origin.id &&
        samePage(r, origin) &&
        bottom(r) <= centerY(origin) &&
        origin.y - bottom(r) <= origin.height * maxRows &&
        right(r) > origin.x - origin.height &&
        r.x < right(origin) + origin.height * 8,
    )
    .sort((a, b) => b.y - a.y);
}

export function getRegionsNear(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
  radiusInRowHeights = 3,
): DocumentTextRegion[] {
  const radius = origin.height * radiusInRowHeights;
  return regions
    .filter((r) => r.id !== origin.id && samePage(r, origin) && distance(r, origin) <= radius)
    .sort((a, b) => distance(a, origin) - distance(b, origin));
}

/**
 * Value region associated with a label region: first the same row to the
 * right, otherwise the nearest line below.
 */
export function getNearestRegion(
  origin: DocumentTextRegion,
  regions: DocumentTextRegion[],
): { region: DocumentTextRegion; relation: "right" | "below" } | null {
  const rightSide = getRegionsRight(origin, regions).filter((r) => r.text.trim().length > 0);
  if (rightSide[0]) return { region: rightSide[0], relation: "right" };
  const below = getRegionsBelow(origin, regions).filter((r) => r.text.trim().length > 0);
  if (below[0]) return { region: below[0], relation: "below" };
  return null;
}

export type VerticalBand = "top" | "upper-middle" | "lower-middle" | "bottom";

export interface RelativePosition {
  /** 0..1 across the page. */
  xRatio: number;
  yRatio: number;
  band: VerticalBand;
  /** Region height divided by the median region height on the page. */
  relativeTextHeight: number;
}

export function pageBounds(regions: DocumentTextRegion[], page: number) {
  const onPage = regions.filter((r) => r.page === page);
  const width = Math.max(1, ...onPage.map((r) => right(r)));
  const height = Math.max(1, ...onPage.map((r) => bottom(r)));
  return { width, height };
}

export function medianHeight(regions: DocumentTextRegion[]): number {
  const heights = regions.map((r) => r.height).sort((a, b) => a - b);
  if (!heights.length) return 1;
  return heights[Math.floor(heights.length / 2)]!;
}

export function getRelativePosition(
  region: DocumentTextRegion,
  regions: DocumentTextRegion[],
): RelativePosition {
  const bounds = pageBounds(regions, region.page);
  const median = medianHeight(regions.filter((r) => r.page === region.page));
  const yRatio = centerY(region) / bounds.height;
  const band: VerticalBand =
    yRatio < 0.25 ? "top" : yRatio < 0.5 ? "upper-middle" : yRatio < 0.75 ? "lower-middle" : "bottom";
  return {
    xRatio: centerX(region) / bounds.width,
    yRatio,
    band,
    relativeTextHeight: region.height / Math.max(1, median),
  };
}

/** Reading order: rows top-to-bottom, then left-to-right inside a row. */
export function readingOrder(regions: DocumentTextRegion[]): DocumentTextRegion[] {
  const median = medianHeight(regions);
  return [...regions].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const rowDelta = centerY(a) - centerY(b);
    if (Math.abs(rowDelta) > median * 0.7) return rowDelta;
    return a.x - b.x;
  });
}

/** Groups regions into visual lines using vertical overlap. */
export function groupRows(regions: DocumentTextRegion[]): DocumentTextRegion[][] {
  const ordered = readingOrder(regions);
  const rows: DocumentTextRegion[][] = [];
  for (const region of ordered) {
    const row = rows[rows.length - 1];
    const reference = row?.[0];
    if (
      row &&
      reference &&
      reference.page === region.page &&
      Math.abs(centerY(reference) - centerY(region)) <= Math.max(4, reference.height * 0.7)
    ) {
      row.push(region);
    } else {
      rows.push([region]);
    }
  }
  return rows;
}
