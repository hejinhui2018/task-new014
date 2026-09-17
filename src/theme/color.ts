/**
 * 颜色工具：hex 解析、HSL 变换、WCAG 相对亮度与对比度。
 * 全部为纯函数，供依赖图解析与对比度诊断使用。
 */

export interface Rgb {
  r: number; // 0..255
  g: number;
  b: number;
}

/** 把 #rgb / #rrggbb 归一化为小写 #rrggbb；非法输入返回 null */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${hex}`;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error(`非法颜色值: ${hex}`);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** HSL 明度增加 amount（0..1） */
export function lightenHex(hex: string, amount: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, l: clamp01(hsl.l + amount) }));
}

/** HSL 明度减少 amount（0..1） */
export function darkenHex(hex: string, amount: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, l: clamp01(hsl.l - amount) }));
}

/** 线性混合：t=0 得到 a，t=1 得到 b */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex({
    r: ca.r * (1 - k) + cb.r * k,
    g: ca.g * (1 - k) + cb.g * k,
    b: ca.b * (1 - k) + cb.b * k,
  });
}

/** WCAG 2.x 相对亮度，0（黑）..1（白） */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 对比度，1..21 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type GradeLabel = 'AAA' | 'AA' | '仅大字 AA' | '未通过';

export interface Grade {
  label: GradeLabel;
  pass: boolean;
}

/**
 * WCAG 2.x 评级。
 * 大字的定义：≥24px，或加粗时 ≥18.66px（14pt bold）。
 * 普通文字：AA 4.5 / AAA 7；大字：AA 3 / AAA 4.5。
 */
export function gradeOf(ratio: number, fontSizePx: number, bold = false): Grade {
  const large = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
  if (large) {
    if (ratio >= 4.5) return { label: 'AAA', pass: true };
    if (ratio >= 3) return { label: 'AA', pass: true };
    return { label: '未通过', pass: false };
  }
  if (ratio >= 7) return { label: 'AAA', pass: true };
  if (ratio >= 4.5) return { label: 'AA', pass: true };
  if (ratio >= 3) return { label: '仅大字 AA', pass: false };
  return { label: '未通过', pass: false };
}
