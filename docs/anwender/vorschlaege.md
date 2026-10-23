# Vorschläge im Terminal und in SQL

Feather unterstützt beim Tippen von Terminal-Befehlen und SQL-Abfragen. Beide Funktionen lassen sich in den Einstellungen abschalten.

## Terminal

Sobald du an einem Shell-Prompt tippst, erscheint unter der Zeile eine Liste passender Fortsetzungen.

| Taste | Wirkung |
| --- | --- |
| Tab oder Pfeil nach rechts | Markierten Vorschlag übernehmen |
| Alt + Pfeil nach oben oder unten | Anderen Vorschlag wählen |
| Esc | Liste schließen |
| Strg + Leertaste | Liste öffnen, auch bei leerer Zeile (zeigt die letzten Befehle) |

Ist keine Liste sichtbar, geht Tab unverändert an die Shell und vervollständigt dort Dateinamen. Möchtest du bei sichtbarer Liste die Vervollständigung der Shell nutzen, schließe die Liste zuerst mit Esc.

### Woher die Vorschläge kommen

1. **Verlauf:** Befehle, die du auf diesem Server bereits ausgeführt hast. Häufig genutzte stehen oben.
2. **Befehle:** Gängige Linux-Befehle wie `ls`, `grep`, `tar` oder `journalctl`, außerdem Befehle aus deinem Verlauf.
3. **Unterbefehle und Optionen:** Zum Beispiel `restart` nach `systemctl`, `install` nach `apt` oder `-la` nach `ls`.
4. **Werte:** Dienstnamen nach `systemctl restart`, häufige Pakete nach `apt install`, Berechtigungen nach `chmod`. Dienste, die du über ein Server-Modul installiert hast, kennt Feather.

Die Vorschläge erscheinen nur an einem normalen Shell-Prompt. In Programmen wie `vim`, `top` oder dem MariaDB-Client bleibt das Terminal unverändert. Weicht dein Prompt stark vom üblichen Muster `benutzer@host:ordner$` ab, erkennt Feather ihn unter Umständen nicht.

### Hinweise bei Fehlern

Meldet der Server einen bekannten Fehler, blendet Feather unten rechts einen Hinweis mit einem passenden Befehl ein. **Ins Terminal einfügen** schreibt den Befehl in die Eingabezeile. Ausgeführt wird er erst, wenn du Enter drückst.

| Meldung | Vorschlag |
| --- | --- |
| `command not found` | Paket installieren, mit dem Paketverwalter des Servers und `sudo`, wenn du nicht `root` bist |
| `Permission denied` | Letzten Befehl mit `sudo` wiederholen |
| `Unit … could not be found` | Passende Dienste mit `systemctl list-units` suchen |
| `Address already in use` | Belegten Port mit `ss -tulpn` prüfen |
| `No space left on device` | Speicherplatz mit `df -h` prüfen |
| Paketsperre (`Could not get lock`) | Auf das Ende des anderen Vorgangs warten und den Befehl wiederholen |

### Befehlsverlauf und Datenschutz

Feather speichert eingegebene Befehle pro Server, verschlüsselt auf deinem Rechner. Folgendes wird nie gespeichert:

- Zeilen, die Wörter wie `password`, `secret`, `token`, `api_key` oder `authorization` enthalten
- Aufrufe von `mysql`, `mariadb` und verwandten Programmen mit angehängtem Passwort (`-pGeheim`)
- Adressen mit Zugangsdaten (`https://benutzer:passwort@host`)
- `export`-Zeilen mit Schlüsseln oder Tokens
- Zeilen mit führendem Leerzeichen
- Eingaben nach einer Passwortabfrage wie `[sudo] password for …`

Den gespeicherten Verlauf löschst du unter **Einstellungen › Terminal**.

## SQL

Feather SQL schlägt in Abfragen und im Filterfeld der Tabellenansicht Folgendes vor:

| Position | Vorschläge |
| --- | --- |
| Beginn einer Abfrage | Gängige Befehle wie `SELECT * FROM` oder `INSERT INTO` |
| Nach `FROM`, `JOIN`, `INTO`, `UPDATE` | Tabellen der Standarddatenbank und Datenbanken |
| Nach `datenbank.` | Tabellen dieser Datenbank |
| Nach `tabelle.` oder `alias.` | Spalten der Tabelle |
| Nach `SELECT`, `WHERE`, `AND`, `ORDER BY`, `SET` | Spalten der Tabellen aus der Abfrage, Funktionen und Schlüsselwörter |
| Nach einer Tabelle oder Spalte | Der nächste sinnvolle Schritt, etwa `WHERE`, `ORDER BY`, `LIKE` oder `IS NULL` |

Die Spalten kommen aus den Tabellen, die in der Abfrage genannt sind, auch wenn `FROM` hinter dem Cursor steht. Aliase wie in `FROM users u` werden aufgelöst. Innerhalb von Texten und Kommentaren erscheinen keine Vorschläge. Bezeichner mit Sonderzeichen oder reservierten Wörtern setzt Feather automatisch in Backticks.

Feather merkt sich, welche Einträge du oft übernimmst, und zeigt sie weiter oben. Tabellen und Spalten liest Feather nach jedem `CREATE`, `ALTER` oder `DROP` neu ein.

| Taste | Wirkung |
| --- | --- |
| Tab | Markierten Vorschlag übernehmen |
| Pfeil nach oben oder unten | Anderen Vorschlag wählen |
| Enter | Übernimmt den Vorschlag nur, wenn du ihn mit den Pfeiltasten gewählt hast |
| Esc | Liste schließen |
| Strg + Leertaste | Liste öffnen |

## Abschalten

| Funktion | Einstellung |
| --- | --- |
| Befehlsvorschläge im Terminal | **Einstellungen › Terminal › Befehlsvorschläge** |
| Hinweise bei Fehlern | **Einstellungen › Terminal › Hinweise bei Fehlern** |
| SQL-Vorschläge | **Einstellungen › Datenbank › Intelligente Vorschläge** |
