/**
 * Formatting Options for {@linkcode stringify}
 */ export interface FormatOptions {
  /** Define if the keys should be aligned or not */ keyAlignment?: boolean;
}
/**
 * Stringify dumps source object into TOML string and returns it.
 * @param srcObj
 * @param [fmtOptions] format options
 * @param [fmtOptions.keyAlignment] whether to align keys
 */ export declare function stringify(srcObj: Record<string, unknown>, fmtOptions?: FormatOptions): string;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInN0cmluZ2lmeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFzQkE7O0NBRUMsR0FDRCxpQkFBaUI7RUFDZixnREFBZ0QsR0FDaEQsZUFBZSxPQUFPOztBQXlPeEI7Ozs7O0NBS0MsR0FDRCxPQUFPLGlCQUFTLFVBQ2QsUUFBUSxPQUFPLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFDL0IsYUFBYSxhQUFhLEdBQ3pCLE1BQU0ifQ==