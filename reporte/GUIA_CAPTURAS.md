# Guía paso a paso para las capturas del reporte

Guarda cada captura en `reporte/figuras/` con el **nombre exacto** que se indica en cada paso.
Esta guía usa lo que ya tienes:

- Repositorio de Docker Hub: **`alank10/webapp`**
- Instancia EC2: **`webapp-practica3`** (us-east-2, Ohio)

Antes de empezar, anota la **IP pública** de tu instancia: en EC2 → Instancias, mueve la tabla hacia la
derecha hasta la columna "Dirección IPv4 pública". En esta guía aparece como `TU_IP`.

---

## Parte 1: En tu computadora (PowerShell en la carpeta del proyecto)

Docker Desktop tiene que estar abierto.

### fig01-pruebas-local.png
```powershell
npm run test:coverage
```
Captura el final, donde salen la tabla de cobertura y `Tests: 51 passed`.

### fig02-docker-build.png
```powershell
docker build -t practica3-api .
```
Captura el final, donde sale `naming to docker.io/library/practica3-api:latest`.

### fig03-docker-run.png
```powershell
docker run -d --name practica3-test -p 8080:3000 practica3-api
```
Espera unos 15 segundos y ejecuta:
```powershell
docker ps
```
Captura cuando en la columna STATUS diga `(healthy)`. Si todavía dice `(health: starting)`, espera y repite `docker ps`.

### fig04-api-local.png
1. Abre `practica3.http` y verifica que la primera línea sea `@host = http://localhost:8080`.
2. Pulsa **Send Request** en este orden: **2** (crear categoría), **4** (crear autor), **7** (crear libro).
3. Pulsa **Send Request** en el **5** (GET libros) y captura la respuesta.
4. Al terminar, borra el contenedor de prueba:
   ```powershell
   docker rm -f practica3-test
   ```

---

## Parte 2: Docker Hub (usas tu repositorio `webapp`, no crees otro)

### fig05-dockerhub-token.png
1. Entra a hub.docker.com con tu cuenta **alank10**.
2. Ve a tu avatar (arriba a la derecha) → **Account settings** → **Personal access tokens** → **Generate new token**.
   - Descripción: `github-actions`
   - Permisos: **Read & Write**
3. Copia el token y guárdalo en un lugar seguro, porque solo se muestra una vez.
4. Captura la **lista de tokens**. **No captures el token en sí.**

---

## Parte 3: AWS EC2 (usas tu instancia `webapp-practica3`, no crees otra)

### fig06-ec2-instancia.png
En EC2 → **Instancias**, captura la lista donde se ve `webapp-practica3` **En ejecución** con
**3/3 comprobaciones**. Si la instancia está detenida, selecciónala → **Estado de la instancia** → **Iniciar instancia**.
Al iniciarla, la IP pública puede cambiar: vuelve a anotarla.

### fig07-security-group.png
Tu Security Group hoy tiene los puertos 22, 6061 y 8080. **Falta el 80.**
1. Selecciona la instancia → pestaña **Seguridad** → haz clic en **launch-wizard-1**.
2. **Editar reglas de entrada**.
3. **Agregar regla** → Tipo **HTTP** (puerto 80) → Origen **0.0.0.0/0**.
4. Elimina las reglas de los puertos **6061** y **8080**, que eran de la práctica anterior.
5. **Guardar reglas**.
6. Captura las reglas de entrada: deben quedar solo **22 (SSH)** y **80 (HTTP)**.

### fig08-ec2-docker.png
1. Desde PowerShell, en la carpeta donde está tu llave `.pem` (cambia `TU_LLAVE.pem` por su nombre real):
   ```powershell
   icacls .\TU_LLAVE.pem /inheritance:r /grant:r "$($env:USERNAME):R"
   ssh -i .\TU_LLAVE.pem ubuntu@TU_IP
   ```
   El `icacls` evita el error "UNPROTECTED PRIVATE KEY". La primera vez pregunta
   `Are you sure you want to continue connecting?`: escribe `yes`.
2. Ya dentro del servidor, revisa Docker:
   ```bash
   docker --version
   docker ps
   ```
   - Si dice `command not found`, instala Docker:
     ```bash
     sudo apt-get update && sudo apt-get install -y docker.io curl
     sudo systemctl enable --now docker
     ```
   - Si dice `permission denied`, da permiso al usuario, sal y vuelve a entrar con el mismo `ssh`:
     ```bash
     sudo usermod -aG docker ubuntu
     exit
     ```
3. Si `docker ps` muestra un contenedor viejo de la práctica anterior, elimínalo para que no estorbe
   (cambia `NOMBRE` por el de la última columna de `docker ps`):
   ```bash
   docker rm -f NOMBRE
   ```
4. Ejecuta `docker --version && docker ps` y captura el resultado.
5. Escribe `exit` para salir del servidor.

---

## Parte 4: GitHub

1. En github.com crea un repositorio nuevo, **sin README**. Puede ser público.
2. En PowerShell, en la carpeta del proyecto:
   ```powershell
   git init
   git add .
   git commit -m "API con pipeline CI/CD"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   ```
   **Todavía no hagas push.**

### fig09-github-secrets.png
En el repositorio: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
Crea estos 5 (el nombre tiene que ser exacto):

| Secret | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | `alank10` |
| `DOCKERHUB_TOKEN` | el token de la Parte 2 |
| `EC2_HOST` | la IP pública de tu instancia (solo números, sin `http://`) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | abre tu `.pem` con el Bloc de notas y pega **todo**, incluidas las líneas `-----BEGIN ...` y `-----END ...` |

Captura la lista de secrets. Los valores no se ven, así que es seguro.

---

## Parte 5: El pipeline

```powershell
git push -u origin main
```
Abre la pestaña **Actions** del repositorio y entra a la ejecución que apareció.

### fig10-actions-pipeline.png
Captura la ejecución con los 3 jobs en verde: **Pruebas y cobertura → Construir y publicar imagen → Desplegar en AWS EC2**.

### fig11-actions-cobertura.png
Entra al job **Pruebas y cobertura**, abre el paso **Resumen de cobertura** y captura la tabla.
Otra opción es capturar el resumen que aparece abajo en la página principal de la ejecución.

### fig12-dockerhub-tags.png
En Docker Hub abre **alank10/webapp** → pestaña **Tags**. Deben aparecer `latest` y una etiqueta larga
(el hash del commit). Captura esa lista.

### fig13-deploy-log.png
Entra al job **Desplegar en AWS EC2**, abre el paso **Actualizar el contenedor en EC2 por SSH** y captura
el final del log, donde dice `Despliegue correcto: la API responde en el puerto 80`.

### fig14-api-ec2.png
Abre en el navegador:
```
http://TU_IP/api/categorias
```
Captura la página con la dirección visible. Debe mostrar `{"statusCode":200,"data":[]}`.

> Si algún job sale en rojo, ábrelo y lee el error. Los más comunes:
> - **Login a Docker Hub falla:** revisa `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN`.
> - **El deploy no conecta (timeout / handshake):** revisa `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` y que el puerto 22 esté abierto.
> - **`permission denied` en docker:** falta el `usermod` de la Parte 3.
> - **`port is already allocated`:** hay otro contenedor usando el puerto 80; elimínalo con `docker rm -f`.
>
> Después de corregirlo, en Actions pulsa **Re-run all jobs**.

---

## Parte 6: Demo en vivo (también sirve para la presentación)

### fig15-demo-antes.png
Abre en el navegador:
```
http://TU_IP/api/cualquier-cosa
```
Captura el mensaje `Ruta no encontrada: GET /api/cualquier-cosa`.

### fig16-demo-despues.png
1. En `src/app.js` cambia el texto `Ruta no encontrada` por `Ruta no encontrada (v2)` y guarda.
2. En PowerShell:
   ```powershell
   git commit -am "Cambio de mensaje para demo"
   git push
   ```
3. Espera a que el pipeline termine en Actions (unos 2 a 3 minutos).
4. Recarga la misma URL y captura el mensaje nuevo con `(v2)`.

---

## Parte 7: Compilar el PDF

1. Comprime la carpeta `reporte/` en un `.zip`. Debe incluir `reporte.tex` y la carpeta `figuras/` con tus 16 capturas.
2. En overleaf.com: **New Project** → **Upload Project** → sube el `.zip`.
3. En la portada de `reporte.tex` cambia: universidad, facultad, carrera, integrantes, matrículas, profesor y ciudad.
4. Si tienes el logo de la institución, súbelo como `figuras/logo.png` y aparecerá en la portada.
5. Pulsa **Recompile** y descarga el PDF.

### Lista de capturas
| # | Archivo | Qué muestra |
|---|---|---|
| 1 | fig01-pruebas-local.png | Pruebas y cobertura en tu PC |
| 2 | fig02-docker-build.png | Construcción de la imagen |
| 3 | fig03-docker-run.png | Contenedor `healthy` |
| 4 | fig04-api-local.png | API respondiendo en localhost:8080 |
| 5 | fig05-dockerhub-token.png | Token de Docker Hub |
| 6 | fig06-ec2-instancia.png | Instancia EC2 en ejecución |
| 7 | fig07-security-group.png | Puertos 22 y 80 |
| 8 | fig08-ec2-docker.png | Docker en la EC2 |
| 9 | fig09-github-secrets.png | Secrets de GitHub |
| 10 | fig10-actions-pipeline.png | Pipeline en verde |
| 11 | fig11-actions-cobertura.png | Cobertura en el pipeline |
| 12 | fig12-dockerhub-tags.png | Tags `latest` y hash |
| 13 | fig13-deploy-log.png | Log del despliegue |
| 14 | fig14-api-ec2.png | API en la IP pública |
| 15 | fig15-demo-antes.png | Mensaje antes del cambio |
| 16 | fig16-demo-despues.png | Mensaje después del push |
