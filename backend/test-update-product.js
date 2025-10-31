const mysql = require('mysql2/promise');

async function updateProduct() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'efc',
    password: 'efc123',
    database: 'canasta_basica'
  });

  try {
    console.log('=== PRUEBA 2.2: Actualizar producto para sync incremental ===\n');

    // Mostrar datos ANTES de la actualización
    const [beforeRows] = await connection.execute(
      `SELECT codigo, descripcion, precio, updated_at FROM articulos WHERE codigo = 'ACE001'`
    );
    console.log('ANTES:', JSON.stringify(beforeRows[0], null, 2));

    // Actualizar el producto
    const [result] = await connection.execute(
      `UPDATE articulos SET precio = precio + 0.50 WHERE codigo = 'ACE001'`
    );

    console.log(`\n✅ Producto ACE001 actualizado (${result.affectedRows} fila afectada)`);

    // Mostrar datos DESPUÉS de la actualización
    const [afterRows] = await connection.execute(
      `SELECT codigo, descripcion, precio, updated_at FROM articulos WHERE codigo = 'ACE001'`
    );
    console.log('\nDESPUÉS:', JSON.stringify(afterRows[0], null, 2));

    console.log('\n⏰ El campo updated_at debe haber cambiado automáticamente');

  } finally {
    await connection.end();
  }
}

updateProduct().catch(console.error);
