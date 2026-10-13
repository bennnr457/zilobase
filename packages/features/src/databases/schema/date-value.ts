import { firstScalarValue } from "./property-values";
export function parseDatabaseDateValue(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const localDateTimeMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1]);
    const month = Number(localDateTimeMatch[2]);
    const day = Number(localDateTimeMatch[3]);
    const hours = Number(localDateTimeMatch[4]);
    const minutes = Number(localDateTimeMatch[5]);
    const date = new Date(year, month - 1, day, hours, minutes);

    return isSameDateParts(date, year, month, day) &&
      date.getHours() === hours &&
      date.getMinutes() === minutes
      ? date
      : undefined;
  }

  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const { date, day, month, year } = parseLocalDateMatch(dateOnlyMatch);

    return isSameDateParts(date, year, month, day) ? date : undefined;
  }

  const date = new Date(trimmedValue);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseLocalDateMatch(match: RegExpMatchArray) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return { date: new Date(year, month - 1, day), day, month, year };
}

function isSameDateParts(date: Date, year: number, month: number, day: number) {
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function parseDatabaseDateRange(value: string | string[]) {
  const [startValue, endValue] = Array.isArray(value) ? value : [value, undefined];

  return {
    end: endValue ? parseDatabaseDateValue(endValue) : undefined,
    endTime: endValue ? getDatabaseTimePart(endValue) : "",
    start: startValue ? parseDatabaseDateValue(startValue) : undefined,
    startTime: startValue ? getDatabaseTimePart(startValue) : "",
  };
}

export function getDatabaseDateStartValue(value: string | string[]) {
  return firstScalarValue(value);
}

export function getDatabaseDateEndValue(value: string | string[]) {
  return Array.isArray(value) ? (value[1] ?? "") : "";
}

export function getDatabaseDateStartTimeValue(value: string | string[]) {
  return getDatabaseTimePart(getDatabaseDateStartValue(value));
}

export function getDatabaseDateEndTimeValue(value: string | string[]) {
  return getDatabaseTimePart(getDatabaseDateEndValue(value));
}

export function getDatabaseDatePart(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? value;
}

export function getDatabaseTimePart(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

export function toDatabaseDateValue(date: Date, timeValue = "") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateValue = `${year}-${month}-${day}`;

  return timeValue ? `${dateValue}T${timeValue}` : dateValue;
}

export function getDatabaseTimeValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}
