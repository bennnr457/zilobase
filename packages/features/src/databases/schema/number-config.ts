import {
  getNumberDecimalPlaces,
  getNumberDisplayColor,
  getNumberDisplayDivideBy,
  getNumberDisplayShowNumber,
  getNumberDisplayStyle,
  getNumberFormat,
  type DatabaseNumberDisplayStyle,
  type NumberDecimalPlacesValue,
} from "../views/configuration";
export type NumberPropertyConfig = {
  numberDecimalPlaces: NumberDecimalPlacesValue;
  numberDisplayColor: string;
  numberDisplayDivideBy: number;
  numberDisplayShowNumber: boolean;
  numberDisplayStyle: DatabaseNumberDisplayStyle;
  numberFormat: string;
};

export function getNumberPropertyConfig(config: unknown): NumberPropertyConfig {
  return {
    numberDecimalPlaces: getNumberDecimalPlaces(config),
    numberDisplayColor: getNumberDisplayColor(config),
    numberDisplayDivideBy: getNumberDisplayDivideBy(config),
    numberDisplayShowNumber: getNumberDisplayShowNumber(config),
    numberDisplayStyle: getNumberDisplayStyle(config),
    numberFormat: getNumberFormat(config),
  };
}
