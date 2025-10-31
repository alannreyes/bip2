# Branding EFC - Catálogo Semántico

## Identidad Visual

### Colores Institucionales

La aplicación usa los colores corporativos de EFC:

- **Amarillo/Dorado Principal**: `#CCD621` (HSL: 50 100% 47%)
  - Uso: Elementos primarios, botones, enlaces activos, acentos

- **Azul Oscuro Secundario**: `HSL: 220 40% 25%`
  - Uso: Logo EFC, elementos secundarios, texto de énfasis

- **Grises Corporativos**:
  - Background: Blanco puro
  - Foreground: `HSL: 220 13% 18%`
  - Borders: `HSL: 220 13% 90%`
  - Muted: `HSL: 220 13% 95%`

### Logo y Tipografía

- **Logo**: Texto "EFC" en negrita con gradiente del color secundario
- **Nombre de la aplicación**: "Catálogo Semántico"
- **Separador visual**: Línea vertical sutil entre logo y nombre

## Nomenclatura

### Cambios de Terminología

Se eliminaron todas las referencias a "Qdrant" y se reemplazaron con términos más genéricos:

| Antes | Ahora |
|-------|-------|
| Qdrant Catalog Sync | Catálogo Semántico EFC |
| Colecciones en Qdrant | Colecciones de Productos |
| Sincronizar a Qdrant | Sincronizar al catálogo |
| Catálogos vectoriales | Sistema de búsqueda semántica |

### Navegación

- **Dashboard**: Vista general del sistema
- **Fuentes de Datos**: Configuración de conexiones a bases de datos
- **Sincronizaciones**: Gestión de procesos de sincronización
- **Colecciones**: Gestión de catálogos de productos
- **Búsqueda**: Búsqueda semántica por texto e imágenes

## Componentes Personalizados

### Header Component

Ubicación: `/components/header.tsx`

Componente reutilizable que incluye:
- Logo EFC con estilo corporativo
- Nombre de la aplicación
- Navegación principal con indicador de página activa
- Espacio reservado para logo como imagen (futuro)

### Uso del Header

```tsx
import { Header } from '@/components/header';

export default function Page() {
  return (
    <div>
      <Header />
      {/* Contenido de la página */}
    </div>
  );
}
```

## Archivos Modificados

### Configuración de Estilos
- `app/globals.css` - Colores corporativos de EFC
- `tailwind.config.js` - Configuración de tema (sin cambios necesarios)

### Páginas y Componentes
- `app/layout.tsx` - Metadata del sitio
- `app/page.tsx` - Dashboard principal
- `components/header.tsx` - Nuevo componente de header
- Todas las páginas en `app/` - Referencias a "Qdrant" actualizadas

### Configuración del Proyecto
- `package.json` - Nombre y descripción actualizados

## Logo como Imagen (Pendiente)

Para agregar el logo de EFC como imagen:

1. Coloca el archivo del logo en `/public/efc-logo.png`
2. Actualiza el componente Header:

```tsx
// En components/header.tsx
<div className="ml-auto">
  <Image
    src="/efc-logo.png"
    alt="EFC Logo"
    width={120}
    height={40}
    className="h-10 w-auto"
  />
</div>
```

## Próximos Pasos

1. Obtener el logo oficial de EFC en formato PNG o SVG
2. Definir si se necesita modo oscuro con colores adaptados
3. Revisar accesibilidad de contraste de colores
4. Agregar favicon personalizado de EFC
