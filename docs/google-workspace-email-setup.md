# Google Workspace Email Setup

This setup removes EmailJS from the normal order flow, sends booking requests through Google Workspace, and stores orders, busy slots and expenses in a Google Sheet. The operator app can also upload cargo photos to Google Drive under each order.

## Flow

Website form -> Google Apps Script Web App -> `info@arides.ee` + Google Sheet

## 1. Create the Apps Script

1. Log in to Google as `info@arides.ee`.
2. Open https://script.google.com/.
3. Create a new project named `ARIDES Cargo Website Mailer`.
4. Paste the code from `docs/google-workspace-mailer.gs` into `Code.gs`.
5. Save the project.

## 2. Deploy it

1. Click `Deploy` -> `New deployment`.
2. Select type: `Web app`.
3. Description: `ARIDES Cargo booking form`.
4. Execute as: `Me`.
5. Who has access: `Anyone`.
6. Click `Deploy`.
7. Approve the requested Mail, Sheets and Drive permissions.
8. Copy the Web app URL ending with `/exec`.

The script must be deployed from `info@arides.ee`; then messages are sent by that Workspace account.

On first use, the script creates a spreadsheet named `ARIDES Cargo Orders` in that Google Drive account. It contains:

- `Orders`: website and operator orders
- `BusySlots`: manually blocked calendar times
- `Expenses`: synchronized service/business expenses
- `CargoPhotos`: order photo links and metadata

The first cargo photo upload also creates a Drive folder named `ARIDES Cargo Photos`. The script stores each cargo photo in that folder and writes the Drive link back to `CargoPhotos`.

## 3. Connect the website

Open `app.js` and paste the Web app URL here:

```js
const GOOGLE_WORKSPACE_FORM_ENDPOINT = "";
```

Example:

```js
const GOOGLE_WORKSPACE_FORM_ENDPOINT = "https://script.google.com/macros/s/.../exec";
```

After this, the website sends booking requests through Google Workspace.

## 4. Test

1. Open the site.
2. Send a test order with your own phone number.
3. Check the inbox and Sent folder of `info@arides.ee`.
4. Reply to the email: it should reply to the customer email if the customer entered one.
5. Open the operator app and press `Uuenda` to pull the stored order.
6. In the operator app, open a trip and press `Pildista koorem`; after upload, the photo should appear in Drive and in the `CargoPhotos` sheet.
