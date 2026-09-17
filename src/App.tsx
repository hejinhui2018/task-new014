import { useEffect, useMemo, useReducer, useState } from 'react';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { TokenPanel } from './components/TokenPanel';
import { TopBar } from './components/TopBar';
import { buildCssText, collectDiagnostics, resolveAll } from './theme/graph';
import { evaluatePairs } from './theme/pairs';
import { SCENARIOS } from './theme/presets';
import {
  initialState,
  makeReplaceDoc,
  reducer,
  savePersisted,
} from './theme/store';
import type { Scenario } from './theme/types';

export type SimState = 'normal' | 'hover' | 'disabled';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [selected, setSelected] = useState<string | null>('action.primary.bg');
  const [sim, setSim] = useState<SimState>('normal');

  const resolution = useMemo(
    () => resolveAll(state.doc, state.theme),
    [state.doc, state.theme],
  );
  const diagnostics = useMemo(
    () => collectDiagnostics(state.doc, state.theme),
    [state.doc, state.theme],
  );
  const pairs = useMemo(() => evaluatePairs(resolution), [resolution]);
  const cssText = useMemo(() => buildCssText(resolution), [resolution]);

  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId);
  const dirty = useMemo(
    () => !scenario || JSON.stringify(state.doc) !== JSON.stringify(scenario.doc),
    [state.doc, scenario],
  );

  // 数据只保存在浏览器本地
  useEffect(() => {
    savePersisted(state);
  }, [state]);

  // Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const restore = (next: Scenario) => {
    dispatch({ type: 'command', command: makeReplaceDoc(state, next) });
  };

  return (
    <div className="app">
      <TopBar
        theme={state.theme}
        onThemeChange={(theme) => dispatch({ type: 'set-theme', theme })}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        scenarioName={scenario?.name ?? '自定义'}
        dirty={dirty}
        onRestore={restore}
      />

      {state.lastError && (
        <div className="error-bar" role="alert">
          <span>⚠ {state.lastError}</span>
          <button onClick={() => dispatch({ type: 'dismiss-error' })}>知道了</button>
        </div>
      )}

      <div className="main">
        <TokenPanel
          state={state}
          dispatch={dispatch}
          resolution={resolution}
          selected={selected}
          onSelect={setSelected}
        />
        <PreviewPanel cssText={cssText} sim={sim} onSimChange={setSim} />
        <DiagnosticsPanel
          diagnostics={diagnostics}
          pairs={pairs}
          theme={state.theme}
          onSelect={(token) => setSelected(token)}
        />
      </div>
    </div>
  );
}
