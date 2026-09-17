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
  sourceChain,
  wouldCreateCycle,
} from './graph';
import { brokenScenario, defaultScenario } from './presets';
import type { ThemeDocument } from './types';

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
