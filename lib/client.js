window.__ModuleLoader__.load({
	id: "@citisen/dsh-sentry",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _citisen_litearea = (function () {
// src/core/format.ts
var DEFAULT_LIST_LIMIT = 12;
function fillTemplate(template, values) {
  return String(template).replace(
    /\{(\w+)\}/g,
    (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match
  );
}
function listPhrase(items, options) {
  const conjunction = options?.conjunction ?? "or";
  const limit = options?.limit ?? DEFAULT_LIST_LIMIT;
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  if (shown.length === 0) return "";
  if (shown.length === 1) {
    return rest > 0 ? `${String(shown[0])} and ${String(rest)} more` : String(shown[0]);
  }
  if (shown.length === 2) {
    const pair = `${String(shown[0])} ${conjunction} ${String(shown[1])}`;
    return rest > 0 ? `${pair}, and ${String(rest)} more` : pair;
  }
  const head = shown.slice(0, -1).join(", ");
  const tail = shown[shown.length - 1];
  const phrase = `${head}, ${conjunction} ${String(tail)}`;
  return rest > 0 ? `${phrase}, and ${String(rest)} more` : phrase;
}
function excerpt(text, limit = 24) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}\u2026`;
}

// src/core/text.ts
function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
function isOffset(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 10) {
      starts.push(index + 1);
    } else if (code === 13) {
      if (source.charCodeAt(index + 1) === 10) index += 1;
      starts.push(index + 1);
    }
  }
  return starts;
}
function lineIndexAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}
function lineAt(source, offset, starts) {
  const position = clamp(offset, 0, source.length);
  const boundaries = starts ?? lineStarts(source);
  const index = lineIndexAt(boundaries, position);
  const from = boundaries[index] ?? 0;
  const rawTo = boundaries[index + 1] ?? source.length;
  let to = rawTo;
  while (to > from) {
    const code = source.charCodeAt(to - 1);
    if (code === 10 || code === 13) to -= 1;
    else break;
  }
  const text = source.slice(from, to);
  const column = clamp(position - from, 0, text.length);
  return {
    from,
    to,
    text,
    number: index,
    column,
    before: text.slice(0, column),
    after: text.slice(column)
  };
}
function isWordChar(char, wordChars) {
  return char !== "" && wordChars.test(char);
}
function wordInfoAt(source, offset, wordChars) {
  const position = clamp(offset, 0, source.length);
  let from = position;
  let to = position;
  while (from > 0 && isWordChar(source.charAt(from - 1), wordChars)) from -= 1;
  while (to < source.length && isWordChar(source.charAt(to), wordChars)) to += 1;
  const text = source.slice(from, to);
  const column = position - from;
  return {
    from,
    to,
    text,
    prefix: text.slice(0, column),
    suffix: text.slice(column)
  };
}
function isEmptyRange(range2) {
  return range2.to <= range2.from;
}
function containsOffset(range2, offset) {
  return offset >= range2.from && offset < range2.to;
}
function tokenAt(tokens, offset) {
  for (const token of tokens) {
    if (token.from <= offset && offset < token.to) return token;
    if (token.from > offset) break;
  }
  return void 0;
}
function scopeAt(tokens, offset) {
  return tokenAt(tokens, offset)?.scope;
}
function tokenBefore(tokens, offset) {
  let found;
  for (const token of tokens) {
    if (token.to > offset) break;
    if (token.text.trim() !== "") found = token;
  }
  return found;
}
function tokenAfter(tokens, offset) {
  for (const token of tokens) {
    if (token.to <= offset) continue;
    if (token.text.trim() !== "") return token;
  }
  return void 0;
}
function tokensOnLine(tokens, line) {
  const number = typeof line === "number" ? line : line.number;
  return tokens.filter((token) => token.line === number && token.text.trim() !== "");
}

// src/core/vocabulary.ts
function defineVocabulary(spec) {
  const caseSensitive = spec.caseSensitive === true;
  const unknownScope = spec.unknownScope ?? "invalid";
  const defaultScope = `vocabulary:${spec.id}`;
  const unknownCode = spec.unknownCode ?? `vocabulary:${spec.id}`;
  const unknownSeverity = spec.unknownSeverity ?? "error";
  const fold = (word) => caseSensitive ? word : word.toLowerCase();
  const memberOf = (word, allowed) => {
    const needle = fold(word);
    return allowed.find((candidate) => fold(candidate) === needle);
  };
  const docOf = (word) => {
    if (spec.docs === void 0) return void 0;
    for (const [key, value] of Object.entries(spec.docs)) {
      if (fold(key) !== fold(word)) continue;
      return typeof value === "string" ? { body: value } : value;
    }
    return void 0;
  };
  return {
    id: spec.id,
    caseSensitive,
    resolve: (context) => {
      const words = typeof spec.words === "function" ? spec.words(context) : spec.words;
      return Array.isArray(words) ? words : [];
    },
    has: (word, context) => {
      const words = typeof spec.words === "function" ? spec.words(context) : spec.words;
      return memberOf(word, Array.isArray(words) ? words : []) !== void 0;
    },
    scopeFor: (word) => {
      if (typeof spec.scope === "function") return spec.scope(memberOf(word, [word]) ?? word);
      return spec.scope ?? defaultScope;
    },
    unknownScope,
    reject: (word, context) => {
      if (spec.unknownMessage === void 0) return void 0;
      const allowed = typeof spec.words === "function" ? spec.words(context) : spec.words;
      const members = Array.isArray(allowed) ? allowed : [];
      const message = typeof spec.unknownMessage === "function" ? spec.unknownMessage(word, members) : fillTemplate(spec.unknownMessage, {
        word,
        allowed: listPhrase(members, { conjunction: "or" })
      });
      return { message, severity: unknownSeverity, code: unknownCode };
    },
    entryFor: (word) => docOf(word),
    format: (word) => spec.format === void 0 ? word : spec.format(word)
  };
}
function vocabularyWords(vocabulary, context) {
  return vocabulary.resolve(context);
}
function asResolvedVocabulary(source) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) return void 0;
  const candidate = source;
  return typeof candidate.resolve === "function" ? source : void 0;
}
function resolveWordsSource(source, context) {
  const vocabulary = asResolvedVocabulary(source);
  const raw = vocabulary !== void 0 ? vocabulary.resolve(context) : typeof source === "function" ? source(context) : source;
  return Array.isArray(raw) ? raw.filter((word) => word !== "") : [];
}

// src/core/scan.ts
function isResolvedGrammar(value) {
  return value.__resolved === true;
}
var DEFAULT_WORD_CHARS = /[\p{L}\p{N}_$]/u;
var stickyCache = /* @__PURE__ */ new WeakMap();
function sticky(pattern) {
  const cached = stickyCache.get(pattern);
  if (cached !== void 0) return cached;
  const flags = pattern.flags.replace(/[gy]/g, "");
  const compiled = new RegExp(pattern.source, `${flags}y`);
  stickyCache.set(pattern, compiled);
  return compiled;
}
function execAt(pattern, source, index) {
  pattern.lastIndex = index;
  const match = pattern.exec(source);
  return match !== null && match.index === index ? match : null;
}
function withoutStatefulFlags(pattern) {
  const flags = pattern.flags.replace(/[gy]/g, "");
  return flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
}
function resolveGrammar(grammar) {
  return {
    __resolved: true,
    grammar,
    rules: grammar.rules,
    fallbackScope: grammar.fallbackScope ?? "text",
    wordChars: withoutStatefulFlags(grammar.wordChars ?? DEFAULT_WORD_CHARS)
  };
}
function scan(source, grammar) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const { rules, fallbackScope, wordChars } = resolved;
  const declared = resolved.grammar;
  const sourceId = declared.id;
  const state = declared.analyze === void 0 ? declared.initialState : declared.analyze(source);
  const vocabularyContext = { text: source, state };
  const tokens = [];
  const diagnostics = [];
  const starts = lineStarts(source);
  const length = source.length;
  const wordsCache = /* @__PURE__ */ new Map();
  let cachedLineNumber = -1;
  let cachedLineBounds;
  const prevNotCache = /* @__PURE__ */ new WeakMap();
  const lineInfoAt = (position) => {
    const number = lineIndexAt(starts, position);
    if (number !== cachedLineNumber || cachedLineBounds === void 0) {
      const info = lineAt(source, position, starts);
      cachedLineBounds = { from: info.from, to: info.to, text: info.text };
      cachedLineNumber = number;
    }
    const column = clamp(position - cachedLineBounds.from, 0, cachedLineBounds.text.length);
    return {
      from: cachedLineBounds.from,
      to: cachedLineBounds.to,
      text: cachedLineBounds.text,
      number,
      column,
      before: cachedLineBounds.text.slice(0, column),
      after: cachedLineBounds.text.slice(column)
    };
  };
  const resolveWords = (from) => {
    const cached = wordsCache.get(from);
    if (cached !== void 0) return cached;
    const vocabulary = asResolvedVocabulary(from);
    const caseSensitive = vocabulary?.caseSensitive === true;
    const raw = vocabulary !== void 0 ? vocabulary.resolve(vocabularyContext) : typeof from === "function" ? from(vocabularyContext) : from;
    const list = Array.isArray(raw) ? raw.filter((word) => word !== "") : [];
    const fold = (word) => caseSensitive ? word : word.toLowerCase();
    const entry = {
      list,
      set: new Set(list.map(fold)),
      literal: list.filter((word) => [...word].some((char) => !isWordChar(char, wordChars))).slice().sort((left, right) => right.length - left.length),
      caseSensitive
    };
    wordsCache.set(from, entry);
    return entry;
  };
  const scopeOf = (spec, match, fallback) => spec === void 0 ? fallback : typeof spec === "function" ? spec(match) : spec;
  const contextHolds = (when, index2, previousScope2) => {
    if (when === void 0) return true;
    const info = lineInfoAt(index2);
    if (when.firstOnLine === true && info.text.slice(0, info.column).trim() !== "") return false;
    if (when.after !== void 0) {
      if (previousScope2 === void 0 || !when.after.includes(previousScope2)) return false;
    }
    if (when.notAfter !== void 0 && previousScope2 !== void 0) {
      if (when.notAfter.includes(previousScope2)) return false;
    }
    if (when.line !== void 0 && !when.line.test(info.text)) return false;
    if (when.minColumn !== void 0 && info.column < when.minColumn) return false;
    if (when.maxColumn !== void 0 && info.column > when.maxColumn) return false;
    if (when.prevNot !== void 0 && index2 > 0) {
      let pattern = prevNotCache.get(when);
      if (pattern === void 0) {
        pattern = new RegExp(`[${when.prevNot}]`);
        prevNotCache.set(when, pattern);
      }
      if (pattern.test(source.charAt(index2 - 1))) return false;
    }
    return true;
  };
  let regionScope;
  let previousScope;
  const push = (scope, from, to, region) => {
    if (to <= from) return;
    const text = source.slice(from, to);
    const last = tokens[tokens.length - 1];
    if (last !== void 0 && last.scope === scope && last.to === from && last.region === region && !/[\r\n]/.test(text) && !/[\r\n]/.test(last.text)) {
      last.to = to;
      last.text = source.slice(last.from, to);
    } else {
      const info = lineInfoAt(from);
      tokens.push({ from, to, scope, text, line: info.number, column: from - info.from, region });
    }
    if (text.trim() !== "") previousScope = scope;
  };
  const report = (problem) => {
    diagnostics.push({
      from: problem.from,
      to: problem.to,
      message: problem.message,
      severity: problem.severity ?? "error",
      code: problem.code ?? "lexical",
      source: sourceId
    });
  };
  const ruleMatch = (text, from, groups) => ({ text, source, from, groups, state });
  const readWordRun = (index2) => {
    let to = index2;
    while (to < length && isWordChar(source.charAt(to), wordChars)) to += 1;
    return to;
  };
  const readSegments = (index2, limit) => {
    const segments = [];
    let cursor = index2;
    while (segments.length < limit && cursor < length) {
      const to = readWordRun(cursor);
      if (to === cursor) break;
      segments.push({ from: cursor, to });
      cursor = to;
      const gap = /^[^\S\r\n]+/.exec(source.slice(cursor))?.[0];
      if (gap === void 0) break;
      cursor += gap.length;
    }
    return segments;
  };
  const matchWords = (rule, words, index2) => {
    const fold = (word) => words.caseSensitive ? word : word.toLowerCase();
    const firstTo = readWordRun(index2);
    if (firstTo > index2) {
      if (rule.phrase !== void 0) {
        const segments = readSegments(index2, Math.max(rule.phrase.max ?? 4, 1));
        for (let count = segments.length; count >= 1; count -= 1) {
          const texts = segments.slice(0, count).map((segment) => source.slice(segment.from, segment.to));
          const candidate = texts.join(" ");
          if (words.set.has(fold(candidate))) {
            const last = segments[count - 1];
            if (last !== void 0) return { to: last.to, member: candidate };
          }
        }
      } else {
        const candidate = source.slice(index2, firstTo);
        if (words.set.has(fold(candidate))) return { to: firstTo, member: candidate };
      }
    }
    for (const member of words.literal) {
      if (rule.phrase !== void 0 && /\s/.test(member)) continue;
      if (source.startsWith(member, index2)) return { to: index2 + member.length, member };
    }
    return void 0;
  };
  const anyRuleClaims = (index2, previous) => {
    const openRegion = openRegions[openRegions.length - 1];
    if (openRegion !== void 0) {
      const endMatch = execAt(sticky(openRegion.rule.end), source, index2);
      if (endMatch !== null && endMatch[0].length > 0) return true;
    }
    for (const rule of rules) {
      if (!contextHolds(rule.when, index2, previous)) continue;
      if (rule.kind === "region") {
        const match2 = execAt(sticky(rule.begin), source, index2);
        if (match2 !== null && match2[0].length > 0) return true;
        continue;
      }
      if (rule.kind === "words") {
        if (matchWords(rule, resolveWords(rule.words), index2) !== void 0) return true;
        if (rule.unknown !== void 0 && readWordRun(index2) > index2) return true;
        continue;
      }
      const match = execAt(sticky(rule.pattern), source, index2);
      if (match !== null && match[0].length > 0) return true;
    }
    return false;
  };
  const openRegions = [];
  let index = 0;
  while (index < length) {
    const open = openRegions[openRegions.length - 1];
    if (open !== void 0) {
      const endMatch = execAt(sticky(open.rule.end), source, index);
      if (endMatch !== null && endMatch[0].length > 0) {
        const closeScope = scopeOf(
          open.rule.closeScope ?? open.rule.scope,
          ruleMatch(endMatch[0], index, [...endMatch]),
          open.scope
        );
        push(closeScope, index, index + endMatch[0].length, open.scope);
        index += endMatch[0].length;
        openRegions.pop();
        regionScope = openRegions[openRegions.length - 1]?.scope;
        continue;
      }
      if (open.rule.transparent !== true) {
        if (open.rule.nested === true) {
          const inner = execAt(sticky(open.rule.begin), source, index);
          if (inner !== null && inner[0].length > 0) {
            const innerMatch = ruleMatch(inner[0], index, [...inner]);
            push(
              scopeOf(open.rule.openScope ?? open.rule.scope, innerMatch, open.scope),
              index,
              index + inner[0].length,
              open.scope
            );
            openRegions.push({
              rule: open.rule,
              scope: open.scope,
              beginFrom: index,
              beginTo: index + inner[0].length
            });
            index += inner[0].length;
            continue;
          }
        }
        push(open.scope, index, index + 1, open.scope);
        index += 1;
        continue;
      }
    }
    let matched = false;
    for (const rule of rules) {
      if (!contextHolds(rule.when, index, previousScope)) continue;
      if (rule.kind === "region") {
        const begin = execAt(sticky(rule.begin), source, index);
        if (begin === null || begin[0].length === 0) continue;
        const beginMatch = ruleMatch(begin[0], index, [...begin]);
        const scope = scopeOf(rule.scope, beginMatch, "text");
        const openScope = scopeOf(rule.openScope ?? rule.scope, beginMatch, scope);
        const contentScope = scopeOf(rule.contentScope ?? rule.scope, beginMatch, scope);
        const closeScope = scopeOf(rule.closeScope ?? rule.scope, beginMatch, scope);
        const beginEnd = index + begin[0].length;
        push(openScope, index, beginEnd, regionScope);
        if (rule.nested === true || rule.transparent === true) {
          openRegions.push({ rule, scope: contentScope, beginFrom: index, beginTo: beginEnd });
          regionScope = contentScope;
          index = beginEnd;
          matched = true;
          break;
        }
        const close = findRegionEnd(rule.end, source, beginEnd);
        if (close === void 0) {
          push(
            scopeOf(rule.unclosed?.scope === void 0 ? void 0 : rule.unclosed.scope, beginMatch, contentScope),
            beginEnd,
            length,
            scope
          );
          report({
            from: index,
            to: beginEnd,
            message: rule.unclosed?.message === void 0 ? `Unterminated ${scope}.` : typeof rule.unclosed.message === "function" ? rule.unclosed.message(beginMatch) : rule.unclosed.message,
            severity: rule.unclosed?.severity ?? "error",
            code: rule.unclosed?.code ?? "unclosed-region"
          });
          index = length;
          matched = true;
          break;
        }
        push(contentScope, beginEnd, close.from, scope);
        push(closeScope, close.from, close.to, scope);
        index = close.to;
        matched = true;
        break;
      }
      if (rule.kind === "words") {
        const words = resolveWords(rule.words);
        const vocabulary = asResolvedVocabulary(rule.words);
        const hit = matchWords(rule, words, index);
        if (hit !== void 0) {
          const text = source.slice(index, hit.to);
          const match2 = ruleMatch(text, index, [text]);
          const scope = rule.scope !== void 0 ? scopeOf(rule.scope, match2, "word") : vocabulary?.scopeFor !== void 0 ? vocabulary.scopeFor(hit.member) : "word";
          push(scope, index, hit.to, regionScope);
          index = hit.to;
          matched = true;
          break;
        }
        if (rule.unknown === void 0) continue;
        const candidateTo = readWordRun(index);
        if (candidateTo <= index) continue;
        const word = source.slice(index, candidateTo);
        const rejected = vocabulary?.reject?.(word, vocabularyContext);
        const message = rule.unknown.message === void 0 ? rejected?.message : typeof rule.unknown.message === "function" ? rule.unknown.message(word, ruleMatch(word, index, [word])) : rule.unknown.message.replace(/\{word\}/g, word).replace(/\{allowed\}/g, listPhrase(words.list));
        push(rule.unknown.scope ?? vocabulary?.unknownScope ?? "invalid", index, candidateTo, regionScope);
        if (message !== void 0) {
          report({
            from: index,
            to: candidateTo,
            message,
            severity: rule.unknown.severity ?? rejected?.severity ?? "error",
            code: rule.unknown.code ?? rejected?.code ?? "unknown-word"
          });
        }
        index = candidateTo;
        matched = true;
        break;
      }
      const match = execAt(sticky(rule.pattern), source, index);
      if (match === null || match[0].length === 0) continue;
      const matchInfo = ruleMatch(match[0], index, [...match]);
      push(scopeOf(rule.scope, matchInfo, fallbackScope), index, index + match[0].length, regionScope);
      index += match[0].length;
      matched = true;
      break;
    }
    if (matched) continue;
    const unclaimed = regionScope ?? fallbackScope;
    let to = index;
    let runPrevious = previousScope;
    while (to < length) {
      const char = source.charAt(to);
      if (char === "\n" || char === "\r") break;
      if (anyRuleClaims(to, runPrevious)) break;
      if (/\S/.test(char)) runPrevious = unclaimed;
      to += 1;
    }
    push(unclaimed, index, Math.max(to, index + 1), regionScope);
    index = Math.max(to, index + 1);
  }
  for (let frame = openRegions.length - 1; frame >= 0; frame -= 1) {
    const open = openRegions[frame];
    if (open === void 0) continue;
    const message = open.rule.unclosed?.message === void 0 ? `Unterminated ${open.scope}.` : typeof open.rule.unclosed.message === "function" ? open.rule.unclosed.message(ruleMatch("", open.beginFrom, [""])) : open.rule.unclosed.message;
    report({
      from: open.beginFrom,
      to: open.beginTo,
      message,
      severity: open.rule.unclosed?.severity ?? "error",
      code: open.rule.unclosed?.code ?? "unclosed-region"
    });
  }
  return { tokens, diagnostics, state };
}
function findRegionEnd(pattern, source, from) {
  const probe = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, "")}g`);
  probe.lastIndex = from;
  const match = probe.exec(source);
  if (match === null || match[0].length === 0) return void 0;
  return { from: match.index, to: match.index + match[0].length };
}

// src/core/inspect.ts
function runChecks(source, grammar, tokens, state) {
  const checks = grammar.grammar.checks;
  if (checks === void 0 || checks.length === 0) return [];
  const diagnostics = [];
  const context = { text: source, state };
  for (const check of checks) {
    const members = check.allow === void 0 ? void 0 : resolveWordsSource(check.allow, context);
    const vocabulary = check.allow === void 0 ? void 0 : check.allow;
    const caseSensitive = typeof vocabulary === "object" && vocabulary !== null && !Array.isArray(vocabulary) ? vocabulary.caseSensitive === true : false;
    const fold = (word) => caseSensitive ? word : word.toLowerCase();
    const set = members === void 0 ? void 0 : new Set(members.map((member) => fold(member)));
    const reportedLines = /* @__PURE__ */ new Set();
    for (const token of tokens) {
      if (token.text.trim() === "") continue;
      if (!check.scopes.includes("*") && !check.scopes.includes(token.scope)) continue;
      if (check.except !== void 0 && check.except.test(token.text)) continue;
      if (set !== void 0 && set.has(fold(token.text))) continue;
      if (check.perLine === true) {
        if (reportedLines.has(token.line)) continue;
        reportedLines.add(token.line);
      }
      diagnostics.push({
        from: token.from,
        to: token.to,
        severity: check.severity ?? "error",
        message: check.message.replace(/\{word\}/g, token.text).replace(/\{allowed\}/g, listPhrase(members ?? [])),
        code: check.code,
        detail: check.detail,
        source: grammar.grammar.id
      });
    }
  }
  return diagnostics;
}
function inspect(source, grammar) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const scanned = scan(source, resolved);
  const declared = resolved.grammar;
  const diagnostics = [...scanned.diagnostics];
  diagnostics.push(...runChecks(source, resolved, scanned.tokens, scanned.state));
  if (declared.validate !== void 0) {
    const context = {
      text: source,
      tokens: scanned.tokens,
      state: scanned.state,
      report: (problem) => {
        diagnostics.push({
          from: problem.from,
          to: problem.to,
          severity: problem.severity ?? "error",
          message: problem.message,
          code: problem.code ?? "validate",
          detail: problem.detail,
          source: declared.id
        });
      }
    };
    declared.validate(context);
  }
  const decorations = declared.decorate === void 0 ? [] : [...declared.decorate(source, scanned.state)];
  return {
    text: source,
    tokens: scanned.tokens,
    diagnostics: normalizeDiagnostics(diagnostics),
    decorations: normalizeDecorations(decorations, source.length),
    state: scanned.state
  };
}
function normalizeDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.from}:${diagnostic.to}:${diagnostic.code ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  return out.sort((left, right) => left.from - right.from || left.to - right.to);
}
function normalizeDecorations(decorations, length) {
  const out = [];
  for (const decoration of decorations) {
    const from = Math.max(0, Math.min(decoration.from, length));
    const to = Math.max(from, Math.min(decoration.to, length));
    if (to <= from) continue;
    out.push({ ...decoration, from, to });
  }
  return out.sort((left, right) => left.from - right.from || left.to - right.to);
}

// src/core/segments.ts
var SEVERITY_RANK = { error: 4, warning: 3, info: 2, hint: 1 };
function buildSegments(text, input, fallbackScope = "text") {
  const length = text.length;
  if (length === 0) return [];
  const cuts = /* @__PURE__ */ new Set([0, length]);
  for (const token of input.tokens) {
    cuts.add(Math.max(0, Math.min(token.from, length)));
    cuts.add(Math.max(0, Math.min(token.to, length)));
  }
  for (const decoration of input.decorations) {
    cuts.add(Math.max(0, Math.min(decoration.from, length)));
    cuts.add(Math.max(0, Math.min(decoration.to, length)));
  }
  for (const diagnostic of input.diagnostics) {
    cuts.add(Math.max(0, Math.min(diagnostic.from, length)));
    cuts.add(Math.max(0, Math.min(diagnostic.to, length)));
  }
  const bounds = [...cuts].sort((left, right) => left - right);
  const segments = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index] ?? 0;
    const to = bounds[index + 1] ?? 0;
    if (to <= from) continue;
    const scope = coverScope(input.tokens, from, fallbackScope);
    const decorations = coverDecorations(input.decorations, from, to);
    const severity = coverSeverity(input.diagnostics, from, to);
    const title = input.decorations.find(
      (decoration) => decoration.title !== void 0 && from >= decoration.from && to <= decoration.to
    )?.title;
    const last = segments[segments.length - 1];
    if (last !== void 0 && last.scope === scope && last.severity === severity && last.title === title && sameList(last.decorations, decorations)) {
      last.to = to;
      last.text = text.slice(last.from, to);
      continue;
    }
    segments.push({ from, to, text: text.slice(from, to), scope, decorations, severity, title });
  }
  return segments;
}
function coverScope(tokens, offset, fallback) {
  for (const token of tokens) {
    if (token.from > offset) break;
    if (offset >= token.from && offset < token.to) return token.scope;
  }
  return fallback;
}
function coverDecorations(decorations, from, to) {
  const kinds = [];
  for (const decoration of decorations) {
    if (decoration.from <= from && to <= decoration.to) kinds.push(decoration.kind);
  }
  return kinds;
}
function coverSeverity(diagnostics, from, to) {
  let loudest;
  for (const diagnostic of diagnostics) {
    if (diagnostic.from > from || diagnostic.to < to) continue;
    if (loudest === void 0 || SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[loudest]) {
      loudest = diagnostic.severity;
    }
  }
  return loudest;
}
function sameList(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
function segmentClasses(segment, scopeClass2, decorationClass2, severityClass2) {
  const classes = [scopeClass2(segment.scope)];
  for (const kind of segment.decorations) classes.push(decorationClass2(kind));
  if (segment.severity !== void 0) classes.push(severityClass2(segment.severity));
  return classes;
}

// src/core/rank.ts
var TIER_STRIDE = 1e6;
var TIER = {
  /** The needle is the label, in the same case. */
  exact: 5,
  /** The needle is the label, ignoring case. */
  exactFold: 4,
  /** The label starts with the needle. */
  prefix: 3,
  /**
   * Every needle character either starts a word or continues one the match has
   * already started. This is what makes initials work: `fm` finds `Fira Mono` and
   * `IPM` finds `IBM Plex Mono`, without `IPM` being a substring of anything.
   */
  boundary: 2,
  /** The needle appears as one unbroken run inside the label. */
  substring: 1,
  /** The needle's characters appear in order, with gaps. */
  subsequence: 0
};
var SEPARATORS = /[\s\-_./:@()+[\]]/;
function isWordStart(label, index) {
  if (index <= 0) return index === 0;
  const previous = label.charAt(index - 1);
  if (SEPARATORS.test(previous)) return true;
  const current = label.charAt(index);
  return previous === previous.toLowerCase() && current !== current.toLowerCase();
}
function wantsExactCase(needle) {
  return needle !== needle.toLowerCase();
}
function localScore(label, needle, indices, exactCase) {
  let score = 0;
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position];
    if (index === void 0) continue;
    if (index === 0) score += 24;
    else if (isWordStart(label, index)) score += 14;
    if (position > 0 && index === (indices[position - 1] ?? -2) + 1) score += 10;
    if (exactCase && label.charAt(index) === needle.charAt(position)) score += 4;
  }
  const first = indices[0] ?? 0;
  const last = indices[indices.length - 1] ?? 0;
  score -= (last - first + 1 - needle.length) * 1.5;
  score -= first * 2;
  score -= label.length * 0.05;
  return score;
}
function fuzzyMatch(needle, label) {
  if (needle === "") return { score: 0, indices: [], tier: 0 };
  const exactCase = wantsExactCase(needle);
  const haystack = exactCase ? label : label.toLowerCase();
  const query = exactCase ? needle : needle.toLowerCase();
  if (label === needle) {
    return { score: TIER.exact * TIER_STRIDE + localScore(label, needle, range(needle.length), true), indices: range(needle.length), tier: TIER.exact };
  }
  if (label.toLowerCase() === query) {
    const indices = range(needle.length);
    return {
      score: TIER.exactFold * TIER_STRIDE + localScore(label, needle, indices, exactCase),
      indices,
      tier: TIER.exactFold
    };
  }
  if (haystack.startsWith(query)) {
    const indices = range(needle.length);
    return {
      score: TIER.prefix * TIER_STRIDE + localScore(label, needle, indices, exactCase),
      indices,
      tier: TIER.prefix
    };
  }
  let best;
  const consider = (candidate) => {
    if (best === void 0 || candidate.score > best.score) best = candidate;
  };
  for (let at = haystack.indexOf(query); at >= 0; at = haystack.indexOf(query, at + 1)) {
    const indices = range(needle.length, at);
    const tier = isWordStart(label, at) ? TIER.boundary : TIER.substring;
    consider({ score: tier * TIER_STRIDE + localScore(label, needle, indices, exactCase), indices, tier });
  }
  for (let start = 0; start < haystack.length; start += 1) {
    if (haystack.charAt(start) !== query.charAt(0)) continue;
    const indices = [start];
    let cursor = start + 1;
    let complete2 = true;
    for (let position = 1; position < query.length; position += 1) {
      const found = haystack.indexOf(query.charAt(position), cursor);
      if (found < 0) {
        complete2 = false;
        break;
      }
      indices.push(found);
      cursor = found + 1;
    }
    if (!complete2) continue;
    const tier = indicesAreBoundaryish(label, indices) ? TIER.boundary : TIER.subsequence;
    consider({ score: tier * TIER_STRIDE + localScore(label, needle, indices, exactCase), indices, tier });
  }
  return best;
}
function indicesAreBoundaryish(label, indices) {
  for (let position = 0; position < indices.length; position += 1) {
    const index = indices[position];
    if (index === void 0) continue;
    if (isWordStart(label, index)) continue;
    if (position > 0 && index === (indices[position - 1] ?? -2) + 1) continue;
    return false;
  }
  return true;
}
function range(count, from = 0) {
  const out = [];
  for (let index = 0; index < count; index += 1) out.push(from + index);
  return out;
}
function rank(items, needle, options) {
  const out = [];
  for (const item of items) {
    if (needle === "") {
      out.push({ item, score: 0, indices: [] });
      continue;
    }
    const label = options.label(item);
    const subject = options.filterText?.(item) ?? label;
    const match = fuzzyMatch(needle, subject);
    if (match === void 0) continue;
    out.push({ item, score: match.score, indices: subject === label ? match.indices : [] });
  }
  if (options.sortText === void 0) {
    out.sort((left, right) => right.score - left.score);
    return out;
  }
  return out.sort((left, right) => {
    const leftKey = options.sortText?.(left.item) ?? options.label(left.item);
    const rightKey = options.sortText?.(right.item) ?? options.label(right.item);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : right.score - left.score;
  });
}
function highlightSegments(label, indices) {
  if (indices.length === 0) return label === "" ? [] : [{ text: label, matched: false }];
  const marked = new Set(indices);
  const segments = [];
  let current;
  for (let index = 0; index < label.length; index += 1) {
    const matched = marked.has(index);
    if (current === void 0 || current.matched !== matched) {
      if (current !== void 0) segments.push(current);
      current = { text: "", matched };
    }
    current.text += label.charAt(index);
  }
  if (current !== void 0) segments.push(current);
  return segments;
}

// src/core/complete.ts
var DEFAULT_LIMIT = 100;
function complete(inspection, grammar, request) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const sources = resolved.grammar.compose;
  if (sources === void 0 || sources.length === 0) return void 0;
  const text = request.text;
  const caret = clamp(request.caret, 0, text.length);
  const context = completionContext(inspection, resolved, caret, request.trigger);
  const eligible = sources.filter((source) => source.when === void 0 || source.when(context));
  if (eligible.length === 0) return void 0;
  const ordered = [...eligible].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const reopening = request.previousSourceId === void 0 ? void 0 : ordered.find((source) => source.id === request.previousSourceId);
  const winner = reopening ?? ordered[0];
  if (winner === void 0) return void 0;
  const range2 = resolveRange(winner, context);
  const merged = [...winner.items(context)];
  for (const source of ordered) {
    if (source === winner || source.merge !== true) continue;
    merged.push(...source.items(context));
  }
  if (merged.length === 0) return void 0;
  const needleFrom = clamp(range2.from, 0, caret);
  const needleTo = clamp(caret, needleFrom, Math.max(range2.to, needleFrom));
  const needle = text.slice(needleFrom, needleTo);
  const ranked = rank(merged, needle, {
    label: (item) => item.label,
    ...merged.some((item) => item.filterText !== void 0) ? { filterText: (item) => item.filterText ?? item.label } : {},
    ...merged.some((item) => item.sortText !== void 0) ? { sortText: (item) => item.sortText } : {}
  });
  const limit = request.limit ?? DEFAULT_LIMIT;
  return {
    range: range2,
    rows: ranked.slice(0, limit).map((entry) => ({
      item: entry.item,
      score: entry.score,
      indices: entry.indices
    })),
    needle,
    sourceId: winner.id
  };
}
function resolveRange(source, context) {
  if (typeof source.range !== "function") return source.range;
  const range2 = source.range(context);
  return {
    from: Math.min(range2.from, range2.to),
    to: Math.max(range2.from, range2.to)
  };
}
function completionContext(inspection, resolved, caret, trigger) {
  const { text, tokens, diagnostics, state } = inspection;
  const line = lineAt(text, caret, lineStarts(text));
  const lineTokens = tokensOnLine(tokens, line.number);
  const word = wordInfoAt(text, caret, resolved.wordChars);
  return {
    text,
    caret,
    word,
    line,
    tokens,
    diagnostics,
    state,
    scope: scopeAt(tokens, caret),
    scopeBefore: tokenBefore(tokens, caret)?.scope,
    // "First on line" means only whitespace precedes the caret, which is a question
    // about the caret and not about the token under it: a caret in the indentation of
    // a line that already has content is not first on that line. `lineTokens` is what
    // tells the difference, so the tokens are read even though the answer looks like a
    // string test.
    firstOnLine: line.before.trim() === "" && !lineTokens.some((token) => token.to <= caret),
    // "First word" additionally allows the rest of the word the caret is in, which is
    // what keeps a line-head completion alive while the head is being typed.
    firstWord: line.text.slice(0, Math.max(0, word.from - line.from)).trim() === "",
    firstToken: lineTokens[0],
    trigger
  };
}
function applyCompletion(text, range2, item) {
  const from = clamp(Math.min(range2.from, range2.to), 0, text.length);
  const to = clamp(Math.max(range2.from, range2.to), from, text.length);
  const insert = item.insert ?? item.label;
  const append = item.append ?? "";
  const offset = item.caretOffset ?? 0;
  if (item.mode === "before") {
    const head2 = text.slice(0, from);
    const gap = head2 !== "" && !/\s$/.test(head2) ? " " : "";
    const rest2 = text.slice(from).replace(/^\s+/, "");
    const written2 = `${gap}${insert}${redundant(append, rest2) ? "" : append}`;
    return {
      text: `${head2}${written2}${rest2}`,
      caret: head2.length + written2.length + offset,
      range: { from: head2.length, to: head2.length + written2.length },
      from,
      to: from,
      insert: written2
    };
  }
  const head = text.slice(0, from);
  const rest = text.slice(to);
  const written = `${insert}${redundant(append, rest) ? "" : append}`;
  return {
    text: `${head}${written}${rest}`,
    caret: head.length + written.length + offset,
    range: { from: head.length, to: head.length + written.length },
    from,
    to,
    insert: written
  };
}
function redundant(append, rest) {
  if (append === "") return true;
  return append.trim() === "" ? /^\s/.test(rest) : rest.startsWith(append);
}

// src/core/hover.ts
var SEVERITY_TITLE = {
  error: "Error",
  warning: "Warning",
  info: "Info",
  hint: "Hint"
};
function diagnosticHover(diagnostic) {
  return {
    kind: "diagnostic",
    title: SEVERITY_TITLE[diagnostic.severity],
    detail: diagnostic.source,
    body: diagnostic.detail === void 0 ? diagnostic.message : `${diagnostic.message}

${diagnostic.detail}`,
    range: { from: diagnostic.from, to: diagnostic.to }
  };
}
function resolveHover(inspection, grammar, offset) {
  const resolved = isResolvedGrammar(grammar) ? grammar : resolveGrammar(grammar);
  const { text, tokens, diagnostics, decorations, state } = inspection;
  let covering;
  for (const diagnostic of diagnostics) {
    if (!containsOffset(diagnostic, offset)) continue;
    if (covering === void 0 || diagnostic.to - diagnostic.from < covering.to - covering.from) {
      covering = diagnostic;
    }
  }
  if (covering !== void 0) return diagnosticHover(covering);
  const decoration = decorations.find((entry) => containsOffset(entry, offset));
  const described = describeAt(inspection, resolved, offset);
  if (decoration?.title !== void 0) {
    return {
      kind: "decoration",
      title: decoration.title,
      detail: described?.detail ?? described?.title,
      body: described?.body,
      range: { from: decoration.from, to: decoration.to }
    };
  }
  return described;
}
function describeAt(inspection, resolved, offset) {
  if (resolved.grammar.describe === void 0) return void 0;
  const { text, tokens, diagnostics, state } = inspection;
  const found = tokenAt(tokens, offset);
  const token = found === void 0 || found.text.trim() === "" ? void 0 : found;
  const context = {
    text,
    offset,
    token,
    word: wordInfoAt(text, offset, resolved.wordChars),
    line: lineAt(text, offset, lineStarts(text)),
    tokens,
    diagnostics,
    state
  };
  return resolved.grammar.describe(context) ?? void 0;
}

// src/core/grammar.ts
function defineGrammar(grammar) {
  return grammar;
}
function defineCompletion(source) {
  return source;
}

// src/styles.ts
var SCOPE_PALETTE = [
  { scope: "text", light: "var(--litearea-fg)" },
  { scope: "word", light: "var(--litearea-fg)" },
  { scope: "family", light: "var(--litearea-fg)" },
  { scope: "family-generic", light: "#7c3aed", dark: "#c4a2ff" },
  { scope: "family-unknown", light: "var(--litearea-warning)" },
  { scope: "family-unclosed", light: "var(--litearea-error)" },
  { scope: "weight", light: "var(--litearea-accent)" },
  { scope: "weight-missing", light: "var(--litearea-warning)" },
  { scope: "state", light: "var(--litearea-accent)" },
  { scope: "property", light: "#7c3aed", dark: "#c4a2ff" },
  { scope: "operator", light: "var(--litearea-fg-dim)" },
  { scope: "separator", light: "var(--litearea-fg-dim)" },
  { scope: "value-shape", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-color", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-pattern", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-motion", light: "#0f766e", dark: "#5eead4" },
  { scope: "value-number", light: "#b45309", dark: "#fbbf24" },
  { scope: "comment", light: "var(--litearea-fg-dim)" },
  { scope: "invalid", light: "var(--litearea-error)" },
  { scope: "keyword", light: "var(--litearea-accent)" },
  { scope: "string", light: "#0f766e", dark: "#5eead4" },
  { scope: "number", light: "#b45309", dark: "#fbbf24" }
];
function scopeVariables(scheme) {
  return SCOPE_PALETTE.filter((entry) => scheme === "light" || entry.dark !== void 0).map((entry) => {
    const value = scheme === "light" ? entry.light : entry.dark;
    return `  --litearea-scope-${entry.scope}: ${String(value)};`;
  }).join("\n");
}
function scopeRules() {
  return SCOPE_PALETTE.map(
    (entry) => `.litearea-scope-${entry.scope} { color: var(--litearea-scope-${entry.scope}); }`
  ).join("\n");
}
var LITEAREA_STYLES = `
.litearea {
  --litearea-font: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --litearea-font-size: 13px;
  --litearea-line-height: 20px;
  --litearea-padding-block: 6px;
  --litearea-padding-inline: 10px;
  --litearea-radius: 8px;
  --litearea-fg: #1f2328;
  --litearea-fg-dim: #6b7280;
  --litearea-fg-strong: #111827;
  --litearea-bg: #ffffff;
  --litearea-bg-raised: #ffffff;
  --litearea-border: #d8dbe0;
  --litearea-border-focus: #4d6bfe;
  --litearea-accent: #4d6bfe;
  --litearea-accent-soft: rgba(77, 107, 254, 0.12);
  --litearea-selection: rgba(77, 107, 254, 0.22);
  --litearea-error: #e5484d;
  --litearea-warning: #d97706;
  --litearea-info: #4d6bfe;
  --litearea-hint: #8b8f97;
  --litearea-shadow: 0 6px 24px rgba(15, 23, 42, 0.14);

${scopeVariables("light")}

  position: relative;
  display: block;
  color: var(--litearea-fg);
}

@media (prefers-color-scheme: dark) {
  .litearea {
    --litearea-fg: #e6e8eb;
    --litearea-fg-dim: #8b919b;
    --litearea-fg-strong: #ffffff;
    --litearea-bg: #1b1e24;
    --litearea-bg-raised: #23262c;
    --litearea-border: #363b44;
${scopeVariables("dark")}
    --litearea-error: #ff6b6b;
    --litearea-warning: #f59e0b;
    --litearea-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
}

/* \u2500\u2500 the box \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.litearea-box {
  position: relative;
  display: block;
  border: 1px solid var(--litearea-border);
  border-radius: var(--litearea-radius);
  background: var(--litearea-bg);
  transition: border-color 120ms ease;
}

.litearea-box:focus-within {
  border-color: var(--litearea-border-focus);
}

.litearea-invalid .litearea-box {
  border-color: var(--litearea-error);
}

/*
 * The layer and the field share this rule and nothing may be added to one alone.
 * Every property here is a property the mirror copies too \u2014 three elements, one
 * typography, or the paint drifts.
 */
.litearea-layer,
.litearea-input {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: var(--litearea-padding-block) var(--litearea-padding-inline);
  border: none;
  font-family: var(--litearea-font);
  font-size: var(--litearea-font-size);
  font-weight: 400;
  font-style: normal;
  font-stretch: normal;
  font-variant-ligatures: none;
  font-kerning: none;
  font-feature-settings: "liga" 0, "calt" 0, "dlig" 0;
  line-height: var(--litearea-line-height);
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  text-indent: 0;
  text-align: left;
  direction: ltr;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.litearea-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

/*
 * When the box is clamped to its maximum height the field grows a scrollbar, and a
 * scrollbar narrows the text. If the layer kept the full width it would wrap
 * differently from the field and every colour would slide off its character, so the
 * field's measured scrollbar width is published as --litearea-scrollbar and added
 * here. The value is 0 whenever no scrollbar is shown.
 */
.litearea-layer {
  padding-right: calc(var(--litearea-padding-inline) + var(--litearea-scrollbar, 0px));
}

.litearea-paint {
  position: relative;
  min-height: 100%;
  /* A zero-width space keeps the layer's last line box as tall as the field's:
     a trailing newline would otherwise collapse in the paint alone, and the box
     would jump the moment one was typed. */
  will-change: transform;
}

.litearea-input {
  position: relative;
  display: block;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--litearea-fg);
  outline: none;
  overflow-y: hidden;
}

.litearea-growable .litearea-input {
  resize: none;
}

.litearea-resizable .litearea-input {
  resize: vertical;
}

.litearea-input::placeholder {
  color: var(--litearea-fg-dim);
}

.litearea-input::selection {
  background: var(--litearea-selection);
}

.litearea-readonly .litearea-input {
  caret-color: transparent;
}

/*
 * The rules that spend the variables, generated from the same list that declares them. There is
 * deliberately NO catch-all rule setting a property on every painted span: there was one, and a
 * class plus an element outranks a bare class on specificity, so it silently switched off every
 * squiggle in the library.
 *
 * A scope that is not in the list gets no colour from here, and a host writing a grammar of its
 * own styles it with a plain rule \u2014 .litearea-scope-my-thing { color: \u2026 } \u2014 since nothing in
 * this file competes for that selector.
 */
${scopeRules()}

.litearea-dec-effective {
  border-radius: 3px;
  background: var(--litearea-accent-soft);
  box-shadow: 0 0 0 1px var(--litearea-accent-soft);
}

/* The four shapes a diagnostic can take. Wavy for the two that mean "fix this", dotted for
   the two that mean "worth knowing" \u2014 the same distinction VSCode draws, and the reason
   severity is a class rather than an inline colour. */
.litearea-diag-error {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--litearea-error);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-warning {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--litearea-warning);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-info {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--litearea-info);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

.litearea-diag-hint {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--litearea-hint);
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}

/* \u2500\u2500 the completion list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

/*
 * The container holds two things and scrolls NEITHER of them: the list scrolls itself, and the
 * documentation is pinned below it. Putting the documentation inside the scroll range \u2014 which is
 * what this used to do \u2014 makes it unreachable with a long list and a long explanation: the
 * arrows move the active row rather than the scrollbar, so a keyboard user never sees it, and a
 * mouse user has to scroll down to read it and back up to reach the next row.
 */
.litearea-popup {
  position: absolute;
  z-index: 30;
  display: none;
  flex-direction: column;
  max-width: 460px;
  padding: 4px;
  border: 1px solid var(--litearea-border);
  border-radius: 10px;
  background: var(--litearea-bg-raised);
  box-shadow: var(--litearea-shadow);
  font-family: var(--litearea-font);
  font-size: 12px;
  line-height: 18px;
  color: var(--litearea-fg);
  overflow: hidden;
}

.litearea-popup[data-open="true"] {
  display: flex;
}

/* The rows, and the only part that scrolls. Its height is bounded so the documentation below
   always has somewhere to live. */
.litearea-list {
  min-height: 0;
  max-height: 208px;
  overflow-y: auto;
}

/*
 * The explanation, pinned. Its own height is bounded and it scrolls ITSELF, so a long
 * explanation stays readable while the rows stay put \u2014 and arrowing to the next row swaps the
 * text in place instead of requiring a scroll back up.
 */
.litearea-docs {
  flex: none;
  max-height: 132px;
  overflow-y: auto;
  margin: 4px -4px -4px;
  padding: 6px 10px;
  border-top: 1px solid var(--litearea-border);
  background: var(--litearea-bg);
  border-radius: 0 0 10px 10px;
  color: var(--litearea-fg);
  white-space: pre-wrap;
}

.litearea-popup[data-docs="false"] .litearea-docs {
  display: none;
}

.litearea-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.litearea-row[aria-selected="true"] {
  background: var(--litearea-accent-soft);
}

.litearea-rowKind {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--litearea-fg-dim);
  transform: translateY(-1px);
}

.litearea-kind-family { background: var(--litearea-scope-family-generic); }
.litearea-kind-generic { background: var(--litearea-scope-family-generic); }
.litearea-kind-weight { background: var(--litearea-scope-weight); }
.litearea-kind-state { background: var(--litearea-scope-state); }
.litearea-kind-property { background: var(--litearea-scope-property); }
.litearea-kind-value { background: var(--litearea-scope-value-shape); }
.litearea-kind-number { background: var(--litearea-scope-value-number); }
.litearea-kind-custom { background: var(--litearea-fg-dim); }

.litearea-rowLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.litearea-rowMatch {
  color: var(--litearea-accent);
  font-weight: 600;
}

.litearea-rowDetail {
  flex: none;
  color: var(--litearea-fg-dim);
  font-size: 11px;
}

.litearea-docsTitle {
  font-weight: 600;
}

.litearea-docsDetail {
  color: var(--litearea-fg-dim);
}

.litearea-docsBody {
  margin-top: 2px;
  color: var(--litearea-fg-dim);
}

/* \u2500\u2500 the hover tooltip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.litearea-tooltip {
  position: absolute;
  z-index: 40;
  display: none;
  max-width: 340px;
  padding: 6px 10px;
  border: 1px solid var(--litearea-border);
  border-radius: 8px;
  background: var(--litearea-bg-raised);
  box-shadow: var(--litearea-shadow);
  font-family: var(--litearea-font);
  font-size: 11px;
  line-height: 16px;
  color: var(--litearea-fg);
  pointer-events: none;
  white-space: pre-wrap;
}

.litearea-tooltip[data-open="true"] {
  display: block;
}

.litearea-tooltipTitle {
  font-weight: 600;
}

.litearea-tooltipDetail {
  color: var(--litearea-fg-dim);
}

.litearea-tooltipBody {
  margin-top: 3px;
  color: var(--litearea-fg-dim);
}

.litearea-srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`.trim();
function injectStyles(ownerDocument, nonce) {
  if (ownerDocument === null || ownerDocument === void 0) return void 0;
  const existing = ownerDocument.querySelector("style[data-litearea-styles]");
  if (existing !== null) return existing;
  const style = ownerDocument.createElement("style");
  style.dataset.liteareaStyles = "";
  if (nonce !== void 0) style.nonce = nonce;
  style.textContent = LITEAREA_STYLES;
  const head = ownerDocument.head ?? ownerDocument.documentElement;
  if (head === null || head === void 0) return void 0;
  head.appendChild(style);
  return style;
}
function scopeClass(scope) {
  const folded = scope.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return folded === "" ? "litearea-scope-text" : `litearea-scope-${folded}`;
}
function decorationClass(kind) {
  return `litearea-dec-${kind.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}
function severityClass(severity) {
  return `litearea-diag-${severity.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

// src/dom/support.ts
function hasDocument() {
  return typeof document !== "undefined" && document !== null;
}
function canEditThroughPipeline() {
  return hasDocument() && typeof document.execCommand === "function";
}
function hasCaretHitTest() {
  if (!hasDocument()) return false;
  const probe = document;
  return typeof probe.caretPositionFromPoint === "function" || typeof probe.caretRangeFromPoint === "function";
}
function offsetFromPoint(x, y) {
  if (!hasDocument()) return void 0;
  const probe = document;
  if (typeof probe.caretPositionFromPoint === "function") {
    const position = probe.caretPositionFromPoint(x, y);
    if (position !== null && position !== void 0) return position.offset;
    return void 0;
  }
  if (typeof probe.caretRangeFromPoint === "function") {
    const range2 = probe.caretRangeFromPoint(x, y);
    if (range2 !== null && range2 !== void 0) return range2.startOffset;
  }
  return void 0;
}
function withDefaults(defaults, given) {
  if (given === void 0) return { ...defaults };
  const merged = { ...defaults };
  for (const key of Object.keys(given)) {
    const value = given[key];
    if (value !== void 0) merged[key] = value;
  }
  return merged;
}

// src/dom/editing.ts
function readSelection(field) {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? start;
  return { start, end };
}
function writeSelection(field, start, end = start) {
  const length = field.value.length;
  const from = clamp(Math.min(start, end), 0, length);
  const to = clamp(Math.max(start, end), from, length);
  field.setSelectionRange(from, to);
}
function fieldLineHeight(field) {
  const styles = field.ownerDocument.defaultView?.getComputedStyle(field);
  if (styles === null || styles === void 0) return 0;
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.2 : 0;
}
function replaceThroughPipeline(field, from, to, text) {
  const start = clamp(Math.min(from, to), 0, field.value.length);
  const end = clamp(Math.max(from, to), start, field.value.length);
  if (start === end && text === "") return "unchanged";
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  writeSelection(field, start, end);
  const before = field.value;
  if (canEditThroughPipeline()) {
    try {
      field.ownerDocument.execCommand("insertText", false, text);
    } catch {
    }
    if (field.value !== before) return "pipeline";
  }
  field.setRangeText(text, start, end, "end");
  if (field.value === before) return "unchanged";
  dispatchInput(field, text);
  return "direct";
}
function dispatchInput(field, text) {
  const view = field.ownerDocument.defaultView;
  const InputEventCtor = view === null ? void 0 : view.InputEvent;
  if (typeof InputEventCtor === "function") {
    field.dispatchEvent(
      new InputEventCtor("input", { bubbles: true, inputType: "insertText", data: text })
    );
    return;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
function undoField(field) {
  if (!canEditThroughPipeline()) return false;
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  try {
    return field.ownerDocument.execCommand("undo");
  } catch {
    return false;
  }
}
function redoField(field) {
  if (!canEditThroughPipeline()) return false;
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  try {
    return field.ownerDocument.execCommand("redo");
  } catch {
    return false;
  }
}
function writeDocument(field, next, preserveHistory = false) {
  if (field.value === next) return "unchanged";
  if (preserveHistory) return replaceThroughPipeline(field, 0, field.value.length, next);
  field.value = next;
  writeSelection(field, next.length, next.length);
  return "direct";
}

// src/dom/mirror.ts
var COPIED_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "fontVariantLigatures",
  "fontKerning",
  "fontFeatureSettings",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textAlign",
  "direction",
  "tabSize",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "hyphens",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "boxSizing"
];
var SENTINEL = "\u200B";
var TextMirror = class {
  /** The measuring element. Kept out of the document's flow by `position: fixed`. */
  element;
  document;
  view;
  /** The field this mirror is currently shaped like. */
  adopted;
  /** The line height measured with the field, or 0 before the first measurement. */
  measuredLineHeight = 0;
  /**
   * @param ownerDocument - the document to create the element in.
   */
  constructor(ownerDocument) {
    this.document = ownerDocument;
    this.view = ownerDocument.defaultView ?? void 0;
    this.element = ownerDocument.createElement("div");
    this.element.setAttribute("aria-hidden", "true");
    this.element.dataset.liteareaPart = "mirror";
    this.element.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "visibility:hidden",
      "pointer-events:none",
      "z-index:-1",
      "margin:0",
      "overflow:hidden",
      "white-space:pre-wrap",
      "overflow-wrap:break-word",
      "word-break:break-word",
      "box-sizing:border-box"
    ].join(";");
  }
  /** Whether the mirror is in a document. */
  get mounted() {
    return this.element.isConnected;
  }
  /**
   * Mount the mirror, once, so measurements have a layout to read.
   * @param parent - where to mount it. The body is right unless the document has none.
   */
  mount(parent) {
    if (this.mounted) return;
    const host = parent ?? this.document.body ?? this.document.documentElement;
    if (host === null || host === void 0) return;
    host.appendChild(this.element);
  }
  /**
   * Shape the mirror like a field.
   *
   * The width is the interesting part. It has to be the field's CONTENT width, or
   * text wraps in one and not the other — and the field's `clientWidth` is its
   * content plus padding but NOT its border, while the mirror is `border-box`. So
   * the borders are added back, and what is deliberately left out is the
   * scrollbar: a field clamped to its maximum height has one, and the text wraps
   * inside the narrower area above it.
   * @param field - the textarea to imitate.
   */
  adopt(field) {
    this.mount();
    this.adopted = field;
    const view = this.view;
    if (view === null || view === void 0) return;
    const styles = view.getComputedStyle(field);
    for (const property of COPIED_PROPERTIES) {
      this.element.style.setProperty(
        property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
        styles.getPropertyValue(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
      );
    }
    const borderLeft = Number.parseFloat(styles.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(styles.borderRightWidth) || 0;
    this.element.style.width = `${String(field.clientWidth + borderLeft + borderRight)}px`;
    this.measuredLineHeight = 0;
  }
  /**
   * The line height in force, measured rather than assumed.
   *
   * `line-height: normal` is a real value and a common one, and it cannot be read
   * as a number — `parseFloat('normal')` is `NaN`. So it is measured by laying one
   * line of text out and taking the height, which is also the only way to be right
   * about a font whose normal leading is not 1.2.
   * @param field - the field to measure against.
   * @returns the line height in pixels.
   */
  lineHeight(field) {
    if (this.measuredLineHeight > 0) return this.measuredLineHeight;
    const view = this.view;
    if (view === null || view === void 0) return 0;
    const styles = view.getComputedStyle(field);
    const declared = Number.parseFloat(styles.lineHeight);
    if (Number.isFinite(declared) && declared > 0) {
      this.measuredLineHeight = declared;
      return declared;
    }
    this.adopt(field);
    this.setText("M");
    const padding = this.verticalPadding();
    const height = this.element.getBoundingClientRect().height - padding;
    const fontSize = Number.parseFloat(styles.fontSize);
    const fallback = (Number.isFinite(fontSize) ? fontSize : 16) * 1.2;
    this.measuredLineHeight = height > 0 ? height : fallback;
    return this.measuredLineHeight;
  }
  /** The mirror's vertical padding plus border, which every height includes. */
  verticalPadding() {
    const view = this.view;
    if (view === null || view === void 0) return 0;
    const styles = view.getComputedStyle(this.element);
    const sum = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0) + (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
    return sum;
  }
  /**
   * Put text in the mirror with nothing else in it.
   * @param text - the content.
   */
  setText(text) {
    this.element.textContent = text;
  }
  /**
   * The height a field needs to show a document without scrolling.
   *
   * The trailing-newline problem is handled here. A div with `white-space:
   * pre-wrap` and content ending in `\n` does not lay out a final empty line — the
   * newline breaks the line but nothing follows it — so the measured height comes
   * back one line short and the field grows a scrollbar exactly when the user
   * presses Enter at the end. A zero-width space after the newline gives that last
   * line something to be.
   * @param field - the field being sized.
   * @param value - the text it holds.
   * @returns the border-box height the content requires.
   */
  contentHeight(field, value) {
    this.adopt(field);
    const needsSentinel = value === "" || value.endsWith("\n") || value.endsWith("\r");
    this.setText(needsSentinel ? `${value}${SENTINEL}` : value);
    return this.element.getBoundingClientRect().height;
  }
  /**
   * Where the caret sits, in pixels relative to the field's border box.
   *
   * The trick is a marker element holding the character AFTER the caret, measured
   * against the mirror. Everything before the caret lays out normally, so the
   * marker lands exactly where the next glyph will be — which is where the caret
   * is. At the end of the document there is no next character, so a zero-width
   * space stands in for it.
   *
   * The field's own scroll offset is subtracted, because the caret's position on
   * screen is what the popup has to be placed against, and a scrolled field moves
   * its text without moving its border box.
   *
   * @param field - the field the caret is in.
   * @param offset - the caret's character offset.
   * @returns the caret box, or undefined when there is no layout to measure.
   */
  caretBox(field, offset) {
    const view = this.view;
    if (view === null || view === void 0) return void 0;
    this.adopt(field);
    const value = field.value;
    const position = clamp(offset, 0, value.length);
    const before = value.slice(0, position);
    const after = value.slice(position);
    const next = after === "" ? SENTINEL : after.charAt(0);
    this.element.textContent = "";
    this.element.appendChild(this.document.createTextNode(before));
    const marker = this.document.createElement("span");
    marker.textContent = next;
    marker.style.whiteSpace = "pre";
    this.element.appendChild(marker);
    this.element.appendChild(this.document.createTextNode(after.slice(next.length)));
    const mirrorRect = this.element.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const lineHeight = this.lineHeight(field);
    return {
      x: markerRect.left - mirrorRect.left - field.scrollLeft,
      y: markerRect.top - mirrorRect.top - field.scrollTop,
      height: markerRect.height > 0 ? markerRect.height : lineHeight,
      lineHeight
    };
  }
  /** Take the mirror out of the document. */
  destroy() {
    this.element.remove();
    this.adopted = void 0;
  }
  /**
   * The field this mirror was last shaped like.
   * @returns the field, or undefined before {@link adopt}.
   */
  get field() {
    return this.adopted;
  }
};

// src/dom/overlay.ts
var Overlay = class {
  /** The scroll container. Same box as the field. */
  element;
  /** The element the spans are written into. */
  paint;
  document;
  classNames;
  /** What was painted last, so an unchanged document is not repainted. */
  paintedText;
  paintedKey = "";
  /**
   * @param ownerDocument - the document to build in.
   * @param classNames - the three class-name mappings.
   */
  constructor(ownerDocument, classNames) {
    this.document = ownerDocument;
    this.classNames = classNames;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-layer";
    this.element.setAttribute("aria-hidden", "true");
    this.element.dataset.liteareaPart = "layer";
    this.paint = ownerDocument.createElement("div");
    this.paint.className = "litearea-paint";
    this.element.appendChild(this.paint);
  }
  /**
   * Paint a document.
   *
   * `key` is whatever the caller knows changed. When it and the text both match
   * the last call the work is skipped, which is what keeps a caret move or a
   * mouse hover from rebuilding every span on the page.
   * @param text - the document.
   * @param input - the tokens, decorations, and diagnostics.
   * @param key - a cheap signature of everything that affects the paint.
   * @param fallbackScope - the scope for characters no token covers.
   */
  render(text, input, key, fallbackScope = "text") {
    if (this.paintedText === text && this.paintedKey === key) return;
    const segments = buildSegments(text, input, fallbackScope);
    const fragment = this.document.createDocumentFragment();
    for (const segment of segments) {
      const span = this.document.createElement("span");
      span.className = segmentClasses(
        segment,
        this.classNames.scope,
        this.classNames.decoration,
        this.classNames.severity
      ).join(" ");
      if (segment.title !== void 0) span.title = segment.title;
      span.textContent = segment.text;
      fragment.appendChild(span);
    }
    this.paint.replaceChildren(fragment);
    this.paintedText = text;
    this.paintedKey = key;
  }
  /**
   * Follow the field's scroll position.
   *
   * The layer is `overflow: hidden` and its content is taller than its box exactly
   * when the field is: an auto-grown field has nothing to scroll and a field
   * clamped to its maximum height has everything to scroll. Copying the offset is
   * therefore enough, and it is more reliable than a transform, which can leave
   * the text on a half pixel.
   * @param field - the textarea.
   */
  syncScroll(field) {
    if (this.element.scrollTop !== field.scrollTop) this.element.scrollTop = field.scrollTop;
    if (this.element.scrollLeft !== field.scrollLeft) this.element.scrollLeft = field.scrollLeft;
  }
  /** Forget what was painted, so the next render rebuilds. */
  invalidate() {
    this.paintedText = void 0;
    this.paintedKey = "";
  }
  /** Take the layer out of the document. */
  destroy() {
    this.element.remove();
    this.paint.replaceChildren();
  }
};

// src/dom/popup.ts
var Popup = class {
  /** The positioned container. */
  element;
  /** The scrolling element, which holds the rows and nothing else. */
  list;
  document;
  handlers;
  rows = [];
  active = -1;
  open = false;
  showDocs = true;
  docs;
  prefix;
  /**
   * @param ownerDocument - the document to build in.
   * @param handlers - how to report a pick and a hover.
   * @param idPrefix - a stable prefix for row ids, so two editors do not collide.
   */
  constructor(ownerDocument, handlers, idPrefix) {
    this.document = ownerDocument;
    this.handlers = handlers;
    this.prefix = idPrefix;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-popup";
    this.element.dataset.liteareaPart = "popup";
    this.element.dataset.open = "false";
    this.list = ownerDocument.createElement("div");
    this.list.className = "litearea-list";
    this.list.setAttribute("role", "listbox");
    this.list.id = `${idPrefix}-listbox`;
    this.element.appendChild(this.list);
    this.docs = ownerDocument.createElement("div");
    this.docs.className = "litearea-docs";
    this.docs.hidden = true;
    this.element.appendChild(this.docs);
    this.list.addEventListener("mousedown", this.onMouseDown);
    this.list.addEventListener("mousemove", this.onMouseMove);
  }
  /** Whether the list is showing. */
  get isOpen() {
    return this.open;
  }
  /** The active row's index, or -1. */
  get activeIndex() {
    return this.active;
  }
  /** The rows currently shown. */
  get items() {
    return this.rows;
  }
  /** The active row, when there is one. */
  get activeRow() {
    return this.rows[this.active];
  }
  /** The id the field's `aria-controls` should name. It is the list, not the container. */
  get listId() {
    return this.list.id;
  }
  /**
   * The id of the active row, for the field's `aria-activedescendant`.
   *
   * The list does not write that attribute itself: the field belongs to the editor, and a
   * floating list reaching out of its own subtree to find it is the kind of coupling that
   * breaks the moment the two are mounted somewhere unexpected.
   * @returns the row id, or undefined when no row is active.
   */
  get activeRowId() {
    return this.active >= 0 ? this.rowId(this.active) : void 0;
  }
  /**
   * Show a list.
   * @param rows - the rows, already ranked.
   * @param active - the row to make active.
   * @param showDocs - whether to render the documentation panel.
   */
  show(rows, active, showDocs) {
    this.rows = rows;
    this.active = active;
    this.showDocs = showDocs;
    this.open = true;
    this.element.dataset.open = "true";
    this.element.dataset.docs = showDocs ? "true" : "false";
    this.list.scrollTop = 0;
    this.render();
  }
  /** Hide the list and forget its rows. */
  close() {
    if (!this.open) return;
    this.open = false;
    this.active = -1;
    this.rows = [];
    this.element.dataset.open = "false";
    this.list.replaceChildren();
    this.docs.hidden = true;
    this.docs.replaceChildren();
  }
  /**
   * Make a row active without rebuilding the list.
   * @param index - the row index.
   */
  setActive(index) {
    if (index === this.active) return;
    const previous = this.list.querySelector(`#${this.rowId(this.active)}`);
    if (previous !== null) previous.setAttribute("aria-selected", "false");
    this.active = index;
    const next = this.list.querySelector(`#${this.rowId(index)}`);
    if (next !== null) {
      next.setAttribute("aria-selected", "true");
      const top = next.offsetTop;
      const bottom = top + next.offsetHeight;
      if (top < this.list.scrollTop) this.list.scrollTop = top;
      else if (bottom > this.list.scrollTop + this.list.clientHeight) {
        this.list.scrollTop = bottom - this.list.clientHeight;
      }
    }
    this.renderDocs();
  }
  /**
   * Place the list under an anchor, flipping above it when there is no room below.
   *
   * The container's own box is what is measured, so the documentation panel counts towards the
   * height and a popup whose rows and explanation together would run off the bottom flips as a
   * whole rather than being cut in half.
   * @param anchor - the caret's box, in the container's coordinates.
   * @param container - the element the list is positioned against.
   * @param viewport - the visible area to stay inside.
   */
  place(anchor, container, viewport) {
    const box = this.element.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const gap = 4;
    let top = anchor.y + anchor.height + gap;
    if (containerBox.top + top + box.height > viewport.height - gap) {
      const above = anchor.y - box.height - gap;
      if (containerBox.top + above >= gap) top = above;
    }
    let left = anchor.x;
    const maxLeft = containerBox.width - box.width;
    if (left > maxLeft) left = Math.max(0, maxLeft);
    this.element.style.top = `${String(Math.round(top))}px`;
    this.element.style.left = `${String(Math.round(left))}px`;
  }
  /** Take the list out of the document. */
  destroy() {
    this.list.removeEventListener("mousedown", this.onMouseDown);
    this.list.removeEventListener("mousemove", this.onMouseMove);
    this.element.remove();
    this.list.replaceChildren();
    this.docs.replaceChildren();
  }
  /** The DOM id of a row, which `aria-activedescendant` points at. */
  rowId(index) {
    return `${this.prefix}-row-${String(index)}`;
  }
  // ── internals ────────────────────────────────────────────────────────────
  render() {
    const fragment = this.document.createDocumentFragment();
    this.rows.forEach((row, index) => {
      const element = this.document.createElement("div");
      element.className = "litearea-row";
      element.id = this.rowId(index);
      element.setAttribute("role", "option");
      element.setAttribute("aria-selected", index === this.active ? "true" : "false");
      element.dataset.index = String(index);
      const kind = this.document.createElement("span");
      kind.className = `litearea-rowKind litearea-kind-${row.item.kind ?? "value"}`;
      element.appendChild(kind);
      const label = this.document.createElement("span");
      label.className = "litearea-rowLabel";
      for (const piece of highlightSegments(row.item.label, row.indices)) {
        if (piece.matched) {
          const mark = this.document.createElement("span");
          mark.className = "litearea-rowMatch";
          mark.textContent = piece.text;
          label.appendChild(mark);
        } else {
          label.appendChild(this.document.createTextNode(piece.text));
        }
      }
      element.appendChild(label);
      if (row.item.detail !== void 0) {
        const detail = this.document.createElement("span");
        detail.className = "litearea-rowDetail";
        detail.textContent = row.item.detail;
        element.appendChild(detail);
      }
      fragment.appendChild(element);
    });
    this.list.replaceChildren(fragment);
    this.renderDocs();
  }
  /** Refresh the documentation panel from the active row. */
  renderDocs() {
    const item = this.rows[this.active]?.item;
    const hasDocs = this.showDocs && this.open && item !== void 0 && (item.documentation !== void 0 || item.detail !== void 0);
    this.docs.hidden = !hasDocs;
    if (!hasDocs || item === void 0) {
      this.docs.replaceChildren();
      return;
    }
    const fragment = this.document.createDocumentFragment();
    const title = this.document.createElement("div");
    title.className = "litearea-docsTitle";
    title.textContent = item.label;
    fragment.appendChild(title);
    if (item.detail !== void 0) {
      const detail = this.document.createElement("div");
      detail.className = "litearea-docsDetail";
      detail.textContent = item.detail;
      fragment.appendChild(detail);
    }
    if (item.documentation !== void 0) {
      const body = this.document.createElement("div");
      body.className = "litearea-docsBody";
      body.textContent = item.documentation;
      fragment.appendChild(body);
    }
    this.docs.replaceChildren(fragment);
    this.docs.scrollTop = 0;
  }
  onMouseDown = (event) => {
    const row = event.target?.closest(".litearea-row");
    if (row === null || row === void 0) return;
    event.preventDefault();
    const index = Number.parseInt(row.dataset.index ?? "-1", 10);
    if (Number.isInteger(index) && index >= 0) this.handlers.accept(index);
  };
  onMouseMove = (event) => {
    const row = event.target?.closest(".litearea-row");
    if (row === null || row === void 0) return;
    const index = Number.parseInt(row.dataset.index ?? "-1", 10);
    if (!Number.isInteger(index) || index < 0 || index === this.active) return;
    this.handlers.hover(index);
  };
};

// src/dom/tooltip.ts
var Tooltip = class {
  /** The tooltip element. */
  element;
  document;
  open = false;
  /**
   * @param ownerDocument - the document to build in.
   */
  constructor(ownerDocument) {
    this.document = ownerDocument;
    this.element = ownerDocument.createElement("div");
    this.element.className = "litearea-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.dataset.liteareaPart = "tooltip";
    this.element.dataset.open = "false";
  }
  /** Whether the tooltip is showing. */
  get isOpen() {
    return this.open;
  }
  /**
   * Show a hover.
   * @param info - what to say.
   * @param anchor - where the thing being described is.
   * @param container - the element the tooltip is positioned against.
   * @param viewport - the visible area to stay inside.
   */
  show(info, anchor, container, viewport) {
    const fragment = this.document.createDocumentFragment();
    if (info.title !== void 0) {
      const title = this.document.createElement("div");
      title.className = "litearea-tooltipTitle";
      title.textContent = info.title;
      fragment.appendChild(title);
    }
    if (info.detail !== void 0 && info.detail !== "") {
      const detail = this.document.createElement("div");
      detail.className = "litearea-tooltipDetail";
      detail.textContent = info.detail;
      fragment.appendChild(detail);
    }
    if (info.body !== void 0 && info.body !== "") {
      const body = this.document.createElement("div");
      body.className = "litearea-tooltipBody";
      body.textContent = info.body;
      fragment.appendChild(body);
    }
    this.element.replaceChildren(fragment);
    this.open = true;
    this.element.dataset.open = "true";
    const box = this.element.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const gap = 6;
    let top = anchor.y + anchor.height + gap;
    if (containerBox.top + top + box.height > viewport.height - gap) {
      const above = anchor.y - box.height - gap;
      top = containerBox.top + above >= gap ? above : Math.max(0, viewport.height - gap - box.height - containerBox.top);
    }
    let left = anchor.x;
    const overflowRight = containerBox.left + left + box.width - (viewport.width - gap);
    if (overflowRight > 0) left = Math.max(0, left - overflowRight);
    this.element.style.top = `${String(Math.round(top))}px`;
    this.element.style.left = `${String(Math.round(left))}px`;
  }
  /** Hide the tooltip. */
  hide() {
    if (!this.open) return;
    this.open = false;
    this.element.dataset.open = "false";
    this.element.replaceChildren();
  }
  /** Take the tooltip out of the document. */
  destroy() {
    this.element.remove();
    this.element.replaceChildren();
  }
};

// src/dom/editor.ts
var PAGE_STEP = 8;
var LiteArea = class {
  /** The positioning container. Put this in the page. */
  element;
  /** The real field. Exposed for a host that needs the element itself. */
  input;
  document;
  view;
  /**
   * The grammar as the host declared it, kept so {@link refresh} can re-resolve it.
   *
   * Mutable on purpose, and it is what lets a host pass a live object — a proxy
   * reading the newest props, say — without the editor having to be rebuilt when the
   * language changes. A rebuild would throw away the undo history, which is the one
   * thing this library must not do, so re-resolving is the only acceptable answer.
   */
  declaredGrammar;
  /** The grammar the engine is currently running, with its defaults filled in. */
  grammar;
  box;
  overlay;
  popup;
  tooltip;
  mirror;
  sizing;
  completion;
  hover;
  paintDecorations;
  handlers;
  injectedStyle;
  instanceId;
  fontsReady;
  /** The current inspection, and the text it was computed from. */
  current;
  currentText;
  /** Bumped whenever the inspection changes, so the painter can skip work. */
  revision = 0;
  /** The list on screen, with the range frozen when it opened. */
  completionState;
  /** True during an IME composition, when no completion may run. */
  composing = false;
  /** True while the editor itself is writing, so its own edit does not re-open the list. */
  applying = false;
  /** The height and overflow last written, so unchanged values are not rewritten. */
  appliedHeight = -1;
  appliedOverflow = "";
  appliedScrollbar = -1;
  /** The offset the tooltip last described, so a resting pointer does not re-query. */
  hoverOffset;
  /** The custom properties this instance set, so one that disappears can be removed. */
  appliedVariables = /* @__PURE__ */ new Set();
  hoverTimer;
  /** Watches for a width change, which invalidates wrapping and the box height. */
  resizeObserver;
  observedWidth = -1;
  /**
   * A signature of the last announced problem list, so the host is told once.
   *
   * Starts as `undefined` rather than as the empty string, because "no problems" is a
   * real signature and a host waiting to be told that the list is clear would otherwise
   * never hear it — it would keep whatever it was showing before the editor existed.
   */
  announced;
  destroyed = false;
  /**
   * @param options - the grammar, the initial text, and the behaviour to use.
   */
  constructor(options) {
    const probe = typeof document === "undefined" ? void 0 : document;
    if (probe === void 0) {
      throw new Error("litearea: an editor needs a document, and there is none in this environment");
    }
    this.document = probe;
    this.view = probe.defaultView ?? void 0;
    this.handlers = options;
    const declared = options.grammar;
    this.declaredGrammar = isResolvedGrammar(declared) ? declared.grammar : declared;
    this.grammar = resolveGrammar(this.declaredGrammar);
    this.instanceId = `litearea-${Math.random().toString(36).slice(2, 9)}`;
    this.sizing = withDefaults(
      { autoGrow: true, minRows: 1 },
      options.sizing
    );
    this.completion = options.completion === false ? void 0 : withDefaults(
      { auto: true, triggerCharacters: " ", limit: 100, showDocumentation: true },
      options.completion
    );
    this.hover = options.hover === false ? void 0 : withDefaults({ enabled: true, delay: 140 }, options.hover);
    this.paintDecorations = options.decorations !== false;
    if (options.injectStyles !== false) {
      this.injectedStyle = injectStyles(this.document, options.styleNonce);
    }
    this.element = this.document.createElement("div");
    this.element.className = options.className === void 0 ? "litearea" : `litearea ${options.className}`;
    this.element.classList.add(this.sizing.autoGrow ? "litearea-growable" : "litearea-resizable");
    if (options.readOnly === true) this.element.classList.add("litearea-readonly");
    if (options.variables !== void 0) this.applyVariables(options.variables);
    this.box = this.document.createElement("div");
    this.box.className = "litearea-box";
    this.element.appendChild(this.box);
    this.overlay = new Overlay(this.document, {
      scope: scopeClass,
      decoration: decorationClass,
      severity: severityClass
    });
    this.box.appendChild(this.overlay.element);
    this.input = this.document.createElement("textarea");
    this.input.className = "litearea-input";
    this.input.dataset.liteareaPart = "input";
    this.input.spellcheck = options.spellCheck === true;
    this.input.autocomplete = "off";
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("wrap", "soft");
    this.input.readOnly = options.readOnly === true;
    this.input.rows = this.sizing.minRows;
    if (options.placeholder !== void 0) this.input.placeholder = options.placeholder;
    if (options.ariaLabel !== void 0) this.input.setAttribute("aria-label", options.ariaLabel);
    this.input.setAttribute("aria-autocomplete", this.completion === void 0 ? "none" : "list");
    this.input.setAttribute("aria-expanded", "false");
    this.input.setAttribute("role", "combobox");
    this.input.value = options.value ?? "";
    this.box.appendChild(this.input);
    this.popup = new Popup(
      this.document,
      {
        accept: (index) => {
          this.acceptCompletion(index);
        },
        hover: (index) => {
          this.setActive(index);
        }
      },
      this.instanceId
    );
    this.element.appendChild(this.popup.element);
    this.input.setAttribute("aria-controls", this.popup.listId);
    this.tooltip = new Tooltip(this.document);
    this.element.appendChild(this.tooltip.element);
    this.mirror = new TextMirror(this.document);
    this.mirror.mount(this.document.body ?? this.document.documentElement);
    const Observer = this.view?.ResizeObserver;
    if (typeof Observer === "function") {
      this.resizeObserver = new Observer(() => {
        const width = this.element.clientWidth;
        if (width === this.observedWidth) return;
        this.observedWidth = width;
        this.mirror.adopt(this.input);
        this.resize(this.input.value);
        this.placePopup();
      });
      this.resizeObserver.observe(this.element);
    }
    const fonts = this.document.fonts;
    this.fontsReady = fonts?.ready;
    this.bind();
    this.sync();
    if (this.fontsReady !== void 0) {
      void this.fontsReady.then(() => {
        if (!this.destroyed) this.refresh();
      });
    }
  }
  // ── what a host reads ──────────────────────────────────────────────────────
  /** The current text. */
  get value() {
    return this.input.value;
  }
  /** The caret or selection. */
  get selection() {
    return readSelection(this.input);
  }
  /** The last inspection, or undefined before the first one. */
  get inspection() {
    return this.current;
  }
  /** The problems the grammar found. */
  get diagnostics() {
    return this.current?.diagnostics ?? [];
  }
  /** The list on screen, when one is. */
  get currentCompletion() {
    return this.completionState;
  }
  /** Whether the editor has focus. */
  get focused() {
    return this.document.activeElement === this.input;
  }
  // ── what a host calls ─────────────────────────────────────────────────────
  /**
   * Replace the text.
   *
   * `preserveHistory` writes through the editing pipeline, so the replacement is
   * one undoable edit and Ctrl+Z brings the old text back — what a Reset button
   * wants. Without it the value property is assigned, which is faster and clears
   * the history, which is what loading a different document wants.
   *
   * This is the only path that writes the text, and it is never used for an edit
   * the user could have made.
   * @param next - the new text.
   * @param preserveHistory - whether Ctrl+Z should be able to undo it.
   * @returns how the write landed.
   */
  setValue(next, preserveHistory = false) {
    if (this.input.value === next) return "unchanged";
    this.applying = true;
    let outcome;
    try {
      outcome = writeDocument(this.input, next, preserveHistory);
    } finally {
      this.applying = false;
    }
    this.sync();
    return outcome;
  }
  /**
   * Put the caret somewhere.
   * @param start - the anchor offset.
   * @param end - the moving offset; defaults to `start`.
   */
  setSelection(start, end = start) {
    writeSelection(this.input, start, end);
    this.updateCompletionForCaret();
  }
  /** Move the caret into the field. */
  focus() {
    this.input.focus();
  }
  /** Undo, through the browser's history. */
  undo() {
    const done = undoField(this.input);
    if (done) this.sync();
    return done;
  }
  /** Redo, through the browser's history. */
  redo() {
    const done = redoField(this.input);
    if (done) this.sync();
    return done;
  }
  /**
   * Set CSS custom properties on the wrapper, replacing whatever this method set last time.
   *
   * A property that has disappeared from the record is removed rather than left behind, so a
   * host can un-theme by passing a smaller object. Properties set by other means — a stylesheet,
   * or the wrapper's inline style directly — are not touched, and a removed one falls back to
   * whatever CSS says.
   *
   * Safe to call at any time after construction. The constructor uses the private write-only
   * half, because re-measuring needs the field, the mirror, and the overlay, none of which exist
   * until it has finished.
   * @param next - the properties, keyed as {@link LiteAreaOptions.variables} describes.
   */
  setVariables(next) {
    this.applyVariables(next);
    this.mirror.adopt(this.input);
    this.appliedHeight = -1;
    this.sync();
  }
  /** Write the properties, and forget the ones that are gone. No re-measure. */
  applyVariables(next) {
    const keep = /* @__PURE__ */ new Set();
    for (const [key, value] of Object.entries(next)) {
      const name = variableName(key);
      keep.add(name);
      this.element.style.setProperty(name, value);
    }
    for (const name of this.appliedVariables) {
      if (!keep.has(name)) this.element.style.removeProperty(name);
    }
    this.appliedVariables = keep;
  }
  /**
   * Re-read the document with the same text.
   *
   * For a host whose grammar depends on something outside it — an installed font
   * list that has just been re-read, a palette that changed — and for the moment a
   * web font finishes loading.
   *
   * The grammar is re-resolved here, which is what makes a live grammar object
   * work: a host that rebuilds its rules on every render can call `refresh()` and
   * the editor picks the new ones up without being rebuilt, so the undo history
   * survives a language change.
   */
  refresh() {
    this.grammar = resolveGrammar(this.declaredGrammar);
    this.current = void 0;
    this.currentText = void 0;
    this.mirror.adopt(this.input);
    this.overlay.invalidate();
    this.appliedHeight = -1;
    this.appliedOverflow = "";
    this.appliedScrollbar = -1;
    this.sync();
  }
  /** Open the completion list on demand, as Ctrl+Space does. */
  showCompletions() {
    if (this.completion === void 0) return;
    this.openCompletion("explicit");
  }
  /** Close the completion list. */
  hideCompletions() {
    this.closeCompletion();
  }
  /** Remove the editor and every listener it owns. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unbind();
    this.resizeObserver?.disconnect();
    this.resizeObserver = void 0;
    if (this.hoverTimer !== void 0) this.view?.clearTimeout(this.hoverTimer);
    this.popup.destroy();
    this.tooltip.destroy();
    this.overlay.destroy();
    this.mirror.destroy();
    void this.injectedStyle;
    this.element.remove();
  }
  // ── the pipeline ──────────────────────────────────────────────────────────
  /**
   * Bring everything up to date with the field.
   *
   * The inspection is cached on the text, so moving the caret or scrolling costs
   * nothing beyond the paint — and the paint itself is skipped when neither the
   * text nor the analysis changed.
   */
  sync() {
    const text = this.input.value;
    if (this.current === void 0 || this.currentText !== text) {
      this.current = inspect(text, this.grammar);
      this.currentText = text;
      this.revision += 1;
    }
    const inspection = this.current;
    this.paint(inspection);
    this.resize(text);
    this.overlay.syncScroll(this.input);
    this.announceDiagnostics(inspection);
  }
  /** Paint the layer, and mark the box when a problem is an error. */
  paint(inspection) {
    const painting = {
      tokens: inspection.tokens,
      decorations: this.paintDecorations ? inspection.decorations : [],
      diagnostics: inspection.diagnostics
    };
    const key = [
      String(this.revision),
      this.paintDecorations ? "d" : "-",
      String(painting.decorations.length),
      String(painting.diagnostics.length)
    ].join(":");
    this.overlay.render(inspection.text, painting, key, this.grammar.fallbackScope);
    const hasError = inspection.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    this.element.classList.toggle("litearea-invalid", hasError);
    this.input.setAttribute("aria-invalid", hasError ? "true" : "false");
  }
  /** Tell the host, once, when the problem list actually changed. */
  announceDiagnostics(inspection) {
    if (this.handlers.onDiagnostics === void 0) return;
    const key = inspection.diagnostics.map(
      (diagnostic) => `${String(diagnostic.from)}:${diagnostic.code ?? ""}:${diagnostic.message}`
    ).join("|");
    if (key === this.announced) return;
    this.announced = key;
    this.handlers.onDiagnostics(inspection.diagnostics);
  }
  /**
   * Size the box to its content.
   *
   * The mirror has no scrollbar, so its measurement is the height the content wants
   * with the full width available — which is exactly the number that decides whether
   * a scrollbar is needed at all. If it fits under the maximum, the height becomes
   * the content height and the overflow stays hidden, which is the promise of "grow
   * and shrink so no scrollbar is ever shown". If it does not fit, the height is
   * clamped and the overflow becomes `auto`.
   *
   * Clamping introduces a second problem that is easy to miss: a scrollbar narrows
   * the text, so the field rewraps, so the PAINT no longer wraps the same way and
   * every coloured span slides off its character. The measured scrollbar width is
   * therefore published as a custom property, and the stylesheet adds it to the
   * layer's own right padding so the two keep wrapping identically.
   *
   * An UNMOUNTED field is skipped rather than measured. Before the element is in the
   * document it has no layout, so its `clientWidth` is zero, the mirror wraps at every
   * character, and the measurement comes back several times too tall — a wrong height
   * that then has to be corrected on the next keystroke, which is what a box that
   * jumps on first focus actually is. The `ResizeObserver` installed at construction
   * does the first real measurement as soon as there is a width to measure against.
   * @param text - the current text.
   */
  resize(text) {
    if (!this.sizing.autoGrow) {
      this.mirror.adopt(this.input);
      return;
    }
    if (!this.input.isConnected || this.input.clientWidth === 0) return;
    const chrome = this.mirror.verticalPadding();
    const lineHeight = this.mirror.lineHeight(this.input);
    const minPx = Math.max(
      this.sizing.minHeight ?? 0,
      lineHeight * (this.sizing.minRows ?? 1) + chrome
    );
    const maxCandidate = Math.min(
      this.sizing.maxHeight ?? Number.POSITIVE_INFINITY,
      this.sizing.maxRows === void 0 ? Number.POSITIVE_INFINITY : lineHeight * this.sizing.maxRows + chrome
    );
    const maxPx = Math.max(maxCandidate, minPx);
    const content = this.mirror.contentHeight(this.input, text);
    const wanted = clamp(Math.max(content, minPx), minPx, maxPx);
    const overflow = content > wanted + 0.5 ? "auto" : "hidden";
    if (Math.abs(wanted - this.appliedHeight) > 0.5) {
      this.input.style.height = `${String(Math.round(wanted))}px`;
      this.appliedHeight = wanted;
    }
    if (overflow !== this.appliedOverflow) {
      this.input.style.overflowY = overflow;
      this.appliedOverflow = overflow;
    }
    const scrollbar = overflow === "auto" ? this.input.offsetWidth - this.input.clientWidth : 0;
    const width = Math.max(0, scrollbar);
    if (width !== this.appliedScrollbar) {
      this.element.style.setProperty("--litearea-scrollbar", `${String(width)}px`);
      this.appliedScrollbar = width;
    }
  }
  // ── completion ────────────────────────────────────────────────────────────
  /** The caret's offset, clamped into the text. */
  caret() {
    return clamp(readSelection(this.input).start, 0, this.input.value.length);
  }
  /** Resolve and show a list for the caret. */
  openCompletion(trigger) {
    if (this.completion === void 0 || this.current === void 0) return;
    const result = complete(this.current, this.grammar, {
      text: this.input.value,
      caret: this.caret(),
      trigger,
      previousSourceId: this.completionState?.sourceId,
      limit: this.completion.limit
    });
    if (result === void 0 || result.rows.length === 0) {
      this.closeCompletion();
      return;
    }
    this.completionState = result;
    this.popup.show(result.rows, 0, this.completion.showDocumentation);
    this.input.setAttribute("aria-expanded", "true");
    this.syncActiveDescendant();
    this.placePopup();
    this.handlers.onCompletion?.(result);
  }
  /** Close the list and tell the host. */
  closeCompletion() {
    if (this.completionState === void 0 && !this.popup.isOpen) return;
    this.completionState = void 0;
    this.popup.close();
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.handlers.onCompletion?.(void 0);
  }
  /** Keep the field's `aria-activedescendant` pointing at the active row. */
  syncActiveDescendant() {
    const id = this.popup.activeRowId;
    if (id === void 0) this.input.removeAttribute("aria-activedescendant");
    else this.input.setAttribute("aria-activedescendant", id);
  }
  /** Put the list under the caret. */
  placePopup() {
    if (this.completionState === void 0) return;
    const box = this.mirror.caretBox(this.input, this.caret());
    if (box === void 0) return;
    const inputRect = this.input.getBoundingClientRect();
    const elementRect = this.element.getBoundingClientRect();
    this.popup.place(
      {
        x: inputRect.left - elementRect.left + box.x,
        y: inputRect.top - elementRect.top + box.y,
        height: box.height
      },
      this.element,
      { width: this.view?.innerWidth ?? 0, height: this.view?.innerHeight ?? 0 }
    );
  }
  /**
   * Take the active row.
   * @param index - the row to take.
   * @param commitCharacter - a character typed to trigger the pick, written after
   *   the completion so the keystroke is not swallowed.
   */
  acceptCompletion(index, commitCharacter) {
    const state = this.completionState;
    const row = this.popup.items[index]?.item;
    if (state === void 0 || row === void 0) return;
    const applied = applyCompletion(this.input.value, state.range, row);
    this.applying = true;
    try {
      replaceThroughPipeline(this.input, applied.from, applied.to, applied.insert);
      writeSelection(this.input, applied.caret);
      if (commitCharacter !== void 0) {
        replaceThroughPipeline(this.input, applied.caret, applied.caret, commitCharacter);
        writeSelection(this.input, applied.caret + commitCharacter.length);
      }
    } finally {
      this.applying = false;
    }
    this.closeCompletion();
    this.sync();
    const inspection = this.current;
    if (inspection !== void 0) {
      this.grammar.grammar.onAccept?.({
        text: this.input.value,
        caret: this.caret(),
        item: row,
        state: inspection.state
      });
    }
  }
  /** Decide what an edit does to the list. */
  updateCompletionAfterInput(data, deletion) {
    if (this.completion === void 0 || this.applying || this.composing) return;
    if (this.input.readOnly) return;
    if (deletion) {
      if (this.completionState !== void 0) this.openCompletion("auto");
      return;
    }
    if (this.completionState !== void 0) {
      this.openCompletion("auto");
      return;
    }
    if (!this.completion.auto) return;
    if (!this.shouldAutoOpen(data)) return;
    this.openCompletion("auto");
  }
  /** Whether a keystroke is a reason to offer suggestions. */
  shouldAutoOpen(data) {
    if (data === "" || this.completion === void 0) return false;
    const last = data.slice(-1);
    if (this.completion.triggerCharacters.includes(last)) return true;
    return this.grammar.wordChars.test(last);
  }
  /** Close a list the caret has left. */
  updateCompletionForCaret() {
    const state = this.completionState;
    if (state === void 0) return;
    const caret = this.caret();
    if (caret < state.range.from || caret > state.range.to) this.closeCompletion();
    else this.placePopup();
  }
  // ── hover ─────────────────────────────────────────────────────────────────
  /** Start, or restart, the timer that shows a tooltip. */
  queueHover(offset, event) {
    if (this.hover === void 0 || !this.hover.enabled || this.current === void 0) return;
    if (offset === this.hoverOffset && this.tooltip.isOpen) return;
    this.hoverOffset = offset;
    this.hideTooltip();
    const clientX = event.clientX;
    const clientY = event.clientY;
    this.hoverTimer = this.view?.setTimeout(() => {
      this.hoverTimer = void 0;
      this.showHover(offset, clientX, clientY);
    }, this.hover.delay);
  }
  /** Resolve and show a tooltip. */
  showHover(offset, clientX, clientY) {
    if (this.current === void 0 || this.destroyed) return;
    const info = resolveHover(this.current, this.grammar, offset);
    if (info === void 0) {
      this.hideTooltip();
      return;
    }
    const rect = this.element.getBoundingClientRect();
    const lineHeight = this.mirror.lineHeight(this.input);
    this.tooltip.show(
      info,
      { x: clientX - rect.left, y: clientY - rect.top, height: lineHeight },
      this.element,
      { width: this.view?.innerWidth ?? 0, height: this.view?.innerHeight ?? 0 }
    );
    this.handlers.onHover?.(info);
  }
  /** Hide the tooltip and forget what it described. */
  hideTooltip() {
    if (this.hoverTimer !== void 0) {
      this.view?.clearTimeout(this.hoverTimer);
      this.hoverTimer = void 0;
    }
    if (!this.tooltip.isOpen) return;
    this.tooltip.hide();
    this.handlers.onHover?.(void 0);
  }
  // ── events ────────────────────────────────────────────────────────────────
  /** Attach every listener. */
  bind() {
    this.input.addEventListener("input", this.onInput);
    this.input.addEventListener("keydown", this.onKeyDown);
    this.input.addEventListener("scroll", this.onScroll);
    this.input.addEventListener("click", this.onCaretMoved);
    this.input.addEventListener("keyup", this.onKeyUp);
    this.input.addEventListener("select", this.onCaretMoved);
    this.input.addEventListener("blur", this.onBlur);
    this.input.addEventListener("mousemove", this.onMouseMove);
    this.input.addEventListener("mouseleave", this.onMouseLeave);
    this.input.addEventListener("compositionstart", this.onCompositionStart);
    this.input.addEventListener("compositionend", this.onCompositionEnd);
    this.document.addEventListener("selectionchange", this.onSelectionChange);
  }
  /** Detach every listener. */
  unbind() {
    this.input.removeEventListener("input", this.onInput);
    this.input.removeEventListener("keydown", this.onKeyDown);
    this.input.removeEventListener("scroll", this.onScroll);
    this.input.removeEventListener("click", this.onCaretMoved);
    this.input.removeEventListener("keyup", this.onKeyUp);
    this.input.removeEventListener("select", this.onCaretMoved);
    this.input.removeEventListener("blur", this.onBlur);
    this.input.removeEventListener("mousemove", this.onMouseMove);
    this.input.removeEventListener("mouseleave", this.onMouseLeave);
    this.input.removeEventListener("compositionstart", this.onCompositionStart);
    this.input.removeEventListener("compositionend", this.onCompositionEnd);
    this.document.removeEventListener("selectionchange", this.onSelectionChange);
  }
  onInput = (event) => {
    this.sync();
    const input = event;
    const type = input.inputType ?? "";
    const deletion = type.startsWith("delete");
    const data = typeof input.data === "string" ? input.data : "";
    this.hideTooltip();
    this.updateCompletionAfterInput(data, deletion);
    if (!this.applying) this.handlers.onChange?.(this.input.value);
  };
  onKeyDown = (event) => {
    if (this.commitCharacter(event)) return;
    if (event.key === "Escape") {
      if (this.popup.isOpen) {
        event.preventDefault();
        this.closeCompletion();
        return;
      }
      this.hideTooltip();
      return;
    }
    if (event.key === " " && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (this.popup.isOpen) this.closeCompletion();
      else this.openCompletion("explicit");
      return;
    }
    if (!this.popup.isOpen) return;
    const last = this.popup.items.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.setActive(Math.min(this.popup.activeIndex + 1, last));
        return;
      case "ArrowUp":
        event.preventDefault();
        this.setActive(Math.max(this.popup.activeIndex - 1, 0));
        return;
      case "PageDown":
        event.preventDefault();
        this.setActive(Math.min(this.popup.activeIndex + PAGE_STEP, last));
        return;
      case "PageUp":
        event.preventDefault();
        this.setActive(Math.max(this.popup.activeIndex - PAGE_STEP, 0));
        return;
      case "Enter":
        event.preventDefault();
        this.acceptCompletion(this.popup.activeIndex);
        return;
      case "Tab":
        event.preventDefault();
        this.acceptCompletion(this.popup.activeIndex);
        return;
      default:
        return;
    }
  };
  /**
   * Whether a keystroke is a commit character for the active row.
   *
   * Typing `=` at the end of `shape` takes the `shape=` row and keeps the
   * character, rather than either swallowing the keystroke or leaving the row to be
   * clicked. A row opts in; nothing has a commit character by default.
   * @param event - the key event.
   * @returns whether the keystroke was consumed.
   */
  commitCharacter(event) {
    if (!this.popup.isOpen) return false;
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
    const characters = this.popup.activeRow?.item.commitCharacters;
    if (characters === void 0 || !characters.includes(event.key)) return false;
    event.preventDefault();
    this.acceptCompletion(this.popup.activeIndex, event.key);
    return true;
  }
  /** Make a row active and keep the ARIA pointer in step. */
  setActive(index) {
    this.popup.setActive(index);
    this.syncActiveDescendant();
  }
  onScroll = () => {
    this.overlay.syncScroll(this.input);
    this.placePopup();
    this.hideTooltip();
  };
  onCaretMoved = () => {
    this.updateCompletionForCaret();
    this.handlers.onSelectionChange?.(readSelection(this.input));
  };
  onKeyUp = (event) => {
    if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
      this.updateCompletionForCaret();
    }
  };
  onSelectionChange = () => {
    if (this.document.activeElement !== this.input) return;
    this.handlers.onSelectionChange?.(readSelection(this.input));
  };
  onBlur = () => {
    this.closeCompletion();
    this.hideTooltip();
  };
  onMouseMove = (event) => {
    if (this.hover === void 0 || !this.hover.enabled) return;
    if (this.popup.isOpen) {
      this.hideTooltip();
      return;
    }
    const offset = caretOffsetFromPoint(this.document, event.clientX, event.clientY);
    if (offset === void 0) return;
    this.queueHover(offset, event);
  };
  onMouseLeave = () => {
    this.hoverOffset = void 0;
    this.hideTooltip();
  };
  onCompositionStart = () => {
    this.composing = true;
    this.closeCompletion();
  };
  onCompositionEnd = () => {
    this.composing = false;
    this.sync();
  };
};
function variableName(key) {
  if (key.startsWith("--")) return key;
  return key.startsWith("litearea-") ? `--${key}` : `--litearea-${key}`;
}
function caretOffsetFromPoint(ownerDocument, x, y) {
  const probe = ownerDocument;
  if (typeof probe.caretPositionFromPoint === "function") {
    return probe.caretPositionFromPoint(x, y)?.offset;
  }
  if (typeof probe.caretRangeFromPoint === "function") {
    return probe.caretRangeFromPoint(x, y)?.startOffset;
  }
  return void 0;
}

// src/dom/create.ts
function createEditor(target, options) {
  const editor = new LiteArea(options);
  target.appendChild(editor.element);
  editor.refresh();
  return editor;
}
		return { LITEAREA_STYLES: LITEAREA_STYLES, LiteArea: LiteArea, Overlay: Overlay, Popup: Popup, TextMirror: TextMirror, Tooltip: Tooltip, applyCompletion: applyCompletion, asResolvedVocabulary: asResolvedVocabulary, buildSegments: buildSegments, canEditThroughPipeline: canEditThroughPipeline, clamp: clamp, complete: complete, containsOffset: containsOffset, createEditor: createEditor, decorationClass: decorationClass, defineCompletion: defineCompletion, defineGrammar: defineGrammar, defineVocabulary: defineVocabulary, diagnosticHover: diagnosticHover, dispatchInput: dispatchInput, excerpt: excerpt, fieldLineHeight: fieldLineHeight, fillTemplate: fillTemplate, fuzzyMatch: fuzzyMatch, hasCaretHitTest: hasCaretHitTest, hasDocument: hasDocument, highlightSegments: highlightSegments, injectStyles: injectStyles, inspect: inspect, isEmptyRange: isEmptyRange, isOffset: isOffset, isResolvedGrammar: isResolvedGrammar, isWordChar: isWordChar, isWordStart: isWordStart, lineAt: lineAt, lineIndexAt: lineIndexAt, lineStarts: lineStarts, listPhrase: listPhrase, normalizeDiagnostics: normalizeDiagnostics, offsetFromPoint: offsetFromPoint, rank: rank, readSelection: readSelection, redoField: redoField, replaceThroughPipeline: replaceThroughPipeline, resolveGrammar: resolveGrammar, resolveHover: resolveHover, resolveWordsSource: resolveWordsSource, scan: scan, scopeAt: scopeAt, scopeClass: scopeClass, segmentClasses: segmentClasses, severityClass: severityClass, tokenAfter: tokenAfter, tokenAt: tokenAt, tokenBefore: tokenBefore, tokensOnLine: tokensOnLine, undoField: undoField, vocabularyWords: vocabularyWords, withDefaults: withDefaults, wordInfoAt: wordInfoAt, writeDocument: writeDocument, writeSelection: writeSelection };
		})();
/**
 * Browser half of `dsh-sentry` — the tab-page sentry for the DeepSeek Harness
 * Web GUI.
 *
 * The interface already tells you everything you need to know *while you are
 * looking at it*: the sidebar has a state dot per session, the conversation has
 * its own streaming indicators, and the tab has a title. What it cannot tell you
 * is anything at all once the tab is in the background, which is exactly when a
 * long agent turn runs. This plugin answers one question from across the room —
 * *does anything need me?* — through the only three channels a background tab
 * has: its favicon, its title, and its speakers.
 *
 * This file is NOT loaded as an ES module. `scripts/build-client.mjs` wraps it in
 * the DSH client-bundle envelope and writes `lib/client.js`, which is what the
 * Web shell fetches. Keep it dependency-light: the only modules it may `import`
 * are the platform-singleton specifiers the shell seeds into its module table.
 *
 * Why this needs no _react and no slot
 * -----------------------------------
 * The state this plugin reacts to is reachable from the cordis context itself:
 * `ctx.sessions.list` and `ctx.uiSession.pendingInteractions` are both
 * `{ getSnapshot(), subscribe() }` observables owned by services the Web
 * composition always installs — the same objects `ui-session` hands to the
 * `useSessions` / `useSessionPendingInteraction` hook seats. So the whole engine
 * is plain DOM plus two subscriptions, and _react appears exactly once, in the
 * Settings row, because the slot system is _react. That is why this plugin
 * registers no always-mounted component and occupies no global slot: a
 * third-party bundle has fewer ways to collide with the interface when it stays
 * out of the render tree.
 *
 * Every decision is a pure function taking its inputs as arguments — the clock,
 * the storage, the visibility and focus bits, the reduced-motion bit, the note
 * table. `install()` is the only impure part and is deliberately thin.
 * `scripts/verify-client.mjs` drives the pure half in Node, where a regression is
 * a failing check instead of a silently-green favicon.
 *
 * @module dsh-sentry/client
 */

		let _react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		// @citisen/litearea is compiled in above
/**
 * dsh-sentry's style document, as a litearea grammar.
 *
 * The language is line-oriented: a line names one of the plugin's states and then
 * says what that state looks like, either as bare words or as `key=value` pairs.
 *
 *     # comments and blank lines are ignored
 *     running  circle  blue  turn   3
 *     waiting  rounded amber blink  1.1
 *     approval rounded amber blink  1.9
 *     done     circle  green flush  1.6
 *
 *     running shape=none color=gray motion=still speed=1
 *
 * A bare word goes into the first positional slot the line has not filled, in the
 * order shape, colour, pattern, motion, speed — except that the value sets are
 * disjoint, so in practice the *word itself* says where it goes and the slot order
 * only decides what a word that fits nothing is measured against. That is the
 * plugin's own reading of the language and this grammar reproduces it.
 *
 * Why the grammar lives HERE and not in the editor
 * -----------------------------------------------
 * `@citisen/litearea` ships no syntax of its own: a host hands it a grammar as a
 * value, because a library that carried every consumer's language would make every
 * consumer bundle every language. So the grammar for THIS DSL is this plugin's own
 * module, and `src/client.js` passes the plugin's constants in — which is what keeps
 * the vocabulary the editor offers and the vocabulary `parseStyle` accepts one list
 * rather than two that agree until someone edits one of them.
 *
 * Why the lexical layer cannot validate an option's value
 * ------------------------------------------------------
 * It is worth stating, because it is the first thing a grammar author tries. The
 * obvious rule is "a word after `=` must be one of the shape words", and it is
 * wrong: the rule can see the `=` but not the KEY, so it cannot tell `shape=blue`
 * from `color=blue`. Written that way, `color=blue` earns a complaint that blue is
 * not a shape. The key is structural information, so option values are validated by
 * the structural pass below and only the line-leading state word is validated
 * lexically, where nothing shares its position and there is nothing to confuse it
 * with.
 *
 * Deliberately stricter than the host parser
 * ------------------------------------------
 * `parseStyle` in the plugin does no value checking for a known option: it writes
 * `shape=bogus` into the rule and lets `resolveLook` quietly substitute the shipped
 * default later. Nothing tells the user, and a typo shows up as an icon that simply
 * never changed. This grammar reports it, as a warning rather than an error, since
 * the document still works — it just does not mean what it says.
 *
 * It also does NOT accept `fallback`. The plugin's module comment shows a
 * `fallback none` line, but `STYLE_STATES` holds only the four states and any other
 * leading word is reported as an unknown state; `fallback` is derived internally
 * from `STYLE_FALLBACK_LOOK` and has never been parseable. The comment is stale, and
 * copying it here would have made the editor disagree with the parser it edits for.
 *
 * @module dsh-sentry/style-grammar
 */

		// @citisen/litearea is compiled in above
// ─── the shapes this language is written in ──────────────────────────────────

/**
 * One positional slot of a state line, in the order a bare word fills them.
 * @typedef {'shape' | 'color' | 'pattern' | 'motion' | 'speed'} DshSentrySlot
 */

/**
 * The four facts one state's appearance is made of.
 * @typedef {object} DshSentryLook
 * @property {string} shape - the background shape.
 * @property {string} color - the name of a palette entry.
 * @property {string} pattern - the carved pattern, `none` in this build.
 * @property {string} motion - what moves.
 * @property {number} speed - seconds per revolution or per cycle.
 */

/**
 * One word of the document, with the range it occupies.
 * @typedef {object} DshSentryWord
 * @property {string} text - the word as written.
 * @property {number} from - the offset it starts at.
 * @property {number} to - the offset after its last character.
 */

/**
 * A problem the structural walk found, ready to be reported.
 * @typedef {object} DshSentryProblem
 * @property {number} from - the offset the underline starts at.
 * @property {number} to - the offset after it.
 * @property {string} message - what to tell the user.
 * @property {string} code - the stable tag, so a host or a test can act on meaning.
 * @property {'error' | 'warning' | 'info' | 'hint'} severity - how loudly it speaks.
 */

/**
 * One line of the document, read.
 *
 * A line rather than a rule, because half of what the structural walk produces is
 * about a line that is not finished yet: `pendingKey` and `keys` describe a rule
 * being typed, which is exactly when a completion asks.
 * @typedef {object} DshSentryLine
 * @property {number} number - zero-based, so a completion can find the caret's line.
 * @property {string | undefined} state - the state the line opens, as written.
 * @property {boolean} known - whether that state is one this document understands.
 * @property {DshSentryWord[]} words - the words on the line, comments removed.
 * @property {Record<string, string>} slots - the value each positional slot ended up
 *   with, whatever syntax put it there.
 * @property {string[]} keys - the option keys the line named, in order, whether or
 *   not they are known.
 * @property {string | undefined} pendingKey - the option key whose value the line
 *   has not written yet, as `speed=`.
 */

/**
 * What one pass over the document produced.
 * @typedef {object} DshSentryState
 * @property {DshSentryLine[]} lines - every line, read.
 * @property {DshSentryProblem[]} problems - what the structural walk found;
 *   `validate` reports these verbatim.
 */

/**
 * The vocabularies and shipped defaults a host may override.
 *
 * Every field is optional, and a host that names none of them gets this module's
 * copy of the plugin's lists. The overrides exist because the lists are the
 * plugin's to own: a suite that proves the grammar reads them — rather than that it
 * carries a copy that happens to agree — has to be able to change one and watch the
 * grammar follow.
 * @typedef {object} DshSentryStyleOptions
 * @property {readonly string[]} [states] - the states a document may address, in
 *   the order the list shows them.
 * @property {readonly string[]} [shapes] - the background shapes a rule may name.
 * @property {readonly string[]} [motions] - the motions a rule may apply.
 * @property {readonly string[]} [patterns] - the patterns still accepted as
 *   `pattern=<name>`.
 * @property {Readonly<Record<string, string>>} [colors] - the named palette.
 *   Presets on purpose: a free colour can be illegible.
 * @property {readonly string[]} [options] - the option keys a rule may write.
 * @property {Readonly<Record<string, DshSentryLook>>} [defaults] - the shipped look
 *   per state, used to rank a completion and to document a word.
 */

/**
 * Build the grammar for dsh-sentry's style document.
 *
 * Everything but this function is declared INSIDE it, and that is not a style
 * choice. The build splices this file into `src/client.js`, where it shares the
 * plugin's own scope — a classic script has no module table to hold a second file —
 * so a top-level constant here would be a second `SHAPES` beside the plugin's, and
 * would either collide with it or shadow it. One name, the factory's, can do
 * neither.
 *
 * @param {DshSentryStyleOptions} [options] - the vocabularies and shipped defaults.
 * @returns {object} a grammar that paints, completes, diagnoses, and explains the
 *   language.
 */
function dshSentryStyleGrammar(options = {}) {
  // ── the vocabulary, as the caller gave it ─────────────────────────────────
  //
  // The fallbacks are the plugin's shipped vocabulary verbatim, including the
  // palette, whose eight members exist because the two contrast failures that plugin
  // has already shipped were both free colour choices. A preset cannot be illegible,
  // so the set is closed and the editor must not offer anything else. They are here
  // for a caller that passes nothing; `src/client.js`, the only caller in the
  // browser, passes its own so the two cannot drift.

  /** The states a document may address, in the order a list shows them. */
  const FALLBACK_STATES = ['running', 'waiting', 'approval', 'done']
  /** The background shapes a rule may name. */
  const FALLBACK_SHAPES = ['circle', 'rounded', 'square', 'none']
  /** The motions a rule may apply. */
  const FALLBACK_MOTIONS = ['still', 'turn', 'blink', 'flush']
  /** The patterns a rule may carve. Empty in this build, and that is the truth. */
  const FALLBACK_PATTERNS = []
  /** The named palette, by name. */
  const FALLBACK_COLORS = {
    blue: '#4d6bfe',
    amber: '#f59e0b',
    green: '#22c55e',
    red: '#ef4444',
    purple: '#8b5cf6',
    gray: '#8b8f97',
    dark: '#23262c',
    light: '#eef0f3',
  }
  /** The option keys a rule may write. `bg` is kept as an alias for `color`. */
  const FALLBACK_OPTIONS = ['shape', 'color', 'pattern', 'motion', 'speed', 'bg']
  /** The shipped look per state, used to rank a completion and to document. */
  const FALLBACK_LOOK = {
    running: { shape: 'circle', color: 'blue', pattern: 'none', motion: 'turn', speed: 3 },
    waiting: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.1 },
    approval: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.9 },
    done: { shape: 'circle', color: 'green', pattern: 'none', motion: 'flush', speed: 1.6 },
  }

  const STATES = options.states ?? FALLBACK_STATES
  const SHAPES = options.shapes ?? FALLBACK_SHAPES
  const MOTIONS = options.motions ?? FALLBACK_MOTIONS
  const PATTERNS = options.patterns ?? FALLBACK_PATTERNS
  const COLORS = options.colors ?? FALLBACK_COLORS
  const COLOR_NAMES = Object.keys(COLORS)
  const OPTIONS = options.options ?? FALLBACK_OPTIONS
  const LOOK = options.defaults ?? FALLBACK_LOOK

  /** The positional slots, in the order a bare word fills them. */
  const SLOTS = ['shape', 'color', 'pattern', 'motion', 'speed']

  /** The scope each slot's values are painted under. */
  const SLOT_SCOPE = {
    shape: 'value.shape',
    color: 'value.color',
    pattern: 'value.pattern',
    motion: 'value.motion',
    speed: 'value.number',
  }

  /** Which positional slot an option key writes. `bg` is an alias for `color`. */
  const KEY_SLOT = {
    shape: 'shape',
    color: 'color',
    bg: 'color',
    pattern: 'pattern',
    motion: 'motion',
    speed: 'speed',
  }

  /**
   * The patterns a bare word may name.
   *
   * Empty in this build, and that is the shipped truth rather than a placeholder:
   * see the plugin's `PATTERNS`. `none` is the one word the `pattern=` option still
   * takes, and it is deliberately not a bare-word alternative, because `none` is
   * also a shape and a token cannot mean two things.
   */
  const PATTERN_WORDS = PATTERNS.length > 0 ? PATTERNS : ['none']

  // ── helpers ───────────────────────────────────────────────────────────────
  // Every one of them closes over the vocabulary resolved above, so a word set, the
  // paint, the message, and the completion list cannot disagree: they are read from
  // one binding rather than assembled four times.

  /**
   * A vocabulary, with the one setting this grammar always wants.
   *
   * `caseSensitive` is on for every word here because the host parser compares with
   * `includes` on the literal: a suggestion list that accepted `Circle` would be
   * teaching a spelling the plugin then rejects.
   * @param {object} spec - the declaration, minus the repeated setting.
   * @returns {object} the resolved vocabulary.
   */
  function closedVocabulary(spec) {
    return _citisen_litearea.defineVocabulary({ ...spec, caseSensitive: true })
  }

  /**
   * The words a slot accepts, for both a message and a completion list.
   * @param {string} slot - a positional slot name, or an option key such as `bg`.
   * @returns {readonly string[]} the accepted words, or an empty list for a slot
   *   whose values are free (`speed`).
   */
  function wordsForSlot(slot) {
    if (slot === 'shape') return SHAPES
    if (slot === 'color' || slot === 'bg') return COLOR_NAMES
    if (slot === 'motion') return MOTIONS
    if (slot === 'pattern') return PATTERN_WORDS
    return []
  }

  /**
   * What a slot expects, in words, for a diagnostic message.
   * @param {string} slot - a positional slot name, or an option key such as `bg`.
   * @returns {string} a readable list.
   */
  function expectedList(slot) {
    if (slot === 'speed') return 'a number of seconds, such as 3 or 1.1'
    const words = wordsForSlot(slot)
    if (words.length === 0) return 'pattern=<name>'
    return words.join(', ')
  }

  /**
   * Whether a value written for an option key is acceptable.
   * @param {string} key - the option key.
   * @param {string} value - the value as written.
   * @returns {string | undefined} a complaint, or undefined when the value is fine.
   */
  function valueProblem(key, value) {
    if (key === 'speed') {
      return Number.isFinite(Number.parseFloat(value))
        ? undefined
        : `"${value}" is not a speed — write a number of seconds, such as 3 or 1.1. The shipped rate is used instead.`
    }
    if (VOCAB_FOR_KEY[key] === undefined) return undefined
    const words = wordsForSlot(key)
    if (words.includes(value)) return undefined
    const noun = key === 'bg' ? 'preset colour' : key
    return `"${value}" is not a ${noun} — expected ${words.join(', ')}. The shipped default is used instead.`
  }

  /**
   * The option a value is being written for, when the caret is inside one.
   *
   * Read from the text before the caret on the caret's own line. The parse reads
   * whole lines, and part-way through `shape=ci` the line is not a finished rule yet
   * — the local reading is correct in the middle of the edit, which is the only
   * moment a completion is ever asked.
   *
   * The value has to be the word the caret is IN, which is why the pattern allows no
   * whitespace between the `=` and the caret. Without that, any earlier `key=` on the
   * line would claim the list: a line that already said `pattern=none` would go on
   * offering patterns instead of moving on to the slot that is still empty.
   * @param {string} before - the caret's line, up to the caret.
   * @returns {string | undefined} the key, or undefined when the caret is not in a
   *   value.
   */
  function optionAtCaret(before) {
    const match = /([A-Za-z][\w-]*)\s*=([^\s=]*)$/.exec(before)
    return match?.[1]
  }

  // ── vocabularies ──────────────────────────────────────────────────────────
  // Declared once each so the word set, the paint, the hover text, and the
  // completion list cannot disagree. Nothing here carries `unknownMessage` except the
  // state vocabulary, because nothing else can be validated from a token: see the
  // header note about the key a lexical rule cannot see.

  const STATE_VOCAB = closedVocabulary({
    id: 'state',
    words: STATES,
    scope: 'state',
    unknownMessage: 'Unknown state "{word}" — this document understands {allowed}.',
    docs: {
      running: { detail: 'a turn is in progress', body: 'The agent is working and does not need anyone.' },
      waiting: { detail: 'a question is waiting', body: 'The agent asked something, and the turn is blocked until it is answered.' },
      approval: { detail: 'a permission is waiting', body: 'The agent requested an escalation or a plan review, and the turn is blocked on it.' },
      done: { detail: 'the turn finished', body: 'The agent stopped and left the tab alone.' },
    },
  })

  const SHAPE_VOCAB = closedVocabulary({
    id: 'shape',
    words: SHAPES,
    scope: SLOT_SCOPE.shape,
    docs: {
      circle: { detail: 'a full disc' },
      rounded: { detail: 'a rounded square' },
      square: { detail: 'a square with sharp corners' },
      none: {
        detail: 'no background',
        body: 'The fish alone, on whatever the tab gives it. A bare `none` is a SHAPE and never a pattern: one word cannot mean two things.',
      },
    },
  })

  const COLOR_VOCAB = closedVocabulary({
    id: 'color',
    words: COLOR_NAMES,
    scope: SLOT_SCOPE.color,
    docs: Object.fromEntries(Object.entries(COLORS).map(([name, hex]) => [name, { detail: hex }])),
  })

  const MOTION_VOCAB = closedVocabulary({
    id: 'motion',
    words: MOTIONS,
    scope: SLOT_SCOPE.motion,
    docs: {
      still: { detail: 'nothing moves' },
      turn: { detail: 'rotates', body: 'speed is seconds per revolution.' },
      blink: { detail: 'alternates', body: 'speed is seconds per cycle.' },
      flush: { detail: 'pulses', body: 'speed is seconds per cycle.' },
    },
  })

  const PATTERN_VOCAB = closedVocabulary({
    id: 'pattern',
    words: PATTERN_WORDS,
    scope: SLOT_SCOPE.pattern,
    docs: {
      none: {
        detail: 'carve nothing',
        body: 'Every dial-like pattern was tried on a real 16px favicon and read as noise, so `none` is the only pattern left. It is written as `pattern=none` and never as a bare word, because `none` is also a shape.',
      },
    },
  })

  /** What each option key explains about itself. */
  const KEY_DOCS = {
    shape: { detail: 'background shape', body: `One of ${SHAPES.join(', ')}.` },
    color: { detail: 'disc colour', body: `${COLOR_NAMES.join(', ')} — all presets, chosen so the fish stays legible.` },
    pattern: { detail: 'carved pattern', body: 'Only `none` remains; write it as `pattern=none`.' },
    motion: { detail: 'what moves', body: `One of ${MOTIONS.join(', ')}.` },
    speed: { detail: 'seconds per cycle', body: 'A number: seconds per revolution for `turn`, seconds per cycle otherwise.' },
    bg: { detail: 'an alias for color', body: 'Kept so a document written against an earlier release still says what it means.' },
  }

  /** Every vocabulary, by the scope its words are painted under, for hover. */
  const BY_SCOPE = new Map([
    ['state', STATE_VOCAB],
    [SLOT_SCOPE.shape, SHAPE_VOCAB],
    [SLOT_SCOPE.color, COLOR_VOCAB],
    [SLOT_SCOPE.pattern, PATTERN_VOCAB],
    [SLOT_SCOPE.motion, MOTION_VOCAB],
  ])

  /** The vocabulary that decides a value written for an option key. */
  const VOCAB_FOR_KEY = {
    shape: SHAPE_VOCAB,
    color: COLOR_VOCAB,
    bg: COLOR_VOCAB,
    pattern: PATTERN_VOCAB,
    motion: MOTION_VOCAB,
  }

  /**
   * The completion rows for one slot or option key.
   *
   * A slot already filled by the line still gets a list, because replacing a value
   * is as common as writing the first one — but its own value leads, so accepting
   * the top row changes nothing by accident.
   * @param {string} slot - a positional slot name, or an option key such as `bg`.
   * @param {DshSentryLine | undefined} line - the line the caret is on, when there
   *   is one.
   * @returns {object[]} the rows, ready to rank.
   */
  function valueItems(slot, line) {
    if (slot === 'speed') {
      // A speed is a free number, so the list offers the shipped rates rather than
      // pretending to be exhaustive. The state's own rate leads.
      const current = line?.state === undefined ? undefined : LOOK[line.state]?.speed
      const rates = [...new Set([...Object.values(LOOK).map((entry) => entry.speed), 1, 2, 3])].sort(
        (left, right) => left - right,
      )
      return rates.map((rate) => ({
        label: String(rate),
        insert: String(rate),
        kind: 'number',
        detail: current === rate ? 'the shipped rate for this state' : 'seconds per cycle',
        sortText: current === rate ? '0' : '1',
      }))
    }
    const words = wordsForSlot(slot)
    if (words.length === 0) return []
    const scope = slot === 'bg' ? SLOT_SCOPE.color : SLOT_SCOPE[slot]
    const vocabulary = BY_SCOPE.get(scope)
    const filled = line?.slots[KEY_SLOT[slot] ?? 'shape']
    const noun = slot === 'bg' ? 'color' : slot
    return words.map((word) => {
      const entry = vocabulary?.entryFor(word)
      return {
        label: word,
        insert: word,
        kind: 'value',
        detail: word === filled ? `the current ${noun}` : entry?.detail,
        documentation: entry?.body,
        sortText: word === filled ? '0' : '1',
      }
    })
  }

  return _citisen_litearea.defineGrammar({
    id: 'dsh-sentry-style',
    name: 'dsh-sentry style document',

    // A decimal speed is one token because the number RULE says so, not because `.`
    // is a word character. Leaving `.` out of the predicate stops a stray
    // `circle.` from being read as one word, matching no shape, and earning a
    // diagnostic about a word the user never typed.
    wordChars: /[\p{L}\p{N}_]/u,

    rules: [
      { kind: 'match', scope: 'comment', pattern: /#[^\n]*/ },

      // The first word on a line is a state or it is a mistake. `unknown: {}` asks
      // for the vocabulary's own rejection, and this is the one place in the
      // language where the lexical layer can be that sure: nothing else may stand
      // at the head of a line, so there is no later rule to wait for.
      {
        kind: 'words',
        words: STATE_VOCAB,
        when: { firstOnLine: true },
        unknown: {},
      },

      // `shape=` — the key, seen from the `=` so it cannot also swallow a value.
      { kind: 'match', scope: 'property', pattern: /[A-Za-z][\w-]*(?==)/ },
      { kind: 'match', scope: 'operator', pattern: /=/ },
      { kind: 'match', scope: 'separator', pattern: /,/ },

      // Values. The sets are disjoint, so membership alone places a bare word, and
      // none of these rules rejects: a rule that did would claim a word belonging
      // to the next vocabulary down the list.
      { kind: 'words', words: SHAPE_VOCAB },
      { kind: 'words', words: COLOR_VOCAB },
      { kind: 'words', words: MOTION_VOCAB },
      { kind: 'match', scope: SLOT_SCOPE.speed, pattern: /\d+(?:\.\d+)?/ },

      // Anything left is a word this language does not know. Painting it as invalid
      // rather than as plain text makes a typo visible before the structural pass
      // has even run, and that pass supplies the precise message.
      { kind: 'match', scope: 'invalid', pattern: /\S+/ },
    ],

    fallbackScope: 'text',

    // ── what the document means ─────────────────────────────────────────────
    //
    // This walk decides the slot filling AND records what went wrong, rather than
    // leaving the second job to a second walk. They are the same decision: the only
    // reason to know which slot is free is to say what a word that fits nothing
    // should have been, and splitting them would mean two implementations of one
    // rule — which is exactly how the editors this library replaces came to
    // disagree with themselves.
    analyze: (text) => {
      const starts = _citisen_litearea.lineStarts(text)
      const lines = []
      const problems = []

      for (let number = 0; number < starts.length; number += 1) {
        const from = starts[number] ?? 0
        const rawTo = starts[number + 1] ?? text.length
        let to = rawTo
        while (to > from && (text.charAt(to - 1) === '\n' || text.charAt(to - 1) === '\r')) to -= 1
        const raw = text.slice(from, to)
        // The host parser splits the comment off at the first `#` anywhere on the
        // line, so a `#` inside a value begins a comment there too.
        const comment = raw.indexOf('#')
        const body = comment === -1 ? raw : raw.slice(0, comment)

        const words = []
        const wordPattern = /[^\s,]+/g
        let match
        while ((match = wordPattern.exec(body)) !== null) {
          words.push({
            text: match[0],
            from: from + match.index,
            to: from + match.index + match[0].length,
          })
        }

        const line = {
          number,
          state: undefined,
          known: true,
          words,
          slots: {},
          keys: [],
          pendingKey: undefined,
        }
        lines.push(line)

        const first = words[0]
        if (first === undefined) continue
        line.state = first.text
        line.known = STATES.includes(first.text)
        // An unknown state is a dead end for the parser: it discards the rest of
        // the line, so complaining about the values on it would be inventing
        // problems the document does not have.
        if (!line.known) continue

        /**
         * Record the value a slot ended up with.
         * @param {DshSentrySlot} slot - the slot being filled.
         * @param {string} value - the value as written.
         * @returns {void}
         */
        const claim = (slot, value) => {
          line.slots[slot] = value
        }

        for (let index = 1; index < words.length; index += 1) {
          const word = words[index]
          if (word === undefined) continue
          const equals = word.text.indexOf('=')
          const key = equals === -1 ? undefined : word.text.slice(0, equals)
          const value = equals === -1 ? undefined : word.text.slice(equals + 1)

          if (key !== undefined) {
            line.keys.push(key)
            // `key` exists only because the word held an `=`, so there is always a
            // right-hand side; an empty one means the value is still being typed.
            const written = value ?? ''
            if (written === '') {
              line.pendingKey = key
              continue
            }
            const complaint = valueProblem(key, written)
            if (complaint !== undefined) {
              problems.push({
                from: word.from,
                to: word.to,
                message: complaint,
                code: 'bad-option-value',
                severity: 'warning',
              })
              continue
            }
            const slot = KEY_SLOT[key]
            if (slot !== undefined) claim(slot, written)
            continue
          }

          // A bare word is placed by what it IS. The sets are disjoint, which is
          // what lets the position be inferred without the slot order mattering.
          if (MOTIONS.includes(word.text)) {
            claim('motion', word.text)
            continue
          }
          if (SHAPES.includes(word.text)) {
            claim('shape', word.text)
            continue
          }
          if (COLOR_NAMES.includes(word.text)) {
            claim('color', word.text)
            continue
          }
          if (PATTERNS.includes(word.text)) {
            claim('pattern', word.text)
            continue
          }
          if (Number.isFinite(Number.parseFloat(word.text))) {
            claim('speed', word.text)
            continue
          }

          // It fits nothing, so the host parser measures it against the first slot
          // the line has not filled — and since every value set has been ruled out
          // above, the answer can only be "not valid for that slot" or "there is no
          // slot left".
          const free = SLOTS.find((slot) => line.slots[slot] === undefined)
          if (free === undefined) {
            problems.push({
              from: word.from,
              to: word.to,
              message: `"${word.text}" has nowhere to go — this line already names a shape, colour, pattern, motion, and speed.`,
              code: 'unexpected-value',
              severity: 'error',
            })
          } else {
            problems.push({
              from: word.from,
              to: word.to,
              message: `"${word.text}" is not a valid ${free} — expected ${expectedList(free)}.`,
              code: 'bad-value',
              severity: 'error',
            })
          }
        }
      }

      return { lines, problems }
    },

    // ── what the tokens must be ─────────────────────────────────────────────
    // One declarative check, because "a key must be one it knows" is exactly the
    // shape a check is for: a scope, an allowed set, and a message.
    checks: [
      {
        code: 'unknown-option',
        scopes: ['property'],
        allow: closedVocabulary({ id: 'option', words: [...OPTIONS, ...PATTERNS] }),
        severity: 'error',
        message: 'Unknown option "{word}" — this document understands {allowed}.',
      },
    ],

    validate: (context) => {
      for (const problem of context.state.problems) {
        context.report({
          from: problem.from,
          to: problem.to,
          message: problem.message,
          code: problem.code,
          severity: problem.severity,
        })
      }
    },

    // ── what can come next ──────────────────────────────────────────────────
    compose: [
      {
        id: 'state',
        // A state opens a line, so its list belongs at the head of one — and it has
        // to stay offered while the state is being spelled, which is why this asks
        // `firstWord` rather than `firstOnLine`. Asking the stricter question makes
        // the list vanish after the first letter, which is precisely the "the
        // completion feels unnatural" complaint this grammar exists to answer.
        when: (context) => context.firstWord,
        range: (context) => context.word,
        items: () =>
          STATES.map((state) => ({
            label: state,
            insert: state,
            // A space is what the next word on the line needs. The engine will not
            // add a second one if the document already has whitespace there.
            append: ' ',
            kind: 'state',
            detail: STATE_VOCAB.entryFor(state)?.detail,
            documentation: STATE_VOCAB.entryFor(state)?.body,
            sortText: '0',
          })),
      },
      {
        id: 'value',
        when: (context) => {
          const line = context.state.lines[context.line.number]
          // Values belong to a line that has opened a state, and to the part of it
          // after the state word.
          if (line === undefined || line.state === undefined || !line.known) return false
          const stateWord = line.words[0]
          return stateWord !== undefined && context.caret > stateWord.to
        },
        range: (context) => context.word,
        items: (context) => {
          const line = context.state.lines[context.line.number]
          // Inside `key=`, the key names the slot, so the list is exactly that
          // slot's vocabulary.
          const key = optionAtCaret(context.line.before)
          if (key !== undefined && key !== '') {
            return valueItems(key, line)
          }
          const free = SLOTS.find((slot) => line?.slots[slot] === undefined)
          const items = free === undefined ? [] : valueItems(free, line)
          // The keys follow the values: a line names values far more often than it
          // switches to the `key=value` spelling, so the values lead.
          for (const key of OPTIONS) {
            if (line?.keys.includes(key) === true) continue
            const doc = KEY_DOCS[key]
            items.push({
              label: `${key}=`,
              insert: `${key}=`,
              kind: 'property',
              detail: doc?.detail,
              documentation: doc?.body,
              sortText: '1',
            })
          }
          return items
        },
      },
    ],

    // ── what a thing is ─────────────────────────────────────────────────────
    describe: (context) => {
      const token = context.token
      if (token === undefined) return undefined
      if (token.scope === 'comment') {
        return { title: 'comment', body: 'Ignored by the parser. A `#` anywhere on a line starts one.' }
      }
      if (token.scope === 'property') {
        const doc = KEY_DOCS[token.text]
        return doc === undefined ? undefined : { title: token.text, detail: doc.detail, body: doc.body }
      }
      if (token.scope === 'operator' || token.scope === 'separator') return undefined
      if (token.scope === 'invalid') {
        return {
          title: token.text,
          detail: 'not part of this language',
          body: 'Nothing here accepts this word: it is not a state, not one of the option keys, and not a value any slot recognises.',
        }
      }
      if (token.scope === SLOT_SCOPE.speed) {
        return {
          title: token.text,
          detail: 'seconds per cycle',
          body: 'Seconds per revolution for `turn`, seconds per cycle otherwise.',
        }
      }
      const entry = BY_SCOPE.get(token.scope)?.entryFor(token.text)
      // Nothing documented means nothing to say. Falling back to the scope name
      // would put an internal identifier in front of the user — resting the pointer
      // on a gap in the document once produced a tooltip whose only content was the
      // word `text`.
      return entry === undefined
        ? undefined
        : { title: token.text, detail: entry.detail, body: entry.body }
    },
  })
}
/** Settings namespace owned by this plugin (mirrors the host half). */
const SENTRY_NAMESPACE = 'alert'
/** Locale namespace owning this feature's settings-row copy. */
const LOCALE_NAMESPACE = 'settings.alert'
/** Cosmetic namespace for this plugin's CSS classes. */
const STYLE_PREFIX = 'dsh-sentry'
/**
 * The plugin's identity, substituted with the real package name by
 * `scripts/build-client.mjs`. It tags the stylesheet this plugin owns and heads
 * its diagnostics, so a bundle mounted under another name says so.
 */
const PLUGIN_ID = "@citisen/dsh-sentry"

// ─── the state model ─────────────────────────────────────────────────────────

/**
 * The four states a session can be in, most urgent first.
 *
 * `waiting` and `approval` are the two halves of "a human must act": the agent
 * asked a question (`ask_user_question`, which includes the plan-review card) or
 * requested a permission escalation. They are separate states because they want
 * different sounds, and because a session blocked on approval and a session
 * blocked on a question are different situations to come back to.
 */
const STATES = ['waiting', 'approval', 'running', 'done']

/** Ring and badge colors, one per state. */
const STATE_COLORS = {
  waiting: '#f59e0b',
  approval: '#f59e0b',
  running: '#4d6bfe',
  done: '#22c55e',
}

/**
 * How long a finished session keeps the green "done" signal, by default.
 *
 * Deliberately not the session's `completed` flag: that stays true until the user
 * selects the session, so trusting it would leave the tab green forever and cost
 * the signal all of its meaning. This is a decay window measured from the
 * running → idle edge instead.
 */
const DEFAULT_DONE_WINDOW_MS = 60_000

/** The shortest gap between two chimes, in ms. */
const SOUND_GAP_MS = 1500

/**
 * The fish, verbatim from the shipped favicon
 * (`dsh-web-frontend/dist/favicon.svg`): a `viewBox="0 0 50 50"` glyph drawn in a
 * single path. Copied byte-for-byte rather than redrawn or simplified — the tab
 * icon is the product's identity, and an approximation of it would be a worse
 * icon than the real thing. `scripts/verify-client.mjs` reads the fish straight
 * out of the active dsh install and fails the check when this copy drifts.
 */
const FISH_PATH =
  'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

/**
 * The plan used before the first snapshot arrives, so the title observer and the
 * first render have a well-formed value to read.
 */
const EMPTY_PLAN = {
  bySession: new Map(),
  active: [],
  finished: [],
  waiting: 0,
  approval: 0,
  running: 0,
  done: 0,
}

// ─── session state, as a pure projection ─────────────────────────────────────

/**
 * The state a pending interaction puts its session in, if it is one the user
 * must act on.
 *
 * The wire kinds are `'question'` and `'approval'`; the states are `'waiting'`
 * and `'approval'`. The rename is deliberate rather than incidental: "waiting"
 * is what the *user* is doing, and the tab can only be about the user. Keeping
 * the wire word here would leak the domain's vocabulary into the icon.
 *
 * @param entry - the pending-interaction entry for that session, if any.
 * @returns `'waiting'`, `'approval'`, or undefined.
 */
function blockedKind(entry) {
  const kind = entry?.kind
  if (kind === 'question') return 'waiting'
  if (kind === 'approval') return 'approval'
  return undefined
}

/**
 * What every session is doing, and which of them the user must act on.
 *
 * The precedence is the whole point: a session that is running *and* waiting for
 * an answer is waiting, because the running part is not the part that needs the
 * user. `done` is derived from an edge rather than from `summary.completed` — see
 * {@link DEFAULT_DONE_WINDOW_MS}.
 *
 * A blank session (created and never used) is not information and is left out
 * entirely; otherwise opening a new tab would immediately paint a "1 running"
 * ring around an empty conversation.
 *
 * @param list - the session-list snapshot (`{ ids, byId }`).
 * @param pending - the pending-interaction snapshot, `SessionId -> entry`.
 * @param stamps - `SessionId -> running → idle edge timestamp`, persisted.
 * @param options - `{ now, doneWindowMs }`.
 * @returns the plan: per-session states, counts, and the fresh completions.
 */
function sessionPlan(list, pending, stamps, options) {
  const { now, doneWindowMs } = options
  const bySession = new Map()
  const finished = []
  const active = []

  for (const id of list?.ids ?? []) {
    const summary = list?.byId?.[id]
    if (summary === undefined || summary.blank === true) continue

    let state
    let fresh = false
    const kind = blockedKind(pending?.get?.(id))
    if (kind !== undefined) {
      state = kind
    } else if (summary.running === true) {
      state = 'running'
    } else {
      const stamp = stamps?.[id]
      if (typeof stamp === 'number' && now - stamp < doneWindowMs) {
        state = 'done'
        fresh = true
      }
    }
    if (state === undefined) continue

    bySession.set(id, { state, fresh })
    active.push(id)
    if (fresh) finished.push(id)
  }

  /** @param state - the state to count. @returns how many sessions are in it. */
  const count = (state) => active.filter((id) => bySession.get(id).state === state).length

  return {
    bySession,
    active,
    finished,
    waiting: count('waiting'),
    approval: count('approval'),
    running: count('running'),
    done: count('done'),
  }
}

/**
 * State changes between two plans that are worth an alert.
 *
 * Edge-triggered, never level-triggered: a session that was already waiting for
 * an answer does not chime again on every unrelated store notification. The
 * previous plan is the baseline, so restarting the plugin treats what is already
 * on screen as known rather than shouting about it again.
 *
 * @param prev - the previous plan, or undefined before the first snapshot.
 * @param next - the current plan.
 * @returns `{ questions, approvals, completed }` session-id lists.
 */
function changeAlerts(prev, next) {
  /** @param state - the state to diff. @returns ids that entered it. */
  const entered = (state) =>
    next.active.filter(
      (id) => next.bySession.get(id).state === state && prev?.bySession?.get(id)?.state !== state,
    )
  return {
    questions: entered('waiting'),
    approvals: entered('approval'),
    completed: next.finished.filter((id) => prev?.bySession?.get(id)?.state !== 'done'),
  }
}

/**
 * Whether anything at all deserves the user's attention.
 * @param plan - the session plan.
 * @returns whether the favicon or the title should say something.
 */
function planHasSignal(plan) {
  return plan.waiting + plan.approval + plan.running + plan.done > 0
}

// ─── the favicon ─────────────────────────────────────────────────────────────

/**
 * The style DSL.
 *
 * A tab icon is not a form: it is four states, each a colour, a background shape,
 * a carved pattern, and a motion, and the interesting part is the *combinations*.
 * A dozen switches could express that; they would also take a dozen interactions
 * to say what one line says. So the whole appearance is one small text document,
 * and the settings row gives it a text box and the documentation.
 *
 * The syntax is line-oriented on purpose. Every line is one `key value` pair, and
 * a line naming a state opens a rule until the next one:
 *
 *   # comments and blank lines are ignored
 *   fallback none                      # when no state applies
 *   running  circle blue spokes=2 arrow turn 3
 *   waiting  rounded amber none blink 1.1
 *
 * The parser is total: anything it does not understand is dropped and reported,
 * and the shipped defaults are used for whatever the document does not say. A
 * typo in a settings file must not be able to leave a tab without an icon.
 *
 * @module dsh-sentry/style
 */

/** The background shapes a rule may name. */
const SHAPES = ['circle', 'rounded', 'square', 'none']

/**
 * The patterns a rule may carve out of the background.
 *
 * Empty, and that is a finding rather than an omission: every pattern that did not
 * involve the fish itself was tried on a real 16px favicon and read as noise —
 * clock hands made the icon look like a watch, petals and windmill blades turned it
 * into a smudge. The literal `none` is still accepted for the `pattern=` option, so
 * a document written against an earlier release parses and says what it means; it
 * is deliberately **not** a bare-word alternative, because `none` is also a shape
 * and a token cannot mean two things.
 */
const PATTERNS = []

/** The motions a rule may apply. */
const MOTIONS_LIST = ['still', 'turn', 'blink', 'flush']

/**
 * The preset palette. Colours are named rather than free-form because the two
 * failures this plugin has already shipped were both contrast failures — a white
 * fish on a light disc, and a black fish on a dark one — and a free colour picker
 * gives the user a way to reproduce them. A preset cannot be illegible.
 */
const PRESET_COLORS = {
  blue: '#4d6bfe',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#8b8f97',
  dark: '#23262c',
  light: '#eef0f3',
}

/** What an unconfigured install draws. */
const DEFAULT_STYLE = [
  'running  circle  blue  turn   3',
  'waiting  rounded amber blink  1.1',
  'approval rounded amber blink  1.9',
  'done     circle  green flush  1.6',
].join('\n')

/** The states a document may address, in the order the help text lists them. */
const STYLE_STATES = ['running', 'waiting', 'approval', 'done']

/**
 * The option keys a rule may write as `key=value`.
 *
 * Declared once because two readers have to agree on it: `parseStyle` accepts
 * exactly these keys, and the editor's grammar offers exactly these — the grammar
 * takes the list as an option rather than carrying its own. Two lists that happen to
 * agree today is how a suggestion comes to offer a key the parser then reports.
 */
const STYLE_OPTIONS = ['shape', 'color', 'pattern', 'motion', 'speed', 'bg']

/**
 * Whether a bare token is a legal value for one positional slot.
 *
 * The check exists so a typo is *reported* rather than quietly landing in a slot
 * whose coercion will later discard it. A line that says `nope` should say so;
 * silence would leave the user staring at an unchanged icon with no explanation.
 *
 * @param slot - the slot name.
 * @param token - the bare token.
 * @returns whether it fits.
 */
function fitsSlot(slot, token) {
  if (slot === 'shape') return SHAPES.includes(token)
  if (slot === 'color') return PRESET_COLORS[token] !== undefined
  if (slot === 'pattern') return PATTERNS.includes(token)
  if (slot === 'motion') return MOTIONS_LIST.includes(token)
  return Number.isFinite(Number.parseFloat(token))
}

/**
 * Parse one style document.
 *
 * A line is a state name followed by tokens. A token is either `key=value` or a
 * bare word, and a bare word is placed in the first slot the line has not filled:
 * shape, then colour, then pattern, then motion, then speed. Two shapes of token
 * are worth calling out because they read as one thing and set two:
 * `spokes=3` sets the pattern *and* its count, and a trailing bare number with
 * every other slot filled is the speed — so both `spokes=2 dot turn 3` and
 * `speed=3` mean what they look like.
 *
 * @param text - the document, or anything else a settings file happened to hold.
 * @returns `{ rules, problems }` — a rule per state, plus a human-readable note
 *   for every token that was ignored.
 */
function parseStyle(text) {
  const rules = {}
  const problems = []
  if (typeof text !== 'string' || text.trim() === '') return { rules, problems }

  const POSITIONAL = ['shape', 'color', 'pattern', 'motion', 'speed']

  let current
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (line === '') continue
    const tokens = line.split(/[\s,]+/).filter((token) => token !== '')
    const name = tokens.shift()
    if (name === undefined) continue

    if (STYLE_STATES.includes(name)) {
      current = { state: name }
      rules[name] = current
    } else {
      problems.push(`unknown state "${name}"`)
      current = undefined
      continue
    }

    for (const token of tokens) {
      const equals = token.indexOf('=')
      const key = equals === -1 ? undefined : token.slice(0, equals)
      const value = equals === -1 ? undefined : token.slice(equals + 1)

      if (key !== undefined && STYLE_OPTIONS.includes(key)) {
        // `pattern=none` is how a document says "carve nothing" now that the bare
        // word belongs to the shape slot. It is the same fact either way.
        current[key] = value
        continue
      }
      // A token whose left side names a pattern is that pattern, with its count:
      // `spokes=3` is what the shipped defaults used to say.
      if (key !== undefined && PATTERNS.includes(key)) {
        current.pattern = key
        if (value !== '') current.marks = value
        continue
      }
      if (key !== undefined) {
        problems.push(`${name}: unknown option "${key}"`)
        continue
      }
      if (PATTERNS.includes(token)) {
        current.pattern = token
        continue
      }
      if (MOTIONS_LIST.includes(token)) {
        current.motion = token
        continue
      }
      if (SHAPES.includes(token)) {
        current.shape = token
        continue
      }
      if (PRESET_COLORS[token] !== undefined) {
        current.color = token
        continue
      }
      // A bare number can only be the rate. Placing it in whatever slot happens to
      // be free next would put it in `color` on a line that named a shape and a
      // motion and skipped the rest — which is exactly the documented
      // `running none turn 3`, and it used to be reported as an invalid colour.
      if (Number.isFinite(Number.parseFloat(token))) {
        current.speed = token
        continue
      }
      const next = POSITIONAL.find((slot) => current[slot] === undefined)
      if (next === undefined) problems.push(`${name}: unexpected "${token}"`)
      else if (fitsSlot(next, token)) current[next] = token
      else problems.push(`${name}: "${token}" is not a valid ${next}`)
    }
  }
  return { rules, problems }
}

/**
 * Coerce one parsed rule into something drawable, or undefined to keep the
 * default. Every field is checked here rather than at draw time, so a bad value
 * degrades to the shipped appearance instead of to a broken SVG.
 *
 * @param rule - the parsed rule.
 * @param defaults - the shipped rule for that state.
 * @returns the resolved look.
 */
function resolveLook(rule, defaults) {
  if (rule === undefined) return { ...defaults }

  const shape = SHAPES.includes(rule.shape) ? rule.shape : defaults.shape
  const color =
    PRESET_COLORS[rule.color] !== undefined
      ? rule.color
      : PRESET_COLORS[rule.bg] !== undefined
        ? rule.bg
        : defaults.color
  const pattern = PATTERNS.includes(rule.pattern) ? rule.pattern : defaults.pattern
  const motion = MOTIONS_LIST.includes(rule.motion) ? rule.motion : defaults.motion
  const speed = Number.parseFloat(rule.speed ?? '')

  return {
    shape,
    color,
    pattern,
    motion,
    speed: Number.isFinite(speed) && speed >= 0.2 && speed <= 20 ? speed : defaults.speed,
  }
}

/**
 * The shipped look per state, before any document is applied.
 *
 * These are the defaults the documentation quotes, and the ones a rule inherits
 * field by field: naming only a colour in a document keeps the shipped shape,
 * pattern, and motion for that state.
 *
 * `running` turns the **fish**, not a pattern. A dial-like ring of spokes was
 * tried and read as a watch face rather than as a state; the fish is the thing
 * this icon is about, so the fish is the thing that moves.
 */
const DEFAULT_LOOK = {
  running: { shape: 'circle', color: 'blue', pattern: 'none', motion: 'turn', speed: 3 },
  waiting: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.1 },
  approval: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.9 },
  done: { shape: 'circle', color: 'green', pattern: 'none', motion: 'flush', speed: 1.6 },
}

/** The appearance a document resolves to, per state. */
const STYLE_FALLBACK_LOOK = { shape: 'none', color: 'gray', pattern: 'none', motion: 'still', speed: 1 }

/**
 * Resolve a whole document against the shipped defaults.
 * @param text - the document.
 * @returns `{ look, problems }` — a resolved appearance per state.
 */
function resolveStyle(text) {
  const { rules, problems } = parseStyle(text)
  const look = {}
  for (const state of STYLE_STATES) {
    look[state] = resolveLook(rules[state], DEFAULT_LOOK[state])
  }
  look.fallback = resolveLook(undefined, STYLE_FALLBACK_LOOK)
  return { look, problems }
}

// ─── the primitives ──────────────────────────────────────────────────────────


/**
 * The background's outline, as a shape the mask can start from.
 *
 * The background is always drawn white here — it is the mask's "keep this" area —
 * and the caller paints the real colour through it.
 *
 * @param look - the resolved appearance.
 * @returns the SVG shape element.
 */
function backgroundShape(look) {
  const color = PRESET_COLORS[look.color] ?? PRESET_COLORS.gray
  if (look.shape === 'none') return ''
  if (look.shape === 'rounded') {
    return `<rect x="0.8" y="0.8" width="30.4" height="30.4" rx="8" fill="${color}"/>`
  }
  if (look.shape === 'square') {
    return `<rect x="0.8" y="0.8" width="30.4" height="30.4" rx="4" fill="${color}"/>`
  }
  return `<circle cx="16" cy="16" r="15.2" fill="${color}"/>`
}

/**
 * The carved pattern for one look.
 *
 * Every mark is drawn black, because black is what the mask cuts away: the
 * background is the only thing with a colour, and everything carved out of it
 * shows the tab bar through. That is the whole reason the icon survives a browser
 * theme this plugin cannot see.
 *
 * Nothing here survives the vocabulary except the fish, which is carved by
 * {@link sentryFavicon} itself rather than by this function. The dial-like
 * patterns this used to draw — spokes, hands, petals, windmill, dots, rays — were
 * all tried at the real 16px size and all of them read as noise around a fish
 * nobody could then see. A shape slot with one legal value is not a wasted slot:
 * it is the record of a question that got answered.
 *
 * @param look - the resolved appearance.
 * @returns the SVG elements.
 */
function patternShapes(look) {
  void look
  return ''
}

/**
 * The motion for one look, as a **static** animation element.
 *
 * Only `turn` is left to SMIL, and only because it is stateless: a rotating group
 * is the same drawing at every instant, so a declarative animation costs nothing
 * and needs no bookkeeping. `blink` and `flush` change something the drawing
 * itself carries — a dim flag, a pulsing colour — and are driven by
 * {@link motionTick} instead.
 *
 * That split is not an aesthetic choice. A favicon is rendered in a document the
 * page does not own, and the motion categories do not have equal standing there:
 * the first version of this relied on a transform animation for the spin and on
 * presentation animations for the pulse, and was reported as "the animation does
 * not move". Driving the repaint from the plugin removes the question entirely —
 * the plugin already rebuilds the data URL on every state change, so a motion
 * that is a function of time is the same code path with a timer in front of it.
 *
 * @param look - the resolved appearance.
 * @param reducedMotion - whether the user asked for less movement.
 * @returns the SVG animation element, or `''`.
 */
function motionElement(look, reducedMotion) {
  return ''
}

/** How often a driven motion repaints, in milliseconds. */
const TICK_MS = 120

/**
 * The colour a `flush` pulses toward.
 * @param name - the preset name.
 * @returns the partner hex.
 */
function flushPartner(name) {
  return name === 'green' ? PRESET_COLORS.blue : PRESET_COLORS.green
}

/**
 * What one repaint of a driven motion looks like.
 *
 * The result is handed straight to {@link sentryFavicon}, which makes a motion a
 * function from a tick count to an appearance and nothing else — and therefore
 * verifiable in Node, with no browser and no clock: `blink` dims on alternate
 * half-periods, `flush` alternates the colour once per period, and `turn` steps
 * the angle. Every rate is expressed in the seconds the DSL's `speed` already
 * means, so a document that says `blink 1.1` still gets a 1.1-second breath.
 *
 * @param look - the resolved appearance.
 * @param tick - a monotonically increasing tick count.
 * @returns `{ angle, dim, color }` overrides for the draw.
 */
function motionTick(look, tick) {
  if (look.motion === 'blink') {
    // `speed` is seconds per full breath, so the dim half lasts half of it.
    const halfTicks = Math.max(1, Math.round(((look.speed * 1000) / 2) / TICK_MS))
    return { dim: Math.floor(tick / halfTicks) % 2 === 1 }
  }
  if (look.motion === 'flush') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return {
      color: Math.floor(tick / ticks) % 2 === 1 ? flushPartner(look.color) : PRESET_COLORS[look.color],
    }
  }
  if (look.motion === 'turn') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return { angle: round2(((tick % ticks) / ticks) * 360) }
  }
  return {}
}

/**
 * How long one repaint interval lasts for a look, or undefined for a still one.
 *
 * Every motion is driven, `turn` included. The declarative transform animation is
 * not used for the shipped appearance: it was the one that did not move, and a
 * favicon is drawn in a document this plugin does not own, where the motion
 * categories do not have equal standing. A timer for as long as something is
 * animating is a small price for a motion that cannot silently do nothing.
 *
 * @param look - the resolved appearance.
 * @param reducedMotion - whether the user asked for less movement.
 * @returns the interval in milliseconds, or undefined.
 */
function tickInterval(look, reducedMotion) {
  if (reducedMotion || look.motion === 'still') return undefined
  return TICK_MS
}

// ─── the favicon ─────────────────────────────────────────────────────────────

/**
 * Round to two decimals, so float noise like `5.6000000000000005` does not reach
 * a data URL that is rebuilt on every state change.
 * @param value - the number.
 * @returns the rounded number.
 */
function round2(value) {
  return Math.round(value * 100) / 100
}
/**
 * The fish's own scale: the shipped art is a 50×50 drawing, so placing it at full
 * size in the 32px canvas is exactly `32/50`.
 *
 * This is the whole point of the icon. At the 0.416 the first version used, the
 * fish occupied 41% of the canvas and the ring took the rest — measured on a real
 * 16px favicon that is a ~5-pixel glyph inside a nearly-invisible ring, which is
 * what "both are unclear" meant. At full size the fish *is* the icon.
 *
 * One consequence is worth stating: the art is wider than it is tall, so at full
 * size it reaches the background's edge. The fish is carved rather than painted
 * precisely so that this is legible rather than cramped — there is no stroke to
 * collide with, only the tab bar showing through.
 */
const FISH_FULL_SCALE = 32 / 50

/**
 * The art's largest half-extent, in its own 50-unit space.
 *
 * Measured from the path's own bounding box in a browser — 48.34 wide by 36.32
 * tall, centred at (25.17, 25.16) — rather than assumed. Half of the larger axis
 * is how far the glyph reaches from its centre, and that is the number a rotation
 * has to fit inside the background.
 */
const FISH_HALF_EXTENT = 24.17

/**
 * The radius the turning fish is allowed to sweep, in canvas units.
 *
 * The background's edge is at 15.2, and this leaves a little air so the glyph
 * never touches the rim mid-turn.
 */
const FISH_TURN_RADIUS = 14.3

/**
 * How much the fish shrinks when it turns.
 *
 * A wide glyph rotating about its centre sweeps a circle of its larger half-extent,
 * so at full size this fish would reach `24.17 × 0.64 ≈ 15.5` — past the
 * background's 15.2 edge, clipping twice per revolution, which at 16px reads as a
 * flicker rather than as a turn. Deriving the scale from the measured extent keeps
 * the glyph as large as it can be while staying inside, and means the constant
 * cannot drift away from the art it was computed for.
 *
 * The alternative — keep it full size and let it clip — was rejected: the whole
 * point of carving the fish is that its silhouette is always complete.
 */
const FISH_TURN_SCALE = round2(FISH_TURN_RADIUS / (FISH_HALF_EXTENT * FISH_FULL_SCALE))

/**
 * The radius the turning fish actually sweeps at that scale.
 *
 * This is the number that must stay inside the background, so it is named and
 * checked rather than left as a claim in a comment.
 */
const FISH_SWEPT_RADIUS = round2(FISH_HALF_EXTENT * FISH_FULL_SCALE * FISH_TURN_SCALE)



/**
 * The appearance the icon is drawn with right now.
 *
 * One tab has one background, so the dominant state decides the whole icon — and
 * the most urgent fact is the one worth it: a question outranks a busy tab,
 * because "someone is waiting for you" is not something a spinner should be able
 * to hide.
 *
 * @param plan - the session plan.
 * @param style - the resolved styles, or undefined for the shipped ones.
 * @returns the look to draw.
 */
function activeLook(plan, style) {
  const look = style ?? DEFAULT_LOOK
  const blocking = plan.waiting > 0 ? 'waiting' : plan.approval > 0 ? 'approval' : undefined
  const state = blocking ?? (plan.running > 0 ? 'running' : 'done')
  return look[state] ?? DEFAULT_LOOK[state]
}

/**
 * The favicon, as an SVG string: a state-coloured background with the fish and the
 * state's pattern carved out of it.
 *
 * The fish is **negative space**, not a painted glyph. That decision is what makes
 * the icon work at 16px: the silhouette is the tab bar showing through, so it is
 * legible against any background colour, in any browser theme, and never competes
 * with the background for contrast. Painting it instead produced a white shape on
 * a coloured disc whose edges smeared at favicon size, and a black shape on a dark
 * disc that vanished entirely.
 *
 * @param plan - the session plan.
 * @param options - `{ reducedMotion, style, motion }`, where `style` is the
 *   resolved look per state from {@link resolveStyle} and `motion` is the
 *   per-tick override from {@link motionTick}.
 * @returns the SVG source, or undefined when there is nothing to show.
 */
function sentryFavicon(plan, options) {
  if (!planHasSignal(plan)) return undefined
  const { reducedMotion, style, motion = {} } = options
  const chosen = activeLook(plan, style)

  // The fish, centered by construction: the translate puts the art's own 50-unit
  // centre on the canvas centre, so no margin arithmetic can drift it.
  //
  // A `turn` rotates the fish itself, about the canvas centre. That is the state
  // indicator the running state gets: the icon is *about* this glyph, so the glyph
  // is what moves, and nothing else has to be drawn to say "working". The scale
  // drops a little while it turns so the swept corners stay inside the background
  // (see {@link FISH_TURN_SCALE}).
  const spin = motion.angle === undefined || motion.angle === 0 ? 0 : round2(motion.angle)
  const scale = spin === 0 ? FISH_FULL_SCALE : FISH_FULL_SCALE * FISH_TURN_SCALE
  const shift = round2(16 - 16 * scale)
  const placed =
    `translate(${String(shift)} ${String(shift)}) scale(${String(scale)}) translate(-16 -16) translate(16 16)`
  const fish = `<g transform="${placed}"><path d="${FISH_PATH}" fill="#000" fill-rule="nonzero"/></g>`

  // The mask is the background: everything drawn on it in black is carved out, so
  // the fish is negative space and its silhouette is always the tab bar showing
  // through. Rotating it here rather than on the painted layer is what keeps the
  // background's outline still — a turning background would read as a spinning
  // badge, not as a working fish.
  const carvings =
    spin === 0 ? fish : `<g transform="rotate(${String(spin)} 16 16)">${fish}</g>` + patternShapes(chosen)

  const mask =
    `<mask id="disc" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">` +
    `<rect x="0" y="0" width="32" height="32" fill="#000"/>${backgroundShape(chosen)}${carvings}</mask>`

  // The badge is painted rather than carved: it is the one mark that must stay
  // readable on a tab bar of any colour, so it wears its own keyline.
  const badge =
    plan.waiting >= 1 && plan.waiting <= 3
      ? `<circle cx="26.6" cy="5.4" r="5.4" fill="${PRESET_COLORS.amber}" stroke="#0b0d10" stroke-width="1"/>` +
        `<text x="26.6" y="8.4" font-size="9" font-weight="700" text-anchor="middle" fill="#0b0d10">${plan.waiting}</text>`
      : ''

  // A driven motion dims the whole icon; SMIL would have animated `opacity`, and
  // this is the same idea expressed as a value the caller computes.
  const dimmed = motion.dim === true
  const paint = motion.color ?? PRESET_COLORS[chosen.color] ?? PRESET_COLORS.gray

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<defs>${mask}</defs>` +
    `<g${dimmed ? ' opacity="0.3"' : ''}>${motionElement(chosen, reducedMotion)}` +
    `<rect x="0" y="0" width="32" height="32" fill="${paint}" mask="url(#disc)"/>` +
    `</g>` +
    badge +
    `</svg>`
  )
}

/**
 * The same SVG as a usable favicon `href`.
 *
 * The whole document is percent-encoded rather than hand-escaping the characters
 * that look dangerous. Hand-escaping is a losing game here: the SVG carries a `#`
 * inside the fish's own path data, and a substitution that misses one instance
 * produces a data URL the browser truncates at that point — an icon that renders
 * as half a fish.
 *
 * @param svg - the SVG source.
 * @returns the `data:` URI.
 */
function faviconHref(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ─── the title ───────────────────────────────────────────────────────────────

/**
 * Splits a `status · rest` prefix off a title.
 *
 * Matched by *shape* rather than by an exact string, because what has to come off
 * is whatever prefix an earlier render or an earlier instance of this plugin
 * wrote — which may be a different status, in either language. The shape is: an
 * optional circled digit, a run of status text, then the separator. The class
 * stops at `—` as well as at `·` so it can never run across the whole title, and
 * `([^·—]*?)` is lazy so a status that contains its own inner ` · ` (the waiting
 * and approval counts are joined by one) still matches the whole prefix.
 */
const TITLE_PREFIX = /^(?:[①-⑨]\s*)?[^·—]+?\s·\s/

/**
 * The marker this plugin puts at the end of a title it has composed.
 *
 * A zero-width space: invisible in the tab, and — because nothing else writes one
 * — an unambiguous signature. Without it there is no way to tell "the plugin
 * installed this prefix" from "the app's own title happens to contain a ` · `",
 * and the difference decides whether removing the prefix removes the plugin's
 * contribution or a real segment of the app's title.
 *
 * Appended rather than prepended so it never shifts the text the user reads.
 */
const TITLE_MARK = '\u200b'

/** The circled digits the waiting count is capped at, so the prefix never wraps. */
const WAITING_GLYPH = '①②③'

/**
 * The status segment for a plan, or `''` when there is nothing to say.
 * @param plan - the session plan.
 * @param t - the translator, so the title language follows the interface.
 * @returns the segment text.
 */
function titleStatus(plan, t) {
  const parts = []
  if (plan.waiting > 0) {
    const glyph = WAITING_GLYPH[Math.min(plan.waiting, WAITING_GLYPH.length) - 1]
    parts.push(`${glyph} ${t('alert.status.waiting')}`)
  }
  if (plan.approval > 0) parts.push(t('alert.status.approval'))
  if (parts.length > 0) return parts.join(' · ')
  if (plan.running > 0) return t('alert.status.running')
  if (plan.done > 0) return t('alert.status.done')
  return ''
}

/**
 * The title with a status segment in front of it, or unchanged.
 *
 * **Additive only.** Stripping belongs to {@link applyTitle}, where the marker
 * makes "this is my prefix" decidable; a strip here would be a guess, and a guess
 * here is destructive — judged by the `status · rest` shape, an app title that
 * happens to contain a ` · ` looks exactly like a prefix, and every render would
 * eat one more real segment of it.
 *
 * @param current - the app's own title text, without this plugin's prefix.
 * @param plan - the session plan.
 * @param t - the translator.
 * @returns the title to write, or `current` when there is no status to add.
 */
function titleWithStatus(current, plan, t) {
  const base = typeof current === 'string' ? current : ''
  const status = titleStatus(plan, t)
  if (status === '') return base
  return `${status} · ${base}`
}

// ─── the sound ───────────────────────────────────────────────────────────────

/**
 * The chime table: what each alert sounds like, synthesized rather than shipped.
 *
 * Two short notes rising for a question — the one alert that means "stop what you
 * are doing" — a single note for an approval, and one soft low note for a
 * completion, which is information rather than a demand. The frequencies are the
 * equal-tempered A5 and E6, so the two-note chime is a real musical interval
 * rather than two arbitrary beeps.
 */
const CHIME_NOTES = {
  questions: [
    { frequency: 880, startMs: 0, durationMs: 110, peak: 1 },
    { frequency: 1318.5, startMs: 95, durationMs: 150, peak: 0.9 },
  ],
  approvals: [{ frequency: 880, startMs: 0, durationMs: 130, peak: 0.85 }],
  completed: [{ frequency: 440, startMs: 0, durationMs: 110, peak: 0.45 }],
}

/**
 * Which alert, if any, may make a sound right now.
 *
 * Two rules, both deliberate and both easy to get wrong:
 *
 * - **Foreground is silence.** When the user is looking at the interface the
 *   favicon and the title have already said it, and a chime on top of that is
 *   noise. Only a hidden document or an unfocused window earns a sound — and the
 *   `soundBlocked` setting is how a user who disagrees turns the rule off.
 * - **One sound per burst.** Agents ask several questions in a row; three chimes
 *   in three seconds reads as a malfunction. The gap is measured against a
 *   caller-supplied clock instead of a timer, because a background tab throttles
 *   `setTimeout` to the minute and a timer-based gap would fire late or not at all.
 *
 * @param alerts - the alert set from {@link changeAlerts}.
 * @param settings - the resolved settings section.
 * @param state - `{ now, lastSoundAt, hidden, focused }`.
 * @returns the chime kind to play, or undefined for silence.
 */
function soundPlan(alerts, settings, state) {
  if (settings.sound === false) return undefined
  if (settings.soundBlocked !== false && !state.hidden && state.focused) return undefined
  if (typeof state.lastSoundAt === 'number' && state.now - state.lastSoundAt < SOUND_GAP_MS) {
    return undefined
  }
  if (alerts.questions.length > 0 && settings.soundWaiting !== false) return 'questions'
  if (alerts.approvals.length > 0 && settings.soundApproval !== false) return 'approvals'
  if (alerts.completed.length > 0 && settings.soundDone === true) return 'completed'
  return undefined
}

/**
 * A synthetic chime player over Web Audio, or a silent one when the browser has
 * no Web Audio at all.
 *
 * The browser's autoplay policy is the constraint that shapes this class: before
 * any user gesture the context is created suspended, and `resume()` alone is not
 * enough to make it audible. A chime requested in that window is *dropped* rather
 * than queued — a chime that arrives two minutes late, after the click that
 * finally unlocked audio, is worse than no chime. The settings row's preview
 * button exists partly to be the gesture that unlocks this for the session.
 *
 * @param options - `{ AudioContextClass, volume }`, both injectable for tests.
 * @returns the player: `{ play, resume, dispose }`.
 */
function createChime(options) {
  const { AudioContextClass, volume } = options
  let context

  /** Build the context lazily, and never let a construction failure escape. */
  const ensure = () => {
    if (context !== undefined) return context
    if (AudioContextClass === undefined) return undefined
    try {
      context = new AudioContextClass()
    } catch {
      context = undefined
    }
    return context
  }

  const player = {
    /** Ask the browser to start the clock. Safe to call any time, any number of times. */
    resume() {
      const audio = ensure()
      if (audio === undefined) return
      try {
        if (audio.state === 'suspended') void audio.resume()
      } catch {
        /* a refused resume is the autoplay policy, not an error worth surfacing */
      }
    },

    /**
     * Play one chime, if the context is running.
     * @param kind - a key of {@link CHIME_NOTES}.
     * @returns whether a sound was actually scheduled.
     */
    play(kind) {
      const audio = ensure()
      if (audio === undefined) return false
      player.resume()
      if (audio.state === 'suspended') return false
      const notes = CHIME_NOTES[kind] ?? []
      const gain = typeof volume === 'number' ? volume : 0.5
      const startedAt = audio.currentTime
      for (const note of notes) {
        const begin = startedAt + note.startMs / 1000
        const end = begin + note.durationMs / 1000
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(note.frequency, begin)
        // A bare gate on a sine wave clicks; a short attack and a longer release
        // is what makes it read as a chime rather than as a pop.
        envelope.gain.setValueAtTime(0, begin)
        envelope.gain.linearRampToValueAtTime(note.peak * gain, begin + 0.012)
        envelope.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(envelope)
        envelope.connect(audio.destination)
        oscillator.start(begin)
        oscillator.stop(end + 0.02)
      }
      return notes.length > 0
    },

    /** Release the audio hardware. */
    dispose() {
      const audio = context
      context = undefined
      if (audio === undefined) return
      try {
        void audio.close()
      } catch {
        /* already closed, or the browser refuses; nothing to do */
      }
    },
  }
  return player
}

// ─── persistence ─────────────────────────────────────────────────────────────

/** The `localStorage` key holding the running → idle edge timestamps. */
const STAMPS_KEY = 'dsh-sentry:done'

/**
 * Wrap a `Storage`, or any object with the same two methods, so a hostile or
 * absent storage cannot break the plugin.
 *
 * `localStorage` throws on access in some privacy configurations and holds
 * garbage when another tab wrote it, and a background tab's timers are throttled
 * enough that memory-only bookkeeping loses the completion edge the moment the
 * bundle reloads. So the storage is used when it works and remembered in memory
 * when it does not — never trusted.
 *
 * @param storage - the underlying storage, if any.
 * @returns `{ readStamps, writeStamps }`.
 */
function createStampStore(storage) {
  let memory
  return {
    /** @returns the persisted `SessionId -> timestamp` map, or `{}`. */
    readStamps() {
      if (storage === undefined) return memory ?? {}
      try {
        const raw = storage.getItem(STAMPS_KEY)
        if (raw === null || raw === undefined) return {}
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return {}
        const clean = {}
        for (const [id, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && Number.isFinite(value)) clean[id] = value
        }
        return clean
      } catch {
        return memory ?? {}
      }
    },
    /**
     * @param stamps - the map to persist.
     */
    writeStamps(stamps) {
      memory = stamps
      if (storage === undefined) return
      try {
        storage.setItem(STAMPS_KEY, JSON.stringify(stamps))
      } catch {
        /* quota or a denied storage: the in-memory copy still carries this session */
      }
    },
  }
}

/**
 * The completion-edge bookkeeping, as a pure step.
 *
 * A stamp is written on `running → not running`, and a session that has left the
 * list is dropped. Without the drop, a long-lived install would accumulate one
 * entry per session ever run; without the edge, the stamp would be rewritten on
 * every observation and the green signal would never expire.
 *
 * @param prevRunning - the previous `SessionId -> running` map.
 * @param list - the session-list snapshot.
 * @param stamps - the persisted stamps.
 * @param now - the current time.
 * @returns the next stamps and running maps.
 */
function noteRunningEdges(prevRunning, list, stamps, now) {
  const nextRunning = {}
  const nextStamps = {}
  for (const id of list?.ids ?? []) {
    if (list?.byId?.[id] === undefined) continue
    const running = list.byId[id].running === true
    nextRunning[id] = running
    if (prevRunning?.[id] === true && !running) nextStamps[id] = now
    else if (typeof stamps?.[id] === 'number') nextStamps[id] = stamps[id]
  }
  return { stamps: nextStamps, running: nextRunning }
}

// ─── the settings ────────────────────────────────────────────────────────────

/**
 * Every setting this plugin owns, in the order the row lists them.
 *
 * The ids are also the host schema's field names, and the two halves of the
 * bundle are separate graphs that cannot share a module — so the list is
 * duplicated by hand in `lib/index.js` and `scripts/verify-client.mjs` compares
 * the two copies, which turns a silent drift (a switch that writes a key no
 * engine reads) into a failing check.
 *
 * Every channel defaults to on, on the principle that a feature nobody can
 * discover is a feature nobody has: each switch is there to get out of the way
 * once the notice has been noticed, not to gate the plugin behind a setup step.
 * The completion chime is the easiest one to want off — a finished turn is
 * ambient information, and chiming on every one is how people end up muting
 * everything — so its hint says so and it sits last in the sound group.
 */
const SETTINGS = [
  { id: 'favicon', kind: 'boolean', default: true, labelKey: 'alert.setting.favicon', hintKey: 'alert.setting.faviconHint' },
  { id: 'style', kind: 'text', default: DEFAULT_STYLE, labelKey: 'alert.setting.style', hintKey: 'alert.setting.styleHint' },
  { id: 'title', kind: 'boolean', default: true, labelKey: 'alert.setting.title', hintKey: 'alert.setting.titleHint' },
  { id: 'sound', kind: 'boolean', default: true, labelKey: 'alert.setting.sound', hintKey: 'alert.setting.soundHint' },
  { id: 'soundWaiting', kind: 'boolean', default: true, labelKey: 'alert.setting.soundWaiting', hintKey: 'alert.setting.soundWaitingHint' },
  { id: 'soundApproval', kind: 'boolean', default: true, labelKey: 'alert.setting.soundApproval', hintKey: 'alert.setting.soundApprovalHint' },
  { id: 'soundDone', kind: 'boolean', default: true, labelKey: 'alert.setting.soundDone', hintKey: 'alert.setting.soundDoneHint' },
  { id: 'soundBlocked', kind: 'boolean', default: true, labelKey: 'alert.setting.soundBlocked', hintKey: 'alert.setting.soundBlockedHint' },
  { id: 'volume', kind: 'number', default: 0.5, labelKey: 'alert.setting.volume', hintKey: 'alert.setting.volumeHint' },
  { id: 'doneWindowMs', kind: 'number', default: DEFAULT_DONE_WINDOW_MS, labelKey: 'alert.setting.doneWindow', hintKey: 'alert.setting.doneWindowHint' },
]

/** The whole-section defaults, as the host schema resolves an empty document. */
const SETTING_DEFAULTS = Object.fromEntries(SETTINGS.map((field) => [field.id, field.default]))

/**
 * Coerce one stored value to the shape the engine reads.
 *
 * The settings document is user-editable YAML and the wire carries whatever it
 * holds, so a numeric field accepts a numeric string and an out-of-range value is
 * clamped rather than rejected: a typo in `settings.yaml` should shrink the fish,
 * not disable the favicon.
 *
 * @param field - the roster entry.
 * @param value - the stored value.
 * @returns the usable value, or undefined when the value says nothing.
 */
function coerceSetting(field, value) {
  if (field.kind === 'boolean') {
    if (value === true) return true
    if (value === false) return false
    return undefined
  }
  // A text field is a document, not a value: anything that is not a string is a
  // corrupt write, and an empty one means "use the shipped appearance" rather than
  // "draw an empty icon".
  if (field.kind === 'text') return typeof value === 'string' && value.trim() !== '' ? value : undefined
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
  if (!Number.isFinite(numeric)) return undefined
  if (field.id === 'volume') return Math.min(1, Math.max(0, numeric))
  if (field.id === 'doneWindowMs') return Math.min(600_000, Math.max(0, numeric))
  return numeric
}

/**
 * Resolve a stored section against the roster.
 * @param section - the section the settings scope reports.
 * @returns every field, with defaults filled in.
 */
function resolveSettings(section) {
  const resolved = { ...SETTING_DEFAULTS }
  if (section === null || typeof section !== 'object') return resolved
  for (const field of SETTINGS) {
    const value = coerceSetting(field, section[field.id])
    if (value !== undefined) resolved[field.id] = value
  }
  return resolved
}

// ─── the settings row ────────────────────────────────────────────────────────

/** Row copy, keyed by locale. `zh` is the key-set source of truth. */
const zh = {
  'alert.title': '标签页提醒',
  'alert.description':
    '在别的标签页时替你盯着所有会话：标签图标、标签标题和提示音三个通道，该你出手的时候叫你回来',
  'alert.setting.favicon': '标签图标状态样式',
  'alert.setting.faviconHint':
    '关掉就恢复成原来的 favicon。开启时标签图标是一块纯色背景，鱼和状态图案从背景里镂空出来 —— 所以鱼的轮廓永远是标签栏透出来的颜色，任何主题下都看得清。具体的颜色、形状、图案和动效由下面的样式文档决定。',
  'alert.setting.style': '样式文档',
  'alert.setting.styleHint':
    '每个状态一行，四行决定四种状态的样子。写错的关键字会被忽略并退回默认值，不会让图标消失。展开下方说明可查全部可用的原语。',
  'alert.style.help': '语法与原语说明',
  'alert.style.syntax': '语法',
  'alert.style.syntaxLine1': '每行一个状态：状态 形状 颜色 动效 速度',
  'alert.style.syntaxLine2': '形状/颜色/动效可以按顺序写，也可以写成 键=值；数字一定是速度（秒）。例如 shape=none 或 rounded purple turn 1.4',
  'alert.style.syntaxLine3': '# 开头是注释；没写的字段沿用该状态的默认值；同一行里后面的值覆盖前面的',
  'alert.style.shapes': '形状 shape',
  'alert.style.patterns': '图案 pattern（目前只剩 none，试过的表盘类图案在 16px 下都只是噪点）',
  'alert.style.motions': '动效 motion',
  'alert.style.colors': '颜色 color（预设）',
  'alert.style.colorsLine': '只接受预设名，不接受任意色值：本插件出过的两次事故都是对比度问题（白鱼画在白底上），预设色不会犯这个错。',
  'alert.style.defaults': '各状态默认值',
  'alert.primitive.shape.circle': '圆形',
  'alert.primitive.shape.rounded': '圆角矩形，鱼是横宽的，圆角矩形给它更好的留白',
  'alert.primitive.shape.square': '小圆角方形',
  'alert.primitive.shape.none': '不画背景板。注意：鱼是「镂空」出来的，没有背景板就没有东西可镂 —— 结果是整个图标全透明（只剩角标）。想「只要鱼」请用圆角矩形或圆形',
  'alert.primitive.motion.still': '不动',
  'alert.primitive.motion.turn': '图案旋转，速度=转一圈的秒数',
  'alert.primitive.motion.blink': '整体闪烁，速度=一次呼吸的秒数',
  'alert.primitive.motion.flush': '背景色往复变化，速度=一个来回的秒数',
  'alert.setting.title': '标签标题前缀',
  'alert.setting.titleHint':
    '在标签标题前面加上状态，例如“① 等待回答 · 我的会话 — DeepSeek Harness”。标签文字是唯一能读到准确数字的地方，和图标配合使用。',
  'alert.setting.sound': '声音提醒',
  'alert.setting.soundHint':
    '总开关。注意浏览器的自动播放策略：在你第一次点击本界面之前，提示音无法发声，这是浏览器的限制而不是插件的问题。',
  'alert.setting.soundWaiting': '等待回答时提示',
  'alert.setting.soundWaitingHint':
    '模型提问时播放一段上扬的双音，这是唯一表示“需要你立刻做决定”的声音。',
  'alert.setting.soundApproval': '等待审批时提示',
  'alert.setting.soundApprovalHint': '模型请求权限升级时播放一个单音。',
  'alert.setting.soundDone': '会话完成时提示',
  'alert.setting.soundDoneHint':
    '模型跑完一轮时播放一声很轻的低音。它属于背景信息，如果觉得吵，这里是第一个该关掉的开关。',
  'alert.setting.soundBlocked': '仅在本页不在前台时发声',
  'alert.setting.soundBlockedHint':
    '默认开启。你正看着这个界面时，标签图标和标题已经说明了一切，再响一声就是打扰；关闭后无论如何都会发声。',
  'alert.setting.volume': '音量',
  'alert.setting.volumeHint': '提示音的音量，0 到 1。',
  'alert.setting.doneWindow': '完成状态保留时间',
  'alert.setting.doneWindowHint':
    '会话结束后保持绿色信号多久（毫秒）。默认 60000，即一分钟；调大可以让“刚刚完成”更容易被注意到。',
  'alert.setting.preview': '试听',
  'alert.setting.previewHint': '播放一次提示音，同时完成浏览器的音频解锁。',
  'alert.on': '已开启',
  'alert.off': '已关闭',
  'alert.reset': '全部恢复默认',
  'alert.status.waiting': '等待回答',
  'alert.status.approval': '等待审批',
  'alert.status.running': '执行中',
  'alert.status.done': '刚刚完成',
}

/** English dictionary, checked complete against the `zh` key set. */
const en = {
  'alert.title': 'Tab alerts',
  'alert.description':
    'Watches every session while you are on another tab — a status ring on the tab icon, a title prefix, and a chime, so you come back when you are actually needed',
  'alert.setting.favicon': 'Tab icon styling',
  'alert.setting.faviconHint':
    'Turn this off to restore the original favicon. When on, the tab icon is a solid background with the fish and the state pattern carved out of it — so the fish always shows the tab bar through and stays legible in any theme. Colours, shapes, patterns, and motion come from the style document below.',
  'alert.setting.style': 'Style document',
  'alert.setting.styleHint':
    'One line per state; four lines decide how the four states look. An unknown keyword is ignored and falls back to the default rather than leaving the tab without an icon. Expand the reference below for the full vocabulary.',
  'alert.style.help': 'Syntax and primitives',
  'alert.style.syntax': 'Syntax',
  'alert.style.syntaxLine1': 'one line per state: state shape colour motion speed',
  'alert.style.syntaxLine2': 'shape, colour, and motion may be positional or written as key=value; a bare number is always the speed, e.g. shape=none or rounded purple turn 1.4',
  'alert.style.syntaxLine3': '# starts a comment; anything a line omits keeps that state\u2019s default, and a later value on the same line wins',
  'alert.style.shapes': 'shape',
  'alert.style.patterns': 'pattern (only none remains; every dial-like pattern read as noise at 16px)',
  'alert.style.motions': 'motion',
  'alert.style.colors': 'colour (presets)',
  'alert.style.colorsLine': 'Preset names only, never a free colour: both failures this plugin has shipped were contrast failures, and a preset cannot be illegible.',
  'alert.style.defaults': 'Shipped defaults',
  'alert.primitive.shape.circle': 'a circle',
  'alert.primitive.shape.rounded': 'a rounded square — the fish is wider than it is tall, and this gives it room',
  'alert.primitive.shape.square': 'a slightly rounded square',
  'alert.primitive.shape.none': 'no background plate. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is entirely transparent (only the badge survives). For just-the-fish, use rounded or circle',
  'alert.primitive.motion.still': 'still',
  'alert.primitive.motion.turn': 'the pattern turns; speed is seconds per revolution',
  'alert.primitive.motion.blink': 'the whole icon blinks; speed is seconds per breath',
  'alert.primitive.motion.flush': 'the background colour pulses; speed is seconds per cycle',
  'alert.setting.title': 'Tab title prefix',
  'alert.setting.titleHint':
    'Prefixes the tab title with the status, e.g. "① Waiting · My session — DeepSeek Harness". The title text is the only place an exact number can be read, so it works with the icon rather than instead of it.',
  'alert.setting.sound': 'Sound',
  'alert.setting.soundHint':
    "Master switch. Note the browser's autoplay policy: no chime can sound until you have clicked this interface once. That is the browser's rule, not the plugin's.",
  'alert.setting.soundWaiting': 'Chime when a question waits',
  'alert.setting.soundWaitingHint':
    'A rising two-note chime when the model asks something — the one sound that means "decide now".',
  'alert.setting.soundApproval': 'Chime when an approval waits',
  'alert.setting.soundApprovalHint': 'A single note when the model requests a permission escalation.',
  'alert.setting.soundDone': 'Chime when a session finishes',
  'alert.setting.soundDoneHint':
    'A soft low note when a turn finishes. It is ambient information, so if it starts to feel like noise, this is the first switch to turn off.',
  'alert.setting.soundBlocked': 'Only when this page is in the background',
  'alert.setting.soundBlockedHint':
    'On by default. While you are looking at this interface the icon and the title have already said it, and a chime on top of that is an interruption. Turn this off to be chimed at regardless.',
  'alert.setting.volume': 'Volume',
  'alert.setting.volumeHint': 'Chime volume, 0 to 1.',
  'alert.setting.doneWindow': 'Completed signal window',
  'alert.setting.doneWindowHint':
    'How long a finished session keeps the green signal, in milliseconds. 60000 (one minute) by default; raise it if "just finished" is easy to miss.',
  'alert.setting.preview': 'Preview',
  'alert.setting.previewHint': 'Plays the chime once, which also unlocks audio for this tab.',
  'alert.on': 'On',
  'alert.off': 'Off',
  'alert.reset': 'Reset to defaults',
  'alert.status.waiting': 'Waiting',
  'alert.status.approval': 'Waiting for approval',
  'alert.status.running': 'Running',
  'alert.status.done': 'Just finished',
}

/** The stylesheet for the row's own chrome. */
const ROW_CSS = [
  '.dsh-sentry-row{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:16px;padding:16px 0;display:flex}',
  '.dsh-sentry-head{flex-direction:column;gap:4px;display:flex}',
  '.dsh-sentry-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
  '.dsh-sentry-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
  '.dsh-sentry-list{flex-direction:column;gap:16px;display:flex}',
  '.dsh-sentry-item{align-items:flex-start;justify-content:space-between;gap:16px;display:flex}',
  '.dsh-sentry-itemText{flex-direction:column;gap:4px;min-width:0;display:flex}',
  '.dsh-sentry-itemLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-itemHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-switchRow{align-items:center;gap:8px;flex:none;display:flex}',
  '.dsh-sentry-state{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-switch{position:relative;box-sizing:border-box;width:36px;height:20px;padding:0;cursor:pointer;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-module-platform);transition:background .15s ease,border-color .15s ease}',
  '.dsh-sentry-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary);border-color:transparent}',
  '.dsh-sentry-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:left .15s ease}',
  '.dsh-sentry-switch[aria-checked="true"] .dsh-sentry-knob{left:19px}',
  '.dsh-sentry-number{align-items:center;gap:8px;flex:none;display:flex}',
  '.dsh-sentry-range{width:132px;accent-color:var(--dsw-alias-state-business-primary)}',
  '.dsh-sentry-readout{min-width:44px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:right;font-variant-numeric:tabular-nums}',
  '.dsh-sentry-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-sentry-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-preview{align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px;display:inline-flex}',
  '.dsh-sentry-preview:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-style{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-editor{display:block}',
  // The editor's own stylesheet is injected by the library; these bind its appearance to the
  // interface's design tokens, so the box matches every other field and follows the theme
  // switch rather than the operating system's colour scheme.
  '.dsh-sentry-editor .litearea-box{border-width:.5px}',
  '.dsh-sentry-help{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-help>summary{cursor:pointer;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:18px}',
  '.dsh-sentry-helpSection{margin-top:8px}',
  '.dsh-sentry-helpTitle{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.dsh-sentry-helpLine{font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:pre-wrap}',
].join('')

/** Install the row chrome stylesheet for the plugin's lifetime. */
function installRowStyles(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${STYLE_PREFIX}/row.css`
    tag.textContent = ROW_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-sentry: row stylesheet')
}

/** Live-state store behind the settings row: the resolved section plus a revision. */
function createRowStore() {
  return _deepseek_ai_dsh_client_store.defineStore({
    init: () => ({ ...SETTING_DEFAULTS, revision: -1 }),
    actions: {
      sync: (draft, section, revision) => {
        if (revision !== undefined && revision <= draft.revision) return
        for (const field of SETTINGS) {
          const value = coerceSetting(field, section?.[field.id])
          draft[field.id] = value === undefined ? field.default : value
        }
        if (revision !== undefined) draft.revision = revision
      },
    },
  })
}

/**
 * One boolean setting's row: what it does, whether it is on, and the switch.
 *
 * A `role="switch"` button rather than a checkbox input, so the whole control is
 * one hit target that matches the design system's own toggles instead of the
 * platform's.
 * @param props - _react props.
 * @returns the item element.
 */
function SettingSwitch({ label, hint, state, checked, onToggle }) {
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-item' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-switchRow' },
      _react.createElement('span', { className: 'dsh-sentry-state' }, state),
      _react.createElement(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'dsh-sentry-switch',
          'aria-checked': checked === true,
          'aria-label': label,
          onClick: () => {
            onToggle(checked !== true)
          },
        },
        _react.createElement('span', { className: 'dsh-sentry-knob' }),
      ),
    ),
  )
}

/**
 * One numeric setting's row: a range control plus a readout.
 *
 * A range rather than a text field because every number here is a perceptual
 * quantity — how big the fish is, how loud the chime is — and the right value is
 * found by dragging until it looks right.
 * @param props - _react props.
 * @returns the item element.
 */
function SettingNumber({ label, hint, value, min, max, step, format, onChange }) {
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-item' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-number' },
      _react.createElement('input', {
        type: 'range',
        className: 'dsh-sentry-range',
        min,
        max,
        step,
        value,
        'aria-label': label,
        onChange: (event) => {
          onChange(Number.parseFloat(event.target.value))
        },
      }),
      _react.createElement('span', { className: 'dsh-sentry-readout' }, format(value)),
    ),
  )
}

/** Range bounds and readout formatting, per numeric setting. */
const NUMBER_UI = {
  volume: { min: 0, max: 1, step: 0.05, format: (value) => `${Math.round(value * 100)}%` },
  doneWindowMs: {
    min: 0,
    max: 300_000,
    step: 5000,
    format: (value) => `${Math.round(value / 1000)}s`,
  },
}

/**
 * The design tokens the editor is themed with, as litearea custom properties.
 *
 * CSS stays the theme language: the editor's whole appearance is already described by
 * custom properties, so binding them to the interface's own tokens is what makes the box
 * look native instead of like a control that wandered in from somewhere else. Setting them
 * here rather than in the stylesheet also means they follow the INTERFACE's theme switch,
 * not the operating system's — the library's own dark palette is driven by
 * `prefers-color-scheme`, and those two are not the same thing.
 *
 * Deliberately not mapped: the per-scope colours. The library's palette is chosen to be
 * legible on its own light and dark surfaces, and overriding the surface while leaving the
 * scopes alone is right for the common case where the two schemes agree.
 */
const EDITOR_VARIABLES = {
  font: 'var(--ds-font-family-code, ui-monospace, monospace)',
  'font-size': '12px',
  'line-height': '18px',
  'padding-block': '8px',
  'padding-inline': '10px',
  radius: '8px',
  fg: 'var(--dsw-alias-label-primary)',
  'fg-dim': 'var(--dsw-alias-label-tertiary)',
  'fg-strong': 'var(--dsw-alias-label-primary)',
  bg: 'var(--dsw-alias-bg-module-platform)',
  'bg-raised': 'var(--dsw-alias-bg-layer-2)',
  border: 'var(--dsw-alias-border-l4)',
  'border-focus': 'var(--dsw-alias-state-business-primary)',
  accent: 'var(--dsw-alias-state-business-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  shadow: 'var(--dsw-elevation-panel)',
}

/**
 * The style document, the reference needed to write one, and the editor over it.
 *
 * A `<details>` block rather than a form, and now a real editor rather than a text area.
 * The point of the DSL is that the appearance is four combinations of four primitives;
 * expressing that as controls would take a dozen of them and still not say what one line
 * says. So the help text is not decoration — it *is* the interface, and it lists the closed
 * vocabulary the parser accepts.
 *
 * The textarea this replaces was controlled: every keystroke round-tripped through the
 * store and the value was written back, which is what destroyed the browser's undo stack
 * and reset the caret. The editor owns the text instead, and reports what the user typed.
 *
 * @param props - _react props.
 * @returns the item element.
 */
function SettingText({ label, hint, value, help, onChange }) {
  const hostRef = _react.useRef(null)
  const editorRef = _react.useRef(undefined)
  // The newest props, so the editor's own callbacks are never a render behind.
  const latest = _react.useRef({ onChange })
  latest.current = { onChange }

  _react.useEffect(() => {
    const host = hostRef.current
    if (host === null || host === undefined) return undefined
    const editor = _citisen_litearea.createEditor(host, {
      // The vocabularies come from this plugin's own constants, so the editor cannot offer a
      // shape or a motion the parser would then reject.
      grammar: dshSentryStyleGrammar({
        states: STYLE_STATES,
        shapes: SHAPES,
        motions: MOTIONS_LIST,
        colors: PRESET_COLORS,
        patterns: PATTERNS,
        options: STYLE_OPTIONS,
        defaults: DEFAULT_LOOK,
      }),
      value: latest.current.value,
      ariaLabel: label,
      // The state list is four lines and the reference below explains them; growing to a
      // dozen and then scrolling keeps the row from pushing the rest of the settings away.
      sizing: { minRows: 5, maxRows: 12 },
      variables: EDITOR_VARIABLES,
      onChange: (next) => {
        latest.current.onChange(next)
      },
    })
    editorRef.current = editor
    return () => {
      editor.destroy()
      editorRef.current = undefined
    }
  }, [])

  // A value that arrived from elsewhere — the Reset button, another tab — takes the field
  // over. Our own write coming back does not, and neither does anything at all while the
  // user is in the field: that would be the plugin rewriting their typing.
  _react.useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    if (editor.focused) return
    if (editor.value !== value) editor.setValue(value)
  }, [value])

  return _react.createElement(
    'div',
    { className: 'dsh-sentry-style' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement('div', { className: 'dsh-sentry-editor', ref: hostRef }),
    _react.createElement(
      'details',
      { className: 'dsh-sentry-help' },
      _react.createElement('summary', null, help.summary),
      ...help.sections.map((section, index) =>
        _react.createElement(
          'div',
          { className: 'dsh-sentry-helpSection', key: `s${String(index)}` },
          _react.createElement('div', { className: 'dsh-sentry-helpTitle' }, section.title),
          ...section.lines.map((line, lineIndex) =>
            _react.createElement('div', { className: 'dsh-sentry-helpLine', key: `l${String(lineIndex)}` }, line),
          ),
        ),
      ),
    ),
  )
}

/**
 * The style reference, rendered into the row from the vocabularies themselves.
 *
 * Built from `SHAPES`, `MOTIONS_LIST`, `PRESET_COLORS`, and `DEFAULT_LOOK` rather
 * than written out by hand, so the help cannot drift from what the parser accepts
 * — the failure mode a hand-written reference always has.
 *
 * @param t - the translator.
 * @returns `{ summary, sections }`.
 */
function styleHelp(t) {
  /** @param name - a primitive name. @returns its documented line. */
  const describe = (name) => t(`alert.primitive.${name}`)
  return {
    summary: t('alert.style.help'),
    sections: [
      {
        title: t('alert.style.syntax'),
        lines: [t('alert.style.syntaxLine1'), t('alert.style.syntaxLine2'), t('alert.style.syntaxLine3')],
      },
      {
        title: `${t('alert.style.shapes')}: ${SHAPES.join(' | ')}`,
        lines: SHAPES.map((name) => `${name} — ${describe(`shape.${name}`)}`),
      },
      {
        title: `${t('alert.style.motions')}: ${MOTIONS_LIST.join(' | ')}`,
        lines: MOTIONS_LIST.map((name) => `${name} — ${describe(`motion.${name}`)}`),
      },
      {
        title: `${t('alert.style.colors')}: ${Object.keys(PRESET_COLORS).join(' | ')}`,
        lines: [t('alert.style.colorsLine')],
      },
      {
        title: t('alert.style.defaults'),
        lines: STYLE_STATES.map((state) => {
          const look = DEFAULT_LOOK[state]
          return `${state.padEnd(9)} ${look.shape} ${look.color} ${look.pattern}${look.pattern === 'spokes' ? ` marks=${String(look.marks)} tip=${look.tip}` : ''} ${look.motion} speed=${String(look.speed)}`
        }),
      },
    ],
  }
}

/**
 * The General-settings row: one control per setting, a preview, and a reset.
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function AlertRow({ t, useStore, setField, reset, preview }) {
  const state = useStore((snapshot) => snapshot)
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-row' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-head' },
      _react.createElement('div', { className: 'dsh-sentry-title' }, t('alert.title')),
      _react.createElement('div', { className: 'dsh-sentry-desc' }, t('alert.description')),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-list' },
      ...SETTINGS.map((field) => {
        const label = t(field.labelKey)
        const hint = t(field.hintKey)
        if (field.kind === 'boolean') {
          const checked = state[field.id] === true
          return _react.createElement(SettingSwitch, {
            key: field.id,
            label,
            hint,
            state: checked ? t('alert.on') : t('alert.off'),
            checked,
            onToggle: (value) => {
              setField(field.id, value)
            },
          })
        }
        if (field.kind === 'text') {
          return _react.createElement(SettingText, {
            key: field.id,
            label,
            hint,
            value: state[field.id] ?? field.default,
            help: styleHelp(t),
            onChange: (value) => {
              setField(field.id, value)
            },
          })
        }
        const ui = NUMBER_UI[field.id]
        return _react.createElement(SettingNumber, {
          key: field.id,
          label,
          hint,
          value: state[field.id],
          min: ui.min,
          max: ui.max,
          step: ui.step,
          format: ui.format,
          onChange: (value) => {
            setField(field.id, value)
          },
        })
      }),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-switchRow' },
      _react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-sentry-preview',
          title: t('alert.setting.previewHint'),
          onClick: () => {
            preview()
          },
        },
        t('alert.setting.preview'),
      ),
    ),
    _react.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-sentry-reset',
        onClick: () => {
          reset()
        },
      },
      t('alert.reset'),
    ),
  )
}

// ─── installation ────────────────────────────────────────────────────────────

/** The attribute marking the one DOM element this plugin owns. */
const ICON_ATTRIBUTE = 'data-dsh-sentry-icon'

/**
 * The services this plugin waits for.
 *
 * `sessions` and `uiSession` are the two observables the engine reads; both are
 * installed by the Web composition's session controller, so a third-party plugin
 * reaches the same state the built-in sidebar renders from, without borrowing a
 * slot or a hook.
 */
const inject = ['slots', 'locale', 'settingsScope', 'sessions', 'uiSession']

/**
 * Client plugin body: subscribe to the session state, project it onto the three
 * background-tab channels, and register the Settings row that configures them.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
  installRowStyles(ctx)

  const scope = ctx.settingsScope.bind({
    namespace: SENTRY_NAMESPACE,
    decode: (section) => {
      if (section === null || typeof section !== 'object') return undefined
      const raw = section
      return Object.fromEntries(
        SETTINGS.map((field) => [field.id, coerceSetting(field, raw[field.id]) ?? field.default]),
      )
    },
  })

  const chime = createChime({
    AudioContextClass:
      typeof window === 'undefined' ? undefined : window.AudioContext ?? window.webkitAudioContext,
    volume: SETTING_DEFAULTS.volume,
  })
  const stampStore = createStampStore(safeStorage())

  /** The single element this plugin owns; the app keeps its own favicon link. */
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.setAttribute(ICON_ATTRIBUTE, '')

  const state = {
    settings: { ...SETTING_DEFAULTS },
    plan: EMPTY_PLAN,
    running: {},
    stamps: {},
    writing: false,
    unfocused: false,
    media: undefined,
    lastSoundAt: undefined,
    tick: 0,
    motionTimer: undefined,
    motionInterval: undefined,
  }

  /** The translation seat for the title, bound to the row's own namespace. */
  const translator = ctx.locale?.bind?.(LOCALE_NAMESPACE)
  const t = (key) => (translator === undefined ? key : translator(key))

  /**
   * The title as this plugin wants it: the app's title, plus or minus the status
   * prefix.
   *
   * Disabling the title channel has to *strip* rather than stop writing, because
   * stopping would leave whatever prefix the previous render installed sitting in
   * the tab forever — a switch that appears not to work. The escape suffix is what
   * makes the strip safe: it marks a title the plugin has already stripped, so an
   * app title that happens to contain a ` · ` cannot be eaten one segment per
   * render.
   */
  const desiredTitle = () => {
    const raw = document.title
    // Everything this plugin wrote sits behind the marker, so the app's own title
    // underneath comes off by removing the marker and the prefix — no guessing: a
    // title the app rewrites arrives without the marker and is used as-is.
    if (!raw.endsWith(TITLE_MARK)) {
      const plain = state.settings.title === false ? raw : titleWithStatus(raw, state.plan, t)
      return plain === raw ? raw : `${plain}${TITLE_MARK}`
    }

    // A title this plugin wrote. Stripping runs even when the channel is *off*,
    // because stopping writing instead would leave the prefix in the tab forever,
    // which reads as a switch that does not work.
    const bare = raw.slice(0, -TITLE_MARK.length)
    const current = bare.replace(TITLE_PREFIX, '')
    const next = state.settings.title === false ? current : titleWithStatus(current, state.plan, t)
    // Nothing left to say: return the plain app title, dropping the marker with
    // the prefix. This is the branch that takes the status off when the last
    // session goes quiet or the channel is switched off — the *stripped* text, not
    // the text as it stands, because the prefix has to go with the marker.
    return next === current ? current : `${next}${TITLE_MARK}`
  }

  /** The title: this plugin's prefix in front of whatever the app wrote. */
  const applyTitle = () => {
    const next = desiredTitle()
    if (next === document.title) return
    state.writing = true
    document.title = next
    state.writing = false
  }

  /**
   * The session-list snapshot.
   * @returns the snapshot, or an empty one before the service is reachable.
   */
  const list = () => ctx.sessions?.list?.getSnapshot?.() ?? { ids: [], byId: {} }

  /**
   * The pending-interaction snapshot.
   * @returns the snapshot, or an empty map.
   */
  const pending = () => ctx.uiSession?.pendingInteractions?.getSnapshot?.() ?? new Map()

  /** Whether a reduced-motion preference is in force. */
  const prefersReducedMotion = () => {
    if (state.media === undefined) {
      state.media =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)')
          : null
    }
    return state.media !== null && state.media.matches === true
  }

  /**
   * The favicon: the state's background with the fish carved through it, or the
   * app's own icon again.
   *
   * The style document is resolved on every draw rather than cached on the
   * settings change, because the parse is a few string splits over at most a
   * dozen lines — cheaper than the bookkeeping a cache would need, and it means a
   * document edited in `settings.yaml` and reloaded cannot go stale.
   *
   * The motion override comes from the tick, which is what makes a driven motion
   * work: `blink` dims, `flush` pulses the colour, `turn` steps the angle, and
   * every one of them is just an argument to this same draw.
   */
  const applyIcon = () => {
    const style = resolveStyle(state.settings.style).look
    const chosen = activeLook(state.plan, style)
    const override = state.tick === 0 ? {} : motionTick(chosen, state.tick)
    const svg =
      state.settings.favicon === false
        ? undefined
        : sentryFavicon(state.plan, {
            reducedMotion: prefersReducedMotion(),
            style,
            motion: override,
          })
    if (svg === undefined) {
      icon.remove()
      return
    }
    icon.href = faviconHref(svg)
    if (icon.parentNode === null || icon.parentNode === undefined) document.head.appendChild(icon)
  }

  /** The chime, gated on visibility, focus and the settings. */
  const applySound = (alerts) => {
    const kind = soundPlan(alerts, state.settings, {
      now: Date.now(),
      lastSoundAt: state.lastSoundAt,
      hidden: document.hidden === true,
      focused: !state.unfocused && document.hasFocus?.() === true,
    })
    if (kind === undefined) return
    state.lastSoundAt = Date.now()
    chime.play(kind)
  }

  /** Recompute everything from the current subscriptions and settings. */
  const render = () => {
    const now = Date.now()
    // The completion edge is noted before the plan is built, so a session that has
    // just stopped running shows its green signal on this very pass.
    const edges = noteRunningEdges(state.running, list(), stampStore.readStamps(), now)
    if (edges.stamps !== state.stamps) stampStore.writeStamps(edges.stamps)
    state.running = edges.running
    state.stamps = edges.stamps

    const next = sessionPlan(list(), pending(), edges.stamps, {
      now,
      doneWindowMs: state.settings.doneWindowMs,
    })
    const alerts = changeAlerts(state.plan, next)
    state.plan = next
    applyIcon()
    applyTitle()
    applySound(alerts)
    applyMotion()
  }

  /**
   * Start, keep, or stop the repaint timer a driven motion needs.
   *
   * The timer is owned by the state rather than by the draw, and its interval is
   * the motion's own tick. It is stopped the moment nothing is animating — which
   * matters more than it looks: a background tab's timers are throttled, but an
   * idle tab with no sessions should not be holding one at all. The one exception
   * is a `turn` the browser can animate itself, which sets no timer and costs
   * nothing.
   */
  const applyMotion = () => {
    const style = resolveStyle(state.settings.style).look
    const chosen = activeLook(state.plan, style)
    const interval =
      state.settings.favicon === false ? undefined : tickInterval(chosen, prefersReducedMotion())
    const wanted = interval ?? null
    if (wanted === state.motionInterval) return
    if (state.motionTimer !== undefined) {
      clearInterval(state.motionTimer)
      state.motionTimer = undefined
    }
    state.motionInterval = wanted
    if (wanted === null) return
    state.motionTimer = setInterval(() => {
      state.tick += 1
      applyIcon()
    }, wanted)
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  //
  // Every subscription is registered through `ctx.effect`, so teardown is the
  // framework's business rather than a list of disposers this file has to keep in
  // step with its own install order.

  ctx.effect(() => ctx.sessions.list.subscribe(render), 'dsh-sentry: session list subscription')
  ctx.effect(
    () => ctx.uiSession.pendingInteractions.subscribe(render),
    'dsh-sentry: pending interaction subscription',
  )

  // Focus, blur, and visibility all change whether a sound is allowed, and coming
  // back to the foreground also has to redraw: a session that finished while the
  // user was away has already been reported by the icon they are now looking at.
  ctx.effect(() => {
    const onFocus = () => {
      state.unfocused = false
      render()
    }
    const onBlur = () => {
      state.unfocused = true
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', render)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', render)
    }
  }, 'dsh-sentry: visibility and focus listeners')

  // The autoplay unlock: one gesture is all the browser wants, so the listeners
  // stay registered — a second gesture costs nothing and a page that removed them
  // could not re-unlock after the context is suspended again.
  ctx.effect(() => {
    const unlock = () => {
      chime.resume()
    }
    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('keydown', unlock, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, 'dsh-sentry: audio unlock listeners')

  // The title belongs to `ui-layout`, which rewrites it on session change; this
  // observer puts the prefix back when that happens, and the writing guard keeps
  // the plugin's own write from re-entering.
  ctx.effect(() => {
    if (typeof MutationObserver !== 'function') return () => {}
    const target = document.querySelector('title')
    if (target === null) return () => {}
    const observer = new MutationObserver(() => {
      if (state.writing) return
      applyTitle()
    })
    observer.observe(target, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-sentry: title observer')

  ctx.effect(
    () => () => {
      if (state.motionTimer !== undefined) clearInterval(state.motionTimer)
      state.motionTimer = undefined
      icon.remove()
      chime.dispose()
    },
    'dsh-sentry: element teardown',
  )

  ctx.effect(
    () =>
      scope.subscribe(() => {
        const snapshot = scope.getSnapshot()
        if (snapshot.value === undefined) return
        state.settings = resolveSettings(snapshot.value)
        syncRow()
        render()
      }),
    'dsh-sentry: settings adoption',
  )

  const initial = scope.getSnapshot()
  state.settings = resolveSettings(initial.value)
  render()

  const store = createRowStore()

  /**
   * The actions of the store instance the registry mounted for this entry.
   *
   * This is the whole point of the inject face, and getting it wrong is silent:
   * the registry mints one instance per entry and hands back its actions, and
   * *that* instance is the one the row renders from. Calling `store.create()`
   * here instead would build a second, unwatched instance, sync it happily, and
   * leave the rendered one on its `init()` values — which is exactly how the
   * first version of this shipped a row that never appeared.
   */
  let bound

  /**
   * Bring the row's store in line with the live settings.
   *
   * The fallback matters: on an untouched install there is no `alert` section
   * yet, so the scope reports an absent value — and the row still has to render
   * its defaults, or the plugin would be a blank row until the user wrote a
   * setting it had no control to write. `resolveSettings` is the same function
   * the engine uses, so the row and the engine cannot disagree about a default.
   */
  const syncRow = () => {
    const snapshot = scope.getSnapshot()
    bound?.sync(resolveSettings(snapshot.value), snapshot.revision)
  }

  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-sentry: settings row dictionaries',
  )

  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'alert',
        order: 14,
        store,
        locale: LOCALE_NAMESPACE,
        inject: (actions) => {
          bound = actions
          syncRow()
          return {
            setField: (field, value) => {
              scope.set(field, value)
            },
            reset: () => {
              for (const field of SETTINGS) scope.unset(field.id)
            },
            preview: () => {
              // The preview doubles as the audio unlock: the click that plays it
              // is the gesture the autoplay policy waits for.
              chime.resume()
              chime.play('questions')
            },
          }
        },
      },
      AlertRow,
    ),
  )
}

/**
 * `localStorage`, or undefined when it is absent or hostile.
 *
 * The property access itself throws in some privacy configurations, which is why
 * this is a function with a `try` rather than a `const` — a plugin that cannot
 * persist should lose its stamps, not its activation.
 * @returns the storage, or undefined.
 */
function safeStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage ?? undefined
  } catch {
    return undefined
  }
}
		exports.apply = apply;
		exports.inject = inject;
		exports.SETTINGS = SETTINGS;
		exports.SETTING_DEFAULTS = SETTING_DEFAULTS;
		exports.STATES = STATES;
		exports.STATE_COLORS = STATE_COLORS;
		exports.SHAPES = SHAPES;
		exports.PATTERNS = PATTERNS;
		exports.MOTIONS_LIST = MOTIONS_LIST;
		exports.TICK_MS = TICK_MS;
		exports.motionTick = motionTick;
		exports.tickInterval = tickInterval;
		exports.flushPartner = flushPartner;
		exports.activeLook = activeLook;
		exports.FISH_TURN_SCALE = FISH_TURN_SCALE;
		exports.FISH_SWEPT_RADIUS = FISH_SWEPT_RADIUS;
		exports.FISH_HALF_EXTENT = FISH_HALF_EXTENT;
		exports.FISH_TURN_RADIUS = FISH_TURN_RADIUS;
		exports.DEFAULT_LOOK = DEFAULT_LOOK;
		exports.PRESET_COLORS = PRESET_COLORS;
		exports.DEFAULT_STYLE = DEFAULT_STYLE;
		exports.STYLE_STATES = STYLE_STATES;
		exports.STYLE_OPTIONS = STYLE_OPTIONS;
		exports.dshSentryStyleGrammar = dshSentryStyleGrammar;
		exports.parseStyle = parseStyle;
		exports.resolveStyle = resolveStyle;
		exports.CHIME_NOTES = CHIME_NOTES;
		exports.FISH_PATH = FISH_PATH;
		exports.SOUND_GAP_MS = SOUND_GAP_MS;
		exports.blockedKind = blockedKind;
		exports.sessionPlan = sessionPlan;
		exports.changeAlerts = changeAlerts;
		exports.planHasSignal = planHasSignal;
		exports.sentryFavicon = sentryFavicon;
		exports.faviconHref = faviconHref;
		exports.titleStatus = titleStatus;
		exports.titleWithStatus = titleWithStatus;
		exports.soundPlan = soundPlan;
		exports.createChime = createChime;
		exports.createStampStore = createStampStore;
		exports.noteRunningEdges = noteRunningEdges;
		exports.coerceSetting = coerceSetting;
		exports.resolveSettings = resolveSettings;
		exports.createRowStore = createRowStore;
		exports.AlertRow = AlertRow;
		exports.SettingText = SettingText;
		return module.exports;
	}
});
