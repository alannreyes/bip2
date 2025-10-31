'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useDatasources, useDeleteDatasource, useTestConnection } from '@/hooks/use-datasources';
import { useTriggerFullSync, useTriggerIncrementalSync } from '@/hooks/use-sync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { Database, Plus, Play, Trash2, Edit, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { formatDate } from '@/lib/utils';

const formatCronSchedule = (cron: string): string => {
  // Parse common cron patterns to human-readable Spanish
  const patterns: Record<string, string> = {
    '0 2 * * *': 'Diariamente a las 2:00 AM',
    '0 */6 * * *': 'Cada 6 horas',
    '0 0 * * *': 'Diariamente a medianoche',
    '0 12 * * *': 'Diariamente al mediodía',
    '*/15 * * * *': 'Cada 15 minutos',
    '*/30 * * * *': 'Cada 30 minutos',
    '0 * * * *': 'Cada hora',
    '0 0 * * 0': 'Semanalmente los domingos',
    '0 0 1 * *': 'Mensualmente el día 1',
  };

  if (patterns[cron]) {
    return patterns[cron];
  }

  // Try to parse generic patterns
  const parts = cron.split(' ');
  if (parts.length === 5) {
    const [minute, hour, day, month, weekday] = parts;

    if (hour !== '*' && minute !== '*' && day === '*' && month === '*' && weekday === '*') {
      return `Diariamente a las ${hour}:${minute.padStart(2, '0')}`;
    }
  }

  return 'Personalizado';
};

export default function DatasourcesPage() {
  const { data: datasources, isLoading } = useDatasources();
  const deleteMutation = useDeleteDatasource();
  const testConnection = useTestConnection();
  const triggerSync = useTriggerFullSync();
  const triggerIncrementalSync = useTriggerIncrementalSync();

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [triggeringIncrementalId, setTriggeringIncrementalId] = useState<string | null>(null);

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      await testConnection.mutateAsync(id);
      alert('Conexión exitosa');
    } catch (error: any) {
      alert(`Error de conexión: ${error.response?.data?.message || error.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleTriggerSync = async (id: string) => {
    setTriggeringId(id);
    try {
      await triggerSync.mutateAsync(id);
      alert('Sincronización completa iniciada');
    } catch (error: any) {
      alert(`Error al iniciar sincronización: ${error.response?.data?.message || error.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleTriggerIncrementalSync = async (id: string) => {
    setTriggeringIncrementalId(id);
    try {
      await triggerIncrementalSync.mutateAsync(id);
      alert('Sincronización incremental iniciada');
    } catch (error: any) {
      alert(`Error al iniciar sincronización incremental: ${error.response?.data?.message || error.message}`);
    } finally {
      setTriggeringIncrementalId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar la fuente de datos "${name}"?`)) return;

    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error: any) {
      alert(`Error al eliminar: ${error.response?.data?.message || error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      error: 'bg-red-100 text-red-700',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-700';
  };

  const getTypeIcon = (type: string) => {
    return <Database className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando fuentes de datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Fuentes de Datos</h2>
            <p className="text-muted-foreground">
              Gestiona tus conexiones a bases de datos
            </p>
          </div>
          <Link href="/datasources/new">
            <Button size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Nueva Fuente de Datos
            </Button>
          </Link>
        </div>

        {datasources && datasources.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {datasources.map((datasource: any) => (
              <Card key={datasource.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getTypeIcon(datasource.type)}
                      <CardTitle className="text-lg">{datasource.name}</CardTitle>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(datasource.status)}`}>
                        {datasource.status}
                      </span>
                      {datasource.currentJob && (
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Sincronizando ({datasource.currentJob.type})
                        </span>
                      )}
                    </div>
                  </div>
                  <CardDescription className="mt-2">
                    {datasource.description || 'Sin descripción'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Origen */}
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Origen:</div>
                      <div className="font-medium text-foreground">
                        <span className="text-blue-600">{datasource.type.toUpperCase()}</span>
                        {' • '}
                        {datasource.connectionConfig?.host}:{datasource.connectionConfig?.port}/{datasource.connectionConfig?.database}
                      </div>
                    </div>

                    {/* Destino Qdrant */}
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Destino:</div>
                      <div className="font-medium text-foreground">
                        <span className="text-purple-600">Qdrant</span>
                        {' • '}
                        {datasource.qdrantHost ? `${datasource.qdrantHost}:${datasource.qdrantPort || 6333}` : 'localhost:6333'}/{datasource.qdrantCollection}
                      </div>
                    </div>

                    {/* Última Sincronización */}
                    <div className="text-sm">
                      <div className="text-muted-foreground mb-1">Última sincronización:</div>
                      <div className="font-medium text-foreground">
                        {datasource.lastSyncedAt ? formatDate(datasource.lastSyncedAt) : 'Nunca'}
                      </div>
                    </div>

                    {/* Progreso de sincronización actual */}
                    {datasource.currentJob && (
                      <div className="text-sm border-l-2 border-blue-500 pl-3 py-1 bg-blue-50/50">
                        <div className="text-blue-700 font-medium mb-1">Sincronización en progreso</div>
                        <div className="text-xs text-muted-foreground">
                          {datasource.currentJob.processedRecords?.toLocaleString()}
                          {datasource.currentJob.totalRecords && datasource.currentJob.totalRecords < 999999 &&
                            ` de ${datasource.currentJob.totalRecords.toLocaleString()}`
                          } registros procesados
                        </div>
                        {datasource.currentJob.totalRecords && datasource.currentJob.totalRecords < 999999 && (
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, (datasource.currentJob.processedRecords / datasource.currentJob.totalRecords) * 100)}%`
                              }}
                            ></div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Programación con explicación */}
                    {datasource.syncSchedule && (
                      <div className="text-sm">
                        <div className="text-muted-foreground mb-1">Programación automática:</div>
                        <div className="font-medium text-foreground">
                          {datasource.syncSchedule}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({formatCronSchedule(datasource.syncSchedule)})
                          </span>
                        </div>
                      </div>
                    )}

                    {datasource.webhookEnabled && (
                      <div className="flex items-center text-sm text-green-600">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Webhook habilitado
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(datasource.id)}
                        disabled={testingId === datasource.id}
                      >
                        {testingId === datasource.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-1" />
                        )}
                        Test
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTriggerSync(datasource.id)}
                        disabled={triggeringId === datasource.id || datasource.status !== 'active'}
                      >
                        {triggeringId === datasource.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-1" />
                        )}
                        Sync Full
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="border-green-200 hover:bg-green-50"
                        onClick={() => handleTriggerIncrementalSync(datasource.id)}
                        disabled={triggeringIncrementalId === datasource.id || datasource.status !== 'active' || !datasource.lastSyncedAt}
                        title={!datasource.lastSyncedAt ? 'Requiere al menos una sincronización completa previa' : 'Sincronizar solo cambios desde última sincronización'}
                      >
                        {triggeringIncrementalId === datasource.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-1" />
                        )}
                        Sync Inc
                      </Button>

                      <Link href={`/datasources/${datasource.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </Link>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(datasource.id, datasource.name)}
                        disabled={deletingId === datasource.id}
                      >
                        {deletingId === datasource.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Eliminar
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
              <Database className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <CardTitle className="text-xl mb-2">No hay fuentes de datos</CardTitle>
              <CardDescription className="mb-6">
                Crea tu primera fuente de datos para comenzar a sincronizar productos
              </CardDescription>
              <Link href="/datasources/new">
                <Button size="lg">
                  <Plus className="mr-2 h-5 w-5" />
                  Crear Primera Fuente de Datos
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
