import { describe, expect, it } from 'vitest';
import { darkenHex, mixHex } from './color';
import {
  buildGraph,
  buildCssText,
  collectDiagnostics,
  dependentsOf,
  ERROR_COLOR,
  findCycles,
  resolveAll,
  resolveColor,
  sourceTree,
  walkChainTree,
  wouldCreateCycle,
  type ChainBranch,
} from './graph';
import { brokenScenario, defaultScenario } from './presets';
import type { ThemeDocument, TokenValue } from './types';

const doc = defaultScenario.doc;

function withBase(d: ThemeDocument, token: string, value: string): ThemeDocument {
  return { ...d, base: { ...d.base, [token]: value } };
}

/** 深度优先拍平来源树，便于断言分支、角色与层级 */
function flatten(root: ChainBranch): Array<{ b: ChainBranch; depth: number }> {
  const out: Array<{ b: ChainBranch; depth: number }> = [];
  walkChainTree(root, (b, depth) => out.push({ b, depth }));
  return out;
}

function makeDoc(
  semantic: Record<string, TokenValue>,
  base: Record<string, string> = {},
): ThemeDocument {
  return { base, semantic, dark: { base: {}, semantic: {} } };
}

describe('依赖传播', () => {
  it('修改基础令牌后，引用链上的语义令牌全部更新', () => {
    const before = resolveAll(doc, 'light');
    const next = withBase(doc, 'blue.600', '#ff0000');
    const after = resolveAll(next, 'light');

    // 直接引用
    expect(after.colors.get('action.primary.bg')).toBe('#ff0000');
    // 二级引用（变换）
    expect(after.colors.get('action.primary.bg.hover')).toBe(darkenHex('#ff0000', 0.08));
    // 三级引用（mix 变换穿过 ref）
    expect(after.colors.get('action.primary.bg.disabled')).toBe(
      mixHex('#ff0000', after.colors.get('surface.page')!, 0.75),
    );
    // 未依赖 blue.600 的令牌保持不变
    expect(after.colors.get('surface.page')).toBe(before.colors.get('surface.page'));
    expect(after.colors.get('text.primary')).toBe(before.colors.get('text.primary'));
  });

  it('dependentsOf 给出直接与传递依赖者', () => {
    const { direct, transitive } = dependentsOf(doc, 'light', 'blue.600');
    expect(direct).toContain('action.primary.bg');
    expect(direct).not.toContain('action.primary.bg.hover');
    expect(transitive).toContain('action.primary.bg');
    expect(transitive).toContain('action.primary.bg.hover');
    expect(transitive).toContain('action.primary.bg.disabled');
  });

  it('来源树一路追溯到基础令牌（单输入：调暗穿过引用）', () => {
    const root = sourceTree(doc, 'light', 'action.primary.bg.hover');
    const tokens = flatten(root).map(({ b }) => b.token);
    expect(tokens).toEqual([
      'action.primary.bg.hover',
      'action.primary.bg',
      'blue.600',
    ]);
    const baseNode = flatten(root).find(({ b }) => b.token === 'blue.600')!.b;
    expect(baseNode.color).toBe('#2563eb');
    expect(flatten(root).every(({ b }) => !b.error)).toBe(true);
  });

  it('CSS 文本包含全部语义令牌的变量（来源重构不改变解析输出）', () => {
    const css = buildCssText(resolveAll(doc, 'light'));
    expect(css).toContain('--t-action-primary-bg: #2563eb;');
    expect(css).toContain('--t-surface-page: #f8fafc;');
  });
});

describe('来源树 · 双输入混合', () => {
  it('mix 同时展开主输入与混合对象两个分支', () => {
    const root = sourceTree(doc, 'light', 'action.primary.bg.disabled');
    expect(root.token).toBe('action.primary.bg.disabled');
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toMatchObject({ role: 'primary', token: 'action.primary.bg' });
    expect(root.children[1]).toMatchObject({ role: 'other', token: 'surface.page' });

    const tokens = flatten(root).map(({ b }) => b.token);
    // 主色一支
    expect(tokens).toContain('action.primary.bg');
    expect(tokens).toContain('blue.600');
    // 页面底色一支（早期实现完全漏掉）
    expect(tokens).toContain('surface.page');
    expect(tokens).toContain('gray.50');
  });

  it('深色主题下，mix 的页面底色分支跟随深色覆盖定义', () => {
    // action.primary.bg.disabled 未在深色覆盖，继承浅色 mix 定义；
    // 但其 other 输入 surface.page 在深色被覆盖为 gray.900。
    const root = sourceTree(doc, 'dark', 'action.primary.bg.disabled');

    const disabled = root;
    expect(disabled.inherited).toBe(true); // mix 定义本身继承浅色
    expect(disabled.color).toBe(mixHex('#2563eb', '#0f172a', 0.75));

    const other = root.children.find((b) => b.role === 'other')!;
    expect(other.token).toBe('surface.page');
    expect(other.overridden).toBe(true); // 这一支是深色覆盖
    expect(other.color).toBe('#0f172a');
    expect(flatten(other).map(({ b }) => b.token)).toContain('gray.900');

    const primary = root.children.find((b) => b.role === 'primary')!;
    expect(primary.color).toBe('#2563eb');
    // action.primary.bg 在深色同样未覆盖
    expect(primary.inherited).toBe(true);
  });

  it('修改深色页面底色后，来源树该分支与解析色同步变化', () => {
    const changed: ThemeDocument = {
      ...doc,
      dark: { ...doc.dark, base: { ...doc.dark.base, 'gray.900': '#111111' } },
    };
    const root = sourceTree(changed, 'dark', 'action.primary.bg.disabled');
    expect(root.color).toBe(mixHex('#2563eb', '#111111', 0.75));
    const pageLeaf = flatten(root).find(({ b }) => b.token === 'gray.900')!.b;
    expect(pageLeaf.color).toBe('#111111');
  });

  it('共享依赖只展开一次并标注 shared，不死循环、不丢分支', () => {
    // two 与 three 都 mix 引用同一个 shared 叶子
    const d = makeDoc(
      {
        shared: { kind: 'ref', token: 'blue.500' },
        two: { kind: 'transform', op: 'mix', token: 'shared', other: 'blue.600', amount: 0.2 },
        three: { kind: 'transform', op: 'mix', token: 'two', other: 'shared', amount: 0.3 },
      },
      { 'blue.500': '#3b82f6', 'blue.600': '#2563eb' },
    );
    const root = sourceTree(d, 'light', 'three');
    const flat = flatten(root);

    // shared 第一次完整展开（带 blue.500 子分支），第二次仅共享标注
    const sharedNodes = flat.filter(({ b }) => b.token === 'shared');
    expect(sharedNodes).toHaveLength(2);
    expect(sharedNodes[0].b.shared).toBeUndefined();
    expect(sharedNodes[0].b.children.length).toBe(1);
    expect(sharedNodes[1].b.shared).toBe(true);
    expect(sharedNodes[1].b.children.length).toBe(0);
    // 两个引用分支都仍可见
    expect(flat.filter(({ b }) => b.token === 'blue.500')).toHaveLength(1);
    expect(flat.filter(({ b }) => b.token === 'blue.600')).toHaveLength(1);
  });
});

describe('来源树 · 缺失与循环落到具体分支', () => {
  it('mix 缺少第二输入时，错误标在 other 悬空分支，主输入仍正常', () => {
    const d = makeDoc(
      {
        a: { kind: 'transform', op: 'mix', token: 'blue.600', amount: 0.5 },
      },
      { 'blue.600': '#2563eb' },
    );
    const root = sourceTree(d, 'light', 'a');
    // 与 resolveAll 诊断一致：整令牌解析失败
    expect(resolveAll(d, 'light').errors.get('a')?.kind).toBe('missing');
    expect(root.error?.kind).toBe('missing');

    expect(root.children).toHaveLength(2);
    const [primary, other] = root.children;
    expect(primary.error).toBeUndefined();
    expect(primary.color).toBe('#2563eb');
    expect(other.role).toBe('other');
    expect(other.token).toBeUndefined();
    expect(other.error?.kind).toBe('missing');
  });

  it('mix 的第二输入指向缺失令牌时，错误标在 other 分支', () => {
    const d = makeDoc(
      {
        a: { kind: 'transform', op: 'mix', token: 'blue.600', other: 'ghost', amount: 0.5 },
      },
      { 'blue.600': '#2563eb' },
    );
    const root = sourceTree(d, 'light', 'a');
    const other = root.children.find((b) => b.role === 'other')!;
    expect(other.token).toBe('ghost');
    expect(other.error).toEqual({ kind: 'missing', detail: 'ghost' });
    // 主分支不应被错误掩盖
    expect(root.children.find((b) => b.role === 'primary')!.error).toBeUndefined();
  });

  it('单输入引用缺失令牌时，错误沿该分支落到缺失点', () => {
    const root = sourceTree(brokenScenario.doc, 'light', 'field.border');
    expect(root.token).toBe('field.border');
    expect(root.error?.kind).toBe('missing');
    const leaf = root.children[0];
    expect(leaf.token).toBe('gray.250');
    expect(leaf.error).toEqual({ kind: 'missing', detail: 'gray.250' });
  });

  it('循环依赖时，环上节点标注错误，回到环内的分支标记 shared 且不无限展开', () => {
    // brokenScenario: info.bg ↔ info.text
    const root = sourceTree(brokenScenario.doc, 'light', 'info.bg');
    expect(root.error?.kind).toBe('cycle');

    const flat = flatten(root);
    // 两个环成员都出现且都标为循环错误
    const bg = flat.find(({ b }) => b.token === 'info.bg')!.b;
    const text = flat.find(({ b }) => b.token === 'info.text')!.b;
    expect(bg.error?.kind).toBe('cycle');
    expect(text.error?.kind).toBe('cycle');
    // info.text 回到 info.bg 时停止下钻（shared）：root → text → 回到 bg，共 3 个节点
    expect(flat.length).toBe(3);
    expect(flat.filter(({ b }) => b.shared)).toHaveLength(1);
  });

  it('共享依赖参与循环时同样终止，整棵树节点有限', () => {
    // a → b → a 成环，且 a 还被另一支共享引用
    const d = makeDoc({
      a: { kind: 'transform', op: 'mix', token: 'b', other: 'blue.600', amount: 0.2 },
      b: { kind: 'ref', token: 'a' },
    }, { 'blue.600': '#2563eb' });
    const root = sourceTree(d, 'light', 'a');
    const flat = flatten(root);
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.every(({ b }) => b.token === undefined || typeof b.token === 'string')).toBe(true);
    expect(flat.some(({ b }) => b.error?.kind === 'cycle')).toBe(true);
  });
});

describe('来源树 · 主题定义归属', () => {
  it('浅色主题不标注覆盖 / 继承', () => {
    const root = sourceTree(doc, 'light', 'surface.page');
    expect(root.overridden).toBeUndefined();
    expect(root.inherited).toBeUndefined();
  });

  it('深色覆盖的语义令牌标记 overridden，其引用链展开深色定义', () => {
    const root = sourceTree(doc, 'dark', 'text.link');
    expect(root.overridden).toBe(true);
    expect(root.color).toBe('#60a5fa');
    expect(flatten(root).map(({ b }) => b.token)).toContain('blue.400');
  });

  it('未覆盖令牌标记 inherited，并展开其实际生效的浅色定义', () => {
    const root = sourceTree(doc, 'dark', 'badge.bg');
    // badge.bg 在深色未覆盖，继承浅色 mix 定义；但 surface.card 被深色覆盖
    expect(root.inherited).toBe(true);
    const card = flatten(root).find(({ b }) => b.token === 'surface.card')!.b;
    expect(card.overridden).toBe(true);
    expect(root.color).toBe(mixHex('#2563eb', '#1e293b', 0.88));
  });
});

describe('循环依赖', () => {
  it('编辑时拒绝会形成环的引用', () => {
    // action.primary.bg → action.primary.bg.hover 会成环（hover 已引用 bg）
    expect(
      wouldCreateCycle(doc, 'light', 'action.primary.bg', {
        kind: 'ref',
        token: 'action.primary.bg.hover',
      }),
    ).toBe(true);
    // 自引用也是环
    expect(
      wouldCreateCycle(doc, 'light', 'text.link', { kind: 'ref', token: 'text.link' }),
    ).toBe(true);
    // 正常引用不被误伤
    expect(
      wouldCreateCycle(doc, 'light', 'text.link', { kind: 'ref', token: 'blue.500' }),
    ).toBe(false);
  });

  it('findCycles 找到问题场景中互相引用的环', () => {
    const cycles = findCycles(buildGraph(brokenScenario.doc, 'light'));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toContain('info.bg');
    expect(cycles[0]).toContain('info.text');
  });

  it('环上的令牌解析为错误，并使用醒目兜底色输出', () => {
    const resolution = resolveAll(brokenScenario.doc, 'light');
    expect(resolution.errors.get('info.bg')?.kind).toBe('cycle');
    expect(resolution.errors.get('info.text')?.kind).toBe('cycle');
    expect(resolution.colors.has('info.bg')).toBe(false);
    const css = buildCssText(resolution);
    expect(css).toContain(`--t-info-bg: ${ERROR_COLOR};`);
  });
});

describe('缺失引用', () => {
  it('诊断列出指向不存在令牌的引用', () => {
    const { missing } = collectDiagnostics(brokenScenario.doc, 'light');
    expect(missing).toEqual([{ token: 'field.border', ref: 'gray.250' }]);
  });

  it('缺失引用的令牌解析为 missing 错误', () => {
    const resolution = resolveAll(brokenScenario.doc, 'light');
    expect(resolution.errors.get('field.border')?.kind).toBe('missing');
  });

  it('默认主题没有循环与缺失', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { cycles, missing } = collectDiagnostics(doc, theme);
      expect(cycles).toEqual([]);
      expect(missing).toEqual([]);
    }
  });
});

describe('主题覆盖', () => {
  it('深色覆盖优先，未覆盖的令牌继承浅色定义', () => {
    expect(resolveColor(doc, 'light', 'surface.page')).toBe('#f8fafc');
    expect(resolveColor(doc, 'dark', 'surface.page')).toBe('#0f172a');
    // 未覆盖：action.primary.bg 在两个主题下都解析到 blue.600
    expect(resolveColor(doc, 'dark', 'action.primary.bg')).toBe('#2563eb');
  });

  it('引用会跟随主题：同一令牌在不同主题解析到不同颜色', () => {
    // badge.bg = mix(blue.600, surface.card, 0.88)，surface.card 在深色被覆盖
    const light = resolveColor(doc, 'light', 'badge.bg')!;
    const dark = resolveColor(doc, 'dark', 'badge.bg')!;
    expect(light).not.toBe(dark);
    expect(dark).toBe(mixHex('#2563eb', '#1e293b', 0.88));
  });
});
