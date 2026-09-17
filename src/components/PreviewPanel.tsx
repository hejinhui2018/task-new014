import type { SimState } from '../App';

interface PreviewPanelProps {
  cssText: string;
  sim: SimState;
  onSimChange: (sim: SimState) => void;
}

const SIM_OPTIONS: Array<{ value: SimState; label: string }> = [
  { value: 'normal', label: '正常' },
  { value: 'hover', label: '悬停' },
  { value: 'disabled', label: '禁用' },
];

/**
 * 组件预览。所有颜色来自 cssText 注入的 var(--t-*) 令牌变量，
 * 本文件与 preview.css 中没有任何硬编码颜色。
 */
export function PreviewPanel({ cssText, sim, onSimChange }: PreviewPanelProps) {
  return (
    <section className="preview-area">
      <div className="preview-toolbar">
        <h2>组件预览</h2>
        <div className="seg seg-sm" aria-label="状态模拟">
          {SIM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={sim === opt.value ? 'seg-active' : ''}
              onClick={() => onSimChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="hint">
          所有颜色均来自令牌变量；状态色由 hover / disabled 令牌驱动
        </span>
      </div>

      <div className="preview-scroll">
        <div className="preview-scope" data-sim={sim}>
          <style>{cssText}</style>
          <div className="pv-grid">
            <section className="pv-card">
              <h3 className="pv-h">按钮</h3>
              <div className="pv-row">
                <button className="btn btn-primary">主要操作</button>
                <button className="btn btn-secondary">次要操作</button>
                <button className="btn btn-danger">删除</button>
                <button className="btn btn-primary" disabled>
                  禁用按钮
                </button>
              </div>
            </section>

            <section className="pv-card">
              <h3 className="pv-h">文本</h3>
              <h1 className="pv-title">页面标题</h1>
              <p className="pv-body">正文文本：品牌团队在这里检查正文字色与背景的搭配。</p>
              <p className="pv-secondary">次要文本：用于说明、辅助信息与时间戳。</p>
              <a
                className="pv-link"
                href="#"
                onClick={(e) => e.preventDefault()}
              >
                链接文本
              </a>
            </section>

            <section className="pv-card">
              <h3 className="pv-h">表单</h3>
              <input className="pv-field" placeholder="占位文字" />
              <input className="pv-field" defaultValue="已输入的内容" readOnly />
              <input className="pv-field" placeholder="禁用输入框" disabled />
            </section>

            <section className="pv-card">
              <h3 className="pv-h">反馈</h3>
              <div className="pv-row">
                <span className="pv-badge">新功能</span>
                <span className="pv-badge">Beta</span>
              </div>
              <div className="pv-alert pv-alert-warning">
                警告：该操作会影响全部环境，请确认后再继续。
              </div>
              <div className="pv-alert pv-alert-info">
                信息：主题改动已同步到全部组件。
              </div>
            </section>

            <section className="pv-card pv-card--wide">
              <h3 className="pv-h">表面层级</h3>
              <div className="pv-muted-surface">
                柔和表面（surface.muted）：常用于表格条纹、代码块与次要区域。
              </div>
              <div className="pv-divider" />
              <p className="pv-secondary" style={{ margin: 0 }}>
                卡片（surface.card）浮在页面背景（surface.page）之上，由 border.default 描边。
              </p>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
