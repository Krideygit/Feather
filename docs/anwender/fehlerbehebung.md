# Fehlerbehebung

## Das Fenster bleibt leer oder grau

Stürzt die Oberfläche ab, zeigt Feather den Hinweis „Feather ist auf einen Fehler gestoßen“ mit der Fehlermeldung und der Schaltfläche **Neu laden**. Deine Daten sind davon nicht betroffen.

Bleibt das Fenster ohne Hinweis leer, beendet du Feather vollständig (auch über das Symbol im Infobereich der Taskleiste) und startest es neu. Tritt das Problem wieder auf, hilft das Protokoll. Es liegt unter `%APPDATA%\Feather®\feather.log` und enthält Fehler der Oberfläche mit Zeitpunkt. Hänge die letzten Zeilen an eine Fehlermeldung an.

## Ein Service startet nicht

- **Port belegt:** Ein anderes Programm nutzt den Port. Ändere den Port des Services unter **Einstellungen** in der Detailansicht.
- **Download fehlgeschlagen:** Prüfe die Internetverbindung. Beim erneuten Anlegen versucht Feather den Download erneut.
- **Fehlermeldung im Log:** Der Reiter **Logs** der Detailansicht zeigt die Ausgabe des Dienstes.
- **Antivirus:** Manche Virenscanner sperren heruntergeladene Programme. Nimm den Ordner `%USERPROFILE%\.feather` in die Ausnahmen auf.

## Verbindung zum Server schlägt fehl

| Meldung | Ursache und Lösung |
| --- | --- |
| Anmeldung fehlgeschlagen | Benutzername, Passwort oder Schlüssel prüfen. Manche Server erlauben keine Passwortanmeldung. |
| Der Schlüssel dieses Servers hat sich geändert | Der Server wurde neu installiert, oder jemand lenkt die Verbindung um. Prüfe den Fingerabdruck über einen anderen Weg, bevor du vertraust. |
| Zeitüberschreitung | Server nicht erreichbar, Firewall blockiert Port 22, oder Adresse falsch |
| SFTP nicht aktiviert | Der Server bietet kein SFTP an. Das Terminal funktioniert trotzdem. |

## Server-Module

- **Das System wird nicht unterstützt:** Module brauchen einen der Paketverwalter `apt`, `dnf`, `yum`, `zypper`, `pacman` oder `apk` sowie `systemd` oder OpenRC.
- **Passwort für sudo:** Hat dein Konto keine Rechte ohne Passwort, fragt Feather nach dem sudo-Passwort. Feather speichert es nicht.
- **MariaDB lehnt den Zugriff ab:** Feather meldet sich als Systemkonto über den Socket an (`unix_socket`). Hat der Benutzer `root` ein Passwort bekommen, funktioniert das nicht. Setze die Anmeldung von `root` auf `unix_socket` zurück oder nutze eigene Zugangsdaten.
- **Dienst läuft nicht:** Starte ihn im Kopf des Moduls oder prüfe den Reiter **Logs**.

## Feather SQL

- **Verbindung fehlgeschlagen:** Prüfe, ob der Dienst läuft, und ob der gespeicherte Benutzer noch existiert. Im Modul zeigt **Zugangsdaten** alle gespeicherten Zugänge.
- **Zeile lässt sich nicht ändern:** Die Tabelle hat keinen Primärschlüssel, oder die Spalte enthält Binärdaten.
- **Keine Vorschläge:** Prüfe **Einstellungen › Datenbank › Intelligente Vorschläge**. Das Schema wird beim ersten Vorschlag geladen, das kann bei großen Datenbanken einen Moment dauern.

## Terminal

- **Keine Vorschläge:** Die Liste erscheint nur an einem Shell-Prompt. Prüfe **Einstellungen › Terminal**. Strg + Leertaste öffnet die Liste auf Wunsch.
- **Tab vervollständigt keine Dateinamen:** Bei sichtbarer Liste übernimmt Tab den Vorschlag. Schließe sie mit Esc, dann arbeitet Tab wie in der Shell.
- **Umlaute sind verzerrt:** Der Server muss UTF-8 verwenden. Setze `LANG=de_DE.UTF-8` oder `LANG=C.UTF-8`.

## Saveeye

Saveeye zeigt das Fenster unscharf, obwohl keine Aufnahme läuft: Ein Programm im Hintergrund greift auf den Bildschirm zu, etwa ein Aufnahme- oder Fernwartungsprogramm. Beende es oder schalte Saveeye ab.

## Sicherung

- **Wiederherstellung meldet ein falsches Passwort:** Das Passwort muss dem entsprechen, das beim Erstellen vergeben wurde. Ohne Passwort lassen sich nur die Teile ohne Zugangsdaten wiederherstellen.
- **Sicherung wird sehr groß:** Deaktiviere **Daten der Services einschließen**, wenn du nur Konfiguration brauchst.

## Alles zurücksetzen

Beende Feather und benenne die Ordner `%APPDATA%\Feather®` und `%USERPROFILE%\.feather` um. Beim nächsten Start legt Feather beides neu an und zeigt den Einrichtungsassistenten. Die umbenannten Ordner enthalten deine alten Daten, falls du etwas zurückholen möchtest.
