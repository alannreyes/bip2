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

    try {
      const response = await duplicatesApi.validateExists(
        selectedCollection,
        descripcion,
        marca || undefined,
        modelo || undefined,
        similarityThreshold,
      );

      setValidationResult(response.data);
    } catch (error: any) {
      console.error('Error validating product:', error);
      setError(error.response?.data?.message || 'Error al validar producto');
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Validar Existencia de Producto</h1>
        <p className="text-gray-600">
          Valida si un producto ya existe en la base de datos antes de crearlo.
          El sistema usa IA para detectar duplicados exactos y variantes (tallas/colores).
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleValidate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Collection selector */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Colección <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md"
                value={selectedCollection}
                onChange={(e) => setSelectedCollection(e.target.value)}
                disabled={loadingCollections}
                required
              >
                <option value="">Seleccionar colección...</option>
                {collections.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name} ({col.vectors_count || 0} productos)
                  </option>
                ))}
              </select>
            </div>

            {/* Similarity threshold */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Umbral de Similitud: {(similarityThreshold * 100).toFixed(0)}%
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
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>70% (Más flexible)</span>
                <span>99% (Más estricto)</span>
              </div>
            </div>
          </div>

          {/* Product details */}
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Descripción del Producto <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 border rounded-md"
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ejemplo: TORNILLO HEXAGONAL ACERO INOX 1/4 x 2 PULG"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Marca (opcional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ejemplo: ACME"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Modelo (opcional)
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ejemplo: HEX-2024"
                />
              </div>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading || !selectedCollection || !descripcion.trim()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Validando...' : 'Validar Producto'}
          </button>
        </form>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md">
            {error}
          </div>
        )}
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Resultado de Validación</h2>

          {/* Recommendation badge */}
          <div
            className={`p-4 rounded-lg border-2 mb-6 ${getRecommendationColor(validationResult.recommendation)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold">
                {getRecommendationText(validationResult.recommendation)}
              </h3>
              <span className="text-sm">
                Confianza: {(validationResult.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-sm">{validationResult.reason}</p>
          </div>

          {/* Status indicators */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl mb-1">
                {validationResult.exists ? '✓' : '✗'}
              </div>
              <div className="text-sm font-medium">Ya Existe</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl mb-1">
                {validationResult.isExactMatch ? '✓' : '✗'}
              </div>
              <div className="text-sm font-medium">Coincidencia Exacta</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl mb-1">
                {validationResult.isVariant ? '✓' : '✗'}
              </div>
              <div className="text-sm font-medium">Es Variante</div>
            </div>
          </div>

          {/* Matched products */}
          {validationResult.matchedProducts.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3">
                Productos Similares Encontrados ({validationResult.matchedProducts.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {validationResult.matchedProducts.map((product, idx) => (
                  <div
                    key={idx}
                    className="p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-sm mb-1">
                          {product.descripcion}
                        </div>
                        <div className="text-xs text-gray-600">
                          ID: {product.id}
                          {product.marca && ` | Marca: ${product.marca}`}
                          {product.modelo && ` | Modelo: ${product.modelo}`}
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="text-lg font-bold text-blue-600">
                          {(product.similarity * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">similitud</div>
                      </div>
                    </div>

                    {/* Additional payload info */}
                    {product.payload && (
                      <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
                        {product.payload.categoria && (
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            {product.payload.categoria}
                          </span>
                        )}
                        {product.payload.linea && (
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            Línea: {product.payload.linea}
                          </span>
                        )}
                        {product.payload.familia && (
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            Familia: {product.payload.familia}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {validationResult.matchedProducts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No se encontraron productos similares en la base de datos
            </div>
          )}
        </div>
      )}
    </div>
  );
}
