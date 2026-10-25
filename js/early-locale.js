'use strict';
try {
  if (localStorage.getItem('ptlg') === 'ar') {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }
} catch (e) {
  // Storage can be unavailable in restricted webviews; the app sets locale again after startup.
}
