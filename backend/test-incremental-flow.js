const mysql = require('mysql2/promise');

async function testIncrementalFlow() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'efc',
    password: 'efc123',
    database: 'canasta_basica'
  });

  try {
    console.log('=== PRUEBA 2.4: Demostración Incremental Sync Real ===\n');

    console.log('Paso 1: Actualizar 3 productos específicos\n');

    // Actualizar 3 productos
    await connection.execute(`UPDATE articulos SET precio = 99.99 WHERE codigo = 'ARR001'`);
    await connection.execute(`UPDATE articulos SET precio = 88.88 WHERE codigo = 'AZU001'`);
    await connection.execute(`UPDATE articulos SET precio = 77.77 WHERE codigo = 'FID001'`);

    console.log('✅ 3 productos actualizados: ARR001, AZU001, FID001');

    // Ver cuántos productos tienen updated_at después de la última sync
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM articulos
      WHERE updated_at > '2025-10-15 16:15:52'
    `);

    console.log(`\n📊 Productos con updated_at > última sync: ${rows[0].count}`);
    console.log('\n⚠️  Nota: Deberías ver 3 productos (ARR001, AZU001, FID001)');
    console.log('    Si ves un número diferente, es porque otros productos fueron modificados');

    console.log('\n✅ Ahora al ejecutar "Sync Inc", solo se sincronizarán estos productos modificados');

  } finally {
    await connection.end();
  }
}

testIncrementalFlow().catch(console.error);
