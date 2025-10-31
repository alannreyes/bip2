'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSyncJob, useSyncErrors } from '@/hooks/use-sync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle, Database } from 'lucide-react';
import { formatDate, formatDuration, formatNumber } from '@/lib/utils';

export default function SyncDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: job, isLoading: loadingJob } = useSyncJob(id);
  const { data: errors, isLoading: loadingErrors } = useSyncErrors(id);

  if (loadingJob) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando detalles...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <p className="text-xl font-medium mb-2">Sincronización no encontrada</p>
          <Button onClick={() => router.push('/syncs')}>Volver a Sincronizaciones</Button>
        </div>
      </div>
    );
  }

  const progress = job.totalRecords > 0 ? Math.round((job.processedRecords / job.totalRecords) * 100) : 0;
  const duration = job.completedAt
    ? new Date(job.completedAt).getTime() - new Date(job.startedAt || job.createdAt).getTime()
    : Date.now() - new Date(job.startedAt || job.createdAt).getTime();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-8 w-8 text-green-600" />;
      case 'running':
      case 'pending':
        return <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />;
      case 'failed':
        return <XCircle className="h-8 w-8 text-red-600" />;
      default:
        return <AlertCircle className="h-8 w-8 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      completed: 'bg-green-100 text-green-700',
      running: 'bg-blue-100 text-blue-700',
      pending: 'bg-yellow-100 text-yellow-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-700',
    };
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-700';
  };

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
            <Link href="/syncs" className="text-primary">
              Syncs
            </Link>
            <Link href="/collections" className="text-muted-foreground hover:text-foreground">
              Collections
            </Link>
          </nav>
        </div>
      </div>

      <main className="p-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <Link href="/syncs">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a Sincronizaciones
              </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">Detalles de Sincronización</h2>
          </div>

          {/* Status Overview */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  {getStatusIcon(job.status)}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-2xl">
                        {job.type === 'full' ? 'Sincronización Completa' : job.type === 'incremental' ? 'Sincronización Incremental' : 'Webhook'}
                      </CardTitle>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getStatusBadge(job.status)}`}>
                        {job.status}
                      </span>
                    </div>
                    <CardDescription className="text-base">
                      {job.datasource?.name} • Iniciado: {formatDate(job.createdAt)}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Progress Bar */}
              {(job.status === 'running' || job.status === 'pending') && job.totalRecords > 0 && (
                <div className="mb-6">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Progreso: {progress}%</span>
                    <span>
                      {formatNumber(job.processedRecords)} / {formatNumber(job.totalRecords)} registros
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total Registros</div>
                  <div className="text-2xl font-bold">{formatNumber(job.totalRecords || 0)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Procesados</div>
                  <div className="text-2xl font-bold">{formatNumber(job.processedRecords || 0)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Exitosos</div>
                  <div className="text-2xl font-bold text-green-600">{formatNumber(job.successfulRecords || 0)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Errores</div>
                  <div className="text-2xl font-bold text-red-600">{job.failedRecords || 0}</div>
                </div>
              </div>

              {/* Timing Info */}
              <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Creado</div>
                  <div className="font-medium">{formatDate(job.createdAt)}</div>
                </div>
                {job.startedAt && (
                  <div>
                    <div className="text-muted-foreground">Iniciado</div>
                    <div className="font-medium">{formatDate(job.startedAt)}</div>
                  </div>
                )}
                {job.completedAt && (
                  <div>
                    <div className="text-muted-foreground">Completado</div>
                    <div className="font-medium">{formatDate(job.completedAt)}</div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground">Duración</div>
                  <div className="font-medium">{formatDuration(duration)}</div>
                </div>
              </div>

              {/* Error Message */}
              {job.status === 'failed' && job.errorMessage && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
                    <div className="text-sm text-red-900">
                      <div className="font-medium mb-1">Error General:</div>
                      <div>{job.errorMessage}</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Errors Table */}
          {job.failedRecords > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Errores Detallados ({job.failedRecords})</CardTitle>
                <CardDescription>
                  Registros que fallaron durante la sincronización
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingErrors ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Cargando errores...</p>
                  </div>
                ) : errors && errors.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium">Código</th>
                          <th className="text-left p-3 font-medium">Error</th>
                          <th className="text-left p-3 font-medium">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errors.map((error: any, idx: number) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-mono">{error.recordId}</td>
                            <td className="p-3 text-red-700">{error.errorMessage}</td>
                            <td className="p-3 text-muted-foreground">{formatDate(error.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No hay detalles de errores disponibles</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
