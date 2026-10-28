# Einstellungen

Die Einstellungen erreichst du über die Seitenleiste. Änderungen gelten sofort und werden automatisch gespeichert.

## Darstellung

Feather bringt sechs Themen mit: Feather Dunkel, Mitternacht, Wald, Sonnenuntergang, Rosé und Feather Hell. Ein Klick auf eine Karte wendet das Thema an, auch auf die Titelleiste des Fensters.

Eigene Themen legst du mit **Eigenes Thema erstellen** an.

| Einstellung | Wirkung |
| --- | --- |
| Name | Bezeichnung in der Liste |
| Modus | Dunkel oder Hell |
| Primärfarbe | Farbe von Schaltflächen, Markierungen und Hervorhebungen |
| Hintergrund | Eigene Hintergrundfarbe, Flächen und Ränder passen sich an |
| Textfarbe | Farbe von Überschriften und Text, abgestuft bis zu Hinweisen |
| Symbolfarbe | Farbe der Symbole in Schaltflächen, Seitenleiste und Kopfzeilen |
| Farbton und Intensität | Tönung der Flächen |
| Größe | Skaliert die gesamte Oberfläche zwischen 80 und 130 Prozent |

Hintergrund, Textfarbe und Symbolfarbe sind optional. Der Knopf neben dem Feld stellt wieder auf automatisch zurück.

### Animation

Mit **Farbverlauf animieren** gehen bis zu sechs gewählte Farben fließend ineinander über. Fertige Farbverläufe wie Polarlicht oder Ozean sind als Vorlage hinterlegt.

| Wirkt auf | Effekt |
| --- | --- |
| Primärfarbe | Schaltflächen und Hervorhebungen wechseln langsam die Farbe |
| Schimmer | Ein weicher Farbverlauf wandert über das Fenster |
| Beides | Beides zusammen |

Die Dauer eines Durchlaufs stellst du zwischen 6 und 90 Sekunden ein. Langsamere Animationen wirken ruhiger und kosten weniger Leistung. Im [Ruhemodus](#allgemein) pausiert die Animation.

Eine Vorschau zeigt das Ergebnis, bevor du speicherst. Eigene Themen lassen sich bearbeiten und löschen. Terminal und Blueprint-Fläche bleiben auch im hellen Modus dunkel.

## Sprache

Feather liegt auf Deutsch und Englisch vor. Die Sprache wechselt sofort. Texte, die Plugins oder Server liefern, sowie deine eigenen Daten bleiben unverändert. Das Menü im Infobereich der Taskleiste und einzelne Systemdialoge sind nur teilweise übersetzt.

### Weitere Sprachen

Zusätzliche Sprachen kommen als Sprachpaket. Das ist eine Datei mit der Endung `.featherlang`.

1. **Vorlage für Übersetzer** speichert eine Datei mit allen Texten. Du gibst Sprachcode, Name und optional den Übersetzer an.
2. Die Übersetzung trägt jemand in die Datei ein, siehe [Sprachpakete](../entwickler/sprachpakete.md).
3. **Sprachdatei importieren** übernimmt die fertige Datei. Alternativ legst du sie über **Ordner öffnen** in den Sprachordner und wählst **Aktualisieren**.

Texte ohne Übersetzung zeigt Feather auf Englisch. Fehlt das gewählte Paket, zeigt Feather Englisch. Exportierst du die Vorlage für eine vorhandene Sprache, enthält sie deren aktuelle Übersetzung, sodass du sie nach einem Update ergänzen kannst.

## Datenbank

Unter **Hilfen** schaltest du Funktionen von Feather SQL ein oder aus.

| Option | Wirkung |
| --- | --- |
| Intelligente Vorschläge | Vorschläge beim Schreiben von SQL |
| Änderungsverlauf | Merkt sich frühere Werte von Zellen |
| Gelöschte Zeilen sichern | Sichert Zeilen vor dem Löschen |

Darunter zeigt Feather, wie viel Verlauf gespeichert ist, und löscht ihn auf Wunsch. Details: [Feather SQL](feather-sql.md#änderungsverlauf).

## Terminal

| Option | Wirkung |
| --- | --- |
| Befehlsvorschläge | Liste passender Befehle beim Tippen |
| Hinweise bei Fehlern | Passender Befehl bei bekannten Fehlermeldungen |

Auch hier lässt sich der gespeicherte Befehlsverlauf löschen. Details: [Vorschläge](vorschlaege.md).

## Saveeye

Saveeye schützt Feather vor ungewollten Blicken, wenn der Bildschirm übertragen oder aufgenommen wird.

Ist Saveeye aktiv, überwacht Feather, ob ein Programm das Fenster mitschneidet. Erkannt werden Bildschirmübertragungen über Windows Graphics Capture, etwa in Discord, OBS, Teams, Zoom oder im Snipping Tool, sowie die Tasten **Druck** und **Windows + Umschalt**. Bei einer Aufnahme wird Feather unscharf, und eine Abfrage erscheint: „Du hast Feather Saveeye aktiv, willst du das andere dein Feather sehen?“

| Verhalten | Wirkung |
| --- | --- |
| Nachfragen | **Ja** zeigt Feather in der Aufnahme, **Nein** verbirgt es |
| Immer geschützt | Feather erscheint in jeder Aufnahme schwarz, auch in deinen eigenen Screenshots |

Mit **Beim Verlassen des Fensters verschwimmen** wird Feather außerdem unscharf, sobald du zu einem anderen Programm wechselst, etwa beim Auswählen eines Fensters zum Teilen.

Saveeye erkennt nicht jede Art der Aufnahme. Programme, die den Bildschirm über andere Verfahren kopieren, meldet Windows nicht. **Immer geschützt** ist die einzige Einstellung, die jede Aufnahme zuverlässig ausschließt.

## Sicherung

Die Sicherung speichert deine Daten in einer Datei mit der Endung `.featherbackup`.

Sie enthält Profile mit Services, gespeicherte Server und Zugangsdaten, Datenbankverbindungen, Einstellungen, Themen und Plugins. Mit **Daten der Services einschließen** sichert Feather zusätzlich die Datenverzeichnisse, etwa Datenbankinhalte. Dafür werden laufende Services kurz pausiert.

Gespeicherte Passwörter von Servern und Datenbanken nimmt Feather nur auf, wenn du ein Passwort für die Sicherung vergibst. Damit werden sie in der Datei verschlüsselt. Ohne Passwort enthält die Sicherung diese Zugangsdaten nicht. Das Passwort wird nirgends gespeichert. Ohne es lassen sich die verschlüsselten Zugangsdaten nicht wiederherstellen.

Zum Wiederherstellen wählst du die Datei, gibst das Passwort ein und startest die Wiederherstellung. Feather zeigt vorher den Inhalt der Sicherung und danach einen Bericht. So lassen sich auch alle Daten auf einen neuen Rechner übertragen.

Der Befehlsverlauf des Terminals und der Änderungsverlauf von Feather SQL sind nicht Teil der Sicherung.

## Plugins

Plugins erweitern Feather um Schaltflächen, Ansichten und Stile. Sie bestehen aus einer `.jar`-Datei.

- **Plugin hochladen (.jar)** wählt die Datei. Feather zeigt vor dem Laden Name, Autor und Version.
- Jedes Plugin lässt sich ein- und ausschalten und entfernen. **Plugin-Ordner öffnen** zeigt den Speicherort.
- Das mitgelieferte Beispiel **Rainbow Icons** lässt sich über **Beispiel „Rainbow Icons“ installieren** hinzufügen. Es färbt die Icons im Terminal-Bereich in Regenbogenfarben.

Plugins laufen mit den Rechten von Feather und können auf deine Dateien und das Netzwerk zugreifen. Installiere nur Plugins aus Quellen, denen du vertraust. Hinweise zur Entwicklung stehen unter [Plugins entwickeln](../entwickler/plugins.md).

## Allgemein

| Option | Wirkung |
| --- | --- |
| Im Hintergrund weiterlaufen | Beim Schließen des Fensters bleiben Services aktiv, Feather liegt im Infobereich der Taskleiste |
| Ruhemodus | Nach einer einstellbaren Zeit ohne Eingabe (Standard 10 Minuten) zeigt Feather einen schlafenden Roboter und pausiert Animationen, Unschärfe und das Cursor-Blinken. Jede Eingabe weckt Feather wieder auf |
| Einrichtungsassistent | Öffnet den Assistenten erneut |

Im Ruhemodus laufen Services, Terminals und Verbindungen unverändert weiter. Feather spart nur Darstellungsaufwand.
