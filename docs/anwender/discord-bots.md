# Discord-Bots

Das Package **Discord-Server** baut Discord-Bots aus Knoten, ähnlich wie der Blueprint-Editor SQL-Abfragen. Du testest den Bot in einem Simulator, ohne dass Discord nötig ist, und stellst ihn danach auf einem Server bereit, wo er dauerhaft läuft.

Du findest das Package unter **Packages › Kommunikation**. Der Knopf **Öffnen** zeigt deine Bots und legt neue an.

## Bot anlegen

Ein neuer Bot braucht einen Namen und einen Startpunkt:

| Vorlage | Inhalt |
| --- | --- |
| Leer | Eine leere Arbeitsfläche |
| Ping und Hilfe | `/ping` antwortet mit Pong, `!hilfe` im Chat zeigt eine Hilfe |
| Willkommen und Rolle | Begrüßt neue Mitglieder im Kanal `willkommen` und gibt ihnen eine Rolle |
| Zähler und Zufall | `!würfel` würfelt, `!zähle` zählt hoch und merkt sich den Stand |

Bots liegen auf deinem Rechner und speichern sich beim Bearbeiten automatisch. Rechtsklick auf einen Bot in der Liste: umbenennen, duplizieren, löschen.

## Knoten

Ein Bot besteht aus Ereignissen, die Abläufe starten, und Knoten, die der Ablauf nacheinander durchläuft. Ziehe Knoten aus der Liste links auf die Fläche oder klicke sie an, und verbinde den Ausgang eines Knotens mit dem Eingang des nächsten. Ein Ausgang darf mit mehreren Knoten verbunden sein, sie laufen dann nacheinander.

| Gruppe | Knoten |
| --- | --- |
| Ereignisse | Bot gestartet, Nachricht empfangen, Slash-Befehl, Mitglied beigetreten, Mitglied verlassen, Zeitplan |
| Ablauf | Bedingung, Hat Rolle, Zufall, Variable, Warten |
| Ausgabe | Nachricht senden, Antworten, Embed senden, Reagieren, Konsole |
| Mitglieder | Rolle geben, Rolle entfernen, Mitglied kicken, Nachricht löschen |
| Sonstiges | Status setzen, Kommentar |

Bedingungen, Hat Rolle und Zufall haben zwei Ausgänge, **Ja** und **Nein**. Ein Rechtsklick auf einen Knoten dupliziert oder entfernt ihn und trennt seine Verbindungen.

### Platzhalter

In Texten setzt Feather beim Ausführen Werte ein:

| Platzhalter | Wert |
| --- | --- |
| `{user}` | Erwähnung des Mitglieds |
| `{username}`, `{userid}` | Name und ID des Mitglieds |
| `{content}` | Text der Nachricht, bei Slash-Befehlen die Eingabe |
| `{arg1}` bis `{arg9}` | Wörter der Nachricht |
| `{rest}`, `{args}` | Alle Wörter ohne das erste, alle Wörter |
| `{option}` | Eingabe eines Slash-Befehls |
| `{channel}`, `{server}`, `{members}` | Kanalname, Servername, Zahl der Mitglieder |
| `{var.name}` | Wert einer Variablen |
| `{random:1-6}` | Zufallszahl im Bereich |
| `{time}` | Uhrzeit als `HH:MM` |

Variablen merkt sich der Bot dauerhaft in der Datei `data.json` neben dem Programm.

## Simulator

Unter der Arbeitsfläche testest du den Bot im Reiter **Simulator**:

- Im Chat schreibst du als Testmitglied Nachrichten in einen Kanal. Der Bot antwortet dort.
- Rechts löst du Ereignisse aus: Bot starten, Beitritt, Austritt, Zeitpläne und Slash-Befehle mit Eingabe.
- Name und Rollen des Testmitglieds stellst du selbst ein. So prüfst du etwa „Hat Rolle“.
- Knoten, die gelaufen sind, leuchten kurz grün auf. Die Konsole zeigt Ausgaben und Variablen.

Der Simulator verändert nichts auf Discord. Pausen werden übersprungen. Rollen, Kicks und gelöschte Nachrichten erscheinen als Hinweis im Chat.

## Prüfung

Der Reiter **Prüfung** listet Fehler und Hinweise, etwa einen ungültigen Befehlsnamen, fehlenden Text oder einen Knoten ohne Verbindung. Ein Klick springt zum Knoten. Solange Fehler offen sind, ist **Auf Server bereitstellen** gesperrt. Der Reiter **Code** zeigt das erzeugte Node.js-Programm mit `discord.js`.

## Auf einem Server bereitstellen

Voraussetzung ist eine offene SSH-Verbindung im Bereich **Terminal** und Node.js 18 oder neuer auf dem Server.

1. Lege im [Discord Developer Portal](https://discord.com/developers/applications) eine Anwendung mit einem Bot an und lade ihn über OAuth2 auf deinen Server ein.
2. Aktiviere bei Bedarf unter **Bot** den **Message Content Intent** (für „Nachricht empfangen“) und den **Server Members Intent** (für Beitritt und Austritt). Der Dialog in Feather nennt, was dein Bot braucht.
3. Klicke in Feather auf **Auf Server bereitstellen**, wähle die Verbindung und den Ordner und füge den Bot-Token ein.
4. **Hochladen** legt den Ordner an und lädt `index.js`, `package.json`, `run.sh` und `stop.sh` hoch. Mit **Nach dem Hochladen starten** installiert `run.sh` die Pakete und startet den Bot im Hintergrund, mit `pm2`, falls vorhanden, sonst mit `nohup`.

Der Token wird nur in die Datei `.env` auf dem Server geschrieben, die nur der Besitzer lesen kann. Feather speichert ihn nicht. Beim erneuten Hochladen bleibt ein vorhandener Token erhalten, wenn du das Feld leer lässt. Gib die optionale Server-ID an, damit Slash-Befehle sofort erscheinen. Ohne sie kann es bis zu einer Stunde dauern.

Mit **Shortcuts anlegen** erscheinen rechts am Terminal Buttons zum Starten, Stoppen und für das Protokoll des Bots, siehe [Shortcuts](server.md#shortcuts). Nach einer Änderung am Bot lädst du ihn erneut hoch und startest ihn neu.

## Grenzen

- Der Bot ist ein eigenständiges Programm. Er läuft nur, solange der Server läuft und `run.sh` ihn gestartet hat.
- Rollen, Kanäle und Befehle sucht der Bot über ihren Namen. Der Name muss auf dem Discord-Server genau so existieren.
- Für Rollen, Kicks und das Löschen von Nachrichten braucht der Bot die passenden Rechte, und seine Rolle muss über den Rollen stehen, die er vergibt.
