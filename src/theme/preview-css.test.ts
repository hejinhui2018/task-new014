import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 守护测试：预览组件的样式（preview.css）不允许出现硬编码颜色，
 * 一切颜色必须来自令牌解析生成的 var(--t-*)，确保没有绕过依赖图。
 */
describe('预览样式不绕过依赖图', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../styles/preview.css', import.meta.url)),
    'utf-8',
  );

  it('不包含 hex / rgb() / hsl() / 颜色关键字等散落颜色值', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/i);
    // 常见命名颜色（white/black/red…）也不允许直接出现
    const colorProps = css.match(/(?:color|background|border|outline|fill|stroke)\s*:[^;}]+/gi) ?? [];
    for (const decl of colorProps) {
      expect(decl).not.toMatch(/\b(white|black|red|blue|green|gray|grey|orange|purple|pink|brown|yellow)\b/i);
    }
  });

  it('所有颜色声明都经由 --t- 令牌变量', () => {
    // 只匹配真正携带颜色的属性（border-radius / border-width 等布局属性不算）
    const colorDecls =
      css.match(
        /(?:^|\s)(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|caret-color)\s*:[^;}]+/g,
      ) ?? [];
    expect(colorDecls.length).toBeGreaterThan(10); // 确认真的匹配到了颜色声明
    for (const decl of colorDecls) {
      expect(decl).toMatch(/var\(--t-[\w-]+\)|transparent|currentColor|inherit/);
    }
  });
});
