// Pruebas de frontend: CRUD de usuarios
const { test, expect } = require('@playwright/test');
const { unico, iniciarSesion, aceptarDialogos } = require('./helpers');

test.describe('Frontend: CRUD de usuarios', () => {
  test('crear un usuario, iniciar sesión con él, editarlo y eliminarlo', async ({ page }) => {
    const email = `e2e.${unico()}@biblioteca.com`;
    aceptarDialogos(page);
    await iniciarSesion(page);

    // Crear
    await page.getByTestId('tab-usuarios').click();
    await page.getByTestId('usuario-nombre').fill('Usuario E2E');
    await page.getByTestId('usuario-email').fill(email);
    await page.getByTestId('usuario-password').fill('clave123');
    await page.getByTestId('usuario-rol').selectOption('editor');
    await page.getByTestId('usuario-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('Usuario creado');
    await expect(page.getByTestId('fila-usuario').filter({ hasText: email })).toContainText('editor');

    // El nuevo usuario puede iniciar sesión
    await page.getByTestId('btn-salir').click();
    await iniciarSesion(page, { email, password: 'clave123' });
    await expect(page.getByTestId('usuario-actual')).toContainText('Usuario E2E');
    await page.getByTestId('btn-salir').click();

    // Editar (como administrador)
    await iniciarSesion(page);
    await page.getByTestId('tab-usuarios').click();
    const fila = page.getByTestId('fila-usuario').filter({ hasText: email });
    await fila.getByTestId('editar-usuario').click();
    await page.getByTestId('usuario-nombre').fill('Usuario E2E Editado');
    await page.getByTestId('usuario-rol').selectOption('admin');
    await page.getByTestId('usuario-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('Usuario actualizado');
    await expect(fila).toContainText('Usuario E2E Editado');
    await expect(fila).toContainText('admin');

    // Eliminar
    await fila.getByTestId('eliminar-usuario').click();
    await expect(page.getByTestId('mensaje')).toContainText('Usuario eliminado');
    await expect(page.getByTestId('fila-usuario').filter({ hasText: email })).toHaveCount(0);
  });

  test('no permite crear un usuario con correo inválido', async ({ page }) => {
    await iniciarSesion(page);
    await page.getByTestId('tab-usuarios').click();
    await page.getByTestId('usuario-nombre').fill('Correo malo');
    await page.getByTestId('usuario-email').fill('no-es-un-correo');
    await page.getByTestId('usuario-password').fill('clave123');
    await page.getByTestId('usuario-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('correo electrónico no es válido');
  });
});
