import { ERROR_COLOR, type Diagnostics } from '../theme/graph';
import type { PairResult } from '../theme/pairs';
import type { ThemeMode } from '../theme/types';

interface DiagnosticsPanelProps {
  diagnostics: Diagnostics;
  pairs: PairResult[];
  theme: ThemeMode;
  onSelect: (token: string) => void;
}

function gradeClass(result: PairResult): string {
  if (result.error) return 'grade-err';
  if (!result.grade) return 'grade-err';
  if (!result.grade.pass) return 'grade-fail';
  return result.grade.label === 'AAA' ? 'grade-aaa' : 'grade-aa';
}

/** 排序：未通过 / 无法解析在前，参考项其次，通过的按原顺序在后 */
function sortPairs(pairs: PairResult[]): PairResult[] {
  const rank = (p: PairResult) => {
    if (p.pair.informational) return 1;
    if (p.error || !p.grade?.pass) return 0;
    return 2;
  };
  return [...pairs].sort((a, b) => rank(a) - rank(b));
}

export function DiagnosticsPanel({ diagnostics, pairs, theme, onSelect }: DiagnosticsPanelProps) {
  const checkable = pairs.filter((p) => !p.pair.informational);
  const passing = checkable.filter((p) => !p.error && p.grade?.pass).length;
  const problemCount =
    diagnostics.cycles.length +
    diagnostics.missing.length +
    checkable.filter((p) => p.error || !p.grade?.pass).length;

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        <h2>诊断</h2>
        <span className="hint">当前：{theme === 'light' ? '浅色' : '深色'}主题</span>
      </div>

      <div className="diag-summary">
        <span className={`diag-chip ${diagnostics.cycles.length ? 'chip-bad' : 'chip-ok'}`}>
          循环 {diagnostics.cycles.length}
        </span>
        <span className={`diag-chip ${diagnostics.missing.length ? 'chip-bad' : 'chip-ok'}`}>
          缺失 {diagnostics.missing.length}
        </span>
        <span className={`diag-chip ${passing === checkable.length ? 'chip-ok' : 'chip-bad'}`}>
          对比度 {passing}/{checkable.length}
        </span>
      </div>

      {problemCount === 0 && (
        <div className="diag-all-clear">✓ 未发现问题，可以发布</div>
      )}

      <section className="diag-section">
        <h3>循环依赖</h3>
        {diagnostics.cycles.length === 0 ? (
          <p className="diag-ok">✓ 无循环依赖</p>
        ) : (
          diagnostics.cycles.map((cycle, i) => (
            <div className="diag-item" key={i}>
              <span className="diag-icon">🔁</span>
              <span className="diag-cycle">
                {cycle.map((token, j) => (
                  <span key={j}>
                    {j > 0 && <span className="diag-arrow">→</span>}
                    <button className="link-chip" onClick={() => onSelect(token)}>
                      {token}
                    </button>
                  </span>
                ))}
              </span>
            </div>
          ))
        )}
      </section>

      <section className="diag-section">
        <h3>缺失引用</h3>
        {diagnostics.missing.length === 0 ? (
          <p className="diag-ok">✓ 无缺失引用</p>
        ) : (
          diagnostics.missing.map(({ token, ref }) => (
            <div className="diag-item" key={`${token}-${ref}`}>
              <span className="diag-icon">⚠</span>
              <button className="link-chip" onClick={() => onSelect(token)}>
                {token}
              </button>
              <span className="diag-arrow">→</span>
              <code className="missing-ref">{ref}</code>
              <span className="hint">（不存在）</span>
            </div>
          ))
        )}
      </section>

      <section className="diag-section">
        <h3>
          对比度 <span className="hint">WCAG 2.x · 未通过优先</span>
        </h3>
        {sortPairs(pairs).map((result) => {
          const { pair } = result;
          const sampleFg = result.fg ?? ERROR_COLOR;
          const sampleBg = result.bg ?? ERROR_COLOR;
          return (
            <button
              key={pair.id}
              className={`pair-row ${pair.informational ? 'pair-info-row' : ''}`}
              onClick={() => onSelect(pair.fg)}
              title={`查看前景令牌 ${pair.fg}`}
            >
              <span
                className="pair-sample"
                style={{
                  background: sampleBg,
                  color: sampleFg,
                  fontSize: Math.min(pair.fontSize, 20),
                }}
              >
                Aa 示例
              </span>
              <span className="pair-info">
                <span className="pair-label">
                  {pair.label}
                  {pair.informational && <em className="hint">（参考）</em>}
                </span>
                <span className="pair-meta">
                  {result.error ? (
                    <span className="err-text">{result.error}</span>
                  ) : (
                    <>
                      <code>{result.fg}</code> 于 <code>{result.bg}</code> · {pair.fontSize}px
                    </>
                  )}
                </span>
              </span>
              <span className="pair-grade">
                {result.ratio !== undefined && <code>{result.ratio.toFixed(2)}:1</code>}
                <span className={`grade ${gradeClass(result)}`}>
                  {result.error ? '错误' : result.grade?.label}
                </span>
              </span>
            </button>
          );
        })}
      </section>
    </aside>
  );
}
