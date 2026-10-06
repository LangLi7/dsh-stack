# Beispiel: kleine Web-App in einem Durchgang

**Auftrag:** "Wir brauchen eine interne Seite, auf der das Team Bestellungen erfassen und den
Status verfolgen kann."

## 1. Auftrag klären (planner)

Auftragsverständnis: interne Web-App, Anmeldung nötig, Bestellungen anlegen und Status
verfolgen, keine Kundenansicht. Offene Fragen: Q1 Anmeldung über bestehendes SSO oder eigenes
Konto? Q2 Muss der Statusverlauf historisiert werden? Q3 Export nötig?

## 2. Recherche (crew-project-research)

Randbedingungen: bestehendes Node-Monorepo, Team kennt TypeScript, Deployment auf einem
internen Server, keine Cloud-Vorgabe. Ergebnis der Technical-Requirements-Liste:

| Kategorie | Wahl | Version | Alternative | Begründung | Prüfkommando |
|---|---|---|---|---|---|
| Sprache | TypeScript | 5.x | JavaScript | Typsicherheit im bestehenden Monorepo | `npx tsc --version` |
| Laufzeit | Node.js | 22 LTS | Bun | vorhandene Infrastruktur | `node --version` |
| Web | Fastify | 5.x | Express | Schema-Validierung eingebaut | `node -e "require('fastify')" ` |
| Datenbank | PostgreSQL | 17 | SQLite | Mehrbenutzer, Nebenläufigkeit | `psql --version` |
| Test | Vitest | 3.x | Jest | schnell, ESM-nativ | `npx vitest --version` |

## 3. PRD (Auszug)

- Problem: Bestellungen laufen über Chat und Tabellen, Status ist unklar.
- Zielgruppe: Team (erfasst), Teamleitung (sieht Überblick).
- F1 (muss): Bestellung mit Positionen erfassen → AK1: Eine Bestellung mit drei Positionen
  ist nach dem Speichern in der Liste sichtbar.
- F2 (muss): Status je Bestellung setzen → AK2: Jeder Statuswechsel ist mit Zeitpunkt und
  Person sichtbar.
- F3 (soll): Filter nach Status → AK3: Filter liefert nur Bestellungen dieses Status.
- Nicht-Ziele: Kundenansicht, Rechnungsstellung, Lieferantenanbindung.
- Erfolgskriterium: 90 % der Bestellungen werden ohne Chat-Rückfrage erfasst (nach 4 Wochen).

## 4. TRD (Auszug)

Architektur: Browser → HTTP-API (Fastify) → PostgreSQL; eine SPA, keine Microservices.
Entscheidung "Monolith statt Microservices": gewählt wegen Teamgröße 3; verworfen, weil
Betriebsaufwand und Fehlerflächen steigen. Performance-Ziel: Listenansicht p95 < 300 ms bei
10 000 Bestellungen. Sicherheit: SSO, Rollen `erfasser` und `leitung`.

## 5. App-Flow (Auszug)

FL2 Bestellung erfassen: Vorbedingung angemeldet als `erfasser`. 1) Liste öffnen.
2) "Neu" wählen. 3) Positionen hinzufügen. 4) Speichern. 5) Bestätigung, Liste aktualisiert.
Fehlerpfad: Speichern schlägt fehl → Eingaben bleiben erhalten, Fehlermeldung mit Grund,
erneuter Versuch möglich. Zustände: `entwurf → offen → bestellt → geliefert → storniert`.

## 6. UI/UX Design Brief (Auszug)

Design-System: `design-md` → `linear` gewählt (dichte Tabellen, dunkle Flächen, klare
Typo-Skala). Abweichung: Statusfarben aus dem Brief statt aus dem System, weil vier
Zustände unterscheidbar sein müssen. Palette: `--surface` #0B0C0E, `--text` #EDEEF0
(Kontrast 15,8:1), `--accent` #5B8DEF. Typografie: Inter 14/20 Fließtext, 12/16 Label,
Skala 12/14/16/20/24. Komponenten: `StatusBadge` (4 Varianten, Kontrast ≥ 4,5:1, nicht nur
Farbe, sondern auch Symbol und Text).

## 7. Backend-Schema (Auszug)

Entitäten: `User` (id, name, role), `Order` (id, createdBy → User, status, createdAt,
updatedAt), `OrderItem` (id, order → Order, description, quantity, unit), `StatusChange`
(id, order → Order, from, to, by → User, at). Endpunkte: `POST /orders`,
`GET /orders?status=`, `PATCH /orders/:id/status`. Fehlerformat:
`{ "error": { "code": "ORDER_LOCKED", "message": "…" } }`.

## 8. Implementation Plan (Auszug)

- AP1 (executor): Migration für die vier Entitäten. DoD: `npm run migrate` läuft leer und
  erneut idempotent durch.
- AP2 (executor): API-Endpunkte laut Backend-Schema. DoD: Integrationstests für alle drei
  Endpunkte inklusive Fehlerfälle grün.
- AP3 (executor): Oberfläche laut Design-Brief. DoD: Drei Seiten, vier Zustände je
  Komponente, Screenshot je Seite.
- AP4 (reviewer): Abnahme gegen AK1–AK3. DoD: Prüfprotokoll mit Nachweis je Kriterium.
- AP2 hängt von AP1 ab, AP3 von AP2, AP4 von allen. AP1 und die Recherche liefen parallel.

## 9. Persistieren

```
crew_plan { "action": "set", "role": "executor", "goal": "AP1-AP3 umsetzen" }
crew_plan { "action": "set", "role": "reviewer", "goal": "AK1-AK3 gegen die Lieferung pruefen" }
crew_todo { "role": "executor", "todos": [
  { "id": "AP1", "text": "Migration fuer User, Order, OrderItem, StatusChange" },
  { "id": "AP2", "text": "API-Endpunkte laut docs/BACKEND.md" },
  { "id": "AP3", "text": "UI laut docs/DESIGN-BRIEF.md" }
] }
crew_todo { "role": "reviewer", "todos": [{ "id": "AP4", "text": "Abnahme gegen AK1-AK3" }] }
```

Nach dem Neustart liest jede Rolle ihren Stand über `crew_plan { "action": "view" }` und
arbeitet weiter, ohne dass der Plan neu erfunden werden muss.
