'use client';

import Link from 'next/link';
import { useCollections } from '@/hooks/use-collections';
import { useDatasources } from '@/hooks/use-datasources';
import { useSyncJobs } from '@/hooks/use-sync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Database, Package, Activity, Plus } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const { data: datasources, isLoading: loadingDatasources } = useDatasources();
  const { data: collections, isLoading: loadingCollections } = useCollections();
  const { data: syncJobs, isLoading: loadingSyncJobs } = useSyncJobs();

  const activeDatasources = datasources?.filter((d: any) => d.status === 'active').length || 0;
  const totalPoints = collections?.reduce((sum: number, c: any) => sum + (c.totalPoints || 0), 0) || 0;
  const recentSyncs = syncJobs?.slice(0, 5) || [];

  if (loadingDatasources && loadingCollections && loadingSyncJobs) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // Check if this is first time (no datasources)
  const isFirstTime = !loadingDatasources && (!datasources || datasources.length === 0);

  if (isFirstTime) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Database className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-3xl">¡Bienvenido!</CardTitle>
            <CardDescription className="text-base mt-2">
              No tienes fuentes de datos configuradas todavía
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Comienza creando tu primera fuente de datos para sincronizar tu catálogo de productos
            </p>
            <Link href="/datasources/new">
              <Button size="lg" className="mt-4">
                <Plus className="mr-2 h-5 w-5" />
                Crear Primera Fuente de Datos
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">
              ¿Necesitas ayuda? <a href="/docs" className="text-primary hover:underline">Ver documentación</a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Vista general del sistema de búsqueda semántica
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Datasources</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeDatasources}</div>
              <p className="text-xs text-muted-foreground">
                {activeDatasources} activos de {datasources?.length || 0} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collections</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{collections?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                {formatNumber(totalPoints)} puntos totales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Syncs (30 días)</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{syncJobs?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                Últimas sincronizaciones
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Collections List */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Colecciones de Productos</CardTitle>
            <CardDescription>Estado actual de tus catálogos</CardDescription>
          </CardHeader>
          <CardContent>
            {collections && collections.length > 0 ? (
              <div className="space-y-4">
                {collections.map((collection: any) => (
                  <div
                    key={collection.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{collection.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(collection.totalPoints)} puntos •
                        Última sync: {collection.lastSyncedAt ? formatDate(collection.lastSyncedAt) : 'Nunca'}
                      </p>
                    </div>
                    <Link href={`/collections/${collection.name}`}>
                      <Button variant="outline" size="sm">Ver Detalles</Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay colecciones todavía
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>Últimas sincronizaciones</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSyncs.length > 0 ? (
              <div className="space-y-4">
                {recentSyncs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{job.type === 'full' ? 'Sync Completa' : job.type === 'incremental' ? 'Sync Incremental' : 'Webhook'}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          job.status === 'completed' ? 'bg-green-100 text-green-700' :
                          job.status === 'running' ? 'bg-blue-100 text-blue-700' :
                          job.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {job.datasource?.name} • {formatDate(job.createdAt)} •
                        {job.successfulRecords ? ` ${formatNumber(job.successfulRecords)} exitosos` : ''}
                        {job.failedRecords ? ` • ${job.failedRecords} errores` : ''}
                      </p>
                    </div>
                    <Link href={`/syncs/${job.id}`}>
                      <Button variant="ghost" size="sm">Ver</Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay sincronizaciones todavía
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
