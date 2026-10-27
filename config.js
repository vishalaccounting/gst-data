/* ============ SETTINGS (edit only this file) ============
   API_URL  : Google Apps Script Web App URL ( .../exec ).
              Leave '' to run in DEMO mode (data stays in this browser only).
   FIREBASE : optional – for real push notifications (see SETUP.md).          */
var CONFIG = {
  APP_NAME: 'Vishal Accounting Services',
  API_URL: 'https://script.google.com/macros/s/AKfycbxG-EroqmWhgSYwifkUZ7JPHCe49GQzHmQSqxnVOj5g-IwcxzEKfl7R8YWD2fbRsDcz/exec',
  FIREBASE: null,
  /* FIREBASE example:
  FIREBASE: {
    apiKey: '...', authDomain: '...', projectId: '...', messagingSenderId: '...', appId: '...',
    vapidKey: '...'
  }, */
  OFFICE_PHONE: '9359076851',   // "PIN भूल गए?" WhatsApp goes here (also editable in dashboard settings)
  MAX_FILE_MB: 25
};
