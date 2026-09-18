/**
 * 依赖图：令牌解析、循环检测、来源链与诊断。
 *
 * 所有组件颜色都必须经由 resolveAll 从令牌图解析而来，
 * 任何绕过这张图的散落 CSS 颜色都会被 tests/preview-css 守护测试拦下。
 */

import { darkenHex, lightenHex, mixHex, normalizeHex } from './color';
import { directDeps, type ThemeDocument, type ThemeMode, type TokenValue } from './types';

export type ResolveErrorKind = 'missing' | 'cycle';

export interface ResolveError {
  kind: ResolveErrorKind;
  detail: string;
}

export interface Resolution {
  /** token → 解析后的 #rrggbb */
  colors: Map<string, string>;
  /** token → 解析错误（缺失引用 / 循环依赖） */
  errors: Map<string, ResolveError>;
}

/** 取令牌在某个主题下的定义值（深色未覆盖时回落到浅色定义） */
export function valueFor(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): TokenValue | undefined {
  const baseValue =
    theme === 'dark'
      ? (doc.dark.base[token] ?? doc.base[token])
      : doc.base[token];
  if (baseValue !== undefined) return { kind: 'color', value: baseValue };
  return theme === 'dark'
    ? (doc.dark.semantic[token] ?? doc.semantic[token])
    : doc.semantic[token];
}

/** 文档中出现过的全部令牌名（含仅在某主题覆盖中定义的） */
export function allTokenNames(doc: ThemeDocument): string[] {
  return [
    ...new Set([
      ...Object.keys(doc.base),
      ...Object.keys(doc.semantic),
      ...Object.keys(doc.dark.base),
      ...Object.keys(doc.dark.semantic),
    ]),
  ];
}

/** 依赖图：token → 它直接引用的令牌名（允许指向不存在的令牌，用于缺失诊断） */
export function buildGraph(doc: ThemeDocument, theme: ThemeMode): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const name of allTokenNames(doc)) {
    const value = valueFor(doc, theme, name);
    graph.set(name, value ? directDeps(value) : []);
  }
  return graph;
}

/** 反向依赖：token → 直接引用它的令牌 */
export function dependentsOf(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): { direct: string[]; transitive: string[] } {
  const graph = buildGraph(doc, theme);
  const reverse = new Map<string, string[]>();
  for (const [name, deps] of graph) {
    for (const dep of deps) {
      const list = reverse.get(dep) ?? [];
      list.push(name);
      reverse.set(dep, list);
    }
  }
  const direct = reverse.get(token) ?? [];
  const seen = new Set<string>([token]);
  const queue = [...direct];
  const transitive: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    transitive.push(current);
    for (const next of reverse.get(current) ?? []) queue.push(next);
  }
  return { direct, transitive };
}

/** 三色 DFS 检测循环依赖，返回如 [['info.bg','info.text','info.bg']] 的环列表 */
export function findCycles(graph: Map<string, string[]>): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const state = new Map<string, number>();
  const cycles: string[][] = [];
  const stack: string[] = [];

  for (const start of graph.keys()) {
    if (state.get(start) !== undefined) continue;
    // 迭代式 DFS，帧 = [节点, 下一个子节点下标]
    const frames: Array<[string, number]> = [[start, 0]];
    state.set(start, GRAY);
    stack.push(start);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const deps = graph.get(frame[0]) ?? [];
      if (frame[1] < deps.length) {
        const dep = deps[frame[1]++];
        if (!graph.has(dep)) continue; // 缺失引用在别处报告
        const depState = state.get(dep) ?? WHITE;
        if (depState === WHITE) {
          state.set(dep, GRAY);
          stack.push(dep);
          frames.push([dep, 0]);
        } else if (depState === GRAY) {
          const idx = stack.indexOf(dep);
          cycles.push([...stack.slice(idx), dep]);
        }
      } else {
        state.set(frame[0], BLACK);
        stack.pop();
        frames.pop();
      }
    }
  }
  return cycles;
}

type R = { ok: true; color: string } | { ok: false; kind: ResolveErrorKind; detail: string };

/** 解析整个文档在某主题下的全部令牌颜色 */
export function resolveAll(doc: ThemeDocument, theme: ThemeMode): Resolution {
  const memo = new Map<string, R>();

  function visit(name: string, path: string[]): R {
    const cached = memo.get(name);
    if (cached) return cached;
    const cycleAt = path.indexOf(name);
    if (cycleAt >= 0) {
      // 不缓存：真正的环成员由外层帧各自标记
      return { ok: false, kind: 'cycle', detail: [...path.slice(cycleAt), name].join(' → ') };
    }
    const value = valueFor(doc, theme, name);
    let result: R;
    if (!value) {
      result = { ok: false, kind: 'missing', detail: name };
    } else if (value.kind === 'color') {
      result = { ok: true, color: normalizeHex(value.value) ?? value.value };
    } else if (value.kind === 'ref') {
      result = visit(value.token, [...path, name]);
    } else {
      const input = visit(value.token, [...path, name]);
      if (!input.ok) {
        result = input;
      } else if (value.op === 'mix') {
        const other = visit(value.other ?? '', [...path, name]);
        result = other.ok
          ? { ok: true, color: mixHex(input.color, other.color, value.amount) }
          : other;
      } else {
        result = {
          ok: true,
          color:
            value.op === 'lighten'
              ? lightenHex(input.color, value.amount)
              : darkenHex(input.color, value.amount),
        };
      }
    }
    memo.set(name, result);
    return result;
  }

  const colors = new Map<string, string>();
  const errors = new Map<string, ResolveError>();
  for (const name of allTokenNames(doc)) {
    const r = visit(name, []);
    if (r.ok) colors.set(name, r.color);
    else errors.set(name, { kind: r.kind, detail: r.detail });
  }
  return { colors, errors };
}

/** 便捷方法：解析单个令牌，失败返回 undefined */
export function resolveColor(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): string | undefined {
  return resolveAll(doc, theme).colors.get(token);
}

/**
 * 来源树：把令牌真实的依赖分支完整展开。
 *
 * 与单链 sourceChain 不同，mix 会展开「主输入 + 混合对象」两支，
 * 共享依赖只在第一次完整展开、之后以 shared 叶子标记；
 * 沿当前展开路径再次遇到同一令牌时标记为循环回边。
 * 任何分支都不会无限递归。
 */
export interface SourceBranch {
  /** 在父令牌中的角色：根 / 主输入 / mix 第二输入 */
  role: 'root' | 'primary' | 'other';
  token: string;
  /** 令牌在当前主题下实际生效的定义（缺失令牌时为占位 ref） */
  value: TokenValue;
  color?: string;
  error?: ResolveError;
  /** 深色主题下该令牌是否有独立深色覆盖；false 表示继承浅色定义 */
  overridden: boolean;
  /** 依赖分支：mix 两支，ref/lighten/darken 一支，字面值为空 */
  children: SourceBranch[];
  /** 已在树的更早处展开过（共享依赖或循环回边），children 不再重复 */
  shared: boolean;
}

/** 该令牌在深色主题下是否有独立覆盖定义 */
export function hasDarkOverride(doc: ThemeDocument, token: string): boolean {
  return doc.dark.base[token] !== undefined || doc.dark.semantic[token] !== undefined;
}

/** 构建来源树：完整展示引用、调亮/调暗与 mix 双输入的真实依赖分支 */
export function sourceTree(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): SourceBranch {
  const resolution = resolveAll(doc, theme);
  /** 已完整展开过的令牌（跨分支共享依赖去重） */
  const expanded = new Set<string>();

  const isOverridden = (name: string) => theme === 'dark' && hasDarkOverride(doc, name);

  function makeBranch(
    name: string,
    role: SourceBranch['role'],
    /** 从根到当前分支父节点的路径，用于识别循环回边 */
    ancestors: Set<string>,
  ): SourceBranch {
    const value = valueFor(doc, theme, name);
    const branch: SourceBranch = {
      role,
      token: name,
      value: value ?? { kind: 'ref', token: '' },
      overridden: isOverridden(name),
      children: [],
      shared: false,
    };
    const err = resolution.errors.get(name);
    if (err) branch.error = err;
    else branch.color = resolution.colors.get(name);

    // 缺失令牌：叶子 + 缺失错误
    if (!value) {
      branch.error = { kind: 'missing', detail: name };
      return branch;
    }
    // 循环回边：沿当前路径回到了链上的令牌
    if (ancestors.has(name)) {
      const path: string[] = [];
      let started = false;
      for (const ancestor of ancestors) {
        if (ancestor === name) started = true;
        if (started) path.push(ancestor);
      }
      branch.error = { kind: 'cycle', detail: [...path, name].join(' → ') };
      branch.shared = true;
      return branch;
    }
    // 共享依赖：别的分支已展开过，只保留可点击的标记节点
    if (expanded.has(name)) {
      branch.shared = true;
      return branch;
    }

    expanded.add(name);

    // 字面值（基础令牌）：登记后作为终点，再次被引用时显示为共享
    if (value.kind === 'color') return branch;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(name);

    const depInputs: Array<[string, SourceBranch['role']]> =
      value.kind === 'ref'
        ? [[value.token, 'primary']]
        : value.op === 'mix'
          ? [
              [value.token, 'primary'],
              [value.other ?? '', 'other'],
            ]
          : [[value.token, 'primary']];
    branch.children = depInputs.map(([dep, depRole]) =>
      makeBranch(dep, depRole, nextAncestors),
    );
    return branch;
  }

  return makeBranch(token, 'root', new Set());
}

/** 来源链：从某令牌沿主输入一路走到基础令牌（或错误），供「查看来源」使用 */
export interface ChainStep {
  token: string;
  value: TokenValue;
  color?: string;
  error?: ResolveError;
}

export function sourceChain(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): ChainStep[] {
  const resolution = resolveAll(doc, theme);
  const steps: ChainStep[] = [];
  const seen = new Set<string>();
  let current: string | undefined = token;
  while (current !== undefined) {
    const value = valueFor(doc, theme, current);
    if (!value) {
      steps.push({
        token: current,
        value: { kind: 'ref', token: '' },
        error: { kind: 'missing', detail: current },
      });
      break;
    }
    const step: ChainStep = { token: current, value };
    const err = resolution.errors.get(current);
    if (err) step.error = err;
    else step.color = resolution.colors.get(current);
    steps.push(step);
    if (value.kind === 'color' || seen.has(current)) break;
    seen.add(current);
    current = value.kind === 'ref' || value.kind === 'transform' ? value.token : undefined;
  }
  return steps;
}

/** 把 token 的值替换为 value 后，是否会形成循环依赖（用于编辑时拒绝） */
export function wouldCreateCycle(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
  value: TokenValue,
): boolean {
  const simulated: ThemeDocument =
    theme === 'dark'
      ? { ...doc, dark: { ...doc.dark, semantic: { ...doc.dark.semantic, [token]: value } } }
      : { ...doc, semantic: { ...doc.semantic, [token]: value } };
  const graph = buildGraph(simulated, theme);
  // 只有 token 的出边变了，任何新产生的环必然经过 token
  const seen = new Set<string>();
  const queue = [...(graph.get(token) ?? [])];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === token) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const dep of graph.get(current) ?? []) queue.push(dep);
  }
  return false;
}

/** 缺失引用：语义令牌直接引用了不存在的令牌 */
export function findMissingRefs(
  doc: ThemeDocument,
  theme: ThemeMode,
): Array<{ token: string; ref: string }> {
  const names = new Set(allTokenNames(doc));
  const missing: Array<{ token: string; ref: string }> = [];
  const semanticEntries =
    theme === 'dark'
      ? { ...doc.semantic, ...doc.dark.semantic }
      : doc.semantic;
  for (const [token, value] of Object.entries(semanticEntries)) {
    for (const dep of directDeps(value)) {
      if (!names.has(dep)) missing.push({ token, ref: dep });
    }
  }
  return missing;
}

export interface Diagnostics {
  cycles: string[][];
  missing: Array<{ token: string; ref: string }>;
}

export function collectDiagnostics(doc: ThemeDocument, theme: ThemeMode): Diagnostics {
  return {
    cycles: findCycles(buildGraph(doc, theme)),
    missing: findMissingRefs(doc, theme),
  };
}

/** 令牌名 → CSS 变量名：action.primary.bg → --t-action-primary-bg */
export function cssVarName(token: string): string {
  return `--t-${token.replace(/\./g, '-')}`;
}

/** 解析失败时的醒目兜底色（品红），让问题在预览中一眼可见 */
export const ERROR_COLOR = '#ff00ff';

/** 由解析结果生成预览作用域的 CSS 变量文本 */
export function buildCssText(resolution: Resolution): string {
  const lines: string[] = [];
  const names = [...new Set([...resolution.colors.keys(), ...resolution.errors.keys()])].sort();
  for (const name of names) {
    const color = resolution.colors.get(name) ?? ERROR_COLOR;
    lines.push(`  ${cssVarName(name)}: ${color};`);
  }
  return `.preview-scope {\n${lines.join('\n')}\n}`;
}
