# Puesta en marcha — Vercel y Supabase

El repositorio ya usa Next.js y PostgreSQL/Supabase. Las instrucciones completas y las variables están en [README.md](README.md).

Orden de puesta en marcha:

1. Preparar el proyecto Supabase y aplicar las dos migraciones.
2. Crear el usuario en Supabase Authentication y habilitarlo en `app_private.app_members`.
3. Importar el repositorio en Vercel con Next.js, raíz `./`, Node.js 24 y `npm run build`.
4. Configurar las cuatro variables requeridas del README en Production y desplegar.
5. Iniciar sesión, importar el reporte Payment24 y conciliar los totales con su vista previa.
6. Verificar una ficha, el ranking, una transacción y la descarga del original. Volver a seleccionar el mismo archivo debe indicar que ya fue importado.
7. Agregar el resto del equipo con los permisos apropiados.

El código y los datos son independientes. Este repositorio no contiene la base privada ni los archivos del sitio anterior. La carga Payment24 recupera transacciones y clientes de esa fuente; notas, contactos, actividades u otros documentos añadidos al sitio anterior requieren migración separada antes de retirarlo.

La primera publicación sin credenciales muestra una pantalla de configuración pendiente. No representa una conexión funcional con Supabase. Las consultas de IA permanecen deshabilitadas hasta configurar y verificar el proveedor.
