# Base de Datos MySQL - Canasta Básica

## 📊 Información General

Base de datos de prueba con 100 artículos de canasta básica familiar, simulando un catálogo de supermercado.

### Contenedor Docker

- **Nombre**: `efc-canasta-mysql`
- **Puerto**: `3307` (host) → `3306` (container)
- **Imagen**: `mysql:8.0`

## 🔐 Credenciales

### Usuario Root
- **Usuario**: `root`
- **Contraseña**: `root123`

### Usuario Aplicación
- **Usuario**: `efc`
- **Contraseña**: `efc123`
- **Base de datos**: `canasta_basica`

## 📋 Estructura de la Tabla

```sql
CREATE TABLE articulos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    proveedor VARCHAR(100) NOT NULL,
    contacto VARCHAR(100) NOT NULL,
    categoria VARCHAR(50),
    stock INT DEFAULT 0,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## 🏷️ Categorías de Productos (100 artículos)

| Categoría | Cantidad | Ejemplos |
|-----------|----------|----------|
| **Arroz** | 8 | Costeño 1kg, Paisana 750g, Valle Grande Integral |
| **Azúcar** | 6 | Cartavio Blanca, Casa Grande Rubia, Paramonga |
| **Aceite** | 8 | Primor 1L, Oliva Cocinero, Ideal 900ml |
| **Fideos** | 8 | Don Vittorio Spaghetti, Lavaggi Cabello de Ángel |
| **Lácteos** | 8 | Leche Gloria, Ideal, Laive, Anchor en polvo |
| **Huevos** | 4 | Gallinas Felices, San Fernando, Orgánicos |
| **Harinas** | 8 | Nicolini, Blanca Flor, Integral, Pan Bimbo |
| **Menestras** | 8 | Lentejas, Frijol Canario/Negro, Garbanzo, Arveja |
| **Conservas** | 10 | Atún Florida/A1, Sardinas, Duraznos, Pasta de Tomate |
| **Bebidas** | 8 | Inca Kola, Coca Cola, Agua Cielo/San Luis, Jugos |
| **Limpieza** | 10 | Detergente Ariel/Bolivar, Lejía, Lavavajilla, Papel |
| **Higiene** | 9 | Pasta Colgate, Champú Sedal, Jabón Dove, Desodorante |
| **Snacks/Otros** | 5 | Galletas, Sal, Vinagre, Mayonesa |

## 🔗 Cadenas de Conexión

### Para NestJS (TypeORM)
```typescript
{
  type: 'mysql',
  host: 'localhost',
  port: 3307,
  username: 'efc',
  password: 'efc123',
  database: 'canasta_basica',
}
```

### MySQL CLI desde el host
```bash
mysql -h 127.0.0.1 -P 3307 -u efc -pefc123 canasta_basica
```

### MySQL CLI desde el contenedor
```bash
docker exec -it efc-canasta-mysql mysql -u efc -pefc123 canasta_basica
```

## 📝 Consultas de Ejemplo

### Ver todos los productos
```sql
SELECT codigo, descripcion, precio, proveedor, categoria
FROM articulos
ORDER BY categoria, precio;
```

### Productos por categoría
```sql
SELECT categoria, COUNT(*) as total,
       MIN(precio) as precio_min,
       MAX(precio) as precio_max,
       AVG(precio) as precio_promedio
FROM articulos
GROUP BY categoria
ORDER BY categoria;
```

### Buscar productos por nombre
```sql
SELECT codigo, descripcion, precio, proveedor
FROM articulos
WHERE descripcion LIKE '%arroz%'
ORDER BY precio;
```

### Productos de un proveedor
```sql
SELECT codigo, descripcion, precio, categoria
FROM articulos
WHERE proveedor = 'Alicorp'
ORDER BY categoria, precio;
```

### Top 10 productos más caros
```sql
SELECT codigo, descripcion, precio, proveedor, categoria
FROM articulos
ORDER BY precio DESC
LIMIT 10;
```

### Productos de canasta básica (categorías principales)
```sql
SELECT codigo, descripcion, precio, proveedor
FROM articulos
WHERE categoria IN ('Arroz', 'Azúcar', 'Aceite', 'Fideos', 'Lácteos')
ORDER BY categoria, precio;
```

## 🔄 Query Template para Catálogo Semántico

Para usar en el sistema de sincronización:

```sql
SELECT
    codigo,
    descripcion,
    CONCAT(descripcion, ' - ', categoria, ' - ', proveedor, ' - S/', FORMAT(precio, 2)) as texto_completo,
    precio,
    proveedor,
    categoria,
    stock
FROM articulos
WHERE stock > 0
ORDER BY codigo
LIMIT {limit} OFFSET {offset}
```

### Field Mapping Sugerido

```json
{
  "id": "codigo",
  "content": "texto_completo",
  "metadata": {
    "precio": "precio",
    "proveedor": "proveedor",
    "categoria": "categoria",
    "stock": "stock"
  }
}
```

### Embedding Fields Sugeridos
```json
["descripcion", "categoria", "proveedor"]
```

## 🐳 Comandos Docker Útiles

### Ver logs del contenedor
```bash
docker logs efc-canasta-mysql
```

### Verificar estado
```bash
docker ps | grep efc-canasta-mysql
```

### Detener el contenedor
```bash
docker-compose stop mysql
```

### Iniciar el contenedor
```bash
docker-compose start mysql
```

### Reiniciar con datos frescos
```bash
docker-compose down mysql
docker volume rm backend_mysql_data
docker-compose up -d mysql
```

## 📊 Estadísticas de la Base de Datos

- **Total de Artículos**: 100
- **Categorías**: 13
- **Proveedores**: 35+
- **Rango de Precios**: S/1.50 - S/42.50
- **Precio Promedio**: ~S/7.50

## 🎯 Uso para Pruebas

Esta base de datos está lista para:

1. ✅ Probar conexiones MySQL en el backend
2. ✅ Crear datasources en el Catálogo Semántico EFC
3. ✅ Ejecutar sincronizaciones completas e incrementales
4. ✅ Generar embeddings con Gemini AI
5. ✅ Probar búsquedas semánticas
6. ✅ Validar el flujo completo del sistema

## 📞 Proveedores Principales

- **Alicorp**: Fideos, aceites, harinas
- **Gloria**: Productos lácteos
- **Nestlé**: Lácteos, conservas
- **Bells SAC**: Menestras, conservas, aceites
- **Costeño SAC**: Arroz
- **Bimbo**: Pan de molde
- **Unilever**: Productos de higiene personal
- Y más...

## 🔍 Ejemplo de Registro Completo

```sql
SELECT * FROM articulos WHERE codigo = 'ARR001'\G
```

**Resultado:**
```
           id: 1
       codigo: ARR001
  descripcion: Arroz Blanco Superior Costeño 1kg
       precio: 4.50
    proveedor: Costeño SAC
     contacto: ventas@costeno.com.pe
    categoria: Arroz
        stock: 500
fecha_actualizacion: 2025-10-15 02:11:30
```
