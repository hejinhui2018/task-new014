import { useEffect, useMemo, useState } from 'react';
import {
  dependentsOf,
  sourceChain,
  valueFor,
  type Resolution,
} from '../theme/graph';
import {
  makeSetBase,
  makeSetSemantic,
  type Action,
  type AppState,
} from '../theme/store';
import {
  describeValue,
  type TokenValue,
  type TransformOp,
} from '../theme/types';
import { HexInput } from './HexInput';

interface TokenEditorProps {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  resolution: Resolution;
  token: string;
  onSelect: (token: string) => void;
  onClose: () => void;
}

const OP_LABEL: Record<TransformOp, string> = {
  lighten: '调亮 lighten',
  darken: '调暗 darken',
  mix: '混合 mix',
};

export function TokenEditor({
  state,
  dispatch,
  resolution,
  token,
  onSelect,
  onClose,
}: TokenEditorProps) {
  const { doc, theme } = state;
  const isBase = token in doc.base;
  const effective = useMemo(() => valueFor(doc, theme, token), [doc, theme, token]);
  const resolvedColor = resolution.colors.get(token);
  const resolvedError = resolution.errors.get(token);

  const chain = useMemo(() => sourceChain(doc, theme, token), [doc, theme, token]);
  const deps = useMemo(() => dependentsOf(doc, theme, token), [doc, theme, token]);

  const baseNames = useMemo(() => Object.keys(doc.base), [doc.base]);
  const semanticNames = useMemo(
    () => [...new Set([...Object.keys(doc.semantic), ...Object.keys(doc.dark.semantic)])],
    [doc.semantic, doc.dark.semantic],
  );

  // ---------- 编辑草稿 ----------
  const [draft, setDraft] = useState<TokenValue>(
    effective ?? { kind: 'color', value: '#ffffff' },
  );
  useEffect(() => {
    setDraft(effective ?? { kind: 'color', value: '#ffffff' });
  }, [token, theme, effective]);

  const switchKind = (kind: TokenValue['kind']) => {
    if (kind === draft.kind) return;
    if (kind === 'color') {
      setDraft({ kind: 'color', value: resolvedColor ?? '#ffffff' });
    } else if (kind === 'ref') {
      const target = draft.kind !== 'color' ? draft.token : 'blue.600';
      setDraft({ kind: 'ref', token: target });
    } else {
      const target = draft.kind !== 'color' ? draft.token : 'blue.600';
      setDraft({ kind: 'transform', op: 'darken', token: target, amount: 0.08 });
    }
  };

  const darkOverride =
    theme === 'dark' &&
    (isBase ? doc.dark.base[token] !== undefined : doc.dark.semantic[token] !== undefined);

  const apply = () => {
    if (isBase) {
      if (draft.kind === 'color') {
        dispatch({ type: 'command', command: makeSetBase(state, token, theme, draft.value) });
      }
      return;
    }
    dispatch({ type: 'command', command: makeSetSemantic(state, token, theme, draft) });
  };

  const removeOverride = () => {
    if (isBase) {
      // 基础令牌的深色覆盖：恢复为未覆盖（删除 dark.base 中的键）
      dispatch({
        type: 'command',
        command: { kind: 'set-base', token, theme: 'dark', before: doc.dark.base[token], after: undefined },
      });
    } else {
      dispatch({ type: 'command', command: makeSetSemantic(state, token, 'dark', undefined) });
    }
  };

  const tokenOptions = (exclude?: string) => (
    <>
      <optgroup label="基础令牌">
        {baseNames.map((n) => (
          <option key={n} value={n} disabled={n === exclude}>
            {n}
          </option>
        ))}
      </optgroup>
      <optgroup label="语义令牌">
        {semanticNames.map((n) => (
          <option key={n} value={n} disabled={n === exclude}>
            {n}
          </option>
        ))}
      </optgroup>
    </>
  );

  return (
    <div className="token-editor">
      <div className="editor-head">
        <div>
          <strong className="editor-title">{token}</strong>
          <span className="editor-sub">
            {isBase ? '基础令牌' : '语义令牌'} · 当前：{theme === 'light' ? '浅色' : '深色'}主题
            {theme === 'dark' && (darkOverride ? ' · 深色已覆盖' : ' · 继承浅色')}
          </span>
        </div>
        <button className="icon-btn" onClick={onClose} title="关闭">
          ✕
        </button>
      </div>

      <div className="editor-resolved">
        {resolvedError ? (
          <>
            <span className="swatch swatch-error" />
            <span className="err-text">
              {resolvedError.kind === 'cycle' ? '循环依赖' : '缺失引用'}：{resolvedError.detail}
            </span>
          </>
        ) : (
          <>
            <span className="swatch swatch-lg" style={{ background: resolvedColor }} />
            <code>{resolvedColor}</code>
          </>
        )}
      </div>

      {/* 来源链 */}
      <div className="editor-section">
        <h4>来源链</h4>
        <ol className="chain">
          {chain.map((step, i) => (
            <li key={`${step.token}-${i}`} className={step.error ? 'chain-error' : ''}>
              <span
                className={`swatch swatch-sm ${step.error ? 'swatch-error' : ''}`}
                style={step.error ? undefined : { background: step.color }}
              />
              <button className="chain-token" onClick={() => onSelect(step.token)}>
                {step.token}
              </button>
              <span className="chain-value">{describeValue(step.value)}</span>
              {step.color && <code className="chain-hex">{step.color}</code>}
              {step.error && (
                <span className="err-text">{step.error.kind === 'cycle' ? '循环' : '缺失'}</span>
              )}
              {i === chain.length - 1 && !step.error && step.value.kind === 'color' && (
                <span className="chain-base-mark">基础</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* 依赖者 */}
      <div className="editor-section">
        <h4>
          被引用 <span className="hint">共影响 {deps.transitive.length} 个令牌</span>
        </h4>
        {deps.direct.length === 0 ? (
          <p className="hint">没有令牌直接引用它</p>
        ) : (
          <div className="chip-list">
            {deps.direct.map((name) => (
              <button key={name} className="chip" onClick={() => onSelect(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 编辑表单 */}
      <div className="editor-section">
        <h4>编辑{theme === 'dark' ? '（深色主题）' : '（浅色）'}</h4>
        {theme === 'dark' && !darkOverride && (
          <p className="hint">当前继承浅色定义，应用后将创建深色覆盖。</p>
        )}

        {isBase ? (
          <div className="form-row">
            <input
              type="color"
              className="color-well"
              value={resolvedColor ?? '#ffffff'}
              onChange={(e) =>
                dispatch({ type: 'command', command: makeSetBase(state, token, theme, e.target.value) })
              }
            />
            <HexInput
              value={resolvedColor ?? ''}
              onCommit={(v) =>
                dispatch({ type: 'command', command: makeSetBase(state, token, theme, v) })
              }
            />
          </div>
        ) : (
          <>
            <div className="form-row kind-row">
              {(['ref', 'color', 'transform'] as const).map((kind) => (
                <label key={kind} className={draft.kind === kind ? 'kind-active' : ''}>
                  <input
                    type="radio"
                    name="value-kind"
                    checked={draft.kind === kind}
                    onChange={() => switchKind(kind)}
                  />
                  {kind === 'ref' ? '引用' : kind === 'color' ? '颜色' : '变换'}
                </label>
              ))}
            </div>

            {draft.kind === 'color' && (
              <div className="form-row">
                <input
                  type="color"
                  className="color-well"
                  value={draft.value}
                  onChange={(e) => setDraft({ kind: 'color', value: e.target.value })}
                />
                <HexInput
                  value={draft.value}
                  onCommit={(v) => setDraft({ kind: 'color', value: v })}
                />
              </div>
            )}

            {draft.kind === 'ref' && (
              <div className="form-row">
                <select
                  value={draft.token}
                  onChange={(e) => setDraft({ kind: 'ref', token: e.target.value })}
                >
                  {tokenOptions()}
                </select>
              </div>
            )}

            {draft.kind === 'transform' && (
              <>
                <div className="form-row">
                  <select
                    value={draft.op}
                    onChange={(e) =>
                      setDraft({ ...draft, op: e.target.value as TransformOp })
                    }
                  >
                    {(Object.keys(OP_LABEL) as TransformOp[]).map((op) => (
                      <option key={op} value={op}>
                        {OP_LABEL[op]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.token}
                    onChange={(e) => setDraft({ ...draft, token: e.target.value })}
                  >
                    {tokenOptions()}
                  </select>
                </div>
                {draft.op === 'mix' && (
                  <div className="form-row">
                    <span className="form-label">混合对象</span>
                    <select
                      value={draft.other ?? ''}
                      onChange={(e) => setDraft({ ...draft, other: e.target.value })}
                    >
                      <option value="" disabled>
                        选择令牌…
                      </option>
                      {tokenOptions()}
                    </select>
                  </div>
                )}
                <div className="form-row">
                  <input
                    type="range"
                    min={0}
                    max={draft.op === 'mix' ? 1 : 0.5}
                    step={0.01}
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
                  />
                  <span className="form-label">{Math.round(draft.amount * 100)}%</span>
                </div>
              </>
            )}

            <div className="form-row">
              <button className="primary-btn" onClick={apply}>
                应用{theme === 'dark' && !darkOverride ? '（创建深色覆盖）' : ''}
              </button>
            </div>
          </>
        )}

        {theme === 'dark' && darkOverride && (
          <div className="form-row">
            <button className="ghost-btn" onClick={removeOverride}>
              移除深色覆盖（恢复继承浅色）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
