window.__ModuleLoader__.load({
  id: "dsh-ponytail",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    /* Der Chip sitzt in derselben Reihe wie die Zugriffsauswahl ("Workspace
       Write" / "Full access") und kopiert deren Maße, damit die Reihe ruhig
       bleibt: 28px hoch, 24px Radius, 13px Schrift, dieselben Theme-Aliase.
       Nur der Zustandspunkt ist eine eigene Farbe — er muss auf einen Blick
       lesbar sein, und dafür führt das Theme keinen Alias. */
    const CSS = `
      .pt-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:none;
        border-radius:24px;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);
        font:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer;white-space:nowrap}
      .pt-chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
      .pt-chip:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
      .pt-chip:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
      .pt-chip[data-state="on"]{color:var(--dsw-alias-label-primary)}
      .pt-chip svg{flex:0 0 auto;display:block}
      .pt-dot{width:6px;height:6px;border-radius:50%;flex:none;background:#8E8E93}
      .pt-chip[data-state="on"] .pt-dot{background:var(--dsw-alias-state-success-primary)}
      .pt-state{color:var(--dsw-alias-label-caption);font-weight:400}
      .pt-chip[data-state="on"] .pt-state{color:var(--dsw-alias-label-secondary)}
      .pt-chip[data-busy="true"]{opacity:.6}
    `;

    const inject = ["slots", "connection"];

    /* Ein Pferdeschwanz, zwei Striche: mehr braucht das Zeichen nicht, und
       weniger wäre ein Punkt. currentColor, damit der Chip beide Zustände
       über die Textfarbe einfärbt. */
    const GLYPH = React.createElement(
      "svg",
      { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
      React.createElement("path", {
        d: "M6.4 1.9c1.5 0 2.6 1 2.6 2.4 0 1-.5 1.6-1.3 2.6-.8 1-1.2 1.8-1.2 3 0 1.6 1 2.7 1 3.9 0 .9-.6 1.5-1.5 1.5S4.4 14.6 4.4 13c0-1.4.7-2.4 1.6-3.6.9-1.2 1.3-2 1.3-3.1 0-.8-.4-1.3-1-1.3-.5 0-.8.3-.9.8l-1.9-.5C3.8 3 4.9 1.9 6.4 1.9Z",
        fill: "currentColor",
      }),
      React.createElement("path", {
        d: "M9.6 2.6h2.1l-.5 4.2h-1.6l-.5-4.2Z",
        fill: "currentColor",
      }),
    );

    /** Host-Antwort auspacken: `rpc.handle` antwortet immer {ok, value|error}. */
    async function call(rpc, endpoint, payload) {
      const res = await rpc.call("/ponytail", endpoint, payload || {});
      if (!res || res.ok !== true) {
        throw new Error(res && res.error ? res.error.message : endpoint + " nicht verfügbar");
      }
      return res.value;
    }

    /**
     * Der Schalter. Er liest seinen Zustand vom Host, nicht aus eigenem
     * Gedächtnis: eine zweite Registerkarte oder ein Slash-Kommando kann ihn
     * genauso umgelegt haben, und ein Knopf, der die Wahrheit rät, ist
     * schlimmer als keiner.
     */
    function PonytailChip(props) {
      const rpc = props.rpc;
      const [state, setState] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);

      React.useEffect(() => {
        let live = true;
        call(rpc, "status")
          .then((value) => { if (live) setState(value); })
          .catch((err) => { if (live) setError(err.message); });
        return () => { live = false; };
      }, [rpc]);

      const enabled = state ? state.enabled === true : false;
      const toggle = () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        call(rpc, "toggle")
          .then((value) => { setState(value); })
          .catch((err) => { setError(err.message); })
          .then(() => { setBusy(false); });
      };

      const title = error
        ? "Ponytail-Schalter nicht erreichbar: " + error
        : enabled
          ? "Ponytail ist an. Klicken, um ohne Ponytail zu arbeiten."
          : "Ponytail ist aus — arbeite ohne Ponytail. Klicken, um ihn einzuschalten.";

      return React.createElement(
        "button",
        {
          type: "button",
          className: "pt-chip",
          "data-state": enabled ? "on" : "off",
          "data-busy": busy ? "true" : "false",
          "aria-pressed": enabled,
          "aria-label": "Ponytail " + (enabled ? "an" : "aus"),
          title: title,
          disabled: busy,
          /* Der Fokus bleibt im Textfeld: ein Klick auf den Chip darf den
             Entwurf nicht verlassen. Dieselbe Regel wie bei den übrigen
             Composer-Knöpfen. */
          onMouseDown: (event) => { event.preventDefault(); },
          onClick: toggle,
        },
        GLYPH,
        React.createElement("span", null, "Ponytail"),
        React.createElement("span", { className: "pt-dot", "aria-hidden": true }),
        React.createElement("span", { className: "pt-state" }, enabled ? "an" : "aus"),
      );
    }

    function apply(ctx) {
      const connection = ctx.get("connection");
      if (!connection) return;
      const rpc = connection.rpc;
      if (!rpc || typeof rpc.call !== "function") return;

      const tagId = "dsh-ponytail/styles";
      if (typeof document !== "undefined" && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
        const tag = document.createElement("style");
        tag.setAttribute("data-plugin-css", tagId);
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }

      // `conversation.input.left` ist der Platz direkt hinter der Zugriffsauswahl
      // und dem Plan-Chip im Composer — genau die Reihe, in der der Chip stehen
      // soll. Der Slot gehört ui-conversation; `slots.inject` wartet, bis er
      // deklariert ist, damit die Reihenfolge der Plugins egal bleibt.
      try {
        ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
          { name: "conversation.input.left", id: "dsh-ponytail", order: 10 },
          () => React.createElement(PonytailChip, { rpc }),
        ));
      } catch (err) {
        console.warn("[ponytail] Chip nicht registrierbar:", err);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
