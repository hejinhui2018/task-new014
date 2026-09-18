import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TokenEditor } from './TokenEditor';
import { resolveAll } from '../theme/graph';
import { brokenScenario, defaultScenario } from '../theme/presets';
import type { Action, AppState } from '../theme/store';
import type { ThemeDocument } from '../theme/types';

const noopDispatch = (() => {}) as unknown as React.Dispatch<Action>;
const noop = () => {};

function stateFor(doc: ThemeDocument, theme: 'light' | 'dark'): AppState {
  return { doc, scenarioId: 'default', theme, past: [], future: [], lastError: null };
}

function render(doc: ThemeDocument, theme: 'light' | 'dark', token: string): string {
  const resolution = resolveAll(doc, theme);
  return renderToString(
    <TokenEditor
      state={stateFor(doc, theme)}
      dispatch={noopDispatch}
      resolution={resolution}
      token={token}
      onSelect={noop}
      onClose={noop}
    />,
  );
}

describe('TokenEditor 来源树渲染', () => {
  it('深色下禁用主按钮展开主色与页面底色两个分支，并标注定义归属', () => {
    const html = render(defaultScenario.doc, 'dark', 'action.primary.bg.disabled');
    // 两个输入分支都渲染
    expect(html).toContain('主输入');
    expect(html).toContain('混合对象');
    expect(html).toContain('action.primary.bg');
    expect(html).toContain('surface.page');
    expect(html).toContain('gray.900'); // 深色覆盖后的页面底色
    // 定义归属可见
    expect(html).toContain('继承浅色');
    expect(html).toContain('深色覆盖');
    // 列表中的令牌仍可点击定位
    expect(html).toMatch(/class="chain-token"[^>]*>surface\.page</);
  });

  it('mix 缺少第二输入时不崩溃，缺失分支与正常主分支都渲染', () => {
    const d: ThemeDocument = {
      ...defaultScenario.doc,
      semantic: {
        ...defaultScenario.doc.semantic,
        'tmp.mix': { kind: 'transform', op: 'mix', token: 'blue.600', amount: 0.5 },
      },
    };
    const html = render(d, 'light', 'tmp.mix');
    expect(html).toContain('（未选择令牌）');
    expect(html).toContain('缺失');
    // 主输入一支不受影响，仍可点击
    expect(html).toContain('blue.600');
    expect(html).toMatch(/class="chain-token"[^>]*>blue\.600</);
  });

  it('第二输入指向不存在令牌时，错误落在该分支且不卡死', () => {
    const d: ThemeDocument = {
      ...defaultScenario.doc,
      semantic: {
        ...defaultScenario.doc.semantic,
        'tmp.mix': { kind: 'transform', op: 'mix', token: 'blue.600', other: 'ghost', amount: 0.5 },
      },
    };
    const html = render(d, 'light', 'tmp.mix');
    expect(html).toContain('ghost');
    expect(html).toContain('缺失');
  });

  it('循环依赖时两个环成员都渲染、可点击，并标出循环', () => {
    const html = render(brokenScenario.doc, 'light', 'info.bg');
    expect(html).toMatch(/class="chain-token"[^>]*>info\.bg</);
    expect(html).toMatch(/class="chain-token"[^>]*>info\.text</);
    expect(html).toContain('循环');
  });
});
