# Puma Comercial SV — Flota Customer Analytics

Plataforma privada para el equipo comercial de El Salvador: cartera de clientes, tier list de Flota, importación Payment24, seguimiento comercial, mercado y escenarios de precios.

Esta rama está migrada a **Next.js + PostgreSQL/Supabase + Vercel**. El código se puede compilar sin credenciales; el acceso a clientes requiere configurar Supabase. El repositorio no contiene transacciones reales, archivos de clientes ni claves. La migración del código no copia los datos del sitio anterior.

## Desplegar en Vercel

Importar `MMena88/Flota-Customer-Analytics`, rama `main`:

| Campo | Valor |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `./` |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Predeterminado de Next.js; no escribir `dist` |

Configurar estas variables en **Settings → Environment Variables → Production**, antes del despliegue que usará la base:

| Variable | Valor que se obtiene de Supabase | Visibilidad |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key; también admite la clave legacy `anon` | Pública |
| `SUPABASE_SECRET_KEY` | Secret key de servidor; también se admite `SUPABASE_SERVICE_ROLE_KEY` con la clave legacy `service_role` | Secreta |
| `DATABASE_URL` | Conexión PostgreSQL del **Transaction pooler**, puerto 6543 | Secreta |

Usar la cadena exacta del panel **Connect** del proyecto. La contraseña dentro de la URL debe estar codificada como componente URL. La aplicación usa consultas sin nombre, compatibles con el pooler. Las conexiones remotas verifican TLS; si el proyecto requiere su certificado de CA, agregar `DATABASE_CA_CERT` con el PEM correspondiente. No desactivar la validación TLS.

No poner claves secretas bajo el prefijo `NEXT_PUBLIC_`, en GitHub ni en el chat. Configurarlas directamente en los campos seguros del servicio. Las variables públicas se incorporan durante el build: después de cambiarlas, volver a desplegar. Usar un proyecto Supabase separado para Preview si se necesita ese entorno.

## Preparar Supabase

Usar un proyecto dedicado a esta plataforma. Se necesitan **Database, Authentication y Storage**.

1. Crear `.env.local` a partir de `.env.example` y completar los valores en el equipo del administrador. Este archivo está excluido de Git.
2. Ejecutar con Node.js 24:

   ```bash
   npm ci
   npm run db:migrate
   ```

   El comando aplica y registra las migraciones en orden, dentro de una transacción. Repetirlo no vuelve a crear las tablas. Opcionalmente, `MIGRATION_DATABASE_URL` puede usar conexión directa o Session pooler, puerto 5432, con permisos administrativos. No se ejecutan migraciones durante el build de Vercel.

3. En Supabase Authentication, configurar el Site URL con la dirección final de Vercel, habilitar acceso por correo/contraseña y desactivar el registro público. Crear la cuenta inicial en **Authentication → Users**; la aplicación no envía invitaciones ni crea usuarios automáticamente.
4. Copiar el UUID de esa cuenta y habilitarla:

   ```bash
   npm run db:member -- UUID_DEL_USUARIO admin
   ```

   Para otros integrantes, usar `editor` o `viewer`. `admin` y `editor` pueden editar la información comercial; `viewer` solo consulta. La administración de miembros se realiza con este comando o desde el panel de Supabase. Para revocar acceso: `UPDATE app_private.app_members SET active=false WHERE user_id='UUID';` en el SQL Editor autorizado.
5. Verificar que el bucket `puma-private`, creado por la migración, sea privado. No agregar políticas de lectura pública. Las tablas comerciales están en `app_private`, fuera de la Data API, con RLS y sin acceso para los roles de navegador. No agregar ese esquema a los esquemas expuestos.
6. Completar las variables de Vercel y desplegar. Iniciar sesión y cargar el histórico desde **Flota → Cargar reporte**.

Alternativa sin terminal para un proyecto nuevo: ejecutar los dos archivos de `supabase/migrations/` en orden en SQL Editor, cada uno dentro de `BEGIN; … COMMIT;`. Luego habilitar la cuenta con `INSERT INTO app_private.app_members(user_id,role) VALUES ('UUID','admin');`. Esta alternativa es una instalación manual: no mezclarla después con `npm run db:migrate`, porque no crea su registro de migraciones.

## Cargar y actualizar clientes

En **Flota**, seleccionar el archivo Payment24 original `.xlsx`, revisar la vista previa y confirmar. La plataforma procesa bloques de 250 registros. Seleccionar nuevamente el mismo archivo reanuda una carga interrumpida. Archivos con períodos superpuestos no duplican las transacciones; las correcciones conservan sus versiones anteriores.

Los clientes nuevos se crean con segmento `Flota`. Su ficha permite completar segmento comercial, contactos, ejecutivo, productos, notas y próximos pasos. Las futuras actualizaciones usan el mismo formato del reporte original.

El archivo original se envía directamente a Supabase Storage mediante una autorización temporal. Esto evita enviar el XLSX completo a una función de Vercel. Antes de vincularlo al historial, el servidor verifica tamaño y SHA-256. La copia original puede conservar información sensible de la fuente y se descarga solamente con acceso al equipo.

Las transacciones de Flota no representan el mercado total nacional ni confirman el margen. Mercado y precios requieren fuentes y costos cargados por el equipo; los datos faltantes se presentan como desconocidos.

## IA

El asistente conserva su integración opcional de servidor. Sin configuración aparece como pendiente y no genera respuestas simuladas. La activación y prueba con un proveedor real son un paso separado; la cartera, las importaciones y los rankings funcionan sin IA. Ver [PLATFORM.md](PLATFORM.md).

## Desarrollo y verificación

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Prueba opcional de un archivo local, sin enviarlo a servicios externos:

```bash
npm test -- "/ruta/al/reporte-Payment24.xlsx"
```

Las pruebas ejecutan SQL real de PostgreSQL mediante PGlite, la autorización, los handlers y las reglas de importación. Solo los servicios externos de Supabase Auth/Storage se sustituyen por adaptadores de prueba. La prueba con XLSX concilia filas, clientes, cuentas, consumo e importes entre el lector y los endpoints. Las sesiones reales, Storage remoto, correo y la IA requieren verificación posterior en el proyecto configurado.

[Reglas de negocio y límites](PLATFORM.md) · [Guía de puesta en marcha](LEEME_GITHUB_VERCEL_SUPABASE.md)
