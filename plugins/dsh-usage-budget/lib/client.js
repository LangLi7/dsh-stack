window.__ModuleLoader__.load({
  id: "dsh-usage-budget",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const inject = ["slots", "connection"];

    /* Farben und Maße folgen dem Harness-Theme: alle Flächen, Rahmen und Texte
       sind Theme-Aliase (--dsw-*), damit die Anzeige in Dark und Light
       konsistent bleibt. Nur die semantischen Akzente des Diagramms und der
       Warnbanner sind literal, weil das Theme dafür keine eigenen Aliase
       führt; sie sind aus der Akzentfamilie abgeleitet und funktionieren auf
       beiden Hintergründen. */
    const CSS = `
      /* ── Hover-Anzeige unten rechts ────────────────────────────────────── */
      /* Bewusst NICHT oben rechts: dort liegt der "Session log"-Button des
         Harness. Die Anzeige sitzt unten rechts und deckt nichts ab. */
      .ub-root{position:fixed;bottom:66px;right:18px;z-index:5;font-size:12px;color:var(--dsw-alias-label-primary)}
      .ub-rail{position:fixed;bottom:18px;right:18px;z-index:5;display:flex;align-items:center;gap:6px}
      .ub-mini{width:28px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);cursor:pointer;
        color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.18)}
      .ub-mini:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
      .ub-pill{display:flex;align-items:center;gap:8px;height:28px;padding:0 10px;border-radius:999px;
        background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);cursor:default;
        box-shadow:0 2px 8px rgba(0,0,0,.18);pointer-events:auto;user-select:none;white-space:nowrap}
      .ub-pill:hover{border-color:var(--dsw-alias-border-l1)}
      .ub-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}
      .ub-dot.warn{background:#E0A33C}
      .ub-dot.over{background:#E5484D}
      /* Grauer Punkt = keine Verbindung: Die Werte stammen dann vom letzten
         erfolgreichen Abruf. */
      .ub-dot.unknown{background:#8E8E93}
      /* Stiller Ladezustand: Die Anzeige wird beim Aktualisieren nur leicht
         gedimmt. Ein Spinner oder ein Ausblenden würde flackern. */
      .ub-pill,.ub-card{transition:opacity .18s ease}
      .ub-pill.is-refreshing{opacity:.72}
      .ub-card.is-refreshing{opacity:.9}
      .ub-pill-spend{font-weight:600;font-variant-numeric:tabular-nums}
      .ub-pill-sep{width:1px;height:14px;background:var(--dsw-alias-border-l2);flex:none}
      .ub-pill-sub{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .ub-card{position:fixed;bottom:60px;right:18px;width:340px;max-height:calc(100vh - 90px);overflow:auto;
        background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;
        box-shadow:0 8px 28px rgba(0,0,0,.28);padding:14px;pointer-events:auto;display:flex;flex-direction:column;gap:12px}
      .ub-x{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;
        font-size:14px;line-height:1;padding:0 2px}
      .ub-x:hover{color:var(--dsw-alias-label-primary)}
      .ub-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .ub-title{font-size:13px;font-weight:600}
      .ub-muted{color:var(--dsw-alias-label-secondary);font-size:11px}
      .ub-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ub-cell{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
      .ub-cell-k{color:var(--dsw-alias-label-secondary);font-size:10.5px}
      .ub-cell-v{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
      .ub-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .ub-row:last-child{border-bottom:none}
      .ub-row-name{display:flex;flex-direction:column;gap:1px;min-width:0}
      .ub-row-id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ub-row-cost{font-variant-numeric:tabular-nums;flex:none;font-weight:600}
      .ub-bar{height:4px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden;margin-top:5px}
      .ub-bar > i{display:block;height:100%;background:var(--dsw-alias-state-success-primary)}
      .ub-bar.warn > i{background:#E0A33C}
      .ub-bar.over > i{background:#E5484D}
      .ub-warn{background:rgba(224,163,60,.14);border:1px solid rgba(224,163,60,.4);border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.45}
      .ub-over{background:rgba(229,72,77,.14);border:1px solid rgba(229,72,77,.42);border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.45}
      .ub-sec{display:flex;flex-direction:column;gap:2px}
      .ub-sec-h{color:var(--dsw-alias-label-secondary);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
      .ub-empty{color:var(--dsw-alias-label-secondary);font-size:11px;padding:6px 0}

      /* ── Usage-Seite in den Einstellungen ─────────────────────────────── */
      .ubp{display:flex;flex-direction:column;gap:20px;padding:4px 0 32px;font-size:13px;max-width:900px}
      .ubp-h1{font-size:24px;font-weight:700;line-height:1.2;color:var(--dsw-alias-label-primary)}
      .ubp-sub{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:6px}
      .ubp-info{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;
        border:1px solid currentColor;font-size:9px;line-height:1;flex:none;opacity:.8;cursor:help}
      .ubp-notice{display:flex;align-items:center;gap:12px;background:rgba(56,120,235,.16);
        border:1px solid rgba(56,120,235,.42);border-radius:8px;padding:9px 12px 9px 14px}
      .ubp-notice-t{flex:1;font-size:12px;line-height:1.5;color:#BFD6FF}
      .ubp-notice-b{flex:none;border:none;border-radius:999px;padding:5px 14px;background:#CFE0FF;color:#0A1B33;
        font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
      .ubp-notice-b:hover{background:#E2ECFF}
      /* Karten stapeln sich, sobald die Breite nicht reicht. Ein festes
         Zwei-Spalten-Raster schnitt die zweite Karte am rechten Rand ab,
         statt sie untereinander zu setzen. */
      .ubp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
      .ubp-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;
        padding:14px 16px;min-height:76px;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
      /* Beide Zeilen dürfen umbrechen, statt den Inhalt zu quetschen. */
      .ubp-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:18px;flex-wrap:wrap}
      /* Beschriftungen bleiben einzeilig — „Topped-up balance" brach sonst mitten
         im Wort auf zwei Zeilen um. */
      .ubp-card-k{display:flex;align-items:center;gap:5px;font-size:14px;font-weight:600;white-space:nowrap;color:var(--dsw-alias-label-primary)}
      .ubp-card-bot{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .ubp-val{display:flex;align-items:baseline;gap:6px}
      /* Der Betrag schrumpft mit der Breite, statt die Karte zu sprengen. */
      .ubp-val-n{font-size:clamp(24px,3.2vw,30px);font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
      .ubp-val-u{font-size:13px;color:var(--dsw-alias-label-secondary)}
      .ubp-alert{display:flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap;color:var(--dsw-alias-state-success-primary)}
      .ubp-alert.off{color:var(--dsw-alias-label-secondary)}
      .ubp-check{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;
        background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base);font-size:9px;line-height:1;flex:none}
      .ubp-link{color:var(--dsw-alias-label-secondary);text-decoration:underline;cursor:pointer;background:none;border:none;padding:0;font:inherit}
      .ubp-link:hover{color:var(--dsw-alias-label-primary)}
      /* Regler für die Aktualisierungsrate: beschriftete Auswahl in Pillenform,
         damit er neben „Refresh" und „Top up" ruhig wirkt und die Karte nicht
         sprengt. */
      .ubp-interval{display:inline-flex;align-items:center;gap:6px;font-size:12px;
        color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .ubp-interval select{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
        border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:5px 8px;
        font:inherit;font-size:12px;cursor:pointer}
      .ubp-btn{flex:none;border:none;border-radius:999px;padding:7px 16px;background:var(--dsw-alias-label-primary);
        color:var(--dsw-alias-bg-base);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
      .ubp-btn:hover{opacity:.88}
      .ubp-btn.ghost{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-weight:500}
      .ubp-btn.ghost:hover{background:var(--dsw-alias-bg-layer-2);opacity:1}
      .ubp-hr{height:1px;background:var(--dsw-alias-border-l1);margin:4px 0}
      .ubp-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .ubp-pill{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px;border-radius:999px;
        background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);cursor:pointer;font:inherit;
        color:var(--dsw-alias-label-primary);white-space:nowrap}
      .ubp-pill:hover{border-color:var(--dsw-alias-border-l1)}
      .ubp-pill-k{color:var(--dsw-alias-label-secondary);font-size:12px}
      .ubp-pill-v{font-size:12px;font-weight:500}
      .ubp-caret{color:var(--dsw-alias-label-secondary);font-size:9px}
      .ubp-spacer{flex:1}
      .ubp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      .ubp-kpi{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;
        padding:14px 16px;display:flex;flex-direction:column;gap:6px}
      .ubp-kpi-k{font-size:14px;font-weight:600}
      .ubp-kpi-v{display:flex;align-items:baseline;gap:5px}
      .ubp-kpi-n{font-size:28px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
      .ubp-chart-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px 20px 16px}
      .ubp-chart-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
      .ubp-chart-t{display:flex;align-items:baseline;gap:8px}
      .ubp-chart-title{font-size:15px;font-weight:600}
      .ubp-chart-total{font-size:15px;font-weight:600;color:var(--dsw-alias-label-secondary)}
      .ubp-seg{display:inline-flex;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);
        border-radius:999px;padding:2px;gap:2px}
      .ubp-seg button{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;
        padding:5px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}
      .ubp-seg button.on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600}
      .ubp-plot{display:flex;gap:8px}
      .ubp-yaxis{display:flex;flex-direction:column;justify-content:space-between;height:200px;width:46px;flex:none;
        text-align:right;color:var(--dsw-alias-label-secondary);font-size:10px;font-variant-numeric:tabular-nums}
      .ubp-plot-in{flex:1;min-width:0;position:relative}
      .ubp-grid{position:absolute;inset:0 0 0 0;height:200px;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
      .ubp-grid > i{display:block;height:1px;background:var(--dsw-alias-border-l1);opacity:.55}
      .ubp-bars{position:relative;display:flex;align-items:flex-end;gap:3px;height:200px}
      .ubp-bars > div{flex:1;min-width:1px;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;gap:0}
      .ubp-bars > div > i{display:block;width:100%}
      .ubp-seg-a{background:#F0A33C}
      .ubp-seg-b{background:#FFD08A}
      .ubp-seg-c{background:#B4761F}
      .ubp-seg-d{background:#8A5A16}
      .ubp-xaxis{display:flex;justify-content:space-between;margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:10px}
      .ubp-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:11px}
      .ubp-legend > span{display:inline-flex;align-items:center;gap:5px}
      .ubp-legend i{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none}
      /* Feste Spaltenbreiten: Die Tabelle darf ihre Karte nicht sprengen. Der
         Modellname bekommt den größten Anteil und wird bei Bedarf gekürzt; die
         Zahlenspalten bleiben schmal, weil die Werte kompakt formatiert sind
         (12,86M statt 12.864.616). */
      .ubp-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
      .ubp-table .ubp-col-name{width:31%}
      .ubp-table .ubp-col-num{width:11.5%}
      .ubp-table th{text-align:right;color:var(--dsw-alias-label-secondary);font-weight:500;padding:6px;
        border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ubp-table th:first-child,.ubp-table td:first-child{text-align:left}
      .ubp-table td{text-align:right;padding:7px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);
        font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ubp-table tr:last-child td{border-bottom:none}
      .ubp-table-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      /* Sicherheitsnetz: Muss doch etwas breiter werden, scrollt nur die Tabelle
         und nicht die ganze Seite. */
      .ubp-table-wrap{overflow-x:auto}
      .ubp-foot{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.6}
    `;

    /** Ein US-Dollar-Betrag mit sinnvoller Genauigkeit. */
    function usd(n) {
      const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
      // Sehr kleine Beträge brauchen mehr Stellen, sonst steht dort überall $0.00.
      if (value > 0 && value < 0.01) return "$" + value.toFixed(4);
      return "$" + value.toFixed(2);
    }

    /** Große Zahlen kurz darstellen (1.2M, 45.3K). */
    function compact(n) {
      const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
      if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
      if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
      if (value >= 1e3) return (value / 1e3).toFixed(1) + "K";
      return String(Math.round(value));
    }

    /** Ganze Zahl mit Tausendertrennzeichen (wie in der Vorlage). */
    function group(n) {
      const value = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
      return value.toLocaleString("en-US");
    }

    /** Zustandsklasse einer Budget-Zeile: normal, Warnung oder überschritten. */
    function stateClass(status) {
      if (!status) return "";
      if (status.exceeded) return "over";
      if (status.warn) return "warn";
      return "";
    }

    /** Daten des Host-Plugins holen. */
    async function call(rpc, endpoint, payload) {
      const res = await rpc.call("/usage-budget", endpoint, payload || {});
      if (!res || res.ok !== true) {
        throw new Error(res && res.error ? res.error.message : endpoint + " nicht verfügbar");
      }
      return res.value;
    }

    /** Warnungen aus einer Übersicht ableiten. */
    function alerts(summary) {
      const out = [];
      const total = summary.totalStatus;
      if (total && total.limitUsd !== null && total.exceeded) {
        out.push({ kind: "over", text: "Gesamtbudget überschritten: " + usd(total.spentUsd) + " von " + usd(total.limitUsd) });
      } else if (total && total.warn) {
        out.push({ kind: "warn", text: "Gesamtbudget zu " + Math.round(total.usedPercent) + "% verbraucht" });
      }
      for (const s of summary.keyStatus || []) {
        if (s.limitUsd === null || (!s.warn && !s.exceeded)) continue;
        out.push({
          kind: s.exceeded ? "over" : "warn",
          text: s.label + ": " + Math.round(s.usedPercent) + "% von " + usd(s.limitUsd) + " verbraucht",
        });
      }
      if (summary.unpricedShare > 0) {
        out.push({ kind: "warn", text: Math.round(summary.unpricedShare * 100) + "% der Aufrufe ohne bekannten Preis" });
      }
      if (summary.pricing && summary.pricing.models === 0) {
        out.push({ kind: "warn", text: "Preiskatalog nicht geladen (" + (summary.pricing.source || "unbekannt") + ")" });
      }
      return out;
    }

    /**
     * Die Guthaben-Summe benennen: aus welchen Anbietern sie sich bildet.
     *
     * Die Kachel zeigt die Summe mehrerer Anbieter. Ohne diese Angabe wirkt der
     * Wert falsch, weil er mit dem Guthaben keiner einzelnen Konsole
     * übereinstimmt — DeepSeek zeigt nur seinen eigenen Anteil.
     * @param {object} summary Übersicht des Hosts.
     * @returns {string} Aufstellung wie „DEEPSEEK_API_KEY $2.95 + OPENROUTER_API_KEY $0.35".
     */
    function balanceComposition(summary) {
      const rows = (summary.keyStatus || []).filter(s => s.balanceUsd !== null);
      if (rows.length === 0) return "kein Anbieter meldet ein Guthaben";
      return rows.map(s => s.label + " " + usd(s.balanceUsd)).join(" + ");
    }

    /** Eine Budget-Zeile mit Fortschrittsbalken. */
    function StatusRow(props) {
      const s = props.status;
      const pct = s.usedPercent === null ? 0 : Math.min(100, Math.max(0, s.usedPercent));
      const cls = stateClass(s);
      const parts = [];
      // Eigenes Budget und Anbieter-Limit werden benannt: Beide können
      // gleichzeitig gelten, und nur so ist erkennbar, wer das Limit gesetzt hat.
      if (s.limitUsd !== null) {
        parts.push(Math.round(s.usedPercent) + "% von " + usd(s.limitUsd)
          + (s.limitSource === "provider" ? " (Anbieter-Limit)" : ""));
      }
      if (s.remainingUsd !== null) parts.push("Rest " + usd(s.remainingUsd));
      if (s.balanceUsd !== null) parts.push("Guthaben " + usd(s.balanceUsd) + (s.balanceSource === "manual" ? " (manuell)" : ""));
      // Der Anbieter meldet seinen eigenen Verbrauch: belastbarer als unsere
      // Rechnung, weil er aus dessen Abrechnung stammt.
      if (s.providerUsageUsd !== null) parts.push("Anbieter: " + usd(s.providerUsageUsd) + " genutzt");
      if (s.limitUsd === null && s.balanceUsd === null && s.providerUsageUsd === null) parts.push("kein Limit gesetzt");
      return React.createElement("div", { className: "ub-sec" },
        React.createElement("div", { className: "ub-row" },
          React.createElement("div", { className: "ub-row-name" },
            React.createElement("span", { className: "ub-row-id" }, s.label),
            React.createElement("span", { className: "ub-muted" }, parts.join(" · "))
          ),
          React.createElement("span", { className: "ub-row-cost" }, usd(s.spentUsd))
        ),
        s.limitUsd !== null
          ? React.createElement("div", { className: "ub-bar " + cls },
              React.createElement("i", { style: { width: pct + "%" } }))
          : null
      );
    }

    /* ── Auslöser „Änderung" ────────────────────────────────────────────────
       Der Takt aktualisiert nach Uhr. DSH streamt aber bereits
       Session-Ereignisse in den Browser (`events.mux` liefert Frames vom Typ
       `session/event`). Ein abgeschlossener Modellaufruf bedeutet: Es gibt
       neuen Verbrauch — dann laden wir sofort nach, statt bis zum nächsten
       Takt zu warten. Fehlt der Stream, bleibt der Takt als Rückfall. */
    const changeListeners = new Set()
    let notifyTimer = null

    /**
     * Alle Ansichten zum sofortigen Nachladen auffordern.
     * Mehrere Ereignisse kurz hintereinander werden gebündelt, damit ein
     * laufender Modellaufruf nicht viele Abfragen auslöst.
     */
    function notifyChange() {
      if (notifyTimer !== null) return
      notifyTimer = setTimeout(() => {
        notifyTimer = null
        for (const listener of changeListeners) {
          try {
            listener()
          } catch {
            // Eine Ansicht darf die andere nicht mitreißen.
          }
        }
      }, 400)
    }

    /**
     * Auf Session-Ereignisse hören und bei neuem Verbrauch sofort nachladen.
     * @param {object} connection Verbindungs-Handle mit `api.events`.
     */
    async function watchSessionEvents(connection) {
      const events = connection.api && connection.api.events
      if (!events || typeof events.mux !== "function") return
      const controller = new AbortController()
      try {
        for await (const message of events.mux({}, controller.signal)) {
          const frame = message && message.payload ? message.payload : message
          if (!frame || frame.type !== "session/event" || !frame.event) continue
          const kind = frame.event.type
          // Der fertige Aufruf trägt den Verbrauch …
          if (kind === "assistant/message") { notifyChange(); continue }
          // … der Verbrauchs-Chunk kommt früher an: schon dann nachladen, damit
          // die Zahl auch während eines langen Aufrufs nicht veraltet steht.
          const chunk = frame.event.data && frame.event.data.chunk
          if (kind === "assistant/chunk" && chunk && chunk.type === "usage") notifyChange()
        }
      } catch {
        // Stream nicht verfügbar oder beendet: Der Takt übernimmt.
      }
    }

    /* ── Aktualisierungsrate ────────────────────────────────────────────────
       Einstellbar statt fest: Mit 60 s war die Anzeige zu träge. Der Wert gilt
       für beide Ansichten und wird im Browser gemerkt; zusätzlich bekommt der
       Host ihn, damit er das Guthaben ebenso oft abfragt. 0 = nur manuell. */
    const REFRESH_KEY = "dsh-usage-budget.refreshSeconds"
    const REFRESH_OPTIONS = [5, 10, 15, 30, 60, 300, 0]
    const REFRESH_DEFAULT = 60

    /**
     * Gemerkte Rate lesen.
     * Unbekannte oder unsinnige Werte fallen auf den Standard zurück, damit eine
     * verstellte Ablage die Anzeige nicht lahmlegt. Wichtig: `getItem` liefert
     * bei fehlendem Eintrag `null`, und `Number(null)` ist 0 — ohne die
     * ausdrückliche Prüfung läse sich "nicht gesetzt" als "Aus".
     * @returns {number} Sekunden; 0 = nur manuell.
     */
    function readRefreshSeconds() {
      try {
        const raw = window.localStorage.getItem(REFRESH_KEY)
        if (raw === null) return REFRESH_DEFAULT
        const value = Number(raw)
        return REFRESH_OPTIONS.includes(value) ? value : REFRESH_DEFAULT
      } catch {
        return REFRESH_DEFAULT
      }
    }

    let refreshSeconds = readRefreshSeconds()
    const refreshListeners = new Set()

    /**
     * Rate setzen: merken und beide Ansichten sofort umstellen, damit kein
     * Neuladen nötig ist.
     * @param {number} seconds Sekunden; 0 = nur manuell.
     */
    function setRefreshSeconds(seconds) {
      refreshSeconds = seconds
      try {
        window.localStorage.setItem(REFRESH_KEY, String(seconds))
      } catch {
        // Ohne Speicher gilt die Wahl nur für diese Sitzung.
      }
      for (const listener of refreshListeners) {
        try {
          listener(seconds)
        } catch {
          // Eine Ansicht darf die andere nicht mitreißen.
        }
      }
    }

    /**
     * Beschriftung eines Werts für die Auswahl.
     * @param {number} seconds Sekunden; 0 = aus.
     * @returns {string} Text.
     */
    function refreshLabel(seconds) {
      if (seconds === 0) return "Aus"
      return seconds < 60 ? seconds + " s" : (seconds / 60) + " min"
    }

    /** Hover-Anzeige rechts oben: kompakt, klappt bei Bedarf auf. */
    function HoverBadge(props) {
      const rpc = props.rpc;
      const [summary, setSummary] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [open, setOpen] = React.useState(false);
      // Einklappbar: Wer die Anzeige nicht dauerhaft sehen will, blendet sie auf
      // einen kleinen Knopf zurück. Die Wahl bleibt im Browser gespeichert.
      const [collapsed, setCollapsed] = React.useState(() => {
        try { return window.localStorage.getItem("dsh-usage-budget.collapsed") === "1" } catch { return false }
      });

      const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        setOpen(false);
        try { window.localStorage.setItem("dsh-usage-budget.collapsed", next ? "1" : "0") } catch { /* ohne Speicher weiter */ }
      };

      // Laufende Anfrage und dezenter Ladezustand: Der Takt kann kürzer sein als
      // eine Antwort, und ein zweiter Lauf würde den ersten nur überholen.
      const inflight = React.useRef(false);
      const [refreshing, setRefreshing] = React.useState(false);

      const load = React.useCallback(() => {
        if (inflight.current) return;
        inflight.current = true;
        setRefreshing(true);
        call(rpc, "summary").then((value) => {
          setSummary(value);
          setError(null);
        }).catch((err) => {
          // Den letzten guten Wert stehen lassen; der nächste Takt versucht es
          // erneut. Ein Fehler darf die Anzeige nicht leeren.
          setError(err.message);
        }).finally(() => {
          inflight.current = false;
          setRefreshing(false);
        });
      }, [rpc]);

      React.useEffect(() => {
        load();
        // Im Hintergrund drosselt der Browser Timer auf etwa einen Lauf pro
        // Minute. Deshalb dort pausieren und beim Zurückkehren sofort laden —
        // so steht nach einem Tab-Wechsel oder nach "Top up" nie ein alter Wert.
        // Kurzer Prüftakt statt fester Abstand: Der wirksame Abstand kommt aus
        // `refreshSeconds` und wird bei jedem Takt neu gelesen. Dadurch greift
        // eine Änderung der Rate sofort, ohne die Ansicht neu aufzubauen, und
        // „Aus" (0) hält den Takt an. Ein Takt ohne fälligen Lauf kostet nur
        // einen Zahlenvergleich.
        let lastRun = 0;
        const timer = setInterval(() => {
          if (document.hidden) return
          if (refreshSeconds === 0) return
          if (Date.now() - lastRun < refreshSeconds * 1000) return
          lastRun = Date.now()
          load()
        }, 1000);
        const onVisible = () => { if (!document.hidden) load(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        // Zusätzlich auf Änderungen hören: Ein abgeschlossener Modellaufruf löst
        // ein sofortiges Nachladen aus (siehe watchSessionEvents).
        changeListeners.add(load);
        return () => {
          changeListeners.delete(load);
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
          window.removeEventListener("focus", onVisible);
        };
      }, [load]);

      const total = summary ? summary.totalStatus : null;
      const list = summary ? alerts(summary) : [];
      // Sichtbar bleibt, was eine Aussage hat: Verbrauch über 0, ein bekanntes
      // Guthaben oder ein Limit. Rein leere Zeilen ($0.00, kein Limit, kein
      // Guthaben) verschwinden.
      // Zeilen mit Guthaben MÜSSEN sichtbar bleiben, weil die Summenkachel sie
      // mitzählt — sonst wirkt die Summe falsch, weil ihre Herkunft fehlt.
      const keysWithSpend = summary
        ? summary.keyStatus.filter(s => s.spentUsd > 0 || s.balanceUsd !== null || s.limitUsd !== null)
        : [];
      // Der Punkt zeigt, wie verlässlich die Werte sind: grün = aktuell
      // abgerufen, gelb/rot = Budgetwarnung, grau = keine Verbindung (die Werte
      // stammen dann vom letzten erfolgreichen Abruf).
      const worst = (error && !summary) ? "unknown"
        : list.some(a => a.kind === "over") ? "over"
          : (list.length > 0 ? "warn" : "");

      // Eingeklappt: nur ein kleiner Knopf, der die Anzeige zurückholt.
      if (collapsed) {
        return React.createElement("div", { className: "ub-rail" },
          React.createElement("button", {
            className: "ub-mini",
            title: "Kosten & Budget einblenden",
            onClick: toggleCollapsed,
          }, React.createElement("span", { className: "ub-dot " + worst }))
        );
      }

      const pill = React.createElement("div", {
        className: "ub-pill" + (refreshing ? " is-refreshing" : ""),
        title: refreshing ? "Wird aktualisiert…" : undefined,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
      },
        React.createElement("span", { className: "ub-dot " + worst }),
        React.createElement("span", { className: "ub-pill-spend" }, summary ? usd(summary.totalCostUsd) : error ? "–" : "…"),
        summary && total && total.limitUsd !== null
          ? React.createElement("span", { className: "ub-pill-sub" },
              "/ " + usd(total.limitUsd) + (total.remainingUsd !== null ? " · Rest " + usd(total.remainingUsd) : ""))
          : null,
        summary && total && total.balanceUsd !== null
          ? React.createElement(React.Fragment, null,
              React.createElement("span", { className: "ub-pill-sep" }),
              React.createElement("span", { className: "ub-pill-sub" }, "Guthaben " + usd(total.balanceUsd)))
          : null
      );

      if (!open) return React.createElement("div", { className: "ub-root" }, pill);

      return React.createElement("div", { className: "ub-root" },
        pill,
        React.createElement("div", {
          className: "ub-card" + (refreshing ? " is-refreshing" : ""),
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
        },
          React.createElement("div", { className: "ub-head" },
            React.createElement("span", { className: "ub-title" }, "Kosten & Budget"),
            React.createElement("span", { className: "ub-muted" }, summary ? "letzte " + summary.windowDays + " Tage" : "")
          ),
          error ? React.createElement("div", { className: "ub-warn" }, "Nicht verfügbar: " + error) : null,
          list.map((a, i) => React.createElement("div", { key: i, className: a.kind === "over" ? "ub-over" : "ub-warn" }, a.text)),
          summary
            ? React.createElement("div", { className: "ub-grid" },
                React.createElement("div", { className: "ub-cell" },
                  React.createElement("span", { className: "ub-cell-k" }, "Kosten"),
                  React.createElement("span", { className: "ub-cell-v" }, usd(summary.totalCostUsd))
                ),
                React.createElement("div", { className: "ub-cell" },
                  React.createElement("span", { className: "ub-cell-k" },
                    total && total.balanceUsd !== null ? "Guthaben" : "Restbudget"),
                  React.createElement("span", { className: "ub-cell-v" },
                    total && total.balanceUsd !== null ? usd(total.balanceUsd)
                      : total && total.remainingUsd !== null ? usd(total.remainingUsd) : "–")
                ),
                React.createElement("div", { className: "ub-cell" },
                  React.createElement("span", { className: "ub-cell-k" }, "Anfragen"),
                  React.createElement("span", { className: "ub-cell-v" }, group(summary.requests))
                ),
                React.createElement("div", { className: "ub-cell" },
                  React.createElement("span", { className: "ub-cell-k" }, "Tokens"),
                  React.createElement("span", { className: "ub-cell-v" }, compact(summary.totalTokens))
                )
              )
            : null,
          // Bedingung und Liste nutzen denselben gefilterten Bestand: Sonst
          // bliebe die Überschrift „Nach API-Key" ohne Zeilen stehen.
          keysWithSpend.length > 0
            ? React.createElement("div", { className: "ub-sec" },
                React.createElement("span", { className: "ub-sec-h" }, "Nach API-Key"),
                keysWithSpend.map(s => React.createElement(StatusRow, { key: s.id, status: s }))
              )
            : null,
          summary && summary.byModel && summary.byModel.length > 0
            ? React.createElement("div", { className: "ub-sec" },
                React.createElement("span", { className: "ub-sec-h" }, "Nach Modell"),
                summary.byModel.slice(0, 5).map(m =>
                  React.createElement("div", { className: "ub-row", key: m.id },
                    React.createElement("div", { className: "ub-row-name" },
                      React.createElement("span", { className: "ub-row-id" }, m.label),
                      React.createElement("span", { className: "ub-muted" },
                        group(m.requests) + " Anfragen · " + compact(m.totalTokens) + " Tokens")
                    ),
                    React.createElement("span", { className: "ub-row-cost" }, usd(m.cost))
                  ))
              )
            : null,
          summary && summary.pricing
            ? React.createElement("div", { className: "ub-muted" },
                "Preise: " + summary.pricing.source + " (" + group(summary.pricing.models) + " Modelle)")
            : null
        )
      );
    }

    /** Segmentfarben für das gestapelte Diagramm. */
    const SEGMENTS = [
      { key: "input", label: "Input", cls: "ubp-seg-a" },
      { key: "output", label: "Output", cls: "ubp-seg-b" },
      { key: "cacheRead", label: "Cache-Treffer", cls: "ubp-seg-c" },
      { key: "cacheWrite", label: "Cache-Schreiben", cls: "ubp-seg-d" },
    ];

    /** Gestapeltes Balkendiagramm der Tageskosten. */
    function CostChart(props) {
      const series = props.series;
      const days = series && series.days ? series.days : [];
      const max = days.reduce((m, d) => Math.max(m, d.cost || 0), 0);
      if (max <= 0) {
        return React.createElement("div", { className: "ub-empty" },
          "Noch keine Kosten im Zeitraum erfasst. Sobald Modellaufrufe stattfinden, erscheint hier der Verlauf.");
      }
      // Vier Y-Achsen-Beschriftungen von 0 bis zum Maximum.
      const ticks = [1, 0.66, 0.33, 0].map(f => usd(max * f));
      const bars = days.map((d, i) => {
        const total = d.cost || 0;
        const height = Math.max(2, Math.round((total / max) * 200));
        const stack = [];
        for (const seg of SEGMENTS) {
          // Anteil dieses Segments an den Tageskosten bestimmt die Höhe; die
          // Summe der Gruppen liefert die Aufteilung.
          let value = 0;
          for (const g of Object.values(d.groups || {})) value += g[seg.key] || 0;
          if (value <= 0) continue;
          const h = Math.max(1, Math.round((value / total) * height));
          stack.push(React.createElement("i", { key: seg.key, className: seg.cls, style: { height: h + "px" } }));
        }
        // Aufrunden, damit die Summe der Segmente die Balkenhöhe trifft.
        const used = stack.reduce((acc, el) => acc + parseInt(el.props.style.height, 10), 0);
        if (used < height) {
          stack.unshift(React.createElement("i", {
            key: "fill", className: "ubp-seg-a", style: { height: (height - used) + "px" },
          }));
        }
        const label = d.day.slice(5);
        return React.createElement("div", { key: d.day + i, title: d.day + ": " + usd(total) + " · " + group(d.requests) + " Anfragen" }, stack);
      });
      const first = days.length > 0 ? days[0].day.slice(5) : "";
      const last = days.length > 0 ? days[days.length - 1].day.slice(5) : "";
      return React.createElement("div", null,
        React.createElement("div", { className: "ubp-plot" },
          React.createElement("div", { className: "ubp-yaxis" }, ticks.map((t, i) => React.createElement("span", { key: i }, t))),
          React.createElement("div", { className: "ubp-plot-in" },
            React.createElement("div", { className: "ubp-grid" },
              React.createElement("i"), React.createElement("i"), React.createElement("i"), React.createElement("i")),
            React.createElement("div", { className: "ubp-bars" }, bars)
          )
        ),
        React.createElement("div", { className: "ubp-xaxis" }, React.createElement("span", null, first), React.createElement("span", null, last)),
        React.createElement("div", { className: "ubp-legend" },
          SEGMENTS.map(seg => React.createElement("span", { key: seg.key },
            React.createElement("i", { className: seg.cls }), seg.label)),
          React.createElement("span", null,
            "Gruppierung: " + (series.groupBy === "key" ? "API-Key (" + series.groups.length + ")" : "Modell (" + series.groups.length + ")"))
        )
      );
    }

    /** Aufklappbare Auswahlliste als Filter-Chip. */
    function FilterChip(props) {
      const [open, setOpen] = React.useState(false);
      const options = props.options;
      return React.createElement("div", { style: { position: "relative" } },
        React.createElement("button", {
          className: "ubp-pill",
          onClick: () => setOpen(!open),
          "aria-expanded": open,
        },
          React.createElement("span", { className: "ubp-pill-k" }, props.label),
          React.createElement("span", { className: "ubp-pill-v" }, props.valueLabel),
          React.createElement("span", { className: "ubp-caret" }, "▼")
        ),
        open
          ? React.createElement("div", {
              style: {
                position: "absolute", top: "34px", left: 0, zIndex: 50, minWidth: "180px",
                background: "var(--dsw-alias-bg-overlay)", border: "1px solid var(--dsw-alias-border-l2)",
                borderRadius: "10px", padding: "4px", boxShadow: "0 8px 24px rgba(0,0,0,.28)",
                display: "flex", flexDirection: "column", gap: "1px", maxHeight: "280px", overflow: "auto",
              },
            },
              options.map(opt => React.createElement("button", {
                key: opt.value,
                onClick: () => { props.onSelect(opt.value); setOpen(false); },
                style: {
                  textAlign: "left", border: "none", borderRadius: "7px", padding: "7px 10px",
                  background: opt.value === props.value ? "var(--dsw-alias-bg-layer-2)" : "transparent",
                  color: "var(--dsw-alias-label-primary)", font: "inherit", cursor: "pointer",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                },
              }, opt.label))
            )
          : null
      );
    }

    /**
     * Aufladen-Knopf für den passenden Anbieter.
     *
     * Die Adressen kommen aus der Konfiguration (`topUpUrls`), nicht fest aus
     * dem Code — ein weiterer Anbieter lässt sich damit ohne Codeänderung
     * ergänzen. Angeboten werden nur Anbieter, die auch ein Guthaben melden;
     * sonst führte der Knopf zu einem Anbieter, bei dem nichts aufzuladen ist.
     * @param {object} props `config` (Adressen) und `summary` (Guthaben je Key).
     * @returns {object} Knopf, Auswahl oder Hinweis.
     */
    function TopUpButton(props) {
      const [open, setOpen] = React.useState(false);
      const urls = (props.config && props.config.topUpUrls) || {};
      // Angeboten wird ein Anbieter, wenn er ein Guthaben meldet ODER Verbrauch
      // hat. Bei Anbietern ohne lesbares Guthaben (Anthropic, Groq, ZAI …) ist
      // der Verbrauch das einzige Signal, dass sich ein Aufladen lohnt — der
      // Knopf führt dort zur Abrechnungsseite des Anbieters.
      const candidates = ((props.summary && props.summary.keyStatus) || [])
        .filter(s => (s.balanceUsd !== null || s.spentUsd > 0) && urls[s.id])
        .map(s => ({ id: s.id, label: s.label, url: urls[s.id], hasBalance: s.balanceUsd !== null }));

      if (candidates.length === 0) {
        return React.createElement("span", {
          className: "ub-muted",
          title: "Kein Anbieter mit Guthaben hat eine Auflade-Adresse. Sie lässt sich unter topUpUrls in den Einstellungen ergänzen.",
        }, "kein Aufladen möglich");
      }

      const openUrl = (url) => { window.open(url, "_blank", "noopener"); };

      if (candidates.length === 1) {
        const only = candidates[0];
        return React.createElement("button", {
          className: "ubp-btn",
          title: "Guthaben bei " + only.label + " aufladen",
          onClick: () => openUrl(only.url),
        }, "Top up");
      }

      // Mehrere Anbieter mit Guthaben: Auswahl anbieten, statt willkürlich
      // einen zu öffnen.
      return React.createElement("div", { style: { position: "relative", flex: "none" } },
        React.createElement("button", {
          className: "ubp-btn",
          title: "Guthaben aufladen – " + candidates.map(c => c.label).join(", "),
          "aria-expanded": open,
          onClick: () => setOpen(!open),
        }, "Top up"),
        open
          ? React.createElement("div", {
              style: {
                position: "absolute", bottom: "36px", right: 0, zIndex: 50, minWidth: "220px",
                background: "var(--dsw-alias-bg-overlay)", border: "1px solid var(--dsw-alias-border-l2)",
                borderRadius: "10px", padding: "4px", boxShadow: "0 8px 24px rgba(0,0,0,.28)",
                display: "flex", flexDirection: "column", gap: "1px",
              },
            },
              candidates.map(c => React.createElement("button", {
                key: c.id,
                onClick: () => { openUrl(c.url); setOpen(false); },
                style: {
                  textAlign: "left", border: "none", borderRadius: "7px", padding: "7px 10px",
                  background: "transparent", color: "var(--dsw-alias-label-primary)",
                  font: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                },
              }, c.label + " aufladen"))
            )
          : null
      );
    }

    /** Die Usage-Seite in den Einstellungen. */
    function UsagePanel(props) {
      const rpc = props.rpc;
      const [summary, setSummary] = React.useState(null);
      const [series, setSeries] = React.useState(null);
      const [facets, setFacets] = React.useState({ keys: [], models: [] });
      const [config, setConfig] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [days, setDays] = React.useState(30);
      const [keyRef, setKeyRef] = React.useState("all");
      const [model, setModel] = React.useState("all");
      const [groupBy, setGroupBy] = React.useState("model");
      // Der Hinweisbanner lässt sich ausblenden; die Wahl gilt für die Sitzung.
      const [noticeHidden, setNoticeHidden] = React.useState(false);

      // Laufende Anfrage und dezenter Ladezustand (siehe Badge oben).
      const inflight = React.useRef(false);
      const [refreshing, setRefreshing] = React.useState(false);

      React.useEffect(() => {
        let alive = true;
        const load = () => {
          // Keine überlappenden Anfragen: Der Takt kann kürzer sein als eine
          // Antwort, ein zweiter Lauf würde den ersten nur überholen.
          if (inflight.current) return;
          inflight.current = true;
          setRefreshing(true);
          Promise.all([
            call(rpc, "summary", { days }),
            call(rpc, "timeseries", { days, groupBy, keyRef, model }),
            call(rpc, "facets", { days }),
            call(rpc, "config"),
          ]).then(([s, t, f, c]) => {
            if (!alive) return;
            setSummary(s);
            setSeries(t);
            setFacets(f);
            setConfig(c);
            setError(null);
          }).catch(err => {
            // Letzten guten Wert stehen lassen; der nächste Takt versucht es
            // erneut, sodass sich ein Ausfall selbst erholt.
            if (alive) setError(err.message);
          }).finally(() => {
            inflight.current = false;
            if (alive) setRefreshing(false);
          });
        };
        // Gemerkte Rate einmal an den Host melden. Sonst gälte nach einem
        // Neuladen der Seite wieder der Vorgabewert, obwohl der Nutzer eine
        // andere Rate gewählt hat.
        call(rpc, "setInterval", { seconds: refreshSeconds }).catch(() => { /* Anzeige bleibt */ });
        load();
        // Im Hintergrund drosselt der Browser Timer auf etwa einen Lauf pro
        // Minute. Deshalb dort pausieren und beim Zurückkehren sofort laden.
        // Kurzer Prüftakt statt fester Abstand: Der wirksame Abstand kommt aus
        // `refreshSeconds` und wird bei jedem Takt neu gelesen. Dadurch greift
        // eine Änderung der Rate sofort, ohne die Ansicht neu aufzubauen, und
        // „Aus" (0) hält den Takt an. Ein Takt ohne fälligen Lauf kostet nur
        // einen Zahlenvergleich.
        let lastRun = 0;
        const timer = setInterval(() => {
          if (document.hidden) return
          if (refreshSeconds === 0) return
          if (Date.now() - lastRun < refreshSeconds * 1000) return
          lastRun = Date.now()
          load()
        }, 1000);
        const onVisible = () => { if (!document.hidden) load(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        // Auf Änderungen hören: neuer Verbrauch löst sofortiges Nachladen aus.
        changeListeners.add(load);
        return () => {
          alive = false;
          changeListeners.delete(load);
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
          window.removeEventListener("focus", onVisible);
        };
      }, [rpc, days, groupBy, keyRef, model]);

      const exportCsv = () => {
        call(rpc, "export", { days, keyRef, model }).then((csv) => {
          // Der Export läuft über einen Blob-Download: kein Serverpfad nötig
          // und die Datei landet dort, wo der Browser Downloads ablegt.
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "dsh-usage-" + days + "d.csv";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }).catch(err => setError(err.message));
      };

      if (error && !summary) {
        return React.createElement("div", { className: "ubp" },
          React.createElement("div", { className: "ubp-h1" }, "Usage"),
          React.createElement("div", { className: "ub-warn" }, "Nicht verfügbar: " + error));
      }
      if (!summary) {
        return React.createElement("div", { className: "ubp" },
          React.createElement("div", { className: "ubp-h1" }, "Usage"),
          React.createElement("div", { className: "ub-empty" }, "Lade Kostenübersicht…"));
      }

      // Ein Host ohne `totalStatus` darf die Seite nicht abstürzen lassen: Bei
      // unterschiedlichen Fassungen von Host und Client (möglich, weil der Host
      // erst beim nächsten Start lädt) fehlte das Feld und die Seite brach mit
      // "Cannot read properties of undefined" ab. Hier wird es ergänzt.
      const total = summary.totalStatus ?? {
        id: 'total',
        label: 'Gesamt',
        limitUsd: null,
        spentUsd: typeof summary.totalCostUsd === 'number' ? summary.totalCostUsd : 0,
        remainingUsd: null,
        balanceUsd: null,
        balanceSource: 'none',
        usedPercent: null,
        warnPercent: 80,
        warn: false,
        exceeded: false,
      };
      const list = alerts(summary);
      const noticeText = "DeepSeek API Peak/Off-Peak Hours Notice: Weekends with adjusted working days "
        + "and Chinese public holidays are all billed at off-peak rates.";

      const dayOptions = [
        { value: 7, label: "Letzte 7 Tage" },
        { value: 30, label: "Letzte 30 Tage" },
        { value: 90, label: "Letzte 90 Tage" },
      ];
      const keyOptions = [{ value: "all", label: "Alle" }].concat(
        (facets.keys || []).map(k => ({ value: k.id, label: k.id + " (" + usd(k.cost) + ")" })));
      const modelOptions = [{ value: "all", label: "Alle" }].concat(
        (facets.models || []).map(m => ({ value: m.id, label: m.id + " (" + usd(m.cost) + ")" })));

      return React.createElement("div", { className: "ubp" },
        // Kopf
        React.createElement("div", null,
          React.createElement("div", { className: "ubp-h1" }, "Usage"),
          React.createElement("div", { className: "ubp-sub" },
            "Alle Zeiten in UTC+0, Daten können bis zu 5 Minuten verzögert sein.",
            React.createElement("span", { className: "ubp-info", title: "Die Werte stammen aus dem eigenen Verbrauchsprotokoll; Guthaben wird direkt beim Provider abgefragt." }, "?")
          )
        ),
        // Hinweis zum Tarif
        noticeHidden ? null : React.createElement("div", { className: "ubp-notice" },
          React.createElement("span", { className: "ubp-notice-t" }, noticeText),
          React.createElement("button", { className: "ubp-notice-b", onClick: () => setNoticeHidden(true) }, "Got It")
        ),
        // Warnungen
        list.map((a, i) => React.createElement("div", {
          key: i, className: a.kind === "over" ? "ub-over" : "ub-warn",
        }, a.text)),
        // Zwei Summen-Karten
        React.createElement("div", { className: "ubp-cards" },
          React.createElement("div", { className: "ubp-card" },
            React.createElement("div", { className: "ubp-card-top" },
              React.createElement("span", { className: "ubp-card-k" },
                "Topped-up balance",
                React.createElement("span", { className: "ubp-info", title: "Vom Provider gemeldetes Guthaben; bei manuell gesetztem Wert aus den Einstellungen." }, "?")
              ),
              React.createElement("span", { className: "ubp-alert" + (config && config.fetchBalance ? "" : " off") },
                React.createElement("span", { className: "ubp-check" }, "✓"),
                config && config.fetchBalance ? "Balance alert enabled" : "Balance alert aus",
                " ",
                React.createElement("button", {
                  className: "ubp-link",
                  onClick: () => { window.location.hash = "#dsh-usage-budget"; },
                  title: "Budget und Warnschwellen im Settings-Namespace dsh-usage-budget eintragen",
                }, "Settings")
              )
            ),
            React.createElement("div", { className: "ubp-card-bot" },
              // Die Summe benennen: Sie besteht aus mehreren Anbietern und
              // stimmt deshalb mit dem Guthaben keiner einzelnen Konsole
              // überein. Ohne diesen Hinweis wirkt der Wert falsch.
              React.createElement("span", {
                className: "ubp-val",
                title: "Summe der Anbieter-Guthaben: " + balanceComposition(summary),
              },
                React.createElement("span", { className: "ubp-val-n" },
                  total.balanceUsd !== null ? usd(total.balanceUsd) : "—"),
                React.createElement("span", { className: "ubp-val-u" }, "USD")
              ),
              React.createElement("span", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                // Regler für die Aktualisierungsrate. Er sitzt neben „Refresh",
                // weil beide dasselbe steuern: wie frisch die Werte sind.
                React.createElement("label", {
                  className: "ubp-interval",
                  title: "Wie oft Verbrauch und Guthaben neu geholt werden",
                },
                  React.createElement("span", null, "Aktualisierung"),
                  React.createElement("select", {
                    value: refreshSeconds,
                    "aria-label": "Aktualisierungsintervall",
                    onChange: (e) => {
                      const seconds = Number(e.target.value);
                      setRefreshSeconds(seconds);
                      // Neurender erzwingen, damit die Auswahl den neuen Wert zeigt.
                      setConfig((prev) => ({ ...(prev || {}), refreshSeconds: seconds }));
                      // Dem Host mitteilen, damit er das Guthaben ebenso oft holt.
                      call(rpc, "setInterval", { seconds }).catch(() => { /* Anzeige bleibt */ });
                    },
                  }, REFRESH_OPTIONS.map(s =>
                    React.createElement("option", { key: s, value: s }, refreshLabel(s))))
                ),
                React.createElement("button", {
                  className: "ubp-btn",
                  title: "Guthaben beim Provider neu abfragen",
                  onClick: () => {
                    call(rpc, "refresh", { days }).then(setSummary).catch(err => setError(err.message));
                  },
                }, "Refresh"),
                // Anbieterunabhängig: Die Adresse kommt aus der Konfiguration
                // (`topUpUrls`), nicht mehr fest aus dem Code. Damit genügt für
                // einen weiteren Anbieter ein Eintrag in den Einstellungen.
                React.createElement(TopUpButton, { config, summary })
              )
            )
          ),
          React.createElement("div", { className: "ubp-card" },
            React.createElement("div", { className: "ubp-card-top" },
              React.createElement("span", { className: "ubp-card-k" }, "Total cost")
            ),
            React.createElement("div", { className: "ubp-card-bot" },
              React.createElement("span", { className: "ubp-val" },
                React.createElement("span", { className: "ubp-val-n" }, usd(summary.totalCostUsd)),
                React.createElement("span", { className: "ubp-val-u" }, "USD")
              ),
              total.limitUsd !== null
                ? React.createElement("span", { className: "ubp-sub" },
                    "Budget " + usd(total.limitUsd) + (total.remainingUsd !== null ? " · Rest " + usd(total.remainingUsd) : ""))
                : React.createElement("span", { className: "ubp-sub" }, "kein Budget gesetzt")
            )
          )
        ),
        React.createElement("div", { className: "ubp-hr" }),
        // Filterleiste
        React.createElement("div", { className: "ubp-tools" },
          React.createElement(FilterChip, {
            label: "Time",
            value: days,
            valueLabel: (dayOptions.find(o => o.value === days) || dayOptions[1]).label,
            options: dayOptions,
            onSelect: setDays,
          }),
          React.createElement(FilterChip, {
            label: "API Key",
            value: keyRef,
            valueLabel: keyRef === "all" ? "All" : keyRef,
            options: keyOptions,
            onSelect: setKeyRef,
          }),
          React.createElement(FilterChip, {
            label: "Model",
            value: model,
            valueLabel: model === "all" ? "All" : model,
            options: modelOptions,
            onSelect: setModel,
          }),
          React.createElement("span", { className: "ubp-spacer" }),
          React.createElement("button", { className: "ubp-btn ghost", onClick: exportCsv }, "Export"),
          React.createElement("button", {
            className: "ubp-btn ghost",
            title: "Verbrauchsprotokoll zurücksetzen",
            onClick: () => {
              call(rpc, "reset", { days }).then(setSummary).catch(err => setError(err.message));
            },
          }, "Zurücksetzen")
        ),
        // Kennzahlen
        React.createElement("div", { className: "ubp-kpis" },
          React.createElement("div", { className: "ubp-kpi" },
            React.createElement("span", { className: "ubp-kpi-k" }, "Cost"),
            React.createElement("span", { className: "ubp-kpi-v" },
              React.createElement("span", { className: "ubp-kpi-n" }, usd(summary.totalCostUsd)),
              React.createElement("span", { className: "ubp-val-u" }, "USD"))
          ),
          React.createElement("div", { className: "ubp-kpi" },
            React.createElement("span", { className: "ubp-kpi-k" }, "API requests"),
            React.createElement("span", { className: "ubp-kpi-v" },
              React.createElement("span", { className: "ubp-kpi-n" }, group(summary.requests)))
          ),
          React.createElement("div", { className: "ubp-kpi" },
            React.createElement("span", { className: "ubp-kpi-k" }, "Tokens"),
            React.createElement("span", { className: "ubp-kpi-v" },
              React.createElement("span", { className: "ubp-kpi-n" }, group(summary.totalTokens)))
          )
        ),
        // Diagramm
        React.createElement("div", { className: "ubp-chart-card" },
          React.createElement("div", { className: "ubp-chart-head" },
            React.createElement("span", { className: "ubp-chart-t" },
              React.createElement("span", { className: "ubp-chart-title" }, "Cost(USD)"),
              React.createElement("span", { className: "ubp-chart-total" }, usd(summary.totalCostUsd))
            ),
            React.createElement("span", { className: "ubp-seg" },
              React.createElement("button", {
                className: groupBy === "model" ? "on" : "",
                onClick: () => setGroupBy("model"),
              }, "Model"),
              React.createElement("button", {
                className: groupBy === "key" ? "on" : "",
                onClick: () => setGroupBy("key"),
              }, "API Key")
            )
          ),
          series ? React.createElement(CostChart, { series }) : React.createElement("div", { className: "ub-empty" }, "Lade Verlauf…")
        ),
        // Budgets je API-Key
        React.createElement("div", { className: "ubp-chart-card" },
          React.createElement("div", { className: "ubp-chart-head" },
            React.createElement("span", { className: "ubp-chart-title" }, "Budgets je API-Key")
          ),
          summary.keyStatus.length === 0
            ? React.createElement("div", { className: "ub-empty" }, "Noch keine Aufrufe erfasst.")
            : React.createElement("div", { className: "ubp-table-wrap" },
                React.createElement("table", { className: "ubp-table" },
                  React.createElement("colgroup", null,
                    React.createElement("col", { className: "ubp-col-name" }),
                    ["Budget", "Verbraucht", "Rest", "Guthaben", "Anfragen", "Auslastung"].map(h =>
                      React.createElement("col", { key: h, className: "ubp-col-num" }))
                  ),
                  React.createElement("thead", null,
                    React.createElement("tr", null,
                      React.createElement("th", null, "API-Key"),
                      React.createElement("th", null, "Budget"),
                      React.createElement("th", null, "Verbraucht"),
                      React.createElement("th", null, "Rest"),
                      React.createElement("th", null, "Guthaben"),
                      React.createElement("th", null, "Anfragen"),
                      React.createElement("th", null, "Auslastung")
                    )
                  ),
                  React.createElement("tbody", null,
                    summary.keyStatus.map(s => React.createElement("tr", { key: s.id },
                      React.createElement("td", { className: "ubp-table-name", title: s.label }, s.label),
                      React.createElement("td", null, s.limitUsd === null ? "—" : usd(s.limitUsd)),
                      React.createElement("td", null, usd(s.spentUsd)),
                      React.createElement("td", null, s.remainingUsd === null ? "—" : usd(s.remainingUsd)),
                      React.createElement("td", null, s.balanceUsd === null ? "—" : usd(s.balanceUsd)),
                      React.createElement("td", { title: group((summary.byKey.find(k => k.id === s.id) || {}).requests || 0) },
                        group((summary.byKey.find(k => k.id === s.id) || {}).requests || 0)),
                      // Kein minWidth mehr: Die Spaltenbreite kommt aus dem
                      // colgroup, sonst erzwingt diese Zelle den Überlauf.
                      React.createElement("td", null,
                        s.usedPercent === null ? "—" : Math.round(s.usedPercent) + "%",
                        s.limitUsd !== null
                          ? React.createElement("div", { className: "ub-bar " + stateClass(s), style: { marginTop: "5px" } },
                              React.createElement("i", { style: { width: Math.min(100, s.usedPercent) + "%" } }))
                          : null
                      )
                  ))
                )
              )
            )
        ),
        // Budgets je Modell
        summary.modelStatus.length > 0
          ? React.createElement("div", { className: "ubp-chart-card" },
              React.createElement("div", { className: "ubp-chart-head" },
                React.createElement("span", { className: "ubp-chart-title" }, "Budgets je Modell")),
              summary.modelStatus.map(s => React.createElement(StatusRow, { key: s.id, status: s }))
            )
          : null,
        // Aufschlüsselung nach Modell
        React.createElement("div", { className: "ubp-chart-card" },
          React.createElement("div", { className: "ubp-chart-head" },
            React.createElement("span", { className: "ubp-chart-title" }, "Aufschlüsselung nach Modell")),
          summary.byModel.length === 0
            ? React.createElement("div", { className: "ub-empty" }, "—")
            : React.createElement("div", { className: "ubp-table-wrap" },
                React.createElement("table", { className: "ubp-table" },
                  React.createElement("colgroup", null,
                    React.createElement("col", { className: "ubp-col-name" }),
                    ["Anfragen", "Input", "Output", "Cache", "Tokens", "Kosten"].map(h =>
                      React.createElement("col", { key: h, className: "ubp-col-num" }))
                  ),
                  React.createElement("thead", null,
                    React.createElement("tr", null,
                      React.createElement("th", null, "Modell"),
                      React.createElement("th", null, "Anfragen"),
                      React.createElement("th", { title: "Input-Tokens (Cache-Miss)" }, "Input"),
                      React.createElement("th", { title: "Output-Tokens" }, "Output"),
                      React.createElement("th", { title: "Cache-Treffer" }, "Cache"),
                      React.createElement("th", { title: "Tokens gesamt" }, "Tokens"),
                      React.createElement("th", null, "Kosten")
                    )
                  ),
                  React.createElement("tbody", null,
                    summary.byModel.map(m => React.createElement("tr", { key: m.id },
                      // Die Spalte kürzt lange Modellnamen; der volle Name steht im Tooltip.
                      React.createElement("td", { className: "ubp-table-name", title: m.label }, m.label),
                      React.createElement("td", { title: group(m.requests) }, group(m.requests)),
                      // Kompakt dargestellt (12,86M statt 12.864.616); der genaue
                      // Wert bleibt im Tooltip und im CSV-Export erhalten.
                      React.createElement("td", { title: group(m.inputTokens) }, compact(m.inputTokens)),
                      React.createElement("td", { title: group(m.outputTokens) }, compact(m.outputTokens)),
                      React.createElement("td", { title: group(m.cacheReadTokens + m.cacheWriteTokens) },
                        compact(m.cacheReadTokens + m.cacheWriteTokens)),
                      React.createElement("td", { title: group(m.totalTokens) }, compact(m.totalTokens)),
                      React.createElement("td", { title: usd(m.cost) }, usd(m.cost))
                    ))
                  )
                )
              )
        ),
        // Fußzeile mit Herkunft der Zahlen
        React.createElement("div", { className: "ubp-foot" },
          "Preisquelle: " + summary.pricing.source + " · " + group(summary.pricing.models) + " Modelle bekannt. ",
          "Aufrufe ohne bekannten Preis werden mit 0 gerechnet und oben gemeldet. ",
          "Budgets, Warnschwellen und die optionale Sperre stehen im Settings-Namespace ",
          React.createElement("code", null, "dsh-usage-budget"),
          config && config.blockOnExhausted
            ? " — Achtung: Die Sperre ist eingeschaltet, Anfragen werden bei aufgebrauchtem Budget abgelehnt."
            : " — die Sperre ist aus, es wird nur gewarnt."
        )
      );
    }

    function apply(ctx) {
      const connection = ctx.get("connection");
      if (!connection) return;
      const rpc = connection.rpc;
      if (!rpc || typeof rpc.call !== "function") return;

      // Änderungs-Auslöser starten. Ohne diesen Aufruf bleibt es beim Takt;
      // mit ihm lädt die Anzeige sofort nach, sobald ein Modellaufruf
      // abgeschlossen ist.
      void watchSessionEvents(connection);

      const tagId = "dsh-usage-budget/styles";
      if (typeof document !== "undefined" && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
        const tag = document.createElement("style");
        tag.setAttribute("data-plugin-css", tagId);
        tag.textContent = CSS;
        document.head.appendChild(tag);
      }

      // Beide Registrierungen sind einzeln abgesichert: die Hover-Anzeige ist
      // der Kern, die Detailseite die Zugabe — ein Fehler in der einen darf die
      // andere nicht verhindern.
      try {
        ctx.slots.inject("shell.overlay", () => ctx.slots.register(
          { name: "shell.overlay", id: "dsh-usage-budget", order: 40 },
          () => React.createElement(HoverBadge, { rpc })
        ));
      } catch (err) {
        console.warn("[usage-budget] Hover-Anzeige nicht registrierbar:", err);
      }

      try {
        ctx.slots.inject("settings.section", () => ctx.slots.register(
          { name: "settings.section", id: "dsh-usage-budget", order: 70, label: "Usage" },
          () => React.createElement(UsagePanel, { rpc })
        ));
      } catch (err) {
        console.warn("[usage-budget] Settings-Seite nicht registrierbar:", err);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
