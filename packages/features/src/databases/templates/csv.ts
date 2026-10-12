export function parseCsv(text: string) {
  const records: string[][] = [];
  let field = "";
  let quoted = false;
  let record: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  record.push(field.replace(/\r$/, ""));
  if (record.some((value) => value.length > 0)) records.push(record);

  return {
    headers: (records[0] ?? []).map(
      (value, index) => value.trim() || (index === 0 ? "Name" : `Column ${index + 1}`),
    ),
    rows: records.slice(1),
  };
}
