import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App 冒烟测试', () => {
  it('完整渲染三栏结构且不崩溃', () => {
    const html = renderToString(<App />);
    // 顶栏与三栏
    expect(html).toContain('主题发布台');
    expect(html).toContain('令牌依赖');
    expect(html).toContain('组件预览');
    expect(html).toContain('诊断');
    // 令牌变量已注入预览作用域
    expect(html).toContain('--t-action-primary-bg');
    // 来源链与编辑器
    expect(html).toContain('来源链');
    // 对比度行展示了实际文本 / 背景 / 字号 / 等级
    expect(html).toContain('Aa 示例');
    expect(html).toContain('14px');
  });
});
