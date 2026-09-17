import { describe, expect, it } from 'vitest';
import { darkenHex, mixHex } from './color';
import { resolveColor } from './graph';
import { brokenScenario, defaultScenario } from './presets';
import {
  applyCommand,
  initialState,
  makeReplaceDoc,
  makeSetBase,
  makeSetSemantic,
  reducer,
  validateCommand,
  type AppState,
} from './store';

function freshState(): AppState {
  return {
    doc: defaultScenario.doc,
    scenarioId: defaultScenario.id,
    theme: 'light',
    past: [],
    future: [],
    lastError: null,
  };
}

describe('状态色（hover / disabled）', () => {
  it('hover 由基础色经 darken 推导，disabled 由 mix 推导', () => {
    const doc = defaultScenario.doc;
    expect(resolveColor(doc, 'light', 'action.primary.bg.hover')).toBe(
      darkenHex('#2563eb', 0.08),
    );
    expect(resolveColor(doc, 'light', 'action.primary.bg.disabled')).toBe(
      mixHex('#2563eb', '#f8fafc', 0.75),
    );
  });

  it('修改基础令牌后 hover / disabled 立即跟随', () => {
    let state = freshState();
    state = reducer(state, {
      type: 'command',
      command: makeSetBase(state, 'blue.600', 'light', '#00aa55'),
    });
    expect(resolveColor(state.doc, 'light', 'action.primary.bg')).toBe('#00aa55');
    expect(resolveColor(state.doc, 'light', 'action.primary.bg.hover')).toBe(
      darkenHex('#00aa55', 0.08),
    );
    expect(resolveColor(state.doc, 'light', 'action.primary.bg.disabled')).toBe(
      mixHex('#00aa55', '#f8fafc', 0.75),
    );
  });

  it('深色主题下状态色跟随深色覆盖一起变化', () => {
    let state = freshState();
    // 给深色主题覆盖主按钮背景
    state = reducer(state, {
      type: 'command',
      command: makeSetSemantic(state, 'action.primary.bg', 'dark', {
        kind: 'ref',
        token: 'blue.500',
      }),
    });
    expect(resolveColor(state.doc, 'dark', 'action.primary.bg')).toBe('#3b82f6');
    // hover 未覆盖，继承变换定义但解析深色覆盖后的 bg
    expect(resolveColor(state.doc, 'dark', 'action.primary.bg.hover')).toBe(
      darkenHex('#3b82f6', 0.08),
    );
    // 浅色不受影响
    expect(resolveColor(state.doc, 'light', 'action.primary.bg')).toBe('#2563eb');
  });
});

describe('主题覆盖命令', () => {
  it('深色覆盖只影响深色，移除覆盖后回落', () => {
    let state = freshState();
    state = reducer(state, {
      type: 'command',
      command: makeSetSemantic(state, 'surface.page', 'dark', {
        kind: 'color',
        value: '#101010',
      }),
    });
    expect(resolveColor(state.doc, 'dark', 'surface.page')).toBe('#101010');
    expect(resolveColor(state.doc, 'light', 'surface.page')).toBe('#f8fafc');

    // 移除覆盖 → 继承浅色定义
    state = reducer(state, {
      type: 'command',
      command: makeSetSemantic(state, 'surface.page', 'dark', undefined),
    });
    expect(resolveColor(state.doc, 'dark', 'surface.page')).toBe('#f8fafc');
  });
});

describe('循环拒绝（经 reducer）', () => {
  it('形成环的命令被拒绝，文档保持不变并记录原因', () => {
    let state = freshState();
    const before = state.doc;
    state = reducer(state, {
      type: 'command',
      command: makeSetSemantic(state, 'action.primary.bg', 'light', {
        kind: 'ref',
        token: 'action.primary.bg.hover',
      }),
    });
    expect(state.doc).toBe(before);
    expect(state.lastError).toContain('循环依赖');
    expect(state.past).toHaveLength(0);
  });

  it('非法颜色值被拒绝', () => {
    const state = freshState();
    const command = makeSetBase(state, 'blue.600', 'light', 'not-a-color');
    expect(validateCommand(state.doc, command)).toContain('无效的颜色值');
  });
});

describe('撤销 / 重做', () => {
  it('编辑可撤销、可重做，且新命令清空重做栈', () => {
    let state = freshState();
    const original = state.doc;

    state = reducer(state, {
      type: 'command',
      command: makeSetBase(state, 'blue.600', 'light', '#00aa55'),
    });
    state = reducer(state, {
      type: 'command',
      command: makeSetSemantic(state, 'text.link', 'light', {
        kind: 'ref',
        token: 'blue.700',
      }),
    });
    expect(resolveColor(state.doc, 'light', 'action.primary.bg')).toBe('#00aa55');
    expect(resolveColor(state.doc, 'light', 'text.link')).toBe('#1d4ed8');

    // 撤销一步：text.link 恢复为引用 blue.600，而 blue.600 仍是新值 → 传播在撤销后依然成立
    state = reducer(state, { type: 'undo' });
    expect(resolveColor(state.doc, 'light', 'text.link')).toBe('#00aa55');
    // 再撤销一步 → 回到最初
    state = reducer(state, { type: 'undo' });
    expect(state.doc).toEqual(original);

    // 重做两步 → 恢复编辑
    state = reducer(state, { type: 'redo' });
    state = reducer(state, { type: 'redo' });
    expect(resolveColor(state.doc, 'light', 'action.primary.bg')).toBe('#00aa55');
    expect(resolveColor(state.doc, 'light', 'text.link')).toBe('#1d4ed8');

    // 撤销一次后执行新命令 → 重做栈清空
    state = reducer(state, { type: 'undo' });
    state = reducer(state, {
      type: 'command',
      command: makeSetBase(state, 'gray.900', 'light', '#111111'),
    });
    expect(state.future).toHaveLength(0);
    state = reducer(state, { type: 'redo' });
    // 重做栈已空，text.link 仍引用 blue.600（#00aa55）
    expect(resolveColor(state.doc, 'light', 'text.link')).toBe('#00aa55');
  });

  it('恢复示例场景是一条可撤销的命令', () => {
    let state = freshState();
    state = reducer(state, {
      type: 'command',
      command: makeReplaceDoc(state, brokenScenario),
    });
    expect(state.scenarioId).toBe('high-contrast-broken');
    expect(resolveColor(state.doc, 'light', 'info.bg')).toBeUndefined(); // 循环 → 无法解析

    state = reducer(state, { type: 'undo' });
    expect(state.scenarioId).toBe('default');
    expect(resolveColor(state.doc, 'light', 'info.bg')).toBeDefined();
  });

  it('applyCommand 正反对称：执行后撤销回到原文档', () => {
    const state = freshState();
    const command = makeSetSemantic(state, 'surface.page', 'dark', {
      kind: 'color',
      value: '#123456',
    });
    const applied = applyCommand(state.doc, command, false);
    expect(applyCommand(applied, command, true)).toEqual(state.doc);
  });
});

describe('初始状态', () => {
  it('无持久化数据时加载默认主题', () => {
    // 测试环境（node）没有 localStorage
    const state = initialState();
    expect(state.scenarioId).toBe('default');
    expect(state.theme).toBe('light');
  });
});
