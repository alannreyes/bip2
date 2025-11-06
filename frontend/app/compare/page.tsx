'use client';

import { useState } from 'react';
import { useCollections } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Search, ThumbsUp, ThumbsDown, Lightbulb, Loader2, AlertCircle } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

type ProductReaction = 'like' | 'dislike' | null;

export default function ComparePage() {
  const { data: collections } = useCollections();
  const [selectedCollection, setSelectedCollection] = useState<string>('');

  // Step 1: Initial search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [initialResults, setInitialResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Step 2: User reactions (likes/dislikes)
  const [reactions, setReactions] = useState<Map<string | number, ProductReaction>>(new Map());

  // Step 3: Recommend results
  const [recommendResults, setRecommendResults] = useState<SearchResult[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);

  const [limit, setLimit] = useState(10);

  const handleInitialSearch = async () => {
    if (!searchQuery.trim()) {
      alert('Por favor ingresa una consulta de búsqueda');
      return;
    }
    if (!selectedCollection) {
      alert('Por favor selecciona una colección');
      return;
    }

    setIsSearching(true);
    setInitialResults([]);
    setReactions(new Map());
    setRecommendResults([]);

    try {
      const response = await searchApi.searchByText({
        query: searchQuery,
        collections: [selectedCollection],
        limit,
      });
      setInitialResults(response.data.results || []);
    } catch (error: any) {
      console.error('Search error:', error);
      alert(`Error en búsqueda: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReaction = (productId: string | number, reaction: ProductReaction) => {
    const newReactions = new Map(reactions);
    if (newReactions.get(productId) === reaction) {
      // Toggle off if clicking same reaction
      newReactions.delete(productId);
    } else {
      newReactions.set(productId, reaction);
    }
    setReactions(newReactions);
  };

  const handleRecommend = async () => {
    const positiveIds: string[] = [];
    const negativeIds: string[] = [];

    reactions.forEach((reaction, id) => {
      if (reaction === 'like') {
        positiveIds.push(String(id));
      } else if (reaction === 'dislike') {
        negativeIds.push(String(id));
      }
    });

    if (positiveIds.length === 0) {
      alert('Por favor marca al menos un producto con ❤️ (me gusta) antes de recomendar');
      return;
    }

    setIsRecommending(true);
    try {
      const response = await searchApi.recommend(
        selectedCollection,
        positiveIds,
        negativeIds,
        limit
      );
      setRecommendResults(response.data.results || []);
    } catch (error: any) {
      console.error('Recommend error:', error);
      alert(`Error en recomendación: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsRecommending(false);
    }
  };

  const likeCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const dislikeCount = Array.from(reactions.values()).filter(r => r === 'dislike').length;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Search vs Recommend: Comparación Interactiva
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              1) Busca productos → 2) Marca tus preferencias → 3) Obtén recomendaciones similares
            </p>
          </div>

          {/* Explanation Cards */}
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-base text-blue-900">Paso 1: Search (Búsqueda)</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-blue-800">
                <p>Usa <strong>búsqueda vectorial</strong> para encontrar productos desde texto. Busca por descripción, marca, características, etc.</p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-purple-600" />
                  <CardTitle className="text-base text-purple-900">Paso 2: Recommend (Refinamiento)</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-purple-800">
                <p>Marca productos que te gustan y los que no. Luego usa <strong>recommend</strong> para encontrar productos similares a tus gustos.</p>
              </CardContent>
            </Card>
          </div>

          {/* Step 1: Search Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Paso 1: Búsqueda Inicial
              </CardTitle>
              <CardDescription>Encuentra productos para empezar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Colección</label>
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
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Número de resultados</label>
                  <input
                    type="number"
                    min="5"
                    max="20"
                    className="w-full px-3 py-2 border rounded-md"
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">¿Qué estás buscando?</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="Ej: pintura latex blanca, tornillos de 10mm, herramientas stanley..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <Button
                onClick={handleInitialSearch}
                disabled={!searchQuery.trim() || !selectedCollection || isSearching}
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
            </CardContent>
          </Card>

          {/* Step 2: Results with Like/Dislike */}
          {initialResults.length > 0 && (
            <>
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ThumbsUp className="h-5 w-5" />
                    Paso 2: Marca tus Preferencias
                  </CardTitle>
                  <CardDescription>
                    Click en ❤️ para productos que te gustan, 👎 para los que no te gustan
                    {(likeCount > 0 || dislikeCount > 0) && (
                      <span className="ml-2 font-medium">
                        ({likeCount} ❤️, {dislikeCount} 👎)
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {initialResults.map((result, index) => {
                      const reaction = reactions.get(result.id);
                      return (
                        <div
                          key={index}
                          className={`p-4 border-2 rounded-lg transition-all ${
                            reaction === 'like'
                              ? 'border-green-500 bg-green-50'
                              : reaction === 'dislike'
                              ? 'border-red-500 bg-red-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="text-sm font-medium mb-1">#{index + 1}</div>
                              <div className="text-xs text-muted-foreground">
                                Score: {(result.score * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={reaction === 'like' ? 'default' : 'outline'}
                                onClick={() => handleReaction(result.id, 'like')}
                                className={
                                  reaction === 'like'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : ''
                                }
                              >
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={reaction === 'dislike' ? 'default' : 'outline'}
                                onClick={() => handleReaction(result.id, 'dislike')}
                                className={
                                  reaction === 'dislike'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : ''
                                }
                              >
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="text-xs space-y-1">
                            <div className="font-mono text-muted-foreground">ID: {result.id}</div>
                            {Object.entries(result.payload)
                              .filter(([key]) => !key.startsWith('_'))
                              .slice(0, 4)
                              .map(([key, value]) => (
                                <div key={key}>
                                  <strong className="text-muted-foreground">{key}:</strong>{' '}
                                  {String(value)}
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {likeCount === 0 && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div className="text-sm text-yellow-800">
                        <strong>Tip:</strong> Marca al menos un producto con ❤️ (me gusta) para
                        poder usar la función de recomendación.
                      </div>
                    </div>
                  )}

                  {likeCount > 0 && (
                    <Button
                      onClick={handleRecommend}
                      disabled={isRecommending}
                      className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
                      size="lg"
                    >
                      {isRecommending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Generando Recomendaciones...
                        </>
                      ) : (
                        <>
                          <Lightbulb className="mr-2 h-5 w-5" />
                          Recomendar Productos Similares ({likeCount} ❤️
                          {dislikeCount > 0 && `, ${dislikeCount} 👎`})
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Step 3: Recommendations */}
          {recommendResults.length > 0 && (
            <Card className="border-purple-300">
              <CardHeader className="bg-purple-50">
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Lightbulb className="h-5 w-5" />
                  Paso 3: Productos Recomendados
                </CardTitle>
                <CardDescription>
                  Productos similares a los que te gustaron {dislikeCount > 0 && ' (evitando los que no te gustaron)'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto mt-4">
                  {recommendResults.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 border-2 border-purple-200 rounded-lg bg-purple-50/30"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="text-sm font-medium">
                          Recomendación #{index + 1}
                        </div>
                        <div className="text-xs">
                          <span className="text-muted-foreground">Similitud: </span>
                          <span className="font-mono font-medium text-purple-600">
                            {(result.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="font-mono text-muted-foreground">ID: {result.id}</div>
                        {Object.entries(result.payload)
                          .filter(([key]) => !key.startsWith('_'))
                          .slice(0, 5)
                          .map(([key, value]) => (
                            <div key={key}>
                              <strong className="text-muted-foreground">{key}:</strong>{' '}
                              {String(value)}
                            </div>
                          ))}
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-purple-600 h-1.5 rounded-full"
                            style={{ width: `${result.score * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Explanation */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>💡 ¿Cómo funciona esto?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <strong className="text-blue-600">Search (Búsqueda Vectorial):</strong>
                <p className="mt-1 text-muted-foreground">
                  Convierte tu consulta de texto en un vector de 3072 dimensiones y busca los
                  productos más cercanos en el espacio vectorial usando distancia coseno. Perfecto
                  para la búsqueda inicial cuando el usuario describe lo que quiere.
                </p>
              </div>
              <div>
                <strong className="text-purple-600">Recommend (Recomendación):</strong>
                <p className="mt-1 text-muted-foreground">
                  Toma los vectores de los productos que te gustaron (positivos) y los que no
                  (negativos), calcula un centroide (punto promedio) de los positivos, y busca
                  productos cercanos a ese centroide mientras se aleja de los negativos. Perfecto
                  para refinar resultados basándote en ejemplos específicos.
                </p>
              </div>
              <div className="pt-2 border-t">
                <strong>Caso de uso real:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <strong>E-commerce:</strong> &quot;Búsqueda inicial&quot; → usuario marca likes → &quot;Más
                    productos como estos&quot;
                  </li>
                  <li>
                    <strong>Página de producto:</strong> Botón &quot;Productos similares&quot; usa recommend con
                    el ID del producto actual
                  </li>
                  <li>
                    <strong>Historial:</strong> Recomienda basándote en productos que el usuario ha
                    comprado o visto
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
