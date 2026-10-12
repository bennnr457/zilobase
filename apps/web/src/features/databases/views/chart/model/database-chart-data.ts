import {
  createChartData as deriveChartData,
  createSplitChartData as deriveSplitChartData,
  createOuterPieSegments as deriveOuterPieSegments,
} from "@zilobase/features/databases/models";
import { getPaletteColor } from "@/shared/lib/color-tokens";
export type {
  DatabaseChartDataItem,
  DatabaseChartSeriesItem,
  DatabaseChartPieSegment,
  DatabaseChartRow,
} from "@zilobase/features/databases/models";
export {
  sortDatabaseChartData,
  getChartMeasureValue,
  getChartValueColorKey,
  getAutomaticChartColor,
  getChartGroupProperty,
} from "@zilobase/features/databases/models";
export const DEFAULT_CHART_COLOR = "var(--zb-color-palette-text-blue)";
const present = <T extends { color: string }>(item: T): T => ({
  ...item,
  color: getPaletteColor(item.color) ?? DEFAULT_CHART_COLOR,
});
export function createChartData(input: Parameters<typeof deriveChartData>[0]) {
  return deriveChartData(input).map(present);
}
export function createSplitChartData(input: Parameters<typeof deriveSplitChartData>[0]) {
  const result = deriveSplitChartData(input);
  return { data: result.data.map(present), series: result.series.map(present) };
}
export const createOuterPieSegments = deriveOuterPieSegments;

export function getColorVariant(color: string, index: number) {
  const colorPercentages = [100, 82, 68, 54, 88, 74, 60, 46];
  const colorPercentage = colorPercentages[index % colorPercentages.length];

  if (colorPercentage === 100) {
    return color;
  }

  const paletteId = color.match(
    /^var\(--zb-color-palette-text-(gray|brown|orange|yellow|green|blue|purple|pink|red)\)$/,
  )?.[1];

  return paletteId
    ? `var(--zb-color-palette-background-${paletteId}-variant-${colorPercentage})`
    : color;
}
