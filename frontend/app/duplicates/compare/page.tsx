'use client';

import { useState } from 'react';
import { duplicatesApi } from '@/lib/api';

interface CompareResult {
  similarity: number;
  metodo: string;
  duracion_ms: number;
  rti?: {
    categoria: string;
    score: number;
    justificacion: string;
  };
}

export default function CompareProductsPage() {
  const [descripcion1, setDescripcion1] = useState('');
  const [descripcion2, setDescripcion2] = useState('');
  const [useLLMFilter, setUseLLMFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState('');
  const [requestJson, setRequestJson] = useState<string>('');
  const [responseJson, setResponseJson] = useState<string>('');

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!descripcion1.trim() || !descripcion2.trim()) {
      setError('Por favor complete ambas descripciones');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const requestBody = {
      descripcion1: descripcion1.trim(),
      descripcion2: descripcion2.trim(),
      useLLMFilter,
    };

    // Show request JSON
    setRequestJson(JSON.stringify(requestBody, null, 2));
    setResponseJson('');

    try {
      const response = await duplicatesApi.compare(requestBody);
      setResult(response.data);
      setResponseJson(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.error('Error comparing products:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Error desconocido';
      setError(errorMsg);
      setResponseJson(JSON.stringify(error.response?.data || { error: errorMsg }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.90) return 'text-red-600 bg-red-50';
    if (similarity >= 0.80) return 'text-orange-600 bg-orange-50';
    if (similarity >= 0.70) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getSimilarityLabel = (similarity: number) => {
    if (similarity >= 0.95) return 'Duplicado exacto';
    if (similarity >= 0.90) return 'Muy similar';
    if (similarity >= 0.80) return 'Similar';
    if (similarity >= 0.70) return 'Parcialmente similar';
    return 'Diferente';
  };

  const loadExample = (example: 'duplicate' | 'similar' | 'different') => {
    switch (example) {
      case 'duplicate':
        setDescripcion1('LLAVE MIXTA 13MM TRUPER');
        setDescripcion2('LLAVE COMBINADA 13 MILIMETROS TRUPER');
        break;
      case 'similar':
        setDescripcion1('TORNILLO HEXAGONAL 1/4 x 2" ACERO');
        setDescripcion2('TORNILLO HEX 1/4" x 2 PULGADAS');
        break;
      case 'different':
        setDescripcion1('MARTILLO DE UÑA 16 OZ');
        setDescripcion2('DESTORNILLADOR PHILLIPS #2');
        break;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Comparar Dos Productos</h1>
        <p className="text-gray-600">
          Compara dos descripciones de productos para determinar su similitud semántica.
          Usa el filtro LLM para obtener análisis RTI (Relevancia Técnica Industrial).
        </p>
        <p className="text-sm text-gray-500 mt-2">
          <strong>Endpoint:</strong> POST /api/duplicates/compare
        </p>
      </div>

      {/* Example buttons */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="text-sm text-gray-600 self-center">Ejemplos:</span>
        <button
          onClick={() => loadExample('duplicate')}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Duplicado
        </button>
        <button
          onClick={() => loadExample('similar')}
          className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
        >
          Similar
        </button>
        <button
          onClick={() => loadExample('different')}
          className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
        >
          Diferente
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Form */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-4">Entrada</h2>
            <form onSubmit={handleCompare}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descripción Producto 1 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    rows={3}
                    value={descripcion1}
                    onChange={(e) => setDescripcion1(e.target.value)}
                    placeholder="Ejemplo: LLAVE MIXTA 13MM TRUPER"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Descripción Producto 2 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                    rows={3}
                    value={descripcion2}
                    onChange={(e) => setDescripcion2(e.target.value)}
                    placeholder="Ejemplo: LLAVE COMBINADA 13 MILIMETROS TRUPER"
                    required
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="useLLMFilter"
                    checked={useLLMFilter}
                    onChange={(e) => setUseLLMFilter(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="useLLMFilter" className="text-sm">
                    <strong>Usar filtro LLM</strong>
                    <span className="text-gray-500 block text-xs">
                      Añade análisis RTI con categorización semántica (más lento)
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || !descripcion1.trim() || !descripcion2.trim()}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Comparando...' : 'Comparar Productos'}
                </button>
              </div>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Result summary */}
          {result && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">Resultado</h2>

              {/* Similarity score */}
              <div className={`p-4 rounded-lg mb-4 ${getSimilarityColor(result.similarity)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {(result.similarity * 100).toFixed(1)}%
                  </span>
                  <span className="text-sm font-medium">
                    {getSimilarityLabel(result.similarity)}
                  </span>
                </div>
                <div className="w-full bg-white/50 rounded-full h-2 mt-2">
                  <div
                    className="bg-current h-2 rounded-full transition-all"
                    style={{ width: `${result.similarity * 100}%` }}
                  />
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-gray-50 rounded">
                  <span className="text-gray-500 block">Método</span>
                  <span className="font-medium">{result.metodo}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <span className="text-gray-500 block">Duración</span>
                  <span className="font-medium">{result.duracion_ms} ms</span>
                </div>
              </div>

              {/* RTI Analysis (if LLM was used) */}
              {result.rti && (
                <div className="mt-4 p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
                  <h3 className="font-bold text-blue-800 mb-2">Análisis RTI (LLM)</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-600">Categoría:</span>
                      <span className="ml-2 font-medium">{result.rti.categoria}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Score RTI:</span>
                      <span className="ml-2 font-medium">{(result.rti.score * 100).toFixed(0)}%</span>
                    </div>
                    {result.rti.justificacion && (
                      <div>
                        <span className="text-gray-600">Justificación:</span>
                        <p className="mt-1 text-gray-700">{result.rti.justificacion}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column - JSON display */}
        <div className="space-y-6">
          {/* Request JSON */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-2">Request JSON</h2>
            <p className="text-xs text-gray-500 mb-3">POST /api/duplicates/compare</p>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">
              {requestJson || '// El request aparecerá aquí al comparar'}
            </pre>
          </div>

          {/* Response JSON */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold mb-2">Response JSON</h2>
            <p className="text-xs text-gray-500 mb-3">
              {result ? `${result.duracion_ms}ms` : 'Esperando respuesta...'}
            </p>
            <pre className={`p-4 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto ${
              error ? 'bg-red-900 text-red-200' : 'bg-gray-900 text-blue-400'
            }`}>
              {responseJson || '// La respuesta aparecerá aquí'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
