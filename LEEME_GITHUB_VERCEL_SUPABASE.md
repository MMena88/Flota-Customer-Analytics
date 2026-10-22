# Puma Comercial SV — código fuente completo

Copia del código publicado, commit 183cc8e31c801fba0a1dab9009b6e831ec0b0214.
Incluye interfaz, API, clientes, tier list Flota, importación Payment24, pruebas, esquema y migraciones.

## GitHub
Descomprimir el ZIP y subir el contenido de esta carpeta a un repositorio. Se incluye .gitignore.
No contiene contraseñas, claves, node_modules, historial Git ni los datos privados de clientes.
Los 90.574 registros y archivos subidos están en la base y almacenamiento del sitio actual; no forman parte del código. La importación Payment24 permite cargarlos en el destino una vez migrado.

## Estado de Vercel y Supabase
Esta copia conserva la implementación publicada en Sites/Vinext/Cloudflare. NO es todavía una versión migrada a Vercel/Supabase. Cambiar únicamente variables de entorno no completa la migración.

Adaptaciones pendientes:
1. Cambiar ejecución y compilación Vinext/Worker a Next.js compatible con el destino.
2. Migrar SQLite/D1 a PostgreSQL Supabase: tablas, índices, vistas, consultas, transacciones e importaciones por bloques.
3. Sustituir R2 por Supabase Storage privado y mantener las descargas autorizadas.
4. Sustituir el inicio de sesión de ChatGPT/Sites por Supabase Auth y autorización del equipo en todas las rutas. Definir políticas RLS y de Storage antes de cargar datos reales.
5. Configurar variables en el destino mediante sus campos seguros. Nunca agregar claves secretas al repositorio.
6. Migrar los datos o volver a importar Payment24; conciliar 142 clientes, 146 cuentas, 90.574 registros y 927,263.408 galones netos.
7. Verificar filtros, fichas, correcciones, reimportación sin duplicados, descargas y acceso privado.

El asistente IA está implementado pero la conexión permanece pendiente. Ver PLATFORM.md para reglas de negocio, límites y pruebas.
La identidad en .openai/hosting.json corresponde al sitio existente; no otorga acceso a sus datos ni debe usarse para desplegar accidentalmente sobre ese sitio desde otro entorno.
