import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type WebWidgetRouteContext = {
    params: Promise<{
        organizationId: string
    }>
}

function escapeForScript(value: string) {
    return JSON.stringify(value)
}

function buildWidgetScript(organizationId: string) {
    return `
(function () {
  var currentScript = document.currentScript;
  if (!currentScript) return;
  if (window.__qualyWebWidgetLoaded) return;
  window.__qualyWebWidgetLoaded = true;

  var scriptUrl = new URL(currentScript.src);
  var locale = currentScript.getAttribute('data-qualy-locale') || document.documentElement.lang || 'tr';
  var title = currentScript.getAttribute('data-qualy-title') || 'Qualy';
  var subtitle = currentScript.getAttribute('data-qualy-subtitle') || (locale.toLowerCase().indexOf('tr') === 0 ? 'AI asistan' : 'AI assistant');
  var openLabel = currentScript.getAttribute('data-qualy-open-label') || (locale.toLowerCase().indexOf('tr') === 0 ? 'Soru sor' : 'Ask');
  var logoUrl = currentScript.getAttribute('data-qualy-logo-url') || '';
  var themeColor = currentScript.getAttribute('data-qualy-theme-color') || '#0f766e';
  var showLogo = currentScript.getAttribute('data-qualy-show-logo') !== '0';
  var showLauncherText = currentScript.getAttribute('data-qualy-show-launcher-text') !== '0';
  var showLauncherSubtitle = currentScript.getAttribute('data-qualy-show-launcher-subtitle') !== '0';
  var showHeaderSubtitle = currentScript.getAttribute('data-qualy-show-header-subtitle') !== '0';
  var showFooter = currentScript.getAttribute('data-qualy-show-footer') !== '0';
  var footerText = currentScript.getAttribute('data-qualy-footer-text') || '';
  var organizationId = ${escapeForScript(organizationId)};
  var iframeSrc = scriptUrl.origin + '/embed/web/' + encodeURIComponent(organizationId) +
    '?locale=' + encodeURIComponent(locale) +
    '&title=' + encodeURIComponent(title) +
    '&subtitle=' + encodeURIComponent(subtitle) +
    '&logoUrl=' + encodeURIComponent(logoUrl) +
    '&themeColor=' + encodeURIComponent(themeColor) +
    '&showLogo=' + encodeURIComponent(showLogo ? '1' : '0') +
    '&showHeaderSubtitle=' + encodeURIComponent(showHeaderSubtitle ? '1' : '0') +
    '&showFooter=' + encodeURIComponent(showFooter ? '1' : '0') +
    '&footerText=' + encodeURIComponent(footerText);
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  var root = document.createElement('div');
  root.setAttribute('data-qualy-web-widget-root', '');
  var shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;
  function appendRoot() {
    document.body.appendChild(root);
  }
  if (document.body) {
    appendRoot();
  } else {
    document.addEventListener('DOMContentLoaded', appendRoot, { once: true });
  }

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial}',
    '.qualy-widget{position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}',
    '.qualy-panel{position:fixed;right:20px;top:20px;bottom:20px;width:min(430px,calc(100vw - 40px));overflow:hidden;border:1px solid rgba(15,23,42,.12);border-radius:18px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.22);opacity:0;transform:translateY(12px) scale(.98);transform-origin:bottom right;pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
    '.qualy-widget[data-open="true"] .qualy-panel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}',
    '.qualy-frame{display:block;width:100%;height:100%;border:0;background:#fff}',
    '.qualy-launcher{display:flex;align-items:center;gap:10px;min-width:56px;height:56px;border:0;border-radius:999px;background:var(--qualy-accent);color:#fff;box-shadow:0 16px 48px rgba(15,23,42,.24);padding:0 18px 0 14px;cursor:pointer;font:600 14px/1.1 inherit;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}',
    '.qualy-widget[data-open="true"] .qualy-launcher{opacity:0;pointer-events:none;transform:scale(.96)}',
    '.qualy-launcher:hover{transform:translateY(-2px);filter:brightness(.96);box-shadow:0 20px 58px rgba(15,23,42,.28)}',
    '.qualy-mark{display:grid;place-items:center;width:34px;height:34px;overflow:hidden;border-radius:50%;background:rgba(255,255,255,.94);color:var(--qualy-accent);font-weight:800}',
    '.qualy-mark img{display:block;width:100%;height:100%;object-fit:cover}',
    '.qualy-copy{display:flex;min-width:0;flex-direction:column;align-items:flex-start;gap:2px}',
    '.qualy-title{font-size:14px;font-weight:700;white-space:nowrap}',
    '.qualy-subtitle{font-size:11px;font-weight:500;color:rgba(255,255,255,.72);white-space:nowrap}',
    '@media (max-width:520px){.qualy-widget{right:12px;bottom:12px}.qualy-panel{inset:10px;width:auto;border-radius:16px}.qualy-launcher{min-width:148px}}'
  ].join('');

  var widget = document.createElement('div');
  widget.className = 'qualy-widget';
  widget.setAttribute('data-open', 'false');
  widget.style.setProperty('--qualy-accent', /^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : '#0f766e');
  var safeTitle = escapeHtml(title);
  var safeSubtitle = escapeHtml(subtitle);
  var safeOpenLabel = escapeHtml(openLabel);
  var safeIframeSrc = escapeHtml(iframeSrc);
  var safeLogoUrl = escapeHtml(logoUrl);
  var markHtml = showLogo
    ? (safeLogoUrl ? '<span class="qualy-mark"><img src="' + safeLogoUrl + '" alt=""></span>' : '<span class="qualy-mark">Q</span>')
    : '';
  var launcherCopyHtml = showLauncherText
    ? '<span class="qualy-copy"><span class="qualy-title">' + safeOpenLabel + '</span>' + (showLauncherSubtitle ? '<span class="qualy-subtitle">' + safeSubtitle + '</span>' : '') + '</span>'
    : '';
  widget.innerHTML =
    '<div class="qualy-panel" role="dialog" aria-label="' + safeTitle + '">' +
      '<iframe class="qualy-frame" title="' + safeTitle + '" src="' + safeIframeSrc + '" allow="clipboard-write"></iframe>' +
    '</div>' +
    '<button class="qualy-launcher" type="button" aria-label="' + safeOpenLabel + '" aria-expanded="false">' +
      markHtml +
      launcherCopyHtml +
    '</button>';

  shadow.appendChild(style);
  shadow.appendChild(widget);

  var launcher = widget.querySelector('.qualy-launcher');
  function setOpen(nextOpen) {
    widget.setAttribute('data-open', nextOpen ? 'true' : 'false');
    launcher.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }
  window.addEventListener('message', function (event) {
    if (event.origin !== scriptUrl.origin) return;
    if (!event.data || event.data.type !== 'qualy-web-widget-close') return;
    setOpen(false);
  });
  launcher.addEventListener('click', function () {
    setOpen(widget.getAttribute('data-open') !== 'true');
  });
}());
`.trim()
}

export async function GET(_req: NextRequest, context: WebWidgetRouteContext) {
    const { organizationId } = await context.params

    return new NextResponse(buildWidgetScript(organizationId), {
        headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'public, max-age=300',
        },
    })
}
