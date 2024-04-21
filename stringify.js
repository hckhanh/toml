// Copyright 2018-2024 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.
// Bare keys may only contain ASCII letters,
// ASCII digits, underscores, and dashes (A-Za-z0-9_-).
function joinKeys(keys) {
  // Dotted keys are a sequence of bare or quoted keys joined with a dot.
  // This allows for grouping similar properties together:
  return keys.map((str)=>{
    return str.length === 0 || str.match(/[^A-Za-z0-9_-]/) ? JSON.stringify(str) : str;
  }).join(".");
}
class Dumper {
  maxPad = 0;
  srcObject;
  output = [];
  #arrayTypeCache = new Map();
  constructor(srcObjc){
    this.srcObject = srcObjc;
  }
  dump(fmtOptions = {}) {
    // deno-lint-ignore no-explicit-any
    this.output = this.#printObject(this.srcObject);
    this.output = this.#format(fmtOptions);
    return this.output;
  }
  #printObject(obj, keys = []) {
    const out = [];
    const props = Object.keys(obj);
    const inlineProps = [];
    const multilineProps = [];
    for (const prop of props){
      if (this.#isSimplySerializable(obj[prop])) {
        inlineProps.push(prop);
      } else {
        multilineProps.push(prop);
      }
    }
    const sortedProps = inlineProps.concat(multilineProps);
    for (const prop of sortedProps){
      const value = obj[prop];
      if (value instanceof Date) {
        out.push(this.#dateDeclaration([
          prop
        ], value));
      } else if (typeof value === "string" || value instanceof RegExp) {
        out.push(this.#strDeclaration([
          prop
        ], value.toString()));
      } else if (typeof value === "number") {
        out.push(this.#numberDeclaration([
          prop
        ], value));
      } else if (typeof value === "boolean") {
        out.push(this.#boolDeclaration([
          prop
        ], value));
      } else if (value instanceof Array) {
        const arrayType = this.#getTypeOfArray(value);
        if (arrayType === "ONLY_PRIMITIVE") {
          out.push(this.#arrayDeclaration([
            prop
          ], value));
        } else if (arrayType === "ONLY_OBJECT_EXCLUDING_ARRAY") {
          // array of objects
          for(let i = 0; i < value.length; i++){
            out.push("");
            out.push(this.#headerGroup([
              ...keys,
              prop
            ]));
            out.push(...this.#printObject(value[i], [
              ...keys,
              prop
            ]));
          }
        } else {
          // this is a complex array, use the inline format.
          const str = value.map((x)=>this.#printAsInlineValue(x)).join(",");
          out.push(`${this.#declaration([
            prop
          ])}[${str}]`);
        }
      } else if (typeof value === "object") {
        out.push("");
        out.push(this.#header([
          ...keys,
          prop
        ]));
        if (value) {
          const toParse = value;
          out.push(...this.#printObject(toParse, [
            ...keys,
            prop
          ]));
        }
      // out.push(...this._parse(value, `${path}${prop}.`));
      }
    }
    out.push("");
    return out;
  }
  #isPrimitive(value) {
    return value instanceof Date || value instanceof RegExp || [
      "string",
      "number",
      "boolean"
    ].includes(typeof value);
  }
  #getTypeOfArray(arr) {
    if (this.#arrayTypeCache.has(arr)) {
      return this.#arrayTypeCache.get(arr);
    }
    const type = this.#doGetTypeOfArray(arr);
    this.#arrayTypeCache.set(arr, type);
    return type;
  }
  #doGetTypeOfArray(arr) {
    if (!arr.length) {
      // any type should be fine
      return "ONLY_PRIMITIVE";
    }
    const onlyPrimitive = this.#isPrimitive(arr[0]);
    if (arr[0] instanceof Array) {
      return "MIXED";
    }
    for(let i = 1; i < arr.length; i++){
      if (onlyPrimitive !== this.#isPrimitive(arr[i]) || arr[i] instanceof Array) {
        return "MIXED";
      }
    }
    return onlyPrimitive ? "ONLY_PRIMITIVE" : "ONLY_OBJECT_EXCLUDING_ARRAY";
  }
  #printAsInlineValue(value) {
    if (value instanceof Date) {
      return `"${this.#printDate(value)}"`;
    } else if (typeof value === "string" || value instanceof RegExp) {
      return JSON.stringify(value.toString());
    } else if (typeof value === "number") {
      return value;
    } else if (typeof value === "boolean") {
      return value.toString();
    } else if (value instanceof Array) {
      const str = value.map((x)=>this.#printAsInlineValue(x)).join(",");
      return `[${str}]`;
    } else if (typeof value === "object") {
      if (!value) {
        throw new Error("should never reach");
      }
      const str = Object.keys(value).map((key)=>{
        return `${joinKeys([
          key
        ])} = ${// deno-lint-ignore no-explicit-any
        this.#printAsInlineValue(value[key])}`;
      }).join(",");
      return `{${str}}`;
    }
    throw new Error("should never reach");
  }
  #isSimplySerializable(value) {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof RegExp || value instanceof Date || value instanceof Array && this.#getTypeOfArray(value) !== "ONLY_OBJECT_EXCLUDING_ARRAY";
  }
  #header(keys) {
    return `[${joinKeys(keys)}]`;
  }
  #headerGroup(keys) {
    return `[[${joinKeys(keys)}]]`;
  }
  #declaration(keys) {
    const title = joinKeys(keys);
    if (title.length > this.maxPad) {
      this.maxPad = title.length;
    }
    return `${title} = `;
  }
  #arrayDeclaration(keys, value) {
    return `${this.#declaration(keys)}${JSON.stringify(value)}`;
  }
  #strDeclaration(keys, value) {
    return `${this.#declaration(keys)}${JSON.stringify(value)}`;
  }
  #numberDeclaration(keys, value) {
    switch(value){
      case Infinity:
        return `${this.#declaration(keys)}inf`;
      case -Infinity:
        return `${this.#declaration(keys)}-inf`;
      default:
        return `${this.#declaration(keys)}${value}`;
    }
  }
  #boolDeclaration(keys, value) {
    return `${this.#declaration(keys)}${value}`;
  }
  #printDate(value) {
    function dtPad(v, lPad = 2) {
      return v.padStart(lPad, "0");
    }
    const m = dtPad((value.getUTCMonth() + 1).toString());
    const d = dtPad(value.getUTCDate().toString());
    const h = dtPad(value.getUTCHours().toString());
    const min = dtPad(value.getUTCMinutes().toString());
    const s = dtPad(value.getUTCSeconds().toString());
    const ms = dtPad(value.getUTCMilliseconds().toString(), 3);
    // formatted date
    const fData = `${value.getUTCFullYear()}-${m}-${d}T${h}:${min}:${s}.${ms}`;
    return fData;
  }
  #dateDeclaration(keys, value) {
    return `${this.#declaration(keys)}${this.#printDate(value)}`;
  }
  #format(options = {}) {
    const { keyAlignment = false } = options;
    const rDeclaration = /^(\".*\"|[^=]*)\s=/;
    const out = [];
    for(let i = 0; i < this.output.length; i++){
      const l = this.output[i];
      // we keep empty entry for array of objects
      if (l[0] === "[" && l[1] !== "[") {
        // non-empty object with only subobjects as properties
        if (this.output[i + 1] === "" && this.output[i + 2]?.slice(0, l.length) === l.slice(0, -1) + ".") {
          i += 1;
          continue;
        }
        out.push(l);
      } else {
        if (keyAlignment) {
          const m = rDeclaration.exec(l);
          if (m && m[1]) {
            out.push(l.replace(m[1], m[1].padEnd(this.maxPad)));
          } else {
            out.push(l);
          }
        } else {
          out.push(l);
        }
      }
    }
    // Cleaning multiple spaces
    const cleanedOutput = [];
    for(let i = 0; i < out.length; i++){
      const l = out[i];
      if (!(l === "" && out[i + 1] === "")) {
        cleanedOutput.push(l);
      }
    }
    return cleanedOutput;
  }
}
/**
 * Stringify dumps source object into TOML string and returns it.
 * @param srcObj
 * @param [fmtOptions] format options
 * @param [fmtOptions.keyAlignment] whether to align keys
 */ export function stringify(srcObj, fmtOptions) {
  return new Dumper(srcObj).dump(fmtOptions).join("\n");
}
//# sourceMappingURL=data:application/json;base64,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