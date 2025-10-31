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

                        {isLoadingInternet && (
                          <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded-lg">
                            <div className="flex items-center gap-2 text-sm text-amber-900">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="font-medium">Verificando y enriqueciendo con información de internet...</span>
                            </div>
                          </div>
                        )}
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
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Search className="h-5 w-5 text-blue-600" />
                          Resultados de Internet
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Información complementaria encontrada en línea
                        </p>
                      </div>

                      {/* EFC Ecommerce Search - Improved Experience */}
                      {(internetResults.resultados_efc?.encontrado_en_efc && internetResults.resultados_efc.productos_efc && internetResults.resultados_efc.productos_efc.length > 0) || quickProductInfo?.nombre_producto && (
                        <div className="mb-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg shadow-md">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                                <Search className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <div className="font-bold text-blue-900 text-lg">Buscar en EFC Ecommerce</div>
                                <div className="text-sm text-blue-700">
                                  {internetResults.resultados_efc?.encontrado_en_efc
                                    ? `Posibles coincidencias encontradas (${internetResults.resultados_efc.productos_efc.length})`
                                    : 'Productos relacionados disponibles'
                                  }
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Product matches summary */}
                          {internetResults.resultados_efc?.productos_efc && internetResults.resultados_efc.productos_efc.length > 0 && (
                            <div className="mb-4 space-y-2">
                              {internetResults.resultados_efc.productos_efc.slice(0, 3).map((producto: any, idx: number) => (
                                <div key={idx} className="p-3 bg-white border border-blue-200 rounded-lg">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="font-semibold text-gray-900 text-sm">{producto.nombre}</div>
                                      {producto.codigo && (
                                        <div className="text-xs text-gray-600 font-mono mt-1">Código: {producto.codigo}</div>
                                      )}
                                    </div>
                                    {producto.coincidencia && (
                                      <div className="ml-2 px-2 py-1 bg-blue-100 rounded text-xs font-bold text-blue-700">
                                        {producto.coincidencia}%
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Search button with query */}
                          <a
                            href={`https://empresas.efc.com.pe/search/?q=${encodeURIComponent(
                              internetResults?.producto_confirmado?.nombre_comercial ||
                              quickProductInfo?.nombre_producto ||
                              query
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-md hover:shadow-lg"
                          >
                            <Search className="h-5 w-5" />
                            Buscar "{internetResults?.producto_confirmado?.nombre_comercial || quickProductInfo?.nombre_producto || query}" en EFC
                          </a>

                          {internetResults.resultados_efc?.mensaje && (
                            <div className="mt-3 text-xs text-blue-700 italic">
                              💡 {internetResults.resultados_efc.mensaje}
                            </div>
                          )}
                        </div>
                      )}

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

                      {/* Providers */}
                      {internetResults.proveedores && internetResults.proveedores.length > 0 && (
                        <div className="mb-6">
                          <h4 className="font-semibold mb-3">Proveedores Encontrados ({internetResults.proveedores.length})</h4>
                          <div className="space-y-4">
                            {internetResults.proveedores.map((proveedor: any, idx: number) => (
                              <div key={idx} className="p-4 border rounded-lg bg-white hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                  <div>
                                    <div className="font-semibold text-lg">{proveedor.nombre_empresa}</div>
                                    <div className="flex gap-2 mt-1">
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                        {proveedor.pais}
                                      </span>
                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs capitalize">
                                        {proveedor.tipo}
                                      </span>
                                    </div>
                                  </div>
                                  {proveedor.relevancia_score && (
                                    <div className="text-right">
                                      <div className="text-sm text-muted-foreground">Relevancia</div>
                                      <div className="text-lg font-bold text-blue-600">{proveedor.relevancia_score}%</div>
                                    </div>
                                  )}
                                </div>

                                {/* Contact Info */}
                                {proveedor.contacto && (
                                  <div className="mt-3 p-3 bg-gray-50 rounded space-y-1 text-sm">
                                    {proveedor.contacto.telefono && (
                                      <div>
                                        <span className="font-medium">Teléfono:</span> {proveedor.contacto.telefono}
                                      </div>
                                    )}
                                    {proveedor.contacto.email && (
                                      <div>
                                        <span className="font-medium">Email:</span>{' '}
                                        <a href={`mailto:${proveedor.contacto.email}`} className="text-blue-600 hover:underline">
                                          {proveedor.contacto.email}
                                        </a>
                                      </div>
                                    )}
                                    {proveedor.contacto.whatsapp && (
                                      <div>
                                        <span className="font-medium">WhatsApp:</span> {proveedor.contacto.whatsapp}
                                      </div>
                                    )}
                                    {proveedor.contacto.direccion && (
                                      <div>
                                        <span className="font-medium">Dirección:</span> {proveedor.contacto.direccion}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Price & Availability */}
                                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                                  {proveedor.precio_referencial && (
                                    <div>
                                      <span className="font-medium">Precio:</span>{' '}
                                      <span className="text-green-600 font-semibold">{proveedor.precio_referencial}</span>
                                    </div>
                                  )}
                                  {proveedor.disponibilidad && (
                                    <div>
                                      <span className="font-medium">Disponibilidad:</span> {proveedor.disponibilidad}
                                    </div>
                                  )}
                                  {proveedor.tiempo_entrega && (
                                    <div>
                                      <span className="font-medium">Entrega:</span> {proveedor.tiempo_entrega}
                                    </div>
                                  )}
                                </div>

                                {/* Source URL */}
                                {proveedor.url_fuente && (
                                  <div className="mt-3 pt-3 border-t">
                                    <a
                                      href={proveedor.url_fuente}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      Ver fuente →
                                    </a>
                                  </div>
                                )}
                              </div>
                            ))}
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
