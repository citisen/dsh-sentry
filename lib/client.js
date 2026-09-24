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
      { auto: true, triggerCharacters: "", limit: 100, showDocumentation: true },
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
    const before = this.input.value;
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
    if (this.input.value !== before) this.handlers.onChange?.(this.input.value);
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
 * dsh-sentry's style document: the reader the engine and the editor share, and the
 * litearea grammar the settings editor is written against.
 *
 * The document
 * ------------
 * One small text file decides how the four session states look AND sound. It has
 * two kinds of line, and which kind a line is, is visible from the line itself:
 *
 *     // document settings first, one per line, at the top level
 *     icon on
 *     title on
 *     sound background
 *     chime-gap 1.5s
 *     keep-done 60s
 *     volume 0.5
 *
 *     // then one block per state, with one named property per line
 *     waiting {
 *       shape rounded
 *       color amber
 *       motion blink
 *       speed 1.1s
 *       chime A5 E6
 *     }
 *
 * Every property is named. There is no positional slot, no value that means one
 * thing in one place and another elsewhere, and no `key=value` spelling to choose
 * between: a line is `name value`, and a name that is not a property of the scope
 * the line is in is reported with the list of names that are. That is the whole
 * reason for the rewrite — the previous language placed bare words by guessing
 * which vocabulary they belonged to, so `running circle blue turn 3` was four
 * guesses in a row and a reader had to hold the slot order in their head.
 *
 * Durations are seconds unless a unit says otherwise: `3`, `1.1s`, `300ms`, `2m`.
 * Notes are equal-tempered names (`A5`, `E6`, `C#4`, `Bb3`) or a frequency in Hz,
 * so a chime reads as music rather than as four magic numbers. A note may name its
 * own length after a colon (`A5:200ms`): an item that names one occupies exactly
 * that long, which is what makes a line of them a rhythm instead of an interval. A
 * bare `-` is a rest, and `tone` picks the waveform.
 *
 * Why the grammar lives HERE and not in the editor
 * -----------------------------------------------
 * `@citisen/litearea` ships no syntax of its own: a host hands it a grammar as a
 * value, because a library that carried every consumer's language would make every
 * consumer bundle every language. So the grammar for THIS DSL is this plugin's own
 * module, and `src/client.js` passes the plugin's constants in — which is what keeps
 * the vocabulary the editor offers and the vocabulary the reader accepts one list
 * rather than two that agree until someone edits one of them.
 *
 * One reader, two callers
 * -----------------------
 * `readStyleDocument` is the single structural pass: it decides what the document
 * means AND records what is wrong with it, with ranges. The engine's
 * `resolveStyle` calls it to get drawable values; the grammar's `analyze` calls it
 * to paint, complete, and explain the same text. The previous version of this file
 * carried a second copy of the walk because the grammar was written to stand alone
 * — and a second copy is a second opinion, which is exactly how an editor comes to
 * offer a property the parser then rejects.
 *
 * @module dsh-sentry/style-grammar
 */

		// @citisen/litearea is compiled in above
// ─── the two values with a syntax of their own ───────────────────────────────
//
// A duration and a note are the only things here that are not a word out of a
// closed list, so they are the only things that need a parser. Both live at this
// level rather than inside the grammar factory because the engine needs them too:
// `resolveStyle` turns a note into a frequency, and the row prints a duration.

/** Semitone offsets inside an octave, by note letter. */
const NOTE_LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** A4's frequency in Hz — the anchor the equal-tempered scale is built from. */
const NOTE_A4_HZ = 440

/** A4's MIDI number, which is what counts the semitones in either direction. */
const NOTE_A4_MIDI = 69

/** The quietest and loudest frequency a `chime` line may name, in Hz. */
const NOTE_MIN_HZ = 20
const NOTE_MAX_HZ = 20_000

/**
 * The shortest and longest length one written chime item may carry, in seconds.
 *
 * Bounded for the same reason the frequency is: a `chime` line is a notification,
 * and a note that rings for a minute — or for a microsecond — is a typo rather than
 * a sound. Anything inside the range is the writer's business.
 */
const CHIME_LENGTH_MIN_S = 0.01
const CHIME_LENGTH_MAX_S = 10

/**
 * Parse a duration into seconds.
 *
 * `3` and `3s` are the same three seconds, because a bare number being seconds is
 * the one unit rule worth remembering: it is what `speed 3` reads as. `ms` and `m`
 * are there for the two values where a second is the wrong size — a chime gap is
 * measured in fractions of a second and a completed window in minutes.
 *
 * @param text - the value as written.
 * @returns the duration in seconds, or undefined when the text is not one.
 */
function parseDuration(text) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(text)
  if (match === null) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return undefined
  const unit = match[2] ?? 's'
  if (unit === 'ms') return value / 1000
  if (unit === 'm') return value * 60
  return value
}

/**
 * The frequency of one written note, or undefined when it is not a note.
 *
 * Equal temperament from A4 = 440 Hz, which is the tuning the shipped chime was
 * always written in: `chime A5 E6` reproduces the two-note rise, and it does so in
 * a spelling that says what it is.
 *
 * @param text - the note as written, such as `A5`, `E6`, `C#4`, or `Bb3`.
 * @returns the frequency in Hz rounded to two decimals, or undefined.
 */
function noteFrequency(text) {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(text)
  if (match === null) return undefined
  const letter = match[1].toUpperCase()
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  const octave = Number.parseInt(match[3], 10)
  const midi = (octave + 1) * 12 + NOTE_LETTERS[letter] + accidental
  return Math.round(NOTE_A4_HZ * 2 ** ((midi - NOTE_A4_MIDI) / 12) * 100) / 100
}

/**
 * One item of a `chime` value: a note, or a rest, with an optional length.
 *
 * Both halves are spelled in the document's own two value languages — a note is a
 * name or a frequency, a length is what `speed` and `chime-gap` already take — so
 * nothing new has to be learned to write one:
 *
 *     A5          a note that rings the engine's default and lets the next one start
 *                 a little before it ends, which is the shipped two-note interval
 *     A5:200ms    a note that rings 200ms, the next one starting when it ends
 *     -:200ms     the same 200ms of silence
 *
 * A length is what turns a chime into a rhythm: an item that names one occupies
 * exactly that long, so a sequence of them reads end to end. An item that names none
 * keeps the engine's default overlap, which is what the shipped chime is.
 *
 * @param text - the item as written.
 * @returns `{ frequency }` or `{ rest: true }`, each carrying `lengthMs` when one
 *   was written, or `{ problem: 'note' | 'length' }` when the text is not an item.
 */
function parseChimeItem(text) {
  const colon = text.indexOf(':')
  const head = colon === -1 ? text : text.slice(0, colon)
  const written = colon === -1 ? undefined : text.slice(colon + 1)
  let lengthMs
  if (written !== undefined) {
    const seconds = parseDuration(written)
    if (seconds === undefined || seconds < CHIME_LENGTH_MIN_S || seconds > CHIME_LENGTH_MAX_S) {
      return { problem: 'length' }
    }
    lengthMs = Math.round(seconds * 1000)
  }
  if (head === '-') return lengthMs === undefined ? { rest: true } : { rest: true, lengthMs }
  const named = noteFrequency(head)
  const hertz = named ?? (/^\d+(?:\.\d+)?$/.test(head) ? Number.parseFloat(head) : undefined)
  if (hertz === undefined || hertz < NOTE_MIN_HZ || hertz > NOTE_MAX_HZ) {
    return { problem: 'note' }
  }
  const frequency = Math.round(hertz * 100) / 100
  return lengthMs === undefined ? { frequency } : { frequency, lengthMs }
}

// ─── the reader ──────────────────────────────────────────────────────────────

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
 * @property {number} line - the zero-based line the problem is on.
 * @property {string} message - what to tell the user.
 * @property {string} code - the stable tag, so a host or a test can act on meaning.
 * @property {'error' | 'warning' | 'info' | 'hint'} severity - how loudly it speaks.
 */

/**
 * One line of the document, read.
 *
 * A line rather than a rule, because half of what the walk produces is about a
 * line that is not finished yet: `key` and `values` describe a property being
 * typed, which is exactly when a completion asks.
 * @typedef {object} DshSentryLine
 * @property {number} number - zero-based, so a completion can find the caret's line.
 * @property {number} from - the offset the line starts at.
 * @property {number} to - the offset after its last character, newline excluded.
 * @property {string} body - the line with its comment removed.
 * @property {DshSentryWord[]} words - the words on the line, comments removed.
 * @property {string | undefined} state - the state whose block the line is in, or
 *   undefined at the top level.
 * @property {string | undefined} opens - the state a line opens a block for.
 * @property {boolean} closes - whether the line closes the open block.
 * @property {string | undefined} key - the property the line names, when it is one
 *   the line's scope accepts; `undefined` while the name is still being typed.
 * @property {DshSentryWord[]} values - the words written after the property.
 * @property {DshSentryProblem[]} problems - what is wrong with this line.
 */

/**
 * What one property accepts.
 *
 * The spec is the document's type system, and it is the caller's: the plugin owns
 * the vocabulary (a shape, a preset colour, a motion) and this module owns how a
 * value of that kind is read and how a bad one is described. `resolveStyle` reads
 * the same spec to coerce, so a value the walk accepted is a value the engine can
 * use without checking it again.
 * @typedef {object} DshSentryKeySpec
 * @property {'word' | 'number' | 'duration' | 'chime'} kind - how the value reads.
 * @property {readonly string[]} [words] - the closed list a `word` accepts.
 * @property {number} [min] - the low end of the accepted range, in the value's own
 *   unit (seconds for a duration).
 * @property {number} [max] - the high end of the accepted range.
 * @property {readonly string[]} [states] - the states the property means anything
 *   in; a line naming it anywhere else is reported as inert rather than dropped in
 *   silence.
 * @property {readonly string[]} [suggest] - values a completion offers, for a kind
 *   whose values are not a closed list.
 */

/**
 * Read a document into the facts the engine draws from and the problems it has.
 *
 * Total by construction: anything the walk does not understand is reported and
 * left out, and the caller keeps its shipped default for that one property. A typo
 * in a settings file must not be able to leave a tab without an icon.
 *
 * @param text - the document, or anything else a settings file happened to hold.
 * @param options - `{ states, keys, spec }`: the states a block may open, the
 *   properties each scope accepts, and what each property reads.
 * @returns `{ globals, rules, lines, problems }` — the top-level values, one object
 *   per state with the values its block wrote, every line read, and every problem
 *   found.
 */
function readStyleDocument(text, options) {
  const states = options?.states ?? []
  const keys = options?.keys ?? { global: [], state: [] }
  const spec = options?.spec ?? {}

  const globals = {}
  const rules = {}
  const lines = []
  const problems = []

  // A non-string is a corrupt write rather than a document; an empty one still has
  // one (empty) line, and the completion layer asks about that line the moment the
  // editor opens on a new install.
  if (typeof text !== 'string') return { globals, rules, lines, problems }

  /** The state whose block is open, if any. */
  let open
  /** The line that opened it, so an unclosed block points at its own opener. */
  let opener

  const starts = _citisen_litearea.lineStarts(text)
  for (let number = 0; number < starts.length; number += 1) {
    const from = starts[number] ?? 0
    const rawTo = starts[number + 1] ?? text.length
    let to = rawTo
    while (to > from && (text.charAt(to - 1) === '\n' || text.charAt(to - 1) === '\r')) to -= 1
    const raw = text.slice(from, to)
    // `//` starts a comment anywhere on the line. Deliberately not `#`, which note
    // names need: `C#4` is a note, not a comment, and a language whose comment
    // character eats part of its own vocabulary is a language nobody can write in.
    const comment = raw.indexOf('//')
    const body = comment === -1 ? raw : raw.slice(0, comment)

    const words = []
    const wordPattern = /[^\s,{}]+/g
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
      from,
      to,
      body,
      words,
      state: open,
      opens: undefined,
      closes: false,
      key: undefined,
      values: [],
      problems: [],
    }
    lines.push(line)

    const trimmed = body.trim()
    if (trimmed === '') continue

    /**
     * Record a problem against this line, in both places it has to appear.
     * @param mark - the word to underline.
     * @param message - what to tell the user.
     * @param code - the stable tag.
     * @param severity - how loudly it speaks.
     * @returns {void}
     */
    const fail = (mark, message, code, severity = 'error') => {
      const problem = { from: mark.from, to: mark.to, line: number, message, code, severity }
      line.problems.push(problem)
      problems.push(problem)
    }

    if (trimmed === '}') {
      line.closes = true
      if (open === undefined) {
        const at = from + body.indexOf('}')
        fail(
          { from: at, to: at + 1 },
          'Nothing is open here, so there is nothing to close.',
          'stray-brace',
        )
      } else {
        open = undefined
      }
      continue
    }

    if (trimmed.endsWith('{')) {
      const name = words[0]
      if (name === undefined) {
        const at = from + body.indexOf('{')
        fail({ from: at, to: at + 1 }, 'A block needs a state in front of its `{`.', 'missing-state')
        continue
      }
      line.opens = name.text
      if (!states.includes(name.text)) {
        fail(
          name,
          `Unknown state "${name.text}" — this document understands ${states.join(', ')}.`,
          'unknown-state',
        )
        open = undefined
        continue
      }
      if (open !== undefined) {
        fail(
          name,
          `"${name.text}" opens a block while "${open}" is still open — close it with a \`}\` line first.`,
          'nested-block',
        )
      }
      if (words.length > 1) {
        fail(
          words[1],
          `"${words[1].text}" is not inside the block — "${name.text} {" takes nothing else on its line.`,
          'stray-word',
        )
      }
      open = name.text
      opener = line
      line.state = name.text
      if (rules[name.text] === undefined) rules[name.text] = {}
      continue
    }

    if (body.includes('{') || body.includes('}')) {
      const at = from + body.search(/[{}]/)
      fail(
        { from: at, to: at + 1 },
        'A brace is only understood at the end of a state line, as in `waiting {`.',
        'stray-brace',
      )
      continue
    }

    const key = words[0]
    if (key === undefined) continue
    line.values = words.slice(1)

    if (open === undefined && states.includes(key.text) && words.length === 1) {
      fail(
        key,
        `"${key.text}" opens a block — write "${key.text} {" on a line of its own.`,
        'unopened-block',
      )
      continue
    }

    const accepted = open === undefined ? keys.global : keys.state
    if (!accepted.includes(key.text)) {
      const what = open === undefined ? 'setting' : `property of "${open}"`
      fail(
        key,
        `Unknown ${what} "${key.text}" — this document understands ${accepted.join(', ')}.`,
        'unknown-key',
      )
      continue
    }

    // A known property, so the line is a property line whatever its value does —
    // the completion layer reads `key` to decide what the caret is completing.
    line.key = key.text
    const spec_ = spec[key.text] ?? {}
    if (open !== undefined && spec_.states !== undefined && !spec_.states.includes(open)) {
      fail(
        key,
        `"${key.text}" does nothing in "${open}" — only ${spec_.states.join(', ')} are chimed at.`,
        'inert-property',
        'warning',
      )
      continue
    }

    const checked = readValue(key, line.values, spec_)
    if (checked.message !== undefined) {
      fail(checked.mark, checked.message, 'bad-value')
      continue
    }
    if (open === undefined) globals[key.text] = checked.value
    else rules[open][key.text] = checked.value
  }

  // An open block at the end of the document is a mistake worth naming: without it
  // the lines under it read as properties of a state the reader never closed, and
  // the messages they earn are about the wrong problem.
  if (open !== undefined && opener !== undefined) {
    const mark = opener.words[0] ?? { from: opener.from, to: opener.to }
    const problem = {
      from: mark.from,
      to: mark.to,
      line: opener.number,
      message: `"${open}" is never closed — add a line with a single \`}\`.`,
      code: 'unclosed-block',
      severity: 'error',
    }
    opener.problems.push(problem)
    problems.push(problem)
  }

  return { globals, rules, lines, problems }
}

/**
 * How a value of one kind is written, for a message that has to say what it wanted.
 * @param spec - the property's spec.
 * @returns a readable phrase.
 */
function expectedValue(spec) {
  if (spec.kind === 'chime') {
    return 'note names such as "A5 E6" — a note may name its own length as "A5:200ms", and "-:200ms" is a rest — or "off" for silence'
  }
  if (spec.kind === 'duration') return 'a duration such as 1.5s or 300ms'
  if (spec.kind === 'number') return `a number between ${String(spec.min)} and ${String(spec.max)}`
  return (spec.words ?? []).join(', ')
}

/**
 * Read one property's value, or say why it is not one.
 *
 * The whole value is read or none of it is: a chime whose second note is a typo is
 * reported and the state keeps its shipped sound, rather than playing a chime that
 * is half of what the document says.
 *
 * @param key - the property's word, so a missing value has a range to point at.
 * @param values - the words written after the property.
 * @param spec - the property's spec.
 * @returns `{ value }` when the value reads, `{ mark, message }` when it does not.
 */
function readValue(key, values, spec) {
  if (spec.kind === 'chime') {
    if (values.length === 0) {
      return {
        mark: key,
        message: `"${key.text}" needs notes — write ${expectedValue(spec)}.`,
      }
    }
    if (values.length === 1 && (values[0].text === 'off' || values[0].text === 'none')) {
      return { value: { silent: true, labels: [], notes: [] } }
    }
    const notes = []
    const labels = []
    for (const word of values) {
      const item = parseChimeItem(word.text)
      if (item.problem === 'length') {
        return {
          mark: word,
          message: `"${word.text}" has no length after its colon — write a duration such as 200ms, or drop the colon.`,
        }
      }
      if (item.problem === 'note') {
        return {
          mark: word,
          message: `"${word.text}" is not a note — write a note name such as A5, a frequency in Hz such as 880, or \`-\` for a rest.`,
        }
      }
      notes.push(item)
      labels.push(word.text)
    }
    // A chime of nothing but rests cannot sound, and the language already has a
    // word for silence. Resolving it to that word is what keeps the row honest: a
    // channel that exists is a card with a Play button, and this one would have
    // nothing to play.
    if (notes.every((item) => item.rest === true)) {
      return { value: { silent: true, labels: [], notes: [] } }
    }
    return { value: { silent: false, labels, notes } }
  }

  if (values.length === 0) {
    return {
      mark: key,
      message: `"${key.text}" needs a value — write ${expectedValue(spec)}.`,
    }
  }
  if (values.length > 1) {
    return {
      mark: values[1],
      message: `"${key.text}" takes one value, but ${String(values.length)} were written — write ${expectedValue(spec)}.`,
    }
  }

  const word = values[0]
  if (spec.kind === 'word') {
    const words = spec.words ?? []
    if (words.includes(word.text)) return { value: word.text }
    return {
      mark: word,
      message: `"${word.text}" is not a value "${key.text}" accepts — expected ${words.join(', ')}.`,
    }
  }

  if (spec.kind === 'number') {
    if (!/^\d+(?:\.\d+)?$/.test(word.text)) {
      return {
        mark: word,
        message: `"${word.text}" is not a number — write ${expectedValue(spec)}.`,
      }
    }
    const value = Number.parseFloat(word.text)
    if (value < spec.min || value > spec.max) {
      return {
        mark: word,
        message: `${word.text} is outside what "${key.text}" accepts — write ${expectedValue(spec)}.`,
      }
    }
    return { value }
  }

  const seconds = parseDuration(word.text)
  if (seconds === undefined) {
    return {
      mark: word,
      message: `"${word.text}" is not a duration — write ${expectedValue(spec)}.`,
    }
  }
  if (seconds < spec.min || seconds > spec.max) {
    return {
      mark: word,
      message: `${word.text} is outside what "${key.text}" accepts — write ${expectedValue(spec)}.`,
    }
  }
  return { value: seconds }
}

// ─── the grammar ─────────────────────────────────────────────────────────────

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
 *   the order a list shows them.
 * @property {{ global: readonly string[], state: readonly string[] }} [keys] - the
 *   properties each scope accepts.
 * @property {Readonly<Record<string, DshSentryKeySpec>>} [spec] - what each property
 *   reads.
 * @property {readonly string[]} [shapes] - the background shapes a rule may name.
 * @property {readonly string[]} [motions] - the motions a rule may apply.
 * @property {Readonly<Record<string, string>>} [colors] - the named palette.
 *   Presets on purpose: a free colour can be illegible.
 * @property {readonly string[]} [modes] - the on/off/background words.
 * @property {readonly string[]} [notes] - the note names a completion offers.
 * @property {readonly string[]} [tones] - the waveforms `tone` accepts.
 * @property {Readonly<Record<string, object>>} [defaults] - the shipped look per
 *   state, used to rank a completion and to document a word.
 */

/**
 * Build the grammar for dsh-sentry's style document.
 *
 * Everything but this function and the three value readers above is declared
 * INSIDE it, and that is not a style choice. The build splices this file into
 * `src/client.js`, where it shares the plugin's own scope — a classic script has no
 * module table to hold a second file — so a top-level `SHAPES` here would be a
 * second `SHAPES` beside the plugin's, and would either collide with it or shadow
 * it. The readers are top-level because both halves call them, and their names are
 * ones this plugin has nowhere else.
 *
 * @param {DshSentryStyleOptions} [options] - the vocabularies and shipped defaults.
 * @returns {object} a grammar that paints, completes, diagnoses, and explains the
 *   language.
 */
function dshSentryStyleGrammar(options = {}) {
  const STATES = options.states ?? []
  const KEYS = options.keys ?? { global: [], state: [] }
  const SPEC = options.spec ?? {}
  const SHAPES = options.shapes ?? []
  const MOTIONS = options.motions ?? []
  const COLOR_NAMES = Object.keys(options.colors ?? {})
  const MODES = options.modes ?? []
  const NOTES = options.notes ?? []
  const TONES = options.tones ?? []
  const LOOK = options.defaults ?? {}

  /** Every property name, either scope, in the order a list offers them. */
  const ALL_KEYS = [...new Set([...KEYS.global, ...KEYS.state])]

  /** The line shape that makes the first word a state rather than a property. */
  const BLOCK_LINE = /^\s*[\w#-]+\s*\{/

  /**
   * A vocabulary, with the one setting this grammar always wants.
   *
   * `caseSensitive` is on for every word here because the reader compares with
   * `includes` on the literal: a suggestion list that accepted `Circle` would be
   * teaching a spelling the plugin then rejects.
   * @param spec - the declaration, minus the repeated setting.
   * @returns the resolved vocabulary.
   */
  function closedVocabulary(spec) {
    return _citisen_litearea.defineVocabulary({ ...spec, caseSensitive: true })
  }

  // ── vocabularies ──────────────────────────────────────────────────────────
  // Declared once each so the word set, the paint, the hover text, and the
  // completion list cannot disagree. Only the state vocabulary carries
  // `unknownMessage`, because only a state word can be validated from a token: a
  // property's value depends on the property, and the key is structural.

  const STATE_VOCAB = closedVocabulary({
    id: 'state',
    words: STATES,
    scope: 'state',
    unknownMessage: 'Unknown state "{word}" — this document understands {allowed}.',
    docs: {
      waiting: { detail: 'a question is waiting', body: 'The agent asked something, and the turn is blocked until it is answered.' },
      approval: { detail: 'a permission is waiting', body: 'The agent requested an escalation or a plan review, and the turn is blocked on it.' },
      running: { detail: 'a turn is in progress', body: 'The agent is working and does not need anyone.' },
      done: { detail: 'the turn finished', body: 'The agent stopped and left the tab alone.' },
    },
  })

  const KEY_VOCAB = closedVocabulary({
    id: 'property',
    words: ALL_KEYS,
    scope: 'property',
    docs: {
      icon: { detail: 'document setting: draw the tab icon' },
      title: { detail: 'document setting: prefix the tab title' },
      sound: { detail: 'document setting: when a chime may sound' },
      'chime-gap': { detail: 'document setting: least time between two chimes' },
      'keep-done': { detail: 'document setting: how long "just finished" stays lit' },
      volume: { detail: 'document setting: the default loudness' },
      tone: { detail: 'document setting: the default waveform' },
      shape: { detail: 'the background shape' },
      color: { detail: 'the background colour, from the preset palette' },
      motion: { detail: 'what moves while the state lasts' },
      speed: { detail: 'the motion rate, in seconds' },
      chime: { detail: 'the notes this state sounds' },
      tone: { detail: 'this state\u2019s own waveform' },
      volume: { detail: 'this state\u2019s own loudness' },
    },
  })

  const SHAPE_VOCAB = closedVocabulary({
    id: 'shape',
    words: SHAPES,
    scope: 'value.shape',
    docs: {
      circle: { detail: 'a full disc' },
      rounded: { detail: 'a rounded square — the fish is wider than it is tall, and this gives it room' },
      square: { detail: 'a square with sharp corners' },
      none: {
        detail: 'no background',
        body: 'The fish alone, on whatever the tab gives it. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is transparent: for just-the-fish, use rounded or circle.',
      },
    },
  })

  const COLOR_VOCAB = closedVocabulary({
    id: 'color',
    words: COLOR_NAMES,
    scope: 'value.color',
    docs: Object.fromEntries(
      Object.entries(options.colors ?? {}).map(([name, hex]) => [name, { detail: hex }]),
    ),
  })

  const MOTION_VOCAB = closedVocabulary({
    id: 'motion',
    words: MOTIONS,
    scope: 'value.motion',
    docs: {
      still: { detail: 'nothing moves' },
      turn: { detail: 'the fish rotates', body: 'speed is seconds per revolution.' },
      blink: { detail: 'the whole icon dims and returns', body: 'speed is seconds per breath.' },
      pulse: { detail: 'the background colour alternates', body: 'speed is seconds per cycle.' },
    },
  })

  const MODE_VOCAB = closedVocabulary({
    id: 'mode',
    words: MODES,
    scope: 'value.mode',
    docs: {
      on: { detail: 'the channel is on' },
      off: { detail: 'the channel is off' },
      background: { detail: 'only while this page is hidden or unfocused' },
      always: { detail: 'even while you are looking at the interface' },
    },
  })

  const TONE_VOCAB = closedVocabulary({
    id: 'tone',
    words: TONES,
    scope: 'value.tone',
    docs: {
      sine: { detail: 'a pure tone — the shipped waveform', body: 'Only the fundamental, so it is the softest of the four and the one that survives a low volume intact.' },
      triangle: { detail: 'a soft tone with a little more edge than sine', body: 'A few odd harmonics: brighter than `sine`, still gentle.' },
      square: { detail: 'a hollow, retro tone', body: 'Odd harmonics only — the chiptune sound. Noticeably louder than `sine` at the same `volume`, so turn the volume down rather than the tone.' },
      sawtooth: { detail: 'a bright, buzzy tone', body: 'Every harmonic: the harshest of the four, and the one most likely to read as an alarm rather than a chime.' },
    },
  })

  /**
   * What each property explains about itself, per scope.
   *
   * Two tables rather than one because `volume` means two things: the top level's
   * master loudness and a block's factor for that one state. A document that reads
   * `volume 0.5` at the top and `volume 0.5` inside `done` is not saying the same
   * thing twice, and the hover has to be able to tell them apart.
   */
  const KEY_DOCS = {
    global: {
      icon: { detail: 'draw the tab icon', body: `\`on\` or \`off\`. Off restores the app's own favicon.` },
      title: { detail: 'prefix the tab title', body: `\`on\` or \`off\`. The title is the only place an exact count can be read.` },
      sound: {
        detail: 'when a chime may sound',
        body: '`background` (the default) chimes only while this page is hidden or unfocused; `always` chimes even while you are looking at it; `off` silences every chime.',
      },
      'chime-gap': {
        detail: 'least time between two chimes',
        body: 'Measured against the clock rather than a timer, because a background tab throttles timers to the minute. One burst of questions should be one chime.',
      },
      'keep-done': {
        detail: 'how long "just finished" stays lit',
        body: 'Set it to 0 and the finished state never shows — the completion chime rides the same edge, so it falls silent too.',
      },
      volume: {
        detail: 'the default loudness',
        body: 'The loudness every chimed state plays at unless its own block names one. Both spellings are the same kind of number: a block\u2019s `volume` does not multiply this one, it replaces it.',
      },
      tone: {
        detail: 'the default waveform',
        body: `The waveform every chimed state plays unless its own block names one: ${TONES.join(', ')}. Like \`volume\`, a block\u2019s line replaces this one rather than layering on it.`,
      },
    },
    state: {
      shape: { detail: 'the background shape', body: `One of ${SHAPES.join(', ')}.` },
      color: { detail: 'the background colour', body: `${COLOR_NAMES.join(', ')} — all presets, chosen so the fish stays legible.` },
      motion: { detail: 'what moves', body: `One of ${MOTIONS.join(', ')}.` },
      speed: { detail: 'the motion rate', body: 'Seconds per revolution for `turn`, per cycle otherwise. `1.1s` and `1100ms` are the same rate.' },
      chime: {
        detail: 'the notes this state sounds',
        body: 'Note names (`A5 E6`) or frequencies in Hz (`880 1318.5`), played in order. A note may name its own length — `A5:200ms` rings 200ms and the next item starts when it ends — and `-:200ms` is that much silence. `off` silences this state alone.',
      },
      tone: {
        detail: 'this state\u2019s own waveform',
        body: `One of ${TONES.join(', ')}. Overrides the document\u2019s default waveform for this state alone.`,
      },
      volume: {
        detail: 'this state\u2019s own loudness',
        body: 'Overrides the document\u2019s default loudness for this state alone. It replaces that number rather than scaling it, so the settings row prints exactly one of the two — never their product.',
      },
    },
  }

  /** Every vocabulary, by the scope its words are painted under, for hover. */
  const BY_SCOPE = new Map([
    ['state', STATE_VOCAB],
    ['value.shape', SHAPE_VOCAB],
    ['value.color', COLOR_VOCAB],
    ['value.motion', MOTION_VOCAB],
    ['value.mode', MODE_VOCAB],
    ['value.tone', TONE_VOCAB],
  ])

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * The line record the caret is on, when the analysis has one.
   * @param context - a completion context.
   * @returns the line, or undefined.
   */
  function lineAt(context) {
    return context.state?.lines?.[context.line.number]
  }

  /**
   * The scope a line's property belongs to: a state's name, or `global`.
   * @param line - the line, or undefined.
   * @returns the scope key.
   */
  function scopeOf(line) {
    return line?.state === undefined ? 'global' : 'state'
  }

  /**
   * The range a value completion replaces: the value token the caret is in.
   *
   * Deliberately NOT `context.word`. `wordChars` is `/[\p{L}\p{N}_#-]/u` — no dot, on
   * purpose, so that a stray `circle.` is not read as one unknown word — and the price
   * of that is that the word around the caret in `volume 0.2` is just `2`. Accepting
   * `0.25` there wrote `0.0.25`: the completion replaced the part `wordChars` could see
   * and kept the prefix it could not.
   *
   * The reader already knows where a value begins and ends, because it split the line
   * on whitespace, so the range comes from its own record rather than from the lexical
   * layer's narrower idea of a word. A caret in the whitespace after a value is in no
   * token, and the default range — the empty word at the caret — is then the right one:
   * the next value is a new token, not a replacement.
   *
   * @param context - a completion context.
   * @returns the range to replace.
   */
  function valueRange(context) {
    const line = lineAt(context)
    if (line !== undefined) {
      for (const word of line.values ?? []) {
        if (context.caret >= word.from && context.caret <= word.to) {
          return { from: word.from, to: word.to }
        }
      }
    }
    return context.word
  }

  /**
   * A completion row for one word of a vocabulary.
   * @param word - the word.
   * @param vocabulary - the vocabulary that documents it.
   * @param options - `{ current, append, kind }`.
   * @returns the row.
   */
  function wordRow(word, vocabulary, { current, append, kind }) {
    const entry = vocabulary?.entryFor(word)
    return {
      label: word,
      insert: word,
      append,
      kind,
      detail: word === current ? 'the current value' : entry?.detail,
      documentation: entry?.body,
      // The word already written leads, so accepting the top row changes nothing by
      // accident. Everything else keeps the vocabulary's own order.
      sortText: word === current ? '0' : '1',
    }
  }

  /**
   * The completion rows for one property's value.
   * @param line - the caret's line, which names the property.
   * @returns the rows.
   */
  function valueItems(line) {
    const key = line?.key
    if (key === undefined) return []
    const spec = SPEC[key] ?? {}
    const current = line.values?.[0]?.text

    if (spec.kind === 'chime') {
      const rows = NOTES.map((note) =>
        wordRow(note, undefined, { current, append: '\n', kind: 'note' }),
      )
      for (const note of rows) {
        note.documentation =
          'Notes play in order. Any equal-tempered name works (`A5`, `C#4`, `Bb3`), as does a frequency in Hz (`880`). Add a length after a colon to place the next item yourself: `A5:200ms`.'
      }
      rows.push({
        label: '-',
        // Accepting a rest writes the colon too, because the length is the whole
        // point of a rest: `-` alone is one step of silence, and one step is what
        // the notes around it already decide.
        insert: '-:',
        append: '',
        kind: 'note',
        detail: current === '-' ? 'the current value' : 'a rest — silence of a length you write',
        documentation: 'Silence that still takes time: `-:200ms` waits 200ms before the next note.',
        sortText: current === '-' ? '0' : '1',
      })
      rows.push({
        label: 'off',
        insert: 'off',
        append: '\n',
        kind: 'note',
        detail: 'this state stays silent',
        documentation: 'Silences this state alone; the other two keep their chimes.',
        sortText: '1',
      })
      return rows
    }

    if (spec.kind === 'word') {
      const vocabulary =
        key === 'shape'
          ? SHAPE_VOCAB
          : key === 'color'
            ? COLOR_VOCAB
            : key === 'motion'
              ? MOTION_VOCAB
              : key === 'tone'
                ? TONE_VOCAB
                : MODE_VOCAB
      return (spec.words ?? []).map((word) =>
        wordRow(word, vocabulary, { current, append: '\n', kind: 'value' }),
      )
    }

    // A free number or duration: the list offers the rates worth reaching for
    // rather than pretending to be exhaustive.
    const shipped = LOOK[line.state]?.[key]
    return (spec.suggest ?? []).map((value) => {
      const text = String(value)
      const isShipped = shipped !== undefined && String(shipped) === text
      return {
        label: text,
        insert: text,
        append: '\n',
        kind: 'number',
        detail: isShipped ? 'the shipped value for this state' : 'a value worth trying',
        sortText: isShipped ? '0' : '1',
      }
    })
  }

  return _citisen_litearea.defineGrammar({
    id: 'dsh-sentry-style',
    name: 'dsh-sentry style document',

    // A note is `A5`, a chime item's length is `A5:200ms`, an accidental is part of
    // the note, and a number is `1.5s` — all four are one token, so all four are word
    // characters here. The dot is the one worth explaining: leaving it out was the
    // earlier choice, to stop a stray `circle.` being read as one unknown word, and it
    // cost more than it bought. `wordChars` is also what a completion filters by and
    // what a double click selects, so without the dot the editor believed the word in
    // `volume 0.2` was `2` — and replacing that word with `0.25` wrote `0.0.25`. The
    // colon is the same argument: the reader treats `A5:200ms` as one value, so the
    // editor has to treat it as one word, or the caret lands inside a token the
    // language never splits. A token the reader treats as one value has to be one
    // word to the editor.
    wordChars: /[\p{L}\p{N}_#.:-]/u,

    rules: [
      { kind: 'match', scope: 'comment', pattern: /\/\/[^\n]*/ },

      // Braces are structure rather than words, and claiming them first is what
      // lets `waiting{` read as a state and a brace rather than as one unknown word.
      { kind: 'match', scope: 'punctuation', pattern: /\{|\}/ },

      // The first word of a line that opens a block is a state or it is a mistake.
      // The `line` predicate is what keeps a top-level setting out of this rule:
      // `icon on` is a property line, and only `waiting {` is a block.
      {
        kind: 'words',
        words: STATE_VOCAB,
        when: { firstOnLine: true, line: BLOCK_LINE },
        unknown: {},
      },

      // Properties. Membership is not enforced here: an unknown name has to fall
      // through to the invalid rule so a typo is visible, and the structural pass
      // reports it with the list the line's own scope accepts — which the lexical
      // layer cannot know.
      { kind: 'words', words: KEY_VOCAB, when: { firstOnLine: true } },

      // Values, painted by what they are. Membership alone places a word for every
      // vocabulary but one: `square` is both a shape and a waveform, and a word
      // cannot be painted under two scopes at once. The waveform therefore claims
      // its own line — `when.line` is what makes the claim — and everywhere else
      // `square` stays the shape it has always been. The rest is unchanged: a value
      // written for the wrong property is still painted as the value it is, and the
      // structural pass is what says it is in the wrong place, with the exact range.
      {
        kind: 'words',
        words: TONE_VOCAB,
        when: { line: /^\s*tone\s/ },
      },
      { kind: 'words', words: SHAPE_VOCAB },
      { kind: 'words', words: COLOR_VOCAB },
      { kind: 'words', words: MOTION_VOCAB },
      { kind: 'words', words: MODE_VOCAB },

      // A chime item that names its own length, and a rest — both before the two
      // plain-value rules below, because a rule claims only the prefix it matches
      // and `A5` claimed out of `A5:200ms` would leave the length to fall through as
      // an unknown word. A bare note and a bare number keep the scopes they had.
      {
        kind: 'match',
        scope: 'value.note',
        pattern: /(?:[A-Ga-g][#b]?-?\d|\d+(?:\.\d+)?):\d+(?:\.\d+)?(?:ms|s|m)?/,
      },
      { kind: 'match', scope: 'value.note', pattern: /-(?::\d+(?:\.\d+)?(?:ms|s|m)?)?/ },
      { kind: 'match', scope: 'value.note', pattern: /[A-Ga-g][#b]?-?\d/ },
      { kind: 'match', scope: 'value.number', pattern: /\d+(?:\.\d+)?(?:ms|s|m)?/ },

      // Anything left is a word this language does not know. Braces are excluded
      // so a run of text cannot swallow one.
      { kind: 'match', scope: 'invalid', pattern: /[^\s{}]+/ },
    ],

    fallbackScope: 'text',

    // ── what the document means ─────────────────────────────────────────────
    //
    // The same walk the engine draws from, so the paint, the diagnostics, the
    // completions, and the icon cannot disagree about what a line says.
    analyze: (text) => readStyleDocument(text, { states: STATES, keys: KEYS, spec: SPEC }),

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
        id: 'line-head',
        // The head of a line is either a state (to open a block) or a property of
        // the scope the line is in — and it stays offered while it is being
        // spelled, which is why this asks `firstWord` rather than `firstOnLine`.
        when: (context) => {
          if (!context.firstWord) return false
          const line = lineAt(context)
          if (line === undefined) return false
          if (line.key !== undefined || line.opens !== undefined || line.closes) return false
          return true
        },
        range: (context) => context.word,
        items: (context) => {
          const line = lineAt(context)
          const inBlock = line?.state !== undefined
          const items = []
          if (!inBlock) {
            for (const state of STATES) {
              const entry = STATE_VOCAB.entryFor(state)
              items.push({
                label: state,
                insert: state,
                // A block needs its brace, and writing it is the one thing the
                // user would otherwise have to remember.
                append: ' {',
                kind: 'state',
                detail: entry?.detail,
                documentation: entry?.body,
                sortText: '0',
              })
            }
          }
          for (const key of inBlock ? KEYS.state : KEYS.global) {
            const doc = KEY_DOCS[inBlock ? 'state' : 'global'][key]
            items.push({
              label: key,
              insert: key,
              // The space invites the value, and accepting one ends the line: the
              // list that follows a value is the property list for the next line,
              // which is how a document is written without remembering a colon.
              append: ' ',
              kind: 'property',
              detail: doc?.detail,
              documentation: doc?.body,
              sortText: '1',
            })
          }
          if (inBlock) {
            items.push({
              label: '}',
              insert: '}',
              append: '\n',
              kind: 'punctuation',
              detail: 'close the block',
              documentation: 'Every state block has to be closed before the next one opens.',
              sortText: '2',
            })
          }
          return items
        },
      },
      {
        id: 'value',
        // Values belong to a line that has named a property, after that name.
        when: (context) => {
          const line = lineAt(context)
          if (line === undefined || line.key === undefined) return false
          const keyWord = line.words[0]
          return keyWord !== undefined && context.caret > keyWord.to
        },
        range: (context) => valueRange(context),
        items: (context) => valueItems(lineAt(context)),
      },
    ],

    // ── what a thing is ─────────────────────────────────────────────────────
    describe: (context) => {
      const token = context.token
      if (token === undefined) return undefined
      if (token.scope === 'comment') {
        return { title: 'comment', body: 'Ignored by the reader. `//` anywhere on a line starts one.' }
      }
      if (token.scope === 'punctuation') {
        return {
          title: token.text,
          detail: token.text === '{' ? 'opens a state block' : 'closes the open block',
          body: 'A block holds one state\u2019s properties, one per line.',
        }
      }
      if (token.scope === 'state') {
        const entry = STATE_VOCAB.entryFor(token.text)
        return entry === undefined ? undefined : { title: token.text, detail: entry.detail, body: entry.body }
      }
      if (token.scope === 'property') {
        const line = context.state?.lines?.[token.line]
        const doc = KEY_DOCS[scopeOf(line)][token.text]
        return doc === undefined ? undefined : { title: token.text, detail: doc.detail, body: doc.body }
      }
      if (token.scope === 'value.note') {
        const item = parseChimeItem(token.text)
        const length = /:(\d+(?:\.\d+)?(?:ms|s|m)?)$/.exec(token.text)?.[1]
        if (item.problem !== undefined) {
          return {
            title: token.text,
            detail: 'not a chime item',
            body: 'Write a note name such as `A5`, a frequency in Hz such as `880`, or `-` for a rest. A length after `:` is a duration such as `200ms`.',
          }
        }
        if (item.rest === true) {
          return {
            title: token.text,
            detail: 'a rest',
            body:
              length === undefined
                ? 'Silence that still takes time: it moves the chime on without sounding.'
                : `Silence for \`${length}\`: the next item starts when it ends.`,
          }
        }
        return {
          title: token.text,
          detail: `${String(item.frequency)} Hz`,
          body:
            length === undefined
              ? 'Notes play in order, each one starting a little after the one before it. Frequencies in Hz work too.'
              : `\`${length}\` is this item's length: the next item starts when this one ends, so a line of lengths is the rhythm of the chime.`,
        }
      }
      if (token.scope === 'value.number') {
        return {
          title: token.text,
          detail: 'a value',
          body: 'Seconds unless a unit is written: `1.5s`, `300ms`, `2m`.',
        }
      }
      if (token.scope === 'invalid') {
        return {
          title: token.text,
          detail: 'not part of this language',
          body: 'Nothing here accepts this word: it is not a state, not a property of the scope it is written in, and not a value any property recognises.',
        }
      }
      const entry = BY_SCOPE.get(token.scope)?.entryFor(token.text)
      // Nothing documented means nothing to say. Falling back to the scope name
      // would put an internal identifier in front of the user.
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
//
// The four states, and the precedence that decides which one a tab shows, are named
// where the document names them: see `STYLE_STATES` below. The projection that
// computes them from the session services is {@link sessionPlan}, and neither of
// those needs a second copy of the list here.

/**
 * How long a finished session keeps the green "done" signal, by default.
 *
 * Deliberately not the session's `completed` flag: that stays true until the user
 * selects the session, so trusting it would leave the tab green forever and cost
 * the signal all of its meaning. This is a decay window measured from the
 * running → idle edge instead.
 */
const DEFAULT_DONE_WINDOW_MS = 60_000

/**
 * The shortest gap between two chimes, in ms — the shipped `chime-gap`.
 *
 * The value the document ships with, and the one the row shows in the reference. It
 * lives here rather than only in the document text because `resolveStyle` needs it
 * for a document that says nothing.
 */
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
  const kind = typeof entry === 'string' ? entry : entry?.kind
  if (kind === 'question') return 'waiting'
  // A plan review is the same demand on the user as an approval — the tab says
  // "this will not move until you look", not which of the two it is — and the
  // wire kind arrived with 0.1.7 while the other two names stayed as they were.
  if (kind === 'approval' || kind === 'plan-review') return 'approval'
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

// ─── the style document ──────────────────────────────────────────────────────

/**
 * The style document: one text file that decides how the four states look *and*
 * what they sound like.
 *
 * A tab icon is not a form: it is four states, each a colour, a background shape,
 * a motion, and a chime, and the interesting part is the *combinations*. A dozen
 * switches could express that; they would also take a dozen interactions to say
 * what one block says, and the sound half of them would only make sense next to
 * the appearance half. So the whole configuration is one document, and the
 * settings row gives it an editor, a live preview of every state, and the list of
 * anything it gets wrong.
 *
 * Every property is named. There is no positional slot and no word that means one
 * thing in one place and something else elsewhere:
 *
 *   // document settings first, one per line
 *   icon on
 *   sound background
 *   keep-done 60s
 *
 *   waiting {
 *     shape rounded
 *     color amber
 *     motion blink
 *     speed 1.1s
 *     chime A5 E6
 *   }
 *
 * The reader is total: a line it does not understand is reported and left out, and
 * the shipped default stands in for that one property. A typo in a settings file
 * must not be able to leave a tab without an icon.
 *
 * @module dsh-sentry/style
 */

/** The background shapes a block may name. */
const SHAPES = ['circle', 'rounded', 'square', 'none']

/** The motions a block may apply. */
const MOTIONS = ['still', 'turn', 'blink', 'pulse']

/**
 * The words a property takes that are not a shape, a colour, or a motion.
 *
 * `on` and `off` are what `icon` and `title` read; `background` and `always` are
 * what `sound` reads, and `off` is also how a state says it has no chime. One word
 * per meaning: there is no `none` here, because `none` is a shape.
 */
const MODES = ['on', 'off', 'background', 'always']

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

/**
 * The four states a block may open, most urgent first — the order the row shows them.
 *
 * `waiting` and `approval` are the two halves of "a human must act": the agent asked
 * a question (`ask_user_question`, which includes the plan-review card) or requested
 * a permission escalation. They are separate states because they want different
 * sounds, and because a session blocked on approval and a session blocked on a
 * question are different situations to come back to. The order is the precedence
 * {@link activeLook} applies to a tab, which can only show one of them at a time.
 */
const STYLE_STATES = ['waiting', 'approval', 'running', 'done']

/** The properties a block accepts, in the order the reference lists them. */
const STYLE_STATE_KEYS = ['shape', 'color', 'motion', 'speed', 'chime', 'tone', 'volume']

/** The document-level settings, in the order the reference lists them. */
const STYLE_GLOBAL_KEYS = ['icon', 'title', 'sound', 'chime-gap', 'keep-done', 'volume', 'tone']

/**
 * The states something can be *said* about.
 *
 * Three of the four states have an event behind them — a question arrives, an
 * approval arrives, a turn ends — and `running` has none: a turn starting is not
 * something this plugin interrupts anyone for. A `chime`, a `tone` or a `volume`
 * written in a `running` block is therefore reported as inert rather than kept in
 * silence.
 */
const CHIME_STATES = ['waiting', 'approval', 'done']

/** The note names a `chime` completion offers. Any equal-tempered name is accepted. */
const STYLE_NOTE_SUGGESTIONS = ['A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'E6']

/**
 * The waveforms a `tone` line may name: the four an `OscillatorNode` has, spelled
 * the way Web Audio spells them, so a document reads like the audio graph it is.
 */
const CHIME_TONES = ['sine', 'triangle', 'square', 'sawtooth']

/**
 * The waveform a chimed state plays when nothing in the document says otherwise.
 *
 * Sine because that is what every shipped chime has always been: a pure tone at a
 * low volume is a notification, and the harmonics of the other three are what turn
 * one into an alarm. It is a constant in the same sense `DEFAULT_VOLUME` is — the
 * row marks it as the default rather than printing a waveform nobody wrote.
 */
const DEFAULT_TONE = 'sine'

/** The slowest and fastest motion rate a document may name, in seconds per cycle. */
const SPEED_MIN = 0.2
const SPEED_MAX = 20

/** The longest chime gap and completed window a document may name, in seconds. */
const GAP_MAX = 600
const DONE_MAX = 600

/**
 * The loudness a chimed state plays at when nothing in the document says otherwise.
 *
 * There is no per-state loudness hidden in here, and that is the point: an earlier
 * version paired a document-level master with an engine-side factor per state, so a
 * reader who wrote `volume 1` and saw `85%` on one card and `45%` on another had no
 * line anywhere to trace those numbers to. Now a loudness is either a line of the
 * document — the `volume` at the top, or the one in the state's own block — or this
 * constant, which the row marks as the default when it is what applies.
 */
const DEFAULT_VOLUME = 0.5

/**
 * What each property of the document reads.
 *
 * The table is the document's type system, and the reader and the engine share it — a
 * value the reader accepted is a value the engine can use without checking it again.
 *
 * `states` marks a property that only means something for some states; `suggest` is
 * what a completion offers for a value whose set is open.
 */
const STYLE_SPEC = {
  icon: { kind: 'word', words: ['on', 'off'] },
  title: { kind: 'word', words: ['on', 'off'] },
  sound: { kind: 'word', words: ['off', 'background', 'always'] },
  'chime-gap': { kind: 'duration', min: 0, max: GAP_MAX, suggest: ['0s', '0.5s', '1s', '1.5s', '3s'] },
  'keep-done': { kind: 'duration', min: 0, max: DONE_MAX, suggest: ['0s', '15s', '30s', '1m', '5m'] },
  shape: { kind: 'word', words: SHAPES },
  color: { kind: 'word', words: Object.keys(PRESET_COLORS) },
  motion: { kind: 'word', words: MOTIONS },
  speed: { kind: 'duration', min: SPEED_MIN, max: SPEED_MAX, suggest: ['0.5s', '1s', '1.5s', '2s', '3s', '5s'] },
  chime: { kind: 'chime', states: CHIME_STATES },
  tone: { kind: 'word', words: CHIME_TONES, states: CHIME_STATES },
  volume: { kind: 'number', min: 0, max: 1, states: CHIME_STATES, suggest: ['0', '0.25', '0.5', '0.75', '1'] },
}

/** The vocabulary the reader and the editor are both built from. */
const STYLE_DOCUMENT_OPTIONS = {
  states: STYLE_STATES,
  keys: { global: STYLE_GLOBAL_KEYS, state: STYLE_STATE_KEYS },
  spec: STYLE_SPEC,
  tones: CHIME_TONES,
}

/**
 * What an unconfigured install draws and plays.
 *
 * The chimes are public-domain classical phrases, one per state, chosen for what the
 * state means: a knock at the door for a question, the grave descent of the D-minor
 * Toccata for an approval, and the "Ode to Joy" theme — low, quiet — for a finished
 * turn. `lib/index.js` carries the same lines for the host half, and the gate compares
 * the two copies character for character.
 */
const DEFAULT_STYLE = [
  '// dsh-sentry: how each session state looks and sounds.',
  '// Durations are seconds unless a unit is written: 1.5s, 300ms, 2m.',
  '// Every chime is a public-domain classical phrase, chosen for what its state means.',
  '',
  'icon on',
  'title on',
  'sound background',
  'chime-gap 1.5s',
  'keep-done 60s',
  'volume 0.5',
  '',
  'waiting {',
  '  shape rounded',
  '  color amber',
  '  motion blink',
  '  speed 1.1s',
  '  chime G4:170ms G4:170ms G4:170ms Eb4:680ms // Beethoven, Symphony No.5 op.67 - the knock',
  '  tone triangle',
  '}',
  '',
  'approval {',
  '  shape rounded',
  '  color amber',
  '  motion blink',
  '  speed 1.9s',
  '  chime A5:350ms G5:95ms F5:95ms E5:95ms D5:95ms C#5:95ms D5:500ms // Bach, Toccata and Fugue in D minor, BWV 565',
  '  tone triangle',
  '  volume 0.45',
  '}',
  '',
  'running {',
  '  shape circle',
  '  color blue',
  '  motion turn',
  '  speed 3s',
  '}',
  '',
  'done {',
  '  shape circle',
  '  color green',
  '  motion pulse',
  '  speed 1.6s',
  '  chime E4:230ms E4:230ms F4:230ms G4:230ms G4:230ms F4:230ms E4:230ms D4:460ms // Beethoven, Symphony No.9 - Ode to Joy',
  '  volume 0.25',
  '}',
].join('\n')

/**
 * Coerce one block's written values into something drawable.
 *
 * Almost nothing happens here, and that is the point: the reader that produced
 * `rule` already refused every value it could not read, with a diagnostic, so what
 * is left is a choice per property between what the document wrote and the shipped
 * default. A property the document got wrong is not in the rule at all, which is
 * what makes a typo degrade to the shipped appearance rather than to a broken SVG.
 *
 * @param rule - the block as read, or undefined when the document has no block.
 * @param defaults - the shipped look for that state.
 * @returns the resolved look.
 */
function resolveLook(rule, defaults) {
  if (rule === undefined) return { ...defaults }
  return {
    shape: rule.shape ?? defaults.shape,
    color: rule.color ?? defaults.color,
    motion: rule.motion ?? defaults.motion,
    speed: rule.speed ?? defaults.speed,
  }
}

/**
 * The shipped look per state, before any document is applied.
 *
 * These are the defaults the documentation quotes, and the ones a block inherits
 * property by property: naming only a colour in a block keeps the shipped shape,
 * motion, and rate for that state.
 *
 * `running` turns the **fish**, not a pattern. A dial-like ring of spokes was tried
 * and read as a watch face rather than as a state; the fish is the thing this icon
 * is about, so the fish is the thing that moves.
 */
const DEFAULT_LOOK = {
  waiting: { shape: 'rounded', color: 'amber', motion: 'blink', speed: 1.1 },
  approval: { shape: 'rounded', color: 'amber', motion: 'blink', speed: 1.9 },
  running: { shape: 'circle', color: 'blue', motion: 'turn', speed: 3 },
  done: { shape: 'circle', color: 'green', motion: 'pulse', speed: 1.6 },
}

/**
 * The shipped chime per state, read out of the shipped document rather than written
 * beside it.
 *
 * A state plays this when the document names no chime for it — one line deleted, a
 * whole block removed, or no document at all — so it has to be the same sound the
 * shipped document asks for, or deleting a line would quietly swap a classical phrase
 * for something the reader never saw. It used to be a hand-written frequency list
 * here, which is the same species of mistake as the per-state factors an earlier
 * version kept in the engine: two copies of one decision, and only one of them on
 * screen. Reading the document costs one parse at load and makes the copies one.
 *
 * `?? { labels: [], notes: [] }` covers a state the shipped document does not chime,
 * which the suite asserts never happens for the three chimed states.
 */
const SHIPPED_CHIMES = readStyleDocument(DEFAULT_STYLE, STYLE_DOCUMENT_OPTIONS).rules
const DEFAULT_CHIME = Object.fromEntries(
  CHIME_STATES.map((state) => [
    state,
    SHIPPED_CHIMES[state]?.chime ?? { labels: [], notes: [] },
  ]),
)

/** The shipped document-level settings. */
const DEFAULT_GLOBALS = {
  icon: true,
  title: true,
  sound: 'background',
  chimeGapMs: SOUND_GAP_MS,
  keepDoneMs: DEFAULT_DONE_WINDOW_MS,
  volume: DEFAULT_VOLUME,
}

/**
 * Resolve the document's own settings.
 * @param written - the values the document wrote at the top level.
 * @returns every document setting, with the shipped value filled in.
 */
function resolveGlobals(written) {
  return {
    icon: written.icon !== 'off',
    title: written.title !== 'off',
    sound: written.sound ?? DEFAULT_GLOBALS.sound,
    chimeGapMs: Math.round((written['chime-gap'] ?? DEFAULT_GLOBALS.chimeGapMs / 1000) * 1000),
    keepDoneMs: Math.round((written['keep-done'] ?? DEFAULT_GLOBALS.keepDoneMs / 1000) * 1000),
    volume: written.volume ?? DEFAULT_VOLUME,
  }
}

/**
 * Resolve the chimes a document asks for.
 *
 * A state is in `channels` exactly when it has something to play, so `chime off`
 * removes the entry rather than marking it silent — one thing to check at play time
 * instead of two.
 *
 * A state's loudness is its own `volume` line, or the document's, and **never a
 * product of the two**: both spellings are the same kind of number, so the percentage
 * the row prints is always one a reader can find by reading the document. `unstated`
 * marks the single case where that is not true — no `volume` anywhere — and the row
 * says so rather than printing a figure with no source. `tone` and `toneUnstated` are
 * the same pair for the waveform, which is why the row can print one label per card
 * and mean a line of the document by it.
 *
 * @param written - the values the document wrote at the top level.
 * @param rules - the blocks as read.
 * @returns `{ when, gapMs, channels }`.
 */
function resolveSound(written, rules) {
  const channels = {}
  for (const state of CHIME_STATES) {
    const block = rules[state]
    const chosen = block?.chime
    if (chosen !== undefined && chosen.silent === true) continue
    const spec = chosen ?? DEFAULT_CHIME[state]
    const written_ = block?.volume ?? written.volume
    const tone = block?.tone ?? written.tone
    channels[state] = {
      labels: spec.labels,
      notes: spec.notes,
      gain: round2(written_ ?? DEFAULT_VOLUME),
      unstated: written_ === undefined,
      tone: tone ?? DEFAULT_TONE,
      toneUnstated: tone === undefined,
    }
  }
  return {
    when: written.sound ?? DEFAULT_GLOBALS.sound,
    gapMs: Math.round((written['chime-gap'] ?? DEFAULT_GLOBALS.chimeGapMs / 1000) * 1000),
    channels,
  }
}

/**
 * Resolve a whole document against the shipped defaults.
 *
 * The single entry point for both halves of the plugin: the engine draws from
 * `look`, plays from `sound`, and schedules from `globals`, while the settings row
 * prints `problems` and previews the same `look`. Reading it twice would be reading
 * it two ways.
 *
 * @param text - the document.
 * @returns `{ look, globals, sound, problems, document }` — a resolved appearance
 *   per state, the resolved document settings, the resolved chimes, and every
 *   problem the reader found.
 */
function resolveStyle(text) {
  const document = readStyleDocument(text, STYLE_DOCUMENT_OPTIONS)
  const look = {}
  for (const state of STYLE_STATES) {
    look[state] = resolveLook(document.rules[state], DEFAULT_LOOK[state])
  }
  const globals = resolveGlobals(document.globals)
  return {
    look,
    globals,
    sound: resolveSound(document.globals, document.rules),
    problems: document.problems,
    document,
  }
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
 * The motion for one look, as a **static** animation element.
 *
 * There is none, and that is a finding rather than an omission. A favicon is
 * rendered in a document this plugin does not own, and the motion categories do
 * not have equal standing there: the first version of this declared a
 * `<animateTransform>` for the spin and a presentation animation for the pulse,
 * and the spin was reported as "the animation does not move" while the pulse
 * worked. Every motion is therefore a {@link motionTick} the plugin drives, which
 * is one code path for all of them instead of a per-motion bet on what the
 * browser's favicon document supports.
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
 * The colour a `pulse` moves toward.
 *
 * Green pulses toward blue and everything else toward green, which keeps the two
 * states that use `pulse` visibly different from each other without a second
 * palette: a change of colour is what says "something is happening".
 * @param name - the preset name.
 * @returns the partner hex.
 */
function pulsePartner(name) {
  return name === 'green' ? PRESET_COLORS.blue : PRESET_COLORS.green
}

/**
 * What one repaint of a driven motion looks like.
 *
 * The result is handed straight to {@link sentryFavicon}, which makes a motion a
 * function from a tick count to an appearance and nothing else — and therefore
 * verifiable in Node, with no browser and no clock: `blink` dims on alternate
 * half-periods, `pulse` alternates the colour once per period, and `turn` steps
 * the angle. Every rate is expressed in the seconds the document's `speed` already
 * means, so a block that says `speed 1.1s` gets a 1.1-second breath.
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
  if (look.motion === 'pulse') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return {
      color: Math.floor(tick / ticks) % 2 === 1 ? pulsePartner(look.color) : PRESET_COLORS[look.color],
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
 * The art's own canvas, in its own units.
 *
 * The shipped favicon is a `viewBox="0 0 50 50"` drawing — its path data reaches
 * 49.37 — so the fish's centre is at 25 in its own space, and its full size in the
 * 32px canvas is `32/50`. Both numbers come from this one constant, because
 * conflating them is the bug it exists to end: the placement used to centre the art
 * as if it were a 32-unit drawing, which pushed the fish 5.76px down and to the right
 * at full size — the bottom-right corner of the rounded square it was reported from —
 * and cut its nose and tail off against the rim.
 */
const FISH_ART_EXTENT = 50

/**
 * The fish's own scale: a 50-unit drawing placed at full size in a 32px canvas.
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
const FISH_FULL_SCALE = 32 / FISH_ART_EXTENT

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
 * The favicon, as an SVG string: a state-coloured background with the fish carved
 * out of it.
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

  // The fish, centred by construction: the scale takes the art from its own units to
  // canvas units, and the translate adds exactly the margin that puts the art's own
  // centre — 25 in its own space, not 16 — on the canvas centre. Both of those numbers
  // come from `FISH_ART_EXTENT`, so no margin arithmetic can drift them apart.
  //
  // A `turn` rotates the fish itself, about the canvas centre. That is the state
  // indicator the running state gets: the icon is *about* this glyph, so the glyph
  // is what moves, and nothing else has to be drawn to say "working". The scale
  // drops a little while it turns so the swept corners stay inside the background
  // (see {@link FISH_TURN_SCALE}).
  const spin = motion.angle === undefined || motion.angle === 0 ? 0 : round2(motion.angle)
  const scale = spin === 0 ? FISH_FULL_SCALE : FISH_FULL_SCALE * FISH_TURN_SCALE
  const shift = round2(16 - (FISH_ART_EXTENT / 2) * scale)
  const placed = `translate(${String(shift)} ${String(shift)}) scale(${String(scale)})`
  const fish = `<g transform="${placed}"><path d="${FISH_PATH}" fill="#000" fill-rule="nonzero"/></g>`

  // The mask is the background: everything drawn on it in black is carved out, so
  // the fish is negative space and its silhouette is always the tab bar showing
  // through. Rotating it here rather than on the painted layer is what keeps the
  // background's outline still — a turning background would read as a spinning
  // badge, not as a working fish.
  const carvings = spin === 0 ? fish : `<g transform="rotate(${String(spin)} 16 16)">${fish}</g>`

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
 * The chime is synthesized, and the notes it plays come from the document.
 *
 * The document names notes and, when it wants to, each note's own length: `chime A5
 * E6` is a rising interval at the shipped pacing, and `chime A5:200ms E6:200ms` is
 * the same two notes played as a rhythm. What these two constants decide is only the
 * pacing of an item that names no length — the shipped note and the shipped overlap
 * — which is deliberate: an item that names a length is placed by the writer, and an
 * item that names none is placed by the plugin.
 */

/** How long one note rings when the document does not name a length, in milliseconds. */
const CHIME_NOTE_MS = 130

/** How far apart two items start when the document does not name a length, in milliseconds. */
const CHIME_STAGGER_MS = 90

/**
 * One state's chime as a list of notes to schedule.
 *
 * An item that names a length takes exactly that long: it rings for it and the next
 * item starts when it ends, which is what makes a written length the rhythm of the
 * chime. An item that names none keeps the shipped pair of numbers — it rings
 * `CHIME_NOTE_MS` and the next one starts `CHIME_STAGGER_MS` later — so the two notes
 * of the shipped question still overlap into one interval rather than two knocks. A
 * rest is a step that sounds nothing; it still moves the clock.
 *
 * @param items - the chime items the document wrote, in order.
 * @returns `{ frequency, startMs, durationMs }` per sounding note.
 */
function chimeNotes(items) {
  const notes = []
  let startMs = 0
  for (const item of items) {
    const lengthMs = typeof item?.lengthMs === 'number' ? item.lengthMs : undefined
    if (typeof item?.frequency === 'number') {
      notes.push({
        frequency: item.frequency,
        startMs,
        durationMs: lengthMs ?? CHIME_NOTE_MS,
      })
    }
    startMs += lengthMs ?? CHIME_STAGGER_MS
  }
  return notes
}

/**
 * Which chime, if any, may sound right now.
 *
 * Three rules, all deliberate and all easy to get wrong:
 *
 * - **The document decides whether sound is on at all.** `sound off` silences
 *   everything, `sound background` (the shipped value) chimes only while this page
 *   is hidden or unfocused, and `sound always` chimes regardless. The reasoning
 *   behind the default: while the user is looking at the interface the favicon and
 *   the title have already said it, and a chime on top of that is noise.
 * - **One sound per burst.** Agents ask several questions in a row; three chimes in
 *   three seconds reads as a malfunction. The gap is measured against a
 *   caller-supplied clock instead of a timer, because a background tab throttles
 *   `setTimeout` to the minute and a timer-based gap would fire late or not at all.
 * - **A state with no chime is skipped, not silencing.** `chime off` in the
 *   `waiting` block must not suppress the approval that arrives in the same burst,
 *   which is why this walks the three events in order and takes the first one that
 *   has both an alert and a sound.
 *
 * @param alerts - the alert set from {@link changeAlerts}.
 * @param sound - the resolved chime configuration.
 * @param state - `{ now, lastSoundAt, hidden, focused }`.
 * @returns `{ channel, labels, frequencies, gain }`, or undefined for silence.
 */
function soundPlan(alerts, sound, state) {
  if (sound.when === 'off') return undefined
  if (sound.when === 'background' && !state.hidden && state.focused) return undefined
  if (typeof state.lastSoundAt === 'number' && state.now - state.lastSoundAt < sound.gapMs) {
    return undefined
  }
  /** The three events, most urgent first. */
  const events = [
    ['waiting', alerts.questions],
    ['approval', alerts.approvals],
    ['done', alerts.completed],
  ]
  for (const [channel, list] of events) {
    const chosen = sound.channels[channel]
    if (list.length > 0 && chosen !== undefined) return { channel, ...chosen }
  }
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
 * buttons exist partly to be the gesture that unlocks this for the session.
 *
 * @param options - `{ AudioContextClass }`, injectable so the tests can drive a fake.
 * @returns the player: `{ play, resume, dispose }`.
 */
function createChime(options) {
  const { AudioContextClass } = options
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
     * @param channel - the resolved channel: `{ notes, gain, tone }`, exactly the
     *   object the row prints and the engine plays, so what is heard cannot drift
     *   from what the document says.
     * @returns whether a sound was actually scheduled.
     */
    play(channel) {
      const audio = ensure()
      if (audio === undefined) return false
      player.resume()
      if (audio.state === 'suspended') return false
      const notes = chimeNotes(channel?.notes ?? [])
      const level = typeof channel?.gain === 'number' ? channel.gain : DEFAULT_VOLUME
      // The reader accepted the waveform, so this only guards a caller that did not
      // read a document at all — a test, or a future host. An unknown waveform is
      // the shipped one rather than a thrown `TypeError` inside an audio callback.
      const wave = CHIME_TONES.includes(channel?.tone) ? channel.tone : DEFAULT_TONE
      const startedAt = audio.currentTime
      for (const note of notes) {
        const begin = startedAt + note.startMs / 1000
        const end = begin + note.durationMs / 1000
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        oscillator.type = wave
        oscillator.frequency.setValueAtTime(note.frequency, begin)
        // A bare gate on a tone clicks; a short attack and a longer release is what
        // makes it read as a chime rather than as a pop — on any waveform, which is
        // why the envelope stays the plugin's even now that the waveform is not.
        envelope.gain.setValueAtTime(0, begin)
        envelope.gain.linearRampToValueAtTime(level, begin + 0.012)
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
 * There is exactly one, and that is the design rather than an accident of it: the
 * document says how each state looks and sounds, and a document plus a row of
 * switches over the same facts is two places to look for one answer. The switches
 * this row used to carry are now lines — `icon on`, `sound background`,
 * `keep-done 60s`, `chime off` — which means every knob still exists and every one
 * of them is visible next to the thing it affects.
 *
 * The id is also the host schema's field name, and the two halves of the bundle are
 * separate graphs that cannot share a module — so the roster is duplicated by hand
 * in `lib/index.js` and `scripts/verify-client.mjs` compares the two copies, which
 * turns a silent drift into a failing check.
 */
const SETTINGS = [
  { id: 'style', kind: 'text', default: DEFAULT_STYLE, labelKey: 'alert.setting.style', hintKey: 'alert.setting.styleHint' },
]

/** The whole-section defaults, as the host schema resolves an empty document. */
const SETTING_DEFAULTS = Object.fromEntries(SETTINGS.map((field) => [field.id, field.default]))

/**
 * Coerce one stored value to the shape the engine reads.
 *
 * The settings document is user-editable YAML and the wire carries whatever it
 * holds, so the coercions here are about surviving a hand-edit rather than about
 * validating the document: the document has its own reader, with diagnostics, and
 * this must not be a second opinion about it. A field that says nothing is left out
 * so the default stands.
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
  return Number.isFinite(numeric) ? numeric : undefined
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
  'alert.setting.style': '状态样式与声音',
  'alert.setting.styleHint':
    '四个状态各写一段，样子和声音都在里面。写错的那一行会被指出来并退回默认值，不会让图标消失。',
  'alert.style.help': '文档语法',
  'alert.style.document': '文档结构',
  'alert.style.documentLine1': '文档级设置写在最前面，一行一条：icon on',
  'alert.style.documentLine2': '每个状态一段：状态名 + {，属性一行一条，最后用单独一行 } 收尾',
  'alert.style.documentLine3': '// 后面是注释；没写的属性沿用该状态的默认值',
  'alert.style.globals': '文档级设置',
  'alert.style.globalsLine':
    'icon、title 写 on 或 off；sound 写 off、background（默认：只在本页不在前台时响）或 always；chime-gap 是两次提示音的最小间隔；keep-done 是「刚刚完成」保留多久；volume 是默认音量、tone 是默认音色 —— 没在自己块里写这两项的状态就用它们。',
  'alert.style.state': '状态属性',
  'alert.style.stateLine':
    'shape、color、motion、speed、chime、tone、volume。时长写单位（1.5s、300ms、2m），省略即秒。',
  'alert.style.shapes': '形状 shape',
  'alert.style.motions': '动效 motion',
  'alert.style.colors': '颜色 color（预设）',
  'alert.style.colorsLine': '只接受预设名，不接受任意色值：本插件出过的两次事故都是对比度问题（白鱼画在白底上），预设色不会犯这个错。',
  'alert.style.chime': '声音 chime',
  'alert.style.chimeLine':
    '写音名序列（A5 E6）或频率（880 1318.5），按顺序播放；每个音可以在冒号后写自己的时值 —— A5:200ms 表示这个音响 200ms、下一个音紧接着起音 —— 冒号前写 - 就是休止（-:200ms）。off 表示这个状态不出声。同一个块里的 volume 是这个状态自己的音量（0–1）、tone 是它自己的音色（sine、triangle、square、sawtooth），各自覆盖顶层那一行；卡片上印的就是这两个里生效的那一个，两边都没写才用出厂值并标「（默认）」。',
  'alert.primitive.shape.circle': '圆形',
  'alert.primitive.shape.rounded': '圆角矩形，鱼是横宽的，圆角矩形给它更好的留白',
  'alert.primitive.shape.square': '小圆角方形',
  'alert.primitive.shape.none': '不画背景板。注意：鱼是「镂空」出来的，没有背景板就没有东西可镂 —— 结果是整个图标全透明（只剩角标）。想「只要鱼」请用圆角矩形或圆形',
  'alert.primitive.motion.still': '不动',
  'alert.primitive.motion.turn': '鱼旋转，速度=转一圈的秒数',
  'alert.primitive.motion.blink': '整体明暗呼吸，速度=一次呼吸的秒数',
  'alert.primitive.motion.pulse': '背景色往复变化，速度=一个来回的秒数',
  'alert.preview': '状态预览',
  'alert.preview.hint':
    '32 像素，和标签页里一样大；动效按文档实时播放。点「预览」让标签页本身显示这个状态（图标和标题都换过去），再点一次或离开本页就恢复。',
  'alert.preview.audition': '试听',
  'alert.preview.silent': '不出声',
  'alert.preview.gain': '音量',
  'alert.preview.tone': '音色',
  'alert.preview.fallback': '（默认）',
  'alert.preview.pin': '预览',
  'alert.preview.pinHint': '让浏览器标签页显示这个状态，改配置时可以照着标签看',
  'alert.preview.pinned': '预览中',
  'alert.preview.pinnedHint': '标签页正在显示这个状态；再点一次恢复真实状态',
  'alert.problems': '下面这些行没有生效：',
  'alert.problemsMore': '处没有列出',
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
  'alert.setting.style': 'State styles and sounds',
  'alert.setting.styleHint':
    'One block per state, each line one named property. A line the reader cannot use is reported and falls back to the default rather than leaving the tab without an icon.',
  'alert.style.help': 'Document syntax',
  'alert.style.document': 'How the document is shaped',
  'alert.style.documentLine1': 'document settings come first, one per line: icon on',
  'alert.style.documentLine2': 'then one block per state: the state name and {, one property per line, closed by a line with }',
  'alert.style.documentLine3': '// starts a comment; a property a block omits keeps that state\u2019s default',
  'alert.style.globals': 'Document settings',
  'alert.style.globalsLine':
    'icon and title take on or off; sound takes off, background (the default: only while this page is not in front) or always; chime-gap is the least time between two chimes; keep-done is how long "just finished" stays lit; volume is the default loudness and tone the default waveform, used by every chimed state whose own block does not name one.',
  'alert.style.state': 'State properties',
  'alert.style.stateLine':
    'shape, color, motion, speed, chime, tone, volume. Durations take a unit (1.5s, 300ms, 2m); a bare number is seconds.',
  'alert.style.shapes': 'shape',
  'alert.style.motions': 'motion',
  'alert.style.colors': 'colour (presets)',
  'alert.style.colorsLine': 'Preset names only, never a free colour: both failures this plugin has shipped were contrast failures, and a preset cannot be illegible.',
  'alert.style.chime': 'chime',
  'alert.style.chimeLine':
    'Note names (A5 E6) or frequencies (880 1318.5), played in order. A note may name its own length after a colon — A5:200ms rings 200ms and the next item starts when it ends — and a leading - is a rest, as in -:200ms. off keeps this state silent. A block\u2019s volume is that state\u2019s own loudness, 0 to 1, and its tone is its own waveform (sine, triangle, square, sawtooth); each overrides the document\u2019s, and the card prints whichever of the two is in force, marking it as the default only when neither is written.',
  'alert.primitive.shape.circle': 'a circle',
  'alert.primitive.shape.rounded': 'a rounded square — the fish is wider than it is tall, and this gives it room',
  'alert.primitive.shape.square': 'a slightly rounded square',
  'alert.primitive.shape.none': 'no background plate. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is entirely transparent (only the badge survives). For just-the-fish, use rounded or circle',
  'alert.primitive.motion.still': 'still',
  'alert.primitive.motion.turn': 'the fish turns; speed is seconds per revolution',
  'alert.primitive.motion.blink': 'the whole icon dims and returns; speed is seconds per breath',
  'alert.primitive.motion.pulse': 'the background colour alternates; speed is seconds per cycle',
  'alert.preview': 'State previews',
  'alert.preview.hint':
    '32 pixels, the size the tab draws; the motion runs as the document describes it. Press "Preview" to put that state in the tab itself — icon and title — and press it again, or leave this page, to go back to the live state.',
  'alert.preview.audition': 'Play',
  'alert.preview.silent': 'silent',
  'alert.preview.gain': 'volume',
  'alert.preview.tone': 'tone',
  'alert.preview.fallback': '(default)',
  'alert.preview.pin': 'In tab',
  'alert.preview.pinHint': 'Show this state in the browser tab, so an edit can be judged in the tab strip itself',
  'alert.preview.pinned': 'Showing',
  'alert.preview.pinnedHint': 'The tab is showing this state; press again to go back to the live one',
  'alert.problems': 'These lines do nothing yet:',
  'alert.problemsMore': 'more not listed',
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
  '.dsh-sentry-item{align-items:flex-start;justify-content:space-between;gap:16px;display:flex}',
  '.dsh-sentry-itemText{flex-direction:column;gap:4px;min-width:0;display:flex}',
  '.dsh-sentry-itemLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-itemHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-sentry-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-style{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-editor{display:block}',
  // The editor's own stylesheet is injected by the library; these bind its appearance to the
  // interface's design tokens, so the box matches every other field and follows the theme
  // switch rather than the operating system's colour scheme.
  '.dsh-sentry-editor .litearea-box{border-width:.5px}',
  // Scopes the library's palette has no entry for. They are the ones this language added
  // when it stopped writing values positionally: a mode word (`on`, `background`), a note,
  // and a brace. Bound to the library's own variables rather than to fixed colours, so the
  // box follows the interface's theme the way every other token in it does.
  '.dsh-sentry-editor .litearea-scope-value-mode{color:var(--litearea-scope-value-shape)}',
  '.dsh-sentry-editor .litearea-scope-value-note{color:var(--litearea-scope-value-number)}',
  '.dsh-sentry-editor .litearea-scope-punctuation{color:var(--litearea-fg-dim)}',
  '.dsh-sentry-help{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-help>summary{cursor:pointer;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:18px}',
  '.dsh-sentry-helpSection{margin-top:8px}',
  '.dsh-sentry-helpTitle{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.dsh-sentry-helpLine{font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:pre-wrap}',
  // The problems the reader found, listed under the editor. The editor underlines the same
  // spans as you type; this is the version that survives a document pasted into
  // `settings.yaml` and read on a screen the editor was never opened on.
  '.dsh-sentry-problems{flex-direction:column;gap:2px;display:flex}',
  '.dsh-sentry-problemHead{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
  '.dsh-sentry-problem{display:flex;gap:6px;color:var(--dsw-alias-state-warn-primary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px}',
  '.dsh-sentry-problemLine{flex:none;min-width:16px;color:var(--dsw-alias-label-tertiary);text-align:right;font-variant-numeric:tabular-nums}',
  // The previews: the state as the tab would draw it, at the size the tab draws it.
  '.dsh-sentry-previews{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-previewsHead{flex-direction:column;gap:2px;display:flex}',
  '.dsh-sentry-previewsTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-previewsHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-previewGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px}',
  '.dsh-sentry-preview{align-items:center;flex-direction:column;gap:6px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-module-platform);padding:10px 8px;display:flex}',
  // The card whose state the tab is currently showing. It has to be obvious: a tab
  // wearing a state nobody asked for any more is the one thing this plugin must not do.
  '.dsh-sentry-preview[data-pinned="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-previewIcon{width:32px;height:32px;display:block}',
  '.dsh-sentry-previewName{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;text-align:center}',
  '.dsh-sentry-previewSound{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:10px;line-height:14px;text-align:center}',
  '.dsh-sentry-previewActions{align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;display:flex}',
  '.dsh-sentry-audition,.dsh-sentry-pin{border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:11px;line-height:16px}',
  '.dsh-sentry-audition:hover,.dsh-sentry-pin:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-pin[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
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
 * How many of the reader's problems the row lists before it counts the rest.
 *
 * A pasted document can be wrong on every line, and the list exists to point at the
 * mistakes worth fixing rather than to reproduce the document. The editor underlines
 * all of them either way.
 */
const PROBLEM_ROWS = 6

/**
 * The style document, the reference needed to write one, the problems found in it,
 * and the editor over it.
 *
 * A `<details>` block rather than a form, and a real editor rather than a text area. The
 * point of the document is that the appearance and the sound of four states are
 * written the same way and read in one place; expressing that as controls would take
 * a dozen of them and still not say what one block says. So the help text is not
 * decoration — it *is* the interface, and it lists the vocabulary the reader accepts.
 *
 * The problems are printed as well as underlined: the editor's squiggles are the
 * version that helps while typing, and this list is the version that survives a
 * document pasted into `settings.yaml` and looked at without opening the editor.
 *
 * The textarea this replaces was controlled: every keystroke round-tripped through the
 * store and the value was written back, which is what destroyed the browser's undo stack
 * and reset the caret. The editor owns the text instead, and reports what the user typed.
 *
 * @param props - _react props.
 * @returns the item element.
 */
function SettingText({ label, hint, value, help, problems = [], onChange }) {
  const hostRef = _react.useRef(null)
  const editorRef = _react.useRef(undefined)
  // The newest props, so the editor's own callbacks are never a render behind.
  const latest = _react.useRef({ onChange })
  latest.current = { onChange }
  /**
   * The text the host was last told about.
   *
   * The field is the only thing that knows what the user sees, and an accepted
   * completion moves it without announcing the move: the editor suppresses the
   * change notification while it applies its own edit — the rule that keeps a host
   * from being handed its own `setValue` back — so `always` completed from `alw`
   * never reaches the store, and reopening the settings reads `alw` back. Holding
   * the last text the host heard is what lets the field be reconciled with it.
   */
  const reported = _react.useRef(value)
  // A pasted document can be wrong on every line, and a hundred rows of complaint
  // would push the rest of the settings page off the screen. The first few name the
  // mistakes worth fixing; the count says how many are behind them.
  const listed = problems.slice(0, PROBLEM_ROWS)
  const rest = problems.length - listed.length

  _react.useEffect(() => {
    const host = hostRef.current
    if (host === null || host === undefined) return undefined
    const editor = _citisen_litearea.createEditor(host, {
      // The vocabularies come from this plugin's own constants, so the editor cannot
      // offer a shape, a motion, or a property the reader would then reject. The
      // document's own options object is handed over whole for the same reason: one
      // table that both halves read is one table that cannot disagree with itself.
      grammar: dshSentryStyleGrammar({
        states: STYLE_STATES,
        keys: STYLE_DOCUMENT_OPTIONS.keys,
        spec: STYLE_SPEC,
        shapes: SHAPES,
        motions: MOTIONS,
        colors: PRESET_COLORS,
        modes: MODES,
        notes: STYLE_NOTE_SUGGESTIONS,
        defaults: DEFAULT_LOOK,
      }),
      value: latest.current.value,
      ariaLabel: label,
      // The box grows with the document rather than scrolling inside it. The cap this
      // replaces — two dozen rows — was smaller than the shipped document, so the
      // editor grew a scrollbar of its own inside a page that already scrolls: two
      // scrollbars for one document, and the one the user is trying to reach is the
      // page's. The bound that is left is a sanity limit for a pasted document
      // hundreds of lines long, not a display decision.
      sizing: { minRows: 12, maxRows: 200 },
      variables: EDITOR_VARIABLES,
      // A space does not open the list. It separates the tokens of this document,
      // which is the argument for opening one there and the reason it is off: the
      // list is already open while the next token is typed, so all a space would
      // add is a panel over the settings every time the user moves on. Stated
      // rather than inherited, because this plugin compiles in a pinned copy of
      // the editor: what the library defaults to on the day it is built is not a
      // promise about the day after.
      completion: { triggerCharacters: '' },
      onChange: (next) => {
        reported.current = next
        latest.current.onChange(next)
      },
    })
    editorRef.current = editor

    /**
     * Hand the host whatever the field holds, if the field moved without saying so.
     *
     * Called when the field loses focus and once more on the way out, which is the
     * moment a settings dialog is closed and its last edit would otherwise be lost.
     * The pinned editor announces an accepted completion as of 0.2.2; this
     * reconciles either way, and it covers every other silent write as well — a
     * paste, an undo, a selection replaced by a completion accepted with the mouse.
     */
    const commit = () => {
      if (editor.value === reported.current) return
      reported.current = editor.value
      latest.current.onChange(editor.value)
    }
    host.addEventListener('focusout', commit)

    return () => {
      host.removeEventListener('focusout', commit)
      commit()
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
    reported.current = value
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
    problems.length === 0
      ? null
      : _react.createElement(
          'div',
          { className: 'dsh-sentry-problems' },
          _react.createElement('div', { className: 'dsh-sentry-problemHead' }, help.problems),
          ...listed.map((problem, index) =>
            _react.createElement(
              'div',
              { className: 'dsh-sentry-problem', key: `p${String(index)}` },
              _react.createElement(
                'span',
                { className: 'dsh-sentry-problemLine' },
                String(problem.line + 1),
              ),
              _react.createElement('span', null, problem.message),
            ),
          ),
          rest === 0
            ? null
            : _react.createElement(
                'div',
                { className: 'dsh-sentry-problemHead' },
                `…${String(rest)} ${help.problemsMore}`,
              ),
        ),
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
 * Built from `SHAPES`, `MOTIONS`, `PRESET_COLORS`, and the key lists rather than
 * written out by hand, so the reference cannot drift from what the reader accepts —
 * the failure mode a hand-written reference always has. What is written by hand is
 * the prose, which is the part a translator has to see.
 *
 * @param t - the translator.
 * @returns `{ summary, problems, sections }`.
 */
function styleHelp(t) {
  /** @param name - a primitive name. @returns its documented line. */
  const describe = (name) => t(`alert.primitive.${name}`)
  return {
    summary: t('alert.style.help'),
    problems: t('alert.problems'),
    problemsMore: t('alert.problemsMore'),
    sections: [
      {
        title: t('alert.style.document'),
        lines: [
          t('alert.style.documentLine1'),
          t('alert.style.documentLine2'),
          t('alert.style.documentLine3'),
        ],
      },
      {
        title: `${t('alert.style.globals')}: ${STYLE_GLOBAL_KEYS.join(' | ')}`,
        lines: [t('alert.style.globalsLine')],
      },
      {
        title: `${t('alert.style.state')}: ${STYLE_STATE_KEYS.join(' | ')}`,
        lines: [t('alert.style.stateLine')],
      },
      {
        title: `${t('alert.style.shapes')}: ${SHAPES.join(' | ')}`,
        lines: SHAPES.map((name) => `${name} — ${describe(`shape.${name}`)}`),
      },
      {
        title: `${t('alert.style.motions')}: ${MOTIONS.join(' | ')}`,
        lines: MOTIONS.map((name) => `${name} — ${describe(`motion.${name}`)}`),
      },
      {
        title: `${t('alert.style.colors')}: ${Object.keys(PRESET_COLORS).join(' | ')}`,
        lines: [t('alert.style.colorsLine')],
      },
      { title: t('alert.style.chime'), lines: [t('alert.style.chimeLine')] },
    ],
  }
}

/**
 * A one-session plan for the settings row's preview of one state.
 *
 * The row draws the icon through the same builder the tab does, so this is the only
 * thing standing between the preview and a lie: a plan whose dominant state is the
 * one being previewed, with its count set so the waiting badge is part of the
 * picture the user is judging.
 *
 * @param state - the state to show.
 * @returns a plan holding that state, and only that state.
 */
function previewPlan(state) {
  const counts = { waiting: 0, approval: 0, running: 0, done: 0 }
  counts[state] = 1
  return {
    bySession: new Map([['preview', { state, fresh: state === 'done' }]]),
    active: ['preview'],
    finished: state === 'done' ? ['preview'] : [],
    ...counts,
  }
}

/**
 * A repaint counter for the previews, or a constant zero when nothing moves.
 *
 * One timer for the whole strip rather than one per card, and none at all when every
 * state is still: a settings page is not the place to hold four intervals open for a
 * document that says `motion still`.
 *
 * @param animate - whether anything in the document moves.
 * @returns the current tick.
 */
function useTick(animate) {
  const [tick, setTick] = _react.useState(0)
  _react.useEffect(() => {
    if (!animate) return undefined
    const timer = setInterval(() => {
      setTick((value) => value + 1)
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [animate])
  return tick
}

/**
 * The four states as the tab would draw them, with the sound each one makes.
 *
 * This is the answer to "I cannot see what I just configured", in two sizes. The card
 * itself is the icon built by the same function the favicon uses, at the same 32
 * pixels, driven by the same motion function. The **preview** button is the other
 * half, and the one a 32-pixel card cannot replace: it makes the *real tab* show that
 * state — through the same render pass, so what the tab does with it is what the card
 * shows — which is the only way to judge the change to a state that no session
 * happens to be in at the moment. The chime buttons are also the gesture that unlocks
 * audio for the session, which is why there is no separate "unlock audio" control.
 *
 * The preview is released the moment it would become a lie: the page stops being
 * visible, the settings page goes away, or the same card is clicked again. A tab that
 * kept wearing a state nobody is looking at would be the one thing this plugin must
 * never be.
 *
 * @param props - _react props.
 * @returns the strip element.
 */
function StatePreviews({ t, doc, audition, preview }) {
  const animate = STYLE_STATES.some((state) => doc.look[state].motion !== 'still')
  const tick = useTick(animate)
  const [pinned, setPinned] = _react.useState(undefined)
  // The newest action, so a release triggered from an event or an unmount is never a
  // render behind — those are exactly the calls that happen outside a render.
  const latest = _react.useRef({ preview })
  latest.current = { preview }

  // Leaving the settings page ends the preview. _react runs this on unmount, which is
  // when the slot's component goes away.
  _react.useEffect(() => () => latest.current.preview(undefined), [])

  // And so does the page going out of sight. This is the important one: a preview
  // exists to be looked at, and once the user is on another tab the icon is the only
  // thing this plugin has to tell them the truth with.
  _react.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden !== true) return
      setPinned(undefined)
      latest.current.preview(undefined)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /**
   * Show this state in the tab, or stop showing it.
   * @param state - the state whose card was clicked.
   * @returns {void}
   */
  const toggle = (state) => {
    const next = pinned === state ? undefined : state
    setPinned(next)
    latest.current.preview(next)
  }

  return _react.createElement(
    'div',
    { className: 'dsh-sentry-previews' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-previewsHead' },
      _react.createElement('div', { className: 'dsh-sentry-previewsTitle' }, t('alert.preview')),
      _react.createElement('div', { className: 'dsh-sentry-previewsHint' }, t('alert.preview.hint')),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-previewGrid' },
      ...STYLE_STATES.map((state) => {
        const look = doc.look[state]
        const svg = sentryFavicon(previewPlan(state), {
          reducedMotion: false,
          style: doc.look,
          motion: motionTick(look, tick),
        })
        const channel = doc.sound.channels[state]
        // Both figures on this line are lines of the document — the state's own
        // `volume` and `tone`, or the document's — or the shipped one with a word
        // saying that nothing said. What they never are is a product of two settings:
        // a card that showed one printed a figure its reader could not find anywhere.
        const sound =
          channel === undefined
            ? t('alert.preview.silent')
            : `${channel.labels.join(' → ')} · ${t('alert.preview.gain')} ${String(Math.round(channel.gain * 100))}%${channel.unstated ? ` ${t('alert.preview.fallback')}` : ''} · ${t('alert.preview.tone')} ${channel.tone}${channel.toneUnstated ? ` ${t('alert.preview.fallback')}` : ''}`
        const shown = pinned === state
        return _react.createElement(
          'div',
          { className: 'dsh-sentry-preview', key: state, 'data-pinned': shown },
          _react.createElement('img', {
            className: 'dsh-sentry-previewIcon',
            src: svg === undefined ? undefined : faviconHref(svg),
            alt: t(`alert.status.${state}`),
            width: 32,
            height: 32,
          }),
          _react.createElement('div', { className: 'dsh-sentry-previewName' }, t(`alert.status.${state}`)),
          _react.createElement('div', { className: 'dsh-sentry-previewSound' }, sound),
          _react.createElement(
            'div',
            { className: 'dsh-sentry-previewActions' },
            channel === undefined
              ? null
              : _react.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-sentry-audition',
                    onClick: () => {
                      audition(channel)
                    },
                  },
                  t('alert.preview.audition'),
                ),
            _react.createElement(
              'button',
              {
                type: 'button',
                className: 'dsh-sentry-pin',
                'aria-pressed': shown,
                title: shown ? t('alert.preview.pinnedHint') : t('alert.preview.pinHint'),
                onClick: () => {
                  toggle(state)
                },
              },
              shown ? t('alert.preview.pinned') : t('alert.preview.pin'),
            ),
          ),
        )
      }),
    ),
  )
}

/**
 * The General-settings row: the document, every state as it will look and sound, and
 * a reset.
 *
 * No switches, and that is the shape of the change this row went through: every knob
 * the row used to carry is a line of the document now — `icon on`, `sound
 * background`, `keep-done 60s`, `chime off` — so there is one place to look for how
 * the plugin behaves and the previews sit directly under it.
 *
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function AlertRow({ t, useStore, setField, reset, audition, preview }) {
  const state = useStore((snapshot) => snapshot)
  const style = state.style ?? DEFAULT_STYLE
  // Read on every render rather than cached on the settings change: it is a walk over
  // a few dozen lines, and it means the previews below can never show a document other
  // than the one in the editor.
  const doc = resolveStyle(style)
  const field = SETTINGS[0]
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-row' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-head' },
      _react.createElement('div', { className: 'dsh-sentry-title' }, t('alert.title')),
      _react.createElement('div', { className: 'dsh-sentry-desc' }, t('alert.description')),
    ),
    _react.createElement(SettingText, {
      label: t(field.labelKey),
      hint: t(field.hintKey),
      value: style,
      help: styleHelp(t),
      problems: doc.problems,
      onChange: (value) => {
        setField(field.id, value)
      },
    }),
    _react.createElement(StatePreviews, { t, doc, audition, preview }),
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
 * The two settings APIs this build speaks, newest first.
 *
 * Literals rather than imports: a client bundle may not import another bundle's
 * values, and a service name is a fact about the composition, not a dependency of
 * this package.
 *
 * - `configForms` (dsh 0.1.7+): one configuration form per Loader entry, addressed
 *   by the entry id — `alert`, the row this bundle's patch inserts.
 * - `settingsScope` (0.1.5-rc.x): one scope per registered namespace, addressed by
 *   the name the host half registers — the same `alert` string.
 *
 * Both are read and written here, so the style document behaves the same on either
 * line. A composition with neither still runs the sentry on its shipped document,
 * and says why the first time a control is used.
 */
const CONFIG_FORMS_SERVICE = 'configForms'
const SETTINGS_SCOPE_SERVICE = 'settingsScope'

/**
 * The snapshot a scope reports when there is nothing to report.
 *
 * Shape-for-shape the one a bound scope answers with when the Host itself keeps
 * settings process-local — a non-loopback page: no value, nothing writable. The
 * engine and the row already resolve defaults for that state, which is why
 * "settings refused" and "no settings service at all" need no second path.
 */
const EMPTY_SNAPSHOT = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
})

/** Whether the missing-settings report has been made; one page, one report. */
let reportedMissingSettings = false

/** Whether the missing-session-state report has been made; likewise once. */
let reportedMissingSource = false

/**
 * Say, once, why this plugin is running without durable settings.
 *
 * Called from every write that lands on the stand-in scope: that is the moment a
 * user has to be told that the control they just used is not going to be saved.
 * Activation itself stays quiet, because a composition that binds late must not be
 * reported for being slow.
 */
function reportMissingSettings() {
  if (reportedMissingSettings) return
  reportedMissingSettings = true
  console.error(
    `${PLUGIN_ID}: no settings service this build speaks is present ("${CONFIG_FORMS_SERVICE}" on ` +
      `dsh 0.1.7+, "${SETTINGS_SCOPE_SERVICE}" on the 0.1.5-rc.x line), so the alert document ` +
      'cannot be read or saved and the sentry runs on its shipped defaults. Pin dsh to 0.1.5-rc.x ' +
      '(latest/next), or install a newer @citisen/dsh-sentry.',
  )
}

/**
 * The settings section this plugin never got.
 *
 * Reads answer "nothing resolved", so the engine and the row fall back to the
 * defaults they already resolve; every write reports the mismatch instead of
 * failing silently. That is the contract of a bound scope whose Host refuses a
 * write, minus the wire call.
 * @returns an object shaped like a bound settings scope.
 */
function missingSettingsScope() {
  return {
    getSnapshot: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    set: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    unset: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    mutate: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
  }
}

/**
 * Say, once, that this dsh does not offer the session state the sentry watches.
 *
 * A dsh that moved the state — 0.1.7-alpha.1 replaced
 * `uiSession.pendingInteractions` with `uiSession.sessionStatus` — has to leave
 * the tab running on what it can still see rather than failing activation: a
 * failed entry blocks the web boot outright, which is worse than a quieter tab.
 *
 * @param what - the missing surface, named the way a reader would look for it.
 */
function reportMissingSource(what) {
  if (reportedMissingSource) return
  reportedMissingSource = true
  console.error(
    `${PLUGIN_ID}: this dsh does not provide ${what}, so the tab cannot tell when you are needed. ` +
      'dsh 0.1.7-alpha.1 replaced "uiSession.pendingInteractions" with "uiSession.sessionStatus"; ' +
      'this build targets the dsh 0.1.5-rc.x line (latest/next). Pin dsh to 0.1.5-rc.x, or install ' +
      'a newer @citisen/dsh-sentry.',
  )
}

/**
 * Narrow a raw `alert` section to this plugin's own settings.
 *
 * Applied to whatever either API hands over, because only one of them can do it
 * itself: a 0.1.5 scope takes a `decode` at bind time, a 0.1.7 form has no such
 * hook. Decoding here means the engine and the row see one shape whichever line is
 * running — and both call the same `resolveSettings` the row does, so they cannot
 * disagree about a default.
 *
 * @param section - the section as stored, if any.
 * @returns the resolved settings, or undefined when there is no section.
 */
function decodeSentrySection(section) {
  if (section === null || typeof section !== 'object') return undefined
  const raw = section
  return Object.fromEntries(
    SETTINGS.map((field) => [field.id, coerceSetting(field, raw[field.id]) ?? field.default]),
  )
}

/**
 * The value a 0.1.7 configuration form is effectively holding.
 *
 * That line keeps settings in layers: `value` is what the entry is running with
 * (its shipped or bundle-layer config) and `user` is the profile patch the user
 * edits. This returns the user's layer over the running one — the value a built-in
 * row renders.
 *
 * @param snapshot - a form snapshot.
 * @returns the merged section, or whichever layer exists.
 */
function effectiveFormValue(snapshot) {
  const running = snapshot.value
  const user = snapshot.user
  if (user === null || typeof user !== 'object') return running
  if (running === null || typeof running !== 'object') return user
  return { ...running, ...user }
}

/**
 * Present a 0.1.7 configuration form as the scope this plugin reads.
 *
 * A form already answers `getSnapshot`/`subscribe`/`set`/`unset`/`mutate`; the gap
 * is what its snapshot means. It reports `value` and `user` separately, a write
 * lands in `user`, and `value` stays on the shipped document — so reading `value`
 * alone is reading the shipped document, and every edit looks like it was thrown
 * away the moment the settings page is reopened.
 *
 * @param form - the configuration form for this plugin's entry.
 * @returns a scope-shaped object.
 */
function decodedForm(form) {
  return {
    getSnapshot: () => {
      const snapshot = form.getSnapshot()
      return { ...snapshot, value: decodeSentrySection(effectiveFormValue(snapshot)) }
    },
    subscribe: (listener) => form.subscribe(listener),
    set: (field, value) => form.set(field, value),
    unset: (field) => form.unset(field),
    mutate: (operations, revision) => form.mutate(operations, revision),
  }
}

/**
 * The services this plugin waits for.
 *
 * `sessions` and `uiSession` are the two observables the engine reads; both are
 * installed by the Web composition's session controller, so a third-party plugin
 * reaches the same state the built-in sidebar renders from, without borrowing a
 * slot or a hook.
 *
 * Settings are deliberately **not** in this list. A required service that a dsh
 * release stops providing holds the entire plugin in `pending` forever — and an
 * entry that never activates blocks the web boot — which is how 0.1.7-alpha.1
 * turned `settingsScope` into `configForms` and left plugins reported as "waiting
 * for service" instead of a working interface. Both APIs are bound optionally in
 * `apply` instead, so a composition with neither still gets the sentry, the row,
 * and a message when a control is used.
 */
const inject = ['slots', 'locale', 'sessions', 'uiSession']

/**
 * Client plugin body: subscribe to the session state, project it onto the three
 * background-tab channels, and register the Settings row that configures them.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
  installRowStyles(ctx)

  /** The bound `alert` section, or a stand-in until (and unless) dsh provides one. */
  let scope = missingSettingsScope()

  const chime = createChime({
    AudioContextClass:
      typeof window === 'undefined' ? undefined : window.AudioContext ?? window.webkitAudioContext,
  })
  const stampStore = createStampStore(safeStorage())

  /**
   * The icon element the tab is drawn from, and the only element this plugin owns.
   *
   * It is **replaced**, not mutated, whenever the picture changes. A browser's tab strip
   * follows the document's set of icon links: a link whose `href` changed in place is not
   * reliably a change, which is exactly how a configuration edit came to leave the tab
   * showing the previous icon until something else moved the plan. Mounting a fresh
   * element and taking the old one out in the same step is what the tab strip does react
   * to, and it is also the only way an animated motion can be visible at all — every tick
   * is a different picture, so every tick is a different link.
   *
   * The app's own link is never touched: this element is ours from creation to removal.
   */
  let icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.setAttribute(ICON_ATTRIBUTE, '')
  /** The `href` the mounted element carries, so a redraw that changes nothing is free. */
  let iconHref

  /**
   * Give the tab a new icon, or take ours away.
   *
   * The old element goes before the new one arrives, so the head never holds two icons
   * of ours — with two, which one the tab shows would depend on mount order.
   * @param svg - the SVG source, or undefined when there is nothing to say.
   * @returns {void}
   */
  const setIcon = (svg) => {
    const mounted = icon.parentNode !== null && icon.parentNode !== undefined
    if (svg === undefined) {
      if (mounted) icon.remove()
      iconHref = undefined
      return
    }
    const href = faviconHref(svg)
    if (mounted && iconHref === href) return
    const next = document.createElement('link')
    next.rel = 'icon'
    next.type = 'image/svg+xml'
    next.setAttribute(ICON_ATTRIBUTE, '')
    next.href = href
    if (mounted) icon.remove()
    document.head.appendChild(next)
    icon = next
    iconHref = href
  }

  const state = {
    settings: { ...SETTING_DEFAULTS },
    // The document, resolved. Rebuilt on every render from `settings.style`, so the
    // three channels below read one object instead of three parses of one text.
    doc: resolveStyle(SETTING_DEFAULTS.style),
    plan: EMPTY_PLAN,
    // The plan the two visual channels are drawn from: the live one, or the single
    // state the settings row asked to see. Kept apart from `plan` because the alert
    // diff below must always be a diff of live state — a preview is a picture, never
    // an event.
    shown: EMPTY_PLAN,
    preview: undefined,
    // Set once the framework tears the plugin down, so a late render — the settings row
    // releasing a preview as it unmounts, or a subscription that fires while the
    // disposers run — cannot mount an icon nobody owns any more.
    disposed: false,
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
   *
   * @param plan - the plan the tab is showing, which is the live one unless the
   *   settings row asked to preview a single state.
   */
  const desiredTitle = (plan) => {
    const raw = document.title
    const off = state.doc.globals.title === false
    // Everything this plugin wrote sits behind the marker, so the app's own title
    // underneath comes off by removing the marker and the prefix — no guessing: a
    // title the app rewrites arrives without the marker and is used as-is.
    if (!raw.endsWith(TITLE_MARK)) {
      const plain = off ? raw : titleWithStatus(raw, plan, t)
      return plain === raw ? raw : `${plain}${TITLE_MARK}`
    }

    // A title this plugin wrote. Stripping runs even when the channel is *off*,
    // because stopping writing instead would leave the prefix in the tab forever,
    // which reads as a switch that does not work.
    const bare = raw.slice(0, -TITLE_MARK.length)
    const current = bare.replace(TITLE_PREFIX, '')
    const next = off ? current : titleWithStatus(current, plan, t)
    // Nothing left to say: return the plain app title, dropping the marker with
    // the prefix. This is the branch that takes the status off when the last
    // session goes quiet or the channel is switched off — the *stripped* text, not
    // the text as it stands, because the prefix has to go with the marker.
    return next === current ? current : `${next}${TITLE_MARK}`
  }

  /**
   * The title: this plugin's prefix in front of whatever the app wrote.
   * @param plan - the plan the tab is showing.
   */
  const applyTitle = (plan) => {
    const next = desiredTitle(plan)
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
   *
   * Two shapes are read, newest first: 0.1.7's combined `uiSession.sessionStatus`,
   * whose values carry `pendingInteraction`, and the `uiSession.pendingInteractions`
   * map it replaced. Both project to the `SessionId -> interaction` shape the
   * planner reads.
   *
   * @returns the snapshot, or an empty map.
   */
  const pending = () => {
    const direct = ctx.uiSession?.pendingInteractions?.getSnapshot?.()
    if (direct !== undefined) return direct
    const status = ctx.uiSession?.sessionStatus?.getSnapshot?.()
    if (status === undefined) return new Map()
    const projected = new Map()
    for (const [id, value] of status) {
      if (value?.pendingInteraction !== undefined) projected.set(id, value.pendingInteraction)
    }
    return projected
  }

  /**
   * The source that changes when an interaction starts or ends, in whichever shape
   * this dsh provides it: the whole status source on 0.1.7, the dedicated pending
   * map before that.
   *
   * Reading the dedicated member unguarded is what made this plugin *fail*
   * activation on 0.1.7, and a failed entry blocks the web boot — so an absent
   * source is reported and skipped rather than reached for.
   *
   * @returns a subscribable source, or undefined when neither exists.
   */
  const pendingSource = () => {
    const direct = ctx.uiSession?.pendingInteractions
    if (typeof direct?.subscribe === 'function') return direct
    const status = ctx.uiSession?.sessionStatus
    if (typeof status?.subscribe === 'function') return status
    return undefined
  }

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
   * The appearance comes from `state.doc`, which the render pass rebuilt from the
   * settings — so a document edited in `settings.yaml` and reloaded, or typed into
   * the row, reaches the tab through the same path and cannot go stale.
   *
   * The motion override comes from the tick, which is what makes a driven motion
   * work: `blink` dims, `pulse` alternates the colour, `turn` steps the angle, and
   * every one of them is just an argument to this same draw.
   *
   * @param plan - the plan the tab is showing.
   */
  const applyIcon = (plan) => {
    const doc = state.doc
    const chosen = activeLook(plan, doc.look)
    const override = state.tick === 0 ? {} : motionTick(chosen, state.tick)
    setIcon(
      doc.globals.icon === false
        ? undefined
        : sentryFavicon(plan, {
            reducedMotion: prefersReducedMotion(),
            style: doc.look,
            motion: override,
          }),
    )
  }

  /** The chime, gated on visibility, focus and the document's own rules. */
  const applySound = (alerts) => {
    const chosen = soundPlan(alerts, state.doc.sound, {
      now: Date.now(),
      lastSoundAt: state.lastSoundAt,
      hidden: document.hidden === true,
      focused: !state.unfocused && document.hasFocus?.() === true,
    })
    if (chosen === undefined) return
    state.lastSoundAt = Date.now()
    chime.play(chosen)
  }

  /** Recompute everything from the current subscriptions and settings. */
  const render = () => {
    if (state.disposed) return
    const now = Date.now()
    // The document first: the plan's completed window and everything the three
    // channels draw come from it, so nothing below reads a stale parse.
    state.doc = resolveStyle(state.settings.style)
    // The completion edge is noted before the plan is built, so a session that has
    // just stopped running shows its green signal on this very pass.
    const edges = noteRunningEdges(state.running, list(), stampStore.readStamps(), now)
    if (edges.stamps !== state.stamps) stampStore.writeStamps(edges.stamps)
    state.running = edges.running
    state.stamps = edges.stamps

    const live = sessionPlan(list(), pending(), edges.stamps, {
      now,
      doneWindowMs: state.doc.globals.keepDoneMs,
    })
    // The alert diff is against the LIVE plan and never against what is on screen:
    // a preview is a picture of a state, not an event, so it must not eat a chime or
    // make the next real arrival look like it has already been reported.
    const alerts = changeAlerts(state.plan, live)
    state.plan = live
    // What the tab shows is the live plan, unless the settings row asked to see one
    // state — which is the only way to judge a configuration change for a state that
    // no session happens to be in right now.
    state.shown = state.preview === undefined ? live : previewPlan(state.preview)
    applyIcon(state.shown)
    applyTitle(state.shown)
    applySound(alerts)
    applyMotion(state.shown)
  }

  /**
   * Start, keep, or stop the repaint timer a driven motion needs.
   *
   * The timer is owned by the state rather than by the draw, and its interval is
   * the motion's own tick. It is stopped the moment nothing is animating — which
   * matters more than it looks: a background tab's timers are throttled, but an
   * idle tab with no sessions should not be holding one at all.
   *
   * @param plan - the plan the tab is showing.
   */
  const applyMotion = (plan) => {
    const doc = state.doc
    const chosen = activeLook(plan, doc.look)
    const interval =
      doc.globals.icon === false ? undefined : tickInterval(chosen, prefersReducedMotion())
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
      // The plan the render pass chose, so a preview keeps its own motion while the
      // sessions underneath carry on being watched by `state.plan`.
      applyIcon(state.shown)
    }, wanted)
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  //
  // Every subscription is registered through `ctx.effect`, so teardown is the
  // framework's business rather than a list of disposers this file has to keep in
  // step with its own install order.

  const sessionList = ctx.sessions?.list
  if (typeof sessionList?.subscribe === 'function') {
    ctx.effect(() => sessionList.subscribe(render), 'dsh-sentry: session list subscription')
  } else {
    reportMissingSource('the session list')
  }

  const interactions = pendingSource()
  if (interactions !== undefined) {
    ctx.effect(
      () => interactions.subscribe(render),
      'dsh-sentry: pending interaction subscription',
    )
  } else {
    reportMissingSource('the pending-interaction source')
  }

  // Focus, blur, and visibility all change whether a sound is allowed, and coming
  // back to the foreground also has to redraw: a session that finished while the
  // user was away has already been reported by the icon they are now looking at.
  //
  // Visibility also ends a preview, and that rule belongs here rather than only in the
  // row: the row can be unmounted or re-rendered out of step, but the engine is the
  // thing that must never let the tab claim a state nobody asked for any more. There
  // is no preview to see once the page is out of sight — the tab strip is precisely
  // what this plugin exists to make honest.
  ctx.effect(() => {
    const onFocus = () => {
      state.unfocused = false
      render()
    }
    const onBlur = () => {
      state.unfocused = true
    }
    const onVisibility = () => {
      if (document.hidden === true) state.preview = undefined
      render()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
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
      applyTitle(state.shown)
    })
    observer.observe(target, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-sentry: title observer')

  ctx.effect(
    () => () => {
      state.disposed = true
      state.preview = undefined
      if (state.motionTimer !== undefined) clearInterval(state.motionTimer)
      state.motionTimer = undefined
      icon.remove()
      chime.dispose()
    },
    'dsh-sentry: element teardown',
  )

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

  /** Whether a settings answer has painted yet; see the two `adopt` callers. */
  let painted = false

  /** Paint what the live scope holds, or the resolved defaults when it holds nothing. */
  const adopt = () => {
    painted = true
    state.settings = resolveSettings(scope.getSnapshot().value)
    syncRow()
    render()
  }

  // Bind the durable section through whichever settings API this dsh provides,
  // and follow it while it stays: a replacement or an unload puts the sentry back
  // on its defaults. Only the first bind counts, so a composition carrying both
  // services (no released dsh does) cannot double-subscribe.
  let boundSettings = false

  /**
   * Adopt one bound scope and follow it.
   * @param binding - the child context the scope was obtained from.
   * @param bound - the scope to read and write.
   * @returns the disposer the injecting fiber collects.
   */
  const bindSettings = (binding, bound) => {
    if (boundSettings) return undefined
    boundSettings = true
    scope = bound
    binding.effect(() => bound.subscribe(adopt), 'dsh-sentry: settings adoption')
    adopt()
    return () => {
      boundSettings = false
      scope = missingSettingsScope()
      adopt()
    }
  }

  // dsh 0.1.7+: the entry's own configuration form, by Loader entry id.
  ctx.inject([CONFIG_FORMS_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      decodedForm(settingsCtx[CONFIG_FORMS_SERVICE].get(SENTRY_NAMESPACE)),
    ),
  )

  // dsh 0.1.5-rc.x: the registered namespace, decoded by the scope itself.
  ctx.inject([SETTINGS_SCOPE_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      settingsCtx[SETTINGS_SCOPE_SERVICE].bind({
        namespace: SENTRY_NAMESPACE,
        decode: decodeSentrySection,
      }),
    ),
  )

  // Exactly one paint per settings answer: a bind that happened during activation
  // has painted already, and this covers the composition whose service never
  // arrives — the sentry still has to run, on its defaults.
  if (!painted) adopt()

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
            // One state's chime, played on demand by the row's preview cards. The
            // channel — its notes, its lengths, its waveform and its gain — is
            // whatever the row resolved out of the document, so what is heard is what
            // the card printed beside it, and the click is the gesture the autoplay
            // policy waits for, which is why there is no separate "unlock audio"
            // button.
            audition: (channel) => {
              chime.resume()
              chime.play(channel)
            },
            // Show one state in the tab itself, or with no name go back to the live
            // plan. The row owns this: it sets it when a card is clicked and clears it
            // when the card is clicked again, when the page stops being visible, and
            // when the settings page goes away — a preview that outlived the screen
            // that explains it would be the tab lying about the sessions.
            preview: (name) => {
              state.preview = name
              render()
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
		exports.SHAPES = SHAPES;
		exports.MOTIONS = MOTIONS;
		exports.MODES = MODES;
		exports.TICK_MS = TICK_MS;
		exports.CHIME_STAGGER_MS = CHIME_STAGGER_MS;
		exports.CHIME_NOTE_MS = CHIME_NOTE_MS;
		exports.CHIME_TONES = CHIME_TONES;
		exports.DEFAULT_TONE = DEFAULT_TONE;
		exports.motionTick = motionTick;
		exports.tickInterval = tickInterval;
		exports.pulsePartner = pulsePartner;
		exports.activeLook = activeLook;
		exports.FISH_TURN_SCALE = FISH_TURN_SCALE;
		exports.FISH_SWEPT_RADIUS = FISH_SWEPT_RADIUS;
		exports.FISH_ART_EXTENT = FISH_ART_EXTENT;
		exports.FISH_FULL_SCALE = FISH_FULL_SCALE;
		exports.FISH_HALF_EXTENT = FISH_HALF_EXTENT;
		exports.FISH_TURN_RADIUS = FISH_TURN_RADIUS;
		exports.DEFAULT_LOOK = DEFAULT_LOOK;
		exports.DEFAULT_CHIME = DEFAULT_CHIME;
		exports.DEFAULT_GLOBALS = DEFAULT_GLOBALS;
		exports.DEFAULT_VOLUME = DEFAULT_VOLUME;
		exports.PRESET_COLORS = PRESET_COLORS;
		exports.DEFAULT_STYLE = DEFAULT_STYLE;
		exports.STYLE_STATES = STYLE_STATES;
		exports.STYLE_STATE_KEYS = STYLE_STATE_KEYS;
		exports.STYLE_GLOBAL_KEYS = STYLE_GLOBAL_KEYS;
		exports.STYLE_SPEC = STYLE_SPEC;
		exports.CHIME_STATES = CHIME_STATES;
		exports.previewPlan = previewPlan;
		exports.dshSentryStyleGrammar = dshSentryStyleGrammar;
		exports.readStyleDocument = readStyleDocument;
		exports.noteFrequency = noteFrequency;
		exports.parseDuration = parseDuration;
		exports.parseChimeItem = parseChimeItem;
		exports.resolveStyle = resolveStyle;
		exports.resolveGlobals = resolveGlobals;
		exports.resolveSound = resolveSound;
		exports.chimeNotes = chimeNotes;
		exports.FISH_PATH = FISH_PATH;
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
		exports.StatePreviews = StatePreviews;
		exports.SettingText = SettingText;
		return module.exports;
	}
});
