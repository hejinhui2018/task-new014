import { useMemo, useState } from 'react';
import { valueFor, type Resolution } from '../theme/graph';
import { makeSetBase, type Action, type AppState } from '../theme/store';
import { describeValue } from '../theme/types';
import { HexInput } from './HexInput';
import { TokenEditor } from './TokenEditor';

interface TokenPanelProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  resolution: Resolution;
  selected: string | null;
  onSelect: (token: string | null) => void;
}

/** 语义令牌按前缀分组，保持首次出现顺序 */
function groupSemantic(names: string[]): Array<{ group: string; tokens: string[] }> {
  const groups: Array<{ group: string; tokens: string[] }> = [];
  for (const name of names) {
    const group = name.split('.')[0];
    const existing = groups.find((g) => g.group === group);
    if (existing) existing.tokens.push(name);
    else groups.push({ group, tokens: [name] });
  }
  return groups;
}

export function TokenPanel({ state, dispatch, resolution, selected, onSelect }: TokenPanelProps) {
  const { doc, theme } = state;
  const [filter, setFilter] = useState('');

  const baseNames = useMemo(() => Object.keys(doc.base), [doc.base]);
  const semanticNames = useMemo(
    () => [...new Set([...Object.keys(doc.semantic), ...Object.keys(doc.dark.semantic)])],
    [doc.semantic, doc.dark.semantic],
  );
  const groups = useMemo(() => groupSemantic(semanticNames), [semanticNames]);

  const matches = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase());

  return (
    <aside className="panel panel-left">
      <div className="panel-header">
        <h2>令牌依赖</h2>
        <input
          className="filter-input"
          placeholder="筛选令牌…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="token-list">
        <section className="token-group">
          <h3>
            基础令牌 <span className="hint">字面值颜色，可直接编辑</span>
          </h3>
          {baseNames.filter(matches).map((name) => {
            const color = resolution.colors.get(name) ?? doc.base[name];
            const darkOverridden = doc.dark.base[name] !== undefined;
            return (
              <div
                key={name}
                className={`token-row ${selected === name ? 'token-row-selected' : ''}`}
                onClick={() => onSelect(name)}
              >
                <span className="swatch" style={{ background: color }} />
                <span className="token-name" title={name}>
                  {name}
                </span>
                {darkOverridden && (
                  <span className="badge-dark" title="深色主题已覆盖">
                    深
                  </span>
                )}
                <input
                  type="color"
                  className="color-well"
                  value={color}
                  title="选择颜色"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    dispatch({ type: 'command', command: makeSetBase(state, name, theme, e.target.value) })
                  }
                />
                <HexInput
                  value={color}
                  onCommit={(v) =>
                    dispatch({ type: 'command', command: makeSetBase(state, name, theme, v) })
                  }
                />
              </div>
            );
          })}
        </section>

        {groups.map(({ group, tokens }) => {
          const visible = tokens.filter(matches);
          if (visible.length === 0) return null;
          return (
            <section className="token-group" key={group}>
              <h3>{group}</h3>
              {visible.map((name) => {
                const value = valueFor(doc, theme, name);
                const color = resolution.colors.get(name);
                const error = resolution.errors.get(name);
                const darkOverridden = doc.dark.semantic[name] !== undefined;
                return (
                  <button
                    key={name}
                    className={`token-row token-row-btn ${selected === name ? 'token-row-selected' : ''}`}
                    onClick={() => onSelect(name)}
                  >
                    <span
                      className={`swatch ${error ? 'swatch-error' : ''}`}
                      style={error ? undefined : { background: color }}
                      title={error ? `${error.kind === 'cycle' ? '循环依赖' : '缺失引用'}：${error.detail}` : color}
                    />
                    <span className="token-name" title={name}>
                      {name}
                    </span>
                    {darkOverridden && (
                      <span className="badge-dark" title="深色主题已覆盖">
                        深
                      </span>
                    )}
                    <span className="token-value">{value ? describeValue(value) : '未定义'}</span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      {selected && (
        <TokenEditor
          state={state}
          dispatch={dispatch}
          resolution={resolution}
          token={selected}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      )}
    </aside>
  );
}
