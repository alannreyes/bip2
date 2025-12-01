'use client';

import { useState, useEffect } from 'react';
import { collectionsApi, duplicatesApi } from '@/lib/api';

interface MatchedProduct {
  id: string;
  descripcion: string;
  marca?: string;
  modelo?: string;
  similarity: number;
  payload: any;
}

interface ValidationResult {
  exists: boolean;
  isExactMatch: boolean;
  isVariant: boolean;
  reason: string;
  confidence: number;
  matchedProducts: MatchedProduct[];
  recommendation: 'reject' | 'accept' | 'review';
}

export default function ValidateProductPage() {
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.90);
  const [loading, setLoading] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState('');
  const [requestJson, setRequestJson] = useState<string>('');
  const [responseJson, setResponseJson] = useState<string>('');
  const [responseDuration, setResponseDuration] = useState<number>(0);

  // Load collections on mount
  useEffect(() => {
    const loadCollections = async () => {
      try {
        const response = await collectionsApi.getAll();
        setCollections(response.data);
      } catch (error) {
        console.error('Error loading collections:', error);
        setError('Error al cargar colecciones');
      } finally {
        setLoadingCollections(false);
      }
    };

    loadCollections();
  }, []);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCollection || !descripcion.trim()) {
      setError('Por favor complete todos los campos requeridos');
      return;
    }

    setLoading(true);
    setError('');
    setValidationResult(null);

    const requestBody = {
      collection: selectedCollection,
      descripcion: descripcion.trim(),
      marca: marca || undefined,
      modelo: modelo || undefined,
      similarityThreshold,
    };

    // Show request JSON
    setRequestJson(JSON.stringify(requestBody, null, 2));
    setResponseJson('');

    const startTime = Date.now();

    try {
      const response = await duplicatesApi.validateExists(
        selectedCollection,
        descripcion,
        marca || undefined,
        modelo || undefined,
        similarityThreshold,
      );

      setResponseDuration(Date.now() - startTime);
      setValidationResult(response.data);
      setResponseJson(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      setResponseDuration(Date.now() - startTime);
      console.error('Error validating product:', error);
      const errorMsg = error.response?.data?.message || 'Error al validar producto';
      setError(errorMsg);
      setResponseJson(JSON.stringify(error.response?.data || { error: errorMsg }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'reject':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'accept':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRecommendationText = (recommendation: string) => {
    switch (recommendation) {
      case 'reject':
        return 'RECHAZAR - El producto ya existe';
      case 'accept':
        return 'ACEPTAR - Es un producto nuevo';
      case 'review':
        return 'REVISAR - Requiere revisión manual';
      default:
        return recommendation;
    }
  };

  const loadExample = (example: 'duplicate' | 'variant' | 'new') => {
    switch (example) {
      case 'duplicate':
        setDescripcion('LLAVE MIXTA 13MM TRUPER');
        setMarca('TRUPER');
        setModelo('');
        break;
      case 'variant':
        setDescripcion('TORNILLO HEXAGONAL 1/4 x 2" ACERO INOX');
        setMarca('');
        setModelo('');
        break;
      case 'new':
        setDescripcion('WIDGET QUANTUM XYZ-9000 EDICION ESPECIAL');
        setMarca('ACME');
        setModelo('XYZ-9000');
        break;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Validar Existencia de Producto</h1>
        <p className="text-gray-600">
          Valida si un producto ya existe en la base de datos antes de crearlo.
          El sistema usa IA para detectar duplicados exactos y variantes (tallas/colores).
        </p>
        <p className="text-sm text-gray-500 mt-2">
          <strong>Endpoint:</strong> POST /api/duplicates/validate-exists
        </p>
      </div>

      {/* Example buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="text-sm text-gray-600 self-center">Ejemplos:</span>
        <button
          onClick={() => loadExample('duplicate')}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Duplicado probable
        </button>
        <button
          onClick={() => loadExample('variant')}
          className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
        >
          Posible variante
        </button>
        <button
          onClick={() => loadExample('new')}
          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
        >
          Producto nuevo
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column - Form */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-4">Entrada</h2>
            <form onSubmit={handleValidate}>
              <div className="space-y-4">
                {/* Collection selector */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Colección <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                    disabled={loadingCollections}
                    required
                  >
                    <option value="">Seleccionar colección...</option>
                    {collections.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.vectors_count || 0})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descripción <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    rows={3}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="TORNILLO HEX 1/4 x 2"
                    required
                  />
                </div>

                {/* Brand & Model */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Marca</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      placeholder="TRUPER"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Modelo</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      placeholder="ABC-123"
                    />
                  </div>
                </div>

                {/* Similarity threshold */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Umbral: {(similarityThreshold * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.70"
                    max="0.99"
                    step="0.01"
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>70%</span>
                    <span>99%</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !selectedCollection || !descripcion.trim()}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? 'Validando...' : 'Validar Producto'}
                </button>
              </div>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Middle column - Results */}
        <div className="xl:col-span-1">
          {validationResult ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Resultado</h2>

              {/* Recommendation badge */}
              <div
                className={`p-4 rounded-lg border-2 mb-4 ${getRecommendationColor(validationResult.recommendation)}`}
              >
                <h3 className="font-bold mb-1">
                  {getRecommendationText(validationResult.recommendation)}
                </h3>
                <p className="text-sm">{validationResult.reason}</p>
                <div className="text-xs mt-2">
                  Confianza: {(validationResult.confidence * 100).toFixed(0)}%
                </div>
              </div>

              {/* Status indicators */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg">{validationResult.exists ? '✓' : '✗'}</div>
                  <div className="text-xs">Existe</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg">{validationResult.isExactMatch ? '✓' : '✗'}</div>
                  <div className="text-xs">Exacto</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded">
                  <div className="text-lg">{validationResult.isVariant ? '✓' : '✗'}</div>
                  <div className="text-xs">Variante</div>
                </div>
              </div>

              {/* Matched products */}
              {validationResult.matchedProducts.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold mb-2">
                    Similares ({validationResult.matchedProducts.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {validationResult.matchedProducts.map((product, idx) => (
                      <div key={idx} className="p-2 border rounded text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-xs truncate flex-1">
                            {product.descripcion}
                          </span>
                          <span className="text-blue-600 font-bold ml-2">
                            {(product.similarity * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {product.id}
                          {product.marca && ` | ${product.marca}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationResult.matchedProducts.length === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No se encontraron productos similares
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Resultado</h2>
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-sm">Complete el formulario y presione validar</p>
              </div>
            </div>
          )}
        </div>

        {/* Right column - JSON display */}
        <div className="xl:col-span-1 space-y-4">
          {/* Request JSON */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-bold mb-1">Request JSON</h2>
            <p className="text-xs text-gray-500 mb-2">POST /api/duplicates/validate-exists</p>
            <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
              {requestJson || '// Request aparecerá aquí'}
            </pre>
          </div>

          {/* Response JSON */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-bold mb-1">Response JSON</h2>
            <p className="text-xs text-gray-500 mb-2">
              {responseDuration ? `${responseDuration}ms` : 'Esperando...'}
            </p>
            <pre className={`p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto ${
              error ? 'bg-red-900 text-red-200' : 'bg-gray-900 text-blue-400'
            }`}>
              {responseJson || '// Response aparecerá aquí'}
            </pre>
          </div>

          {/* cURL example */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-bold mb-2">cURL Ejemplo</h2>
            <pre className="bg-gray-800 text-gray-300 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST \\
  http://localhost:3001/api/duplicates/validate-exists \\
  -H "Content-Type: application/json" \\
  -d '{
    "collection": "catalogo_stock",
    "descripcion": "LLAVE MIXTA 13MM",
    "marca": "TRUPER",
    "similarityThreshold": 0.90
  }'`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
