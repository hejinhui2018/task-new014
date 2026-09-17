import type { Scenario } from '../theme/types';
import { SCENARIOS } from '../theme/presets';
import type { ThemeMode } from '../theme/types';

interface TopBarProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  scenarioName: string;
  dirty: boolean;
  onRestore: (scenario: Scenario) => void;
}

export function TopBar({
  theme,
  onThemeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  scenarioName,
  dirty,
  onRestore,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        主题发布台
        <span className="scenario-chip" title="当前示例场景">
          {scenarioName}
          {dirty && <em> · 已修改</em>}
        </span>
      </div>

      <div className="seg" role="tablist" aria-label="预览主题">
        <button
          className={theme === 'light' ? 'seg-active' : ''}
          onClick={() => onThemeChange('light')}
        >
          ☀ 浅色
        </button>
        <button
          className={theme === 'dark' ? 'seg-active' : ''}
          onClick={() => onThemeChange('dark')}
        >
          ☾ 深色
        </button>
      </div>

      <div className="history-buttons">
        <button disabled={!canUndo} onClick={onUndo} title="撤销 (Ctrl/⌘+Z)">
          ↩ 撤销
        </button>
        <button disabled={!canRedo} onClick={onRedo} title="重做 (Ctrl/⌘+Shift+Z)">
          ↪ 重做
        </button>
      </div>

      <div className="spacer" />

      <span className="topbar-label">恢复示例：</span>
      {SCENARIOS.map((s) => (
        <button
          key={s.id}
          className="restore-btn"
          title={`${s.description}（载入为一条可撤销的命令）`}
          onClick={() => onRestore(s)}
        >
          {s.name}
        </button>
      ))}
    </header>
  );
}
