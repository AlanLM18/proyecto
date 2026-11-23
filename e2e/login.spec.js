// Pruebas de frontend: inicio y cierre de sesión
const { test, expect } = require('@playwright/test');
const { ADMIN, iniciarSesion } = require('./helpers');

test.describe('Frontend: login', () => {
  test('muestra el formulario de inicio de sesión y el estado de la API', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Biblioteca/);
    await expect(page.getByTestId('vista-login')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toHaveText('Iniciar sesión');
    await expect(page.getByTestId('estado-api-login')).toContainText('API en línea');
  });

  test('con contraseña incorrecta muestra un error y no entra al panel', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-email').fill(ADMIN.email);
    await page.getByTestId('login-password').fill('contraseña-incorrecta');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('incorrectos');
    await expect(page.getByTestId('vista-app')).toBeHidden();
  });

  test('con credenciales válidas entra al panel y puede cerrar sesión', async ({ page }) => {
    await iniciarSesion(page);
    await expect(page.getByTestId('usuario-actual')).toContainText('Administrador');
    await expect(page.getByTestId('estado-api')).toContainText('API en línea');
    await expect(page.getByTestId('tab-libros')).toBeVisible();

    await page.getByTestId('btn-salir').click();
    await expect(page.getByTestId('vista-login')).toBeVisible();
  });

  test('la sesión se conserva al recargar la página', async ({ page }) => {
    await iniciarSesion(page);
    await page.reload();
    await expect(page.getByTestId('vista-app')).toBeVisible();
  });
});
