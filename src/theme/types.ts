/**
 * 令牌数据模型。
 *
 * 一个主题文档（ThemeDocument）由两层令牌组成：
 *  - base：基础令牌，只能是字面值颜色（#rrggbb）。
 *  - semantic：语义令牌，可以是颜色、引用或变换，允许指向基础令牌或其他语义令牌。
 *
 * dark 下保存深色主题的覆盖值；未覆盖的令牌继承浅色（默认）定义。
 * 组件只允许消费语义令牌解析出的 CSS 变量，不允许出现散落的硬编码颜色。
 */

export type ThemeMode = 'light' | 'dark';

export type TransformOp = 'lighten' | 'darken' | 'mix';

export type TokenValue =
  | { kind: 'color'; value: string }
  | { kind: 'ref'; token: string }
  | {
      kind: 'transform';
      op: TransformOp;
      /** 主输入令牌 */
      token: string;
      /** 0..1，lighten/darken 为 HSL 明度增量，mix 为朝向 other 的混合比例 */
      amount: number;
      /** 仅 mix 使用：第二个输入令牌 */
      other?: string;
    };

export interface ThemeDocument {
  base: Record<string, string>;
  semantic: Record<string, TokenValue>;
  dark: {
    base: Record<string, string>;
    semantic: Record<string, TokenValue>;
  };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  doc: ThemeDocument;
}

/** 令牌的直接依赖（引用了哪些令牌） */
export function directDeps(value: TokenValue): string[] {
  switch (value.kind) {
    case 'color':
      return [];
    case 'ref':
      return [value.token];
    case 'transform':
      return value.op === 'mix' && value.other
        ? [value.token, value.other]
        : [value.token];
  }
}

/** 人类可读的值摘要，如 "→ blue.600"、"darken(action.primary.bg, 8%)" */
export function describeValue(value: TokenValue): string {
  switch (value.kind) {
    case 'color':
      return value.value;
    case 'ref':
      return `→ ${value.token}`;
    case 'transform': {
      const pct = `${Math.round(value.amount * 100)}%`;
      if (value.op === 'mix') return `mix(${value.token}, ${value.other ?? '?'}, ${pct})`;
      return `${value.op}(${value.token}, ${pct})`;
    }
  }
}
