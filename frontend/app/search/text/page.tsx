'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Search, Database, Loader2, Code } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchResult {
  id: string | number;
  score: number;
  score_vectorial?: number;
  payload: Record<string, any>;
  collection?: string;
  cliente_info?: {
    vendido_a_cliente: boolean;
    cantidad_ventas_cliente: number;
    primera_venta_cliente: string | null;
    ultima_venta_cliente: string | null;
  };
  // RTI v2.0 fields
  rti?: {
    score_rti: number;
    categoria_rti: string;
    evaluado_por: string;
    razon: string;
  };
}

export default function TextSearchPage() {
  const { data: collections } = useCollections();
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [query, setQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDuration, setSearchDuration] = useState<string>('');
  const [limit, setLimit] = useState(3); // RTI v2.0: Default 3 for precision-focused results
  const [marca, setMarca] = useState<string>('');
  const [cliente, setCliente] = useState<string>('');
  const [includeInternetSearch, setIncludeInternetSearch] = useState<boolean>(true);
  const [useLLMFilter, setUseLLMFilter] = useState<boolean>(false); // Default: OFF - trust embeddings
  const [minRelevancia, setMinRelevancia] = useState<number>(0.50); // RTI v2.0: Minimum relevance threshold
  const [internetResults, setInternetResults] = useState<any>(null);
  const [quickProductInfo, setQuickProductInfo] = useState<any>(null); // Quick identification (shows first)
  const [clientFilterMessage, setClientFilterMessage] = useState<string>(''); // Client filter UX message

  // SSE states
  const [isLoadingInternet, setIsLoadingInternet] = useState(false);
  const [internetProgress, setInternetProgress] = useState<string>('');
  const [internetError, setInternetError] = useState<string>('');

  // Parallel search states - Progressive results
  const [suppliersResults, setSuppliersResults] = useState<any>(null);
  const [specsResults, setSpecsResults] = useState<any>(null);
  const [pricesResults, setPricesResults] = useState<any>(null);
  const [alternativesResults, setAlternativesResults] = useState<any>(null);

  // JSON display states for developer demo
  const [requestJson, setRequestJson] = useState<string>('');
  const [responseJson, setResponseJson] = useState<string>('');
  const [showJsonPanel, setShowJsonPanel] = useState<boolean>(true);

  // Toggle individual collection
  const toggleCollection = (collectionName: string) => {
    setSelectedCollections(prev =>
      prev.includes(collectionName)
        ? prev.filter(c => c !== collectionName)
        : [...prev, collectionName]
    );
  };

  // Toggle all collections
  const toggleAllCollections = () => {
    if (selectedCollections.length === collections?.length) {
      setSelectedCollections([]);
    } else {
      setSelectedCollections(collections?.map((c: any) => c.name) || []);
    }
  };

  // Handle SSE connection for internet search
  const handleInternetSearchSSE = (searchQuery: string, collections: string[]) => {
    setIsLoadingInternet(true);
    setInternetProgress('Conectando...');
    setInternetError('');

    // Build dynamic API URL based on current hostname
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const apiUrl = `${protocol}//${hostname}:3001/api`;

    const eventSource = new EventSource(
      `${apiUrl}/search/internet?query=${encodeURIComponent(searchQuery)}&collections=${collections.join(',')}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'embedding_start':
            setInternetProgress(data.message);
            break;
          case 'embedding_complete':
            setInternetProgress(`${data.message} (${data.duration})`);
            break;
          case 'search_start':
            setInternetProgress(data.message);
            break;
          case 'search_complete':
            setInternetProgress(`${data.message} (${data.duration})`);
            break;
          case 'quick_identification_start':
            setInternetProgress(data.message);
            break;
          case 'product_identified':
            setInternetProgress(`${data.message} (${data.duration})`);
            if (data.productInfo && data.productInfo.identificado) {
              setQuickProductInfo(data.productInfo);
            }
            break;

          // PARALLEL SEARCHES
          case 'parallel_search_start':
            setInternetProgress(data.message);
            break;

          case 'suppliers_search_complete':
            setSuppliersResults(data.results);
            break;

          case 'specs_search_complete':
            setSpecsResults(data.results);
            break;

          case 'prices_search_complete':
            setPricesResults(data.results);
            break;

          case 'alternatives_search_complete':
            setAlternativesResults(data.results);
            break;

          case 'all_searches_complete':
            setInternetProgress(`✅ ${data.message}`);
            setInternetResults(data.results);
            setIsLoadingInternet(false);
            eventSource.close();
            break;

          // LEGACY events (for backward compatibility)
          case 'internet_complete':
            setInternetProgress(`${data.message} (${data.duration})`);
            setInternetResults(data.results);
            setIsLoadingInternet(false);
            eventSource.close();
            break;

          case 'error':
            setInternetError(data.message);
            setIsLoadingInternet(false);
            eventSource.close();
            break;
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      setInternetError('Error en conexión SSE');
      setIsLoadingInternet(false);
      eventSource.close();
    };
  };

  // Load example query
  const loadExample = (example: 'tool' | 'food' | 'industrial') => {
    switch (example) {
      case 'tool':
        setQuery('LLAVE MIXTA 13MM TRUPER');
        setMarca('TRUPER');
        break;
      case 'food':
        setQuery('aceite vegetal para cocinar');
        setMarca('');
        break;
      case 'industrial':
        setQuery('TORNILLO HEXAGONAL 1/4 x 2 PULG ACERO');
        setMarca('');
        break;
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!query.trim()) {
      alert('Por favor ingresa un texto de búsqueda');
      return;
    }
    if (selectedCollections.length === 0) {
      alert('Por favor selecciona al menos una colección');
      return;
    }

    setIsSearching(true);
    setSearchResults([]);
    setInternetResults(null);
    setQuickProductInfo(null);
    setSearchDuration('');
    setInternetProgress('');
    setInternetError('');
    setClientFilterMessage('');
    setSuppliersResults(null);
    setSpecsResults(null);
    setPricesResults(null);
    setAlternativesResults(null);

    // Build request body for JSON display
    const requestBody: any = {
      query: query.trim(),
      collections: selectedCollections,
      limit,
      useLLMFilter,
      minRelevancia,
    };
    if (marca) requestBody.marca = marca.trim();
    if (cliente) requestBody.cliente = cliente.trim();

    setRequestJson(JSON.stringify(requestBody, null, 2));
    setResponseJson('');

    try {
      // Call semantic search endpoint (fast)
      const response = await searchApi.searchByText({
        query: query.trim(),
        collections: selectedCollections,
        limit,
        ...(marca && { marca: marca.trim() }),
        ...(cliente && { cliente: cliente.trim() }),
        useLLMFilter,
        minRelevancia,
      });

      setSearchResults(response.data.results);
      setSearchDuration(response.data.duration);
      setResponseJson(JSON.stringify(response.data, null, 2));

      if (response.data.client_filter_message) {
        setClientFilterMessage(response.data.client_filter_message);
      }

      // Start internet search via SSE (if enabled)
      if (includeInternetSearch) {
        handleInternetSearchSSE(query.trim(), selectedCollections);
      }
    } catch (error: any) {
      const errorData = error.response?.data || { error: error.message };
      setResponseJson(JSON.stringify(errorData, null, 2));
      alert(`Error en búsqueda: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Búsqueda Semántica por Texto</h2>
            <p className="text-muted-foreground text-sm md:text-base">
              Encuentra productos usando lenguaje natural y búsqueda vectorial
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <strong>Endpoint:</strong> POST /api/search/text
            </p>
          </div>

          {/* Example buttons */}
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 self-center">Ejemplos:</span>
            <button
              onClick={() => loadExample('tool')}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Herramienta
            </button>
            <button
              onClick={() => loadExample('food')}
              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
            >
              Alimento
            </button>
            <button
              onClick={() => loadExample('industrial')}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
            >
              Industrial
            </button>
            <button
              onClick={() => setShowJsonPanel(!showJsonPanel)}
              className={`ml-auto px-3 py-1 text-sm rounded flex items-center gap-1 ${
                showJsonPanel ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Code className="h-4 w-4" />
              {showJsonPanel ? 'Ocultar JSON' : 'Ver JSON'}
            </button>
          </div>

          <div className={`grid gap-4 md:gap-6 ${showJsonPanel ? 'xl:grid-cols-3' : 'lg:grid-cols-2'}`}>
            {/* Search Input Panel */}
            <div className="space-y-4">
              {/* Collection Selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">1. Selecciona Colecciones</CardTitle>
                  <CardDescription className="text-xs">
                    {selectedCollections.length} seleccionadas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <input
                        type="checkbox"
                        id="select-all"
                        checked={selectedCollections.length === collections?.length && collections?.length > 0}
                        onChange={toggleAllCollections}
                        className="w-4 h-4"
                      />
                      <label htmlFor="select-all" className="text-sm font-semibold cursor-pointer">
                        Seleccionar todas
                      </label>
                    </div>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {collections?.map((collection: any) => (
                        <div key={collection.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`collection-${collection.id}`}
                            checked={selectedCollections.includes(collection.name)}
                            onChange={() => toggleCollection(collection.name)}
                            className="w-4 h-4"
                          />
                          <label htmlFor={`collection-${collection.id}`} className="text-xs cursor-pointer">
                            {collection.name}
                            <span className="text-gray-500 ml-1">({collection.totalPoints?.toLocaleString()})</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Search Form */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">2. Búsqueda</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSearch} className="space-y-3">
                    <textarea
                      className="w-full px-3 py-2 border rounded-md text-sm font-mono min-h-[60px]"
                      placeholder="Ej: LLAVE MIXTA 13MM"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1">Límite</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          className="w-full px-2 py-1 border rounded text-sm"
                          value={limit}
                          onChange={(e) => setLimit(parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Marca</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1 border rounded text-sm"
                          placeholder="TRUPER"
                          value={marca}
                          onChange={(e) => setMarca(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Cliente</label>
                      <input
                        type="text"
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="000106"
                        value={cliente}
                        onChange={(e) => setCliente(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="internet-search"
                          checked={includeInternetSearch}
                          onChange={(e) => setIncludeInternetSearch(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="internet-search" className="text-xs">
                          Buscar en Internet
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="llm-filter"
                          checked={useLLMFilter}
                          onChange={(e) => setUseLLMFilter(e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor="llm-filter" className="text-xs">
                          Filtro LLM (RTI)
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Relevancia mín: {(minRelevancia * 100).toFixed(0)}%
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={minRelevancia}
                          onChange={(e) => setMinRelevancia(parseFloat(e.target.value))}
                          className="w-full h-2"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!query.trim() || selectedCollections.length === 0 || isSearching}
                      className="w-full"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Buscando...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Buscar
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Results Panel */}
            <div className={showJsonPanel ? '' : ''}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resultados</CardTitle>
                  <CardDescription className="text-xs">
                    {searchResults.length > 0 ? (
                      <>{searchResults.length} encontrados {searchDuration && `(${searchDuration})`}</>
                    ) : (
                      'Los resultados aparecerán aquí'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Client Filter Message */}
                  {clientFilterMessage && (
                    <div className={`mb-3 p-2 rounded text-xs ${
                      clientFilterMessage.includes('Error') ? 'bg-red-50 text-red-800' :
                      clientFilterMessage.includes('no ha comprado') ? 'bg-yellow-50 text-yellow-800' :
                      'bg-blue-50 text-blue-800'
                    }`}>
                      {clientFilterMessage}
                    </div>
                  )}

                  {/* Results List */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <div key={index} className="p-3 border rounded-lg hover:shadow-sm transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="font-medium text-sm">#{index + 1}</span>
                              {result.collection && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                                  {result.collection}
                                </span>
                              )}
                              {result.rti && (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                  result.rti.categoria_rti === 'EXACTO' ? 'bg-green-100 text-green-800' :
                                  result.rti.categoria_rti === 'EQUIVALENTE' ? 'bg-emerald-100 text-emerald-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {result.rti.categoria_rti}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-right">
                              {result.rti ? (
                                <div>
                                  <span className="font-bold text-green-600">{(result.rti.score_rti * 100).toFixed(0)}%</span>
                                  <div className="text-gray-400">Vec: {((result.score_vectorial || result.score) * 100).toFixed(0)}%</div>
                                </div>
                              ) : (
                                <span className="font-mono font-medium text-green-600">{(result.score * 100).toFixed(1)}%</span>
                              )}
                            </div>
                          </div>

                          {result.rti?.razon && (
                            <div className="mb-2 p-1.5 bg-blue-50 rounded text-xs text-blue-800">
                              {result.rti.razon}
                            </div>
                          )}

                          <div className="space-y-0.5 text-xs">
                            {Object.entries(result.payload)
                              .filter(([key]) => key !== '_original_id')
                              .slice(0, 5)
                              .map(([key, value]) => (
                                <div key={key} className="flex">
                                  <span className="text-gray-500 min-w-[80px]">{key}:</span>
                                  <span className="truncate">{String(value)}</span>
                                </div>
                              ))}
                          </div>

                          {/* Client Info */}
                          {result.cliente_info && (
                            <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                              <div className="flex items-center gap-1 mb-1">
                                <Database className="h-3 w-3 text-blue-600" />
                                <span className="font-semibold text-blue-900">Cliente</span>
                              </div>
                              {result.cliente_info.vendido_a_cliente ? (
                                <span className="text-green-700">✓ Vendido ({result.cliente_info.cantidad_ventas_cliente}x)</span>
                              ) : (
                                <span className="text-gray-500">No vendido</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : isSearching ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-sm text-muted-foreground">Buscando...</p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Search className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">Escribe una consulta</p>
                    </div>
                  )}

                  {/* Internet Progress */}
                  {isLoadingInternet && (
                    <div className="mt-4 p-3 bg-blue-50 rounded">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                        <span className="text-sm text-blue-700">{internetProgress}</span>
                      </div>
                    </div>
                  )}

                  {internetError && (
                    <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700">
                      {internetError}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* JSON Panel (Developer Reference) */}
            {showJsonPanel && (
              <div className="space-y-4">
                {/* Request JSON */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-sm font-bold mb-1">Request JSON</h2>
                  <p className="text-xs text-gray-500 mb-2">POST /api/search/text</p>
                  <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-48 overflow-y-auto">
                    {requestJson || '// Request aparecerá aquí'}
                  </pre>
                </div>

                {/* Response JSON */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-sm font-bold mb-1">Response JSON</h2>
                  <p className="text-xs text-gray-500 mb-2">
                    {searchDuration || 'Esperando...'}
                  </p>
                  <pre className="bg-gray-900 text-blue-400 p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
                    {responseJson || '// Response aparecerá aquí'}
                  </pre>
                </div>

                {/* cURL example */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-sm font-bold mb-2">cURL Ejemplo</h2>
                  <pre className="bg-gray-800 text-gray-300 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST \\
  http://localhost:3001/api/search/text \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "LLAVE MIXTA 13MM",
    "collections": ["catalogo_stock"],
    "limit": 3,
    "useLLMFilter": false,
    "minRelevancia": 0.50
  }'`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
