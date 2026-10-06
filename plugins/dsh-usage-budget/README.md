# dsh-usage-budget

Kosten- und Budget-Anzeige für das DeepSeek Harness. Erfasst Token-Verbrauch je
Modellaufruf, rechnet ihn in USD um und zeigt Guthaben und Budgets je Anbieter –
als kompakte Anzeige rechts oben und als Seite „Usage" in den Einstellungen.

## Was die Anzeige kann

| Funktion | Stand |
| --- | --- |
| Verbrauch je Modellaufruf erfassen | ✅ über den `llm/stream`-Waterfall |
| Kosten berechnen (models.dev, Peak/Off-Peak) | ✅ belegte DeepSeek-Preise siehe `lib/pricing.js` |
| Guthaben abfragen | ✅ nur wo eine Schnittstelle existiert (siehe Matrix) |
| Budget und Warnschwellen je Key/Modell | ✅ über den Settings-Namespace `dsh-usage-budget` |
| Aufladen (Top up) | ✅ als **Deep-Link** in die Konsole des Anbieters |
| Guthaben aufladen **über eine API** | ❌ von keinem Anbieter angeboten (siehe unten) |

## Anbieter-Matrix

Grundlage sind eigene Messungen gegen die echten Endpunkte, nicht Dokumentation
allein. „Guthaben-API" heißt: ein Endpunkt, der den Kontostand **liest**.

| Anbieter | Guthaben lesen | Aufladen per API | Abrechnung | Praktikabler Weg |
| --- | --- | --- | --- | --- |
| **DeepSeek** | ✅ `GET /user/balance` | ❌ | Prepaid (aufgeladen + gewährt) | Deep-Link `platform.deepseek.com/top_up` |
| **OpenRouter** | ✅ `GET /credits` **und** Limit je Schlüssel über `GET /key` | ❌ | Prepaid, Limit pro Key (z. B. `$5/Monat`) | Deep-Link `openrouter.ai/settings/credits` |
| **OpenAI** | ❌ kein Guthaben-Endpunkt (`404`) | ❌ | Prepaid-Credits | Kosten/Verbrauch **lesbar** über Admin-Key (`/organization/costs`, `/organization/usage/completions`, `/organization/admin_api_keys`); Aufladen nur in der Konsole |
| **Anthropic** | ❌ | ❌ | Postpaid | Nutzungs-/Kostenbericht nur mit **Admin-Key** (`sk-ant-admin…`) |
| **Groq** | ❌ (`404`) | ❌ | Postpaid mit Ausgabenlimit | Konsole |
| **ZAI / Zhipu** | ❌ (`404`) | ❌ | Prepaid | Konsole |
| **ZenMux** | ❌ (Pfad liefert HTML, kein JSON) | ❌ | Prepaid | Konsole |
| **Ollama Cloud** | ❌ (`404`) | ❌ | Abo | Konsole |
| **Nous** | ❌ (`404`) | ❌ | Abo | Portal |
| **OpenCode / OpenCode Go** | ❌ (`404`) | ❌ | Abo | Portal |
| **LM Studio** | ❌ | ❌ | lokal, keine Abrechnung | — |

**Warum es kein `top_up(amount, method)` gibt:** Kein geprüfter Anbieter stellt
eine schreibende Guthaben-Schnittstelle bereit. Ein Aufladen ist ausschließlich
über die Weboberfläche möglich. Eine Methode, die das vortäuscht, wäre irreführend
und im schlimmsten Fall gefährlich — sie könnte echten Geldfluss auslösen oder
stillschweigend nichts tun. Die Bibliothek bleibt deshalb bewusst bei **Lesen +
Deep-Link**.

## Einen weiteren Anbieter ergänzen

Ohne Codeänderung, über die Einstellungen:

```yaml
dsh-usage-budget:
  topUpUrls:
    MEIN_ANBIETER_API_KEY: 'https://meinanbieter.example/billing'
```

Der Schlüssel ist der **Credential-Ref-Name** aus `.credentials.yaml`. Ein
Eintrag überschreibt die eingebaute Vorgabe; ein leerer Wert entfernt sie:

```yaml
dsh-usage-budget:
  topUpUrls:
    GROQ_API_KEY: ''      # Knopf für Groq ausblenden
```

Damit auch ein **Guthaben** gelesen wird, ist dagegen Code nötig: Die
Anbieterlogik liegt in `PROVIDER_BALANCE` (`lib/usage.js`) plus einer
Abruf-Funktion. Das ist bewusst so — ein Guthaben-Endpunkt ist anbieterspezifisch
und muss gegen den echten Endpunkt geprüft werden.

## Aufladen-Knopf: Verhalten

Der Knopf ist anbieterunabhängig und richtet sich nach dem, was tatsächlich
gemessen wurde:

| Lage | Verhalten |
| --- | --- |
| Genau ein Anbieter meldet Guthaben und hat eine Adresse | Knopf öffnet dessen Aufladeseite; der Tooltip nennt den Anbieter |
| Mehrere Anbieter mit Guthaben | Knopf öffnet eine Auswahl, statt willkürlich einen zu wählen |
| Kein Anbieter mit Adresse | Hinweis „kein Aufladen möglich" statt eines ins Leere führenden Knopfes |
| Adresse vorhanden, aber kein Guthaben | Anbieter wird **nicht** angeboten |

## Tests

```bash
node tests/run-tests.mjs core.test.mjs dedup.test.mjs   # 42 Tests
node tests/check-topup.mjs        # Aufladen-Knopf, 5 Fälle
node tests/check-keyfilter.mjs    # Filter der Key-Liste
node tests/check-autorefresh.mjs  # Takt und Drosselung
node tests/check-schema.mjs       # RPC-Antworten gegen das Wire-Schema des Harness
```

## Bekannte Einschränkungen

- **Guthaben lesen geht nur bei DeepSeek und OpenRouter.** Für die übrigen
  Anbieter existiert keine öffentliche Schnittstelle; dort zeigt die Anzeige
  Verbrauch und ein selbst gesetztes Budget.
- **Kein automatisches Aufladen.** Nicht möglich (siehe oben) und ohne
  ausdrückliche Freigabe auch nicht wünschenswert.
- **Anthropic und OpenAI** liefern Kosten nur mit einem **Admin-Key**. Ein
  normaler Inferenz-Key reicht dafür nicht.
- **DeepSeek-Preise** stammen aus einem eigenen Nutzungsexport des Betreibers und
  haben Vorrang vor models.dev, weil der Katalog dort um bis zu den Faktor 6
  abwich (`deepseek-v4-pro`, Cache-Treffer).
