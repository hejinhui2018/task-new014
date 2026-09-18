import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TokenEditor } from './components/TokenEditor';
import { resolveAll } from './theme/graph';
import { defaultScenario } from './theme/presets';
import { initialState } from './theme/store';
import type { Action, AppState } from './theme/store';
import type { ThemeDocument } from './theme/types';

function renderEditor(doc: ThemeDocument, theme: 'light' | 'dark', token: string) {
  const state: AppState = {
    ...initialState(),
    doc,
    scenarioId: defaultScenario.id,
    theme,
  };
  const resolution = resolveAll(doc, theme);
  return renderToString(
    <TokenEditor
      state={state}
      dispatch={(() => undefined) as React.Dispatch<Action>}
      resolution={resolution}
      token={token}
      onSelect={() => undefined}
      onClose={() => undefined}
    />,
  );
}

describe('TokenEditor 来源区分支渲染', () => {
  it('mix 令牌同时显示主输入与混合对象两支，令牌均可点击定位', () => {
    const html = renderEditor(defaultScenario.doc, 'light', 'action.primary.bg.disabled');
    expect(html).toContain('主输入');
    expect(html).toContain('混合对象');
    expect(html).toContain('action.primary.bg</button>');
    expect(html).toContain('surface.page</button>');
    // 两支追溯到的基础令牌
    expect(html).toContain('blue.600');
    expect(html).toContain('gray.50');
  });

  it('深色下区分覆盖与继承定义，混合对象显示深色页面底色', () => {
    const html = renderEditor(defaultScenario.doc, 'dark', 'action.primary.bg.disabled');
    // surface.page 在深色覆盖到 gray.900
    expect(html).toContain('深色覆盖');
    expect(html).toContain('继承浅色');
    expect(html).toContain('#0f172a');
    expect(html).toContain('gray.900');
  });

  it('mix 第二输入缺失时来源区明确指出缺失分支而非显示正常', () => {
    const doc: ThemeDocument = {
      ...defaultScenario.doc,
      semantic: {
        ...defaultScenario.doc.semantic,
        'mix.missing.other': {
          kind: 'transform',
          op: 'mix',
          token: 'blue.600',
          amount: 0.5,
        },
      },
    };
    const html = renderEditor(doc, 'light', 'mix.missing.other');
    expect(html).toContain('未选择令牌');
    expect(html).toContain('缺失');
    // 正常的主输入分支依旧可见可点击
    expect(html).toContain('blue.600');
  });
});
