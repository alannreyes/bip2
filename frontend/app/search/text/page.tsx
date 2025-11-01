'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Search, Database, Loader2 } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
  collection?: string;
  cliente_info?: {
    vendido_a_cliente: boolean;
    cantidad_ventas_cliente: number;
    primera_venta_cliente: string | null;
    ultima_venta_cliente: string | null;
  };
}

export default function TextSearchPage() {
  const { data: collections } = useCollections();
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [query, setQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDuration, setSearchDuration] = useState<string>('');
  const [limit, setLimit] = useState(10);
  const [marca, setMarca] = useState<string>('');
  const [cliente, setCliente] = useState<string>('');
  const [includeInternetSearch, setIncludeInternetSearch] = useState<boolean>(true);
  const [useLLMFilter, setUseLLMFilter] = useState<boolean>(false); // Default: OFF - trust embeddings
  const [internetResults, setInternetResults] = useState<any>(null);
  const [quickProductInfo, setQuickProductInfo] = useState<any>(null); // Quick identification (shows first)

  // SSE states
  const [isLoadingInternet, setIsLoadingInternet] = useState(false);
  const [internetProgress, setInternetProgress] = useState<string>('');
  const [internetError, setInternetError] = useState<string>('');

  // Parallel search states - Progressive results
  const [suppliersResults, setSuppliersResults] = useState<any>(null);
  const [specsResults, setSpecsResults] = useState<any>(null);
  const [pricesResults, setPricesResults] = useState<any>(null);
  const [alternativesResults, setAlternativesResults] = useState<any>(null);

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

    const eventSource = new EventSource(
      `http://localhost:3001/api/search/internet?query=${encodeURIComponent(searchQuery)}&collections=${collections.join(',')}`
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
            // Store quick product info for immediate display
            if (data.productInfo && data.productInfo.identificado) {
              setQuickProductInfo(data.productInfo);
            }
            break;

          // PARALLEL SEARCHES
          case 'parallel_search_start':
            setInternetProgress(data.message);
            break;

          case 'suppliers_search_start':
            setInternetProgress('🔍 ' + data.message);
            break;
          case 'suppliers_search_complete':
            setInternetProgress(`✅ ${data.message} (${data.duration})`);
            setSuppliersResults(data.results);
            break;

          case 'specs_search_start':
            setInternetProgress('📋 ' + data.message);
            break;
          case 'specs_search_complete':
            setInternetProgress(`✅ ${data.message} (${data.duration})`);
            setSpecsResults(data.results);
            break;

          case 'prices_search_start':
            setInternetProgress('💰 ' + data.message);
            break;
          case 'prices_search_complete':
            setInternetProgress(`✅ ${data.message} (${data.duration})`);
            setPricesResults(data.results);
            break;

          case 'alternatives_search_start':
            setInternetProgress('🔄 ' + data.message);
            break;
          case 'alternatives_search_complete':
            setInternetProgress(`✅ ${data.message} (${data.duration})`);
            setAlternativesResults(data.results);
            break;

          case 'all_searches_complete':
            setInternetProgress(`✅ ${data.message}`);
            setInternetResults(data.results);
            setIsLoadingInternet(false);
            eventSource.close();
            break;

          // LEGACY events (for backward compatibility)
          case 'internet_start':
            setInternetProgress(data.message);
            break;
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
    setQuickProductInfo(null); // Reset quick identification
    setSearchDuration('');
    setInternetProgress('');
    setInternetError('');
    // Reset parallel search results
    setSuppliersResults(null);
    setSpecsResults(null);
    setPricesResults(null);
    setAlternativesResults(null);

    try {
      // Call semantic search endpoint (fast)
      const response = await searchApi.searchByText({
        query: query.trim(),
        collections: selectedCollections,
        limit,
        ...(marca && { marca: marca.trim() }),
        ...(cliente && { cliente: cliente.trim() }),
        useLLMFilter, // Optional LLM filter
      });

      setSearchResults(response.data.results);
      setSearchDuration(response.data.duration);

      // Start internet search via SSE (if enabled)
      if (includeInternetSearch) {
        handleInternetSearchSSE(query.trim(), selectedCollections);
      }
    } catch (error: any) {
      alert(`Error en búsqueda: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight">Búsqueda Semántica por Texto</h2>
            <p className="text-muted-foreground">
              Encuentra productos usando lenguaje natural y búsqueda vectorial
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Search Input Panel */}
            <div className="space-y-6">
              {/* Collection Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>1. Selecciona Colecciones</CardTitle>
                  <CardDescription>
                    Elige una, varias o todas las colecciones ({selectedCollections.length} seleccionadas)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Select All Checkbox */}
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <input
                        type="checkbox"
                        id="select-all"
                        checked={selectedCollections.length === collections?.length && collections?.length > 0}
                        onChange={toggleAllCollections}
                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                      />
                      <label
                        htmlFor="select-all"
                        className="text-sm font-semibold text-gray-700 cursor-pointer select-none"
                      >
                        Seleccionar todas
                      </label>
                    </div>

                    {/* Individual Collection Checkboxes */}
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {collections?.map((collection: any) => (
                        <div key={collection.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`collection-${collection.id}`}
                            checked={selectedCollections.includes(collection.name)}
                            onChange={() => toggleCollection(collection.name)}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                          />
                          <label
                            htmlFor={`collection-${collection.id}`}
                            className="text-sm text-gray-700 cursor-pointer select-none flex-1"
                          >
                            {collection.name}
                            <span className="text-xs text-gray-500 ml-2">
                              ({collection.totalPoints?.toLocaleString()} puntos)
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Search Form */}
              <Card>
                <CardHeader>
                  <CardTitle>2. Escribe tu Búsqueda</CardTitle>
                  <CardDescription>Usa lenguaje natural para describir lo que buscas</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSearch} className="space-y-4">
                    <div>
                      <textarea
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px]"
                        placeholder="Ej: aceite vegetal para cocinar, arroz de grano largo, productos de limpieza..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Número de resultados
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        value={limit}
                        onChange={(e) => setLimit(parseInt(e.target.value))}
                      />
                    </div>

                    <div className="border-t pt-4">
                      <div className="text-sm font-semibold mb-3 text-gray-700">Filtros Opcionales</div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Marca
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: TRUPER, APU, etc."
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            value={marca}
                            onChange={(e) => setMarca(e.target.value)}
                          />
                          <p className="text-xs text-gray-500 mt-1">Filtra resultados solo de esta marca</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Código de Cliente
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 000106, 004401"
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                            value={cliente}
                            onChange={(e) => setCliente(e.target.value)}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Muestra historial de ventas para este cliente
                          </p>
                        </div>

                        <div className="flex items-center space-x-2 pt-2">
                          <input
                            type="checkbox"
                            id="internet-search"
                            checked={includeInternetSearch}
                            onChange={(e) => setIncludeInternetSearch(e.target.checked)}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                          />
                          <label
                            htmlFor="internet-search"
                            className="text-sm font-medium cursor-pointer select-none"
                          >
                            Buscar también en Internet
                          </label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6 -mt-2">
                          Complementa los resultados con información de proveedores en línea
                        </p>

                        <div className="flex items-center space-x-2 pt-2">
                          <input
                            type="checkbox"
                            id="llm-filter"
                            checked={useLLMFilter}
                            onChange={(e) => setUseLLMFilter(e.target.checked)}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                          />
                          <label
                            htmlFor="llm-filter"
                            className="text-sm font-medium cursor-pointer select-none"
                          >
                            Activar filtro semántico LLM
                          </label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6 -mt-2">
                          Filtro avanzado con IA (desactivado por defecto para confiar en embeddings)
                        </p>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={!query.trim() || selectedCollections.length === 0 || isSearching}
                      className="w-full"
                      size="lg"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Buscando...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-5 w-5" />
                          Buscar Productos
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

            </div>

            {/* Results Panel */}
            <div>
              <Card className="sticky top-8">
                <CardHeader>
                  <CardTitle>Resultados de Búsqueda</CardTitle>
                  <CardDescription>
                    {searchResults.length > 0 ? (
                      <>
                        {searchResults.length} productos encontrados
                        {searchDuration && <span className="ml-2 text-xs">({searchDuration})</span>}
                      </>
                    ) : (
                      'Los resultados aparecerán aquí'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Query Display */}
                  {query && searchResults.length > 0 && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium mb-2">Búsqueda:</div>
                      <div className="text-sm text-gray-700">{query}</div>
                    </div>
                  )}

                  {/* Results List */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Resultado #{index + 1}</span>
                              {result.collection && (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                  {result.collection}
                                </span>
                              )}
                            </div>
                            <div className="text-sm">
                              <span className="text-muted-foreground">Relevancia: </span>
                              <span className="font-mono font-medium text-green-600">
                                {(result.score * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          {/* Indicadores de disponibilidad - Stock y Lista de Precio */}
                          {result.collection === 'catalogo_efc_200k' && (result.payload.en_stock || result.payload.precio_lista) && (
                            <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                              {result.payload.en_stock && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border-2 border-green-500 rounded-lg">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                                    ✓ En Stock
                                  </span>
                                </div>
                              )}
                              {result.payload.precio_lista && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border-2 border-blue-500 rounded-lg">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                                    $ Lista de Precio
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="space-y-1 text-sm">
                            {Object.entries(result.payload)
                              .filter(([key]) => key !== '_original_id')
                              .map(([key, value]) => (
                                <div key={key} className="flex">
                                  <span className="text-muted-foreground min-w-[120px] capitalize">
                                    {key}:
                                  </span>
                                  <span className="font-medium break-all">
                                    {String(value)}
                                  </span>
                                </div>
                              ))}
                          </div>

                          {/* Client Purchase Info */}
                          {result.cliente_info && (
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                              <div className="flex items-center gap-2 mb-2">
                                <Database className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-semibold text-blue-900">
                                  Información de Cliente
                                </span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-700">Estado:</span>
                                  {result.cliente_info.vendido_a_cliente ? (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                      ✓ Vendido a este cliente
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                      No vendido a este cliente
                                    </span>
                                  )}
                                </div>
                                {result.cliente_info.vendido_a_cliente && (
                                  <>
                                    <div className="flex">
                                      <span className="text-blue-700 min-w-[140px]">Cantidad de ventas:</span>
                                      <span className="font-semibold text-blue-900">
                                        {result.cliente_info.cantidad_ventas_cliente}
                                      </span>
                                    </div>
                                    {result.cliente_info.primera_venta_cliente && (
                                      <div className="flex">
                                        <span className="text-blue-700 min-w-[140px]">Primera venta:</span>
                                        <span className="font-medium text-blue-900">
                                          {new Date(result.cliente_info.primera_venta_cliente).toLocaleDateString('es-ES')}
                                        </span>
                                      </div>
                                    )}
                                    {result.cliente_info.ultima_venta_cliente && (
                                      <div className="flex">
                                        <span className="text-blue-700 min-w-[140px]">Última venta:</span>
                                        <span className="font-medium text-blue-900">
                                          {new Date(result.cliente_info.ultima_venta_cliente).toLocaleDateString('es-ES')}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Progress bar for score */}
                          <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-green-600 h-1.5 rounded-full transition-all"
                                style={{ width: `${result.score * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* SSE Progress Indicator */}
                  {isLoadingInternet && (
                    <div className="mt-8 border-t pt-6">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                          <div>
                            <div className="font-medium text-blue-900">Búsqueda en Internet</div>
                            <div className="text-sm text-blue-700 mt-1">{internetProgress}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PROGRESSIVE RESULTS - Show as they arrive */}
                  {/* Suppliers Results - Shows first (~20-25s) */}
                  {suppliersResults && suppliersResults.proveedores && suppliersResults.proveedores.length > 0 && (
                    <div className="mt-6 p-4 bg-purple-50 border-2 border-purple-300 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">👥</span>
                        <h4 className="font-bold text-purple-900">Proveedores en Perú ({suppliersResults.proveedores.length})</h4>
                        <span className="ml-auto px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs font-semibold">NUEVO</span>
                      </div>
                      <div className="space-y-2">
                        {suppliersResults.proveedores.slice(0, 3).map((proveedor: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white border border-purple-200 rounded">
                            <div className="font-semibold text-purple-900">{proveedor.nombre}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {proveedor.telefono && <div>📞 {proveedor.telefono}</div>}
                              {proveedor.email && <div>✉️ {proveedor.email}</div>}
                              {proveedor.whatsapp && <div>💬 {proveedor.whatsapp}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Specs Results - Shows second (~20-25s) */}
                  {specsResults && specsResults.especificaciones && (
                    <div className="mt-6 p-4 bg-indigo-50 border-2 border-indigo-300 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">📋</span>
                        <h4 className="font-bold text-indigo-900">Especificaciones Técnicas</h4>
                        <span className="ml-auto px-2 py-1 bg-indigo-200 text-indigo-800 rounded text-xs font-semibold">NUEVO</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-indigo-200 space-y-2 text-sm">
                        {specsResults.especificaciones.marca && <div><span className="font-semibold">Marca:</span> {specsResults.especificaciones.marca}</div>}
                        {specsResults.especificaciones.material && <div><span className="font-semibold">Material:</span> {specsResults.especificaciones.material}</div>}
                        {specsResults.especificaciones.medidas && <div><span className="font-semibold">Medidas:</span> {specsResults.especificaciones.medidas}</div>}
                      </div>
                    </div>
                  )}

                  {/* Alternatives Results - Shows third (~25-30s) */}
                  {alternativesResults && alternativesResults.alternativas && alternativesResults.alternativas.length > 0 && (
                    <div className="mt-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🔄</span>
                        <h4 className="font-bold text-amber-900">Alternativas Similares ({alternativesResults.alternativas.length})</h4>
                        <span className="ml-auto px-2 py-1 bg-amber-200 text-amber-800 rounded text-xs font-semibold">NUEVO</span>
                      </div>
                      <div className="space-y-2">
                        {alternativesResults.alternativas.slice(0, 3).map((alt: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white border border-amber-200 rounded">
                            <div className="font-semibold text-amber-900">{alt.nombre}</div>
                            <div className="text-sm text-gray-700 mt-1">{alt.razon}</div>
                            {alt.compatibilidad && <div className="text-xs text-amber-700 mt-1">Compatibilidad: {alt.compatibilidad}%</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prices Results - Shows last (~35-40s) */}
                  {pricesResults && pricesResults.precios && pricesResults.precios.length > 0 && (
                    <div className="mt-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">💰</span>
                        <h4 className="font-bold text-green-900">Precios Referenciales ({pricesResults.precios.length})</h4>
                        <span className="ml-auto px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-semibold">NUEVO</span>
                      </div>
                      {pricesResults.rango_precio && (
                        <div className="mb-3 p-2 bg-white rounded border border-green-200">
                          <div className="text-sm font-semibold text-green-900">
                            Rango: {pricesResults.rango_precio.moneda} {pricesResults.rango_precio.minimo} - {pricesResults.rango_precio.maximo}
                            {pricesResults.rango_precio.promedio && <span className="ml-2 text-green-700">(Promedio: {pricesResults.rango_precio.promedio})</span>}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {pricesResults.precios.slice(0, 5).map((precio: any, idx: number) => (
                          <div key={idx} className="p-2 bg-white border border-green-200 rounded text-sm">
                            <div className="flex justify-between items-start">
                              <div className="font-semibold text-green-900">{precio.proveedor}</div>
                              <div className="font-bold text-green-700">{precio.moneda} {precio.precio}</div>
                            </div>
                            {precio.disponibilidad && <div className="text-xs text-gray-600 mt-1">{precio.disponibilidad}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unified Product Identification Card - Progressive Enhancement */}
                  {(quickProductInfo && quickProductInfo.identificado && !internetResults?.producto_confirmado) && (
                    <div className="mt-8 border-t pt-6">
                      <div className="p-5 bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-lg shadow-md">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center">
                              <Search className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-amber-900 text-lg">Producto Identificado</div>
                                <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold uppercase">
                                  Preliminar
                                </span>
                              </div>
                              <div className="text-sm text-amber-700">Información básica del LLM</div>
                            </div>
                          </div>
                          {isLoadingInternet && (
                            <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
                          )}
                        </div>

                        <div className="space-y-3 bg-white p-4 rounded-lg border border-amber-200">
                          <div className="flex flex-col">
                            <span className="text-amber-700 font-semibold text-sm mb-1">Nombre del Producto</span>
                            <span className="text-gray-900 text-lg font-medium">{quickProductInfo.nombre_producto}</span>
                          </div>

                          {quickProductInfo.categoria && (
                            <div className="flex items-center gap-2 pt-2">
                              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                                {quickProductInfo.categoria}
                              </span>
                              {quickProductInfo.tipo && (
                                <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                                  {quickProductInfo.tipo}
                                </span>
                              )}
                            </div>
                          )}

                          {quickProductInfo.descripcion_breve && (
                            <div className="flex flex-col pt-2">
                              <span className="text-amber-700 font-semibold text-sm mb-1">Descripción</span>
                              <span className="text-gray-700">{quickProductInfo.descripcion_breve}</span>
                            </div>
                          )}

                          {quickProductInfo.usos_principales && quickProductInfo.usos_principales.length > 0 && (
                            <div className="flex flex-col pt-2">
                              <span className="text-amber-700 font-semibold text-sm mb-2">Usos Principales</span>
                              <ul className="list-disc list-inside space-y-1 text-gray-700">
                                {quickProductInfo.usos_principales.map((uso: string, idx: number) => (
                                  <li key={idx} className="text-sm">{uso}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Internet Error */}
                  {internetError && (
                    <div className="mt-8 border-t pt-6">
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="text-red-600">⚠️</div>
                          <div>
                            <div className="font-medium text-red-900">Error en Búsqueda de Internet</div>
                            <div className="text-sm text-red-700 mt-1">{internetError}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Internet Results Section */}
                  {internetResults && !isLoadingInternet && (
                    <div className="mt-8 border-t pt-6">
                      {/* Product Confirmation - Final Verified Info */}
                      {internetResults.producto_confirmado && (
                        <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-lg shadow-md">
                          <div className="flex items-center gap-2 mb-4">
                            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                              <Search className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-green-900 text-lg">Producto Identificado</div>
                                <span className="px-2 py-0.5 bg-green-600 text-white rounded-full text-xs font-bold uppercase">
                                  ✓ Confirmado
                                </span>
                              </div>
                              <div className="text-sm text-green-700">Información verificada de internet</div>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm bg-white p-4 rounded-lg border border-green-200">
                            <div className="flex">
                              <span className="text-green-700 min-w-[150px] font-medium">Nombre:</span>
                              <span className="text-green-900">{internetResults.producto_confirmado.nombre_comercial}</span>
                            </div>
                            {internetResults.producto_confirmado.marca && (
                              <div className="flex">
                                <span className="text-green-700 min-w-[150px] font-medium">Marca:</span>
                                <span className="text-green-900">{internetResults.producto_confirmado.marca}</span>
                              </div>
                            )}
                            {internetResults.producto_confirmado.codigo_producto && (
                              <div className="flex">
                                <span className="text-green-700 min-w-[150px] font-medium">Código:</span>
                                <span className="text-green-900 font-mono">{internetResults.producto_confirmado.codigo_producto}</span>
                              </div>
                            )}
                            {internetResults.producto_confirmado.uso_producto && (
                              <div className="flex flex-col mt-3">
                                <span className="text-green-700 font-medium mb-1">Uso del Producto:</span>
                                <span className="text-green-900 bg-green-100 p-3 rounded border border-green-300">
                                  {internetResults.producto_confirmado.uso_producto}
                                </span>
                              </div>
                            )}
                            {internetResults.producto_confirmado.usos_aplicaciones && (
                              <div className="flex flex-col mt-2">
                                <span className="text-green-700 font-medium mb-1">Aplicaciones:</span>
                                <span className="text-green-900">{internetResults.producto_confirmado.usos_aplicaciones}</span>
                              </div>
                            )}
                            {internetResults.producto_confirmado.especificaciones_tecnicas && (
                              <div className="flex">
                                <span className="text-green-700 min-w-[150px] font-medium">Especificaciones:</span>
                                <span className="text-green-900">{internetResults.producto_confirmado.especificaciones_tecnicas}</span>
                              </div>
                            )}
                            {internetResults.producto_confirmado.categoria && (
                              <div className="flex">
                                <span className="text-green-700 min-w-[150px] font-medium">Categoría:</span>
                                <span className="text-green-900">{internetResults.producto_confirmado.categoria}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Alternatives */}
                      {internetResults.alternativas_similares && internetResults.alternativas_similares.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-semibold mb-3">Alternativas Similares</h4>
                          <div className="space-y-2">
                            {internetResults.alternativas_similares.map((alt: any, idx: number) => (
                              <div key={idx} className="p-3 border rounded bg-amber-50 border-amber-200">
                                <div className="font-medium">{alt.nombre}</div>
                                {alt.marca && <div className="text-sm text-gray-600">Marca: {alt.marca}</div>}
                                {alt.razon && <div className="text-sm text-gray-700 mt-1">{alt.razon}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Validation Info */}
                      {internetResults.validacion && (
                        <div className={`p-4 rounded-lg border ${
                          internetResults.validacion.producto_encontrado
                            ? 'bg-green-50 border-green-200'
                            : 'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold">Estado de Validación</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              internetResults.validacion.producto_encontrado
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {internetResults.validacion.producto_encontrado ? 'Encontrado' : 'No encontrado'}
                            </span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div>
                              <span className="font-medium">Confianza:</span>{' '}
                              <span className="font-semibold">{internetResults.validacion.confianza}%</span>
                            </div>
                            {internetResults.validacion.advertencias && (
                              <div className="mt-2 text-gray-700">
                                {internetResults.validacion.advertencias}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {searchResults.length === 0 && !internetResults && isSearching ? (
                    <div className="text-center py-12">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Generando embeddings y buscando...</p>
                    </div>
                  ) : searchResults.length === 0 && !internetResults && !isSearching ? (
                    <div className="text-center py-12">
                      <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground">
                        Escribe una consulta para comenzar la búsqueda
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
