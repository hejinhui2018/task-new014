import { describe, expect, it } from 'vitest';
import { darkenHex, lightenHex, mixHex } from './color';
import {
  buildGraph,
  buildCssText,
  collectDiagnostics,
  dependentsOf,
  ERROR_COLOR,
  findCycles,
  resolveAll,
  resolveColor,
  sourceChain,
  sourceTree,
  wouldCreateCycle,
  type SourceBranch,
} from './graph';
import { brokenScenario, defaultScenario } from './presets';
import type { ThemeDocument, TokenValue } from './types';

const doc = defaultScenario.doc;

function withBase(d: ThemeDocument, token: string, value: string): ThemeDocument {
  return { ...d, base: { ...d.base, [token]: value } };
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

  it('来源链一路追溯到基础令牌', () => {
    const chain = sourceChain(doc, 'light', 'action.primary.bg.hover');
    expect(chain.map((s) => s.token)).toEqual([
      'action.primary.bg.hover',
      'action.primary.bg',
      'blue.600',
    ]);
    expect(chain[2].color).toBe('#2563eb');
    expect(chain.every((s) => !s.error)).toBe(true);
  });

  it('生成的 CSS 文本包含全部语义令牌的变量', () => {
    const css = buildCssText(resolveAll(doc, 'light'));
    expect(css).toContain('--t-action-primary-bg: #2563eb;');
    expect(css).toContain('--t-surface-page: #f8fafc;');
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

function withSemantic(d: ThemeDocument, token: string, value: TokenValue): ThemeDocument {
  return { ...d, semantic: { ...d.semantic, [token]: value } };
}

function flatten(branch: SourceBranch): SourceBranch[] {
  return [branch, ...branch.children.flatMap(flatten)];
}

function findBranch(root: SourceBranch, token: string): SourceBranch | undefined {
  return flatten(root).find((b) => b.token === token);
}

describe('来源树：真实依赖分支', () => {
  it('旧单链来源链看不到 mix 第二支（记录被修复的缺陷）', () => {
    const chain = sourceChain(doc, 'light', 'action.primary.bg.disabled');
    expect(chain.map((s) => s.token)).not.toContain('surface.page');
  });

  it('mix 展开主输入与混合对象两支，颜色与各分支一致', () => {
    const root = sourceTree(doc, 'light', 'action.primary.bg.disabled');
    expect(root.token).toBe('action.primary.bg.disabled');
    expect(root.children.map((b) => b.role)).toEqual(['primary', 'other']);
    expect(root.children.map((b) => b.token)).toEqual([
      'action.primary.bg',
      'surface.page',
    ]);

    const all = flatten(root);
    // 两支各自一路追溯到基础令牌
    expect(findBranch(root, 'blue.600')?.color).toBe('#2563eb');
    expect(findBranch(root, 'gray.50')?.color).toBe('#f8fafc');
    // 混合对象 surface.page 此前在来源区完全缺失
    expect(all.some((b) => b.token === 'surface.page')).toBe(true);
    // 分支颜色与解析结果逐节点一致
    const resolution = resolveAll(doc, 'light');
    for (const b of all) {
      if (!b.error) expect(b.color).toBe(resolution.colors.get(b.token));
    }
    expect(root.color).toBe(
      mixHex('#2563eb', resolution.colors.get('surface.page')!, 0.75),
    );
  });

  it('调亮/调暗只有主输入一支并继续追溯', () => {
    const root = sourceTree(doc, 'light', 'action.primary.bg.hover');
    expect(root.children).toHaveLength(1);
    expect(root.children[0].role).toBe('primary');
    expect(flatten(root).map((b) => b.token)).toEqual([
      'action.primary.bg.hover',
      'action.primary.bg',
      'blue.600',
    ]);
    expect(root.color).toBe(darkenHex('#2563eb', 0.08));

    // 深色下的调亮：surface.muted = lighten(surface.page, 4%)
    const dark = sourceTree(doc, 'dark', 'surface.muted');
    expect(dark.children[0].token).toBe('surface.page');
    expect(dark.color).toBe(lightenHex('#0f172a', 0.04));
  });

  it('深色下标注覆盖与继承，且跟随实际生效的定义', () => {
    const root = sourceTree(doc, 'dark', 'action.primary.bg.disabled');
    // disabled 本身在深色未覆盖 → 继承浅色的 mix 定义
    expect(root.overridden).toBe(false);
    expect(root.value).toEqual(doc.semantic['action.primary.bg.disabled']);
    // 主输入 action.primary.bg 同样继承浅色，落到 blue.600
    const primary = root.children.find((b) => b.role === 'primary')!;
    expect(primary.token).toBe('action.primary.bg');
    expect(primary.overridden).toBe(false);
    expect(findBranch(primary, 'blue.600')?.color).toBe('#2563eb');
    // 混合对象 surface.page 是深色覆盖，落到 gray.900（改深色页面底色会影响这一支）
    const other = root.children.find((b) => b.role === 'other')!;
    expect(other.token).toBe('surface.page');
    expect(other.overridden).toBe(true);
    expect(other.color).toBe('#0f172a');
    expect(findBranch(other, 'gray.900')?.color).toBe('#0f172a');
    expect(root.color).toBe(mixHex('#2563eb', '#0f172a', 0.75));
  });

  it('修改深色页面底色后，混合对象分支显示新值', () => {
    const next: ThemeDocument = {
      ...doc,
      dark: { ...doc.dark, base: { ...doc.dark.base, 'gray.900': '#111111' } },
    };
    const root = sourceTree(next, 'dark', 'action.primary.bg.disabled');
    const other = root.children.find((b) => b.role === 'other')!;
    expect(other.color).toBe('#111111');
    expect(findBranch(other, 'gray.900')?.color).toBe('#111111');
    expect(root.color).toBe(mixHex('#2563eb', '#111111', 0.75));
  });

  it('mix 第二输入缺失时指出具体分支，且与诊断一致、不卡死', () => {
    const broken = withSemantic(doc, 'mix.missing.other', {
      kind: 'transform',
      op: 'mix',
      token: 'blue.600',
      amount: 0.5,
      // 故意没有 other
    });
    const resolution = resolveAll(broken, 'light');
    expect(resolution.errors.get('mix.missing.other')?.kind).toBe('missing');

    const root = sourceTree(broken, 'light', 'mix.missing.other');
    expect(root.error?.kind).toBe('missing');
    expect(root.children).toHaveLength(2);
    // 主输入正常
    const primary = root.children.find((b) => b.role === 'primary')!;
    expect(primary.token).toBe('blue.600');
    expect(primary.error).toBeUndefined();
    // 第二输入分支明确标出缺失，而不是让整棵树看起来正常
    const other = root.children.find((b) => b.role === 'other')!;
    expect(other.token).toBe('');
    expect(other.error?.kind).toBe('missing');
  });

  it('缺失引用在分支节点与目标节点都可见', () => {
    const root = sourceTree(brokenScenario.doc, 'light', 'field.border');
    expect(root.error?.kind).toBe('missing');
    const missing = root.children[0];
    expect(missing.token).toBe('gray.250');
    expect(missing.error?.kind).toBe('missing');
    expect(missing.children).toEqual([]);
  });

  it('循环依赖标记回边分支、有限终止，且环成员仍可点击定位', () => {
    const root = sourceTree(brokenScenario.doc, 'light', 'info.bg');
    const nodes = flatten(root);
    // info.bg → info.text → 回到 info.bg
    expect(nodes.map((b) => b.token)).toEqual(['info.bg', 'info.text', 'info.bg']);
    const backEdge = nodes[2];
    expect(backEdge.shared).toBe(true);
    expect(backEdge.error?.kind).toBe('cycle');
    expect(backEdge.error?.detail).toBe('info.bg → info.text → info.bg');
    expect(backEdge.children).toEqual([]);
    // 令牌名保留在节点上，列表中仍可点击
    expect(nodes.every((b) => b.token !== '' || b.error?.kind === 'missing')).toBe(true);
  });

  it('共享依赖只展开一次，第二次以可点击的共享标记出现', () => {
    const shared = withSemantic(
      withSemantic(
        withSemantic(doc, 'diamond.b', { kind: 'ref', token: 'blue.600' }),
        'diamond.c',
        { kind: 'ref', token: 'blue.600' },
      ),
      'diamond.a',
      { kind: 'transform', op: 'mix', token: 'diamond.b', other: 'diamond.c', amount: 0.5 },
    );
    const root = sourceTree(shared, 'light', 'diamond.a');
    const blueNodes = flatten(root).filter((b) => b.token === 'blue.600');
    expect(blueNodes).toHaveLength(2);
    expect(blueNodes[0].shared).toBe(false);
    expect(blueNodes[0].children).toEqual([]); // 基础令牌本就是叶子
    expect(blueNodes[1].shared).toBe(true);
    expect(blueNodes[1].children).toEqual([]);
    // 两个节点都带着令牌名，可点击定位
    expect(blueNodes.every((b) => b.token === 'blue.600')).toBe(true);
  });

  it('默认主题两个模式下来源树都无错误节点且有限', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const name of ['action.primary.bg.disabled', 'badge.bg', 'action.secondary.bg.hover']) {
        const nodes = flatten(sourceTree(doc, theme, name));
        expect(nodes.every((b) => !b.error)).toBe(true);
      }
    }
  });
});
