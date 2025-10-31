const sql = require('mssql');

const config = {
  server: '192.168.40.251',
  port: 1433,
  user: 'BIP',
  password: 'Thrg6587$%',
  database: 'EFC_DB_PROD',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    requestTimeout: 30000,
    connectionTimeout: 30000,
  },
};

async function testClientePurchases() {
  try {
    console.log('Conectando a la base de datos...');
    await sql.connect(config);
    console.log('✅ Conectado!\n');

    // Primero, explorar la estructura de la tabla para encontrar el campo correcto
    console.log('🔍 Explorando estructura de tabla Al2000...\n');
    const structureQuery = `
      SELECT TOP 5 *
      FROM Desarrollo.dbo.Al2000 WITH(NOLOCK)
      WHERE AL2_TIPDOC = 'GR'
        AND AL2_TIPCLIPRO = 'C'
        AND AL2_ESTREG = 'A'
    `;

    const structureResult = await sql.query(structureQuery);
    if (structureResult.recordset.length > 0) {
      console.log('📋 Columnas disponibles:');
      console.log(Object.keys(structureResult.recordset[0]).join(', '));
      console.log('\n');
    }

    // Códigos a validar para cliente 004401
    const cliente = '004401';
    const codigos = ['26020030', '26020017', 'A0011920'];

    // Query para validar ventas de productos específicos
    const query = `
      SELECT
        AL2_CODART AS Codigo_Producto,
        AL2_CLIPRO AS Codigo_Cliente,
        COUNT(*) AS Cantidad_Ventas,
        MIN(AL2_FCHDOC) AS Primera_Venta,
        MAX(AL2_FCHDOC) AS Ultima_Venta
      FROM Desarrollo.dbo.Al2000 WITH(NOLOCK)
      WHERE AL2_TIPDOC = 'GR'
        AND AL2_TIPCLIPRO = 'C'
        AND AL2_CLIPRO = '${cliente}'
        AND AL2_ESTREG = 'A'
        AND AL2_CODART IN ('${codigos.join("', '")}')
      GROUP BY AL2_CODART, AL2_CLIPRO
      ORDER BY AL2_CODART
    `;

    console.log(`🔍 Validando productos para cliente ${cliente}:`);
    codigos.forEach((codigo, i) => console.log(`   - Código ${i + 1}: ${codigo}`));
    console.log();

    const result = await sql.query(query);

    if (result.recordset.length === 0) {
      console.log(`❌ No se encontraron ventas de estos productos al cliente ${cliente}\n`);
    } else {
      console.log('✅ Resultados:\n');
      console.table(result.recordset);
    }

    // Verificar cuáles códigos NO tienen ventas
    const codigosEncontrados = result.recordset.map(r => r.Codigo_Producto);
    const codigosSinVentas = codigos.filter(c => !codigosEncontrados.includes(c));

    if (codigosSinVentas.length > 0) {
      console.log(`\n📋 Productos SIN ventas al cliente ${cliente}:`);
      codigosSinVentas.forEach(c => console.log(`   - ${c}`));
    }

    await sql.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

testClientePurchases();
