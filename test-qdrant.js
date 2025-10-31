const { QdrantClient } = require('@qdrant/js-client-rest');

async function test() {
  const client = new QdrantClient({ url: 'http://localhost:6333' });

  // Crear un vector de prueba (3072 dimensiones con valores aleatorios)
  const vector = Array.from({ length: 3072 }, () => Math.random());

  const point = {
    id: 1,
    vector: vector,
    payload: {
      id: "PRO001",
      descripcion: "Arroz Superior - Marca ABC",
      precio: 3.50,
      stock: 150,
      categoria: "Granos",
      proveedor: "Distribuidora XYZ"
    }
  };

  console.log('Testing point structure:', JSON.stringify(point, null, 2).substring(0, 500));

  try {
    await client.upsert('canasta_basica_productos', {
      wait: true,
      points: [point]
    });
    console.log('✓ Point inserted successfully!');
  } catch (error) {
    console.error('✗ Error inserting point:', error.message);
    console.error('Full error:', error);
  }
}

test();
