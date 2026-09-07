/** Copy presentation only; never clone the host's IDs, handlers, links or React-owned subtree. */
const properties = ['box-sizing','font-family','font-size','font-weight','line-height','letter-spacing','color',
  'padding-top','padding-bottom','padding-left','padding-right','min-height','border-radius'] as const;
export function applyMenuAppearance(row: HTMLElement, template: HTMLElement) {
  const computed = getComputedStyle(template);
  for (const property of properties) row.style.setProperty(property, computed.getPropertyValue(property));
  const labelTemplate = template.querySelector<HTMLElement>('[dir]') ?? template;
  const textStyle = getComputedStyle(labelTemplate);
  for (const property of ['font-family','font-size','font-weight','line-height','color']) row.style.setProperty(property, textStyle.getPropertyValue(property));
  row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.width = '100%';
  row.style.border = '0'; row.style.textAlign = 'start'; row.style.cursor = 'pointer';
  const svg = template.querySelector('svg');
  const icon = row.querySelector('svg');
  if (svg && icon) {
    const size = getComputedStyle(svg);
    icon.style.width = size.width; icon.style.height = size.height;
    const iconBox = svg.parentElement;
    const gap = iconBox ? getComputedStyle(iconBox).marginRight : '0px';
    // X places the icon in its own box with trailing margin.
    row.style.gap = parseFloat(gap) > 0 ? gap : computed.columnGap !== 'normal' ? computed.columnGap : '12px';
  }
  const background = menuBackground(template);
  const color = background === 'rgb(255, 255, 255)' ? 'rgba(0,0,0,.03)' : 'rgba(255,255,255,.08)';
  row.style.background = 'transparent';
  row.onpointerenter = () => { row.style.background = color; };
  row.onpointerleave = () => { if (document.activeElement !== row) row.style.background = 'transparent'; };
  row.onfocus = () => { row.style.background = color; };
  row.onblur = () => { row.style.background = 'transparent'; };
}
export function menuBackground(element: Element): string {
  let current: Element | null = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
    current = current.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || 'rgb(255, 255, 255)';
}
export function roteIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('aria-hidden','true');
  svg.style.width = '20px'; svg.style.height = '20px'; svg.style.flexShrink = '0';
  const path = document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d', 'M85.8115 33.3333V41.6667C85.8115 44.512 85.2078 47.3294 84.0349 49.9581C82.8621 52.5869 81.1429 54.9754 78.9757 56.9873C76.8085 58.9992 74.2357 60.5952 71.4041 61.6841C68.5725 62.7729 65.5376 63.3333 62.4728 63.3333H53.4963V80H46.3152V56.6667L46.3834 53.3333C46.8356 47.8915 49.4835 42.8086 53.7978 39.1007C58.112 35.3928 63.7747 33.3331 69.6539 33.3333H85.8115ZM28.3623 20C33.6381 20.0004 38.7803 21.5411 43.0609 24.4042C47.3415 27.2672 50.5438 31.3075 52.2145 35.9533C49.4669 38.1149 47.2159 40.7675 45.5954 43.7533C43.975 46.7391 43.0182 49.9971 42.782 53.3333H39.134C32.4681 53.3333 26.0751 50.875 21.3616 46.4992C16.648 42.1233 14 36.1884 14 30V20H28.3623Z');
  path.setAttribute('fill','currentColor');
  path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round');
  svg.append(path); return svg;
}
