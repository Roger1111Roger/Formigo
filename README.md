# Formigo

A Chrome extension (Manifest V3) that fills web forms with test data. Similar to Fake Filler, but with adaptive field detection and the Faker library built in. The interface is available in 18 languages (including right-to-left Arabic), with light and dark themes.

## Installation

1. Unpack `formigo.zip` into any folder.
2. Open `chrome://extensions` and turn on "Developer mode".
3. Click "Load unpacked" and select the unpacked folder (the one containing `manifest.json`).
4. Optionally pin the extension icon to the toolbar.

### Firefox

Firefox 140 or newer (desktop) is supported from the same source code with its own build, `formigo-firefox.zip`.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on…" and pick `manifest.json` from the unpacked `formigo-firefox.zip` (or the zip itself).
3. The add-on stays loaded until Firefox restarts. A permanent install needs a build signed by Mozilla: upload the same zip to addons.mozilla.org (it can be unlisted).

## Usage

- **Alt+Z**: fill every field on the page, including fields in open dialogs and behind them.
- **Alt+X**: fill the current form (where the cursor is). If a modal is open, only the modal is filled: Formigo picks the dialog whose fields are actually visible on top (not covered and not scrolled off screen), taking z-index into account. If the cursor stayed on the page behind the dialog, the dialog is filled as well.
- **Alt+C** (or the "Current field" button in the popup): fill only the field that has the cursor or focus. For a custom dropdown or a drop zone, just click it. From the popup, the field that last had focus is used, including inside an iframe. Right-click → "Fill only this field" fills the element under the cursor.
- The **"Refill fields that already have a value"** checkbox (in the popup and in settings, on by default): filling again replaces existing values. When it is off, only empty fields are filled. Attached files are never replaced in either mode.
- **Alt+V** (or "Rule for a field" in the popup, or right-click → "Create a rule for this field"): create a custom rule right on the page. Hover over a field and click it. A panel opens with locator options: data-testid, id, name, Angular/Vue binding, exact label, XPath from the label, DOM path. Each option shows whether it is unique on the page and why it is robust or fragile. Below are actions for the value (built-in type, fixed value, digits only, custom list, leave the field alone) with a live example. The "Save rule" button puts the rule first in "Custom rules" and fills the field right away.
- **Alt+A**: show the detected type above each field. The labels disappear after 10 seconds or on any page change. Hovering a label shows what the decision was based on: label, attributes, nearby text, section heading and scores.
- Any shortcut can be changed in Settings, in the "Hotkeys" section (click the box and press the shortcut).
- The default data language is English. It can be switched in the extension popup to any of Faker's 76 languages.
- Right-click → **Formigo**: the same actions.

## Settings

The settings page (⚙ in the popup) is split into tabs, and everything is saved automatically:

- **Settings**: interface language (18 languages: English, русский, українська, español, português, deutsch, français, italiano, polski, nederlands, türkçe, Bahasa Indonesia, Tiếng Việt, हिन्दी, العربية, 简体中文, 日本語, 한국어), theme (system, light, dark), fill options with an explanation under each checkbox, and hotkeys, all on one page. Filling read-only date fields (datepicker) is off by default.
- **Files & types**: your own test files and an editor for 85 field types.
- **Custom rules**.
- **Import & export**.
- **About**: what the extension does (including file generation), version, shortcuts, licenses.

The theme can also be switched with a button in the popup. The colors match the logo: ink blue, cream and warm terracotta. The logo is an ant (formiga) carrying a form. The Inter and JetBrains Mono fonts ship inside the extension under the SIL Open Font License 1.1, so they are free for any use, including commercial.

## How a field is detected

Each source gives the field "points": the associated label and aria-label, the name/id/formcontrolname/data-test attributes (ignoring generated ones like mui-12, :r3:, input_5), placeholder, nearby text (div labels without `for`, table cells), and hints under the field. Then the section context is taken into account, i.e. the block heading, legend or container class: "Number" in a card block becomes a card number, in a passport block a passport number, in a vehicle block a license plate. A mask in the placeholder (`+7 (___)`, `yyyy-mm-dd`, `0000 0000 0000 0000`) sets the value format. Hints like "Exactly 13 digits required" set the length.
Supported: IMEI (15 digits with Luhn), serial number, MAC, model code/SKU, HEX color (including color-picker fields), entity name ("Name" in a color, task or lookup form doesn't turn into a person's name), hours and minutes (ngb-timepicker), income/expense/payment amounts, period length. A phone next to a separate country code selector (+27, +254, +7…) gets a national number of the right length. Checkboxes with a hidden input (`class="hidden"` with a label next to it) are ticked by clicking the visible "box" next to them, the way a user does (the "Random", "Always check" or "Always uncheck" mode is chosen in settings), and then newly shown fields are checked again.
There are types for vehicles (VIN/chassis, license plate, engine number, make, model, year, engine size, mileage, color, body type, fuel, transmission), future and past dates (inspection expiry, registration date), a date split into day/month/year fields, and document number.

The earlier approach was: `autocomplete` → HTML type (`email`, `tel`, `date`, `number`…) → RU/EN keywords in name, id, placeholder, label, aria-label, aria-labelledby, title, data-testid/data-qa, formcontrolname → nearby text when there is no label.
Types: first name, last name, patronymic, full name, login, e-mail and its confirmation, password and its confirmation, phone, company, job title, address/street/house/apartment/city/region/postal code/country, date of birth, age, gender, dates/times, website, bank card (number with Luhn, CVV, expiry, holder), IBAN/BIC, **Russian INN, SNILS and OGRN with valid checksums**, KPP, passport, SMS code, amounts/quantities, subject, comment.
`maxlength`, `minlength`, `pattern` and `min`/`max`/`step` are respected. First name, last name, e-mail and login are consistent within one fill; the password and e-mail confirmations match the originals.
Values are set through the native setter with `input`/`change`/`blur` events, so React, Vue and Angular see the changes. There is a character-by-character typing mode for masked fields.

## Lists, dates and files

- Dependent lists (make → model, category → body type) are filled once the page loads the options. Fields that appear after a selection are filled too.
- Tile lists without an input (divs selected by clicking, like "Let's select all") are selected by clicking: all of them if the label contains "all"/"все" or "Always check" is on, otherwise a random subset.
- Custom dropdowns (Chosen, Select2, bootstrap-select, ngbDropdown, ng-select, mat-select, Ant, MUI, role=combobox) are opened and an option is picked. Navigation menu links are left alone.
- Read-only datepicker fields get a date in the format from the placeholder or a datepicker attribute (`datepicker-pop="dd MMMM yyyy"`, `uib-datepicker-popup`, `data-date-format`). Fields like "Submitted on" get a recent past date.
- AngularJS `ng-pattern` and a visible "Must be numeric" hint are respected: the phone is written in digits. A secondary number differs from the primary one.
- Already attached files are not replaced: both the input itself and the drop zone's file list/preview are checked. A file can only be replaced explicitly, via "Current field".
- File upload fields: first Formigo works out which format the field expects. It looks at `accept` (extensions and MIME types), the drop zone text ("PDF, DOC up to 5 MB", "Upload CSV"…) and the field label ("Bank statement", "Price list", "Voice note"). If Settings → "Test files" has your own file of that format, it is used. Otherwise Formigo generates a valid file: PDF, DOCX, XLSX, CSV, JSON, XML, TXT, ZIP, WAV, SVG, GIF or a JPG/PNG/WEBP image. Documents contain the form data. Cyrillic text in generated PDFs is currently rendered as "?"; DOCX/XLSX/CSV handle it fine.
- Images also keep the expected format, and the content matches the field's meaning: a face photo (randomuser.me) for "client photo"/selfie/avatar, a drawn document card with the form data for "ID"/"passport"/"Front side", and a random photo (picsum.photos) for everything else. Offline, the image is drawn locally. The "Plain 15×15 PNG" mode is turned on in settings.

## Field types and their templates ("Files & types" tab)

For each of the 85 types you can adjust:

- **Detection**: a case-insensitive RegExp matched against the label, name/id, placeholder and nearby text. `\b` is a word boundary and works with Cyrillic, e.g. `\bimei\b|имей`. An empty string turns off detection for the type. A type without its own built-in rule (such as "Account number" or "Recent date") can get one.
- **Custom value**: `/35\d{13}/` generates from a RegExp, `qa+{{string.alphanumeric(6)}}@test.com` works as a template, and options listed one per line are picked at random. Empty means the built-in generator.
  The "Test a label" box instantly shows which type a given text resolves to. The ↺ button restores the built-in values. Type templates are included in the export file.

## Custom rules ("Custom rules" tab)

Finding the field: a **RegExp** on the field label, a **CSS** selector or **XPath**. Value:

- `Faker`: `person.firstName`, `number.int({"min":1,"max":99})`, `string.numeric(10)` (methods: https://fakerjs.dev/api)
- `Template`: `qa+{{string.alphanumeric(6)}}@example.com`, `{{profile.lastName}} {{profile.firstName}}`, `{{type.inn}}`
- `RegExp`: `[A-Z]{2}-\d{4}`; `List` (one option per line); `Type` (a built-in type); `Fixed`; `Skip`.
  A sample value is shown under each rule. In the "What to insert" field you can describe the value in your own words: "city", "6 digits", "1 to 100", "@company.com", "yes, no, maybe". Formigo suggests a matching Faker method, built-in type, RegExp or template with a live example, and clicking a suggestion sets the value type for you. The same suggestions are available in the "Rule for a field" panel.

## Sharing settings

"Import & export" tab: the "Download file" button saves a small `*.formigo.json` file (optionally with only rules and type templates). A colleague loads it with "Load file" and chooses to add the rules to their own (duplicates are skipped) or replace everything. Files in the old Fake Filler+ format are accepted too. The clipboard works as well: "Copy as text" / "Paste text".

## If something breaks after an update

Reload open tabs (F5): the old copy of the script in a tab disables itself after the extension updates, but a page that hasn't been reloaded may still show its errors in the console.

## Privacy

Formigo collects no data: settings and files stay in the browser. The full policy is in [PRIVACY.md](PRIVACY.md); its GitHub link works as the privacy policy URL for the Chrome Web Store and addons.mozilla.org.

## Building from source

```
npm install
node build.mjs      # Chrome build in dist/, Firefox build in dist-firefox/
npm test            # build and run end-to-end checks on test/site/bench.html
npm run lint:firefox  # Mozilla's web-ext lint on dist-firefox/
```

## Tests

`test/site/bench.html` gathers everything that has broken before onto one page: fields outside a form, a regular form, a tile list, a top-layer dialog (like Angular CDK 19+) and a z-index modal. `node test/e2e.mjs [path to chromium]` loads the built extension and checks:

- "Fill everything", "Current form" and "Current field", including with a dialog open;
- the default Alt+Z/X/C/V/A hotkeys and migration of old shortcuts;
- "Show field types": labels on every field and on top of the dialog;
- "Rule for a field" and the "What to insert" suggestions in the panel and in settings;
- "About": the store link and instant hotkey updates.

Without a path, the test uses `$CHROMIUM` or Playwright's Chromium (`npx playwright-core install chromium`). Each check prints ✓ or ✗, and the exit code is 1 on failure. Add each new feature to the page and to the checks right away so it doesn't get lost in the next update.
