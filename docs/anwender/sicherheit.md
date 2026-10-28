# Sicherheit und Datenschutz

Feather arbeitet lokal. Es gibt kein Benutzerkonto und keine Übermittlung von Nutzungsdaten. Netzwerkverbindungen entstehen nur zu Servern, die du angibst, und zu den Quellen für Downloads.

## Gespeicherte Daten

| Daten | Ort | Schutz |
| --- | --- | --- |
| Passwörter und Passphrasen von Servern | `%APPDATA%\Feather®\remote-hosts.json` | Verschlüsselt über den Speicher des Windows-Benutzerkontos |
| Zugangsdaten zu Datenbanken | `%APPDATA%\Feather®\sql-connections.json` | Passwort verschlüsselt wie oben |
| Bekannte Server-Schlüssel | `%APPDATA%\Feather®\known-hosts.json` | Nur Fingerabdrücke, keine Geheimnisse |
| Änderungsverlauf von Feather SQL | `%APPDATA%\Feather®\sql-history.json` | Verschlüsselt |
| Befehlsverlauf des Terminals | `%APPDATA%\Feather®\terminal-history.json` | Verschlüsselt |
| Einstellungen und Themen | `%APPDATA%\Feather®\settings.json` | Unverschlüsselt, enthält keine Geheimnisse |
| Discord-Bots, Shortcuts, Blueprints | Browser-Speicher von Feather im Ordner `%APPDATA%\Feather®` | Unverschlüsselt. Bot-Token und Passwörter speichert Feather dort nie |
| Services, Datenbanken, Plugins | `%USERPROFILE%\.feather` | Unverschlüsselt im Dateisystem |

Verschlüsselte Daten sind an dein Windows-Benutzerkonto gebunden. Ein anderer Benutzer oder ein anderer Rechner kann sie nicht lesen. Steht die Verschlüsselung des Betriebssystems nicht zur Verfügung, speichert Feather keine Passwörter und fragt bei jeder Verbindung danach. Die Verläufe liegen in diesem Fall unverschlüsselt vor.

Die Daten deiner lokalen Datenbanken liegen im Ordner des jeweiligen Services. Wer Zugriff auf dein Benutzerkonto hat, kann sie lesen. Nutze für sensible Daten die Festplattenverschlüsselung von Windows.

## Verbindungen

- **SSH und SFTP:** Feather prüft den Fingerabdruck des Servers. Ein unbekannter Schlüssel erfordert deine Bestätigung. Ein geänderter Schlüssel löst eine ausdrückliche Warnung aus.
- **Datenbanken auf Servern:** Feather verbindet sich über einen SSH-Tunnel zu `127.0.0.1` des Servers. Der Datenbankport muss nicht öffentlich erreichbar sein. Aktiviere den Fernzugriff einer Datenbank nur, wenn du ihn brauchst, und beschränke Benutzer auf die nötigen Hosts.
- **FTP:** Ohne TLS sendet FTP Zugangsdaten unverschlüsselt. Nutze SFTP oder FTP mit TLS, wo immer es möglich ist.
- **Lokale Services:** Datenbanken und Webserver lauschen nur auf `127.0.0.1` und sind damit nur von deinem Rechner erreichbar. Game-Server aus dem Bereich Packages (Minecraft, FiveM) nehmen Verbindungen aus dem Netzwerk an, damit sich Mitspieler verbinden können. Gib ihren Port in der Firewall nur frei, wenn du das willst.

## Downloads

Beim Anlegen von Services lädt Feather Programme aus den offiziellen Quellen der Hersteller:

| Dienst | Quelle |
| --- | --- |
| MariaDB | downloads.mariadb.org |
| Nginx | nginx.org |
| Apache | apachelounge.com |
| Minecraft | piston-meta.mojang.com |
| Paper | fill.papermc.io |
| FiveM | changelogs-live.fivem.net, github.com/citizenfx |
| Mailpit | api.github.com, github.com/axllent/mailpit |
| Discord-Bots (auf dem Server) | registry.npmjs.org (discord.js, dotenv) |
| MariaDB-Treiber für Java | repo1.maven.org |

## Saveeye

Saveeye reduziert das Risiko, dass Inhalte bei Bildschirmübertragungen oder Screenshots sichtbar werden. Die Erkennung stützt sich auf Auskünfte von Windows und deckt nicht jedes Programm ab. Wer sichergehen will, wählt **Immer geschützt**. Siehe [Einstellungen](einstellungen.md#saveeye).

## Plugins

Plugins sind Java-Programme und laufen mit den vollen Rechten von Feather. Sie können Dateien lesen, Netzwerkverbindungen öffnen und Befehle ausführen. Feather zeigt vor der Installation Name, Autor und Version, prüft den Code aber nicht. Installiere nur Plugins aus vertrauenswürdigen Quellen.

## Verlauf löschen

| Daten | Wo |
| --- | --- |
| Änderungsverlauf | Einstellungen › Datenbank |
| Befehlsverlauf | Einstellungen › Terminal |
| Gespeicherte Server und Zugangsdaten | Server entfernen im Reiter Verbindungen, Zugangsdaten im Modul unter Zugangsdaten |
| Alles | Ordner `%APPDATA%\Feather®` und `%USERPROFILE%\.feather` löschen, wenn Feather beendet ist |
