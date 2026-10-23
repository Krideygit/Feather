# Sprachpakete

Feather liefert Deutsch und Englisch mit. Weitere Sprachen kommen als Sprachpaket: eine JSON-Datei mit der Endung `.featherlang`. Dieses Dokument beschreibt Format, Regeln und Ablauf. Für Anwender steht die Kurzfassung unter [Einstellungen › Sprache](../anwender/einstellungen.md#sprache).

## Funktionsweise

Die Quelltexte der Oberfläche sind Deutsch. Eine Sprache ist eine Zuordnung vom deutschen Originaltext zur Übersetzung. Feather ersetzt Texte der Oberfläche anhand dieser Zuordnung, sobald sie angezeigt werden. Texte, die in der Zuordnung fehlen, ersetzt Feather nicht.

Die Reihenfolge der Auflösung ist:

1. Übersetzung aus dem gewählten Sprachpaket
2. Englische Übersetzung
3. Deutscher Originaltext

Eine unvollständige Übersetzung ist deshalb unproblematisch: Alles, was fehlt, erscheint auf Englisch. Dasselbe gilt für Texte, die nach einem Update neu hinzukommen.

## Vorlage erzeugen

**Einstellungen › Sprache › Vorlage für Übersetzer** erzeugt eine Datei mit allen Texten. Die Vorlage enthält als Werte die englischen Texte, sodass jede nicht bearbeitete Zeile englisch bleibt. Für eine bereits installierte Sprache enthält die Vorlage deren aktuelle Übersetzung. So lässt sich ein Paket nach einem Update ergänzen.

## Dateiformat

```json
{
  "format": 1,
  "hint": "Translate only the values on the right. …",
  "code": "tr",
  "name": "Türkçe",
  "author": "Ali Beispiel",
  "version": "1.0.0",
  "strings": {
    "Abbrechen": "İptal",
    "Speichern": "Kaydet",
    "„{0}“ wurde erstellt.": "“{0}” oluşturuldu."
  }
}
```

| Feld | Pflicht | Beschreibung |
| --- | --- | --- |
| `format` | nein | Dateiformat, derzeit `1`. Eine höhere Zahl lehnt Feather ab |
| `hint` | nein | Hinweis für Übersetzer, wird ignoriert |
| `code` | ja | Sprachcode aus zwei oder drei Kleinbuchstaben, optional mit Region, zum Beispiel `tr`, `fr`, `pt-br`. `de` und `en` sind belegt |
| `name` | ja | Anzeigename der Sprache, höchstens 40 Zeichen, in der jeweiligen Sprache geschrieben |
| `author` | nein | Name der Übersetzerin oder des Übersetzers, höchstens 60 Zeichen |
| `version` | nein | Version der Übersetzung, höchstens 20 Zeichen, Standard `1.0.0` |
| `strings` | ja | Zuordnung vom Originaltext (Schlüssel) zur Übersetzung (Wert) |

Die Schlüssel in `strings` dürfen nicht verändert werden. Nur die Werte werden übersetzt.

## Regeln für Übersetzungen

- **Platzhalter** wie `{0}` oder `{1}` stehen für Namen, Zahlen oder andere Texte, die Feather einsetzt. Sie müssen im Wert genauso oft vorkommen wie im Schlüssel. Ihre Reihenfolge darf sich ändern. Einträge mit abweichenden Platzhaltern überspringt Feather beim Import.
- **Leere Werte** zählen als nicht übersetzt, Feather zeigt dann Englisch.
- **Leerraum** am Anfang und Ende der Werte wird entfernt. In den Schlüsseln sind mehrfache Leerzeichen und Zeilenumbrüche der Originaltexte bereits zu einem Leerzeichen zusammengefasst.
- **Unbekannte Schlüssel**, etwa aus einer älteren Version, überspringt Feather und meldet die Anzahl.
- **Anführungszeichen** in den Werten müssen in JSON mit einem Backslash maskiert werden (`\"`). Das typografische „…“ und “…” benötigt keine Maskierung.
- Die Datei muss UTF-8 sein. Höchstgröße sind 4 MB.

Die Datei lässt sich mit jedem Texteditor bearbeiten. Ein Editor mit JSON-Unterstützung findet Syntaxfehler sofort.

## Installieren

Es gibt zwei Wege:

- **Sprachdatei importieren** wählt die Datei. Feather prüft sie, meldet übersprungene Einträge und legt sie ab.
- **Ordner öffnen** zeigt `%APPDATA%\Feather®\languages`. Eine dort abgelegte Datei mit der Endung `.featherlang` erkennt Feather nach **Aktualisieren**. Fehlerhafte Dateien in diesem Ordner ignoriert Feather.

Beim Import schreibt Feather die Datei als `<code>.featherlang` in den Ordner und entfernt eine vorhandene Datei mit demselben Code. Ein importiertes Paket mit demselben Code ersetzt also das vorherige.

Die Sprache gilt sofort nach der Auswahl. Ein Neustart ist nicht nötig.

## Prüfung beim Import

Feather weist eine Datei ab, wenn

- sie kein gültiges JSON ist,
- sie aus einer neueren Dateiformat-Version stammt,
- Sprachcode oder Name fehlen oder ungültig sind,
- der Code `de` oder `en` lautet,
- der Abschnitt `strings` fehlt oder keine verwendbaren Übersetzungen enthält,
- die Datei größer als 4 MB ist.

## Grenzen

- Übersetzt werden Texte der Oberfläche. Meldungen, die Server oder Plugins liefern, und eigene Daten bleiben unverändert.
- Das Menü im Infobereich der Taskleiste nutzt dieselben Pakete. Native Systemdialoge, etwa zur Dateiauswahl, folgen der Sprache von Windows.
- Texte in Datenbanktabellen, Spaltennamen und Terminalausgaben werden nie übersetzt.
