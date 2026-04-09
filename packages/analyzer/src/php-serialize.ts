const MAX_INPUT_LENGTH = 1024 * 1024; // 1MB

type PhpValue = string | number | boolean | null | PhpObject;
type PhpObject = { [key: string]: PhpValue };

/**
 * Parse a PHP serialized string into a JavaScript value.
 * Uses character-by-character index scanning (no regex) to prevent ReDoS.
 * Returns null on parse failure (fail-safe).
 */
export function phpUnserialize(input: string): PhpValue {
  if (!input || input.length > MAX_INPUT_LENGTH) {
    return null;
  }

  try {
    const [value] = parseValue(input, 0);
    return value;
  } catch {
    return null;
  }
}

function parseValue(input: string, pos: number): [PhpValue, number] {
  const type = input[pos];

  switch (type) {
    case "s":
      return parseString(input, pos);
    case "i":
      return parseInt_(input, pos);
    case "b":
      return parseBool(input, pos);
    case "a":
      return parseArray(input, pos);
    case "N":
      return [null, pos + 2]; // N;
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

function parseString(input: string, pos: number): [string, number] {
  // s:LENGTH:"VALUE";
  const colonPos = input.indexOf(":", pos + 1);
  if (colonPos === -1) throw new Error("Invalid string");

  const semicolonOrQuote = input.indexOf(":", colonPos + 1);
  const length = Number(input.slice(pos + 2, semicolonOrQuote));

  if (Number.isNaN(length)) throw new Error("Invalid string length");

  // Find opening quote
  const quoteStart = input.indexOf('"', semicolonOrQuote);
  if (quoteStart === -1) throw new Error("Invalid string: no opening quote");

  const value = input.slice(quoteStart + 1, quoteStart + 1 + length);
  // Skip past closing quote and semicolon: ";
  return [value, quoteStart + 1 + length + 2];
}

function parseInt_(input: string, pos: number): [number, number] {
  // i:VALUE;
  const semicolonPos = input.indexOf(";", pos);
  if (semicolonPos === -1) throw new Error("Invalid integer");

  const value = Number(input.slice(pos + 2, semicolonPos));
  if (Number.isNaN(value)) throw new Error("Invalid integer value");

  return [value, semicolonPos + 1];
}

function parseBool(input: string, pos: number): [boolean, number] {
  // b:0; or b:1;
  const value = input[pos + 2] === "1";
  return [value, pos + 4];
}

function parseArray(input: string, pos: number): [PhpObject, number] {
  // a:COUNT:{...}
  const colonPos = input.indexOf(":", pos + 1);
  if (colonPos === -1) throw new Error("Invalid array");

  const bracePos = input.indexOf("{", colonPos);
  if (bracePos === -1) throw new Error("Invalid array: no opening brace");

  const count = Number(input.slice(pos + 2, bracePos - 1));
  if (Number.isNaN(count)) throw new Error("Invalid array count");

  const result: PhpObject = {};
  let currentPos = bracePos + 1;

  for (let i = 0; i < count; i++) {
    const [key, nextPos] = parseValue(input, currentPos);
    const [value, valueEnd] = parseValue(input, nextPos);
    result[String(key)] = value;
    currentPos = valueEnd;
  }

  // Skip closing brace
  return [result, currentPos + 1];
}
