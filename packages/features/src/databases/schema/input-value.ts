import { getNumberFormat, getNumberDecimalPlaces } from "../views/configuration";
export function isValidNumber(value: string) {
  return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim());
}

export function getActionHref(type: string, value: string) {
  const displayValue = stripActionScheme(type, value).trim();

  if (!displayValue) {
    return null;
  }

  if (type === "email") {
    return `mailto:${displayValue}`;
  }

  if (type === "phone") {
    return `tel:${displayValue}`;
  }

  if (type === "url") {
    return getUrlHref(displayValue);
  }

  return null;
}

export function getUrlHref(value: string) {
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const href = hasProtocol ? value : `https://${value}`;

  try {
    const url = new URL(href);

    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function formatNumberValue(value: string, numberValue: number, config: unknown) {
  const numberFormat = getNumberFormat(config).trim().toLowerCase();
  const decimalPlaces = getNumberDecimalPlaces(config);
  const options: Intl.NumberFormatOptions = {
    useGrouping: numberFormat !== "number",
  };
  const currencyCode = getNumberCurrencyCode(numberFormat);

  if (decimalPlaces !== "default") {
    options.minimumFractionDigits = decimalPlaces;
    options.maximumFractionDigits = decimalPlaces;
  }

  if (numberFormat === "number" && decimalPlaces === "default") {
    return value;
  }

  if (numberFormat === "percent") {
    options.style = "percent";
  } else if (currencyCode) {
    options.currency = currencyCode;
    options.style = "currency";
  }

  return new Intl.NumberFormat(undefined, options).format(numberValue);
}

function getNumberCurrencyCode(format: string) {
  const normalizedFormat = format.toUpperCase();

  return /^[A-Z]{3}$/.test(normalizedFormat) ? normalizedFormat : null;
}

export function stripActionScheme(type: string, value: string) {
  if (type === "email") {
    return value.replace(/^mailto:/i, "");
  }

  if (type === "phone") {
    return value.replace(/^tel:/i, "");
  }

  return value;
}
