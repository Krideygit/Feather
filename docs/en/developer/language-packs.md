# Language packs

Feather ships with German and English. Further languages come as a language pack: a JSON file with the extension `.featherlang`. This document describes the format, the rules and the workflow.

## How it works

The source texts of the interface are German. A language is a mapping from the German original text to the translation. Feather replaces interface texts based on this mapping as they are displayed. Texts that are missing from the mapping are not replaced.

Resolution order:

1. Translation from the selected language pack
2. English translation
3. German original text

An incomplete translation is therefore harmless: everything that is missing appears in English. The same applies to texts that are added after an update.

## Creating a template

**Settings › Language › Template for translators** creates a file with all texts. The template contains the English texts as values, so every line that is not edited stays English. For an already installed language the template contains its current translation. This lets you extend a pack after an update.

## File format

```json
{
  "format": 1,
  "hint": "Translate only the values on the right. …",
  "code": "tr",
  "name": "Türkçe",
  "author": "Ali Example",
  "version": "1.0.0",
  "strings": {
    "Abbrechen": "İptal",
    "Speichern": "Kaydet",
    "„{0}“ wurde erstellt.": "“{0}” oluşturuldu."
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `format` | no | File format, currently `1`. Feather rejects a higher number |
| `hint` | no | Note for translators, ignored |
| `code` | yes | Language code of two or three lowercase letters, optionally with a region, for example `tr`, `fr`, `pt-br`. `de` and `en` are reserved |
| `name` | yes | Display name of the language, at most 40 characters, written in that language |
| `author` | no | Name of the translator, at most 60 characters |
| `version` | no | Version of the translation, at most 20 characters, default `1.0.0` |
| `strings` | yes | Mapping from the original text (key) to the translation (value) |

The keys in `strings` must not be changed. Only the values are translated.

## Rules for translations

- **Placeholders** such as `{0}` or `{1}` stand for names, numbers or other text that Feather inserts. They must appear in the value as often as in the key. Their order may change. Feather skips entries with different placeholders on import.
- **Empty values** count as untranslated, Feather then shows English.
- **Whitespace** at the start and end of values is removed. In the keys, repeated spaces and line breaks of the original texts are already collapsed into a single space.
- **Unknown keys**, for example from an older version, are skipped and Feather reports the number.
- **Quotation marks** in values must be escaped with a backslash in JSON (`\"`). The typographic „…“ and “…” need no escaping.
- The file must be UTF-8. The maximum size is 4 MB.

You can edit the file with any text editor. An editor with JSON support finds syntax errors immediately.

## Installing

There are two ways:

- **Import language file** selects the file. Feather validates it, reports skipped entries and stores it.
- **Open folder** shows `%APPDATA%\Feather®\languages`. Feather recognizes a file with the extension `.featherlang` placed there after **Refresh**. Feather ignores faulty files in this folder.

On import, Feather writes the file as `<code>.featherlang` into the folder and removes an existing file with the same code. An imported pack with the same code therefore replaces the previous one.

The language applies immediately after selection. No restart is needed.

## Validation on import

Feather rejects a file if

- it is not valid JSON,
- it comes from a newer file format version,
- language code or name are missing or invalid,
- the code is `de` or `en`,
- the `strings` section is missing or contains no usable translations,
- the file is larger than 4 MB.

## Limits

- Interface texts are translated. Messages supplied by servers or plugins and your own data stay unchanged.
- The menu in the taskbar notification area uses the same packs. Native system dialogs, for example for file selection, follow the language of Windows.
- Texts in database tables, column names and terminal output are never translated.
