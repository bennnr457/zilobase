import {
  createChartData as deriveChartData,
  createSplitChartData as deriveSplitChartData,
  createOuterPieSegments as deriveOuterPieSegments,
  type DatabaseChartDataItem,
} from "@zilobase/features/databases";
import { getPaletteBackgroundColor, getPaletteColor } from "@/lib/color-tokens";
export type {
  DatabaseChartDataItem,
  DatabaseChartSeriesItem,
  DatabaseChartPieSegment,
  DatabaseChartRow,
} from "@zilobase/features/databases";
export {
  sortDatabaseChartData,
  getChartMeasureValue,
  getChartValueColorKey,
  getAutomaticChartColor,
  getChartGroupProperty,
} from "@zilobase/features/databases";
export const DEFAULT_CHART_COLOR = "var(--zb-color-palette-background-blue-subtle)";
const present = <T extends { color: string }>(item: T): T => ({
  ...item,
  color: getPaletteBackgroundColor(item.color) ?? DEFAULT_CHART_COLOR,
});
export function createChartData(input: Parameters<typeof deriveChartData>[0]) {
  return deriveChartData(input).map(present);
}
export function createSplitChartData(input: Parameters<typeof deriveSplitChartData>[0]) {
  const result = deriveSplitChartData(input);
  return { data: result.data.map(present), series: result.series.map(present) };
}
export const createOuterPieSegments = deriveOuterPieSegments;

export function getChartDataWithFills(data: DatabaseChartDataItem[], color: string | null) {
  return data.map((item, index) => ({
    ...item,
    fill: color ? getColorVariant(color, index) : item.color,
  }));
}

export function getColorVariant(color: string, index: number) {
  const colorPercentages = [100, 82, 68, 54, 88, 74, 60, 46];
  const colorPercentage = colorPercentages[index % colorPercentages.length];

  if (colorPercentage === 100) {
    return color;
  }

  const paletteId = color.match(
    /^var\(--zb-color-palette-background-(gray|brown|orange|yellow|green|blue|purple|pink|red)-subtle\)$/,
  )?.[1];

  return paletteId
    ? `var(--zb-color-palette-background-${paletteId}-variant-${colorPercentage})`
    : color;
}

export function getChartStrokeColor(color: string) {
  const match = color.match(
    /^var\(--zb-color-palette-background-(gray|brown|orange|yellow|green|blue|purple|pink|red)-(subtle|variant-\d+)\)$/,
  );

  if (!match) return color;

  return match[2] === "subtle"
    ? (getPaletteColor(match[1]) ?? color)
    : `var(--zb-color-palette-text-${match[1]}-${match[2]})`;
}
