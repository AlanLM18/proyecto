const { expect } = require('@playwright/test');

const ADMIN = {
  email: process.env.ADMIN_EMAIL || 'admin@biblioteca.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
};

// Sufijo único para que cada ejecución use datos distintos
const unico = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function iniciarSesion(page, { email, password } = ADMIN) {
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('vista-app')).toBeVisible();
}

async function tokenAdmin(request) {
  const res = await request.post('/api/auth/login', { data: ADMIN });
  expect(res.status()).toBe(200);
  return (await res.json()).data[0].token;
}

// Acepta automáticamente los confirm() de "¿Eliminar…?"
const aceptarDialogos = (page) => page.on('dialog', (d) => d.accept());

module.exports = { ADMIN, unico, iniciarSesion, tokenAdmin, aceptarDialogos };
