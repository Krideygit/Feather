# Feather SQL

Feather SQL ist der SQL-Client von Feather. Er arbeitet mit MariaDB und MySQL und deckt sowohl lokale Datenbanken als auch Datenbanken auf entfernten Servern ab.

## Verbindungen

Feather SQL kennt drei Arten von Verbindungen.

| Art | Beschreibung |
| --- | --- |
| Dieser Rechner | MariaDB-Services, die du unter **Datenbanken** angelegt hast |
| Über SSH | Datenbank auf einem Server, erreichbar über einen SSH-Tunnel |
| Direkt | Datenbank, die du mit Host, Port, Benutzer und Passwort ansprichst |

Datenbanken auf Servern, die du über das [Server-Modul MariaDB](server.md#mariadb) eingerichtet hast, öffnest du direkt im Modul unter **Datenbanken**. Der Eintrag **Feather SQL** in der Seitenleiste dient für alle anderen Fälle, zum Beispiel für eine Datenbank, die jemand anderes eingerichtet hat, oder für Direktverbindungen.

Zugangsdaten für Verbindungen über SSH und direkte Verbindungen speichert Feather verschlüsselt. Im Modul findest du sie unter **Zugangsdaten**. Fehlt ein Zugang, kann Feather mit **Zugang einrichten** einen eigenen Benutzer `feather_sql` anlegen. Dieser Benutzer ist nur vom Server selbst erreichbar und hat Rechte auf alle Datenbanken.

## Arbeitsbereich

Links zeigt der Baum Datenbanken und Tabellen, rechts öffnen sich Reiter für Tabellen und Abfragen.

| Aktion | Wirkung |
| --- | --- |
| Klick auf eine Datenbank | Tabellen anzeigen |
| Klick auf eine Tabelle | Tabellenansicht öffnen |
| Rechtsklick auf eine Datenbank | Neue Tabelle, neue Abfrage, Tabellen aktualisieren, Datenbank löschen |
| Rechtsklick auf eine Tabelle | Daten öffnen, SELECT-Abfrage, leeren, löschen |
| Plus über dem Baum | Neue Datenbank |

Systemdatenbanken (`mysql`, `information_schema`, `performance_schema`, `sys`) erscheinen abgesetzt und lassen sich nicht löschen.

## Abfragen

Der Reiter **Neue Abfrage** nimmt beliebigen SQL-Code auf. Mehrere Befehle trennst du mit Semikolon. Markierter Text wird einzeln ausgeführt.

| Tastenkürzel | Wirkung |
| --- | --- |
| Strg + Enter | Abfrage ausführen |
| Tab | Vorschlag übernehmen |
| Strg + Leertaste | Vorschläge öffnen |

Oben wählst du die Standarddatenbank der Abfrage. Ergebnisse erscheinen als Tabellen, bei schreibenden Befehlen mit der Zahl der betroffenen Zeilen. Fehlermeldungen des Servers zeigt Feather im Klartext. Der Text eines Reiters bleibt erhalten, solange der Reiter geöffnet ist.

## Tabellenansicht

Die Tabellenansicht liest 100 Zeilen pro Seite und zeigt die Gesamtzahl.

- **Sortieren:** Klick auf die Spaltenüberschrift, ein weiterer Klick kehrt die Richtung um, der dritte hebt die Sortierung auf.
- **Filtern:** Das Feld oben nimmt den Teil einer `WHERE`-Bedingung auf, zum Beispiel `id > 10 AND name LIKE 'A%'`. Mit Enter wird gefiltert. Vorschläge helfen bei Spaltennamen.
- **Zelle ändern:** Doppelklick auf eine Zelle, Enter speichert, Esc verwirft.
- **Auf NULL setzen, Zeile kopieren, Wert kopieren:** Rechtsklick auf eine Zelle.
- **Zeile bearbeiten:** Rechtsklick › **Zeile bearbeiten …** zeigt alle Felder einer Zeile in einem Dialog.
- **Neue Zeile:** Schaltfläche **Zeile**. Spalten mit Auto-Increment oder Standardwert dürfen leer bleiben.
- **Zeilen löschen:** Zeilen über die Nummer links markieren (mit Strg mehrere), dann **Löschen**.

Zeilen lassen sich nur ändern oder löschen, wenn die Tabelle einen Primärschlüssel hat. Spalten mit Binärdaten oder sehr langen Texten sind schreibgeschützt.

## Tabellen entwerfen

**Neue Tabelle …** im Kontextmenü einer Datenbank öffnet den Tabellen-Designer.

| Eingabe | Bedeutung |
| --- | --- |
| Name | Name der Tabelle. Auf Linux-Servern zählt die Groß- und Kleinschreibung. |
| Typ | Datentyp, gruppiert nach Zahlen, Text, Zeit und Sonstige |
| Länge | Länge bei `VARCHAR`, `CHAR` und `DECIMAL`, Wertliste bei `ENUM` |
| Standardwert | kein Standard, `NULL`, ein fester Wert oder die aktuelle Zeit |
| NULL | Spalte darf leer sein |
| Auto | Zählt automatisch hoch (nur ganze Zahlen) |
| PK | Primärschlüssel, mehrere Spalten ergeben einen zusammengesetzten Schlüssel |
| Unique | Kein Wert darf doppelt vorkommen |
| Positiv | Nur positive Zahlen (`UNSIGNED`) |

Über **Schnell hinzufügen** fügst du gängige Spalten ein: ID, UUID, Name und Erstellungszeitpunkt. **SQL anzeigen** gibt den erzeugten `CREATE TABLE`-Befehl aus. Feather prüft die Eingaben, bevor es sie an den Server schickt, und nennt das Problem im Klartext.

Der Reiter **Struktur** einer Tabelle zeigt alle Spalten und bietet **Spalte hinzufügen**, Bearbeiten und Löschen. Beim Ändern des Typs wandelt MariaDB vorhandene Werte um. Passen sie nicht, bricht der Vorgang ab, oder Werte werden gekürzt. Sichere wichtige Daten vorher. Primärschlüssel lassen sich nur beim Anlegen einer Tabelle festlegen.

## Änderungsverlauf

Der Änderungsverlauf merkt sich, was vorher in einer Zelle stand. Er erfasst Änderungen in der Tabellenansicht, nicht eigene SQL-Befehle.

- Änderst du eine Zelle, steht beim nächsten Bearbeiten in Rot darunter, welcher Wert vorher dort stand. Ein Klick auf den Wert setzt ihn wieder ein.
- Zellen mit Verlauf tragen einen kleinen roten Punkt.
- Die Schaltfläche **Verlauf** in der Tabellenansicht listet alle Änderungen der Tabelle und stellt Werte per **Zurücksetzen** wieder her. Hat sich der Wert inzwischen geändert, fragt Feather nach.
- Gelöschte Zeilen sichert Feather vorher. Im Verlauf bringt **Wiederherstellen** sie zurück. Zeilen mit Binärdaten oder sehr langen Texten lassen sich nicht sichern, das Löschen-Fenster weist darauf hin.

Pro Tabelle behält Feather höchstens 3000 Einträge. Unter **Einstellungen › Datenbank › Hilfen** schaltest du den Verlauf und das Sichern gelöschter Zeilen ab und löschst den gespeicherten Verlauf. Der Verlauf liegt verschlüsselt auf dem Rechner und enthält Kopien deiner Daten.

## Vorschläge

Beim Schreiben von Abfragen schlägt Feather Befehle, Datenbanken, Tabellen und Spalten vor. Details stehen unter [Vorschläge](vorschlaege.md#sql).
