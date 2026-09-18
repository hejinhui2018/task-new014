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
 * 来源树：从某令牌展开它真实依赖的各个分支，供「查看来源」使用。
 *
 * 与早期线性 sourceChain 的区别：
 *  - 引用、调亮/调暗产生一个 primary 分支；
 *  - mix 产生两个分支（primary 主输入 + other 混合对象），缺一不可，
 *    因此修改任一侧（如深色页面底色）都能在来源区看到对应分支；
 *  - 共享依赖只在第一次完整展开，再次出现标记 shared，既指出该分支
 *    又避免菱形依赖下的重复与死循环；
 *  - 缺失引用 / 循环依赖标在「出问题的那一个分支」上，而不是让整棵树
 *    看起来正常。
 */
export interface ChainBranch {
  /** 该分支相对父变换的角色：根 / 主输入 / 混合对象 */
  role: 'root' | 'primary' | 'other';
  /** 分支指向的令牌；mix 缺少第二输入时为 undefined（悬空分支） */
  token?: string;
  /** 该令牌在当前主题下实际生效的定义（已含深色覆盖 / 浅色继承回落） */
  value?: TokenValue;
  /** 解析后的颜色，直接取自 resolveAll，与预览/对比度同源 */
  color?: string;
  /** 该分支的解析错误（缺失引用 / 循环依赖 / 第二输入缺失） */
  error?: ResolveError;
  /** 该令牌是回到祖先（循环）或已在树的其他位置展开过（共享依赖） */
  shared?: boolean;
  /** 深色主题下该令牌有显式覆盖（否则继承浅色定义） */
  overridden?: boolean;
  /** 深色主题下该令牌未覆盖、实际生效的是浅色定义 */
  inherited?: boolean;
  /** 继续向下的依赖分支 */
  children: ChainBranch[];
}

function isDarkOverridden(doc: ThemeDocument, name: string): boolean {
  return doc.dark.base[name] !== undefined || doc.dark.semantic[name] !== undefined;
}

/** 构建某令牌在当前主题下的真实来源树 */
export function sourceTree(
  doc: ThemeDocument,
  theme: ThemeMode,
  token: string,
): ChainBranch {
  const resolution = resolveAll(doc, theme);
  const ancestors = new Set<string>(); // 当前 DFS 路径，用于识别回到祖先的环
  const expanded = new Set<string>(); // 已在树中完整展开的令牌，用于共享去重

  function build(name: string | undefined, role: ChainBranch['role']): ChainBranch {
    // mix 的第二输入未选择：悬空分支，明确指出是这一支缺失
    if (name === undefined || name === '') {
      return {
        role,
        token: name || undefined,
        error: { kind: 'missing', detail: '第二输入缺失（未选择令牌）' },
        children: [],
      };
    }

    const value = valueFor(doc, theme, name);
    if (!value) {
      return { role, token: name, error: { kind: 'missing', detail: name }, children: [] };
    }

    const branch: ChainBranch = { role, token: name, value, children: [] };
    const err = resolution.errors.get(name);
    if (err) branch.error = err;
    else branch.color = resolution.colors.get(name);
    if (theme === 'dark') {
      if (isDarkOverridden(doc, name)) branch.overridden = true;
      else branch.inherited = true;
    }

    // 回到祖先（环）或已在别处展开（共享依赖）：标注后不再下钻，保证不死循环、不重复
    if (ancestors.has(name) || expanded.has(name)) {
      branch.shared = true;
      return branch;
    }

    ancestors.add(name);
    if (value.kind === 'ref') {
      branch.children = [build(value.token, 'primary')];
    } else if (value.kind === 'transform') {
      branch.children = [build(value.token, 'primary')];
      if (value.op === 'mix') branch.children.push(build(value.other, 'other'));
    }
    ancestors.delete(name);
    expanded.add(name);
    return branch;
  }

  return build(token, 'root');
}

/** 遍历来源树（深度优先），便于测试与统计 */
export function walkChainTree(
  branch: ChainBranch,
  visit: (branch: ChainBranch, depth: number) => void,
  depth = 0,
): void {
  visit(branch, depth);
  for (const child of branch.children) walkChainTree(child, visit, depth + 1);
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
