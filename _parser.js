// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
import { deepMerge } from "@jsr/std__collections/deep-merge";
export class TOMLParseError extends Error {
}
export class Scanner {
  source;
  #whitespace;
  #position;
  constructor(source){
    this.source = source;
    this.#whitespace = /[ \t]/;
    this.#position = 0;
  }
  /**
   * Get current character
   * @param index - relative index from current position
   */ char(index = 0) {
    return this.source[this.#position + index] ?? "";
  }
  /**
   * Get sliced string
   * @param start - start position relative from current position
   * @param end - end position relative from current position
   */ slice(start, end) {
    return this.source.slice(this.#position + start, this.#position + end);
  }
  /**
   * Move position to next
   */ next(count) {
    if (typeof count === "number") {
      for(let i = 0; i < count; i++){
        this.#position++;
      }
    } else {
      this.#position++;
    }
  }
  /**
   * Move position until current char is not a whitespace, EOL, or comment.
   * @param options.inline - skip only whitespaces
   */ nextUntilChar(options = {
    comment: true
  }) {
    if (options.inline) {
      while(this.#whitespace.test(this.char()) && !this.eof()){
        this.next();
      }
    } else {
      while(!this.eof()){
        const char = this.char();
        if (this.#whitespace.test(char) || this.isCurrentCharEOL()) {
          this.next();
        } else if (options.comment && this.char() === "#") {
          // entering comment
          while(!this.isCurrentCharEOL() && !this.eof()){
            this.next();
          }
        } else {
          break;
        }
      }
    }
    // Invalid if current char is other kinds of whitespace
    if (!this.isCurrentCharEOL() && /\s/.test(this.char())) {
      const escaped = "\\u" + this.char().charCodeAt(0).toString(16);
      throw new TOMLParseError(`Contains invalid whitespaces: \`${escaped}\``);
    }
  }
  /**
   * Position reached EOF or not
   */ eof() {
    return this.position() >= this.source.length;
  }
  /**
   * Get current position
   */ position() {
    return this.#position;
  }
  isCurrentCharEOL() {
    return this.char() === "\n" || this.slice(0, 2) === "\r\n";
  }
}
// -----------------------
// Utilities
// -----------------------
function success(body) {
  return {
    ok: true,
    body
  };
}
function failure() {
  return {
    ok: false
  };
}
export const Utils = {
  unflat (keys, values = {}, cObj) {
    const out = {};
    if (keys.length === 0) {
      return cObj;
    } else {
      if (!cObj) {
        cObj = values;
      }
      const key = keys[keys.length - 1];
      if (typeof key === "string") {
        out[key] = cObj;
      }
      return this.unflat(keys.slice(0, -1), values, out);
    }
  },
  deepAssignWithTable (target, table) {
    if (table.key.length === 0 || table.key[0] == null) {
      throw new Error("Unexpected key length");
    }
    const value = target[table.key[0]];
    if (typeof value === "undefined") {
      Object.assign(target, this.unflat(table.key, table.type === "Table" ? table.value : [
        table.value
      ]));
    } else if (Array.isArray(value)) {
      if (table.type === "TableArray" && table.key.length === 1) {
        value.push(table.value);
      } else {
        const last = value[value.length - 1];
        Utils.deepAssignWithTable(last, {
          type: table.type,
          key: table.key.slice(1),
          value: table.value
        });
      }
    } else if (typeof value === "object" && value !== null) {
      Utils.deepAssignWithTable(value, {
        type: table.type,
        key: table.key.slice(1),
        value: table.value
      });
    } else {
      throw new Error("Unexpected assign");
    }
  }
};
// ---------------------------------
// Parser combinators and generators
// ---------------------------------
function or(parsers) {
  return function Or(scanner) {
    for (const parse of parsers){
      const result = parse(scanner);
      if (result.ok) {
        return result;
      }
    }
    return failure();
  };
}
function join(parser, separator) {
  const Separator = character(separator);
  return function Join(scanner) {
    const first = parser(scanner);
    if (!first.ok) {
      return failure();
    }
    const out = [
      first.body
    ];
    while(!scanner.eof()){
      if (!Separator(scanner).ok) {
        break;
      }
      const result = parser(scanner);
      if (result.ok) {
        out.push(result.body);
      } else {
        throw new TOMLParseError(`Invalid token after "${separator}"`);
      }
    }
    return success(out);
  };
}
function kv(keyParser, separator, valueParser) {
  const Separator = character(separator);
  return function Kv(scanner) {
    const key = keyParser(scanner);
    if (!key.ok) {
      return failure();
    }
    const sep = Separator(scanner);
    if (!sep.ok) {
      throw new TOMLParseError(`key/value pair doesn't have "${separator}"`);
    }
    const value = valueParser(scanner);
    if (!value.ok) {
      throw new TOMLParseError(`Value of key/value pair is invalid data format`);
    }
    return success(Utils.unflat(key.body, value.body));
  };
}
function merge(parser) {
  return function Merge(scanner) {
    const result = parser(scanner);
    if (!result.ok) {
      return failure();
    }
    let body = {};
    for (const record of result.body){
      if (typeof body === "object" && body !== null) {
        // deno-lint-ignore no-explicit-any
        body = deepMerge(body, record);
      }
    }
    return success(body);
  };
}
function repeat(parser) {
  return function Repeat(scanner) {
    const body = [];
    while(!scanner.eof()){
      const result = parser(scanner);
      if (result.ok) {
        body.push(result.body);
      } else {
        break;
      }
      scanner.nextUntilChar();
    }
    if (body.length === 0) {
      return failure();
    }
    return success(body);
  };
}
function surround(left, parser, right) {
  const Left = character(left);
  const Right = character(right);
  return function Surround(scanner) {
    if (!Left(scanner).ok) {
      return failure();
    }
    const result = parser(scanner);
    if (!result.ok) {
      throw new TOMLParseError(`Invalid token after "${left}"`);
    }
    if (!Right(scanner).ok) {
      throw new TOMLParseError(`Not closed by "${right}" after started with "${left}"`);
    }
    return success(result.body);
  };
}
function character(str) {
  return function character(scanner) {
    scanner.nextUntilChar({
      inline: true
    });
    if (scanner.slice(0, str.length) === str) {
      scanner.next(str.length);
    } else {
      return failure();
    }
    scanner.nextUntilChar({
      inline: true
    });
    return success(undefined);
  };
}
// -----------------------
// Parser components
// -----------------------
const Patterns = {
  BARE_KEY: /[A-Za-z0-9_-]/,
  FLOAT: /[0-9_\.e+\-]/i,
  END_OF_VALUE: /[ \t\r\n#,}\]]/
};
export function BareKey(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (!scanner.char() || !Patterns.BARE_KEY.test(scanner.char())) {
    return failure();
  }
  const acc = [];
  while(scanner.char() && Patterns.BARE_KEY.test(scanner.char())){
    acc.push(scanner.char());
    scanner.next();
  }
  const key = acc.join("");
  return success(key);
}
function EscapeSequence(scanner) {
  if (scanner.char() === "\\") {
    scanner.next();
    // See https://toml.io/en/v1.0.0-rc.3#string
    switch(scanner.char()){
      case "b":
        scanner.next();
        return success("\b");
      case "t":
        scanner.next();
        return success("\t");
      case "n":
        scanner.next();
        return success("\n");
      case "f":
        scanner.next();
        return success("\f");
      case "r":
        scanner.next();
        return success("\r");
      case "u":
      case "U":
        {
          // Unicode character
          const codePointLen = scanner.char() === "u" ? 4 : 6;
          const codePoint = parseInt("0x" + scanner.slice(1, 1 + codePointLen), 16);
          const str = String.fromCodePoint(codePoint);
          scanner.next(codePointLen + 1);
          return success(str);
        }
      case '"':
        scanner.next();
        return success('"');
      case "\\":
        scanner.next();
        return success("\\");
      default:
        throw new TOMLParseError(`Invalid escape sequence: \\${scanner.char()}`);
    }
  } else {
    return failure();
  }
}
export function BasicString(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (scanner.char() === '"') {
    scanner.next();
  } else {
    return failure();
  }
  const acc = [];
  while(scanner.char() !== '"' && !scanner.eof()){
    if (scanner.char() === "\n") {
      throw new TOMLParseError("Single-line string cannot contain EOL");
    }
    const escapedChar = EscapeSequence(scanner);
    if (escapedChar.ok) {
      acc.push(escapedChar.body);
    } else {
      acc.push(scanner.char());
      scanner.next();
    }
  }
  if (scanner.eof()) {
    throw new TOMLParseError(`Single-line string is not closed:\n${acc.join("")}`);
  }
  scanner.next(); // skip last '""
  return success(acc.join(""));
}
export function LiteralString(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (scanner.char() === "'") {
    scanner.next();
  } else {
    return failure();
  }
  const acc = [];
  while(scanner.char() !== "'" && !scanner.eof()){
    if (scanner.char() === "\n") {
      throw new TOMLParseError("Single-line string cannot contain EOL");
    }
    acc.push(scanner.char());
    scanner.next();
  }
  if (scanner.eof()) {
    throw new TOMLParseError(`Single-line string is not closed:\n${acc.join("")}`);
  }
  scanner.next(); // skip last "'"
  return success(acc.join(""));
}
export function MultilineBasicString(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (scanner.slice(0, 3) === '"""') {
    scanner.next(3);
  } else {
    return failure();
  }
  if (scanner.char() === "\n") {
    // The first newline (LF) is trimmed
    scanner.next();
  } else if (scanner.slice(0, 2) === "\r\n") {
    // The first newline (CRLF) is trimmed
    scanner.next(2);
  }
  const acc = [];
  while(scanner.slice(0, 3) !== '"""' && !scanner.eof()){
    // line ending backslash
    if (scanner.slice(0, 2) === "\\\n") {
      scanner.next();
      scanner.nextUntilChar({
        comment: false
      });
      continue;
    } else if (scanner.slice(0, 3) === "\\\r\n") {
      scanner.next();
      scanner.nextUntilChar({
        comment: false
      });
      continue;
    }
    const escapedChar = EscapeSequence(scanner);
    if (escapedChar.ok) {
      acc.push(escapedChar.body);
    } else {
      acc.push(scanner.char());
      scanner.next();
    }
  }
  if (scanner.eof()) {
    throw new TOMLParseError(`Multi-line string is not closed:\n${acc.join("")}`);
  }
  // if ends with 4 `"`, push the fist `"` to string
  if (scanner.char(3) === '"') {
    acc.push('"');
    scanner.next();
  }
  scanner.next(3); // skip last '""""
  return success(acc.join(""));
}
export function MultilineLiteralString(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (scanner.slice(0, 3) === "'''") {
    scanner.next(3);
  } else {
    return failure();
  }
  if (scanner.char() === "\n") {
    // The first newline (LF) is trimmed
    scanner.next();
  } else if (scanner.slice(0, 2) === "\r\n") {
    // The first newline (CRLF) is trimmed
    scanner.next(2);
  }
  const acc = [];
  while(scanner.slice(0, 3) !== "'''" && !scanner.eof()){
    acc.push(scanner.char());
    scanner.next();
  }
  if (scanner.eof()) {
    throw new TOMLParseError(`Multi-line string is not closed:\n${acc.join("")}`);
  }
  // if ends with 4 `'`, push the fist `'` to string
  if (scanner.char(3) === "'") {
    acc.push("'");
    scanner.next();
  }
  scanner.next(3); // skip last "'''"
  return success(acc.join(""));
}
const symbolPairs = [
  [
    "true",
    true
  ],
  [
    "false",
    false
  ],
  [
    "inf",
    Infinity
  ],
  [
    "+inf",
    Infinity
  ],
  [
    "-inf",
    -Infinity
  ],
  [
    "nan",
    NaN
  ],
  [
    "+nan",
    NaN
  ],
  [
    "-nan",
    NaN
  ]
];
export function Symbols(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  const found = symbolPairs.find(([str])=>scanner.slice(0, str.length) === str);
  if (!found) {
    return failure();
  }
  const [str, value] = found;
  scanner.next(str.length);
  return success(value);
}
export const DottedKey = join(or([
  BareKey,
  BasicString,
  LiteralString
]), ".");
export function Integer(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  // If binary / octal / hex
  const first2 = scanner.slice(0, 2);
  if (first2.length === 2 && /0(?:x|o|b)/i.test(first2)) {
    scanner.next(2);
    const acc = [
      first2
    ];
    while(/[0-9a-f_]/i.test(scanner.char()) && !scanner.eof()){
      acc.push(scanner.char());
      scanner.next();
    }
    if (acc.length === 1) {
      return failure();
    }
    return success(acc.join(""));
  }
  const acc = [];
  if (/[+-]/.test(scanner.char())) {
    acc.push(scanner.char());
    scanner.next();
  }
  while(/[0-9_]/.test(scanner.char()) && !scanner.eof()){
    acc.push(scanner.char());
    scanner.next();
  }
  if (acc.length === 0 || acc.length === 1 && /[+-]/.test(acc[0])) {
    return failure();
  }
  const int = parseInt(acc.filter((char)=>char !== "_").join(""));
  return success(int);
}
export function Float(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  // lookahead validation is needed for integer value is similar to float
  let position = 0;
  while(scanner.char(position) && !Patterns.END_OF_VALUE.test(scanner.char(position))){
    if (!Patterns.FLOAT.test(scanner.char(position))) {
      return failure();
    }
    position++;
  }
  const acc = [];
  if (/[+-]/.test(scanner.char())) {
    acc.push(scanner.char());
    scanner.next();
  }
  while(Patterns.FLOAT.test(scanner.char()) && !scanner.eof()){
    acc.push(scanner.char());
    scanner.next();
  }
  if (acc.length === 0) {
    return failure();
  }
  const float = parseFloat(acc.filter((char)=>char !== "_").join(""));
  if (isNaN(float)) {
    return failure();
  }
  return success(float);
}
export function DateTime(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  let dateStr = scanner.slice(0, 10);
  // example: 1979-05-27
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    scanner.next(10);
  } else {
    return failure();
  }
  const acc = [];
  // example: 1979-05-27T00:32:00Z
  while(/[ 0-9TZ.:-]/.test(scanner.char()) && !scanner.eof()){
    acc.push(scanner.char());
    scanner.next();
  }
  dateStr += acc.join("");
  const date = new Date(dateStr.trim());
  // invalid date
  if (isNaN(date.getTime())) {
    throw new TOMLParseError(`Invalid date string "${dateStr}"`);
  }
  return success(date);
}
export function LocalTime(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  let timeStr = scanner.slice(0, 8);
  if (/^(\d{2}):(\d{2}):(\d{2})/.test(timeStr)) {
    scanner.next(8);
  } else {
    return failure();
  }
  const acc = [];
  if (scanner.char() === ".") {
    acc.push(scanner.char());
    scanner.next();
  } else {
    return success(timeStr);
  }
  while(/[0-9]/.test(scanner.char()) && !scanner.eof()){
    acc.push(scanner.char());
    scanner.next();
  }
  timeStr += acc.join("");
  return success(timeStr);
}
export function ArrayValue(scanner) {
  scanner.nextUntilChar({
    inline: true
  });
  if (scanner.char() === "[") {
    scanner.next();
  } else {
    return failure();
  }
  const array = [];
  while(!scanner.eof()){
    scanner.nextUntilChar();
    const result = Value(scanner);
    if (result.ok) {
      array.push(result.body);
    } else {
      break;
    }
    scanner.nextUntilChar({
      inline: true
    });
    // may have a next item, but trailing comma is allowed at array
    if (scanner.char() === ",") {
      scanner.next();
    } else {
      break;
    }
  }
  scanner.nextUntilChar();
  if (scanner.char() === "]") {
    scanner.next();
  } else {
    throw new TOMLParseError("Array is not closed");
  }
  return success(array);
}
export function InlineTable(scanner) {
  scanner.nextUntilChar();
  if (scanner.char(1) === "}") {
    scanner.next(2);
    return success({});
  }
  const pairs = surround("{", join(Pair, ","), "}")(scanner);
  if (!pairs.ok) {
    return failure();
  }
  let table = {};
  for (const pair of pairs.body){
    table = deepMerge(table, pair);
  }
  return success(table);
}
export const Value = or([
  MultilineBasicString,
  MultilineLiteralString,
  BasicString,
  LiteralString,
  Symbols,
  DateTime,
  LocalTime,
  Float,
  Integer,
  ArrayValue,
  InlineTable
]);
export const Pair = kv(DottedKey, "=", Value);
export function Block(scanner) {
  scanner.nextUntilChar();
  const result = merge(repeat(Pair))(scanner);
  if (result.ok) {
    return success({
      type: "Block",
      value: result.body
    });
  } else {
    return failure();
  }
}
export const TableHeader = surround("[", DottedKey, "]");
export function Table(scanner) {
  scanner.nextUntilChar();
  const header = TableHeader(scanner);
  if (!header.ok) {
    return failure();
  }
  scanner.nextUntilChar();
  const block = Block(scanner);
  return success({
    type: "Table",
    key: header.body,
    value: block.ok ? block.body.value : {}
  });
}
export const TableArrayHeader = surround("[[", DottedKey, "]]");
export function TableArray(scanner) {
  scanner.nextUntilChar();
  const header = TableArrayHeader(scanner);
  if (!header.ok) {
    return failure();
  }
  scanner.nextUntilChar();
  const block = Block(scanner);
  return success({
    type: "TableArray",
    key: header.body,
    value: block.ok ? block.body.value : {}
  });
}
export function Toml(scanner) {
  const blocks = repeat(or([
    Block,
    TableArray,
    Table
  ]))(scanner);
  if (!blocks.ok) {
    return failure();
  }
  let body = {};
  for (const block of blocks.body){
    switch(block.type){
      case "Block":
        {
          body = deepMerge(body, block.value);
          break;
        }
      case "Table":
        {
          Utils.deepAssignWithTable(body, block);
          break;
        }
      case "TableArray":
        {
          Utils.deepAssignWithTable(body, block);
          break;
        }
    }
  }
  return success(body);
}
export function ParserFactory(parser) {
  return function parse(tomlString) {
    const scanner = new Scanner(tomlString);
    let parsed = null;
    let err = null;
    try {
      parsed = parser(scanner);
    } catch (e) {
      err = e instanceof Error ? e : new Error("[non-error thrown]");
    }
    if (err || !parsed || !parsed.ok || !scanner.eof()) {
      const position = scanner.position();
      const subStr = tomlString.slice(0, position);
      const lines = subStr.split("\n");
      const row = lines.length;
      const column = (()=>{
        let count = subStr.length;
        for (const line of lines){
          if (count > line.length) {
            count -= line.length + 1;
          } else {
            break;
          }
        }
        return count;
      })();
      const message = `Parse error on line ${row}, column ${column}: ${err ? err.message : `Unexpected character: "${scanner.char()}"`}`;
      throw new TOMLParseError(message);
    }
    return parsed.body;
  };
}
//# sourceMappingURL=data:application/json;base64,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