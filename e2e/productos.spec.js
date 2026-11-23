// Pruebas de frontend: CRUD de productos (libros) con sus autores y categorías
const { test, expect } = require('@playwright/test');
const { unico, iniciarSesion, aceptarDialogos } = require('./helpers');

test.describe('Frontend: CRUD de productos (libros)', () => {
  test('crear categoría y autor, y luego crear, editar y eliminar un libro', async ({ page }) => {
    const id = unico();
    const categoria = `Ciencia ${id}`;
    const autor = `Autora ${id}`;
    const titulo = `Libro E2E ${id}`;
    aceptarDialogos(page);
    await iniciarSesion(page);

    // Categoría
    await page.getByTestId('tab-categorias').click();
    await page.getByTestId('categoria-nombre').fill(categoria);
    await page.getByTestId('categoria-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('Categoría creada');
    await expect(page.getByTestId('tabla-categorias')).toContainText(categoria);

    // Autor
    await page.getByTestId('tab-autores').click();
    await page.getByTestId('autor-nombre').fill(autor);
    await page.getByTestId('autor-nacionalidad').fill('Mexicana');
    await page.getByTestId('autor-guardar').click();
    await expect(page.getByTestId('tabla-autores')).toContainText(autor);

    // Crear libro
    await page.getByTestId('tab-libros').click();
    await page.getByTestId('libro-titulo').fill(titulo);
    await page.getByTestId('libro-isbn').fill(`978${Date.now()}`.slice(0, 13));
    await page.getByTestId('libro-anio').fill('2025');
    await page.getByTestId('libro-autor').selectOption({ label: autor });
    await page.getByTestId('libro-categoria').selectOption({ label: categoria });
    await page.getByTestId('libro-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('Libro creado');

    const fila = page.getByTestId('fila-libro').filter({ hasText: titulo });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText(autor);

    // Editar libro
    await fila.getByTestId('editar-libro').click();
    await expect(page.getByTestId('libro-titulo')).toHaveValue(titulo);
    await page.getByTestId('libro-titulo').fill(`${titulo} editado`);
    await page.getByTestId('libro-guardar').click();
    await expect(page.getByTestId('mensaje')).toContainText('Libro actualizado');
    const filaEditada = page.getByTestId('fila-libro').filter({ hasText: `${titulo} editado` });
    await expect(filaEditada).toHaveCount(1);

    // Eliminar libro
    await filaEditada.getByTestId('eliminar-libro').click();
    await expect(page.getByTestId('mensaje')).toContainText('Libro eliminado');
    await expect(page.getByTestId('fila-libro').filter({ hasText: titulo })).toHaveCount(0);
  });

  test('muestra el error de validación de la API al guardar un libro incompleto', async ({ page }) => {
    await iniciarSesion(page);
    await page.getByTestId('libro-titulo').fill('Libro sin datos');
    await page.getByTestId('libro-guardar').click();
    await expect(page.getByTestId('mensaje')).toHaveClass(/alerta--error/);
    await expect(page.getByTestId('mensaje')).toContainText('ISBN');
  });
});
