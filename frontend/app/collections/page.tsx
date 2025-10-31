'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCollections, useDeleteCollection } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Package, Trash2, Loader2, Database, AlertCircle } from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';

export default function CollectionsPage() {
  const { data: collections, isLoading } = useCollections();
  const deleteCollection = useDeleteCollection();
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const handleDelete = async (name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la colección "${name}"? Esta acción no se puede deshacer y eliminará todos los puntos vectoriales.`)) {
      return;
    }

    setDeletingName(name);
    try {
      await deleteCollection.mutateAsync(name);
    } catch (error: any) {
      alert(`Error al eliminar colección: ${error.response?.data?.message || error.message}`);
    } finally {
      setDeletingName(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando colecciones...</p>
        </div>
      </div>
    );
  }

  const totalPoints = collections?.reduce((sum: number, c: any) => sum + (c.totalPoints || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Colecciones en Qdrant</h2>
          <p className="text-muted-foreground">
            Gestiona tus colecciones vectoriales
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Colecciones</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{collections?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Puntos</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(totalPoints)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promedio por Colección</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {collections?.length > 0 ? formatNumber(Math.round(totalPoints / collections.length)) : 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collections Grid */}
        {collections && collections.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection: any) => (
              <Card key={collection.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <Package className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{collection.name}</CardTitle>
                    </div>
                  </div>
                  <CardDescription className="mt-2">
                    Dimensiones: {collection.vectorSize}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Puntos</div>
                        <div className="text-2xl font-bold">{formatNumber(collection.totalPoints || 0)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Distancia</div>
                        <div className="text-sm font-medium">{collection.distance}</div>
                      </div>
                    </div>

                    {/* Last Sync */}
                    <div className="text-sm">
                      <div className="text-muted-foreground">Última sincronización</div>
                      <div className="font-medium">
                        {collection.lastSyncedAt ? formatDate(collection.lastSyncedAt) : 'Nunca'}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t">
                      <Link href={`/collections/${collection.name}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full">
                          Ver Detalles
                        </Button>
                      </Link>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(collection.name)}
                        disabled={deletingName === collection.name}
                      >
                        {deletingName === collection.name ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <CardTitle className="text-xl mb-2">No hay colecciones</CardTitle>
              <CardDescription className="mb-6">
                Las colecciones se crean automáticamente cuando creas una fuente de datos
              </CardDescription>
              <Link href="/datasources/new">
                <Button size="lg">
                  Crear Fuente de Datos
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="mt-8 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
              <div className="text-sm text-blue-900">
                <div className="font-medium mb-1">Sobre las Colecciones</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>Las colecciones se crean automáticamente al configurar una fuente de datos</li>
                  <li>Cada colección almacena los vectores generados por Gemini (768 dimensiones)</li>
                  <li>El método de distancia usado es Cosine por defecto</li>
                  <li>Eliminar una colección no elimina la fuente de datos asociada</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
