'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Upload, Search, Image as ImageIcon, Loader2, Database, AlertCircle, X, FileText } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

export default function ImageSearchPage() {
  const { data: collections } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [limit, setLimit] = useState(3);

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

    console.log('🔍 Starting search...');
    console.log('File:', selectedFile.name, 'Type:', selectedFile.type, 'Size:', selectedFile.size);
    console.log('Collection:', selectedCollection);
    console.log('Limit:', limit);

    setIsSearching(true);
    setExtractedText('');
    setSearchResults([]);

    try {
      console.log('📤 Sending request to backend...');
      const response = await searchApi.searchByImage(selectedFile, selectedCollection, limit);
      console.log('✅ Response received:', response);
      setExtractedText(response.data.extractedText);
      setSearchResults(response.data.results);
      console.log('✅ Results set:', response.data.results.length, 'results');
    } catch (error: any) {
      console.error('❌ Search error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
      const errorMsg = error.response?.data?.message || error.message || 'Error desconocido';
      alert(`Error en búsqueda: ${errorMsg}\n\nRevisa la consola (F12) para más detalles.`);
    } finally {
      setIsSearching(false);
      console.log('🏁 Search completed');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Búsqueda por Imagen o PDF</h2>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Encuentra productos similares desde imágenes o documentos PDF
            </p>
          </div>

          <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
            {/* Search Input Panel */}
            <div className="space-y-4 md:space-y-6">
              {/* Collection Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg">1. Selecciona Colección</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Elige la colección donde buscar</CardDescription>
                </CardHeader>
                <CardContent>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                  >
                    <option value="">-- Selecciona una colección --</option>
                    {collections?.map((collection: any) => (
                      <option key={collection.id} value={collection.name}>
                        {collection.name} ({collection.totalPoints} puntos)
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {/* Image Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg">2. Captura o Sube un Archivo</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Toma una foto, selecciona imagen o sube un PDF (máx 10MB)</CardDescription>
                </CardHeader>
                <CardContent>
                  {!previewUrl ? (
                    <div className="space-y-3">
                      {/* Camera Capture Button */}
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-primary border-dashed rounded-lg cursor-pointer bg-primary/5 hover:bg-primary/10 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <ImageIcon className="h-10 w-10 text-primary mb-2" />
                          <p className="text-sm font-semibold text-primary">
                            📷 Capturar con Cámara
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Tomar foto ahora
                          </p>
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
                      <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <Upload className="h-8 w-8 text-gray-400 mb-1" />
                          <p className="text-sm text-gray-600">
                            Seleccionar Imagen o PDF
                          </p>
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
                        <div className="w-full h-64 flex flex-col items-center justify-center rounded-lg border bg-gray-50">
                          <FileText className="h-20 w-20 text-red-600 mb-2" />
                          <p className="text-sm font-medium text-gray-700">Archivo PDF</p>
                        </div>
                      ) : (
                        <img
                          src={previewUrl || ''}
                          alt="Preview"
                          className="w-full h-64 object-contain rounded-lg border"
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
                      <div className="mt-2 text-sm text-muted-foreground text-center">
                        {selectedFile?.name} ({(selectedFile!.size / 1024).toFixed(1)} KB)
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Search Button */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg">3. Configuración de Búsqueda</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-2">
                      Número de resultados
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      className="w-full px-3 py-2 text-sm md:text-base border rounded-md"
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value))}
                    />
                  </div>

                  <Button
                    onClick={handleSearch}
                    disabled={!selectedFile || !selectedCollection || isSearching}
                    className="w-full text-sm md:text-base"
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
                        Buscar Productos Similares
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Results Panel */}
            <div>
              <Card className="lg:sticky lg:top-8">
                <CardHeader>
                  <CardTitle className="text-lg md:text-xl">Resultados de Búsqueda</CardTitle>
                  <CardDescription className="text-sm">
                    {searchResults.length > 0
                      ? `${searchResults.length} productos encontrados`
                      : 'Los resultados aparecerán aquí'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Extracted Text */}
                  {extractedText && (
                    <div className="mb-4 md:mb-6 p-3 md:p-4 bg-gray-50 rounded-lg">
                      <div className="text-xs md:text-sm font-medium mb-2">Texto Extraído:</div>
                      <div className="text-xs md:text-sm text-gray-700">{extractedText}</div>
                    </div>
                  )}

                  {/* Results List */}
                  {searchResults.length > 0 ? (
                    <div className="space-y-3 md:space-y-4 max-h-[400px] md:max-h-[600px] overflow-y-auto">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="p-3 md:p-4 border rounded-lg hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-sm md:text-base font-medium">
                              Resultado #{index + 1}
                            </div>
                            <div className="text-xs md:text-sm">
                              <span className="text-muted-foreground">Score: </span>
                              <span className="font-mono font-medium text-green-600">
                                {(result.score * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1 text-xs md:text-sm">
                            {Object.entries(result.payload).map(([key, value]) => (
                              <div key={key} className="flex flex-col sm:flex-row gap-1">
                                <span className="text-muted-foreground sm:min-w-[120px] font-medium">
                                  {key}:
                                </span>
                                <span className="break-all">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Progress bar for score */}
                          <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-green-600 h-1.5 rounded-full"
                                style={{ width: `${result.score * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : isSearching ? (
                    <div className="text-center py-12">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Procesando imagen y buscando...</p>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <ImageIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground">
                        Sube una imagen o PDF para comenzar la búsqueda
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
