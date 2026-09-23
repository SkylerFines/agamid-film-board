const installButton = document.querySelector('#install-app');
const installHelp = document.querySelector('#install-help');
const status = document.querySelector('#install-status');
const standalone = window.matchMedia('(display-mode: standalone)');
let pendingPrompt = null;

function updateInstallButton() {
  installButton.hidden = standalone.matches || window.navigator.standalone === true;
}
updateInstallButton();
standalone.addEventListener('change', updateInstallButton);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pendingPrompt = event;
});

installButton.addEventListener('click', async () => {
  if (!pendingPrompt) {
    status.textContent = '';
    installHelp.showModal();
    return;
  }
  const prompt = pendingPrompt;
  pendingPrompt = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      status.textContent = 'Finish any prompts from your browser, then look for Agamid Film in your phone’s apps.';
      installHelp.showModal();
    }
  } catch {
    status.textContent = 'Use your browser’s menu to finish installing.';
    installHelp.showModal();
  } finally {
    installButton.disabled = false;
  }
});

window.addEventListener('appinstalled', () => {
  pendingPrompt = null;
  installButton.hidden = true;
  status.textContent = 'Installation finished. Look for Agamid Film in your phone’s apps. You can drag its icon onto your home screen.';
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(error => {
    // Normal online use remains available if the browser blocks service workers.
    console.warn('Film Board offline screen could not be registered:', error.message);
  });
}
