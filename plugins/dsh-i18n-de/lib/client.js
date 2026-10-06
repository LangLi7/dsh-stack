window.__ModuleLoader__.load({
  id: "dsh-i18n-de",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const inject = ["slots", "connection"];

    /* Row metrics mirror the Host's General-section rows (figma 'Setting-Cell':
       pad 16/0, gap 8, hairline separator, 14/22 title, 12/18 description).
       The switch cannot reuse `--dsw-alias-button-primary-fill`: in dark mode
       that alias resolves to `neutral-bluish-50` and so does `label-primary`,
       which painted a white thumb onto a white track. The track uses the
       theme's blue accent in both themes and the thumb stays light-on-accent. */
    const CSS = `
      .i18n-de-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .i18n-de-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding-right:48px}
      .i18n-de-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary)}
      .i18n-de-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
      .i18n-de-switch{position:relative;display:inline-flex;flex:none;width:40px;height:24px;cursor:pointer}
      .i18n-de-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:inherit}
      .i18n-de-track{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-active);transition:background .18s ease}
      .i18n-de-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--dsw-static-neutral-00);box-shadow:0 1px 2px rgba(0,0,0,.24);transition:transform .18s ease}
      .i18n-de-switch input:checked ~ .i18n-de-track{background:var(--dsw-alias-button-info-fill)}
      .i18n-de-switch input:checked ~ .i18n-de-thumb{transform:translateX(16px)}
      .i18n-de-switch input:focus-visible ~ .i18n-de-track{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .i18n-de-switch input:disabled{cursor:default}
      .i18n-de-switch input:disabled ~ .i18n-de-track{opacity:.5}
    `;

    const TITLE = 'Deutsche Tool-Texte';
    const DESCRIPTION = 'Übersetzt englische Markierungen in Tool-Ergebnissen ins Deutsche';

    function ToggleRow(props) {
      const api = props.api;
      const [enabled, setEnabled] = React.useState(true);
      const [loaded, setLoaded] = React.useState(false);

      React.useEffect(() => {
        api.settings.describe({}).then((res) => {
          if (res && res.result && res.result.ok) {
            const ns = (res.result.value.namespaces || []).find((n) => n.ns === 'dsh-i18n-de');
            if (ns && typeof ns.value.enabled === 'boolean') setEnabled(ns.value.enabled);
          }
          setLoaded(true);
        }).catch(() => setLoaded(true));
      }, [api]);

      const toggle = (e) => {
        const next = e.target.checked;
        setEnabled(next);
        api.settings.update({ ns: 'dsh-i18n-de', patch: { enabled: next } }).catch(() => {
          setEnabled(!next);
        });
      };

      return React.createElement('div', { className: 'i18n-de-row' },
        React.createElement('div', { className: 'i18n-de-text' },
          React.createElement('div', { className: 'i18n-de-title' }, TITLE),
          React.createElement('div', { className: 'i18n-de-desc' }, DESCRIPTION)
        ),
        React.createElement('label', { className: 'i18n-de-switch' },
          React.createElement('input', {
            type: 'checkbox',
            checked: enabled,
            disabled: !loaded,
            'aria-label': TITLE,
            onChange: toggle,
          }),
          React.createElement('span', { className: 'i18n-de-track' }),
          React.createElement('span', { className: 'i18n-de-thumb' })
        )
      );
    }

    function apply(ctx) {
      const connection = ctx.get('connection');
      if (!connection || !connection.api) return;
      const api = connection.api;

      const tagId = 'dsh-i18n-de/styles';
      if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
        const tag = document.createElement('style');
        tag.setAttribute('data-plugin-css', tagId);
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }

      ctx.slots.inject('settings.general.item', () => ctx.slots.register(
        { name: 'settings.general.item', id: 'dsh-i18n-de', order: 60 },
        () => React.createElement(ToggleRow, { api }),
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
