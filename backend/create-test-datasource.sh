#!/bin/bash

echo "🚀 Creando datasource de Canasta Básica..."

curl -X POST http://localhost:3001/api/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Canasta Básica EFC",
    "description": "Productos de supermercado para pruebas",
    "type": "mysql",
    "connectionConfig": {
      "host": "localhost",
      "port": 3307,
      "user": "efc",
      "password": "efc123",
      "database": "canasta_basica"
    },
    "queryTemplate": "SELECT codigo, CONCAT(descripcion, \" - \", categoria, \" - \", proveedor, \" - S/\", FORMAT(precio, 2)) as texto_completo, descripcion, precio, proveedor, categoria, stock FROM articulos WHERE stock > 0 ORDER BY codigo LIMIT {{limit}} OFFSET {{offset}}",
    "fieldMapping": {
      "id": "codigo",
      "content": "texto_completo",
      "metadata": {
        "descripcion": "descripcion",
        "precio": "precio",
        "proveedor": "proveedor",
        "categoria": "categoria",
        "stock": "stock"
      }
    },
    "embeddingFields": ["descripcion", "categoria", "proveedor"],
    "qdrantCollection": "canasta_basica_productos"
  }' | jq '.'

echo ""
echo "✅ Datasource creado!"
echo ""
echo "Ahora puedes:"
echo "1. Ver el datasource en: http://localhost:3002/datasources"
echo "2. Ejecutar una sincronización en: http://localhost:3002/syncs"
