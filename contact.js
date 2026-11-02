const form = document.querySelector('#contactMessageForm');
const status = document.querySelector('#contactMessageStatus');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch('api/index.php?route=contact', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(result.error || 'Your message could not be sent. Please try again.');
    form.reset();
    status.textContent = result.message || 'Thanks for reaching out. Your message has been sent.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
