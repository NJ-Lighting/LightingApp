const APP_SHELL = [
  // Basis pagina's
  'index.html',
  'offline.html',
  'pages/about.html',
  'pages/addressing.html',
  'pages/dipswitch.html',
  'pages/gdtf.html',

  // PWA / configuratie
  'manifest.json',

  // Styles
  'css/style.css',
  'css/nav.css',

  // JavaScript
  'js/core.js',
  'js/state.js',
  'js/nav.js',
  'js/sw-register.js',         // laat dit matchen met de echte bestandsnaam
  'js/addressing.page.js',
  'js/dipswitch.page.js',
  'js/gdtf.page.js',
  'js/library.page.js',        // als jouw file zo heet; anders aanpassen

  // Icons (géén assets/, alles onder /icons/)
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
];
