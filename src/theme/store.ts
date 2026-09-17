/**
 * 应用状态：可撤销的命令栈 + 编辑时校验（循环拒绝）+ localStorage 持久化。
 *
 * 所有对文档的修改都建模为可逆 Command：
 *  - dispatch({ type: 'command', command }) 执行并压入撤销栈；
 *  - undo / redo 通过反向应用命令实现；
 *  - 载入示例场景同样是一条命令，因此也可以撤销。
 */

import { normalizeHex } from './color';
import { wouldCreateCycle } from './graph';
import { defaultScenario } from './presets';
import type { Scenario, ThemeDocument, ThemeMode, TokenValue } from './types';

export type Command =
  | {
      kind: 'set-semantic';
      token: string;
      theme: ThemeMode;
      before: TokenValue | undefined;
      after: TokenValue | undefined; // undefined = 移除（仅深色覆盖允许）
    }
  | {
      kind: 'set-base';
      token: string;
      theme: ThemeMode;
      before: string | undefined;
      after: string | undefined;
    }
  | {
      kind: 'replace-doc';
      before: ThemeDocument;
      after: ThemeDocument;
      beforeScenarioId: string;
      afterScenarioId: string;
    };

export interface AppState {
  doc: ThemeDocument;
  scenarioId: string;
  theme: ThemeMode;
  past: Command[];
  future: Command[];
  /** 最近一次被拒绝的操作原因（如循环依赖），用于顶部提示条 */
  lastError: string | null;
}

export type Action =
  | { type: 'command'; command: Command }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'set-theme'; theme: ThemeMode }
  | { type: 'dismiss-error' };

const HISTORY_LIMIT = 100;

/** 校验命令；返回拒绝原因，null 表示允许 */
export function validateCommand(doc: ThemeDocument, command: Command): string | null {
  switch (command.kind) {
    case 'set-semantic': {
      const value = command.after;
      if (value === undefined) {
        if (command.theme !== 'dark') return '浅色令牌是默认定义，不能删除';
        return null;
      }
      if (value.kind === 'color') {
        return normalizeHex(value.value) ? null : `无效的颜色值：${value.value}`;
      }
      if (value.kind === 'transform' && value.op === 'mix' && !value.other) {
        return 'mix 变换需要选择第二个令牌';
      }
      if (wouldCreateCycle(doc, command.theme, command.token, value)) {
        return `已拒绝：${command.token} 的该引用会形成循环依赖`;
      }
      return null;
    }
    case 'set-base': {
      if (command.after === undefined) {
        // 仅允许移除深色覆盖；浅色基础令牌是默认定义，不能删除
        return command.theme === 'dark' ? null : '基础令牌不能删除';
      }
      return normalizeHex(command.after) ? null : `无效的颜色值：${command.after}`;
    }
    case 'replace-doc':
      // 示例场景作为整体导入，刻意绕过单令牌校验，由诊断面板暴露问题
      return null;
  }
}

/** 正向 / 反向应用命令，返回新文档（不可变更新） */
export function applyCommand(
  doc: ThemeDocument,
  command: Command,
  reverse: boolean,
): ThemeDocument {
  switch (command.kind) {
    case 'set-semantic': {
      const value = reverse ? command.before : command.after;
      if (command.theme === 'dark') {
        const semantic = { ...doc.dark.semantic };
        if (value === undefined) delete semantic[command.token];
        else semantic[command.token] = value;
        return { ...doc, dark: { ...doc.dark, semantic } };
      }
      const semantic = { ...doc.semantic };
      if (value === undefined) delete semantic[command.token];
      else semantic[command.token] = value;
      return { ...doc, semantic };
    }
    case 'set-base': {
      const value = reverse ? command.before : command.after;
      if (command.theme === 'dark') {
        const base = { ...doc.dark.base };
        if (value === undefined) delete base[command.token];
        else base[command.token] = value;
        return { ...doc, dark: { ...doc.dark, base } };
      }
      const base = { ...doc.base };
      if (value === undefined) delete base[command.token];
      else base[command.token] = value;
      return { ...doc, base };
    }
    case 'replace-doc':
      return reverse ? command.before : command.after;
  }
}

function scenarioIdAfter(state: AppState, command: Command, reverse: boolean): string {
  if (command.kind !== 'replace-doc') return state.scenarioId;
  return reverse ? command.beforeScenarioId : command.afterScenarioId;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'command': {
      const error = validateCommand(state.doc, action.command);
      if (error) return { ...state, lastError: error };
      return {
        ...state,
        doc: applyCommand(state.doc, action.command, false),
        scenarioId: scenarioIdAfter(state, action.command, false),
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), action.command],
        future: [],
        lastError: null,
      };
    }
    case 'undo': {
      const command = state.past[state.past.length - 1];
      if (!command) return state;
      return {
        ...state,
        doc: applyCommand(state.doc, command, true),
        scenarioId: scenarioIdAfter(state, command, true),
        past: state.past.slice(0, -1),
        future: [command, ...state.future],
        lastError: null,
      };
    }
    case 'redo': {
      const command = state.future[0];
      if (!command) return state;
      return {
        ...state,
        doc: applyCommand(state.doc, command, false),
        scenarioId: scenarioIdAfter(state, command, false),
        past: [...state.past, command],
        future: state.future.slice(1),
        lastError: null,
      };
    }
    case 'set-theme':
      return { ...state, theme: action.theme };
    case 'dismiss-error':
      return { ...state, lastError: null };
  }
}

// ---------- 命令工厂（从当前状态捕获 before 值） ----------

export function makeSetSemantic(
  state: AppState,
  token: string,
  theme: ThemeMode,
  after: TokenValue | undefined,
): Command {
  const before =
    theme === 'dark' ? state.doc.dark.semantic[token] : state.doc.semantic[token];
  return { kind: 'set-semantic', token, theme, before, after };
}

export function makeSetBase(
  state: AppState,
  token: string,
  theme: ThemeMode,
  after: string,
): Command {
  const before = theme === 'dark' ? state.doc.dark.base[token] : state.doc.base[token];
  return { kind: 'set-base', token, theme, before, after };
}

export function makeReplaceDoc(state: AppState, scenario: Scenario): Command {
  return {
    kind: 'replace-doc',
    before: state.doc,
    after: scenario.doc,
    beforeScenarioId: state.scenarioId,
    afterScenarioId: scenario.id,
  };
}

// ---------- localStorage 持久化（仅存文档与 UI 状态，不存历史栈） ----------

export const STORAGE_KEY = 'theme-release-console:v1';

interface Persisted {
  doc: ThemeDocument;
  scenarioId: string;
  theme: ThemeMode;
}

export function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || typeof parsed !== 'object' || !parsed.doc?.semantic) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersisted(state: AppState): void {
  try {
    const payload: Persisted = {
      doc: state.doc,
      scenarioId: state.scenarioId,
      theme: state.theme,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 存储不可用（隐私模式等）时静默失败，不影响编辑
  }
}

export function initialState(): AppState {
  const persisted = typeof localStorage === 'undefined' ? null : loadPersisted();
  return {
    doc: persisted?.doc ?? defaultScenario.doc,
    scenarioId: persisted?.scenarioId ?? defaultScenario.id,
    theme: persisted?.theme ?? 'light',
    past: [],
    future: [],
    lastError: null,
  };
}
