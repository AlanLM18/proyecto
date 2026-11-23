/* Frontend de la Biblioteca: login + CRUD de libros (productos), autores, categorías y usuarios.
 * Consume la API REST en /api (nginx la redirige al contenedor del backend).
 * Todas las respuestas de la API tienen la forma { statusCode, data: [] }. */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const estado = {
  token: sessionStorage.getItem('token'),
  usuario: JSON.parse(sessionStorage.getItem('usuario') || 'null'),
  libros: [],
  autores: [],
  categorias: [],
  usuarios: [],
};

// ---------------------------------------------------------------- API
async function api(ruta, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (estado.token) headers.Authorization = `Bearer ${estado.token}`;
  let res;
  try {
    res = await fetch(`/api${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No se pudo conectar con la API.');
  }
  const json = await res.json().catch(() => ({ statusCode: res.status, data: ['Respuesta no válida del servidor.'] }));
  if (res.status === 401 && ruta !== '/auth/login') {
    cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.');
  }
  if (!res.ok) throw new Error(json.data?.join(' ') || `Error ${res.status}`);
  return json.data;
}

// ---------------------------------------------------------------- utilidades de UI
const escapar = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let temporizador;
function mostrarMensaje(texto, tipo = 'exito') {
  const el = $('#mensaje');
  el.textContent = texto;
  el.className = `alerta alerta--${tipo}`;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (el.hidden = true), 4000);
}

function filas(tbody, items, plantilla, columnas) {
  tbody.innerHTML = items.length
    ? items.map(plantilla).join('')
    : `<tr><td colspan="${columnas}" class="vacio">Sin registros</td></tr>`;
}

async function verificarSalud() {
  const destinos = [$('#estado-api'), $('#estado-login')];
  try {
    const [salud] = await api('/health');
    for (const el of destinos) {
      el.textContent = `API en línea · ${salud.version}`;
      el.classList.add('estado--ok');
      el.classList.remove('estado--error');
    }
  } catch {
    for (const el of destinos) {
      el.textContent = 'API fuera de línea';
      el.classList.add('estado--error');
      el.classList.remove('estado--ok');
    }
  }
}

// ---------------------------------------------------------------- sesión
function mostrarVista() {
  const conSesion = Boolean(estado.token);
  $('#vista-login').hidden = conSesion;
  $('#vista-app').hidden = !conSesion;
  if (conSesion) {
    $('#usuario-actual').textContent = `${estado.usuario.nombre} (${estado.usuario.rol})`;
    cargarTodo();
  }
}

function cerrarSesion(aviso) {
  estado.token = null;
  estado.usuario = null;
  sessionStorage.clear();
  mostrarVista();
  if (aviso) {
    const err = $('#login-error');
    err.textContent = aviso;
    err.hidden = false;
  }
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.target));
  const err = $('#login-error');
  err.hidden = true;
  try {
    const [{ token, usuario }] = await api('/auth/login', { method: 'POST', body: datos });
    estado.token = token;
    estado.usuario = usuario;
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('usuario', JSON.stringify(usuario));
    e.target.reset();
    mostrarVista();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

$('#btn-salir').addEventListener('click', () => cerrarSesion());

// ---------------------------------------------------------------- pestañas
$$('.pestanas button').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.pestanas button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    $$('.seccion').forEach((s) => (s.hidden = s.id !== `sec-${btn.dataset.tab}`));
  })
);

// ---------------------------------------------------------------- carga de datos
async function cargarTodo() {
  verificarSalud();
  await Promise.allSettled([cargarCatalogos(), cargarLibros(), cargarUsuarios()]);
}

async function cargarCatalogos() {
  [estado.autores, estado.categorias] = await Promise.all([api('/autores'), api('/categorias')]);

  filas($('[data-testid=tabla-autores] tbody'), estado.autores,
    (a) => `<tr><td>${a.id}</td><td>${escapar(a.nombre)}</td><td>${escapar(a.nacionalidad || '—')}</td></tr>`, 3);
  filas($('[data-testid=tabla-categorias] tbody'), estado.categorias,
    (c) => `<tr><td>${c.id}</td><td>${escapar(c.nombre)}</td></tr>`, 2);
  $('[data-testid=contador-autores]').textContent = `(${estado.autores.length})`;
  $('[data-testid=contador-categorias]').textContent = `(${estado.categorias.length})`;

  const opciones = (items) =>
    '<option value="">Selecciona…</option>' + items.map((i) => `<option value="${i.id}">${escapar(i.nombre)}</option>`).join('');
  const form = $('#form-libro');
  const [autorSel, catSel] = [form.autorId.value, form.categoriaId.value];
  form.autorId.innerHTML = opciones(estado.autores);
  form.categoriaId.innerHTML = opciones(estado.categorias);
  form.autorId.value = autorSel;
  form.categoriaId.value = catSel;
}

async function cargarLibros() {
  estado.libros = await api('/libros');
  filas($('[data-testid=tabla-libros] tbody'), estado.libros, (l) => `
    <tr data-testid="fila-libro" data-id="${l.id}">
      <td>${l.id}</td><td>${escapar(l.titulo)}</td><td>${escapar(l.isbn)}</td><td>${l.anioPublicacion}</td>
      <td>${escapar(l.autor)}</td><td>${escapar(l.categoria)}</td>
      <td class="acciones-fila">
        <button class="boton boton--fantasma boton--chico" data-editar-libro="${l.id}" data-testid="editar-libro">Editar</button>
        <button class="boton boton--peligro boton--chico" data-eliminar-libro="${l.id}" data-testid="eliminar-libro">Eliminar</button>
      </td>
    </tr>`, 7);
  $('[data-testid=contador-libros]').textContent = `(${estado.libros.length})`;
}

async function cargarUsuarios() {
  estado.usuarios = await api('/usuarios');
  filas($('[data-testid=tabla-usuarios] tbody'), estado.usuarios, (u) => `
    <tr data-testid="fila-usuario" data-id="${u.id}">
      <td>${u.id}</td><td>${escapar(u.nombre)}</td><td>${escapar(u.email)}</td>
      <td><span class="rol">${u.rol}</span></td>
      <td class="acciones-fila">
        <button class="boton boton--fantasma boton--chico" data-editar-usuario="${u.id}" data-testid="editar-usuario">Editar</button>
        ${u.id === estado.usuario?.id ? '' : `<button class="boton boton--peligro boton--chico" data-eliminar-usuario="${u.id}" data-testid="eliminar-usuario">Eliminar</button>`}
      </td>
    </tr>`, 5);
  $('[data-testid=contador-usuarios]').textContent = `(${estado.usuarios.length})`;
}

// ---------------------------------------------------------------- libros
function limpiarFormLibro() {
  const f = $('#form-libro');
  f.reset();
  f.id.value = '';
  $('#titulo-form-libro').textContent = 'Nuevo libro';
}

$('#form-libro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const cuerpo = {
    titulo: f.titulo.value.trim(),
    isbn: f.isbn.value.trim(),
    anioPublicacion: Number(f.anioPublicacion.value),
    autorId: Number(f.autorId.value),
    categoriaId: Number(f.categoriaId.value),
  };
  try {
    if (f.id.value) {
      await api(`/libros/${f.id.value}`, { method: 'PUT', body: cuerpo });
      mostrarMensaje('Libro actualizado correctamente.');
    } else {
      await api('/libros', { method: 'POST', body: cuerpo });
      mostrarMensaje('Libro creado correctamente.');
    }
    limpiarFormLibro();
    await cargarLibros();
  } catch (ex) {
    mostrarMensaje(ex.message, 'error');
  }
});

$('[data-testid=tabla-libros]').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar-libro]');
  const eliminar = e.target.closest('[data-eliminar-libro]');
  if (editar) {
    const [libro] = await api(`/libros/${editar.dataset.editarLibro}`);
    const f = $('#form-libro');
    f.id.value = libro.id;
    f.titulo.value = libro.titulo;
    f.isbn.value = libro.isbn;
    f.anioPublicacion.value = libro.anioPublicacion;
    f.autorId.value = estado.autores.find((a) => a.nombre === libro.autor)?.id ?? '';
    f.categoriaId.value = estado.categorias.find((c) => c.nombre === libro.categoria)?.id ?? '';
    $('#titulo-form-libro').textContent = `Editar libro #${libro.id}`;
    f.titulo.focus();
  }
  if (eliminar && confirm('¿Eliminar este libro?')) {
    try {
      await api(`/libros/${eliminar.dataset.eliminarLibro}`, { method: 'DELETE' });
      mostrarMensaje('Libro eliminado correctamente.');
      await cargarLibros();
    } catch (ex) {
      mostrarMensaje(ex.message, 'error');
    }
  }
});

// ---------------------------------------------------------------- autores y categorías
$('#form-autor').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/autores', { method: 'POST', body: { nombre: e.target.nombre.value, nacionalidad: e.target.nacionalidad.value } });
    mostrarMensaje('Autor creado correctamente.');
    e.target.reset();
    await cargarCatalogos();
  } catch (ex) {
    mostrarMensaje(ex.message, 'error');
  }
});

$('#form-categoria').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/categorias', { method: 'POST', body: { nombre: e.target.nombre.value } });
    mostrarMensaje('Categoría creada correctamente.');
    e.target.reset();
    await cargarCatalogos();
  } catch (ex) {
    mostrarMensaje(ex.message, 'error');
  }
});

// ---------------------------------------------------------------- usuarios
function limpiarFormUsuario() {
  const f = $('#form-usuario');
  f.reset();
  f.id.value = '';
  $('#titulo-form-usuario').textContent = 'Nuevo usuario';
}

$('#form-usuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const cuerpo = { nombre: f.nombre.value, email: f.email.value, rol: f.rol.value };
  if (f.password.value) cuerpo.password = f.password.value;
  try {
    if (f.id.value) {
      await api(`/usuarios/${f.id.value}`, { method: 'PUT', body: cuerpo });
      mostrarMensaje('Usuario actualizado correctamente.');
    } else {
      await api('/usuarios', { method: 'POST', body: cuerpo });
      mostrarMensaje('Usuario creado correctamente.');
    }
    limpiarFormUsuario();
    await cargarUsuarios();
  } catch (ex) {
    mostrarMensaje(ex.message, 'error');
  }
});

$('[data-testid=tabla-usuarios]').addEventListener('click', async (e) => {
  const editar = e.target.closest('[data-editar-usuario]');
  const eliminar = e.target.closest('[data-eliminar-usuario]');
  if (editar) {
    const u = estado.usuarios.find((x) => x.id === Number(editar.dataset.editarUsuario));
    const f = $('#form-usuario');
    f.id.value = u.id;
    f.nombre.value = u.nombre;
    f.email.value = u.email;
    f.rol.value = u.rol;
    f.password.value = '';
    $('#titulo-form-usuario').textContent = `Editar usuario #${u.id}`;
    f.nombre.focus();
  }
  if (eliminar && confirm('¿Eliminar este usuario?')) {
    try {
      await api(`/usuarios/${eliminar.dataset.eliminarUsuario}`, { method: 'DELETE' });
      mostrarMensaje('Usuario eliminado correctamente.');
      await cargarUsuarios();
    } catch (ex) {
      mostrarMensaje(ex.message, 'error');
    }
  }
});

$$('[data-cancelar]').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.cancelar === 'libro' ? limpiarFormLibro() : limpiarFormUsuario()))
);

// ---------------------------------------------------------------- inicio
verificarSalud();
setInterval(verificarSalud, 30000);
mostrarVista();
