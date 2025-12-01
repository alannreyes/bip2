'use client';

import { useState } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Upload, Search, Image as ImageIcon, Loader2, X, FileText, Code } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchResult {
  id: string | number;
  score: number;
  score_vectorial?: number;
  payload: Record<string, any>;
  rti?: {
    score_rti: number;
    categoria_rti: string;
    evaluado_por: string;
    razon: string;
  };
}

export default function ImageSearchPage() {
  const { data: collections } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [limit, setLimit] = useState(3); // Aligned with backend default
  const [useLLMFilter, setUseLLMFilter] = useState<boolean>(false); // Backend default: false
  const [minRelevancia, setMinRelevancia] = useState<number | undefined>(undefined); // Auto: 0.65 con LLM, 0.70 sin LLM

  // JSON display states for developer demo
  const [requestJson, setRequestJson] = useState<string>('');
  const [responseJson, setResponseJson] = useState<string>('');
  const [responseDuration, setResponseDuration] = useState<number>(0);
  const [showJsonPanel, setShowJsonPanel] = useState<boolean>(true);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Allow images and PDFs
      const validTypes = ['image/', 'application/pdf'];
      const isValid = validTypes.some(type => file.type.startsWith(type) || file.type === 'application/pdf');

      if (!isValid) {
        alert('Por favor selecciona una imagen o archivo PDF válido');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Máximo 10MB');
        return;
      }

      setSelectedFile(file);

      // For PDFs, show a generic preview icon instead of image
      if (file.type === 'application/pdf') {
        setPreviewUrl('pdf');
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviewUrl(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtractedText('');
    setSearchResults([]);
    setRequestJson('');
    setResponseJson('');
  };

  const handleSearch = async () => {
    if (!selectedFile) {
      alert('Por favor selecciona una imagen o PDF');
      return;
    }
    if (!selectedCollection) {
      alert('Por favor selecciona una colección');
      return;
    }

    setIsSearching(true);
    setExtractedText('');
    setSearchResults([]);

    // Build request info for JSON display (multipart/form-data)
    const requestInfo = {
      endpoint: 'POST /api/search/image',
      contentType: 'multipart/form-data',
      queryParams: {
        collection: selectedCollection,
        limit: limit,
        useLLMFilter: useLLMFilter,
        minRelevancia: minRelevancia ?? (useLLMFilter ? 0.65 : 0.70),
      },
      body: {
        image: `<File: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB, ${selectedFile.type})>`
      },
    };
    setRequestJson(JSON.stringify(requestInfo, null, 2));
    setResponseJson('');

    const startTime = Date.now();

    try {
      const response = await searchApi.searchByImage(
        selectedFile,
        selectedCollection,
        limit,
        useLLMFilter,
        minRelevancia,
      );
      setResponseDuration(Date.now() - startTime);
      setExtractedText(response.data.extractedText);
      setSearchResults(response.data.results);
      setResponseJson(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      setResponseDuration(Date.now() - startTime);
      const errorMsg = error.response?.data?.message || error.message || 'Error desconocido';
      setResponseJson(JSON.stringify(error.response?.data || { error: errorMsg }, null, 2));
      alert(`Error en búsqueda: ${errorMsg}`);
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
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Búsqueda por Imagen o PDF</h2>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Encuentra productos similares desde imágenes o documentos PDF
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <strong>Endpoint:</strong> POST /api/search/image (multipart/form-data)
            </p>
          </div>

          {/* Toggle JSON Panel */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowJsonPanel(!showJsonPanel)}
              className={`px-3 py-1 text-sm rounded flex items-center gap-1 ${
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
                  <CardTitle className="text-base">1. Selecciona Colección</CardTitle>
                </CardHeader>
                <CardContent>
                  <select
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                  >
                    <option value="">-- Selecciona una colección --</option>
                    {collections?.map((collection: any) => (
                      <option key={collection.id} value={collection.name}>
                        {collection.name} ({collection.totalPoints})
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {/* Image Upload */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">2. Captura o Sube Archivo</CardTitle>
                  <CardDescription className="text-xs">Imagen o PDF (máx 10MB)</CardDescription>
                </CardHeader>
                <CardContent>
                  {!previewUrl ? (
                    <div className="space-y-3">
                      {/* Camera Capture Button */}
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-primary border-dashed rounded-lg cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-primary mb-1" />
                          <p className="text-sm font-semibold text-primary">Capturar con Cámara</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf"
                          capture="environment"
                          onChange={handleFileSelect}
                        />
                      </label>

                      {/* Gallery Selection Button */}
                      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <Upload className="h-6 w-6 text-gray-400 mb-1" />
                          <p className="text-sm text-gray-600">Seleccionar Imagen o PDF</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="relative">
                      {previewUrl === 'pdf' ? (
                        <div className="w-full h-40 flex flex-col items-center justify-center rounded-lg border bg-gray-50">
                          <FileText className="h-16 w-16 text-red-600 mb-2" />
                          <p className="text-sm font-medium text-gray-700">Archivo PDF</p>
                        </div>
                      ) : (
                        <img
                          src={previewUrl || ''}
                          alt="Preview"
                          className="w-full h-40 object-contain rounded-lg border"
                        />
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleClearFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="mt-2 text-xs text-muted-foreground text-center">
                        {selectedFile?.name} ({(selectedFile!.size / 1024).toFixed(1)} KB)
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Search Button */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">3. Configuración</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Resultados
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        className="w-full px-3 py-2 text-sm border rounded-md"
                        value={limit}
                        onChange={(e) => setLimit(parseInt(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox"
                        id="llm-filter-img"
                        checked={useLLMFilter}
                        onChange={(e) => setUseLLMFilter(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <label htmlFor="llm-filter-img" className="text-xs">
                        Filtro LLM (RTI)
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Relevancia mín: {minRelevancia !== undefined ? `${(minRelevancia * 100).toFixed(0)}%` : 'Auto (backend)'}
                      {minRelevancia !== undefined && (
                        <button
                          type="button"
                          onClick={() => setMinRelevancia(undefined)}
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </label>
                    <input
                      type="range"
                      min="0.50"
                      max="0.95"
                      step="0.05"
                      value={minRelevancia ?? (useLLMFilter ? 0.65 : 0.70)}
                      onChange={(e) => setMinRelevancia(parseFloat(e.target.value))}
                      className="w-full h-2"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>50%</span>
                      <span>95%</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {minRelevancia === undefined
                        ? `Auto: ${useLLMFilter ? '65%' : '70%'} (${useLLMFilter ? 'con' : 'sin'} LLM)`
                        : ''
                      }
                    </p>
                  </div>

                  <Button
                    onClick={handleSearch}
                    disabled={!selectedFile || !selectedCollection || isSearching}
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
                        Buscar Similares
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Results Panel */}
            <div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resultados</CardTitle>
                  <CardDescription className="text-xs">
                    {searchResults.length > 0
                      ? `${searchResults.length} productos encontrados${responseDuration ? ` (${responseDuration}ms)` : ''}`
                      : 'Los resultados aparecerán aquí'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Extracted Text */}
                  {extractedText && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs font-medium mb-1">Texto Extraído:</div>
                      <div className="text-xs text-gray-700">{extractedText}</div>
                    </div>
                  )}

                  {/* Results List */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="p-3 border rounded-lg hover:shadow-sm transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium">#{index + 1}</div>
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

                          {/* Primary fields */}
                          <div className="space-y-1 text-xs">
                            {result.payload.Articulo_Codigo && (
                              <div className="flex items-center gap-2">
                                <span className="font-mono bg-gray-800 text-white px-2 py-1 rounded text-sm font-bold">
                                  {result.payload.Articulo_Codigo}
                                </span>
                              </div>
                            )}
                            {result.payload.Articulo_Descripcion && (
                              <div className="font-medium text-gray-900 text-sm">
                                {result.payload.Articulo_Descripcion}
                              </div>
                            )}

                            {/* Secondary info row */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {result.payload.Articulo_Lista_Costo !== undefined && (
                                <span className={`px-2 py-0.5 rounded border ${
                                  result.payload.Articulo_Lista_Costo
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>
                                  {result.payload.Articulo_Lista_Costo ? 'En Lista Costo' : 'No en Lista'}
                                </span>
                              )}
                              {result.payload.Articulo_De_Stock !== undefined && (
                                <span className={`px-2 py-0.5 rounded border ${
                                  result.payload.Articulo_De_Stock
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                }`}>
                                  {result.payload.Articulo_De_Stock ? 'En Stock' : 'Sin Stock'}
                                </span>
                              )}
                              {result.payload.Cantidad_Ventas_Ultimos_3_Anios !== undefined && (
                                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded border border-purple-200">
                                  {result.payload.Cantidad_Ventas_Ultimos_3_Anios} ventas (3 años)
                                </span>
                              )}
                            </div>

                            {/* Family */}
                            {result.payload.Familia_Descripcion && (
                              <div className="text-gray-500 mt-1">
                                {result.payload.Familia_Descripcion}
                              </div>
                            )}
                          </div>

                          {/* Progress bar for score */}
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-1">
                              <div
                                className="bg-green-600 h-1 rounded-full"
                                style={{ width: `${result.score * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : isSearching ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-sm text-muted-foreground">Procesando imagen...</p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-sm text-muted-foreground">
                        Sube una imagen o PDF para comenzar
                      </p>
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
                  <h2 className="text-sm font-bold mb-1">Request Info</h2>
                  <p className="text-xs text-gray-500 mb-2">POST /api/search/image</p>
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
                  <pre className="bg-gray-900 text-blue-400 p-3 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
                    {responseJson || '// Response aparecerá aquí'}
                  </pre>
                </div>

                {/* cURL example */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h2 className="text-sm font-bold mb-2">cURL Ejemplo</h2>
                  <pre className="bg-gray-800 text-gray-300 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST \\
  "http://localhost:3001/api/search/image?collection=catalogo_stock&limit=3" \\
  -H "Content-Type: multipart/form-data" \\
  -F "image=@/path/to/image.jpg"`}
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
