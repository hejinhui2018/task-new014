/**
 * 对比度检查对：描述「哪段文字放在哪个背景上、多大字号」。
 * 诊断面板对每一对计算 WCAG 对比度并给出等级。
 */

import { contrastRatio, gradeOf, type Grade } from './color';
import type { Resolution } from './graph';

export interface ContrastPair {
  id: string;
  label: string;
  /** 前景（文字）语义令牌 */
  fg: string;
  /** 背景语义令牌 */
  bg: string;
  fontSize: number;
  bold?: boolean;
  /** 参考项（如禁用态，WCAG 豁免），只展示不计入问题数 */
  informational?: boolean;
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { id: 'body-on-page', label: '正文 / 页面背景', fg: 'text.primary', bg: 'surface.page', fontSize: 14 },
  { id: 'secondary-on-page', label: '次要文字 / 页面背景', fg: 'text.secondary', bg: 'surface.page', fontSize: 13 },
  { id: 'title-on-card', label: '卡片标题 / 卡片背景', fg: 'text.primary', bg: 'surface.card', fontSize: 24 },
  { id: 'secondary-on-card', label: '卡片正文 / 卡片背景', fg: 'text.secondary', bg: 'surface.card', fontSize: 14 },
  { id: 'link-on-page', label: '链接 / 页面背景', fg: 'text.link', bg: 'surface.page', fontSize: 14 },
  { id: 'primary-btn', label: '主按钮文字 / 主按钮背景', fg: 'action.primary.text', bg: 'action.primary.bg', fontSize: 14 },
  { id: 'primary-btn-hover', label: '主按钮文字 / 悬停背景', fg: 'action.primary.text', bg: 'action.primary.bg.hover', fontSize: 14 },
  { id: 'primary-btn-disabled', label: '主按钮 / 禁用态（参考）', fg: 'action.primary.text.disabled', bg: 'action.primary.bg.disabled', fontSize: 14, informational: true },
  { id: 'secondary-btn', label: '次按钮文字 / 次按钮背景', fg: 'action.secondary.text', bg: 'action.secondary.bg', fontSize: 14 },
  { id: 'danger-btn', label: '危险按钮文字 / 背景', fg: 'action.danger.text', bg: 'action.danger.bg', fontSize: 14 },
  { id: 'field-text', label: '输入框文字 / 输入框背景', fg: 'field.text', bg: 'field.bg', fontSize: 14 },
  { id: 'field-placeholder', label: '占位文字 / 输入框背景', fg: 'field.placeholder', bg: 'field.bg', fontSize: 14 },
  { id: 'badge', label: '徽标文字 / 徽标背景', fg: 'badge.text', bg: 'badge.bg', fontSize: 12 },
  { id: 'alert-warning', label: '警示文字 / 警示背景', fg: 'alert.warning.text', bg: 'alert.warning.bg', fontSize: 14 },
  { id: 'alert-info', label: '信息文字 / 信息背景', fg: 'info.text', bg: 'info.bg', fontSize: 14 },
];

export interface PairResult {
  pair: ContrastPair;
  fg?: string;
  bg?: string;
  ratio?: number;
  grade?: Grade;
  /** 任一令牌无法解析（缺失 / 循环）时的说明 */
  error?: string;
}

export function evaluatePairs(resolution: Resolution): PairResult[] {
  return CONTRAST_PAIRS.map((pair) => {
    const fgErr = resolution.errors.get(pair.fg);
    const bgErr = resolution.errors.get(pair.bg);
    if (fgErr || bgErr) {
      const bad = fgErr ? pair.fg : pair.bg;
      return { pair, error: `令牌 ${bad} 无法解析（${fgErr?.kind === 'cycle' || bgErr?.kind === 'cycle' ? '循环依赖' : '缺失引用'}）` };
    }
    const fg = resolution.colors.get(pair.fg);
    const bg = resolution.colors.get(pair.bg);
    if (!fg || !bg) return { pair, error: '令牌未定义' };
    const ratio = contrastRatio(fg, bg);
    return { pair, fg, bg, ratio, grade: gradeOf(ratio, pair.fontSize, pair.bold) };
  });
}
