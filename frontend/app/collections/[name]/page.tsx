'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCollection } from '@/hooks/use-collections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, Database, Loader2 } from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;

  const { data: collection, isLoading } = useCollection(name);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando colección...</p>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-xl font-medium mb-2">Colección no encontrada</p>
          <Button onClick={() => router.push('/collections')}>Volver a Colecciones</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="flex h-16 items-center px-8">
          <div className="flex items-center space-x-2">
            <Database className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Catálogo Semántico EFC</h1>
          </div>
          <nav className="ml-8 flex items-center space-x-6 text-sm font-medium">
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/datasources" className="text-muted-foreground hover:text-foreground">
              Datasources
            </Link>
            <Link href="/syncs" className="text-muted-foreground hover:text-foreground">
              Syncs
            </Link>
            <Link href="/collections" className="text-primary">
              Collections
            </Link>
            <Link href="/search" className="text-muted-foreground hover:text-foreground">
              Image Search
            </Link>
          </nav>
        </div>
      </div>

      <main className="p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <Link href="/collections">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a Colecciones
              </Button>
            </Link>
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold tracking-tight">{collection.name}</h2>
            </div>
          </div>

          {/* Overview Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Información General</CardTitle>
              <CardDescription>Detalles de la colección en Qdrant</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total Puntos</div>
                  <div className="text-3xl font-bold">{formatNumber(collection.totalPoints || 0)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Dimensiones</div>
                  <div className="text-3xl font-bold">{collection.vectorSize}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Distancia</div>
                  <div className="text-xl font-bold">{collection.distance}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Estado</div>
                  <div className="text-xl font-bold text-green-600">Activa</div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Creada</div>
                    <div className="font-medium">{formatDate(collection.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Última Sincronización</div>
                    <div className="font-medium">
                      {collection.lastSyncedAt ? formatDate(collection.lastSyncedAt) : 'Nunca'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vector Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Configuración de Vectores</CardTitle>
              <CardDescription>Parámetros técnicos de la colección</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium mb-1">Tamaño de Vector</div>
                    <div className="text-sm text-muted-foreground">
                      {collection.vectorSize} dimensiones (Gemini embedding-001)
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Método de Distancia</div>
                    <div className="text-sm text-muted-foreground">
                      {collection.distance} similarity
                    </div>
                  </div>
                </div>

                {collection.hnswConfig && (
                  <div className="pt-4 border-t">
                    <div className="text-sm font-medium mb-2">Configuración HNSW</div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">M: </span>
                        <span className="font-mono">{collection.hnswConfig.m}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">EF Construct: </span>
                        <span className="font-mono">{collection.hnswConfig.efConstruct}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Associated Datasources */}
          {collection.datasources && collection.datasources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Fuentes de Datos Asociadas</CardTitle>
                <CardDescription>
                  Datasources que sincronizan a esta colección
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {collection.datasources.map((ds: any) => (
                    <div
                      key={ds.id}
                      className="flex items-center justify-between p-4 border rounded-md hover:bg-gray-50"
                    >
                      <div>
                        <div className="font-medium">{ds.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {ds.type.toUpperCase()} • {ds.status}
                        </div>
                      </div>
                      <Link href={`/datasources/${ds.id}`}>
                        <Button variant="outline" size="sm">
                          Ver Datasource
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
